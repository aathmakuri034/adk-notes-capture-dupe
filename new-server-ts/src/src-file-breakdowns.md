# Source File Breakdowns

A per-file description of every TypeScript source file in `new-server-ts/src/`.

---

## Root Files

### `index.ts`

The public API entry point for the `@vcmach/adk-notes-capture-server` package. This file is **side-effect free** and only re-exports symbols from internal modules. It defines the surface area that consumers of the package can import.

**Exports include:**
- Configuration: `getConfig`, `loadEnv`, `validateEnvVars`, `EnvConfig`
- Service creation: `createStreamingGateway`, `initialize`
- Application classes: `SessionManager` (+ `SessionManagerDeps`), `MediaForwarder` (+ `MediaForwarderDeps`), `NotesHandler` (+ `NotesHandlerDeps`)
- Domain interfaces: `StreamingSession`, `NotesRepository`, `JobExtractor`, `GeminiLiveClient`
- Transport: `StreamingGateway`, `StreamingGatewayConfig`, `StreamingGatewayDeps`
- Shared utilities: `logger`, `createLogger`, `bindLogger`, `log`, `LogContext`, error classes, WS message types/parsers, all constants (via `export *`)

### `main.ts`

The executable entry point that boots the server. Called directly when running the server standalone (not when importing as a package).

**What it does:**
1. Calls `initialize()` to load `.env` and validate required environment variables
2. Creates a `StreamingGateway` via `createStreamingGateway()`
3. Starts the WebSocket server with `gateway.start()`
4. Registers `SIGINT`/`SIGTERM` handlers for graceful shutdown (calls `gateway.stop()` then exits)
5. On startup failure, logs the error and exits with code 1

### `composition-root.ts`

The dependency injection wiring layer. Contains factory functions that assemble all services with their dependencies using pure constructor injection (no service locator or DI container).

**Factory functions:**
- `createNotesRepository()` — instantiates `SQLiteNotesRepository`
- `createJobExtractor()` — returns a `StubJobExtractor` (placeholder for Step 2)
- `createGeminiClientFactory(notesRepo, jobExtractor)` — returns a factory function `(connectionId, sessionId) => GeminiLiveClient` that calls `createGeminiLiveClient()` from `gemini-live-service.ts`, injecting the model config, voice, system instruction, notes repo, job extractor, session ID, and a `getNotes` callback
- `createStreamingGateway(config?)` — the main composition function. Assembles everything:
  - Creates `notesRepo`, `jobExtractor`
  - Creates `SessionManager` with the Gemini client factory
  - Creates `MediaForwarder` and `NotesHandler`
  - Creates and returns a `StreamingGateway` bound to `localhost` on the configured port

Also exports `initialize()` which loads env and validates vars, plus re-exports config utilities and constants.

---

## `config/`

### `config/env.ts`

Zod-validated environment configuration. Reads `process.env`, applies defaults and coercions, and caches the result.

**Key elements:**
- `booleanFromEnv` — Zod preprocessor that coerces `"TRUE"`/`"true"`/`"1"` to `true`
- `EnvSchema` — Zod object schema defining all environment variables with defaults:
  - Required for Vertex AI: `PROJECT_ID`, `LOCATION`, `GOOGLE_GENAI_USE_VERTEXAI`
  - Model config: `MODEL` (default `gemini-live-2.5-flash-native-audio`), `EXTRACTION_MODEL`, `VOICE_NAME` (default `Aoede`)
  - Ports: `JOB_SERVICE_PORT` (8080), `NOTES_SERVICE_PORT` (8081)
  - Azure: `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_CONTAINER_NAME`, `USE_AZURE_STORAGE`
  - Video: `VIDEO_API_MODEL`, `VIDEO_MAX_SIZE_MB`, `STANDARD_API_TIMEOUT_MS`, `STANDARD_API_MAX_RETRIES`
- `getConfig()` — lazy-loads and caches the parsed config
- `loadEnv(envPath?)` — loads a `.env` file via `dotenv` and resets the cache
- `validateEnvVars()` — throws descriptive errors if Vertex AI isn't enabled or `PROJECT_ID`/`LOCATION` are missing

---

## `database/`

### `database/index.ts`

Simplified database access module providing a frontend-friendly API on top of `SQLiteNotesRepository`. Uses a singleton pattern for the repository instance.

**Types:**
- `Note` — simplified note shape for frontend consumption (`id`, `title`, `description`, `details[]`, `timestamp`). Maps `created_at` from the repository to `timestamp`.

**Functions:**
- `getNotes()` — returns all notes via the singleton repository, mapped to the frontend `Note` shape with `created_at` → `timestamp`, ordered by `created_at DESC`
- `getNote(noteId)` — returns a single note by ID, or `null` if not found
- `deleteNote(noteId)` — deletes a note by ID. Returns `true` if the note existed, `false` otherwise
- `closeDb()` — closes the database connection and nulls the singleton instance

---

## `shared/`

Cross-cutting concerns used by all layers.

### `shared/constants.ts`

Application-wide constants grouped by domain.

- **Audio sample rates:** `RECEIVE_SAMPLE_RATE` (24000 Hz from Gemini), `SEND_SAMPLE_RATE` (16000 Hz to Gemini)
- **Default ports:** `DEFAULT_JOB_SERVICE_PORT` (8080), `DEFAULT_NOTES_SERVICE_PORT` (8081)
- **WebSocket config:** `WS_MAX_MESSAGE_SIZE` (5MB), `WS_PING_INTERVAL` (30s), `WS_PING_TIMEOUT` (10s)
- **WebSocket close codes:** `WS_CLOSE_CODES` — `GOING_AWAY` (1001), `INTERNAL_ERROR` (1011), `TRY_AGAIN_LATER` (1013)
- **Tool names:** `TOOL_NAMES.SAVE_NOTE` (`"save_note"`)
- **Prompts:** `INITIAL_GREETING` (sent to Gemini on new connection), `SYSTEM_INSTRUCTION` (detailed job description agent prompt covering categories, subcategories, subjob types, and conversation flow), `NOTES_SYSTEM_INSTRUCTION` (voice notes assistant prompt)

### `shared/errors.ts`

Typed error hierarchy for structured error handling across the application.

- **`AppError`** — base class with `code`, `statusCode`, `isOperational`, and optional `cause`. Has `toJSON()` for serialization and uses `Error.captureStackTrace` for clean stack traces.
- **`ValidationError`** — 400-level errors for input validation or schema mismatches
- **`ExternalApiError`** — 502-level errors for Gemini/Azure failures. Adds a `service` field identifying which external service failed.
- **`PersistenceError`** — 500-level errors for database/file storage issues. Adds an `operation` field.
- **`TransportError`** — 500-level errors for WebSocket/HTTP issues. Adds a `connectionId` field.
- **`wrapError()`** — utility that wraps unknown `catch` values into a typed `AppError`, preserving the original if it's already an `AppError`.

### `shared/logger.ts`

Pino-based structured logging setup.

- Root logger configured with ISO timestamps and a `service` base field (`@vcmach/adk-notes-capture-server`)
- In `development` mode (`NODE_ENV`), uses `pino-pretty` for colorized, human-readable output
- In production, outputs JSON
- `createLogger(context?)` — creates a child logger with optional context bindings (sessionId, connectionId, etc.)
- `bindLogger(logger, context)` — adds context to an existing logger instance
- `log` — convenience object with typed methods (`info`, `warn`, `error`, `debug`, `trace`) for quick structured logging
- `LogContext` — type for logger context bindings

### `shared/ws-messages.ts`

Typed WebSocket message contracts between the frontend and server.

**Types:**
- `Note` — the note data shape (`id`, `title`, `description`, `details[]`, `created_at`, `updated_at`, `azure_job_file_path`, `last_transcript_updated`)
- `ClientMessage` — discriminated union of all messages the frontend can send: `audio`, `video`, `video_file`, `image`, `text`, `end`, `get_notes`, `delete_note`, `update_note`, `generate_summary`
- `ServerMessage` — discriminated union of all messages the server can send: `ready`, `text`, `audio`, `user_transcript`, `model_transcript`, `notes_list`, `turn_complete`, `interrupted`, `session_id`, `error`

**Utilities:**
- `isClientMessage()` / `isServerMessage()` — type guards (check for object with string `type` field)
- `parseClientMessage()` / `parseServerMessage()` — JSON parse + type guard, returns `null` on failure
- `serializeServerMessage()` — `JSON.stringify` wrapper

---

## `application/streaming/`

Core business logic layer. Defines domain interfaces and contains the decomposed streaming service classes.

### `application/streaming/types.ts`

Domain interfaces that define the contracts for the application. Infrastructure implementations must conform to these.

- **`NotesRepository`** — persistence interface: `saveNote()` (returns `Note`), `deleteNote()`, `getNotes()`, `getNote()`
- **`JobExtractor`** — extraction interface: `extractFromNote(sessionId, title, description, details)`
- **`GeminiLiveClient`** — AI client interface: `connect()`, `sendAudio()`, `sendText()`, `sendImage()`, `sendVideo()`, `endTurn()`, `disconnect()`, plus event callbacks `onAudio()`, `onTranscript()`, `onTurnComplete()`, `onInterrupted()`, `onNoteSaved()`
- **`StreamingSession`** — session data: `connectionId`, `sessionId`, `userId`

Also re-exports `Note` from `ws-messages.ts`.

### `application/streaming/session-manager.ts`

Manages the lifecycle of streaming sessions and their associated Gemini clients.

**Dependencies:** `SessionManagerDeps` — `logger` (pino), `createGeminiClient` factory function

**State:**
- `sessions` Map: `connectionId -> StreamingSession`
- `clients` Map: `connectionId -> GeminiLiveClient`

**Methods:**
- `createSession(connectionId)` — generates a unique `sessionId` (`session_{timestamp}_{random}`), creates a `userId` (`user_{connectionId}`), instantiates a Gemini client via the injected factory, and stores both in the maps
- `getClient(connectionId)` / `getSession(connectionId)` — lookups (return `undefined` if not found)
- `disconnect(connectionId)` — disconnects the Gemini client and removes from both maps
- `disconnectAll()` — disconnects all sessions (used during graceful shutdown), using `Promise.allSettled` so one failure doesn't block others

### `application/streaming/media-forwarder.ts`

Stateless service that converts and forwards media from the frontend to the Gemini client.

**Dependencies:** `MediaForwarderDeps` — `logger` (pino)

**Helper:** `parseDataUrl(input)` — splits a data URL (`data:image/jpeg;base64,...`) into its base64 data and MIME type. Returns raw input if no data URL prefix found.

**Methods:**
- `forwardAudio(client, session, audioData)` — decodes base64 audio string to Buffer, sends via `client.sendAudio()`
- `forwardText(client, session, text)` — forwards text via `client.sendText()`
- `forwardImage(client, session, imageData, mimeType)` — parses data URL to extract MIME type and base64 data, converts to Buffer, sends via `client.sendImage()`
- `forwardEndTurn(client)` — signals end of turn via `client.endTurn()`

### `application/streaming/notes-handler.ts`

Handles notes CRUD operations and triggers async job extraction.

**Dependencies:** `NotesHandlerDeps` — `logger` (pino), `NotesRepository`, `JobExtractor`

**Methods:**
- `saveNote(sessionId, title, description, details, noteId?)` — saves to repository (returns the saved `Note`), then fires-and-forgets `jobExtractor.extractFromNote()` (errors are logged but never thrown)
- `getNotes()` — delegates to `notesRepository.getNotes()`
- `deleteNote(noteId)` — delegates to `notesRepository.deleteNote()`

### `application/streaming/streaming-service.ts`

Barrel re-export file. The original `StreamingService` god class was decomposed into `SessionManager`, `MediaForwarder`, and `NotesHandler`. This file re-exports all three plus their types for backwards-compatible imports.

---

## `transport/ws/`

WebSocket transport layer. Handles connection management, message routing, and serialization.

### `transport/ws/base-ws-server.ts`

Abstract base class for WebSocket servers. Extends `EventEmitter`.

**Configuration:** host, port, maxPayload (default 5MB), maxConnections (default 10), maxMessagesPerSecond (default 100), maxConsecutiveFailures (default 5)

**Lifecycle:**
- `start()` — creates a `WebSocketServer`, binds to host:port, wires up connection/error/close events, returns a Promise that resolves when listening
- `stop()` — closes all connections with `GOING_AWAY` code, then closes the server

**Connection handling:**
- `handleConnection()` — enforces max connection limit, creates a `Connection` object, calls the abstract `processConnection()`, and cleans up on completion
- `processMessage()` — rate-limits messages per connection (sliding window of 1 second), parses via `parseClientMessage()`, and delegates to the abstract `handleMessage()`

**Utilities:**
- `sendToConnection(id, message)` — serializes and sends a `ServerMessage` to a specific connection
- `broadcast(message)` — sends to all open connections
- `generateConnectionId()` — produces `conn_{timestamp}_{random}`

**Health tracking:**
- `recordFailure()` / `resetFailureCount()` — tracks consecutive failures; triggers `triggerShutdown()` when threshold is reached
- `triggerShutdown()` — emits `healthcheck-failed`, stops the server, and calls `process.exit(1)`

### `transport/ws/streaming.gateway.ts`

Concrete gateway that wires WebSocket connections to the application layer services.

**Dependencies:** `StreamingGatewayDeps` — `SessionManager`, `MediaForwarder`, `NotesHandler`

**Configuration:** `StreamingGatewayConfig` — `host`, `port`, optional `maxPayload`, `maxConnections`, `maxMessagesPerSecond`

**Constants:**
- `SESSION_INDEPENDENT_TYPES` — a `Set<string>` containing `'get_notes'` and `'delete_note'`, identifying message types that only need database access and not a Gemini session

**`processConnection(connectionId, socket)`** — called per new WebSocket connection:
1. Creates a streaming session via `SessionManager`
2. Gets the Gemini client for the connection
3. Connects to Gemini Live API
4. Sends the `INITIAL_GREETING` text to Gemini
5. Wires up Gemini event callbacks:
   - `onAudio` → forwards base64-encoded audio to the WebSocket client
   - `onTranscript` → sends `user_transcript` (for user speech) or `text` (for agent speech) to the client
   - `onTurnComplete` → sends `turn_complete` with `session_id`
   - `onInterrupted` → sends `interrupted` message
   - `onNoteSaved` → sends updated `notes_list` to the client
6. Sends a `ready` message to the frontend
7. Sets up a message handler on the socket
8. Waits for socket close, then disconnects the Gemini client

**`handleMessage(connectionId, msg)`** — routes client messages by type:
- **Session-independent** (checked first via `SESSION_INDEPENDENT_TYPES` set):
  - `get_notes` → `NotesHandler.getNotes()` then sends `notes_list` response
  - `delete_note` → validates `msg.data`, calls `NotesHandler.deleteNote()`, then sends updated `notes_list`
- **Session-dependent** (requires active session and Gemini client; sends `error` if missing):
  - `audio` → `MediaForwarder.forwardAudio()`
  - `text` → `MediaForwarder.forwardText()`
  - `image` → `MediaForwarder.forwardImage()`
  - `end` → `MediaForwarder.forwardEndTurn()`
  - `video`, `video_file`, `update_note`, `generate_summary` → logs warning (not implemented in Step 1)

**`handleMessageError(connectionId, err)`** — categorizes errors by type (`ValidationError`, `ExternalApiError`, generic `Error`), sends an error message to the client, and records failures for health tracking when appropriate.

**`stop()`** — calls `sessionManager.disconnectAll()` before the base class `stop()`.

---

## `infrastructure/gemini/`

Concrete implementations for Google Gemini AI integration.

### `infrastructure/gemini/gemini-live-service.ts`

The core Gemini Live API client implementation. Implements the `GeminiLiveClient` interface using the `@google/genai` SDK directly (not ADK, which doesn't support live mode).

**Configuration:** `GeminiLiveServiceConfig` — model name, voice, system instruction, notes repository, job extractor, session ID, `getNotes` callback.

**Factory:** `createGeminiLiveClient(config)` — creates and returns a new `GeminiLiveServiceImpl` instance.

**`connect(sessionId, userId)`:**
- Creates a `GoogleGenAI` instance (Vertex AI with OAuth2 if `GOOGLE_GENAI_USE_VERTEXAI` is set, or API key via `GOOGLE_API_KEY`)
- Defines tool declarations for `save_note` (with title, description, details, optional note_id)
- Sets up `LiveConnectParameters` with speech config, input/output transcription, system instruction, and tools
- Creates `LiveCallbacks` for `onopen`, `onmessage`, `onerror`, `onclose`
- Connects via `ai.live.connect()`

**`handleServerMessage(message)`** — processes all `LiveServerMessage` events:
- **Model turn:** iterates parts for text (emits transcript), audio (emits to audio handlers), and function calls (triggers tool handling via `pendingToolCalls` map)
- **Turn complete:** resets all accumulators and fires turn complete handlers
- **Input transcription:** emits user speech via delta deduplication
- **Output transcription:** emits agent speech-to-text (suppressed if `modelTurn` already provided text to avoid duplicates)
- **Interrupted:** resets accumulators and fires interrupted handlers
- **Tool calls:** from `message.toolCall.functionCalls`, stored as pending and handled
- **Tool call cancellation:** removes from pending map via `message.toolCallCancellation.ids`
- **Session resumption:** logs debug message for `message.sessionResumptionUpdate`

**`handleSaveNote(args, toolCallId)`:**
- Validates arguments with Zod (`SaveNoteArgsSchema`)
- Saves to `notesRepository`
- Notifies frontend via `noteSavedHandlers` with the updated notes list
- Fires async `jobExtractor.extractFromNote()` (errors caught and logged)
- Sends `FunctionResponse` back to Gemini (`{success: true, note_id}` or `{success: false, error}`)

**Media methods:** `sendAudio()` (PCM via `sendRealtimeInput`), `sendText()` (via `sendClientContent`), `sendImage()` (inline data via `sendClientContent`), `sendVideo()` (sends a placeholder text message), `endTurn()` (sends `turnComplete: true`)

**Event registration:** `onAudio()`, `onTranscript()`, `onTurnComplete()`, `onInterrupted()`, `onNoteSaved()` — each pushes a callback to the respective handler array.

**Transcript deduplication:**
- Three separate accumulators: `accumulatedModelText`, `accumulatedTranscriptionText`, `accumulatedInputText`
- `emitTranscriptDelta()` checks if new text extends the accumulated prefix; if so, only the delta is emitted. If not (Gemini restarted), the full text is emitted and the accumulator resets.
- `modelTurnHadText` flag prevents duplicate agent text when both `modelTurn.text` and `outputTranscription` fire in the same turn.

**`disconnect()`:** closes the live session, nulls the AI instance, clears all handler arrays.

### `infrastructure/gemini/gemini-tools.ts`

Legacy tool abstraction layer (not actively used by the live service, which defines tools inline). Provides a factory pattern for creating tool objects.

- `SaveNoteArgsSchema` — Zod schema for validating save_note arguments
- `Tool` interface — defines `name`, `description`, and `execute()` method
- `createSaveNoteTool(deps)` — creates a tool that validates input with Zod, saves to the notes repository, and triggers async job extraction
- `createTools(deps)` — returns an array of all tool instances

Kept for potential use by future non-live API integrations (e.g., REST-based Gemini calls for job extraction).

---

## `infrastructure/database/`

Database implementations.

### `infrastructure/database/sqlite-notes-repository.ts`

SQLite implementation of the `NotesRepository` interface using `better-sqlite3` (synchronous).

**Constructor:** accepts optional `dbPath`, falls back to `NOTES_DB_PATH` env var, then to `../../../data/notes.db` relative to the compiled file. Creates the directory if it doesn't exist.

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  details TEXT,          -- JSON stringified array
  created_at TEXT,       -- ISO 8601
  updated_at TEXT,       -- ISO 8601
  azure_job_file_path TEXT,
  last_transcript_updated TEXT
)
```

**Methods:**
- `saveNote(title, description, details, noteId?)` — generates an ID if not provided (`note_{timestamp}_{random}`). Checks if the note exists: updates if yes, inserts if no. `details` is stored as a JSON string.
- `deleteNote(noteId)` — `DELETE WHERE id = ?` (parameterized)
- `getNotes()` — `SELECT * ORDER BY created_at DESC`, parses `details` from JSON string back to array
- `getNote(noteId)` — `SELECT WHERE id = ?`, parses details
- `close()` — closes the database connection

All queries use parameterized statements to prevent SQL injection.

---

## `infrastructure/azure/`

Azure Blob Storage integration (stub).

### `infrastructure/azure/azure-blob-storage.ts`

Stub implementation of Azure Blob Storage operations. All methods are no-ops that log to console and return null/empty values. Placeholder for full Azure integration.

**Constructor:** sets `initialized = true` immediately (no real connection).

**Methods (all stubs):**
- `waitForInit()` — no-op
- `ensureContainer()` — no-op
- `uploadJobSchema(jobData, filename?)` — returns `null`
- `uploadVoiceNote(noteData, filename?)` — returns `null`
- `isInitialized()` — returns `true`
- `listJobSchemas()` — returns `[]`
- `getJobSchemaById(jobId)` — returns `null`
- `deleteJobSchemaById(jobId)` — returns `0`
- `uploadTranscript(transcriptText, sessionId)` — returns `null`
- `uploadMedia(buffer, filename, mimeType)` — returns `null`
