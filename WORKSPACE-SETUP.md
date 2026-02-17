# Workspace Setup Documentation

## Overview

This monorepo uses **npm workspaces** to manage the relationship between the demo frontend and the `adk-notes-capture-server` package. This document explains the workspace setup, how it works, and how external users can install the package in their own projects.

## Table of Contents

- [Migration Summary](#migration-summary)
- [Workspace Structure](#workspace-structure)
- [For Demo Frontend Developers](#for-demo-frontend-developers)
- [For External Users](#for-external-users)
- [Troubleshooting](#troubleshooting)

---

## Migration Summary

### What Changed

We migrated from a simple file-based reference to npm workspaces pattern:

**Before:**
```json
"dependencies": {
  "adk-notes-capture-server": "file:./server-ts"
}
```

**After:**
```json
"workspaces": ["server-ts"],
"dependencies": {
  "adk-notes-capture-server": "workspace:*"
}
```

### Why?

1. **Single Install**: One `npm install` at root installs everything
2. **Automated Builds**: `prebuild` script automatically builds server-ts before Next.js
3. **Better Dependency Management**: Shared dependencies are hoisted to root
4. **Version Conflict Resolution**: `overrides` field explicitly manages @types/node versions
5. **Standard Pattern**: Works seamlessly with Docker, CI/CD, and IDEs

### What Stayed the Same

- All imports remain identical (no code changes needed)
- The server-ts package structure is unchanged
- External users can still install via Git URL (see below)
- Development workflow is the same

---

## Workspace Structure

```
adk-notes-capture-agent/           # Root (Next.js frontend)
├── package.json                   # Root package with workspaces config
├── package-lock.json              # Single unified lockfile
├── node_modules/
│   ├── adk-notes-capture-server -> ../server-ts  # Symlink
│   └── ...                        # Hoisted dependencies
└── server-ts/                     # Workspace package
    ├── package.json               # Server package config
    ├── src/                       # Source code
    ├── dist/                      # Built files (after npm run build)
    └── node_modules/              # Package-specific deps (if any)
```

### Key Configuration

**Root package.json:**
```json
{
  "workspaces": ["server-ts"],
  "scripts": {
    "prebuild": "npm run build --workspace=adk-notes-capture-server"
  },
  "dependencies": {
    "adk-notes-capture-server": "workspace:*"
  },
  "overrides": {
    "adk-notes-capture-server": {
      "@types/node": "^22.10.0"
    }
  }
}
```

- **workspaces**: Declares server-ts as a workspace
- **prebuild**: Automatically builds server-ts before Next.js build
- **workspace:***: Uses workspace version (creates symlink)
- **overrides**: Allows server-ts to use @types/node v22 while root uses v20

---

## For Demo Frontend Developers

### Installation

```bash
# Clone the repo
git clone https://github.com/yourorg/adk-notes-capture-agent.git
cd adk-notes-capture-agent

# Install all dependencies (root + workspaces)
npm install
```

This single command:
- Installs root dependencies
- Installs server-ts dependencies
- Creates symlink: `node_modules/adk-notes-capture-server -> server-ts/`
- Hoists shared dependencies to root

### Development Workflow

```bash
# Start Next.js dev server
npm run dev

# Build everything (prebuild runs automatically)
npm run build

# Build only server-ts
npm run build --workspace=adk-notes-capture-server

# Type checking
npm run typecheck

# Lint
npm run lint
```

### Import Statements

All imports use the package name (no relative paths):

```typescript
// ✅ Correct
import { jobSummaryTracker } from 'adk-notes-capture-server/conversation-pipeline';
import type { Job } from 'adk-notes-capture-server/schema';
import { getNotes } from 'adk-notes-capture-server/database';

// ❌ Don't do this
import { jobSummaryTracker } from '../server-ts/src/conversation-pipeline';
```

### Docker Build

The Dockerfile works automatically:

```dockerfile
# Install dependencies (includes workspace setup)
RUN npm ci

# Build (prebuild runs server-ts build first)
RUN npm run build
```

No manual coordination needed!

### Troubleshooting

**Issue: `Cannot find module 'adk-notes-capture-server'`**

Solution:
```bash
rm -rf node_modules package-lock.json
npm install
```

**Issue: Type errors in server-ts**

Solution: Check that overrides are applied correctly:
```bash
npm ls @types/node
# Should show different versions for root vs workspace
```

**Issue: Changes to server-ts not reflected**

Solution: Rebuild server-ts:
```bash
npm run build --workspace=adk-notes-capture-server
```

---

## For External Users

**Important:** The workspace setup above is ONLY for the demo frontend in this monorepo. External developers in your organization can install the server package independently in their own projects.

### Installation via Git URL

For private GitHub repositories, install using Git URL with subfolder syntax:

```bash
npm install git+https://github.com/yourorg/adk-notes-capture-agent.git#main:server-ts
```

Or add to package.json:

```json
{
  "dependencies": {
    "adk-notes-capture-server": "git+https://github.com/yourorg/adk-notes-capture-agent.git#main:server-ts"
  }
}
```

**Syntax breakdown:**
- `git+https://github.com/yourorg/adk-notes-capture-agent.git` - Repository URL
- `#main` - Branch/tag/commit
- `:server-ts` - Subfolder containing the package

### Authentication (Private Repos)

**Option 1: SSH (Recommended)**
```bash
# Use SSH URL instead
npm install git+ssh://git@github.com/yourorg/adk-notes-capture-agent.git#main:server-ts
```

**Option 2: Personal Access Token (PAT)**
```bash
# Configure Git credentials
git config --global credential.helper store

# Or use PAT in URL (less secure)
npm install git+https://<TOKEN>@github.com/yourorg/adk-notes-capture-agent.git#main:server-ts
```

### Usage in External Projects

Once installed, use it exactly like the demo frontend:

```typescript
// Import from the package
import { jobSummaryTracker } from 'adk-notes-capture-server/conversation-pipeline';
import type { Job, Note } from 'adk-notes-capture-server/schema';
import { getNotes, getJobById } from 'adk-notes-capture-server/database';

// Use the exports
const tracker = jobSummaryTracker();
const job = await getJobById(123);
```

### Available Exports

The package.json defines these exports:

```json
{
  "exports": {
    "./conversation-pipeline": "./dist/conversation-pipeline.js",
    "./database": "./dist/database.js",
    "./schema": "./dist/schema.js",
    "./notes-streaming-service": "./dist/notes-streaming-service.js",
    "./streaming-service": "./dist/streaming-service.js",
    "./azure-blob-storage": "./dist/azure-blob-storage.js"
  }
}
```

### What Gets Installed

When you install via Git URL, npm:
1. Clones the repository
2. Extracts only the `server-ts/` subfolder
3. Runs `npm install` in that subfolder (if needed)
4. Runs `npm run prepare` or `prepublishOnly` scripts (if defined)
5. Copies the result to your `node_modules/`

You get:
- ✅ Compiled `dist/` files (ready to use)
- ✅ Type definitions (.d.ts files)
- ✅ package.json with proper exports
- ❌ NOT the source code (src/ is excluded by .npmignore)

### Updating the Package

```bash
# Update to latest commit on main branch
npm install git+https://github.com/yourorg/adk-notes-capture-agent.git#main:server-ts

# Or use a specific tag/release
npm install git+https://github.com/yourorg/adk-notes-capture-agent.git#v1.2.0:server-ts

# Or use a specific commit
npm install git+https://github.com/yourorg/adk-notes-capture-agent.git#abc123:server-ts
```

### External Project Example

Complete example of using the package in a new project:

```json
// your-project/package.json
{
  "name": "my-app",
  "dependencies": {
    "adk-notes-capture-server": "git+https://github.com/yourorg/adk-notes-capture-agent.git#main:server-ts",
    "better-sqlite3": "^11.0.0",
    "ws": "^8.18.0"
  }
}
```

```typescript
// your-project/src/index.ts
import { jobSummaryTracker } from 'adk-notes-capture-server/conversation-pipeline';
import { initDatabase } from 'adk-notes-capture-server/database';

// Initialize database
initDatabase('./my-database.db');

// Use the tracker
const tracker = jobSummaryTracker();
tracker.addMessage('User asked about pricing');
```

---

## Troubleshooting

### Workspace-Specific Issues

**Issue: `npm ERR! Cannot read properties of undefined (reading 'name')`**

Cause: Corrupted workspace setup

Solution:
```bash
rm -rf node_modules package-lock.json server-ts/node_modules
npm install
```

**Issue: Type errors about @types/node version mismatch**

Cause: Override not applied correctly

Solution: Check that root package.json has:
```json
"overrides": {
  "adk-notes-capture-server": {
    "@types/node": "^22.10.0"
  }
}
```

Then:
```bash
rm -rf node_modules package-lock.json
npm install
```

**Issue: `prebuild` script not running**

Cause: npm version too old (workspaces require npm 7+)

Solution:
```bash
npm --version  # Should be 7.0.0 or higher
npm install -g npm@latest
```

### External Installation Issues

**Issue: `fatal: could not read Username for 'https://github.com'`**

Cause: Missing Git authentication for private repo

Solution: Use SSH or configure credentials:
```bash
# Switch to SSH
npm install git+ssh://git@github.com/yourorg/adk-notes-capture-agent.git#main:server-ts

# Or configure HTTPS credentials
git config --global credential.helper store
```

**Issue: `Cannot find module 'adk-notes-capture-server/conversation-pipeline'`**

Cause: Package not built before installation

Solution: Ensure server-ts/package.json has build script:
```json
{
  "scripts": {
    "prepare": "npm run build",
    "build": "tsc"
  }
}
```

**Issue: Module resolution errors in TypeScript**

Cause: Missing moduleResolution or exports configuration

Solution: Ensure your tsconfig.json has:
```json
{
  "compilerOptions": {
    "moduleResolution": "bundler", // or "node16"
    "resolvePackageJsonExports": true
  }
}
```

---

## Key Takeaways

### For Demo Frontend Developers

- Single `npm install` sets up everything
- Imports use package name, not relative paths
- Builds are automatically coordinated via `prebuild`
- Workspace creates a symlink for local development

### For External Users

- Install via Git URL with subfolder syntax
- No workspace configuration needed in your project
- Use identical import statements as demo frontend
- Package works like any npm package

### Both Patterns Work Together

- Demo frontend: Uses workspace for local development
- External users: Install via Git URL for production
- No conflicts or confusion - they serve different purposes
- Server package structure supports both use cases

---

## Additional Resources

- [npm Workspaces Documentation](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
- [Git URL Installation Guide](https://docs.npmjs.com/cli/v10/commands/npm-install#git-urls-as-dependencies)
- [Package Exports Documentation](https://nodejs.org/api/packages.html#exports)

---

## Questions?

If you encounter issues not covered here:

1. Check git status: `git status`
2. Check workspace structure: `npm ls --workspaces`
3. Check symlink: `ls -la node_modules/ | grep adk-notes-capture-server`
4. Rebuild everything: `rm -rf node_modules package-lock.json && npm install`
5. Open an issue on GitHub with error details

---

**Last Updated:** 2026-02-05
**npm Version Required:** 7.0.0 or higher
**Node Version Required:** 16.0.0 or higher
