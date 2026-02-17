# ADK Notes Capture Agent

Voice-enabled job intake and notes capture using Google Gemini Live API.

This monorepo contains a TypeScript WebSocket server (`server-ts/`) and a demo Next.js frontend. The server package is designed to be used standalone or integrated into your own project.

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **npm** >= 7 (for workspace support)
- **Google Cloud Project** with the Vertex AI API enabled
- **GCP Authentication** — one of:
  - `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service account key file, **or**
  - `gcloud auth application-default login` for local development

### 1. Clone and install

```bash
git clone https://github.com/yourorg/adk-notes-capture-agent.git
cd adk-notes-capture-agent
npm install
```

This single `npm install` sets up both the root frontend and the `server-ts` workspace.

### 2. Configure environment

```bash
cp server-ts/.env.example server-ts/.env
```

Edit `server-ts/.env` with your values:

```env
PROJECT_ID=your-gcp-project-id
LOCATION=us-central1
MODEL=gemini-live-2.5-flash-native-audio
VOICE_NAME=Aoede
GOOGLE_GENAI_USE_VERTEXAI=TRUE
```

> **Important:** The Gemini Live API requires Vertex AI (OAuth2). API keys are **not** supported for the Live API.

If you haven't already, authenticate with Google Cloud:

```bash
gcloud auth application-default login
```

### 3. Build the server package

```bash
cd server-ts && npm run build && cd ..
```

### 4. Start the backend

```bash
cd server-ts && npm run start:all
```

This starts two WebSocket services:

| Service | Port | Description |
|---------|------|-------------|
| Job Scope | 8080 | Voice-based job intake assistant |
| Voice Notes | 8081 | Quick voice memo capture |

### 5. Start the demo frontend

In a **separate terminal** from the project root:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
adk-notes-capture-agent/
├── server-ts/                 # Backend package (npm workspace)
│   ├── src/
│   │   ├── streaming-service.ts       # Job scope WebSocket server
│   │   ├── notes-streaming-service.ts # Voice notes WebSocket server
│   │   ├── gemini-live-client.ts      # Gemini Live API client
│   │   ├── standard-gemini-client.ts  # Standard Gemini API (video)
│   │   ├── conversation-pipeline.ts   # Job extraction pipeline
│   │   ├── database.ts                # SQLite database
│   │   ├── config.ts                  # Configuration / env vars
│   │   ├── schema.ts                  # Job type definitions
│   │   ├── azure-blob-storage.ts      # Azure Blob Storage (optional)
│   │   └── gcs-storage.ts             # Google Cloud Storage (optional)
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── app/                       # Next.js demo frontend (not packaged)
├── components/                # React UI components (not packaged)
├── package.json               # Root workspace config
└── README.md
```

## Environment Variables

### Backend (`server-ts/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROJECT_ID` | Yes | — | Google Cloud project ID |
| `LOCATION` | No | `us-central1` | GCP region |
| `MODEL` | No | `gemini-2.0-flash-live-001` | Gemini Live model |
| `EXTRACTION_MODEL` | No | `gemini-2.0-flash` | Model for job extraction |
| `VOICE_NAME` | No | `Aoede` | TTS voice |
| `GOOGLE_GENAI_USE_VERTEXAI` | Yes | — | Must be `TRUE` |
| `JOB_SERVICE_PORT` | No | `8080` | Job scope service port |
| `NOTES_SERVICE_PORT` | No | `8081` | Notes service port |
| `AZURE_STORAGE_CONNECTION_STRING` | No | — | Azure Blob Storage (optional) |
| `AZURE_CONTAINER_NAME` | No | `extracted-data` | Azure container name |
| `VIDEO_API_MODEL` | No | `gemini-2.0-flash` | Model for video analysis |
| `VIDEO_MAX_SIZE_MB` | No | `50` | Max video upload size |

### Frontend (`.env.local` in project root)

```env
NEXT_PUBLIC_WS_URL=ws://localhost:8080
NEXT_PUBLIC_NOTES_WS_URL=ws://localhost:8081
```

## Using the Server Package in Your Own Project

The `server-ts` package (`@vcmach/adk-notes-capture-server`) can be installed independently.

### Install

```bash
# From Git
npm install git+https://github.com/yourorg/adk-notes-capture-agent.git#main:server-ts

# Or as a workspace
# Add "server-ts" to your root package.json "workspaces" array and:
npm install
```

### Start services programmatically

```typescript
import { loadEnv } from '@vcmach/adk-notes-capture-server';
import { startJobService } from '@vcmach/adk-notes-capture-server/streaming-service';
import { startNotesService } from '@vcmach/adk-notes-capture-server/notes-streaming-service';

loadEnv();  // Load .env file

await Promise.all([
  startJobService(8080),
  startNotesService(8081),
]);
```

### Use database and job extraction

```typescript
import { initDb, getNotes, closeDb } from '@vcmach/adk-notes-capture-server';
import { getJobSummaryTracker } from '@vcmach/adk-notes-capture-server/conversation-pipeline';

initDb();

const tracker = getJobSummaryTracker();
const jobs = await tracker.getAllJobs();
const notes = getNotes();

closeDb();
```

### Import types (safe for frontend)

```typescript
import type {
  Job,
  JobCategory,
  PlumbingJob,
  ElectricalJob,
} from '@vcmach/adk-notes-capture-server/schema';
```

See [server-ts/README.md](server-ts/README.md) for the full API reference.

## WebSocket Protocol

### Client -> Server

| Message Type | Description |
|-------------|-------------|
| `audio` | Base64 encoded audio chunk (PCM 16kHz mono) |
| `text` | Text message |
| `image` | Base64 encoded image |
| `video_file` | Base64 encoded video |
| `start_recording` | Begin voice recording (notes service) |
| `stop_recording` | End voice recording (notes service) |
| `get_notes` | Request all saved notes |
| `generate_summary` | Request job summary |

### Server -> Client

| Message Type | Description |
|-------------|-------------|
| `ready` | Connection established |
| `audio` | Audio response from AI |
| `text` | Text/transcription from AI |
| `user_transcript` | Transcription of user speech |
| `turn_complete` | AI turn finished |
| `interrupted` | Response was interrupted |
| `note_saved` | Note saved (with data) |
| `notes_list` | List of all notes |
| `error` | Error message |

## Troubleshooting

### "Live API requires Vertex AI authentication"

Ensure your `.env` has `GOOGLE_GENAI_USE_VERTEXAI=TRUE` and valid GCP credentials:

```bash
gcloud auth application-default login
```

### Cannot find module 'adk-notes-capture-server'

Rebuild after a fresh install:

```bash
rm -rf node_modules package-lock.json
npm install
cd server-ts && npm run build && cd ..
```

### Type errors about @types/node

The root and server-ts use different `@types/node` versions. The `overrides` field in root `package.json` handles this. If issues persist:

```bash
rm -rf node_modules package-lock.json && npm install
```

### gcloud CLI not found (macOS)

```bash
brew install --cask google-cloud-sdk
export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
gcloud auth application-default login
```

## License

MIT
