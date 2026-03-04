// Public API exports
// Usage: import { createStreamingGateway } from '@vcmach/adk-notes-capture-server'

// Configuration
export { getConfig, loadEnv, validateEnvVars } from './composition-root.js';
export type { EnvConfig } from './config/env.js';

// Constants
export { RECEIVE_SAMPLE_RATE, SEND_SAMPLE_RATE, SYSTEM_INSTRUCTION } from './composition-root.js';

// Services
export { createStreamingGateway, initialize } from './composition-root.js';
export { SessionManager } from './application/streaming/session-manager.js';
export type { SessionManagerDeps } from './application/streaming/session-manager.js';
export { MediaForwarder } from './application/streaming/media-forwarder.js';
export type { MediaForwarderDeps } from './application/streaming/media-forwarder.js';
export { NotesHandler } from './application/streaming/notes-handler.js';
export type { NotesHandlerDeps } from './application/streaming/notes-handler.js';
export type { StreamingSession, NotesRepository, JobExtractor, GeminiLiveClient, ToolCallEvent } from './application/streaming/types.js';

// Transport
export { StreamingGateway } from './transport/ws/streaming.gateway.js';
export type { StreamingGatewayConfig, StreamingGatewayDeps } from './transport/ws/streaming.gateway.js';

// Shared
export { logger, createLogger, bindLogger, log } from './shared/logger.js';
export type { LogContext } from './shared/logger.js';
export { AppError, ValidationError, ExternalApiError, PersistenceError, TransportError } from './shared/errors.js';
export type { ClientMessage, ServerMessage, Note } from './shared/ws-messages.js';
export { isClientMessage, isServerMessage, parseClientMessage, parseServerMessage, serializeServerMessage } from './shared/ws-messages.js';

// Re-export for convenience
export * from './shared/constants.js';

// Database API
export { createNotesApi, createDefaultNotesApi } from './database/index.js';
export type { FrontendNote, NotesApi } from './database/index.js';
