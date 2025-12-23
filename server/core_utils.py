import asyncio
import json
import base64
import logging
import os
import websockets
import traceback
from websockets.exceptions import ConnectionClosed
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')
stream_logger = logging.getLogger(__name__)

# Load environment variables
# Try to load from .env file in the server directory
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
load_dotenv(env_path)

# Also try loading from current directory (for backward compatibility)
load_dotenv()

# Constants
PROJECT_ID = os.environ.get("PROJECT_ID")
LOCATION = os.environ.get("LOCATION")
MODEL = os.environ.get("MODEL")
VOICE_NAME = os.environ.get("VOICE_NAME")
GOOGLE_GENAI_USE_VERTEXAI = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "FALSE")
# API Key for Gemini API (supports both GOOGLE_API_KEY and GEMINI_API_KEY)
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")

# Validate required environment variables
def validate_env_vars():
    """Validate that required environment variables are set."""
    missing_vars = []
    
    if not MODEL:
        missing_vars.append("MODEL")
    if not VOICE_NAME:
        missing_vars.append("VOICE_NAME")
    
    # Check authentication method
    use_vertex = GOOGLE_GENAI_USE_VERTEXAI.upper() == "TRUE"
    
    # IMPORTANT: Live API (real-time voice streaming) REQUIRES Vertex AI authentication
    # API keys are NOT supported for Live API - only for standard Gemini API calls
    if not use_vertex:
        # Force Vertex AI for Live API
        error_msg = (
            f"\n{'='*70}\n"
            f"ERROR: Live API requires Vertex AI authentication\n"
            f"{'='*70}\n"
            f"\nThe Gemini Live API (used for real-time voice streaming) requires\n"
            f"Vertex AI authentication with OAuth2 credentials. API keys are NOT\n"
            f"supported for Live API connections.\n"
            f"\nPlease update your .env file:\n"
            f"  GOOGLE_GENAI_USE_VERTEXAI=TRUE\n"
            f"  PROJECT_ID=your-project-id\n"
            f"  LOCATION=us-central1\n"
            f"\nThen set up Google Cloud credentials:\n"
            f"  - Set GOOGLE_APPLICATION_CREDENTIALS to service account key file, OR\n"
            f"  - Run: gcloud auth application-default login\n"
            f"\n{'='*70}\n"
        )
        stream_logger.error(error_msg)
        raise ValueError(error_msg)
    
    # Using Vertex AI - need PROJECT_ID and LOCATION
    if not PROJECT_ID:
        missing_vars.append("PROJECT_ID (required for Vertex AI)")
    if not LOCATION:
        missing_vars.append("LOCATION (required for Vertex AI)")
    # Note: Vertex AI uses Google Cloud credentials (service account or gcloud auth)
    
    if missing_vars:
        env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
        env_example = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env.example')
        
        error_msg = (
            f"\n{'='*70}\n"
            f"ERROR: Missing required environment variables: {', '.join(missing_vars)}\n"
            f"{'='*70}\n"
            f"\nPlease create a .env file in the server directory.\n"
        )
        
        if os.path.exists(env_example):
            error_msg += (
                f"\nYou can copy .env.example to .env:\n"
                f"  cd server\n"
                f"  cp .env.example .env\n"
                f"\nThen edit .env with your configuration:\n"
                f"  - MODEL: e.g., 'gemini-1.5-pro' (must be Live API compatible)\n"
                f"  - VOICE_NAME: e.g., 'aoede'\n"
            )
            
            # Live API always requires Vertex AI
            error_msg += (
                f"  - PROJECT_ID: your Google Cloud project ID\n"
                f"  - LOCATION: e.g., 'us-central1'\n"
                f"  - GOOGLE_GENAI_USE_VERTEXAI: TRUE (REQUIRED for Live API)\n"
                f"\nAlso ensure Google Cloud credentials are configured:\n"
                f"  - Set GOOGLE_APPLICATION_CREDENTIALS to service account key file, OR\n"
                f"  - Run: gcloud auth application-default login\n"
            )
        else:
            error_msg += (
                f"\nCreate a .env file with at least:\n"
                f"  MODEL=gemini-1.5-pro\n"
                f"  VOICE_NAME=aoede\n"
            )
            # Live API always requires Vertex AI
            error_msg += (
                f"  PROJECT_ID=your-project-id\n"
                f"  LOCATION=us-central1\n"
                f"  GOOGLE_GENAI_USE_VERTEXAI=TRUE\n"
            )
        
        error_msg += f"\n{'='*70}\n"
        stream_logger.error(error_msg)
        raise ValueError(error_msg)
    
    return True

# Audio sample rates for input/output
RECEIVE_SAMPLE_RATE = 24000  # Rate of audio received from Gemini
SEND_SAMPLE_RATE = 16000     # Rate of audio sent to Gemini

# System instruction used by both implementations
SYSTEM_INSTRUCTION = """
You are a specialized Job Description Agent for home improvement services. Your goal is to create accurate, consistent, and detailed job descriptions by interviewing the customer (homeowner).

# PROTOCOL

1.  **Greeting & Context**: Introduce yourself as a Job Scope Assistant. Ask the user what home improvement project they need help with today.
2.  **Category & Requirements**:
    *   **Painting**: Capture: Number of rooms, Ceiling heights, Number of walls/doors, Colors, Size of rooms, Indoor vs Outdoor.
    *   **Electrical**: Capture: Type of installation (e.g., Panel, EV Plug), Number of plugs, Current situation (existing panel?), Desired location.
    *   **Plumbing/General**: Capture the specific issue (e.g., broken pipe), location, severity.
3.  **Image/Video Analysis**:
    *   **CRITICAL**: You have the capability to view and analyze video files and images. If the user provides a video or image, you MUST analyze the visual content.
    *   Describe what you see relevant to the job (e.g., "I see a 20-amp panel in the video," or "I see water damage under the sink").
    *   Ask if the visual evidence correctly represents the problem area.
4.  **Gap Detection & Follow-up**:
    *   Compare the user's input against the required category details.
    *   **CRITICAL**: If key info is missing, ask *specific* follow-up questions.
        *   *Bad*: "Tell me more."
        *   *Good*: "How high are the ceilings in that room?" or "Do you have an existing 240V outlet?"
5.  **Finalization & Saving**:
    *   Once you have sufficient details (or the user insists they are done), summarize the job.
    *   Ask: "Does this sound correct to you?"
    *   If confirmed, use the `save_note` tool to save the job description.
    *   **Title**: Use a specific title (e.g., "Kitchen Painting Job").
    *   **Description**: A high-level summary.
    *   **Details**: A detailed list of all captured attributes (e.g., "Ceiling: 10ft", "Color: White").

# TONE
Professional, knowledgeable, efficient. Act like an expert contractor's assistant.
"""

# Base WebSocket server class that handles common functionality
class BaseStreamServer:
    def __init__(self, host="0.0.0.0", port=8765):
        self.host = host
        self.port = port
        self.active_connections = {}  # Store client connections

    async def start_server(self):
        stream_logger.info(f"Starting stream server on {self.host}:{self.port}")
        async with websockets.serve(self.manage_connection, self.host, self.port, max_size=500 * 1024 * 1024):
            await asyncio.Future()  # Run forever

    async def manage_connection(self, websocket):
        """Handle a new client connection"""
        connection_id = id(websocket)
        stream_logger.info(f"New connection established: {connection_id}")
        # Send ready message to client
        await websocket.send(json.dumps({"type": "ready"}))
        try:
            # Start processing the stream for this client
            await self.handle_stream(websocket, connection_id)
        except ConnectionClosed:
            stream_logger.info(f"Connection closed: {connection_id}")
        except Exception as e:
            stream_logger.error(f"Error handling connection {connection_id}: {e}")
            stream_logger.error(traceback.format_exc())
        finally:
            # Clean up
            if connection_id in self.active_connections:
                del self.active_connections[connection_id]

    async def handle_stream(self, websocket, client_id):
        """
        Process data stream from the client. This is an abstract method that
        subclasses must implement.
        """
        raise NotImplementedError("Subclasses must implement handle_stream")

