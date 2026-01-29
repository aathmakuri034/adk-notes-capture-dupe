import asyncio
import json
import base64
import logging
import os
import traceback
import uuid
import websockets

from .conversation_pipeline import JobSummaryTracker
from .core_utils import (
    GOOGLE_API_KEY,
    BaseStreamServer,
    stream_logger,
    MODEL,
    VOICE_NAME,
    SEND_SAMPLE_RATE,
    SYSTEM_INSTRUCTION,
    validate_env_vars,
    PROJECT_ID,
    LOCATION,
)
if PROJECT_ID:
    os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
if LOCATION:
    os.environ["GOOGLE_CLOUD_LOCATION"] = LOCATION
    os.environ["GOOGLE_CLOUD_REGION"] = LOCATION

# Import Google ADK components
from google.adk.agents import Agent, LiveRequestQueue
from google.adk.runners import Runner
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.errors.already_exists_error import AlreadyExistsError
from google.genai import types
from dotenv import load_dotenv
from google.adk.tools import google_search
from . import database

load_dotenv()

# Function tool for order status
class StreamingService(BaseStreamServer):
    """Real-time streaming service for audio and video data."""

    def __init__(self, host="0.0.0.0", port=8080):
        super().__init__(host, port)

        # Validate environment variables before creating agent
        validate_env_vars()

        # Initialize Database
        database.init_db()

        # Initialize ADK components
        # Agent will be created per connection to support connection-aware tools
        
        # Create session service
        self.session_service = InMemorySessionService()

        # Initialize conversation tracker
        self.conversation_tracker = JobSummaryTracker()
        stream_logger.info("Job Summary Tracker initialized")

    async def manage_connection(self, websocket):
        """Handle a new client connection"""
        connection_id = id(websocket)
        stream_logger.info(f"New connection established: {connection_id}")
        await websocket.send(json.dumps({"type": "ready"}))
        
        session_id = None
        
        try:
            session_id = await self.handle_stream(websocket, connection_id)
        except websockets.exceptions.ConnectionClosed:
            stream_logger.info(f"Connection closed: {connection_id}")
        except Exception as e:
            stream_logger.error(f"Error handling connection {connection_id}: {e}")
            stream_logger.error(traceback.format_exc())
        finally:
            # Clean up
            if connection_id in self.active_connections:
                del self.active_connections[connection_id]


    async def handle_stream(self, websocket, client_id):
        # Buffers for transcript logging shared across tasks
        self._input_texts = []
        self._output_texts = []

        """Process real-time data streams from the client."""
        # Store client reference
        self.active_connections[client_id] = websocket

        # Create a unique session ID using UUID to ensure uniqueness for each connection
        user_id = f"user_{client_id}"
        # Generate a unique session ID for each connection to avoid conflicts
        session_id = f"session_{uuid.uuid4().hex[:16]}"
        
        # Create a new session for the client
        try:
            await self.session_service.create_session(
                app_name="streaming_assistant",
                user_id=user_id,
                session_id=session_id,
            )
            stream_logger.info(f"Created new session: {session_id} for client: {client_id}")
        except AlreadyExistsError:
            # This should be extremely rare with UUID, but handle it gracefully
            # Generate a new UUID and try again
            stream_logger.warning(f"Session {session_id} already exists, generating new session ID")
            session_id = f"session_{uuid.uuid4().hex[:16]}"
            await self.session_service.create_session(
                app_name="streaming_assistant",
                user_id=user_id,
                session_id=session_id,
            )
            stream_logger.info(f"Created new session after retry: {session_id}")

        # Define connection-aware tools
        async def save_note_tool(title: str, description: str, details: list[str], note_id: str = None):
            """
            Save a completed Job Description to the database.
            
            Args:
                title: The title of the Job (e.g., 'Kitchen Painting').
                description: A high-level summary of the work required.
                details: A list of specific captured attributes (e.g., ['Room Size: 10x10', 'Color: Blue']).
                note_id: Optional ID of the note to update. If provided, updates existing note. If None, creates new.
            """
            stream_logger.info(f"Tool called: save_note_tool with title='{title}', id='{note_id}'")
            result = database.save_note(title, description, details, note_id)

            asyncio.create_task(
                self.conversation_tracker.extract_and_save_from_note(
                    session_id=session_id,
                    title=title,
                    description=description,
                    details=details
                )
            )
            
            # Send updated notes list to the client
            try:
                notes = database.get_notes()
                await websocket.send(json.dumps({
                    "type": "notes_list",
                    "data": notes
                }))
                stream_logger.info("Sent updated notes list to client after save_note")
            except Exception as e:
                stream_logger.error(f"Error sending notes update: {e}")
                
            return result

        # Create agent for this connection
        agent = Agent(
            name="voice_assistant_agent",
            model=MODEL,
            instruction=SYSTEM_INSTRUCTION,
            tools=[
                google_search,
                save_note_tool,
            ],
        )

        # Create runner
        runner = Runner(
            app_name="streaming_assistant",
            agent=agent,
            session_service=self.session_service,
        )

        # Create live request queue
        live_request_queue = LiveRequestQueue()

        # Create run config with audio settings
        run_config = RunConfig(
            streaming_mode=StreamingMode.BIDI,
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=VOICE_NAME
                    )
                )
            ),
            response_modalities=None, # Removed as it is not a valid field in RunConfig
            output_audio_transcription=types.AudioTranscriptionConfig(),
            input_audio_transcription=types.AudioTranscriptionConfig(),
        )

        # Queues for audio and video data from the client
        audio_queue = asyncio.Queue()
        video_queue = asyncio.Queue()

        async with asyncio.TaskGroup() as tg:
            # Task to process incoming WebSocket messages
            async def receive_client_messages():
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        if data.get("type") == "audio":
                            audio_bytes = base64.b64decode(
                                data.get("data", ""))
                            await audio_queue.put(audio_bytes)
                        elif data.get("type") == "video":
                            video_bytes = base64.b64decode(
                                data.get("data", ""))
                            video_mode = data.get("mode", "webcam")
                            await video_queue.put({"data": video_bytes, "mode": video_mode})
                        elif data.get("type") == "image":
                            # Handle static image upload
                            image_data = data.get("data")
                            mime_type = "image/jpeg" # Default
                            
                            if image_data:
                                try:
                                    # Check if it has a prefix (data:image/jpeg;base64,)
                                    if "," in image_data:
                                        header, base64_data = image_data.split(",", 1)
                                        # Extract mime type from header "data:image/png;base64"
                                        if "data:" in header and ";" in header:
                                            mime_type = header.split(":")[1].split(";")[0]
                                        image_data = base64_data
                                    
                                    image_bytes = base64.b64decode(image_data)
                                    stream_logger.info(f"Received image ({mime_type}) from client, sending to Gemini...")
                                    
                                    # Saves the image locally
                                    os.makedirs("transcripts", exist_ok=True)
                                    image_filename = f"{session_id}_{uuid.uuid4().hex}.jpg"
                                    image_path = f"transcripts/{image_filename}"

                                    with open(image_path, "wb") as img_file:
                                        img_file.write(image_bytes)

                                    # Add line to transcript
                                    with open(f"transcripts/{session_id}.txt", "a", encoding="utf-8") as f:
                                        f.write(f"IMAGE UPLOADED: {image_filename}\n\n")

                                    stream_logger.info(f"Saved image to {image_path}")

                                    try:
                                        if hasattr(self, 'conversation_tracker') and self.conversation_tracker:
                                            blob_storage = self.conversation_tracker.blob_storage
                                            if blob_storage:
                                                azure_blob_path = blob_storage.upload_image(
                                                    image_data=image_bytes,
                                                    filename=image_filename
                                                )
                                                if azure_blob_path:
                                                    stream_logger.info(f"Image uploaded to Azure: {azure_blob_path}")
                                                else:
                                                    stream_logger.warning("Failed to upload image to Azure")
                                    except Exception as e:
                                        stream_logger.error(f"Error uploading image to Azure: {e}")
                                    
                                    # Send as a content message (better for static images)
                                    live_request_queue.send_content(
                                        types.Content(
                                            role="user",
                                            parts=[types.Part(inline_data=types.Blob(
                                                mime_type=mime_type,
                                                data=image_bytes
                                            ))]
                                        )
                                    )
                                except Exception as e:
                                    stream_logger.error(f"Error processing image: {e}")
                        elif data.get("type") == "video_file":
                            # Handle static video file upload (large files via File API)
                            video_data = data.get("data")
                            mime_type = "video/mp4" # Default
                            
                            if video_data:
                                try:
                                    # Check if it has a prefix (data:video/mp4;base64,)
                                    if "," in video_data:
                                        header, base64_data = video_data.split(",", 1)
                                        # Extract mime type from header "data:video/mp4;base64"
                                        if "data:" in header and ";" in header:
                                            mime_type = header.split(":")[1].split(";")[0]
                                        video_data = base64_data
                                    
                                    video_bytes = base64.b64decode(video_data)
                                    # Normalize MIME type for Gemini compatibility
                                    # invalid: video/quicktime -> video/mp4
                                    if mime_type == "video/quicktime":
                                        mime_type = "video/mp4"
                                    
                                    stream_logger.info(f"Received video file from client. Uploading as {mime_type} to Google Cloud Storage...")

                                    # Use Google Cloud Storage
                                    from google.cloud import storage
                                    
                                    try:
                                        storage_client = storage.Client(project=PROJECT_ID)
                                        # Use a predictable bucket name based on project
                                        bucket_name = f"{PROJECT_ID}-job-assistant-media"
                                        
                                        from google.cloud.exceptions import NotFound, Forbidden
                                        try:
                                            bucket = storage_client.get_bucket(bucket_name)
                                        except NotFound:
                                            stream_logger.error(f"Bucket {bucket_name} does not exist")
                                        except Forbidden as e:
                                            stream_logger.error(f"Permission denied accessing bucket {bucket_name}: {e}")
                                            raise Exception(f"No permission to access bucket GCS bucket {bucket_name}")
                                        except Exception:
                                            stream_logger.info(f"Bucket {bucket_name} not found, creating...")
                                            bucket = storage_client.create_bucket(bucket_name, location=LOCATION)
                                            await websocket.send(json.dumps({
                                                "type": "error",
                                                "data": f"Storage bucket not configured. Please contact administrator."
                                            }))
                                            raise Exception(f"GCS bucket {bucket_name} does not exist and cannot be created. Please create it manually.")
                                        
                                        # Create unique filename
                                        blob_name = f"uploads/{uuid.uuid4()}.mp4"
                                        blob = bucket.blob(blob_name)
                                        
                                        # Upload directly from bytes
                                        blob.upload_from_string(video_bytes, content_type=mime_type)
                                        
                                        gs_uri = f"gs://{bucket_name}/{blob_name}"
                                        stream_logger.info(f"File uploaded to GCS: {gs_uri}")

                                        try:
                                            if hasattr(self, 'conversation_tracker') and self.conversation_tracker:
                                                blob_storage = self.conversation_tracker.blob_storage
                                                if blob_storage:
                                                    # Create filename for Azure
                                                    video_filename = f"{session_id}_{uuid.uuid4().hex}.mp4"
                                                    
                                                    azure_blob_path = blob_storage.upload_video(
                                                        video_data=video_bytes,
                                                        filename=video_filename
                                                    )
                                                    
                                                    if azure_blob_path:
                                                        stream_logger.info(f"Video uploaded to Azure: {azure_blob_path}")
                                                        
                                                        # Add reference to transcript
                                                        os.makedirs("transcripts", exist_ok=True)
                                                        with open(f"transcripts/{session_id}.txt", "a", encoding="utf-8") as f:
                                                            f.write(f"VIDEO UPLOADED: {video_filename}\n")
                                                            f.write(f"GCS URI: {gs_uri}\n\n")
                                                    else:
                                                        stream_logger.warning("Failed to upload video to Azure")
                                        except Exception as e:
                                            stream_logger.error(f"Error uploading video to Azure: {e}")

                                        # Send as file reference + prompt
                                        live_request_queue.send_content(
                                            types.Content(
                                                role="user",
                                                parts=[
                                                    types.Part(file_data=types.FileData(
                                                        mime_type=mime_type,
                                                        file_uri=gs_uri
                                                    )),
                                                    types.Part(text="I have uploaded a video of the project. Please help me analyze it.")
                                                ]
                                            )
                                        )

                                    except Exception as e:
                                        stream_logger.error(f"GCS Upload failed: {e}")
                                        raise e


                                except Exception as e:
                                    stream_logger.error(f"Error processing video file: {e}")
                                    import traceback
                                    traceback.print_exc()
                        elif data.get("type") == "end":
                            stream_logger.info(
                                "Client has concluded data transmission for this turn.")
                        elif data.get("type") == "text":
                            text_content = data.get("data")
                            stream_logger.info(f"Received text from client: {text_content}")

                            # Send to agent
                            live_request_queue.send_content(
                                types.Content(role="user", parts=[types.Part(text=text_content)])
                            )

                            # NEW — Log typed user text into transcript buffer
                            try:
                                # Append to the transcript buffer used in receive_service_responses()
                                self._input_texts.append(text_content)
                            except Exception as e:
                                stream_logger.warning(f"Could not append typed text to input_texts: {e}")

                        elif data.get("type") == "get_notes":
                            notes = database.get_notes()
                            await websocket.send(json.dumps({
                                "type": "notes_list",
                                "data": notes
                            }))
                        elif data.get("type") == "delete_note":
                            note_id = data.get("data")
                            if note_id:
                                database.delete_note(note_id)
                                # Send updated list
                                notes = database.get_notes()
                                await websocket.send(json.dumps({
                                    "type": "notes_list",
                                    "data": notes
                                }))
                        elif data.get("type") == "generate_summary":
                            # Instruct the agent to summarize and save
                            prompt = "The user wants to save the current job description. Please generate a structured summary including all gathered details and save it using the save_note tool."
                            live_request_queue.send_content(
                                types.Content(role="user", parts=[types.Part(text=prompt)])
                            )
                        elif data.get("type") == "update_note":
                            # Provide context to the agent
                            note_content = data.get("data")
                            # We expect data to be a string or object. If object, we might need to parse.
                            # Frontend implementation plan sends a composite string.
                            # We can also extract ID if sent separately, but frontend sends content string.
                            # Wait, the prompt needs the ID to pass to the tool. 
                            # Let's adjust input handling.
                            
                            # Correction: The frontend sends a string in 'data' field based on my plan:
                            # "Title: ...\nDescription: ...\nDetails: ...\nID: ..." -> Wait, plan said:
                            # "Title: ${note.title}\nDescription: ${note.description}\nDetails: ${note.details.join('\n')}"
                            # It missed ID in the content string, but we need it for the prompt.
                            
                            # Actually, cleaner to send ID in the message from frontend. 
                            # Current frontend plan: 
                            # chatInterfaceRef.current.sendMessage('update_note', content);
                            # I should update frontend to send { id, content } object or similar.
                            
                            # Let's assume frontend will send a JSON object in 'data' or I will parse it if string.
                            # However, 'sendMessage' takes (type, data).
                            # If 'data' is an object { id: "...", content: "..." }, then:
                            
                            req_data = data.get("data")
                            if isinstance(req_data, dict):
                                note_id = req_data.get("id")
                                note_content = req_data.get("content")
                                prompt = f"The user wants to update the Job Description with ID '{note_id}'. Current content: {note_content}. Please listen to the user's updates and use the save_note_tool with note_id='{note_id}' to update it. DO NOT mention the internal ID in your response to the user, just confirm you are updating the job."
                            else:
                                # Fallback if just string
                                prompt = f"The user wants to update this Job Description. Content: {req_data}. Please ask for what to change."

                            live_request_queue.send_content(
                                types.Content(role="user", parts=[types.Part(text=prompt)])
                            )
                    except json.JSONDecodeError:
                        stream_logger.error(
                            "Could not decode incoming JSON message.")
                    except Exception as e:
                        stream_logger.error(
                            f"Exception while processing client message: {e}")

            async def send_audio_to_service():
                while True:
                    data = await audio_queue.get()
                    live_request_queue.send_realtime(
                        types.Blob(
                            data=data, mime_type=f"audio/pcm;rate={SEND_SAMPLE_RATE}")
                    )
                    audio_queue.task_done()

            async def send_video_to_service():
                while True:
                    video_data = await video_queue.get()
                    video_bytes = video_data.get("data")
                    video_mode = video_data.get("mode", "webcam")
                    stream_logger.info(
                        f"Transmitting video frame from source: {video_mode}")
                    live_request_queue.send_realtime(
                        types.Blob(data=video_bytes, mime_type="image/jpeg")
                    )
                    video_queue.task_done()

            async def receive_service_responses():
                # Track user and model outputs between turn completion events
                input_texts = self._input_texts
                output_texts = self._output_texts
                current_session_id = None

                # Flag to track if we've seen an interruption in the current turn
                interrupted = False
                accumulated_response = ""

                # Initialize the live stream
                live_stream = runner.run_live(
                    user_id=user_id,
                    session_id=session_id,
                    live_request_queue=live_request_queue,
                    run_config=run_config,
                )

                # Ssnd an initial setup message to get the conversation started
                try:
                    stream_logger.info("Sending initial prompt to service...")
                    initial_prompt = "Hello. Please introduce yourself as the Job Scope Assistant and ask the user what project they are working on."
                    live_request_queue.send_content(
                        types.Content(role="user", parts=[types.Part(text=initial_prompt)])
                    )
                except Exception as e:
                    stream_logger.error(
                        f"Exception while sending initial prompt: {e}")

                # Process responses from the agent
                try:
                    async for event in live_stream:
                        # Check for turn completion or interruption using string matching
                        # This is a fallback approach until a proper API exists
                        # event_str = str(event) # Commented out to reduce noise
                        # stream_logger.info(f"FULL EVENT DEBUG: {event_str}")

                        # If there's a session resumption update, store the session ID
                        if hasattr(event, 'session_resumption_update') and event.session_resumption_update:
                            update = event.session_resumption_update
                            if update.resumable and update.new_handle:
                                current_session_id = update.new_handle
                                stream_logger.info(
                                    f"Established new session with handle: {current_session_id}")
                                # Send session ID to client
                                session_id_msg = json.dumps({
                                    "type": "session_id",
                                    "data": current_session_id
                                })
                                await websocket.send(session_id_msg)

                        # Handle input transcription (User text)
                        if hasattr(event, "input_transcription") and event.input_transcription:
                            if event.input_transcription.text:
                                await websocket.send(json.dumps({
                                    "type": "user_transcript",
                                    "data": event.input_transcription.text
                                }))
                                input_texts.append(event.input_transcription.text)

                        # Handle output transcription (Model text)
                        if hasattr(event, "output_transcription") and event.output_transcription:
                            if event.output_transcription.text:
                                text = event.output_transcription.text
                                delta = ""
                                
                                # Check if this is an accumulated update or a new delta
                                if accumulated_response and text.startswith(accumulated_response):
                                    delta = text[len(accumulated_response):]
                                    accumulated_response = text
                                else:
                                    # It's a delta (or start)
                                    delta = text
                                    accumulated_response += text

                                if delta:
                                    stream_logger.info(f"DEBUG: Sending text delta: {delta}")
                                    await websocket.send(json.dumps({
                                        "type": "text",
                                        "data": delta
                                    }))
                                    output_texts.append(delta)
                                else:
                                    stream_logger.info("DEBUG: Skipping redundant text event")

                        # Handle content
                        if event.content and event.content.parts:
                            for part in event.content.parts:
                                # Process audio content
                                if hasattr(part, "inline_data") and part.inline_data:
                                    b64_audio = base64.b64encode(
                                        part.inline_data.data).decode("utf-8")
                                    await websocket.send(json.dumps({"type": "audio", "data": b64_audio}))

                        # Check for interruption
                        if event.interrupted and not interrupted:
                            stream_logger.warning(
                                "User has interrupted the stream.")
                            await websocket.send(json.dumps({
                                "type": "interrupted",
                                "data": "Response interrupted by user input"
                            }))
                            interrupted = True

                        # Check for turn completion
                        if event.turn_complete:
                            # Only send turn_complete if there was no interruption
                            if not interrupted:
                                stream_logger.info(
                                    "The model has completed its turn.")
                                await websocket.send(json.dumps({
                                    "type": "turn_complete",
                                    "session_id": current_session_id
                                }))
                            # Log collected transcriptions for debugging
                            if input_texts:
                                # Get unique texts to prevent duplication
                                unique_texts = list(dict.fromkeys(input_texts))
                                stream_logger.info(
                                    f"Transcribed user speech: {' '.join(unique_texts)}")
                            if output_texts:
                                # Get unique texts to prevent duplication
                                unique_texts = list(dict.fromkeys(output_texts))
                                stream_logger.info(
                                    f"Generated model response: {' '.join(unique_texts)}")
                            
                            # Saves this turn to a local file
                            # Deduplicate and join text segments
                            user_turn = " ".join(dict.fromkeys(input_texts)) if input_texts else ""
                            model_turn = " ".join(dict.fromkeys(output_texts)) if output_texts else ""

                            # Ensure transcripts directory exists
                            os.makedirs("transcripts", exist_ok=True)

                            # Build file path using session ID
                            transcript_path = f"transcripts/{session_id}.txt"

                            # Append to transcript file
                            with open(transcript_path, "a", encoding="utf-8") as f:
                                if user_turn:
                                    f.write(f"USER: {user_turn}\n")
                                if model_turn:
                                    f.write(f"MODEL: {model_turn}\n")
                                f.write("\n--- TURN COMPLETE ---\n\n")

                            stream_logger.info(f"Turn logged to: {transcript_path}")

                            # Upload complete transcript to Azure after each turn
                            try:
                                if hasattr(self, 'conversation_tracker') and self.conversation_tracker:
                                    blob_storage = self.conversation_tracker.blob_storage
                                    if blob_storage:
                                        # Read complete transcript
                                        with open(transcript_path, "r", encoding = "utf-8") as f:
                                            full_transcript = f.read()
                                        
                                        blob_path = blob_storage.upload_transcript(
                                            transcript_text=full_transcript,
                                            filename = session_id
                                        )

                                        if blob_path:
                                            stream_logger.info(f"Transcript uploaded to Azure: {blob_path}")
                            except Exception as e:
                                stream_logger.error(f"Error uploading transcript to Azure: {e}")
                            
                            # Reset for next turn
                            self._input_texts.clear()
                            self._output_texts.clear()
                            accumulated_response = ""
                            interrupted = False
                except websockets.exceptions.ConnectionClosed:
                    stream_logger.info("Client disconnected during service response.")
                except Exception as e:
                    stream_logger.error(f"Error in receive_service_responses: {e}")

            # Start all tasks
            tg.create_task(receive_client_messages(),
                           name="ClientMessageReceiver")
            tg.create_task(send_audio_to_service(), name="AudioSender")
            tg.create_task(send_video_to_service(), name="VideoSender")
            tg.create_task(receive_service_responses(),
                           name="ServiceResponseReceiver")
        return session_id


async def main():
    """Main function to start the server"""
    server = StreamingService()
    await server.start_server()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        stream_logger.info("Server is shutting down.")
    except Exception as e:
        stream_logger.critical(f"A fatal unhandled exception occurred: {e}")
        import traceback
        traceback.print_exc()

