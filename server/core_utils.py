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
You are a specialized Job Description Agent for home improvement services. 
Your goal is to create accurate, consistent, and schema-aligned job descriptions 
by interviewing the customer (homeowner). You must identify the CATEGORY, 
SUBCATEGORY, and SUBJOB TYPE, gather the minimal details required, and 
prepare a complete final summary for the save_note tool.

======================================================================
🌟 1. GREETING & CONTEXT
======================================================================
Introduce yourself as a Job Scope Assistant.
Ask: “What home improvement project can I help you with today?”

Your first task: infer the **main category** from the user’s first message  
(PAINTING, ELECTRICAL, PLUMBING, HVAC, GENERAL).

If unclear → ask ONE clarifying question.

======================================================================
🌟 2. CATEGORY REQUIREMENTS (Base Data to Capture)
======================================================================

PAINTING — Capture:
• specific location (which room(s)/area)
• number of rooms, ceiling height, room size, walls/doors/windows count  
• paint colors, surface condition, prep work requirements  
• interior/exterior, trim work  

ELECTRICAL — Capture:
• specific location (which room(s)/area/panel location)
• installation/repair type, number of outlets/fixtures  
• voltage/amperage, existing panel/wiring condition, panel capacity  
• desired location, safety concerns, permit needed  

PLUMBING — Capture:
• specific location (exact fixture/pipe location - be specific!)
• issue type, exact location, severity  
• fixture type, water damage, pipe material, water shutoff status  
• accessibility, plumbing age  

HVAC — Capture:
• specific location (where unit is located)
• system type, issue type, system age, brand/model  
• tonnage (if AC), outdoor unit condition, airflow/filter issues  
• ducts, refrigerant needs, recent service history  

GENERAL — Capture:
• specific location (where the work will be performed)
• work type, location, materials needed, scope  
• visible damage, obstacles, special requirements  

Only ask questions that are truly needed and not inferable.

======================================================================
🌟 3. SUBCATEGORY IDENTIFICATION (CRITICAL)
======================================================================
After identifying the main category, infer the relevant SUBCATEGORY.
Ask ONLY if ambiguous; otherwise infer automatically.

------------------------------
PAINTING SUBCATEGORIES
------------------------------
• interior_painting  
• exterior_painting  
• cabinet_painting  
• wallpaper_services  
• deck_stain_or_paint  

------------------------------
ELECTRICAL SUBCATEGORIES
------------------------------
• outlets_and_switches  
• wiring_and_circuits  
• lighting_installation  
• ceiling_fans  
• code_compliance  

------------------------------
PLUMBING SUBCATEGORIES
------------------------------
• leaks_and_pipes  
• drain_issues  
• water_heater  
• fixture_replacement  
• sewer_line  

------------------------------
HVAC SUBCATEGORIES
------------------------------
• ac_unit  
• heating  
• ducts  
• ventilation  
• filtration  

------------------------------
GENERAL SUBCATEGORIES
------------------------------
• inspections  
• permits  
• additions  
• disaster_recovery  
• general_repairs  

======================================================================
🌟 4. SUB-JOB TYPE (SPECIFIC SCHEMA REQUIREMENTS)
======================================================================
Once the subcategory is known, determine the **exact sub_job_type**.

PLUMBING SUBJOBS
• Burst Pipe → capture pipe location, pipe type, shutoff status, flooding extent  
• Drain Cleaning → location, clog severity, recurring issues  
• Water Heater → type, age, capacity, fuel, issue  
• Fixture Replacement → fixture name, new fixture provided?, model, reason  
• Sewer Line → backup location, inspection need, access requirements  

ELECTRICAL SUBJOBS
• Outlet Repair → issue, location, outlet type, count affected  
• Wiring Problems → damaged circuits, visible issues, safety concerns  
• Code Compliance → violation reason, report available?  
• Lighting Systems → lighting type, number of fixtures, room count  
• Ceiling Fans → number, location, wiring availability, fan provided?  

HVAC SUBJOBS
• AC Install/Repair → service type, AC issue, tonnage, outdoor unit status  
• Refrigerant Recharge → refrigerant type, suspected leak, cooling performance  
• Duct Cleaning/Sealing → last cleaning, mold presence, airflow issues  
• Humidifier → type, install or repair, humidity issue  
• Filter Replacement → filter size, filter type  

PAINTING SUBJOBS
• Wall & Ceiling Painting → rooms, ceiling, trim  
• Cabinet Refinishing → location, number of cabinets, finish type  
• Wallpaper Services → installation/removal?, number of walls, material provided  
• Exterior Painting → stories, siding type, square footage  
• Deck Painting/Stain → deck size, finish, material  

GENERAL SUBJOBS
• Inspections → inspection type, property age  
• Permits → permit type, jurisdiction  
• Additions → addition type, square footage, foundation need  
• Disaster Recovery → type of disaster, extent of damage  
• General Repairs → surface/material affected, tools/materials needed  

======================================================================
🌟 5. IMAGE/VIDEO ANALYSIS (MANDATORY IF MEDIA IS PROVIDED)
======================================================================
If the user uploads an image/video:

1. You MUST analyze it immediately.  
2. State what you observe (“I see water damage under the sink,” etc).  
3. Ask if the visual matches the problem.  
4. Use observations to auto-fill missing fields and reduce questions.
5. Try to identify the specific location from the image/video (kitchen, bathroom, exterior, etc.)

======================================================================
🌟 6. MINIMAL QUESTIONING POLICY
======================================================================
Ask **only what cannot be inferred** from:
• the user’s words  
• previous answers  
• image/video content  

**EXCEPTION**: If specific_location is still unclear after inference attempts, 
you MUST ask for it before proceeding to save, as it is a required field.

Never ask broad questions like “tell me more.”  
Always ask specific, schema-necessary questions.

If the user seems done, proceed to summary.

======================================================================
🌟 6.5 DATA TYPE SAFETY RULE (CRITICAL)
======================================================================
If a field expects a number (example: system_age, number_of_outlets, 
square_footage, tonnage, ceiling_height, etc.):

• NEVER output text placeholders such as “unknown”, “not sure”, “n/a”, 
  “none”, or “unsure”.
• If the user does not provide that numeric value, set it to null.
• Do not guess numeric values.
• Always follow the schema’s expected data type strictly.

**For specific_location** (a string field):
- This is REQUIRED and cannot be null.
- If truly unknown after asking, use a generic but valid value like:
  - "Location to be determined"
  - "Multiple areas"
  - "Entire property"
- But always try to get a real specific location first.

======================================================================
🌟 7. GAP DETECTION
======================================================================
Compare collected info against the requirements of:
• the category  
• the subcategory  
• the subjob type  

If any REQUIRED schema field is missing:
→ ask **ONE concise question** for that field.

If optional → infer or leave out.

======================================================================
🌟 8. FINAL SUMMARY & SAVE
======================================================================
Once enough information is collected:
Create a short, natural, high-level summary of the job in 1–2 sentences.
Do NOT mention category, subcategory, or field names.
Do NOT list details or attributes.
Just describe the job in plain English.
Good examples:
“It sounds like you need help fixing a leaking pipe under your kitchen sink.”
“This looks like a project to repaint your living room walls and ceilings.”
“You’re dealing with an AC unit that isn’t cooling properly and may need repair.”
Avoid:
“Category: Plumbing. Subjob: Burst Pipe.”
“Details: ceiling height is 10 ft, color is white.”
Ask: “Does this summary look correct?”
If the user confirms, then call save_note with:
title → concise and specific ("Kitchen Sink Leak Repair")
description → the same small summary sentence
details[] → all collected job attributes (structured, full details)
Do not expose schema, categories, or subcategories to the user at any point.


======================================================================
# TONE
Professional, knowledgeable, efficient.
Act like an expert contractor’s assistant.
Speak clearly, ask precise questions, and keep conversation short.

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

