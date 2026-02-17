# Package Structure: server-ts

This document explains what makes `server-ts` a proper npm package that can be installed and used by others.

## Key Package Indicators

### 1. **package.json** - The Package Definition File

Located at: `server-ts/package.json`

**Key fields that make it a package:**

```json
{
  "name": "adk-notes-capture-server",
  "version": "1.0.0",
  "description": "TypeScript WebSocket server for voice-enabled job intake and notes capture using Google Gemini Live API",
  "type": "module",
  "private": true,

  // 👇 DEFINES PUBLIC API - What users can import
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./streaming-service": { ... },
    "./notes-streaming-service": { ... },
    "./database": { ... },
    // ... 11 total export paths
  },

  // 👇 DEFINES WHAT GETS PACKAGED
  "files": [
    "dist/**/*.js",
    "dist/**/*.d.ts",
    "dist/**/*.d.ts.map",
    "dist/**/*.js.map",
    "README.md"
  ],

  // 👇 BUILD AND RUN SCRIPTS
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit",
    "start:jobs": "tsx src/streaming-service.ts",
    "start:notes": "tsx src/notes-streaming-service.ts"
  },

  // 👇 PACKAGE METADATA
  "keywords": ["websocket", "gemini", "voice", ...],
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**What this means:**
- `name`: The package name users install (`npm install adk-notes-capture-server`)
- `exports`: Defines what users can import and from where
- `files`: Only these files are included when packaged (excludes `src/`, `.env`, etc.)
- `scripts`: Commands to build and run the package
- `private: true`: Prevents accidental publishing to npm

---

### 2. **exports** Field - The Public API

The `exports` field defines 11 importable paths:

| Import Path | What Users Get |
|-------------|----------------|
| `adk-notes-capture-server` | Barrel export (common utilities) |
| `.../streaming-service` | Job WebSocket service |
| `.../notes-streaming-service` | Notes WebSocket service |
| `.../database` | Database operations |
| `.../gemini-live-client` | Gemini Live API client |
| `.../conversation-pipeline` | Job extraction |
| `.../config` | Configuration |
| `.../schema` | Type definitions |
| `.../azure-blob-storage` | Azure integration |
| `.../gcs-storage` | GCS integration |
| `.../standard-gemini-client` | Standard Gemini API |

**Example usage:**
```typescript
import { getNotes } from 'adk-notes-capture-server/database';
import { startJobService } from 'adk-notes-capture-server/streaming-service';
import type { Job } from 'adk-notes-capture-server/schema';
```

---

### 3. **dist/** Directory - Compiled Output

Located at: `server-ts/dist/`

Contains **46 compiled files** (226.3 kB unpacked):

```
dist/
├── index.js                      # Barrel export (compiled)
├── index.d.ts                    # Type definitions
├── streaming-service.js          # Job service (compiled)
├── streaming-service.d.ts        # Type definitions
├── database.js                   # Database ops (compiled)
├── database.d.ts                 # Type definitions
├── schema.js                     # Schema (compiled)
├── schema.d.ts                   # Type definitions
├── *.js.map                      # Source maps for debugging
└── ... (all other modules)
```

**What gets included:**
- ✅ `.js` files (compiled JavaScript)
- ✅ `.d.ts` files (TypeScript type definitions)
- ✅ `.js.map` files (source maps)
- ✅ `.d.ts.map` files (declaration maps)

**What gets excluded:**
- ❌ `src/` directory (source code)
- ❌ `node_modules/` (dependencies)
- ❌ `.env` files (secrets)
- ❌ `notes.db` (database)
- ❌ `conversation_data/` (runtime data)

---

### 4. **src/index.ts** - Barrel Export Entry Point

Located at: `server-ts/src/index.ts`

This is the **main entry point** when users import from the package root:

```typescript
// Re-exports commonly used utilities
export { initDb, saveNote, deleteNote, getNotes, getNote } from './database.js';
export type { Note } from './database.js';
export * from './schema.js';
export { logger, validateEnvVars, PROJECT_ID, ... } from './config.js';
export { createLiveClient, GeminiLiveClient } from './gemini-live-client.js';
export { jobSummaryTracker } from './conversation-pipeline.js';
```

**Enables clean imports:**
```typescript
import { initDb, saveNote, JobCategory } from 'adk-notes-capture-server';
```

Instead of:
```typescript
import { initDb } from 'adk-notes-capture-server/dist/database.js';
```

---

### 5. **tsconfig.json** - TypeScript Build Configuration

Located at: `server-ts/tsconfig.json`

Defines how TypeScript compiles the package:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",              // Output to dist/
    "declaration": true,              // Generate .d.ts files
    "declarationMap": true,           // Generate .d.ts.map files
    "sourceMap": true,                // Generate .js.map files
    "esModuleInterop": true,
    "strict": true
  },
  "include": ["src/**/*"],            // Compile everything in src/
  "exclude": ["node_modules", "dist"]
}
```

**What this produces:**
- Compiles TypeScript → JavaScript
- Generates type definitions for TypeScript users
- Creates source maps for debugging

---

### 6. **README.md** - Package Documentation

Located at: `server-ts/README.md`

Included in the package (9.7 kB) and shown on npm if published.

**Contains:**
- Installation instructions
- Usage examples
- API documentation
- Prerequisites
- Configuration guide

---

### 7. **files** Field - Package Contents Filter

The `"files"` field in package.json controls what gets packaged:

```json
"files": [
  "dist/**/*.js",
  "dist/**/*.d.ts",
  "dist/**/*.d.ts.map",
  "dist/**/*.js.map",
  "README.md"
]
```

**When someone runs `npm install adk-notes-capture-server`:**
- They get ONLY these files (54.7 kB compressed, 226.3 kB unpacked)
- They do NOT get `src/`, `.env`, databases, etc.

---

## Package Workflow

### 1. **Development** (What developers work on)
```
server-ts/
├── src/              👈 Source TypeScript code
├── package.json      👈 Package configuration
├── tsconfig.json     👈 Build configuration
└── .env              👈 Local secrets (not packaged)
```

### 2. **Build** (Compile TypeScript → JavaScript)
```bash
npm run build
```
Produces:
```
server-ts/
└── dist/             👈 Compiled output
    ├── *.js          (JavaScript)
    ├── *.d.ts        (Type definitions)
    └── *.map         (Source maps)
```

### 3. **Package** (What gets distributed)
```bash
npm pack
```
Creates `adk-notes-capture-server-1.0.0.tgz` containing:
```
adk-notes-capture-server/
├── dist/             👈 All compiled files
│   ├── index.js
│   ├── index.d.ts
│   ├── streaming-service.js
│   └── ... (all other modules)
├── README.md         👈 Documentation
└── package.json      👈 Metadata
```

### 4. **Installation** (What users get)
```bash
npm install adk-notes-capture-server
```
Installs to:
```
node_modules/
└── adk-notes-capture-server/
    ├── dist/         👈 Compiled code
    ├── README.md
    └── package.json
```

### 5. **Usage** (How users import)
```typescript
import { getNotes } from 'adk-notes-capture-server/database';
```
Resolves to:
```
node_modules/adk-notes-capture-server/dist/database.js
```

---

## How npm Knows What to Include

### The `files` Field Strategy

**Without `files` field:** npm includes everything (❌ bloated)
**With `files` field:** npm includes only specified patterns (✅ optimized)

```json
"files": [
  "dist/**/*.js",      // All JavaScript
  "dist/**/*.d.ts",    // All TypeScript definitions
  "dist/**/*.d.ts.map",// All declaration maps
  "dist/**/*.js.map",  // All source maps
  "README.md"          // Documentation
]
```

**Automatically included** (even without `files` field):
- `package.json`
- `README.md` (if exists)
- `LICENSE` (if exists)

**Always excluded** (npm defaults):
- `node_modules/`
- `.git/`
- `*.log`
- Files in `.npmignore` or `.gitignore`

---

## Verification Commands

### See what will be packaged:
```bash
npm pack --dry-run
```

### Create actual package file:
```bash
npm pack
# Creates adk-notes-capture-server-1.0.0.tgz
```

### Extract and inspect:
```bash
tar -tzf adk-notes-capture-server-1.0.0.tgz | head -20
```

### Test installation locally:
```bash
npm install ./adk-notes-capture-server-1.0.0.tgz
```

---

## Summary: What Makes It a Package

| Feature | Location | Purpose |
|---------|----------|---------|
| **name** | package.json | Package identifier |
| **version** | package.json | Semantic versioning |
| **exports** | package.json | Public API definition |
| **files** | package.json | What gets distributed |
| **dist/** | server-ts/dist/ | Compiled output |
| **src/index.ts** | server-ts/src/ | Barrel export |
| **README.md** | server-ts/ | Documentation |
| **tsconfig.json** | server-ts/ | Build configuration |
| **Build script** | package.json | Compile command |

The combination of these elements makes `server-ts` a **fully-packaged, installable npm module** that others can use in their projects.
