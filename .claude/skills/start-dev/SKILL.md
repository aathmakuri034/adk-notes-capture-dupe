---
name: start-dev
description: Boot the full local dev stack — both Python voice WebSocket servers (8080 Job Scope, 8081 Voice Notes) and the Next.js frontend (3000). Use when the user wants to run or start the app locally.
---

Start all three services for local development. Run each in the background and report the URLs.

## Preflight
1. Confirm `server/venv` exists. If not, run `cd server && ./setup.sh` first (creates venv, installs `requirements.txt`).
2. Confirm `.env.local` exists at the repo root (copy from `.env.local.example` if missing).
3. Remind the user that the voice servers need Vertex AI auth (`GOOGLE_APPLICATION_CREDENTIALS` + gcloud) — the Gemini Live API rejects API keys. See `server/README.md`.

## Launch (each as a background process)
1. Job Scope server: from `server/`, with the venv active — `python streaming_service.py` (→ ws://localhost:8080)
2. Voice Notes server: from `server/`, with the venv active — `python notes_streaming_service.py` (→ ws://localhost:8081)
3. Frontend: from the repo root — `pnpm dev` (→ http://localhost:3000). Use pnpm, not npm.

## After launch
- Verify each backend is listening on its port and the frontend compiled.
- Report the three URLs and note that logs stream to their background processes.
