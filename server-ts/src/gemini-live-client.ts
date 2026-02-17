/**
 * Gemini Live API Client for real-time voice streaming
 *
 * This module provides a WebSocket-based client for the Gemini Live API,
 * enabling real-time bidirectional audio streaming with the AI model.
 */

import WebSocket from 'ws';
import { config, logger, SEND_SAMPLE_RATE } from './config.js';

// Gemini Live API WebSocket URL for Vertex AI (requires v1beta1)
// Reference: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/get-started-websocket

export interface LiveClientConfig {
  projectId: string;
  location: string;
  model: string;
  systemInstruction: string;
  voiceName?: string;
  tools?: FunctionDeclaration[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export interface LiveEvent {
  type: 'audio' | 'text' | 'input_transcription' | 'output_transcription' | 'turn_complete' | 'interrupted' | 'tool_call' | 'error' | 'ready';
  data?: string | unknown;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

type LiveEventCallback = (event: LiveEvent) => void | Promise<void>;

/**
 * GeminiLiveClient handles real-time bidirectional streaming with Gemini Live API
 */
export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private config: LiveClientConfig;
  private callbacks: Map<string, LiveEventCallback[]> = new Map();
  private accessToken: string | null = null;
  private isConnected = false;
  private pendingToolResponses: Map<string, (result: unknown) => void> = new Map();

  constructor(config: LiveClientConfig) {
    this.config = config;
  }

  /**
   * Get human-readable description of WebSocket close code
   */
  private getCloseCodeDescription(code: number): string {
    const codes: Record<number, string> = {
      1000: 'Normal Closure',
      1001: 'Going Away',
      1002: 'Protocol Error',
      1003: 'Unsupported Data',
      1005: 'No Status Received',
      1006: 'Abnormal Closure',
      1007: 'Invalid frame payload data',
      1008: 'Policy Violation',
      1009: 'Message Too Big',
      1010: 'Mandatory Extension',
      1011: 'Internal Server Error',
      1015: 'TLS handshake failure',
    };
    return codes[code] || `Unknown code: ${code}`;
  }

  /**
   * Get access token for Vertex AI authentication
   */
  private async getAccessToken(): Promise<string> {
    // Use Google Cloud default credentials
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) {
      throw new Error('Failed to get access token');
    }
    return tokenResponse.token;
  }

  /**
   * Connect to the Gemini Live API
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.warn('Already connected to Gemini Live API');
      return;
    }

    try {
      // Get access token
      this.accessToken = await this.getAccessToken();
      logger.info('Got access token for Vertex AI');

      // Vertex AI Live API WebSocket endpoint (v1beta1 required for Gemini Live API)
      const vertexWsUrl = `wss://${this.config.location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
      logger.info(`Connecting to: ${vertexWsUrl}`);

      const ws = new WebSocket(vertexWsUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      this.ws = ws;

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 30000);

        ws.on('open', () => {
          clearTimeout(timeout);
          logger.info('Connected to Gemini Live API');
          this.isConnected = true;

          // Send setup message
          this.sendSetup();
          resolve();
        });

        ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          logger.error('WebSocket error:', error);
          reject(error);
        });

        ws.on('close', (code: number, reason: Buffer) => {
          const reasonString = reason.toString() || 'No reason provided';
          logger.error(`Disconnected from Gemini Live API - Code: ${code}, Reason: ${reasonString}`);
          logger.error(`Close code details: ${this.getCloseCodeDescription(code)}`);
          this.isConnected = false;
          this.emit({ type: 'error', data: `Connection closed - Code: ${code}, Reason: ${reasonString}` });
        });
      });
    } catch (error) {
      logger.error('Failed to connect to Gemini Live API:', error);
      throw error;
    }
  }

  /**
   * Send setup configuration to the Live API
   */
  private sendSetup(): void {
    const setupMessage = {
      setup: {
        model: `projects/${this.config.projectId}/locations/${this.config.location}/publishers/google/models/${this.config.model}`,
        generation_config: {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: this.config.voiceName || config.VOICE_NAME,
              },
            },
          },
        },
        // Enable automatic transcription for both input and output
        input_audio_transcription: {},   // Transcribe user's voice input
        output_audio_transcription: {},  // Transcribe agent's voice output
        system_instruction: {
          parts: [{ text: this.config.systemInstruction }],
        },
        tools: this.config.tools ? [{
          function_declarations: this.config.tools,
        }] : undefined,
      },
    };

    logger.debug('Setup message to be sent:', JSON.stringify(setupMessage, null, 2));
    this.send(setupMessage);
    logger.info('Sent setup message to Gemini Live API');
  }

  /**
   * Handle incoming messages from the Live API
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Log all incoming messages for debugging
      logger.debug('Received message from Gemini Live API:', JSON.stringify(message, null, 2));

      // Handle setup complete
      if (message.setupComplete) {
        logger.info('Gemini Live API setup complete');
        this.emit({ type: 'ready' });
        return;
      }

      // Check for error messages
      if (message.error) {
        logger.error('Gemini Live API returned error:', JSON.stringify(message.error, null, 2));
        this.emit({ type: 'error', data: message.error });
        return;
      }

      // Handle server content (audio/text responses)
      if (message.serverContent) {
        const content = message.serverContent;

        // Check for turn completion
        if (content.turnComplete) {
          // Check for error reasons
          if (content.turnCompleteReason && content.turnCompleteReason !== 'END_OF_TURN') {
            logger.error(`Turn completed with error: ${content.turnCompleteReason}`);
            // Emit as error event so it can be handled
            this.emit({ type: 'error', data: `Turn failed: ${content.turnCompleteReason}` });
          }
          this.emit({ type: 'turn_complete' });
          return;
        }

        // Check for interruption
        if (content.interrupted) {
          this.emit({ type: 'interrupted' });
          return;
        }

        // Process model turn content
        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            // Handle audio output
            if (part.inlineData?.mimeType?.startsWith('audio/')) {
              this.emit({
                type: 'audio',
                data: part.inlineData.data, // Base64 encoded audio
              });
            }

            // Handle text output
            if (part.text) {
              this.emit({
                type: 'text',
                data: part.text,
              });
            }
          }
        }

        // Handle input transcription
        if (content.inputTranscription?.text) {
          this.emit({
            type: 'input_transcription',
            data: content.inputTranscription.text,
          });
        }

        // Handle output transcription
        if (content.outputTranscription?.text) {
          this.emit({
            type: 'output_transcription',
            data: content.outputTranscription.text,
          });
        }
      }

      // Handle tool calls
      if (message.toolCall) {
        const toolCalls: ToolCall[] = message.toolCall.functionCalls?.map((fc: { id: string; name: string; args: Record<string, unknown> }) => ({
          id: fc.id,
          name: fc.name,
          args: fc.args,
        })) || [];

        this.emit({
          type: 'tool_call',
          toolCalls,
        });
      }
    } catch (error) {
      logger.error('Error parsing Live API message:', error);
    }
  }

  /**
   * Send realtime audio data to the Live API
   */
  sendAudio(audioData: Buffer): void {
    if (!this.isConnected || !this.ws) {
      logger.warn('Cannot send audio: not connected');
      return;
    }

    const message = {
      realtimeInput: {
        mediaChunks: [{
          mimeType: `audio/pcm;rate=${SEND_SAMPLE_RATE}`,
          data: audioData.toString('base64'),
        }],
      },
    };

    this.send(message);
  }

  /**
   * Send text content to the Live API
   */
  sendText(text: string): void {
    if (!this.isConnected || !this.ws) {
      logger.warn('Cannot send text: not connected');
      return;
    }

    const message = {
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text }],
        }],
        turnComplete: true,
      },
    };

    this.send(message);
  }

  /**
   * Send image content to the Live API
   */
  sendImage(imageData: Buffer, mimeType: string = 'image/jpeg'): void {
    if (!this.isConnected || !this.ws) {
      logger.warn('Cannot send image: not connected');
      return;
    }

    const message = {
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{
            inlineData: {
              mimeType,
              data: imageData.toString('base64'),
            },
          }],
        }],
        turnComplete: true,
      },
    };

    this.send(message);
  }

  /**
   * Send video file reference to Live API via public HTTPS URL
   * Note: Uses fileData (not inlineData) for external file references
   * Gemini Live API requires public HTTPS URLs, not gs:// URIs
   */
  sendVideoFile(publicUrl: string, mimeType: string, promptText?: string): void {
    if (!this.isConnected || !this.ws) {
      logger.warn('Cannot send video: not connected');
      return;
    }

    const parts: Array<{ fileData?: { mimeType: string; fileUri: string }; text?: string }> = [
      {
        fileData: {
          mimeType,
          fileUri: publicUrl,
        },
      },
    ];

    // Add optional prompt text
    if (promptText) {
      parts.push({ text: promptText });
    }

    const message = {
      clientContent: {
        turns: [{
          role: 'user',
          parts,
        }],
        turnComplete: true,
      },
    };

    this.send(message);
  }

  /**
   * Send tool response back to the Live API
   */
  sendToolResponse(toolCallId: string, result: unknown): void {
    if (!this.isConnected || !this.ws) {
      logger.warn('Cannot send tool response: not connected');
      return;
    }

    const message = {
      toolResponse: {
        functionResponses: [{
          id: toolCallId,
          response: result,
        }],
      },
    };

    this.send(message);
  }

  /**
   * Register event listener
   */
  on(event: LiveEvent['type'], callback: LiveEventCallback): void {
    const callbacks = this.callbacks.get(event) || [];
    callbacks.push(callback);
    this.callbacks.set(event, callbacks);
  }

  /**
   * Emit event to listeners
   */
  private emit(event: LiveEvent): void {
    const callbacks = this.callbacks.get(event.type) || [];
    for (const callback of callbacks) {
      try {
        callback(event);
      } catch (error) {
        logger.error(`Error in ${event.type} callback:`, error);
      }
    }
  }

  /**
   * Send message to WebSocket
   */
  private send(message: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Disconnect from the Live API
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.callbacks.clear();
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

/**
 * Create a Gemini Live client with default configuration
 */
export function createLiveClient(
  systemInstruction: string,
  tools?: FunctionDeclaration[]
): GeminiLiveClient {
  return new GeminiLiveClient({
    projectId: config.PROJECT_ID!,
    location: config.LOCATION,
    model: config.MODEL,
    systemInstruction,
    voiceName: config.VOICE_NAME,
    tools,
  });
}
