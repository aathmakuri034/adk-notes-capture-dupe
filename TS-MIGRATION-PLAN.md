# TypeScript Migration Plan (Python `server/` -> `new-server-ts/`)

## Goal
Keep the current Python implementation in `server/` unchanged, and create a new TypeScript implementation in a new root-level folder: `new-server-ts/` (outside both `server/` and `server-ts/`). Ignore `server-ts/`, `PACKAGE-STRUCTURE.md`, `WORKSPACE-SETUP.md`, and `README.md`. Build this as a production-ready private package for later monorepo use.

## Guiding Constraints
1. KISS: one runtime (`Node.js`), one transport (`WebSocket`), one validation approach (`zod`).
2. DRY: shared schema/constants/message contracts across both streaming services.
3. SOLID: isolate domain models, application use-cases, and infrastructure adapters.
4. Production-ready: typed config validation, structured logging, graceful shutdown, tests, and deterministic build output.
5. Package manager standardization: use `pnpm` (not `npm`) for install, build, test, and CI commands.
6. No anti-patterns:
   1. no god classes/modules
   2. no circular dependencies
   3. no hidden global mutable state
   4. no copy-paste business logic across services
   5. no `any`-driven type bypasses for domain boundaries
   6. no mixed responsibilities in transport, application, and infrastructure layers

## Implementation Standards

### 1. Dependency Direction & Enforcement
1. All dependencies must point inward: transport -> application -> domain. Infrastructure implements domain-defined interfaces.
2. Add dependency-cruiser to dev dependencies with a `.dependency-cruiser.mjs` config that forbids cycles and enforces layer boundaries (`transport` cannot import from `infrastructure`, `application` cannot import from `transport`).
3. Add `eslint-plugin-import` with `no-restricted-paths` rules matching the same boundaries.
4. Add a `pnpm run check:deps` script that runs dependency-cruiser validation.
5. Include dependency validation in the CI pipeline in step 11.

### 2. Dependency Injection Strategy
1. Use pure constructor injection throughout. No service locator pattern and no container libraries.
2. Each application-layer service receives its dependencies (repositories, adapters, logger) as constructor parameters typed against domain-defined interfaces, never concrete implementations.
3. Add composition root factory functions in `src/composition-root.ts` that wire concrete implementations to interfaces.
4. `src/composition-root.ts` is the only file that may import from both application and infrastructure layers.
5. Export public API functions (`createStreamingService`, `createNotesStreamingService`, `createJobSummaryTracker`) from `src/index.ts` by delegating to the composition root.

### 3. Error Propagation Contract
1. Define a base `AppError` class in `src/shared/errors.ts` with subclasses for each error category: `ValidationError`, `ExternalApiError`, `PersistenceError`, `TransportError`.
2. Domain and application layers throw only `AppError` subclasses, never raw `Error` or untyped exceptions.
3. Infrastructure adapters catch external errors (sqlite, Azure SDK, ADK) and wrap them in the appropriate `AppError` subclass before re-throwing.
4. Transport layer (WS gateways) is the only layer that catches errors for client-facing responses.
5. Transport maps `AppError` subclasses to structured error messages sent to the client and logs the full error via the structured logger.
6. Never swallow errors silently. All catch blocks must either re-throw, log and re-throw, or log and return a typed error response.

### 4. ESLint Strictness Baseline
1. Use `@typescript-eslint/strict-type-checked` and `@typescript-eslint/stylistic-type-checked` as base configs.
2. Enable at minimum these rules as errors:
   1. `@typescript-eslint/no-explicit-any`
   2. `@typescript-eslint/no-floating-promises`
   3. `@typescript-eslint/strict-boolean-expressions`
   4. `@typescript-eslint/consistent-type-imports`
   5. `@typescript-eslint/no-unused-vars` (with underscore exception)
   6. `@typescript-eslint/no-misused-promises`
3. Add `eslint-plugin-import` rules:
   1. `import/no-cycle`
   2. `import/no-self-import`
   3. `import/no-restricted-paths` (configured per subsection 1)
4. Zero lint warnings policy: treat all warnings as errors in CI.

### 5. ESM Compatibility Requirements
1. Use `"type": "module"` in `package.json`.
2. All internal imports must include the `.js` extension (e.g., `import { config } from './config.js'`). This is required for TypeScript + Node ESM compatibility.
3. Ensure all config files (tsup, eslint, prettier, dependency-cruiser) use `.mjs` extension or are ESM-compatible.

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
3. Package manager and scripts (`pnpm`):
   1. Install deps with `pnpm install`
   2. Run dev/build/test/lint with `pnpm run <script>`
   3. Ensure `packageManager` field is set in `new-server-ts/package.json` (example: `pnpm@<version>`)
4. Output: `new-server-ts/dist/`, with clean exports map for private package consumption.

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
   1. `pnpm install --frozen-lockfile`
   2. `pnpm run typecheck`
   3. `pnpm run lint`
   4. `pnpm run test`
   5. `pnpm run build`
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
1. Step 1: Foundation + config + main streaming service
   1. Create `new-server-ts/` skeleton, tooling, and `pnpm` scripts
   2. Implement `env` validation, constants, logger, base WS server, composition root
   3. Implement `StreamingService` transport/application flow with typed WS messages
   4. Exit criteria: service starts, accepts WS connection, and basic message loop works
2. Step 2: Conversation extraction domain and pipeline
   1. Implement base schema and subjob schema in `zod`
   2. Implement extraction pipeline (`JobExtractor`, `JobSummaryTracker`) and validation flow
   3. Implement job file persistence for extracted outputs
   4. Exit criteria: text input -> validated structured job output -> saved artifact
3. Step 3: Notes streaming service and notes persistence
   1. Implement `NotesStreamingService` turn lifecycle
   2. Implement notes repository (SQLite) and voice note file storage
   3. Wire tool callback flows for save/list/update/delete notes
   4. Exit criteria: notes WS flow is end-to-end functional with persistence
4. Step 4: Infrastructure adapters and cloud integrations
   1. Implement Azure blob adapter and optional upload hooks (transcript/media/schema)
   2. Implement ADK/Gemini adapters behind interfaces
   3. Ensure infra errors are wrapped into `AppError` subclasses
   4. Exit criteria: integrations are optional, pluggable, and resilient
5. Step 5: Architecture enforcement and quality gates
   1. Add dependency-cruiser rules and `pnpm run check:deps`
   2. Add strict ESLint rules and zero-warning policy
   3. Add unit tests for schemas, repositories, parser, and message contracts
   4. Exit criteria: lint/typecheck/dependency checks pass locally
6. Step 6: Integration testing, hardening, and CI
   1. Add integration tests for both WS services and extraction/persistence flows
   2. Add backpressure, payload limits, graceful shutdown, and observability checks
   3. Finalize CI pipeline (`pnpm install`, `check:deps`, typecheck, lint, test, build)
   4. Exit criteria: all CI checks pass and package is release-ready for monorepo adoption

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
6. All `new-server-ts/` build/test/lint/typecheck workflows run via `pnpm`.
