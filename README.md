# Voice Notes Capture - Full Stack Application

A complete voice notes capture application with a Next.js frontend and Python backend powered by Google ADK (Agent Development Kit).

## Project Structure

```
adk-voice-agent/
├── server/                  # Python backend server
│   ├── streaming_service.py
│   ├── core_utils.py
│   ├── schema.py
│   ├── requirements.txt
│   └── README.md
├── app/                     # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/              # React components
│   ├── VoiceInterface.tsx
│   ├── JobBoard.tsx
│   ├── ChatInterface.tsx
│   └── NotesDisplay.tsx
├── lib/                     # Utility libraries
│   ├── websocket-client.ts
│   └── audio-recorder.ts
└── package.json             # Node.js dependencies
```

## Quick Start

### 1. Backend Setup (Python)

```bash
cd server

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Google Cloud credentials

# Run the server
python streaming_service.py
```

**Or use the setup script:**
```bash
cd server
./setup.sh  # macOS/Linux
# or
setup.bat   # Windows
```

The backend server will start on `ws://localhost:8080`.

See [server/README.md](server/README.md) for detailed backend setup instructions.

### 2. Frontend Setup (Next.js)

```bash
# From project root
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`.

See the main [README.md](README.md) for detailed frontend usage.

## Features

- 🎤 Real-time voice recording
- 🤖 Google ADK Voice Agent integration
- 📝 Automatic note summarization
- 💾 Save and manage captured notes
- 🔌 WebSocket-based real-time communication
- 🎨 Modern, responsive UI

## Environment Variables

### Backend (.env in server/)

**IMPORTANT:** The Live API (real-time voice streaming) **REQUIRES** Vertex AI authentication. API keys are **NOT** supported for Live API.

### Vertex AI Configuration (Required)

```env
PROJECT_ID=your-project-id
LOCATION=us-central1
MODEL=gemini-1.5-pro
VOICE_NAME=aoede
GOOGLE_GENAI_USE_VERTEXAI=TRUE
```

**Note:** For Live API, use models like `gemini-1.5-pro`, `gemini-1.5-flash`, or `gemini-2.0-flash`. The experimental model `gemini-2.0-flash-exp` is NOT supported for Live API.

**Why Vertex AI is Required:**
The Gemini Live API (used for real-time voice streaming) requires OAuth2 authentication. API keys only work for standard API calls, not Live API.

**Set up Google Cloud credentials:**
```bash
# Option 1: Service Account Key
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Option 2: Application Default Credentials (local development)
gcloud auth application-default login
```

**Enable Vertex AI API:**
```bash
gcloud services enable aiplatform.googleapis.com
```

### Frontend (.env.local in project root)

```env
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

## Usage

1. Start the Python backend server
2. Start the Next.js frontend
3. Open the application in your browser
4. Wait for connection (green indicator)
5. Click the microphone button to start recording
6. Speak your notes
7. View the AI-generated summary
8. Save notes to your collection

## Development

### Backend Development

```bash
cd server
python streaming_service.py
```

### Frontend Development

```bash
npm run dev
```

## Troubleshooting

### Connection Issues

- Ensure backend is running on port 8080
- Check WebSocket URL in frontend `.env.local`
- Verify firewall settings

### Audio Issues

- Grant microphone permissions in browser
- Check audio format (PCM, 16kHz, mono)
- Verify WebSocket connection is established

### Backend Issues

- Verify Google Cloud credentials
- Check environment variables
- Ensure Python dependencies are installed

## License

MIT
