/**
 * Job Scope Streaming Service
 *
 * WebSocket server for real-time voice-based job intake using Gemini Live API.
 * Handles audio streaming, text messages, image/video uploads, and tool calls.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  config,
  logger,
  validateEnvVars,
  SYSTEM_INSTRUCTION,
  SEND_SAMPLE_RATE,
} from './config.js';
import { initDb, closeDb, saveNoteDetailed, updateNoteJobId, getNote, getNotes, deleteNote, type Note } from './database.js';
import { createLiveClient, GeminiLiveClient, type FunctionDeclaration, type ToolCall } from './gemini-live-client.js';
import { getJobSummaryTracker } from './conversation-pipeline.js';
import { getAzureBlobStorage } from './azure-blob-storage-singleton.js';
import { StandardGeminiClient, type VideoAnalysisResult } from './standard-gemini-client.js';
import * as fs from 'fs';
import * as path from 'path';

interface ClientConnection {
  ws: WebSocket;
  liveClient: GeminiLiveClient | null;
  sessionId: string;
  userId: string;
  inputTexts: string[];
  outputTexts: string[];
  mediaCounter: number;
  videoAnalyses: string[];  // Store video analysis texts for job extraction
}

const activeConnections = new Map<string, ClientConnection>();

// Transcripts directory path
const TRANSCRIPTS_DIR = path.join(process.cwd(), 'transcripts');

let _transcriptsDirReady = false;
async function ensureTranscriptsDir(): Promise<void> {
  if (_transcriptsDirReady) return;
  await fs.promises.mkdir(TRANSCRIPTS_DIR, { recursive: true });
  _transcriptsDirReady = true;
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };
  return mimeToExt[mimeType] || 'bin';
}

/**
 * Save transcript turn to local file and upload to Azure
 */
async function saveTranscriptTurn(
  sessionId: string,
  inputTexts: string[],
  outputTexts: string[]
): Promise<void> {
  await ensureTranscriptsDir();

  // Deduplicate text segments
  const uniqueInputTexts = [...new Set(inputTexts)];
  const uniqueOutputTexts = [...new Set(outputTexts)];

  // Build turn content
  let turnContent = '';
  if (uniqueInputTexts.length > 0) {
    turnContent += `USER: ${uniqueInputTexts.join(' ')}\n\n`;
  }
  if (uniqueOutputTexts.length > 0) {
    turnContent += `MODEL: ${uniqueOutputTexts.join(' ')}\n\n`;
  }
  turnContent += '--- TURN COMPLETE ---\n\n';

  // Local file path
  const transcriptPath = path.join(TRANSCRIPTS_DIR, `${sessionId}.txt`);

  // Append to local file
  await fs.promises.appendFile(transcriptPath, turnContent, 'utf8');
  logger.info(`Saved transcript turn to: ${transcriptPath}`);

  // Read full transcript and upload to Azure
  try {
    const azure = getAzureBlobStorage();
    await azure.waitForInit();
    if (azure.isInitialized()) {
      const fullTranscript = await fs.promises.readFile(transcriptPath, 'utf8');
      await azure.uploadTranscript(fullTranscript, sessionId);
    }
  } catch (error) {
    logger.error('Failed to upload transcript to Azure:', error);
  }
}

/**
 * Save media (image/video) locally and upload to Azure
 */
async function saveMedia(
  connection: ClientConnection,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  await ensureTranscriptsDir();

  // Increment media counter
  connection.mediaCounter++;

  // Determine extension from mimeType
  const ext = getExtensionFromMimeType(mimeType);

  // Build filename: {session_id}_{counter}.{ext}
  const filename = `${connection.sessionId}_${connection.mediaCounter}.${ext}`;

  // Save locally to transcripts/{filename}
  const localPath = path.join(TRANSCRIPTS_DIR, filename);
  await fs.promises.writeFile(localPath, buffer);
  logger.info(`Saved media locally: ${localPath}`);

  // Determine media type label
  const mediaType = mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE';

  // Append reference to transcript
  const transcriptPath = path.join(TRANSCRIPTS_DIR, `${connection.sessionId}.txt`);
  const mediaReference = `${mediaType} UPLOADED: ${filename}\n\n`;
  await fs.promises.appendFile(transcriptPath, mediaReference, 'utf8');
  logger.info(`Added ${mediaType.toLowerCase()} reference to transcript`);

  // Upload media to Azure
  try {
    const azure = getAzureBlobStorage();
    await azure.waitForInit();
    if (azure.isInitialized()) {
      await azure.uploadMedia(buffer, filename, mimeType);
    }
  } catch (error) {
    logger.error('Failed to upload media to Azure:', error);
  }

  return filename;
}

/**
 * Process video with retry logic for standard Gemini API
 */
async function processVideoWithRetry(
  videoData: string,
  mimeType: string,
  prompt: string,
  maxRetries: number = config.STANDARD_API_MAX_RETRIES
): Promise<VideoAnalysisResult> {
  const standardClient = new StandardGeminiClient(
    config.PROJECT_ID || '',
    config.LOCATION,
    config.VIDEO_API_MODEL
  );

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await standardClient.analyzeVideo(videoData, mimeType, prompt);
      return result;
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable (rate limits, temporary failures)
      const isRetryable =
        error instanceof Error && (
          error.message?.includes('429') ||
          error.message?.includes('503') ||
          error.message?.includes('ECONNRESET')
        );

      if (isRetryable && attempt < maxRetries - 1) {
        const delayMs = Math.pow(2, attempt) * 1000; // Exponential backoff
        logger.warn(`Video analysis attempt ${attempt + 1} failed, retrying in ${delayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      } else {
        throw error;
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// Tool definitions for save_note
const TOOLS: FunctionDeclaration[] = [
  {
    name: 'save_note',
    description: 'Save a completed Job Description to the database.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title of the Job (e.g., "Kitchen Painting")',
        },
        description: {
          type: 'string',
          description: 'A high-level summary of the work required',
        },
        details: {
          type: 'array',
          description: 'A list of specific captured attributes',
        },
        note_id: {
          type: 'string',
          description: 'Optional ID of the note to update',
        },
      },
      required: ['title', 'description', 'details'],
    },
  },
];

/**
 * Handle save_note tool call
 */
async function handleSaveNote(
  connection: ClientConnection,
  args: Record<string, unknown>
): Promise<string> {
  const title = typeof args.title === 'string' ? args.title : 'Untitled Job';
  const description = typeof args.description === 'string' ? args.description : '';
  const details = Array.isArray(args.details) ? args.details.map(String) : [];
  const noteId = typeof args.note_id === 'string' ? args.note_id : undefined;

  logger.info(`Tool called: save_note with title='${title}', id='${noteId}'`);

  // Save to SQLite database
  const saveResult = saveNoteDetailed(title, description, details, noteId);
  const savedNoteId = saveResult.id;

  // Extract and save structured job data to JSON files
  try {
    logger.info(`Starting schema extraction for: ${title}`);
    const extraction = await getJobSummaryTracker().extractAndSaveFromNote(
      connection.sessionId,
      title,
      description,
      details,
      connection.userId,
      connection.videoAnalyses
    );
    if (extraction.jobId && savedNoteId) {
      updateNoteJobId(savedNoteId, extraction.jobId);
    }
    logger.info(`Schema extraction completed for: ${title}`);
  } catch (error) {
    logger.error('Error during schema extraction:', error);
  }

  // Send updated notes list to the client
  try {
    const notes = getNotes();
    connection.ws.send(JSON.stringify({
      type: 'notes_list',
      data: notes,
    }));
    logger.info('Sent updated notes list to client after save_note');
  } catch (error) {
    logger.error('Error sending notes update:', error);
  }

  return saveResult.message;
}

/**
 * Handle incoming client messages
 */
async function handleClientMessage(
  connection: ClientConnection,
  message: string
): Promise<void> {
  try {
    const data = JSON.parse(message);

    switch (data.type) {
      case 'audio':
        // Forward audio to Gemini Live API
        if (connection.liveClient?.connected) {
          const audioBytes = Buffer.from(data.data, 'base64');
          connection.liveClient.sendAudio(audioBytes);
        }
        break;

      case 'text':
        // Send text message to Gemini
        if (connection.liveClient?.connected) {
          const text = data.data as string;
          logger.info(`Received text from client: ${text}`);
          connection.liveClient.sendText(text);
          connection.inputTexts.push(text);
        }
        break;

      case 'image':
        // Handle image upload
        if (connection.liveClient?.connected) {
          let imageData = data.data as string;
          let mimeType = 'image/jpeg';

          // Parse data URL if present
          if (imageData.includes(',')) {
            const [header, base64Data] = imageData.split(',', 2);
            if (header.includes('data:') && header.includes(';')) {
              mimeType = header.split(':')[1].split(';')[0];
            }
            imageData = base64Data;
          }

          const imageBytes = Buffer.from(imageData, 'base64');
          logger.info(`Received image (${mimeType}) from client`);

          // Save image locally and upload to Azure
          await saveMedia(connection, imageBytes, mimeType);

          connection.liveClient.sendImage(imageBytes, mimeType);
        }
        break;

      case 'video_file':
        if (connection.liveClient?.connected) {
          // Parse video data
          let videoData = data.data as string;
          let mimeType = 'video/mp4';

          if (videoData.includes(',')) {
            const [header, base64Data] = videoData.split(',', 2);
            if (header.includes('data:') && header.includes(';')) {
              mimeType = header.split(':')[1].split(';')[0];
            }
            videoData = base64Data;
          }

          const videoBytes = Buffer.from(videoData, 'base64');

          // Validate video size
          if (videoBytes.length > config.VIDEO_MAX_SIZE_MB * 1024 * 1024) {
            connection.ws.send(JSON.stringify({
              type: 'error',
              data: `Video too large. Max size: ${config.VIDEO_MAX_SIZE_MB}MB`
            }));
            break;
          }

          logger.info(`Received video file (${mimeType}, ${videoBytes.length} bytes)`);

          // Notify client of processing
          connection.ws.send(JSON.stringify({
            type: 'status',
            data: 'Analyzing video...'
          }));

          try {
            // Save locally and to Azure
            const filename = await saveMedia(connection, videoBytes, mimeType);

            // Analyze with standard Gemini API
            const analysis = await processVideoWithRetry(
              videoData,
              mimeType,
              `You are analyzing a user-uploaded video for conversational context.

Describe only what is clearly visible in the video.

Focus on:
- The setting or environment (e.g., room type, indoor/outdoor).
- Visible objects, materials, and surfaces.
- Any obvious damage, wear, or notable conditions.
- Actions taking place, if any.

Do NOT:
- Guess measurements, dimensions, or quantities.
- Assume causes, intent, or future work.
- Infer details that are not visually confirmed.

If something cannot be clearly determined from the video, explicitly say so.

Write the response as a concise, factual description that can be referenced later in a spoken conversation.`
            );

            // Inject analysis into Gemini Live API conversation
            const contextMessage = `[Video Uploaded: ${filename}]\n\nVideo Analysis:\n${analysis.text}\n\nYou can now reference this video analysis in your conversation with the user.`;
            connection.liveClient.sendText(contextMessage);

            // Track in connection metadata
            connection.inputTexts.push(`[VIDEO: ${filename}]`);
            if (connection.videoAnalyses.length < 20) {
              connection.videoAnalyses.push(analysis.text);
            }

            // Notify client of success
            connection.ws.send(JSON.stringify({
              type: 'video_processed',
              data: {
                filename,
                analysis: analysis.text
              }
            }));

            logger.info('Video processed successfully via standard Gemini API');

          } catch (error) {
            logger.error('Error processing video:', error);
            connection.ws.send(JSON.stringify({
              type: 'error',
              data: 'Failed to analyze video. Please try again.'
            }));
          }
        }
        break;

      case 'get_notes':
        // Return all notes
        const notes = getNotes();
        connection.ws.send(JSON.stringify({
          type: 'notes_list',
          data: notes,
        }));
        break;

      case 'delete_note':
        // Delete a note
        const noteId = data.data as string;
        if (noteId) {
          const note = getNote(noteId);
          deleteNote(noteId);
          if (note?.jobId) {
            try {
              const azure = getAzureBlobStorage();
              await azure.waitForInit();
              if (azure.isInitialized()) {
                await azure.deleteJobSchemaById(note.jobId);
              }
            } catch (error) {
              logger.error('Failed to delete job schema from Azure:', error);
            }
          }
          const updatedNotes = getNotes();
          connection.ws.send(JSON.stringify({
            type: 'notes_list',
            data: updatedNotes,
          }));
        }
        break;

      case 'generate_summary':
        // Instruct the agent to summarize and save
        if (connection.liveClient?.connected) {
          const prompt = 'The user wants to save the current job description. Please generate a structured summary including all gathered details and save it using the save_note tool.';
          connection.liveClient.sendText(prompt);
        }
        break;

      case 'update_note':
        // Handle note update request
        if (connection.liveClient?.connected) {
          const reqData = data.data;
          let prompt: string;

          if (typeof reqData === 'object' && reqData !== null) {
            const { id, content } = reqData as { id?: string; content?: string };
            prompt = `The user wants to update the Job Description with ID '${id}'. Current content: ${content}. Please listen to the user's updates and use the save_note tool with note_id='${id}' to update it.`;
          } else {
            prompt = `The user wants to update this Job Description. Content: ${reqData}. Please ask for what to change.`;
          }

          connection.liveClient.sendText(prompt);
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
 * Set up Gemini Live client event handlers
 */
function setupLiveClientHandlers(connection: ClientConnection): void {
  const { liveClient, ws } = connection;
  if (!liveClient) return;

  // Handle ready event
  liveClient.on('ready', () => {
    logger.info('Gemini Live API ready');
    // Send initial prompt
    liveClient.sendText(
      'Hello. Please introduce yourself as the Job Scope Assistant and ask the user what project they are working on.'
    );
  });

  // Handle audio output
  liveClient.on('audio', (event) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'audio',
        data: event.data,
      }));
    }
  });

  // Handle text output
  liveClient.on('text', (event) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'text',
        data: event.data,
      }));
      if (typeof event.data === 'string') {
        connection.outputTexts.push(event.data);
      }
    }
  });

  // Handle input transcription
  liveClient.on('input_transcription', (event) => {
    logger.info(`📝 User transcript received: "${event.data}"`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'user_transcript',
        data: event.data,
      }));
      logger.debug(`✅ Sent user_transcript to frontend`);
      if (typeof event.data === 'string') {
        connection.inputTexts.push(event.data);
      }
    }
  });

  // Handle output transcription
  liveClient.on('output_transcription', (event) => {
    logger.info(`🤖 Agent transcript received: "${event.data}"`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'text',
        data: event.data,
      }));
      logger.debug(`✅ Sent text to frontend`);
      if (typeof event.data === 'string') {
        connection.outputTexts.push(event.data);
      }
    }
  });

  // Handle turn complete
  liveClient.on('turn_complete', async () => {
    logger.info('Turn complete');
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'turn_complete',
        session_id: connection.sessionId,
      }));
    }

    // Log transcripts
    if (connection.inputTexts.length > 0) {
      logger.info(`User said: ${[...new Set(connection.inputTexts)].join(' ')}`);
    }
    if (connection.outputTexts.length > 0) {
      logger.info(`Agent said: ${[...new Set(connection.outputTexts)].join(' ')}`);
    }

    // Save transcript turn before clearing buffers
    if (connection.inputTexts.length > 0 || connection.outputTexts.length > 0) {
      await saveTranscriptTurn(
        connection.sessionId,
        connection.inputTexts,
        connection.outputTexts
      );
    }

    // Clear buffers
    connection.inputTexts = [];
    connection.outputTexts = [];
  });

  // Handle interruption
  liveClient.on('interrupted', () => {
    logger.info('Response interrupted');
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'interrupted',
        data: 'Response interrupted by user input',
      }));
    }
  });

  // Handle tool calls
  liveClient.on('tool_call', async (event) => {
    const toolCalls = event.toolCalls || [];

    for (const toolCall of toolCalls) {
      logger.info(`Tool call: ${toolCall.name}`, toolCall.args);

      if (toolCall.name === 'save_note') {
        const result = await handleSaveNote(connection, toolCall.args);
        liveClient.sendToolResponse(toolCall.id, { result });
      } else {
        // Handle unknown tools (like vision_request from Gemini)
        // Send success response to prevent stalling
        logger.warn(`Unknown tool call: ${toolCall.name}, responding with success`);
        liveClient.sendToolResponse(toolCall.id, { success: true });
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
  logger.info(`New connection established: ${connectionId}`);

  // Create connection object
  const connection: ClientConnection = {
    ws,
    liveClient: null,
    sessionId: `session_${uuidv4().slice(0, 16)}`,
    userId: `user_${connectionId}`,
    inputTexts: [],
    outputTexts: [],
    mediaCounter: 0,
    videoAnalyses: [],
  };

  activeConnections.set(connectionId, connection);

  // Send ready message
  ws.send(JSON.stringify({ type: 'ready' }));

  try {
    // Create and connect Gemini Live client
    connection.liveClient = createLiveClient(SYSTEM_INSTRUCTION, TOOLS);
    setupLiveClientHandlers(connection);
    await connection.liveClient.connect();

    // Handle incoming messages
    ws.on('message', (message: Buffer) => {
      handleClientMessage(connection, message.toString());
    });

    // Handle connection close
    ws.on('close', () => {
      logger.info(`Connection closed: ${connectionId}`);
      if (connection.liveClient) {
        connection.liveClient.disconnect();
      }
      activeConnections.delete(connectionId);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error(`WebSocket error for connection ${connectionId}:`, error);
    });
  } catch (error) {
    logger.error(`Failed to initialize connection ${connectionId}:`, error);
    ws.send(JSON.stringify({
      type: 'error',
      data: 'Failed to connect to AI service',
    }));
    ws.close();
    activeConnections.delete(connectionId);
  }
}

/**
 * Start the streaming service
 */
async function main(portOverride?: number): Promise<void> {
  try {
    // Validate environment
    validateEnvVars();
    logger.info('Environment validated');

    // Initialize database
    initDb();
    logger.info('Database initialized');

    const port = portOverride || config.JOB_SERVICE_PORT;

    // Create WebSocket server
    const wss = new WebSocketServer({
      port: port,
      maxPayload: 500 * 1024 * 1024, // 500MB max payload
    });

    logger.info(`Job Scope Streaming Service starting on port ${port}`);

    wss.on('connection', handleConnection);

    wss.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });

    logger.info(`Server running on ws://0.0.0.0:${port}`);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Start the job scope streaming service
 * @param port - Optional port override (defaults to config.JOB_SERVICE_PORT env var)
 * @returns Promise that resolves when server is started
 */
export async function startJobService(port?: number): Promise<void> {
  await main(port);
}

// Only run if executed directly (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const { loadEnv } = await import('./config.js');
  loadEnv();
  startJobService().catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down job service...');
    for (const [id, conn] of activeConnections) {
      conn.liveClient?.disconnect();
      conn.ws.close();
      activeConnections.delete(id);
    }
    closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
