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
- Domain interfaces: `StreamingSession`, `NotesRepository`, `JobSummaryService`, `GeminiLiveClient`, `ToolCallEvent`
- Transport: `StreamingGateway`, `StreamingGatewayConfig`, `StreamingGatewayDeps`
- Shared utilities: `logger`, `createLogger`, `bindLogger`, `log`, `LogContext`, error classes, WS message types/parsers, all constants (via `export *`)
- Database API: `createNotesApi`, `createDefaultNotesApi`, `FrontendNote`, `NotesApi`
- Job Extraction: `JobSummaryTracker` class, `JobExtractor` class, `buildExtractionPrompt` function
- Job Domain Types: all enums (`JobCategory`, `UrgencyLevel`, `LocationType`, `ComplexityLevel`), all Zod schemas (`BaseJobSchema`, `PaintingJobSchema`, `ElectricalJobSchema`, `PlumbingJobSchema`, `HVACJobSchema`, `GeneralJobSchema`, `JobSchema`, `JobSchemas`), and all inferred types (`BaseJob`, `PaintingJob`, `ElectricalJob`, `PlumbingJob`, `HVACJob`, `GeneralJob`, `Job`)

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
- `createNotesRepository()` — instantiates `SQLiteNotesRepository` and returns it as a `NotesRepository` interface. Used by `createStreamingGateway()` to provide persistence to `NotesHandler`.
- `createJobExtractor()` — creates a `JobSummaryTracker` (which implements the `JobSummaryService` interface). Internally creates a pino child logger with `{ component: 'job-extraction' }` context and an `AzureBlobStorage` instance, passing both as dependencies. The returned `JobSummaryService` is injected into `NotesHandler`, which fire-and-forgets `extractFromNote()` after each note save.
- `createGeminiClientFactory()` — returns a factory function `(_connectionId, sessionId) => GeminiLiveClient` that calls `createGeminiLiveClient()` from `gemini-live-service.ts`. Reads `MODEL`, `VOICE_NAME` from `getConfig()` and injects `SYSTEM_INSTRUCTION` from constants. The factory is injected into `SessionManager`, which calls it once per new WebSocket connection to create a dedicated Gemini Live API client for that session.
- `createStreamingGateway(config?)` — the main composition function. Assembles the entire dependency graph:
  1. Creates `notesRepo` via `createNotesRepository()`
  2. Creates `jobExtractor` via `createJobExtractor()`
  3. Creates `SessionManager` with the Gemini client factory
  4. Creates `MediaForwarder` with a logger
  5. Creates `NotesHandler` with logger, notesRepo, and jobExtractor
  6. Creates and returns a `StreamingGateway` bound to `localhost` on the configured port (`JOB_SERVICE_PORT` default 8080)
- `initialize()` — calls `loadEnv()` then `validateEnvVars()`. Called by `main.ts` at server startup before any service creation.

Also re-exports `getConfig`, `loadEnv`, `validateEnvVars`, `RECEIVE_SAMPLE_RATE`, `SEND_SAMPLE_RATE`, `SYSTEM_INSTRUCTION`, and types `StreamingGatewayConfig`, `NotesRepository`, `JobSummaryService`, `GeminiLiveClient` for consumers.

---

## `config/`

### `config/env.ts`

Zod-validated environment configuration. Reads `process.env`, applies defaults and coercions, and caches the result.

**Key elements:**
- `booleanFromEnv` — Zod preprocessor that coerces `"TRUE"`/`"true"`/`"1"` to `true`, everything else to `false`
- `EnvSchema` — Zod object schema defining all environment variables with defaults:
  - Required for Vertex AI: `PROJECT_ID`, `LOCATION`, `GOOGLE_GENAI_USE_VERTEXAI`
  - Model config: `MODEL` (default `gemini-live-2.5-flash-native-audio`), `EXTRACTION_MODEL` (default `gemini-2.0-flash`), `VOICE_NAME` (default `Aoede`)
  - Ports: `JOB_SERVICE_PORT` (8080), `NOTES_SERVICE_PORT` (8081)
  - Azure: `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_CONTAINER_NAME` (default `extracted-data`), `USE_AZURE_STORAGE`
  - Video: `VIDEO_API_MODEL` (default `gemini-2.0-flash`), `VIDEO_MAX_SIZE_MB` (default 50), `STANDARD_API_TIMEOUT_MS` (default 60000), `STANDARD_API_MAX_RETRIES` (default 3), `USE_STANDARD_API_FOR_VIDEO`
  - Job extraction: `JOB_OUTPUT_DIR` (optional string, configures where `JobSummaryTracker` writes extracted job JSON files; defaults to `conversation_data/` relative to CWD)

**Functions:**
- `getConfig(): EnvConfig` — lazy-loads and caches the parsed config. Called throughout the codebase by `composition-root.ts` (port config, model config), `gemini-live-service.ts` (Vertex AI auth), `gemini-extraction-client.ts` (auth + timeout/retry config), and `job-summary-tracker.ts` (output dir).
- `loadEnv(envPath?): void` — loads a `.env` file via `dotenv` and resets the config cache so the next `getConfig()` call re-parses. Called by `initialize()` in `composition-root.ts`.
- `validateEnvVars(): void` — throws descriptive errors if `GOOGLE_GENAI_USE_VERTEXAI` is not enabled or `PROJECT_ID`/`LOCATION` are missing. Called by `initialize()` in `composition-root.ts`.

**Exported type:**
- `EnvConfig` — `z.infer<typeof EnvSchema>`, the fully typed config object

---

## `domain/job/`

Domain layer for job data. Contains Zod schemas as the single source of truth for job types. Has no dependencies on application or infrastructure layers.

### `domain/job/base-job.schema.ts`

Defines all Zod schemas for job extraction. Uses `snake_case` field names to match the Python API format and Azure storage expectations.

**Enums (TypeScript enums used via `z.nativeEnum`):**
- `JobCategory` — `painting`, `electrical`, `plumbing`, `hvac`, `general`
- `UrgencyLevel` — `low`, `medium`, `high`, `emergency`
- `LocationType` — `indoor`, `outdoor`, `both`
- `ComplexityLevel` — `basic`, `intermediate`, `complex`

**Zod enum schemas:** `JobCategorySchema`, `UrgencyLevelSchema`, `LocationTypeSchema`, `ComplexityLevelSchema` — thin wrappers via `z.nativeEnum()` used inside the job schemas.

**Base schema:**
- `BaseJobSchema` — common fields for all job types: `session_id` (optional), `job_id` (optional), `user_id` (optional, default `'anon'`), `category` (JobCategory enum), `title` (string), `description` (string), `location_type` (LocationType enum), `specific_location` (string), `urgency` (default `medium`), `complexity` (default `intermediate`), `estimated_duration_minutes` (number ≥ 0), `problem_type` (string), `customer_notes` (optional), `tools_needed` (optional), `key_details` (string array, default `[]`), `has_images`/`has_video` (boolean defaults to `false`), `visual_analysis` (optional), `created_at`/`last_updated` (optional strings). Used as the fallback validation in `JobExtractor.validateWithFallback()` when category-specific validation fails.

**Category-specific schemas (each extends `BaseJobSchema`):**
- `PaintingJobSchema` — `category: z.literal('painting')`, adds: `number_of_rooms`, `ceiling_height`, `room_size`, `number_of_walls`, `number_of_doors`, `number_of_windows`, `paint_colors` (string array), `surface_condition`, `prep_work_needed`
- `ElectricalJobSchema` — `category: z.literal('electrical')`, adds: `installation_type`, `number_of_outlets`, `voltage_requirement`, `amperage`, `has_existing_panel`, `panel_capacity`, `desired_location`, `current_wiring`, `permits_required`
- `PlumbingJobSchema` — `category: z.literal('plumbing')`, adds: `issue_type`, `fixture_type`, `severity`, `water_damage` (default `false`), `water_shut_off` (default `false`), `access_difficulty`, `age_of_plumbing`
- `HVACJobSchema` — `category: z.literal('hvac')`, adds: `system_type`, `issue_type`, `system_age`, `last_service_date`, `brand_model`, `square_footage`, `filter_change_frequency`, `thermostat_type`
- `GeneralJobSchema` — `category: z.literal('general')`, adds: `work_type`, `materials_needed` (string array), `estimated_scope`, `special_requirements`

**Discriminated union:**
- `JobSchema` — `z.discriminatedUnion('category', [PaintingJobSchema, ElectricalJobSchema, PlumbingJobSchema, HVACJobSchema, GeneralJobSchema])`. The primary validation schema used by `JobExtractor.validateWithFallback()` — it automatically routes to the correct category-specific schema based on the `category` field.

**Convenience export:**
- `JobSchemas` — `{ base: BaseJobSchema, painting: PaintingJobSchema, electrical: ElectricalJobSchema, plumbing: PlumbingJobSchema, hvac: HVACJobSchema, general: GeneralJobSchema, union: JobSchema }` as const. Imported by `JobExtractor` in `job-extractor.ts` for validation (`JobSchemas.union.safeParse()` and `JobSchemas.base.safeParse()`).

**Inferred types:** `BaseJob`, `PaintingJob`, `ElectricalJob`, `PlumbingJob`, `HVACJob`, `GeneralJob`, `Job` — all derived via `z.infer<typeof Schema>`.

### `domain/job/types.ts`

Pure re-export file. Re-exports all types (`BaseJob`, `PaintingJob`, `ElectricalJob`, `PlumbingJob`, `HVACJob`, `GeneralJob`, `Job`, `JobCategory`, `UrgencyLevel`, `LocationType`, `ComplexityLevel`) and `JobSchemas` from `base-job.schema.ts`. Exists so consumers can import types from a clean `domain/job/types.js` path rather than `base-job.schema.js`. Used by `index.ts` for public API type exports.

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
- **`ExternalApiError`** — 502-level errors for Gemini/Azure failures. Adds a `service` field identifying which external service failed. Used by `GeminiExtractionClientImpl` when all retries are exhausted or a non-retryable error occurs.
- **`PersistenceError`** — 500-level errors for database/file storage issues. Adds an `operation` field.
- **`TransportError`** — 500-level errors for WebSocket/HTTP issues. Adds a `connectionId` field.
- **`wrapError()`** — utility that wraps unknown `catch` values into a typed `AppError`, preserving the original if it's already an `AppError`. **Known bug:** argument order is swapped (`context` and `message` reversed). New code avoids using this function.

### `shared/logger.ts`

Pino-based structured logging setup.

- Root logger configured with ISO timestamps and a `service` base field (`@vcmach/adk-notes-capture-server`)
- In `development` mode (`NODE_ENV`), uses `pino-pretty` for colorized, human-readable output
- In production, outputs JSON
- `createLogger(context?)` — creates a child logger with optional context bindings (sessionId, connectionId, etc.). Used by `composition-root.ts` to create component-scoped loggers (`{ component: 'streaming' }`, `{ component: 'job-extraction' }`).
- `bindLogger(logger, context)` — adds context to an existing logger instance
- `log` — convenience object with typed methods (`info`, `warn`, `error`, `debug`, `trace`) for quick structured logging
- `LogContext` — type for logger context bindings

### `shared/ws-messages.ts`

Typed WebSocket message contracts between the frontend and server.

**Types:**
- `Note` — the note data shape (`id`, `title`, `description`, `details[]`, `created_at`, `updated_at`, `azure_job_file_path`, `last_transcript_updated`). This is the persistence-layer note shape, re-exported by `application/streaming/types.ts` and used throughout the streaming pipeline.
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

- **`NotesRepository`** — persistence interface for notes CRUD. Methods: `saveNote(title, description, details, noteId?): Note`, `deleteNote(noteId): void`, `getNotes(): Note[]`, `getNote(noteId): Note | undefined`, `close(): void`. Implemented by `SQLiteNotesRepository`. Consumed by `NotesHandler` and `gemini-live-service.ts`.
- **`JobSummaryService`** — orchestration interface for job extraction. Method: `extractFromNote(sessionId, title, description, details): Promise<string | null>` (returns job ID or null). Implemented by `JobSummaryTracker`. Consumed by `NotesHandler` (fire-and-forget after note save) and referenced in `gemini-tools.ts`. Renamed from the original `JobExtractor` interface to avoid naming collision with the `JobExtractor` extraction logic class.
- **`ToolCallEvent`** — represents a Gemini tool call: `name` (string), `args` (Record), `toolCallId` (string), `respond()` callback for sending results back to Gemini.
- **`GeminiLiveClient`** — AI client interface for bidirectional streaming. Methods: `connect(sessionId, userId)`, `sendAudio(data)`, `sendText(text)`, `sendImage(data, mimeType)`, `sendVideo(data, mimeType, gsUri)`, `endTurn()`, `disconnect()`. Event registration: `onAudio()`, `onTranscript()`, `onTurnComplete()`, `onInterrupted()`, `onToolCall()`. Implemented by `GeminiLiveServiceImpl` in `gemini-live-service.ts`. Created per WebSocket connection by `SessionManager` via the factory function.
- **`StreamingSession`** — session data: `connectionId`, `sessionId`, `userId`. Created by `SessionManager.createSession()` and stored in its sessions Map.

Also re-exports `Note` from `ws-messages.ts`.

### `application/streaming/session-manager.ts`

Manages the lifecycle of streaming sessions and their associated Gemini clients.

**Dependencies:** `SessionManagerDeps` — `logger` (pino), `createGeminiClient` factory function `(connectionId, sessionId) => GeminiLiveClient`

**State:**
- `sessions` Map: `connectionId -> StreamingSession`
- `clients` Map: `connectionId -> GeminiLiveClient`

**Methods:**
- `createSession(connectionId)` — generates a unique `sessionId` (`session_{timestamp}_{random}`), creates a `userId` (`user_{connectionId}`), instantiates a Gemini client via the injected factory, and stores both in the maps. Called by `StreamingGateway.processConnection()` when a new WebSocket connects.
- `getClient(connectionId)` / `getSession(connectionId)` — lookups (return `undefined` if not found). Called by `StreamingGateway.handleMessage()` to resolve the Gemini client for session-dependent messages.
- `disconnect(connectionId)` — disconnects the Gemini client via `client.disconnect()` and removes from both maps. Called by `StreamingGateway.processConnection()` when a WebSocket closes.
- `disconnectAll()` — disconnects all sessions (used during graceful shutdown), using `Promise.allSettled` so one failure doesn't block others. Called by `StreamingGateway.stop()`.

### `application/streaming/media-forwarder.ts`

Stateless service that converts and forwards media from the frontend to the Gemini client.

**Dependencies:** `MediaForwarderDeps` — `logger` (pino)

**Helper:** `parseDataUrl(input)` — splits a data URL (`data:image/jpeg;base64,...`) into its base64 data and MIME type. Returns raw input if no data URL prefix found.

**Methods:**
- `forwardAudio(client, session, audioData)` — decodes base64 audio string to Buffer, sends via `client.sendAudio()`. Called by `StreamingGateway.handleMessage()` for `audio` type messages.
- `forwardText(client, session, text)` — forwards text via `client.sendText()`. Called by `StreamingGateway.handleMessage()` for `text` type messages.
- `forwardImage(client, session, imageData, mimeType)` — parses data URL to extract MIME type and base64 data, converts to Buffer, sends via `client.sendImage()`. Called by `StreamingGateway.handleMessage()` for `image` type messages.
- `forwardEndTurn(client)` — signals end of turn via `client.endTurn()`. Called by `StreamingGateway.handleMessage()` for `end` type messages.

### `application/streaming/notes-handler.ts`

Handles notes CRUD operations and triggers async job extraction.

**Dependencies:** `NotesHandlerDeps` — `logger` (pino), `notesRepository: NotesRepository`, `jobExtractor: JobSummaryService`

**Methods:**
- `saveNote(sessionId, title, description, details, noteId?)` — saves to repository via `notesRepository.saveNote()` (returns the saved `Note`), logs the save with `{ sessionId, noteId }`, then fires-and-forgets `jobExtractor.extractFromNote(sessionId, title, description, details)` with a `.catch()` that logs errors but never throws. Called by `gemini-live-service.ts` when a `save_note` tool call is received from Gemini.
- `getNotes()` — delegates to `notesRepository.getNotes()`. Called by `StreamingGateway.handleMessage()` for `get_notes` messages.
- `deleteNote(noteId)` — delegates to `notesRepository.deleteNote()`, logs with `{ noteId }`. Called by `StreamingGateway.handleMessage()` for `delete_note` messages.

### `application/streaming/streaming-service.ts`

Barrel re-export file. The original `StreamingService` god class was decomposed into `SessionManager`, `MediaForwarder`, and `NotesHandler`. This file re-exports all three classes plus their deps interfaces and the domain types (`NotesRepository`, `JobSummaryService`, `GeminiLiveClient`, `ToolCallEvent`, `StreamingSession`, `Note`) for backwards-compatible imports. Used by `gemini-tools.ts` to import `NotesRepository` and `JobSummaryService`.

---

## `application/extraction/`

Job extraction pipeline. Ports the Python `JobExtractor` and `JobSummaryTracker` classes from `server/conversation_pipeline.py`.

### `application/extraction/extraction-prompt-builder.ts`

Pure function module for building extraction prompts. No class, no state, no dependencies on other modules.

**Constants:**
- `MAX_INPUT_LENGTH` — `50000` characters. Input exceeding this is truncated to prevent excessive API costs.

**Functions:**
- `buildExtractionPrompt(text: string): string` — takes raw voice note text and returns a complete prompt string for Gemini. The prompt includes:
  1. System instructions telling Gemini it's a job extraction assistant that should return only valid JSON
  2. The full output format specification listing all common fields (category, title, description, location_type, specific_location, urgency, complexity, estimated_duration_minutes, problem_type, key_details) and all category-specific fields for each of the 5 categories (painting, electrical, plumbing, hvac, general)
  3. The user's input wrapped in `<user_input>` XML tags for prompt injection mitigation — Gemini is instructed to treat content within these tags strictly as data to extract from, never as instructions
  4. If input exceeds `MAX_INPUT_LENGTH`, it is truncated with a `[...truncated due to length...]` marker

  Called by `JobExtractor.extractFromText()` to build the prompt before sending to the Gemini extraction client.

### `application/extraction/job-extractor.ts`

Core extraction logic class. Ports the Python `JobExtractor` class from `server/conversation_pipeline.py`. Responsible for calling Gemini, parsing the JSON response, and validating against Zod schemas.

**Interfaces:**
- `GeminiExtractionClient` — `{ generateContent(prompt: string): Promise<string> }`. The contract for the infrastructure-layer Gemini client. Implemented by `GeminiExtractionClientImpl` in `gemini-extraction-client.ts`. Injected via constructor so the extraction logic is decoupled from the HTTP/SDK details.
- `JobExtractorDeps` — `{ extractionClient: GeminiExtractionClient, logger?: Logger }`. Constructor dependencies.
- `ExtractionResult` — `{ job: Job | BaseJob, schemaUsed: 'category_specific' | 'base' }`. Return type indicating which schema validated successfully. Consumed by `JobSummaryTracker` to log which schema was used.

**Class: `JobExtractor`**

**Constructor:** receives `JobExtractorDeps`. Stores the extraction client and logger (falls back to the global `logger` singleton if not provided). Created by `JobSummaryTracker` in its constructor.

**Methods:**
- `extractFromText(text: string): Promise<ExtractionResult | null>` — the main extraction method. Records `startTime`, calls `buildExtractionPrompt(text)` to build the prompt, sends it via `extractionClient.generateContent()`, parses the raw response via `safeJsonParse()`, validates via `validateWithFallback()`, and logs structured observability data `{ operation: 'job_extraction', durationMs, success, category, schemaUsed }`. Returns `null` if any step fails (parse error, validation error, or caught exception). Called by `JobSummaryTracker.extractFromNote()`.

- `safeJsonParse(raw: string): unknown` (private) — handles Gemini's tendency to wrap JSON in markdown code blocks. Steps: (1) tries to match `` ```json ... ``` `` or `` ``` ... ``` `` via regex, extracts the inner content; (2) falls back to trying `JSON.parse` on the trimmed raw string. Returns `null` on parse failure and logs a debug message with the first 200 chars of the raw response.

- `validateWithFallback(data: unknown): ExtractionResult | null` (private) — two-tier validation strategy mirroring Python's `_validate_job`:
  1. **First try:** `JobSchemas.union.safeParse(data)` — validates against `z.discriminatedUnion('category', [...])` which routes to the correct category-specific schema (PaintingJob, ElectricalJob, etc.). If successful, returns `{ job, schemaUsed: 'category_specific' }`.
  2. **Second try (fallback):** `JobSchemas.base.safeParse(data)` — validates against `BaseJobSchema` (common fields only). If successful, returns `{ job, schemaUsed: 'base' }`. This catches cases where category-specific fields are missing or malformed but the core job data is still usable.
  3. Returns `null` if both fail, logging the Zod error issues at debug level.

### `application/extraction/job-summary-tracker.ts`

Orchestrator class. Ports the Python `JobSummaryTracker` from `server/conversation_pipeline.py`. Implements the `JobSummaryService` interface, meaning it is the class that `NotesHandler` calls when a note is saved.

**Interfaces:**
- `BlobStorage` — `{ uploadJobSchema(jobData: Record<string, unknown>, filename?: string): Promise<string | null> }`. Abstraction for Azure blob storage. The `AzureBlobStorage` stub from `infrastructure/azure/` satisfies this. If no blob storage is provided, a default no-op implementation is used that logs a debug message and returns `null`.
- `JobSummaryTrackerDeps` — `{ logger?, extractionClient?, blobStorage?, outputDir? }`. All optional — sensible defaults are used for each.

**Constants:**
- `DEFAULT_OUTPUT_DIR` — `'conversation_data'`. Used when neither `deps.outputDir` nor `JOB_OUTPUT_DIR` env var is set.

**Class: `JobSummaryTracker` implements `JobSummaryService`**

**Constructor:** receives `JobSummaryTrackerDeps` (all optional). Initializes:
- `log` — pino logger (falls back to global singleton)
- `blobStorage` — uses provided instance or creates a no-op default
- `outputDir` — resolved via `deps.outputDir` → `config.JOB_OUTPUT_DIR` → `DEFAULT_OUTPUT_DIR`, then `path.resolve(process.cwd(), ...)` to get an absolute path
- `jobExtractor` — creates a new `JobExtractor` instance, injecting the extraction client (provided or created via `createGeminiExtractionClient({ model: config.EXTRACTION_MODEL })`) and the logger

Created by `createJobExtractor()` in `composition-root.ts`.

**Methods:**
- `extractFromNote(sessionId, title, description, details): Promise<string | null>` — the main orchestration method, implementing the `JobSummaryService` interface. Steps:
  1. Generates a `jobId` via `crypto.randomUUID()`
  2. Calls `buildTextFromNote()` to combine title, description, details into a single text block
  3. Calls `jobExtractor.extractFromText(text)` to get the structured `ExtractionResult`
  4. If no result, logs a warning and returns `null`
  5. Merges `session_id` and `job_id` into the extracted job data
  6. Calls `saveLocally(jobData, jobId)` to write a JSON file to `outputDir`
  7. Calls `blobStorage.uploadJobSchema(jobData, filename)` to upload to Azure (always called — the stub logs when disabled)
  8. Returns `jobId` on success, `null` on any caught error (errors are logged with `{ sessionId, jobId }` context but never thrown)

  Called by `NotesHandler.saveNote()` (fire-and-forget with `.catch()`).

- `buildTextFromNote(title, description, details): string` (private) — combines note components into a text block formatted as `Title: ...\n\nDescription: ...\n\nDetails:\n- detail1\n- detail2`. Empty details array is omitted.

- `saveLocally(jobData, jobId): Promise<string>` (private) — creates `outputDir` if it doesn't exist (`fs.mkdir` with `recursive: true`), generates filename via `getFilename(jobId)`, performs path traversal check (`resolvedPath.startsWith(resolvedDir)`), writes JSON with 2-space indentation via `fs.writeFile`. Returns the filepath.

- `getFilename(jobId): string` (private) — returns `job_{jobId}.json`. Used by both `saveLocally()` and the Azure upload call to produce consistent filenames.

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

Concrete WebSocket gateway that extends `base-ws-server.ts`. Handles real-time bidirectional audio streaming, routes messages, and wires Gemini client events to WebSocket messages.

**Dependencies:** `StreamingGatewayDeps` — `sessionManager: SessionManager`, `mediaForwarder: MediaForwarder`, `notesHandler: NotesHandler`

**Configuration:** `StreamingGatewayConfig` — `host`, `port`, optional `maxPayload`, `maxConnections`, `maxMessagesPerSecond`

**Constants:**
- `SESSION_INDEPENDENT_TYPES` — a `Set<string>` containing `'get_notes'` and `'delete_note'`, identifying message types that only need database access and not a Gemini session

**`processConnection(connectionId, socket)`** — called per new WebSocket connection:
1. Creates a streaming session via `sessionManager.createSession(connectionId)`
2. Gets the Gemini client via `sessionManager.getClient(connectionId)`
3. Connects to Gemini Live API via `client.connect(session.sessionId, session.userId)`
4. Sends the `INITIAL_GREETING` text to Gemini via `client.sendText()`
5. Wires up Gemini event callbacks:
   - `onAudio` → forwards base64-encoded audio to the WebSocket client
   - `onTranscript` → sends `user_transcript` (for user speech) or `text` (for agent speech) to the client
   - `onTurnComplete` → sends `turn_complete` with `session_id`
   - `onInterrupted` → sends `interrupted` message
   - `onToolCall` → validates tool call args with `SaveNoteArgsSchema`, calls `notesHandler.saveNote()`, sends updated `notes_list`, and calls `event.respond()` with success/failure back to Gemini
6. Sends a `ready` message to the frontend
7. Sets up a message handler on the socket
8. Waits for socket close, then disconnects the Gemini client via `sessionManager.disconnect()`

**`handleMessage(connectionId, msg)`** — routes client messages by type:
- **Session-independent** (checked first via `SESSION_INDEPENDENT_TYPES` set):
  - `get_notes` → `notesHandler.getNotes()` then sends `notes_list` response
  - `delete_note` → validates `msg.data`, calls `notesHandler.deleteNote()`, then sends updated `notes_list`
- **Session-dependent** (requires active session and Gemini client; sends `error` if missing):
  - `audio` → `mediaForwarder.forwardAudio()`
  - `text` → `mediaForwarder.forwardText()`
  - `image` → `mediaForwarder.forwardImage()`
  - `end` → `mediaForwarder.forwardEndTurn()`
  - `video`, `video_file`, `update_note`, `generate_summary` → logs warning (not implemented)

**`handleMessageError(connectionId, err)`** — categorizes errors by type (`ValidationError`, `ExternalApiError`, generic `Error`), sends an error message to the client, and records failures for health tracking when appropriate.

**`stop()`** — calls `sessionManager.disconnectAll()` before the base class `stop()`.

---

## `infrastructure/gemini/`

Concrete implementations for Google Gemini AI integration.

### `infrastructure/gemini/gemini-live-service.ts`

The core Gemini Live API client implementation. Implements the `GeminiLiveClient` interface using the `@google/genai` SDK directly (not ADK, which doesn't support live mode).

**Configuration:** `GeminiLiveServiceConfig` — model name, voice, system instruction, session ID.

**Factory:** `createGeminiLiveClient(config)` — creates and returns a new `GeminiLiveServiceImpl` instance. Called by the factory function returned from `createGeminiClientFactory()` in `composition-root.ts`.

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

**Media methods:** `sendAudio()` (PCM via `sendRealtimeInput`), `sendText()` (via `sendClientContent`), `sendImage()` (inline data via `sendClientContent`), `sendVideo()` (sends a placeholder text message), `endTurn()` (sends `turnComplete: true`)

**Event registration:** `onAudio()`, `onTranscript()`, `onTurnComplete()`, `onInterrupted()`, `onToolCall()` — each pushes a callback to the respective handler array. These are wired up by `StreamingGateway.processConnection()`.

**Transcript deduplication:**
- Three separate accumulators: `accumulatedModelText`, `accumulatedTranscriptionText`, `accumulatedInputText`
- `emitTranscriptDelta()` checks if new text extends the accumulated prefix; if so, only the delta is emitted. If not (Gemini restarted), the full text is emitted and the accumulator resets.
- `modelTurnHadText` flag prevents duplicate agent text when both `modelTurn.text` and `outputTranscription` fire in the same turn.

**`disconnect()`:** closes the live session, nulls the AI instance, clears all handler arrays.

### `infrastructure/gemini/gemini-extraction-client.ts`

REST API client for non-streaming Gemini content generation. Used exclusively by the job extraction pipeline to send extraction prompts and receive structured JSON responses.

**Interfaces:**
- `GeminiExtractionConfig` — `{ model: string }`. Passed to the factory function.
- `GeminiExtractionClient` — `{ generateContent(prompt: string): Promise<string> }`. The public interface consumed by `JobExtractor` via dependency injection. Defined here and re-exported via `job-extractor.ts`.

**Factory function:**
- `createGeminiExtractionClient(config: GeminiExtractionConfig): GeminiExtractionClient` — reads `STANDARD_API_TIMEOUT_MS` and `STANDARD_API_MAX_RETRIES` from `getConfig()`, then creates a `GeminiExtractionClientImpl` with the model name, timeout, and retry count. Called by `JobSummaryTracker` constructor when no extraction client is provided via deps.

**Class: `GeminiExtractionClientImpl` (private, implements `GeminiExtractionClient`)**

**State:**
- `model` — Gemini model name (e.g., `gemini-2.0-flash`)
- `timeoutMs` — request timeout from config (default 60000)
- `maxRetries` — max retry attempts from config (default 3)
- `ai` — lazily initialized `GoogleGenAI` instance (same auth branching as `gemini-live-service.ts`: Vertex AI with project/location, or API key, or empty)
- `TRANSIENT_ERROR_CODES` — `[429, 503, 504]` for retry eligibility

**Methods:**
- `generateContent(prompt: string): Promise<string>` — the main API call. Loops up to `maxRetries + 1` attempts. Each attempt calls `client.models.generateContent()` with the prompt as a user message, extracts text from the response via `extractText()`. On transient errors, backs off exponentially (`2^attempt * 1000` ms) and retries. On non-retryable errors or max retries exceeded, throws `ExternalApiError` with the last error as cause. Called by `JobExtractor.extractFromText()`.

- `getClient(): GoogleGenAI` (private) — lazy initialization of the `GoogleGenAI` SDK instance. Uses the same Vertex AI / API key branching logic as `gemini-live-service.ts`. The client is created once and reused for all subsequent calls.

- `extractText(response): string` (private) — navigates the `@google/genai` response structure (`response.candidates[0].content.parts`) and concatenates all text parts into a single string. Returns empty string if no candidates/parts found.

- `isRetryableError(error): boolean` (private) — checks if the error message contains any of the `TRANSIENT_ERROR_CODES` (429, 503, 504) or timeout-related strings (`'timeout'`, `'ETIMEDOUT'`). Returns `true` for retryable errors, `false` otherwise.

- `sleep(ms): Promise<void>` (private) — simple `setTimeout` wrapper for exponential backoff delays.

### `infrastructure/gemini/gemini-tools.ts`

Legacy tool abstraction layer. Provides a factory pattern for creating tool objects. Not actively used by the live service (which defines tools inline in `gemini-live-service.ts` and handles tool calls via `onToolCall`), but kept for potential use by future non-live API integrations.

**Schemas:**
- `SaveNoteArgsSchema` — Zod schema: `{ title: string, description: string, details: string[], note_id?: string }`. Duplicated from the gateway (also defined in `streaming.gateway.ts`). **Note:** This is dead code per issue #14 / #11.

**Interfaces:**
- `ToolDeps` — `{ notesRepository: NotesRepository, jobExtractor: JobSummaryService, getNotes: () => unknown, sessionId: string }`. Uses `JobSummaryService` (updated from original `JobExtractor` interface name).
- `Tool` — `{ name: string, description: string, execute(input): Promise<unknown> }`

**Factory functions:**
- `createSaveNoteTool(deps: ToolDeps): Tool` — creates a tool that validates input with Zod (`SaveNoteArgsSchema`), saves to `deps.notesRepository.saveNote()`, fires async `deps.jobExtractor.extractFromNote()` with `.catch()`, and returns the saved note.
- `createTools(deps: ToolDeps): Tool[]` — returns `[createSaveNoteTool(deps)]`.

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
- `saveNote(title, description, details, noteId?)` — generates an ID if not provided (`note_{timestamp}_{random}`). Checks if the note exists: updates if yes, inserts if no. `details` is stored as a JSON string. Called by `NotesHandler.saveNote()` and `gemini-live-service.ts` tool call handler.
- `deleteNote(noteId)` — `DELETE WHERE id = ?` (parameterized). Called by `NotesHandler.deleteNote()`.
- `getNotes()` — `SELECT * ORDER BY created_at DESC`, parses `details` from JSON string back to array. Called by `NotesHandler.getNotes()`.
- `getNote(noteId)` — `SELECT WHERE id = ?`, parses details.
- `close()` — closes the database connection. Called during graceful shutdown.

All queries use parameterized statements to prevent SQL injection.

---

## `infrastructure/azure/`

Azure Blob Storage integration (stub).

### `infrastructure/azure/azure-blob-storage.ts`

Stub implementation of Azure Blob Storage operations. All methods are no-ops that log to console and return null/empty values. Placeholder for full Azure integration. Satisfies the `BlobStorage` interface defined in `job-summary-tracker.ts`.

**Constructor:** sets `initialized = true` immediately (no real connection). Created by `createJobExtractor()` in `composition-root.ts` and passed to `JobSummaryTracker`.

**Methods (all stubs):**
- `waitForInit()` — no-op
- `ensureContainer()` — no-op
- `uploadJobSchema(jobData, filename?)` — returns `null`. Called by `JobSummaryTracker.extractFromNote()` after local save — always called regardless of Azure configuration, so when a real implementation is provided, it will work without any integration changes.
- `uploadVoiceNote(noteData, filename?)` — returns `null`
- `isInitialized()` — returns `true`
- `listJobSchemas()` — returns `[]`
- `getJobSchemaById(jobId)` — returns `null`
- `deleteJobSchemaById(jobId)` — returns `0`
- `uploadTranscript(transcriptText, sessionId)` — returns `null`
- `uploadMedia(buffer, filename, mimeType)` — returns `null`
