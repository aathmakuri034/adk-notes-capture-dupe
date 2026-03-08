// Barrel re-export for the streaming application layer.
// The former StreamingService god class has been decomposed into:
// - SessionManager: session/client lifecycle
// - MediaForwarder: stateless media forwarding
// - NotesHandler: notes CRUD + job extraction

export type { NotesRepository, JobSummaryService, GeminiLiveClient, ToolCallEvent, StreamingSession, Note } from './types.js';
export { SessionManager } from './session-manager.js';
export type { SessionManagerDeps } from './session-manager.js';
export { MediaForwarder } from './media-forwarder.js';
export type { MediaForwarderDeps } from './media-forwarder.js';
export { NotesHandler } from './notes-handler.js';
export type { NotesHandlerDeps } from './notes-handler.js';
