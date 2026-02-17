# TypeScript Migration Plan (Python `server/` -> `new-server-ts/`)

## Goal
Keep the current Python implementation in `server/` unchanged, and create a new TypeScript implementation in a new root-level folder: `new-server-ts/` (outside both `server/` and `server-ts/`). Ignore `server-ts/`, `PACKAGE-STRUCTURE.md`, `WORKSPACE-SETUP.md`, and `README.md`. Build this as a production-ready private package for later monorepo use.

## Guiding Constraints
1. KISS: one runtime (`Node.js`), one transport (`WebSocket`), one validation approach (`zod`).
2. DRY: shared schema/constants/message contracts across both streaming services.
3. SOLID: isolate domain models, application use-cases, and infrastructure adapters.
4. Production-ready: typed config validation, structured logging, graceful shutdown, tests, and deterministic build output.
5. Anti-Patterns: Make sure that there

## Migration Plan

### 1. Define target package and boundaries
1. Create a new root-level folder `new-server-ts/` with no dependency on current `server-ts/`.
2. Preserve `server/` as-is; do not delete, move, or modify Python runtime behavior as part of this migration.
3. Expose a small public API:
   1. `createStreamingService()`
   2. `createNotesStreamingService()`
   3. `createJobSummaryTracker()`
4. Keep framework-agnostic core logic; only WebSocket server lives in transport layer.

### 2. Build TypeScript project skeleton
1. Add under `new-server-ts/`:
   1. `new-server-ts/src/index.ts`
   2. `new-server-ts/src/config/`
   3. `new-server-ts/src/domain/`
   4. `new-server-ts/src/application/`
   5. `new-server-ts/src/infrastructure/`
   6. `new-server-ts/src/transport/ws/`
   7. `new-server-ts/src/shared/`
2. Tooling:
   1. `typescript` (strict mode)
   2. `tsup` for build (`cjs` + `esm` + `.d.ts`)
   3. `vitest` for unit tests
   4. `eslint` + `prettier`
3. Output: `new-server-ts/dist/`, with clean exports map for private package consumption.

### 3. Port configuration and runtime bootstrap first
1. Replace `server/core_utils.py` env handling with:
   1. `src/config/env.ts` (`zod`-validated env)
   2. `src/shared/constants.ts` (sample rates, default host/ports, instructions)
2. Add startup lifecycle:
   1. start
   2. stop
   3. graceful SIGINT/SIGTERM shutdown
3. Add structured logger (`pino`) with correlation fields (`sessionId`, `connectionId`).

### 4. Port and normalize domain schemas
1. Convert `server/schema.py` + `server/subjob_schema.py` to `zod` schemas and TS inferred types:
   1. enums
   2. base job
   3. specialized jobs
   4. detailed subjobs union
2. Keep compatibility with current field names for zero-friction migration.
3. Add schema unit tests for valid and invalid payloads.

### 5. Port persistence adapters
1. Notes DB (`server/database.py`):
   1. adapter interface: `NotesRepository`
   2. sqlite implementation (`better-sqlite3`), prepared statements
   3. methods: `init`, `save`, `update`, `delete`, `list`
2. File storage for extracted jobs and voice notes:
   1. `conversation_data/` and `voice_notes_data/` adapters
3. Azure Blob wrapper (`server/blob_storage.py`) as optional adapter with interface:
   1. `uploadJobSchema`, `uploadTranscript`, `uploadImage`, `uploadVideo`
4. Keep local-first behavior if cloud adapter not configured.

### 6. Port conversation extraction pipeline
1. Convert `server/conversation_pipeline.py` into:
   1. `JobExtractor` (LLM prompt + parse + validate)
   2. `JobSummaryTracker` (orchestration + save + optional blob upload)
2. Keep two-step extraction flow:
   1. category identify
   2. detailed extraction
3. Harden parsing:
   1. strict JSON extraction
   2. robust error typing
   3. fallback behavior with clear logs
4. Add unit tests for parser/validator with fixture responses.

### 7. Port WebSocket services
1. Implement shared `BaseWsServer` equivalent for connection lifecycle.
2. Port `StreamingService` (`server/streaming_service.py`) with separated concerns:
   1. message intake/parsing
   2. audio/video/image handlers
   3. ADK live session bridge
   4. tool callbacks (`save_note_tool`)
3. Port `NotesStreamingService` (`server/notes_streaming_service.py`) similarly with explicit turn state machine.
4. Define typed client/server message contracts in one place (`src/shared/ws-messages.ts`).

### 8. Integrate ADK/Gemini adapters cleanly
1. Wrap ADK-specific calls behind interfaces so transport/service code is not vendor-coupled.
2. Keep one adapter for live streaming session and one for non-live extraction.
3. Ensure retries/timeouts and cancellation support for disconnects.

### 9. Production hardening
1. Error taxonomy:
   1. validation errors
   2. external API errors
   3. persistence errors
2. Add backpressure limits for queues and max payload checks.
3. Add health and readiness hooks (at minimum internal status API or exported status function).
4. Add security checks:
   1. payload size limits
   2. MIME allowlist
   3. safe file naming
5. Add observability:
   1. structured logs
   2. key metrics counters (connections, tool calls, failures)

### 10. Testing strategy (minimum production baseline)
1. Unit tests:
   1. schema validation
   2. DB repository
   3. JSON extraction/parse
   4. WS message codec
2. Integration tests:
   1. websocket connect/send/receive happy path
   2. note save/update/delete flow
   3. extraction pipeline save flow
3. Smoke test script for local run in CI.

### 11. CI and release readiness
1. CI steps:
   1. typecheck
   2. lint
   3. test
   4. build
2. Package metadata for private monorepo use:
   1. correct `exports`
   2. no side-effect surprises
   3. pinned runtime engine (`node >=20`)
3. Versioning strategy: semantic versioning from day 1.

## File-by-file migration map (Python -> TypeScript)
1. `server/core_utils.py` -> `new-server-ts/src/config/env.ts`, `new-server-ts/src/shared/constants.ts`, `new-server-ts/src/transport/ws/base-ws-server.ts`
2. `server/schema.py` -> `new-server-ts/src/domain/job/base-job.schema.ts`
3. `server/subjob_schema.py` -> `new-server-ts/src/domain/job/subjob.schema.ts`
4. `server/database.py` -> `new-server-ts/src/infrastructure/persistence/sqlite/notes.repository.ts`
5. `server/blob_storage.py` -> `new-server-ts/src/infrastructure/storage/azure/azure-blob-storage.ts`
6. `server/conversation_pipeline.py` -> `new-server-ts/src/application/extraction/job-extractor.ts`, `new-server-ts/src/application/extraction/job-summary-tracker.ts`
7. `server/streaming_service.py` -> `new-server-ts/src/application/streaming/streaming-service.ts`, `new-server-ts/src/transport/ws/streaming.gateway.ts`
8. `server/notes_streaming_service.py` -> `new-server-ts/src/application/streaming/notes-streaming-service.ts`, `new-server-ts/src/transport/ws/notes.gateway.ts`
9. `server/__init__.py` -> `new-server-ts/src/index.ts`

## Execution order (recommended)
1. Skeleton + config + logger
2. Schemas + tests
3. Persistence adapters
4. Extraction pipeline
5. Notes streaming service
6. Main streaming service
7. Hardening + integration tests + CI

## Definition of done
1. New TS package in `new-server-ts/` builds cleanly and exports only intended public API.
2. Feature parity with `server/` for:
   1. notes CRUD
   2. voice notes capture
   3. job extraction and storage
   4. transcript/media upload hooks
3. Test suite passes with meaningful coverage on core flows.
4. Service can run locally with env validation and graceful shutdown.
5. `server/` remains intact and functional, with no dependency on `server-ts/` and no reliance on ignored docs.
