"""
Voice Notes Capture Service - FINAL PRODUCTION VERSION (Correct Turn Boundaries + Summaries)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core_utils import (
    BaseStreamServer,
    stream_logger,
    MODEL,
    SEND_SAMPLE_RATE,
    PROJECT_ID,
    LOCATION,
)

import asyncio
import json
import base64
import uuid
from datetime import datetime
from pathlib import Path
import time

# Set Google Cloud environment variables
if PROJECT_ID:
    os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
if LOCATION:
    os.environ["GOOGLE_CLOUD_LOCATION"] = LOCATION
    os.environ["GOOGLE_CLOUD_REGION"] = LOCATION

from google.adk.agents import Agent, LiveRequestQueue
from google.adk.runners import Runner
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.errors.already_exists_error import AlreadyExistsError
from google.genai import types
from dotenv import load_dotenv
import websockets

load_dotenv()

# Notes storage directory
NOTES_DIR = "voice_notes_data"
Path(NOTES_DIR).mkdir(exist_ok=True)

# System instruction
NOTES_SYSTEM_INSTRUCTION = """You are a Voice Notes Assistant. Extract information from voice recordings.

When you receive audio, extract:
1. A title (3-8 words)
2. A summary (1-2 sentences)
3. Key points (1-5 items)

Then call save_voice_note immediately.

IMPORTANT: Always create a note, even if recording is brief or unclear.
If unclear: title="Quick Voice Note", summary="Brief recording", key_points=["Content was unclear"]

Always call save_voice_note right away after the audio turn ends.
"""


class NotesStreamingService(BaseStreamServer):
    """Voice notes service with properly managed turn boundaries"""

    def __init__(self, host="0.0.0.0", port=8081):
        super().__init__(host, port)
        self.session_service = InMemorySessionService()
        stream_logger.info("✓ Notes Streaming Service initialized on port 8081")

    async def manage_connection(self, websocket):
        connection_id = id(websocket)
        stream_logger.info(f"New notes connection: {connection_id}")
        await websocket.send(json.dumps({"type": "ready"}))
        
        try:
            await self.handle_notes_stream(websocket, connection_id)
        except websockets.exceptions.ConnectionClosed:
            stream_logger.info(f"Connection closed: {connection_id}")
        except Exception as e:
            stream_logger.error(f"Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            self.active_connections.pop(connection_id, None)

    async def handle_notes_stream(self, websocket, client_id):
        # Buffers
        self._input_texts = []
        self._is_recording = False
        self._audio_count = 0
        self._start_time = 0

        self.active_connections[client_id] = websocket

        user_id = f"notes_user_{client_id}"
        session_id = f"notes_session_{uuid.uuid4().hex[:16]}"

        # Create ADK session
        try:
            await self.session_service.create_session(
                app_name="notes_assistant",
                user_id=user_id,
                session_id=session_id,
            )
        except AlreadyExistsError:
            session_id = f"notes_session_{uuid.uuid4().hex[:16]}"
            await self.session_service.create_session(
                app_name="notes_assistant",
                user_id=user_id,
                session_id=session_id,
            )

        # TOOL DEFINITION
        async def save_voice_note_tool(title: str, summary: str, key_points: list[str]):
            stream_logger.info(f"🎯 TOOL CALLED: Saving note: {title}")

            note_id = f"note_{uuid.uuid4().hex[:12]}"
            timestamp = datetime.now().isoformat()

            note_data = {
                "id": note_id,
                "title": title,
                "summary": summary,
                "key_points": key_points,
                "timestamp": timestamp,
                "transcript": " ".join(self._input_texts),
            }

            filepath = os.path.join(NOTES_DIR, f"{note_id}.json")
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(note_data, f, indent=2, ensure_ascii=False)

            try:
                await websocket.send(json.dumps({
                    "type": "note_saved",
                    "data": note_data
                }))
            except:
                pass

            return f"Saved {note_id}"

        # Create agent
        agent = Agent(
            name="voice_notes_agent",
            model=MODEL,
            instruction=NOTES_SYSTEM_INSTRUCTION,
            tools=[save_voice_note_tool],
        )

        runner = Runner(
            app_name="notes_assistant",
            agent=agent,
            session_service=self.session_service,
        )

        live_request_queue = LiveRequestQueue()
        audio_queue = asyncio.Queue()

        run_config = RunConfig(
            streaming_mode=StreamingMode.BIDI,
            input_audio_transcription=types.AudioTranscriptionConfig(),
        )

        # This will store the summarization prompt text
        self._pending_prompt = None
        live = None
        self._stop_stream = asyncio.Event()
        async with asyncio.TaskGroup() as tg:

            # RECEIVE MESSAGES FROM FRONTEND
            async def receive_client_messages():
                async for raw in websocket:
                    try:
                        data = json.loads(raw)

                        # ✔ START RECORDING → start a new TURN
                        if data.get("type") == "start_recording":
                            stream_logger.info("🎙️ START_RECORDING received")

                            self._is_recording = True
                            self._stop_stream.clear()
                            self._audio_count = 0
                            self._input_texts = []
                            self._start_time = time.time()

                            # OPEN TURN
                            live_request_queue.send_content(
                                types.Content(
                                    role="user",
                                    parts=[types.Part(text="Begin voice note now.")]
                                )
                            )
                            continue

                        # ✔ AUDIO CHUNK
                        if data.get("type") == "audio":
                            if self._is_recording is False:
                                continue

                            audio_bytes = base64.b64decode(data["data"])
                            await audio_queue.put(audio_bytes)
                            continue

                        # ✔ STOP_RECORDING → close turn
                        if data.get("type") == "stop_recording":
                            stream_logger.info("🛑 STOP_RECORDING received")

                            self._is_recording = False
                            self._stop_stream.set()

                            transcript = " ".join(self._input_texts).strip()
                            if not transcript:
                                transcript = "[No speech detected]"

                            self._pending_prompt = (
                                f"Recording finished.\n\n"
                                f"Transcript: {transcript}\n\n"
                                f"Extract title, summary, and 1–5 key points. "
                                f"Call save_voice_note immediately."
                            )
                            continue


                        # ✔ GET NOTES
                        if data.get("type") == "get_notes":
                            all_notes = self.get_all_notes()
                            await websocket.send(json.dumps({
                                "type": "notes_list",
                                "data": all_notes
                            }))
                            continue

                    except Exception as e:
                        stream_logger.error(f"Receive error: {e}")
                        import traceback
                        traceback.print_exc()

            # SEND AUDIO TO GEMINI
            async def send_audio():
                while True:
                    pcm = await audio_queue.get()

                    if not self._is_recording and audio_queue.empty():
                        audio_queue.task_done()
                        stream_logger.info("🧹 Audio sender drained and stopped")
                        break

                    if not self._is_recording:
                        audio_queue.task_done()
                        continue

                    if len(pcm) < 320:
                        audio_queue.task_done()
                        continue

                    try:
                        live_request_queue.send_realtime(
                            types.Blob(
                                data=pcm,
                                mime_type=f"audio/pcm;rate={SEND_SAMPLE_RATE}"
                            )
                        )
                    except Exception as e:
                        stream_logger.error(f"Realtime audio error: {e}")

                    audio_queue.task_done()



            # RECEIVE MODEL RESPONSES
            async def receive_service():
                nonlocal live
                live = runner.run_live(
                    user_id=user_id,
                    session_id=session_id,
                    live_request_queue=live_request_queue,
                    run_config=run_config,
                )

                async for event in live:
                    if self._stop_stream.is_set():
                        stream_logger.info("🧹 Stream stopped cleanly")
                        break


                    # ✔ TRANSCRIPTION CHUNKS
                    if hasattr(event, "input_transcription") and event.input_transcription:
                        text = event.input_transcription.text
                        if text:
                            self._input_texts.append(text)
                            await websocket.send(json.dumps({
                                "type": "text",
                                "data": text
                            }))

                    # ✔ TURN COMPLETE → Now send summarization prompt
                    if event.turn_complete:
                        stream_logger.info("✅ TURN COMPLETE")

                        if self._pending_prompt:
                            live_request_queue.send_content(
                                types.Content(
                                    role="user",
                                    parts=[types.Part(text=self._pending_prompt)]
                                )
                            )
                            self._pending_prompt = None

                        await websocket.send(json.dumps({"type": "recording_complete"}))

            tg.create_task(receive_client_messages())
            tg.create_task(send_audio())
            tg.create_task(receive_service())

    def get_all_notes(self):
        notes = []
        if not os.path.exists(NOTES_DIR):
            return notes

        for file in os.listdir(NOTES_DIR):
            if file.startswith("note_") and file.endswith(".json"):
                try:
                    with open(os.path.join(NOTES_DIR, file), "r", encoding="utf-8") as f:
                        notes.append(json.load(f))
                except:
                    continue

        notes.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return notes


async def main():
    server = NotesStreamingService()
    await server.start_server()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except Exception as e:
        stream_logger.error(f"Fatal error: {e}")
