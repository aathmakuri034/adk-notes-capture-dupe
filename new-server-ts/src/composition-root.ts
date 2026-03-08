import { getConfig, validateEnvVars, loadEnv } from './config/env.js';
import { createLogger, logger } from './shared/logger.js';
import { SYSTEM_INSTRUCTION, RECEIVE_SAMPLE_RATE, SEND_SAMPLE_RATE } from './shared/constants.js';
import type { NotesRepository, JobSummaryService, GeminiLiveClient } from './application/streaming/types.js';
import { SessionManager } from './application/streaming/session-manager.js';
import { MediaForwarder } from './application/streaming/media-forwarder.js';
import { NotesHandler } from './application/streaming/notes-handler.js';
import { StreamingGateway, type StreamingGatewayConfig } from './transport/ws/streaming.gateway.js';
import { createGeminiLiveClient } from './infrastructure/gemini/gemini-live-service.js';
import { SQLiteNotesRepository } from './infrastructure/database/sqlite-notes-repository.js';
import { JobSummaryTracker } from './application/extraction/job-summary-tracker.js';
import { AzureBlobStorage } from './infrastructure/azure/azure-blob-storage.js';

// Composition root for creating services
export function createNotesRepository(): NotesRepository {
  return new SQLiteNotesRepository();
}

export function createJobExtractor(): JobSummaryService {
  const log = createLogger({ component: 'job-extraction' });
  const blobStorage = new AzureBlobStorage();
  return new JobSummaryTracker({
    logger: log,
    blobStorage,
  });
}

// Create a Gemini client factory that accepts both connectionId and sessionId
function createGeminiClientFactory(): (connectionId: string, sessionId: string) => GeminiLiveClient {
  return (_connectionId: string, sessionId: string): GeminiLiveClient => {
    return createGeminiLiveClient({
      model: getConfig().MODEL,
      voiceName: getConfig().VOICE_NAME,
      systemInstruction: SYSTEM_INSTRUCTION,
      sessionId,
    });
  };
}

export function createStreamingGateway(config?: Partial<StreamingGatewayConfig>): StreamingGateway {
  const envConfig = getConfig();
  const log = createLogger({ component: 'streaming' });
  const notesRepo = createNotesRepository();
  const jobExtractor = createJobExtractor();

  const sessionManager = new SessionManager({
    logger: log,
    createGeminiClient: createGeminiClientFactory(),
  });
  const mediaForwarder = new MediaForwarder({ logger: log });
  const notesHandler = new NotesHandler({
    logger: log,
    notesRepository: notesRepo,
    jobExtractor,
  });

  const gatewayConfig: StreamingGatewayConfig = {
    host: 'localhost',
    port: config?.port ?? envConfig.JOB_SERVICE_PORT,
    maxPayload: config?.maxPayload,
  };

  return new StreamingGateway(gatewayConfig, { sessionManager, mediaForwarder, notesHandler });
}

// Initialize and validate environment
export function initialize(): void {
  loadEnv();
  validateEnvVars();
}

// Export configuration for consumers
export { getConfig, loadEnv, validateEnvVars };
export { RECEIVE_SAMPLE_RATE, SEND_SAMPLE_RATE, SYSTEM_INSTRUCTION };
export type { StreamingGatewayConfig, NotesRepository, JobSummaryService, GeminiLiveClient };
