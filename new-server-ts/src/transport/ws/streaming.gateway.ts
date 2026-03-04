import type { WebSocket } from 'ws';
import { BaseWsServer } from './base-ws-server.js';
import type { SessionManager } from '../../application/streaming/session-manager.js';
import type { MediaForwarder } from '../../application/streaming/media-forwarder.js';
import type { NotesHandler } from '../../application/streaming/notes-handler.js';
import { z } from 'zod';
import { logger } from '../../shared/logger.js';
import { WS_CLOSE_CODES, INITIAL_GREETING, TOOL_NAMES } from '../../shared/constants.js';
import { ClientMessage } from '../../shared/ws-messages.js';
import { ExternalApiError, ValidationError } from '../../shared/errors.js';

const SaveNoteArgsSchema = z.object({
  title: z.string(),
  description: z.string(),
  details: z.array(z.string()),
  note_id: z.string().optional(),
});

// Message types that only need database access, not a Gemini session
const SESSION_INDEPENDENT_TYPES = new Set<string>(['get_notes', 'delete_note']);

export interface StreamingGatewayConfig {
  host: string;
  port: number;
  maxPayload?: number;
  maxConnections?: number;
  maxMessagesPerSecond?: number;
}

export interface StreamingGatewayDeps {
  sessionManager: SessionManager;
  mediaForwarder: MediaForwarder;
  notesHandler: NotesHandler;
}

export class StreamingGateway extends BaseWsServer {
  private readonly sessionManager: SessionManager;
  private readonly mediaForwarder: MediaForwarder;
  private readonly notesHandler: NotesHandler;

  constructor(config: StreamingGatewayConfig, deps: StreamingGatewayDeps) {
    super(config);
    this.sessionManager = deps.sessionManager;
    this.mediaForwarder = deps.mediaForwarder;
    this.notesHandler = deps.notesHandler;
  }

  protected async processConnection(connectionId: string, socket: WebSocket): Promise<void> {
    // Create a session for this connection
    const session = this.sessionManager.createSession(connectionId);

    // Get the Gemini client for this connection
    const client = this.sessionManager.getClient(connectionId);
    if (!client) {
      logger.error({ connectionId }, 'Failed to get Gemini client\n');
      socket.close(WS_CLOSE_CODES.INTERNAL_ERROR, 'Failed to initialize Gemini client');
      return;
    }

    // Connect to Gemini Live
    try {
      await client.connect(session.sessionId, session.userId);
      logger.info({ connectionId, sessionId: session.sessionId }, 'Connected to Gemini Live\n');
    } catch (error) {
      logger.error({ connectionId, error }, 'Failed to connect to Gemini Live\n');
      logger.info({ connectionId, error }, '---- TRY RUNNING <gcloud auth application-default login> ----\n');
      socket.close(WS_CLOSE_CODES.INTERNAL_ERROR, 'Failed to connect to Gemini Live');
      return;
    }

    // Send initial greeting after connect completes
    try {
      await client.sendText(INITIAL_GREETING);
      logger.info({ connectionId, sessionId: session.sessionId }, 'Initial greeting sent\n');
    } catch (error) {
      logger.error({ connectionId, error }, 'Failed to send initial greeting\n');
    }

    // Wire up event handlers to forward responses to the WebSocket client
    client.onAudio((data: Buffer) => {
      logger.debug({ connectionId, audioSize: data.length }, 'Sending audio to frontend\n');
      const b64Audio = data.toString('base64');
      this.sendToConnection(connectionId, { type: 'audio', data: b64Audio });
    });

    client.onTranscript((text: string, isUser: boolean) => {
      if (isUser) {
        logger.debug({ connectionId, text: text.substring(0, 50) }, 'Sending user transcript to frontend\n');
        this.sendToConnection(connectionId, {
          type: 'user_transcript',
          data: text,
        });
      } else {
        logger.debug({ connectionId, text: text.substring(0, 50) }, 'Sending agent text to frontend\n');
        this.sendToConnection(connectionId, {
          type: 'text',
          data: text,
        });
      }
    });

    client.onTurnComplete(() => {
      this.sendToConnection(connectionId, {
        type: 'turn_complete',
        session_id: session.sessionId,
      });
    });

    client.onInterrupted(() => {
      this.sendToConnection(connectionId, {
        type: 'interrupted',
        data: 'Response interrupted by user input',
      });
    });

    client.onToolCall((event) => {
      if (event.name === TOOL_NAMES.SAVE_NOTE) {
        const parsed = SaveNoteArgsSchema.safeParse(event.args);
        if (!parsed.success) {
          logger.error({ args: event.args, error: parsed.error.format(), connectionId }, 'Invalid save_note arguments');
          event.respond({ success: false, error: `Invalid arguments: ${parsed.error.message}` });
          return;
        }

        try {
          const note = this.notesHandler.saveNote(
            session.sessionId,
            parsed.data.title,
            parsed.data.description,
            parsed.data.details,
            parsed.data.note_id,
          );
          event.respond({ success: true, note_id: note.id });

          // Push updated notes list to the frontend
          const notes = this.notesHandler.getNotes();
          this.sendToConnection(connectionId, { type: 'notes_list', data: notes });
        } catch (error) {
          logger.error({ error, connectionId }, 'Failed to save note via tool call');
          event.respond({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      } else {
        logger.warn({ connectionId, toolName: event.name }, 'Unknown tool call');
        event.respond({ success: false, error: `Unknown tool: ${event.name}` });
      }
    });

    // Send "ready" message to client
    this.sendToConnection(connectionId, { type: 'ready' });

    // Set up message handler using event-based approach
    const messageHandler = (data: Buffer | ArrayBuffer | string): void => {
      const message = data.toString();
      this.processMessage(connectionId, message).catch((error) => {
        this.handleMessageError(connectionId, error);
      });
    };

    socket.on('message', messageHandler);

    // Wait for socket to close
    await new Promise<void>((resolve) => {
      socket.on('close', async () => {
        socket.off('message', messageHandler);
        // Clean up Gemini client
        try {
          await this.sessionManager.disconnect(connectionId);
        } catch (error) {
          logger.error({ connectionId, error }, 'Error disconnecting Gemini client\n');
        }
        resolve();
      });
    });
  }

  protected async handleMessage(
    connectionId: string,
    msg: ClientMessage | null
  ): Promise<void> {
    if (!msg) {
      return;
    }

    // Database-only operations — no session or Gemini client needed
    if (SESSION_INDEPENDENT_TYPES.has(msg.type)) {
      switch (msg.type) {
        case 'get_notes': {
          try {
            const notes = this.notesHandler.getNotes();
            this.sendToConnection(connectionId, {
              type: 'notes_list',
              data: notes,
            });
          } catch (error) {
            this.handleMessageError(connectionId, error);
          }
          return;
        }

        case 'delete_note': {
          try {
            if (!msg.data || typeof msg.data !== 'string') {
              this.sendToConnection(connectionId, {
                type: 'error',
                data: 'Invalid note ID',
              });
              return;
            }
            this.notesHandler.deleteNote(msg.data);
            const notes = this.notesHandler.getNotes();
            this.sendToConnection(connectionId, {
              type: 'notes_list',
              data: notes,
            });
          } catch (error) {
            this.handleMessageError(connectionId, error);
          }
          return;
        }
      }
    }

    // Session-dependent operations require active session and Gemini client
    const session = this.sessionManager.getSession(connectionId);
    if (!session) {
      this.sendToConnection(connectionId, {
        type: 'error',
        data: 'No active session',
      });
      return;
    }

    const client = this.sessionManager.getClient(connectionId);
    if (!client) {
      this.sendToConnection(connectionId, {
        type: 'error',
        data: 'No active Gemini client',
      });
      return;
    }

    switch (msg.type) {
      case 'audio': {
        try {
          await this.mediaForwarder.forwardAudio(client, session, msg.data);
        } catch (error) {
          this.handleMessageError(connectionId, error);
        }
        break;
      }

      case 'text': {
        try {
          await this.mediaForwarder.forwardText(client, session, msg.data);
        } catch (error) {
          this.handleMessageError(connectionId, error);
        }
        break;
      }

      case 'image': {
        try {
          await this.mediaForwarder.forwardImage(client, session, msg.data, 'image/jpeg');
        } catch (error) {
          this.handleMessageError(connectionId, error);
        }
        break;
      }

      case 'video': {
        logger.warn({ connectionId, type: msg.type }, 'Video handling not implemented in Step 1');
        break;
      }

      case 'video_file': {
        logger.warn({ connectionId, type: msg.type }, 'Video file handling not implemented in Step 1');
        break;
      }

      case 'end': {
        try {
          await this.mediaForwarder.forwardEndTurn(client);
        } catch (error) {
          this.handleMessageError(connectionId, error);
        }
        break;
      }

      case 'update_note': {
        logger.warn({ connectionId, type: msg.type }, 'Update note not implemented in Step 1');
        break;
      }

      case 'generate_summary': {
        logger.warn({ connectionId, type: msg.type }, 'Generate summary not implemented in Step 1');
        break;
      }

      default: {
        logger.warn({ connectionId, msg }, 'Unknown message type');
      }
    }
  }

  private handleMessageError(connectionId: string, err: unknown): void {
    let message = 'Internal error';
    let statusCode = 500;
    let recordFailure = false;

    if (err instanceof ValidationError) {
      message = err.message;
      statusCode = err.statusCode;
    } else if (err instanceof ExternalApiError) {
      message = `External API error: ${err.message}`;
      statusCode = err.statusCode;
      recordFailure = true;
    } else if (err instanceof Error) {
      message = err.message;
    }

    logger.error({ connectionId, error: err, statusCode }, 'Error handling message');
    this.sendToConnection(connectionId, {
      type: 'error',
      data: message,
    });

    if (recordFailure) {
      this.recordFailure();
    }
  }

  async stop(): Promise<void> {
    await this.sessionManager.disconnectAll();
    await super.stop();
  }
}
