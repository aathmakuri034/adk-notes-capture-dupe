/**
 * Voice Notes Capture Service
 *
 * WebSocket server for real-time voice notes capture using Gemini Live API.
 * Handles audio streaming, transcription, and automatic note extraction.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import {
  config,
  logger,
  validateEnvVars,
  NOTES_SYSTEM_INSTRUCTION
} from './config.js';
import { createLiveClient, GeminiLiveClient, type FunctionDeclaration, type ToolCall } from './gemini-live-client.js';
import { getAzureBlobStorage } from './azure-blob-storage-singleton.js';

// Notes storage directory — relative to consumer's project root
const NOTES_DIR = path.join(process.cwd(), 'voice_notes_data');

let _notesDirReady = false;
async function ensureNotesDir(): Promise<void> {
  if (_notesDirReady) return;
  await fs.promises.mkdir(NOTES_DIR, { recursive: true });
  _notesDirReady = true;
}

interface NoteData {
  id: string;
  title: string;
  summary: string;
  key_points: string[];
  timestamp: string;
  transcript: string;
}

interface NotesConnection {
  ws: WebSocket;
  liveClient: GeminiLiveClient | null;
  sessionId: string;
  userId: string;
  inputTexts: string[];
  isRecording: boolean;
  audioCount: number;
  startTime: number;
  pendingPrompt: string | null;
}

const activeConnections = new Map<string, NotesConnection>();

// Tool definitions for save_voice_note
const NOTES_TOOLS: FunctionDeclaration[] = [
  {
    name: 'save_voice_note',
    description: 'Save a voice note with extracted title, summary, and key points.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'A concise title for the note (3-8 words)',
        },
        summary: {
          type: 'string',
          description: 'A brief summary of the note content (1-2 sentences)',
        },
        key_points: {
          type: 'array',
          description: 'List of key points from the recording (1-5 items)',
        },
      },
      required: ['title', 'summary', 'key_points'],
    },
  },
];

/**
 * Handle save_voice_note tool call
 */
async function handleSaveVoiceNote(
  connection: NotesConnection,
  args: Record<string, unknown>
): Promise<string> {
  const title = typeof args.title === 'string' ? args.title : 'Untitled Note';
  const summary = typeof args.summary === 'string' ? args.summary : '';
  const keyPoints = Array.isArray(args.key_points) ? args.key_points.map(String) : [];

  logger.info(`Tool called: save_voice_note with title='${title}'`);

  await ensureNotesDir();

  const noteId = `note_${uuidv4().slice(0, 12)}`;
  const timestamp = new Date().toISOString();

  const noteData: NoteData = {
    id: noteId,
    title,
    summary,
    key_points: keyPoints,
    timestamp,
    transcript: connection.inputTexts.join(' '),
  };

  // Save to file
  const filepath = path.join(NOTES_DIR, `${noteId}.json`);
  await fs.promises.writeFile(filepath, JSON.stringify(noteData, null, 2), 'utf-8');

  // Upload to Azure Blob Storage (non-blocking, never fails the main flow)
  try {
    const azure = getAzureBlobStorage();
    await azure.waitForInit();
    const blobPath = await azure.uploadVoiceNote({ ...noteData }, noteId);
    if (blobPath) {
      logger.info(`Voice note uploaded to Azure: ${blobPath}`);
    } else {
      logger.warn(`Voice note Azure upload skipped (storage not configured)`);
    }
  } catch (error) {
    logger.error('Failed to upload voice note to Azure:', error);
  }

  // Send note_saved event to client
  try {
    connection.ws.send(JSON.stringify({
      type: 'note_saved',
      data: noteData,
    }));
    logger.info(`Sent note_saved event for: ${noteId}`);
  } catch (error) {
    logger.error('Error sending note_saved event:', error);
  }

  return `Saved note: ${noteId}`;
}

/**
 * Get all saved notes
 */
async function getAllNotes(): Promise<NoteData[]> {
  const notes: NoteData[] = [];

  try {
    await fs.promises.access(NOTES_DIR);
  } catch {
    return notes;
  }

  const files = await fs.promises.readdir(NOTES_DIR);
  for (const file of files) {
    if (file.startsWith('note_') && file.endsWith('.json')) {
      try {
        const filepath = path.join(NOTES_DIR, file);
        const content = await fs.promises.readFile(filepath, 'utf-8');
        notes.push(JSON.parse(content));
      } catch {
        continue;
      }
    }
  }

  // Sort by timestamp (newest first)
  notes.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return notes;
}

/**
 * Handle incoming client messages
 */
async function handleClientMessage(
  connection: NotesConnection,
  message: string
): Promise<void> {
  try {
    const data = JSON.parse(message);

    switch (data.type) {
      case 'start_recording':
        logger.info('START_RECORDING received');
        connection.isRecording = true;
        connection.audioCount = 0;
        connection.inputTexts = [];
        connection.startTime = Date.now();
        connection.pendingPrompt = null;

        // Send initial content to open the turn
        if (connection.liveClient?.connected) {
          connection.liveClient.sendText('Begin voice note now.');
        }
        break;

      case 'audio':
        // Forward audio to Gemini Live API
        if (connection.isRecording && connection.liveClient?.connected) {
          const audioBytes = Buffer.from(data.data, 'base64');
          if (audioBytes.length >= 320) {
            connection.liveClient.sendAudio(audioBytes);
            connection.audioCount++;
          }
        }
        break;

      case 'stop_recording':
        logger.info('STOP_RECORDING received');
        connection.isRecording = false;

        const transcript = connection.inputTexts.join(' ').trim() || '[No speech detected]';

        // Set pending prompt for summarization
        connection.pendingPrompt = `Recording finished.

Transcript: ${transcript}

Extract title, summary, and 1-5 key points. Call save_voice_note immediately.`;
        break;

      case 'get_notes':
        // Return all notes
        const notes = await getAllNotes();
        connection.ws.send(JSON.stringify({
          type: 'notes_list',
          data: notes,
        }));
        break;

      case 'text':
        // Send text message to Gemini
        if (connection.liveClient?.connected) {
          const text = data.data as string;
          logger.info(`Received text from client: ${text}`);
          connection.liveClient.sendText(text);
        }
        break;

      default:
        logger.warn(`Unknown message type: ${data.type}`);
    }
  } catch (error) {
    logger.error('Error handling client message:', error);
  }
}

/**
 * Set up Gemini Live client event handlers for notes service
 */
function setupNotesLiveClientHandlers(connection: NotesConnection): void {
  const { liveClient, ws } = connection;
  if (!liveClient) return;

  // Handle ready event
  liveClient.on('ready', () => {
    logger.info('Gemini Live API ready for notes');
  });

  // Handle audio output (we can ignore this for notes)
  liveClient.on('audio', (event) => {
    // Notes service doesn't need to send audio back to client
    // But we could if we wanted voice feedback
  });

  // Handle text output
  liveClient.on('text', (event) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'text',
        data: event.data,
      }));
    }
  });

  // Handle input transcription
  liveClient.on('input_transcription', (event) => {
    if (typeof event.data === 'string' && event.data.trim()) {
      connection.inputTexts.push(event.data);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'text',
          data: event.data,
        }));
      }
    }
  });

  // Handle output transcription
  liveClient.on('output_transcription', (event) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'text',
        data: event.data,
      }));
    }
  });

  // Handle turn complete
  liveClient.on('turn_complete', () => {
    logger.info('Turn complete');

    // If there's a pending prompt (after stop_recording), send it
    if (connection.pendingPrompt && liveClient.connected) {
      liveClient.sendText(connection.pendingPrompt);
      connection.pendingPrompt = null;
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'recording_complete',
      }));
    }
  });

  // Handle interruption
  liveClient.on('interrupted', () => {
    logger.info('Response interrupted');
  });

  // Handle tool calls
  liveClient.on('tool_call', async (event) => {
    const toolCalls = event.toolCalls || [];

    for (const toolCall of toolCalls) {
      logger.info(`Tool call: ${toolCall.name}`, toolCall.args);

      if (toolCall.name === 'save_voice_note') {
        const result = await handleSaveVoiceNote(connection, toolCall.args);
        liveClient.sendToolResponse(toolCall.id, { result });
      }
    }
  });

  // Handle errors
  liveClient.on('error', (event) => {
    logger.error('Gemini Live API error:', event.data);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        data: event.data,
      }));
    }
  });
}

/**
 * Handle new WebSocket connection
 */
async function handleConnection(ws: WebSocket): Promise<void> {
  const connectionId = uuidv4();
  logger.info(`New notes connection established: ${connectionId}`);

  // Create connection object
  const connection: NotesConnection = {
    ws,
    liveClient: null,
    sessionId: `notes_session_${uuidv4().slice(0, 16)}`,
    userId: `notes_user_${connectionId}`,
    inputTexts: [],
    isRecording: false,
    audioCount: 0,
    startTime: 0,
    pendingPrompt: null,
  };

  activeConnections.set(connectionId, connection);

  // Send ready message
  ws.send(JSON.stringify({ type: 'ready' }));

  try {
    // Create and connect Gemini Live client
    connection.liveClient = createLiveClient(NOTES_SYSTEM_INSTRUCTION, NOTES_TOOLS);
    setupNotesLiveClientHandlers(connection);
    await connection.liveClient.connect();

    // Handle incoming messages
    ws.on('message', (message: Buffer) => {
      handleClientMessage(connection, message.toString());
    });

    // Handle connection close
    ws.on('close', () => {
      logger.info(`Notes connection closed: ${connectionId}`);
      if (connection.liveClient) {
        connection.liveClient.disconnect();
      }
      activeConnections.delete(connectionId);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error(`WebSocket error for notes connection ${connectionId}:`, error);
    });
  } catch (error) {
    logger.error(`Failed to initialize notes connection ${connectionId}:`, error);
    ws.send(JSON.stringify({
      type: 'error',
      data: 'Failed to connect to AI service',
    }));
    ws.close();
    activeConnections.delete(connectionId);
  }
}

/**
 * Start the notes streaming service
 */
async function main(portOverride?: number): Promise<void> {
  try {
    // Validate environment
    validateEnvVars();
    logger.info('Environment validated');

    const port = portOverride || config.NOTES_SERVICE_PORT;

    // Create WebSocket server
    const wss = new WebSocketServer({
      port: port,
      maxPayload: 100 * 1024 * 1024, // 100MB max payload
    });

    logger.info(`Voice Notes Streaming Service starting on port ${port}`);

    wss.on('connection', handleConnection);

    wss.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });

    logger.info(`Server running on ws://0.0.0.0:${port}`);
  } catch (error) {
    logger.error('Failed to start notes server:', error);
    process.exit(1);
  }
}

/**
 * Start the voice notes streaming service
 * @param port - Optional port override (defaults to config.NOTES_SERVICE_PORT env var)
 * @returns Promise that resolves when server is started
 */
export async function startNotesService(port?: number): Promise<void> {
  await main(port);
}

// Only run if executed directly (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const { loadEnv } = await import('./config.js');
  loadEnv();
  startNotesService().catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down notes service...');
    for (const [id, conn] of activeConnections) {
      conn.liveClient?.disconnect();
      conn.ws.close();
      activeConnections.delete(id);
    }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
