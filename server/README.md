# Python Backend Server

This directory contains the Python backend server that powers the Voice Notes Capture application using Google ADK (Agent Development Kit).

## Overview

The server provides a WebSocket-based streaming service that:
- Receives audio input from the Next.js client
- Processes audio through Google ADK Voice Agent
- Returns audio responses and text transcriptions
- Supports bi-directional streaming for natural conversations

## Prerequisites

- Python 3.9 or higher
- Google Cloud Project with ADK access
- Google API credentials configured

## Setup

1. **Create and activate a Python virtual environment:**

**On macOS/Linux:**
```bash
cd server
python3 -m venv venv
source venv/bin/activate
```

**On Windows:**
```bash
cd server
python -m venv venv
venv\Scripts\activate
```

**Or use the setup script (macOS/Linux):**
```bash
cd server
./setup.sh
```

**On Windows:**
```bash
cd server
setup.bat
```

2. **Install Python dependencies:**

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

3. **Configure environment variables:**

Create a `.env` file in the `server` directory (or copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` with your configuration.

**IMPORTANT:** The Live API (real-time voice streaming) **REQUIRES** Vertex AI authentication. API keys are **NOT** supported for Live API connections. You must use Vertex AI.

### Vertex AI Configuration (Required for Live API)

```env
PROJECT_ID=your-project-id
LOCATION=us-central1
MODEL=gemini-1.5-pro
VOICE_NAME=aoede
GOOGLE_GENAI_USE_VERTEXAI=TRUE
```

**Why Vertex AI is Required:**
The Gemini Live API (used for real-time voice streaming) requires OAuth2 authentication through Vertex AI. API keys only work for standard Gemini API calls, not for Live API connections.

**Set up Google Cloud credentials:**

You must configure Google Cloud credentials. Choose one method:

**Option 1: Service Account Key (Recommended for production)**
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-service-account-key.json
```

**Option 2: Application Default Credentials (For local development)**

First, install gcloud CLI if not already installed:
```bash
# On macOS
brew install --cask gcloud-cli

# Add to PATH (add to your ~/.zshrc or ~/.bashrc for persistence)
export PATH=/opt/homebrew/share/google-cloud-sdk/bin:"$PATH"
export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3
```

Then authenticate:
```bash
gcloud auth application-default login
```

**Or use the setup script:**
```bash
./setup-gcloud.sh
```

**Get your Google Cloud Project ID:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select or create a project
3. Note your Project ID
4. Enable the Vertex AI API for your project

## Running the Server

**Make sure the virtual environment is activated first!**

Start the server:

```bash
# Activate virtual environment if not already active
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate  # Windows

# Run the server
python streaming_service.py
```

**Or use the run script (automatically activates venv if it exists):**
```bash
./run.sh
```

The server will start on `0.0.0.0:8080` by default.

To change the host/port, modify the `StreamingService` initialization in `streaming_service.py`:

```python
server = StreamingService(host="0.0.0.0", port=8080)
```

## Architecture

### Components

- **`core_utils.py`**: Base WebSocket server class and shared utilities
- **`streaming_service.py`**: Main streaming service with Google ADK integration

### Key Features

1. **Bi-directional Streaming**: Supports real-time audio streaming with interruption capability
2. **Session Management**: Creates and manages user sessions using in-memory session service
3. **Tool Integration**: 
   - Google Search for real-time information
4. **Audio Processing**: Handles PCM audio at 16kHz input, 24kHz output
5. **Text Transcription**: Provides both input and output text transcriptions

## Message Protocol

The server communicates with clients using JSON messages over WebSocket:

### Server → Client Messages

- `{"type": "ready"}` - Server is ready
- `{"type": "audio", "data": "<base64>"}` - Audio response
- `{"type": "text", "data": "<text>"}` - Text transcription (streaming)
- `{"type": "user_transcript", "data": "<text>"}` - User speech transcription
- `{"type": "interrupted", "data": "<message>"}` - Response was interrupted
- `{"type": "turn_complete", "session_id": "<id>"}` - Turn completed
- `{"type": "session_id", "data": "<id>"}` - Session ID assigned

### Client → Server Messages

- `{"type": "audio", "data": "<base64>"}` - Audio data (PCM, 16kHz)
- `{"type": "video", "data": "<base64>", "mode": "webcam"}` - Video frame (optional)
- `{"type": "end"}` - End of transmission
- `{"type": "text", "data": "<text>"}` - Text input (optional)

## Configuration

### Voice Options

Available voice names (prebuilt voices):
- `aoede`
- `charon`
- `femme`
- `kore`
- `puck`

### Model Options

**IMPORTANT:** Not all Gemini models support the Live API. The following models are supported for Live API:

- `gemini-1.5-pro` (Recommended)
- `gemini-1.5-flash`
- `gemini-2.0-flash` (Note: `gemini-2.0-flash-exp` is NOT supported)

**Models NOT supported for Live API:**
- `gemini-2.0-flash-exp` (experimental models are not supported)

## Troubleshooting

### Connection Issues

- Ensure the server is running and accessible on the configured port
- Check firewall settings
- Verify WebSocket URL in the Next.js client matches server address

### Audio Issues

- Verify audio format matches: PCM, 16kHz, mono
- Check that audio data is properly base64 encoded
- Ensure microphone permissions are granted

### ADK/API Issues

**IMPORTANT:** Live API requires Vertex AI - API keys are NOT supported.

**For Vertex AI (REQUIRED for Live API):**
- Verify `GOOGLE_GENAI_USE_VERTEXAI=TRUE` in your `.env` file
- Verify Google Cloud credentials are properly configured:
  - Check `GOOGLE_APPLICATION_CREDENTIALS` points to valid service account key, OR
  - Run `gcloud auth application-default login` for local development
- **On macOS:** If gcloud command not found, add to PATH:
  ```bash
  export PATH=/opt/homebrew/share/google-cloud-sdk/bin:"$PATH"
  export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3
  ```
- Check that PROJECT_ID and LOCATION are correct
- Ensure the Vertex AI API is enabled in your Google Cloud project:
  ```bash
  gcloud services enable aiplatform.googleapis.com
  ```
- Verify you have the necessary IAM permissions (Vertex AI User role)
- Check API quotas and limits in Google Cloud Console
- If you see "API keys are not supported" error, you must use Vertex AI, not API keys
- **If you see "model is not supported in the live api" error:**
  - The model you're using doesn't support Live API
  - Use `gemini-1.5-pro`, `gemini-1.5-flash`, or `gemini-2.0-flash` (without `-exp` suffix)
  - Experimental models like `gemini-2.0-flash-exp` are NOT supported for Live API
  - Update your `.env` file with a supported model name

### gcloud CLI Installation Issues

**On macOS with Homebrew:**
- Install: `brew install --cask gcloud-cli`
- Add to PATH: `export PATH=/opt/homebrew/share/google-cloud-sdk/bin:"$PATH"`
- Set Python: `export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3`
- Add to `~/.zshrc` for persistence:
  ```bash
  echo 'export PATH=/opt/homebrew/share/google-cloud-sdk/bin:"$PATH"' >> ~/.zshrc
  echo 'export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3' >> ~/.zshrc
  source ~/.zshrc
  ```


## Development

### Logging

The server uses Python's logging module. Log level can be adjusted in `core_utils.py`:

```python
logging.basicConfig(level=logging.INFO)  # Change to DEBUG for more details
```

### Testing

Test the WebSocket connection:

```python
import asyncio
import websockets
import json

async def test():
    uri = "ws://localhost:8080"
    async with websockets.connect(uri) as websocket:
        # Wait for ready message
        message = await websocket.recv()
        print(f"Received: {message}")

asyncio.run(test())
```

## Production Considerations

- Use a production-grade WebSocket server (e.g., with SSL/TLS)
- Implement proper session persistence (replace InMemorySessionService)
- Add authentication and authorization
- Set up proper logging and monitoring
- Configure rate limiting
- Use environment-specific configurations
- Implement health checks and graceful shutdown

## License

MIT

