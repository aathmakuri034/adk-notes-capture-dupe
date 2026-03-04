/**
 * Gemini Live Service - Infrastructure layer implementation for Google GenAI Live API
 *
 * This module provides the actual implementation connecting to Google's Gemini Live API
 * using the @google/genai SDK directly (not ADK, which doesn't support live mode).
 */
import { GoogleGenAI, Type } from '@google/genai';
import type { Blob, LiveConnectParameters, LiveCallbacks, Tool, FunctionDeclaration, Content, Session, LiveServerMessage, FunctionResponse } from '@google/genai';
import { logger } from '../../shared/logger.js';
import { ExternalApiError } from '../../shared/errors.js';
import { getConfig } from '../../config/env.js';
import { TOOL_NAMES } from '../../shared/constants.js';
import type { GeminiLiveClient, ToolCallEvent } from '../../application/streaming/streaming-service.js';

export interface GeminiLiveServiceConfig {
  model: string;
  voiceName: string;
  systemInstruction: string;
  sessionId: string;
}

/**
 * Creates a Gemini Live client that directly connects to the Google GenAI Live API
 */
export function createGeminiLiveClient(config: GeminiLiveServiceConfig): GeminiLiveClient {
  return new GeminiLiveServiceImpl(config);
}

class GeminiLiveServiceImpl implements GeminiLiveClient {
  private readonly model: string;
  private readonly voiceName: string;
  private readonly systemInstruction: string;
  private readonly sessionId: string;

  private ai: GoogleGenAI | null = null;
  private liveSession: Session | null = null;
  private isConnected = false;

  // Event handlers
  private audioHandlers: Array<(data: Buffer) => void> = [];
  private transcriptHandlers: Array<(text: string, isUser: boolean) => void> = [];
  private turnCompleteHandlers: Array<() => void> = [];
  private interruptedHandlers: Array<() => void> = [];
  private toolCallHandlers: Array<(event: ToolCallEvent) => void> = [];

  // Transcript tracking for deduplication (separate accumulators to avoid cross-contamination)
  private accumulatedModelText = '';
  private accumulatedTranscriptionText = '';
  private accumulatedInputText = '';

  // Guards against duplicate agent text when both modelTurn.text and outputTranscription fire in the same turn.
  // In native audio mode, modelTurn typically has no text parts (only audio), so outputTranscription is the source.
  // In text mode, modelTurn provides text and outputTranscription is absent.
  // If both fire, modelTurn wins and outputTranscription is suppressed.
  private modelTurnHadText = false;

  // Tool call tracking
  private pendingToolCalls: Map<string, { name: string; args: Record<string, unknown> }> = new Map();

  constructor(config: GeminiLiveServiceConfig) {
    this.model = config.model;
    this.voiceName = config.voiceName;
    this.systemInstruction = config.systemInstruction;
    this.sessionId = config.sessionId;
  }

  /**
   * Connect to the Gemini Live API using @google/genai
   */
  async connect(_sessionId: string, _userId: string): Promise<void> {
    try {
      logger.info({ sessionId: this.sessionId }, 'Connecting to Gemini Live via @google/genai');

      const config = getConfig();

      // Create GoogleGenAI instance
      // The API key will be read from GOOGLE_API_KEY or GEMINI_API_KEY env var
      // Or use Vertex AI if GOOGLE_GENAI_USE_VERTEXAI=TRUE
      if (config.GOOGLE_GENAI_USE_VERTEXAI) {
        // Use Vertex AI with OAuth2 credentials
        this.ai = new GoogleGenAI({
          vertexai: true,
          project: config.PROJECT_ID,
          location: config.LOCATION,
        });
      } else if (config.GOOGLE_API_KEY) {
        // Use Gemini API with API key
        this.ai = new GoogleGenAI({ apiKey: config.GOOGLE_API_KEY });
      } else {
        this.ai = new GoogleGenAI({});
      }

      // Define tools for function calling
      const tools = this.createTools();

      // Set up Live connect parameters with callbacks
      const connectParams: LiveConnectParameters = {
        model: this.model,
        callbacks: this.createCallbacks(),
        config: {
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voiceName,
              },
            },
          },
          // Enable input and output transcription
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          // Set system instruction via config
          systemInstruction: {
            role: 'user',
            parts: [{ text: this.systemInstruction }],
          },
          // Tools in config
          tools: tools,
        },
      };

      // Connect to the Live API
      this.liveSession = await this.ai.live.connect(connectParams);

      // Mark as connected
      this.isConnected = true;

      logger.info({ sessionId: this.sessionId }, 'Connected to Gemini Live via @google/genai');
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to connect to Gemini Live');
      throw new ExternalApiError(
        `Failed to connect to Gemini Live: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'gemini'
      );
    }
  }

  /**
   * Create callbacks for the live connection
   */
  private createCallbacks(): LiveCallbacks {
    return {
      onopen: () => {
        logger.info({ sessionId: this.sessionId }, 'WebSocket connection opened');
      },
      onmessage: (e: LiveServerMessage) => {
        this.handleServerMessage(e);
      },
      onerror: (e: Error) => {
        logger.error({ error: e.message, sessionId: this.sessionId }, 'WebSocket error');
      },
      onclose: (_e: unknown) => {
        // Note: CloseEvent is a browser type, in Node.js we just get a generic event
        logger.info({ sessionId: this.sessionId }, 'WebSocket closed');
        this.isConnected = false;
        this.interruptedHandlers.forEach((cb) => cb());
      },
    };
  }

  /**
   * Handle incoming server messages
   */
  private handleServerMessage(message: LiveServerMessage): void {
    // Debug: log what we received
    logger.debug({ message: JSON.stringify(message), sessionId: this.sessionId }, 'Received server message');

    // Handle server content (model responses)
    if (message.serverContent) {
      const serverContent = message.serverContent;

      // Handle model output - text and audio
      if (serverContent.modelTurn) {
        logger.debug({ sessionId: this.sessionId, partsCount: serverContent.modelTurn.parts?.length }, 'Received modelTurn');
        for (const part of serverContent.modelTurn.parts || []) {
          logger.debug({ sessionId: this.sessionId, hasText: !!part.text, hasInlineData: !!part.inlineData }, 'Processing part');
          // Handle text output (text-mode responses; native audio mode has no text parts here)
          if (part.text) {
            this.modelTurnHadText = true;
            this.emitTranscriptDelta(part.text, 'accumulatedModelText', false);
          }

          // Handle audio output
          if (part.inlineData) {
            const audioData = Buffer.from(part.inlineData.data || '', 'base64');
            this.audioHandlers.forEach((cb) => cb(audioData));
          }

          // Handle function calls in modelTurn parts
          if (part.functionCall) {
            const funcCall = part.functionCall;
            const id = funcCall.id || '';
            this.pendingToolCalls.set(id, {
              name: funcCall.name || '',
              args: funcCall.args || {},
            });
            this.emitToolCall(funcCall.name || '', funcCall.args || {}, id);
          }
        }
      }

      // Handle turn completion
      if (serverContent.turnComplete) {
        logger.debug({ sessionId: this.sessionId }, 'Turn complete');
        this.turnCompleteHandlers.forEach((cb) => cb());
        this.accumulatedInputText = '';
        this.accumulatedModelText = '';
        this.accumulatedTranscriptionText = '';
        this.modelTurnHadText = false;
      }

      // Handle input transcription (user speech)
      if (serverContent.inputTranscription) {
        this.emitTranscriptDelta(serverContent.inputTranscription.text || '', 'accumulatedInputText', true);
      }

      // Handle output transcription (agent speech-to-text for native audio mode).
      // Suppressed if modelTurn already provided text this turn to avoid duplicate agent text.
      if (serverContent.outputTranscription && !this.modelTurnHadText) {
        this.emitTranscriptDelta(serverContent.outputTranscription.text || '', 'accumulatedTranscriptionText', false);
      }

      // Handle interruption
      if (serverContent.interrupted) {
        logger.info({ sessionId: this.sessionId }, 'Stream interrupted');
        this.interruptedHandlers.forEach((cb) => cb());
        this.accumulatedInputText = '';
        this.accumulatedModelText = '';
        this.accumulatedTranscriptionText = '';
        this.modelTurnHadText = false;
      }
    }

    // Handle tool calls from message.toolCall (not serverContent.toolCall)
    if (message.toolCall) {
      const toolCall = message.toolCall;
      if (toolCall.functionCalls) {
        for (const funcCall of toolCall.functionCalls) {
          const id = funcCall.id || '';
          this.pendingToolCalls.set(id, {
            name: funcCall.name || '',
            args: funcCall.args || {},
          });
          this.emitToolCall(funcCall.name || '', funcCall.args || {}, id);
        }
      }
    }

    // Handle tool call cancellation - has 'ids' array, not 'id'
    if (message.toolCallCancellation) {
      const cancellation = message.toolCallCancellation;
      if (cancellation.ids) {
        for (const id of cancellation.ids) {
          this.pendingToolCalls.delete(id);
          logger.info({ id, sessionId: this.sessionId }, 'Tool call cancelled');
        }
      }
    }

    // Handle session resumption
    if (message.sessionResumptionUpdate) {
      logger.debug({ sessionId: this.sessionId }, 'Session resumption update');
    }
  }

  /**
   * Create tools for function calling
   */
  private createTools(): Tool[] {
    // Define the save_note tool using @google/genai format
    const saveNoteFunction: FunctionDeclaration = {
      name: TOOL_NAMES.SAVE_NOTE,
      description: 'Save a completed Job Description to the database. Call this when the user wants to save the job information.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'The title of the Job (e.g., "Kitchen Painting").',
          },
          description: {
            type: Type.STRING,
            description: 'A high-level summary of the work required.',
          },
          details: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'A list of specific captured attributes (e.g., ["Room Size: 10x10", "Color: Blue"]).',
          },
          note_id: {
            type: Type.STRING,
            description: 'Optional ID of the note to update. If provided, updates existing note. If None, creates new.',
          },
        },
        required: ['title', 'description', 'details'],
      },
    };

    return [
      {
        functionDeclarations: [saveNoteFunction],
      },
    ];
  }

  /**
   * Emit tool call event to registered handlers.
   * The respond callback wraps sendToolResponse so the application layer
   * can respond to Gemini after processing the tool call.
   */
  private emitToolCall(name: string, args: Record<string, unknown>, toolCallId: string): void {
    logger.info({ name, args, sessionId: this.sessionId }, 'Tool call received');

    const respond = (result: { success: boolean; note_id?: string; error?: string }): void => {
      if (this.liveSession) {
        const functionResponse: FunctionResponse = {
          name,
          id: toolCallId,
          response: result,
        };
        this.liveSession.sendToolResponse({
          functionResponses: functionResponse,
        });
      }
    };

    this.toolCallHandlers.forEach((cb) => cb({ name, args, toolCallId, respond }));
  }

  /**
   * Send audio data to the Gemini Live API
   */
  async sendAudio(data: Buffer): Promise<void> {
    if (!this.isConnected || !this.liveSession) {
      throw new ExternalApiError('Not connected to Gemini Live', 'gemini');
    }

    try {
      // Send audio as realtime input - the library expects base64-encoded data
      const blob: Blob = {
        data: data.toString('base64'),
        mimeType: 'audio/pcm',
      };
      this.liveSession.sendRealtimeInput({
        audio: blob,
      });
      logger.debug({ sessionId: this.sessionId, size: data.length }, 'Audio sent');
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to send audio');
      throw new ExternalApiError(
        `Failed to send audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'gemini'
      );
    }
  }

  /**
   * Send text to the Gemini Live API
   */
  async sendText(text: string): Promise<void> {
    if (!this.isConnected || !this.liveSession) {
      throw new ExternalApiError('Not connected to Gemini Live', 'gemini');
    }

    try {
      this.liveSession.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      });
      logger.debug({ sessionId: this.sessionId, text }, 'Text sent');
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to send text');
      throw new ExternalApiError(
        `Failed to send text: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'gemini'
      );
    }
  }

  /**
   * Send image data to the Gemini Live API
   */
  async sendImage(data: Buffer, mimeType: string): Promise<void> {
    if (!this.isConnected || !this.liveSession) {
      throw new ExternalApiError('Not connected to Gemini Live', 'gemini');
    }

    try {
      this.liveSession.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: data.toString('base64'),
                  mimeType,
                },
              },
            ],
          },
        ],
        turnComplete: true,
      });
      logger.debug({ sessionId: this.sessionId, mimeType }, 'Image sent');
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to send image');
      throw new ExternalApiError(
        `Failed to send image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'gemini'
      );
    }
  }

  /**
   * Send video data to the Gemini Live API
   * Note: Videos are not sent directly to Live API. They are analyzed via REST API
   * and the text analysis is injected into the conversation.
   */
  async sendVideo(_data: Buffer, _mimeType: string, _gsUri: string): Promise<void> {
    if (!this.isConnected || !this.liveSession) {
      throw new ExternalApiError('Not connected to Gemini Live', 'gemini');
    }

    // For video, we send a text message indicating video was uploaded
    // The actual video analysis happens separately via REST API
    try {
      this.liveSession.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: 'I have uploaded a video. Please help me analyze it.',
              },
            ],
          },
        ],
        turnComplete: true,
      });
      logger.debug({ sessionId: this.sessionId }, 'Video reference sent');
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to send video');
      throw new ExternalApiError(
        `Failed to send video: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'gemini'
      );
    }
  }

  /**
   * Signal end of turn to the Gemini Live API
   */
  async endTurn(): Promise<void> {
    if (!this.isConnected || !this.liveSession) {
      throw new ExternalApiError('Not connected to Gemini Live', 'gemini');
    }

    try {
      // Send an empty content turn to signal end of turn
      this.liveSession.sendClientContent({
        turnComplete: true,
      });
      logger.debug({ sessionId: this.sessionId }, 'End turn signal sent');
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to send end turn');
      throw new ExternalApiError(
        `Failed to send end turn: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'gemini'
      );
    }
  }

  /**
   * Disconnect from the Gemini Live API
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    this.isConnected = false;

    // Close the live session
    if (this.liveSession) {
      this.liveSession.close();
      this.liveSession = null;
    }

    this.ai = null;

    // Clear handler arrays to prevent stale references
    this.audioHandlers = [];
    this.transcriptHandlers = [];
    this.turnCompleteHandlers = [];
    this.interruptedHandlers = [];
    this.toolCallHandlers = [];

    logger.info({ sessionId: this.sessionId }, 'Disconnected from Gemini Live');
  }

  // Event handlers
  onAudio(callback: (data: Buffer) => void): void {
    this.audioHandlers.push(callback);
  }

  onTranscript(callback: (text: string, isUser: boolean) => void): void {
    this.transcriptHandlers.push(callback);
  }

  onTurnComplete(callback: () => void): void {
    this.turnCompleteHandlers.push(callback);
  }

  onInterrupted(callback: () => void): void {
    this.interruptedHandlers.push(callback);
  }

  onToolCall(callback: (event: ToolCallEvent) => void): void {
    this.toolCallHandlers.push(callback);
  }

  /**
   * Compute and emit the delta for an accumulating transcript field.
   * Handles deduplication: if the new text extends the accumulated prefix, only the new delta is emitted.
   * If the new text does not start with the accumulated prefix (e.g. Gemini restarted accumulation),
   * the full text is emitted and the accumulator is reset.
   */
  private emitTranscriptDelta(
    text: string,
    accumulatorKey: 'accumulatedModelText' | 'accumulatedTranscriptionText' | 'accumulatedInputText',
    isUser: boolean
  ): void {
    const accumulated = this[accumulatorKey];
    if (text.startsWith(accumulated)) {
      const delta = text.slice(accumulated.length);
      if (delta) {
        this.transcriptHandlers.forEach((cb) => cb(delta, isUser));
      }
    } else {
      logger.debug(
        { sessionId: this.sessionId, accumulatorKey, accumulatedLen: accumulated.length, receivedLen: text.length },
        'Transcript accumulator reset (non-prefix message received)'
      );
      this.transcriptHandlers.forEach((cb) => cb(text, isUser));
    }
    this[accumulatorKey] = text;
  }
}
