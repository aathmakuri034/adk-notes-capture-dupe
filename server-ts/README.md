# ADK Notes Capture Server (TypeScript)

TypeScript WebSocket server for voice-enabled job intake and notes capture using Google Gemini Live API.

## Usage in Monorepo

> **Important**: This is a **Node.js backend package**. Most imports only work in Node.js environments (servers, API routes), NOT in browser/frontend code.

### Backend Usage (Node.js, API Routes, Server-Side)

#### Import Database Utilities

```typescript
// ✅ BACKEND ONLY - Uses better-sqlite3 (Node.js)
import { initDb, closeDb, saveNote, getNotes, getNote, deleteNote } from '@vcmach/adk-notes-capture-server';
import type { Note } from '@vcmach/adk-notes-capture-server';

// Or from specific subpaths
import { initDb, saveNote } from '@vcmach/adk-notes-capture-server/database';
```

#### Import and Run Services Programmatically

```typescript
// ✅ BACKEND ONLY - WebSocket servers run in Node.js
import { loadEnv } from '@vcmach/adk-notes-capture-server';
import { startJobService } from '@vcmach/adk-notes-capture-server/streaming-service';
import { startNotesService } from '@vcmach/adk-notes-capture-server/notes-streaming-service';

loadEnv(); // Load .env file (call before starting services)

// Start job service on custom port
await startJobService(9000);

// Start notes service on default port
await startNotesService();
```

#### Import Job Extraction and Storage

```typescript
// ✅ BACKEND ONLY - Server-side operations
import { getJobSummaryTracker } from '@vcmach/adk-notes-capture-server/conversation-pipeline';
import { AzureBlobStorage } from '@vcmach/adk-notes-capture-server/azure-blob-storage';
import { GcsStorage } from '@vcmach/adk-notes-capture-server/gcs-storage';

// Get all extracted jobs (async)
const tracker = getJobSummaryTracker();
const jobs = await tracker.getAllJobs();
```

#### Import Configuration

```typescript
// ✅ BACKEND ONLY - Server config and env vars
import {
  loadEnv,
  logger,
  validateEnvVars,
  PROJECT_ID,
  LOCATION,
  MODEL,
  VOICE_NAME,
  JOB_SERVICE_PORT,
  NOTES_SERVICE_PORT
} from '@vcmach/adk-notes-capture-server/config';

loadEnv(); // Call once at startup to load .env values
```

### Frontend Usage (React, Next.js Client Components, Browser)

#### Import Types Only (Type Safety)

```typescript
// ✅ FRONTEND - Type imports work everywhere
import type {
  Job,
  JobCategory,
  PlumbingJob,
  ElectricalJob,
  HVACJob,
  PaintingJob,
  Note,
  UrgencyLevel,
  LocationType,
  ComplexityLevel
} from '@vcmach/adk-notes-capture-server/schema';

// Use types for type safety
const jobs: Job[] = await fetch('/api/jobs').then(r => r.json());

function JobCard({ job }: { job: PlumbingJob }) {
  return <div>{job.title}</div>;
}
```

#### Connect to Services via WebSocket

```typescript
// ✅ FRONTEND - Connect to the WebSocket server
const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
  console.log('Connected to job service');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

// Send audio or text
ws.send(JSON.stringify({
  type: 'audio',
  data: base64AudioData
}));
```

#### Fetch from API Routes (Next.js Example)

```typescript
// ✅ FRONTEND - Fetch from your API routes
// app/components/JobList.tsx
'use client';

import type { Job } from '@vcmach/adk-notes-capture-server/schema';

export function JobList() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    fetch('/api/jobs')
      .then(r => r.json())
      .then(data => setJobs(data));
  }, []);

  return (
    <div>
      {jobs.map(job => <div key={job.jobId}>{job.title}</div>)}
    </div>
  );
}
```

### Available Exports

| Export Path | Environment | Description |
|-------------|-------------|-------------|
| **`.`** | Backend Only | Barrel export with database, schema, config utilities |
| **`./streaming-service`** | Backend Only | `startJobService()` - Job WebSocket server |
| **`./notes-streaming-service`** | Backend Only | `startNotesService()` - Notes WebSocket server |
| **`./database`** | Backend Only | SQLite operations (Node.js only) |
| **`./gemini-live-client`** | Backend Only | Gemini Live API client |
| **`./conversation-pipeline`** | Backend Only | Job extraction pipeline |
| **`./config`** | Backend Only | Server configuration and env vars |
| **`./schema`** | Both (types) | Job type definitions (types work in frontend) |
| **`./azure-blob-storage`** | Backend Only | Azure Blob Storage integration |
| **`./gcs-storage`** | Backend Only | Google Cloud Storage integration |
| **`./standard-gemini-client`** | Backend Only | Standard Gemini API for video |

## Installation for External Users

If you're adding this package to your own project, choose the method that fits your setup:

### Option 1: Install from Git

```bash
npm install git+https://github.com/yourorg/adk-notes-capture-agent.git#main:server-ts
```

### Option 2: Monorepo Workspace

If using pnpm/npm/yarn workspaces:

```json
{
  "dependencies": {
    "@vcmach/adk-notes-capture-server": "workspace:*"
  }
}
```

Place this `server-ts` folder in your monorepo's packages directory.

### Option 3: Local File Path

For local development:

```json
{
  "dependencies": {
    "@vcmach/adk-notes-capture-server": "file:../path/to/adk-notes-capture-agent/server-ts"
  }
}
```

## Prerequisites

1. **Node.js** >= 18.0.0
2. **Google Cloud Project** with Vertex AI API enabled
3. **Authentication**: Set up one of:
   - `GOOGLE_APPLICATION_CREDENTIALS` environment variable pointing to a service account key file
   - Run `gcloud auth application-default login`

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy the environment example and configure:
```bash
cp .env.example .env
```

3. Edit `.env` with your configuration:
```env
PROJECT_ID=your-gcp-project-id
LOCATION=us-central1
MODEL=gemini-live-2.5-flash-native-audio
VOICE_NAME=Aoede
GOOGLE_GENAI_USE_VERTEXAI=TRUE
JOB_SERVICE_PORT=8080
NOTES_SERVICE_PORT=8081
```

## Running the Servers

### Run both services:
```bash
npm run start:all
```

### Run job scope service only (port 8080):
```bash
npm run start:jobs
```

### Run notes service only (port 8081):
```bash
npm run start:notes
```

## Running the Frontend

### Open a new terminal in project root
``` bash
npm run dev
```

## Services

### Job Scope Service (port 8080)
Real-time voice-based job intake assistant that:
- Streams bidirectional audio via WebSocket
- Interviews users about home improvement projects
- Extracts structured job data using schema
- Saves job descriptions to database

### Notes Service (port 8081)
Voice notes capture service that:
- Records voice memos
- Transcribes audio in real-time
- Extracts title, summary, and key points
- Saves notes to JSON files

## WebSocket Message Types

### Client → Server
- `audio`: Base64 encoded audio chunk
- `text`: Text message
- `image`: Base64 encoded image
- `start_recording`: Begin voice recording (notes)
- `stop_recording`: End voice recording (notes)
- `get_notes`: Request all saved notes
- `generate_summary`: Request job summary

### Server → Client
- `ready`: Connection established
- `audio`: Audio response from AI
- `text`: Text response from AI
- `user_transcript`: Transcription of user speech
- `turn_complete`: AI turn completed
- `interrupted`: Response was interrupted
- `note_saved`: Note was saved
- `notes_list`: List of all notes
- `error`: Error message

## Architecture

```
server-ts/
├── src/
│   ├── azure-blob-storage.ts  # Writes to Azure Blob Storage
│   ├── config.ts              # Configuration and environment
│   ├── database.ts            # SQLite database operations
│   ├── schema.ts              # Job type definitions
│   ├── gemini-live-client.ts  # Gemini Live API WebSocket client
│   ├── streaming-service.ts   # Job scope WebSocket server
│   ├── notes-streaming-service.ts  # Notes WebSocket server
│   └── conversation-pipeline.ts    # Job extraction with Vertex AI
├── package.json
├── tsconfig.json
└── .env.example
```

## Important Notes

- The Gemini Live API requires **Vertex AI authentication** (OAuth2 credentials)
- API keys are **NOT supported** for the Live API
- Make sure your GCP project has billing enabled and Vertex AI API activated

## Publishing

Build and publish:

```bash
npm run clean && npm run build
npm login
npm publish
```

Users can then install via:

```bash
npm install @vcmach/adk-notes-capture-server
```

### Optional peer dependencies

Azure Blob Storage and Google Cloud Storage are optional peer dependencies. Install them only if needed:

```bash
# For Azure Blob Storage support
npm install @azure/storage-blob

# For Google Cloud Storage support (video uploads)
npm install @google-cloud/storage
```
