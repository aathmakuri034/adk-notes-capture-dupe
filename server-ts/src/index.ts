// Re-export commonly used utilities for convenience
// Usage: import { initDb, JobCategory } from '@vcmach/adk-notes-capture-server'

// Database utilities
export { initDb, closeDb, saveNote, deleteNote, getNotes, getNote } from './database.js';
export type { Note } from './database.js';

// Schema and types
export * from './schema.js';

// Configuration
export { config, loadEnv, logger, validateEnvVars } from './config.js';

// Gemini client
export { createLiveClient, GeminiLiveClient } from './gemini-live-client.js';
export type { FunctionDeclaration, ToolCall } from './gemini-live-client.js';

// Job extraction
export { getJobSummaryTracker } from './conversation-pipeline.js';

// Azure Blob Storage
export { getAzureBlobStorage } from './azure-blob-storage-singleton.js';
