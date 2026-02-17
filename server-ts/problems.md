# Code Review: @vcmach/adk-notes-capture-server

## Critical: Global Mutable State & Singletons

### 1. Config module (`config.ts`) — Mutable `export let` bindings ~~are a footgun~~ FIXED

~~Lines 39-55 declare 17 mutable `export let` variables. While the comment says "ESM live bindings," this pattern breaks when TypeScript or bundlers compile imports to CommonJS-style destructuring — consumers silently read stale pre-`loadEnv()` values.~~

**Status: Fixed.** Replaced with a single `export const config = readEnv()` object. `loadEnv()` now uses `Object.assign(config, readEnv())`. All consumer files updated to use `config.*` property access.

---

### 2. Multiple competing Azure storage singletons

Three separate lazy singletons for `AzureBlobStorage` exist:

| File | Variable | Line |
|------|----------|------|
| `streaming-service.ts` | `_azureStorage` | 47 |
| `notes-streaming-service.ts` | `_azureBlobStorage` | 22 |
| `conversation-pipeline.ts` | `this.blobStorage` (inside `JobSummaryTracker`) | 790 |

Each creates its own `new AzureBlobStorage()` independently. This means:
- Three separate Azure connections initialized concurrently at startup
- `ensureContainer()` is only called from `JobSummaryTracker` (line 801), not from the other two — meaning the other two assume the container already exists
- If `AZURE_STORAGE_CONNECTION_STRING` reads the stale pre-`loadEnv()` value (see issue #1), all three instances silently disable themselves

**Status: Fixed.** Consolidated into a single shared singleton in `azure-blob-storage-singleton.ts`. All three files now import `getAzureBlobStorage()` from the singleton module. `ensureContainer()` is chained after init in the singleton. `JobSummaryTracker` no longer manages its own `blobStorage` or `azureReady` fields. 

---

### 3. Global `db` singleton in `database.ts` — no concurrency guard

`database.ts:7`: `let db: Database.Database | null = null;`

- `getDb()` (line 19) calls `initDb()` if `db` is null, but `initDb()` unconditionally creates a new database instance, discarding any existing one. If two calls race (e.g., a WebSocket handler and a tool call), you could get two `Database` instances, with only the last one stored in `db`.
- `closeDb()` sets `db = null`, but nothing prevents another concurrent request from calling `getDb()` immediately after, re-opening the database. There's no lifecycle management.

**Status: Fixed.** Added `if (db) return;` guard to `initDb()`, making it idempotent and preventing connection leaks on double-init.

---

### 4. Global `_tracker` singleton (`conversation-pipeline.ts:919`)

`getJobSummaryTracker()` lazily creates a `JobSummaryTracker`. The constructor immediately creates a `new AzureBlobStorage()` and starts an async init chain (lines 797-811). If the first call to `getJobSummaryTracker()` happens before `loadEnv()`, the Azure storage initializes with an empty connection string and silently disables itself — permanently, since the singleton is never re-created.

**Status: Fixed.** `JobSummaryTracker` no longer creates its own `AzureBlobStorage`. Constructor only creates `JobExtractor`. Azure access uses the shared singleton from `azure-blob-storage-singleton.ts` (see issue #2 fix).

---

## High: Logic Bugs

### 5. `saveTranscriptTurn` missing `await` (`streaming-service.ts:88`)

```typescript
ensureTranscriptsDir();  // Missing `await`!
```

`ensureTranscriptsDir()` returns a `Promise<void>` but is not awaited. The subsequent `fs.promises.appendFile` on line 108 could fail with `ENOENT` if the directory hasn't been created yet (first call). Same issue at `streaming-service.ts:129` in `saveMedia`.

**Status: Fixed.** Added `await` to both `ensureTranscriptsDir()` calls in `saveTranscriptTurn()` and `saveMedia()`.

---

### 6. `connectionId = Date.now()` collision risk (`streaming-service.ts:651`, `notes-streaming-service.ts:355`)

Two connections arriving within the same millisecond will get the same `connectionId`, causing the second to overwrite the first in `activeConnections`. Use `uuidv4()` (already imported) instead.

**Status: Fixed.** Replaced `Date.now()` with `uuidv4()` in both `streaming-service.ts` and `notes-streaming-service.ts`. Map types updated from `Map<number>` to `Map<string>`.

---

### 7. `handleClientMessage` fire-and-forget (`streaming-service.ts:678-679`)

```typescript
ws.on('message', (message: Buffer) => {
  handleClientMessage(connection, message.toString());
});
```

`handleClientMessage` is `async` but its returned promise is never awaited or caught. If it throws, the rejection becomes an unhandled promise rejection. Same pattern at `notes-streaming-service.ts:383-384`.

---

### 8. `saveNote` duplicate detection is fragile (`database.ts:76-83`)

Only compares against the **most recent** note. If the LLM calls `save_note` twice rapidly with the same data, and another note was saved in between, the duplicate check fails. Also, `JSON.parse(row.details)` will throw if `details` is null or malformed — no try/catch.

---

### 9. `schema.ts:189` — `require('crypto')` in ESM module

```typescript
const crypto = globalThis.crypto || require('crypto');
```

This package is `"type": "module"`. `require()` is not available in ESM and will throw a `ReferenceError` at runtime in Node.js ESM mode. The unused `timestamp` variable on line 188 is also dead code.

---

### 10. `validateJob` boolean coercion bug (`schema.ts:220-221`)

```typescript
hasImages: (data.has_images as boolean) || (data.hasImages as boolean) || false,
hasVideo: (data.has_video as boolean) || (data.hasVideo as boolean) || false,
```

If `has_images` is explicitly `false`, the `||` operator falls through to the next option. This means `false` values are treated as missing. Should use nullish coalescing (`??`) instead.

---

## Medium: Design Issues

### 11. `_outputDirReady` / `_notesDirReady` / `_transcriptsDirReady` flags are not safe

These boolean flags (`conversation-pipeline.ts:31`, `notes-streaming-service.ts:31`, `streaming-service.ts:56`) cache whether `mkdir` was called, but:
- If the first `mkdir` call succeeds but the directory is later deleted, the flag stays `true` and no re-creation occurs
- Multiple concurrent callers before the flag is set will all call `mkdir` simultaneously (benign with `recursive: true`, but wasteful)

---

### 12. No `ws.readyState` check before sending in `handleConnection`

`streaming-service.ts:669`: `ws.send(JSON.stringify({ type: 'ready' }))` — no check that the socket is still open. If the client disconnects immediately after connecting, this throws.

---

### 13. `conversation-pipeline.ts:710-714` — Sorting by wrong field name

`getAllJobs()` sorts by `a.createdAt` but the job data object (line 670-671) only sets `lastUpdated`, not `createdAt`. The `createdAt` field is set in `validateJob()` inside the `...job` spread — but `azure-blob-storage.ts:245` sorts by `created_at` (snake_case). The mismatch between `createdAt` and `created_at` means the Azure sort always compares empty strings.

---

### 14. Memory leak in `GeminiLiveClient` event system

`gemini-live-client.ts:433-437`: The `on()` method pushes callbacks but never provides an `off()` or cleanup mechanism. While `disconnect()` calls `this.callbacks.clear()`, if a caller registers callbacks and the client reconnects, old callbacks from previous connections would still be registered.

---

### 15. `streaming-service.ts:483` — Variable shadowing

`prompt` is declared in both the `generate_summary` case (line 474) and the `update_note` case (line 483). Since these are in separate `case` blocks without braces, this is confusing and fragile.

---

## Low: Minor Issues

### 16. Dead code in `schema.ts:188`

```typescript
const timestamp = new Date().toISOString(); // computed but never used
```

### 17. `azure-blob-storage.ts` — `transformToFrontendFormat` drift risk

The `coreFields` exclusion list (lines 39-45) must be manually kept in sync with the explicit field mappings above it. If a new field is added to one but not the other, it will either be duplicated or silently dropped.

### 18. Fragile main-module detection (`streaming-service.ts:752`)

```typescript
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
```

Does not handle symlinks or platform path differences (e.g., Windows backslash paths).

### 19. Runtime artifacts in git

`notes.db`, `transcripts/`, `conversation_data/`, `voice_notes_data/` are runtime artifacts present in the repository. These should be in `.gitignore`.
