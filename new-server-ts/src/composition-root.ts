import { getConfig, validateEnvVars, loadEnv } from './config/env.js';
import { createLogger, logger } from './shared/logger.js';
import { SYSTEM_INSTRUCTION, RECEIVE_SAMPLE_RATE, SEND_SAMPLE_RATE } from './shared/constants.js';
import type { NotesRepository, JobExtractor, GeminiLiveClient } from './application/streaming/types.js';
import { SessionManager } from './application/streaming/session-manager.js';
import { MediaForwarder } from './application/streaming/media-forwarder.js';
import { NotesHandler } from './application/streaming/notes-handler.js';
import { StreamingGateway, type StreamingGatewayConfig } from './transport/ws/streaming.gateway.js';
import { createGeminiLiveClient } from './infrastructure/gemini/gemini-live-service.js';
import { SQLiteNotesRepository } from './infrastructure/database/sqlite-notes-repository.js';

// Stub job extractor (will be replaced with real extraction in Step 2)
class StubJobExtractor {
  async extractFromNote(_sessionId: string, _title: string, _description: string, _details: string[]): Promise<void> {
    // Stub - will be implemented in Step 2
    logger.info('StubJobExtractor: extractFromNote called (not implemented)');
  }
}

// Composition root for creating services
export function createNotesRepository(): NotesRepository {
  return new SQLiteNotesRepository();
}

export function createJobExtractor(): JobExtractor {
  return new StubJobExtractor();
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
export type { StreamingGatewayConfig, NotesRepository, JobExtractor, GeminiLiveClient };
