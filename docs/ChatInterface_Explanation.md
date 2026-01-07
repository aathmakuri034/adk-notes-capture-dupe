# ChatInterface.tsx Explanation

## Overview

The [`ChatInterface`](components/ChatInterface.tsx:25) component is a React-based chat interface designed for interacting with a voice agent via WebSocket. It supports text messaging, voice recording/playback, image and video uploads, real-time communication with a backend server, and job data tracking. The component is built using TypeScript and integrates with custom libraries for WebSocket handling and audio recording.

## Key Features

- **Real-time Chat**: Displays messages from both user and agent, with support for text, images, and videos.
- **Voice Interaction**: Allows recording and sending audio data, and plays back audio responses from the agent.
- **File Uploads**: Supports uploading images and videos (with size limits for videos).
- **Connection Management**: Handles WebSocket connection states (disconnected, connecting, connected).
- **Audio Playback**: Queues and plays audio chunks received from the server.
- **Optimistic UI Updates**: Adds user messages immediately to the UI for better responsiveness.
- **Job Data Tracking**: Monitors for newly created jobs during the session and provides navigation to the job board.
- **Session Management**: Tracks session start time and polls for job creation.

## Component Structure

### Props and Ref

- **Props**: [`ChatInterfaceProps`](components/ChatInterface.tsx:16) includes optional callbacks for notes list and error handling.
- **Ref**: [`ChatInterfaceRef`](components/ChatInterface.tsx:21) exposes a `sendMessage` method for external control.

### State Management

The component uses several state variables:

- `isConnected`: Boolean indicating WebSocket connection status.
- `isRecording`: Boolean for recording state.
- `connectionStatus`: Enum for connection state ('disconnected', 'connecting', 'connected').
- `messages`: Array of [`Message`](components/ChatInterface.tsx:7) objects containing chat history.
- `inputText`: String for the text input field.
- `isAgentSpeaking`: Boolean indicating if the agent is currently speaking.
- `hasJobData`: Boolean indicating if jobs have been created during the current session.
- `isStarted`: Boolean indicating if the assessment has been started.
- `showJsonPreview`: Boolean controlling the display of the job preview modal.
- `extractedJobJson`: Object containing the extracted job data for preview.
- `isPaused`: Boolean indicating if the conversation is currently paused.

### Refs

Various refs are used for managing DOM elements, audio context, WebSocket, recorder, and queues:

- `audioContextRef`: For Web Audio API context.
- `audioPlayQueueRef`: Queue for audio chunks to play.
- `wsRef`: Reference to the WebSocket client.
- `recorderRef`: Reference to the audio recorder.
- `messagesEndRef`: For auto-scrolling to the bottom of messages.

## Key Functions

### Connection and Initialization

- [`connectToAgent`](components/ChatInterface.tsx:212): Establishes WebSocket connection and sets up event listeners for various message types (notes_list, text, user_transcript, audio, error, etc.).
- [`handleStart`](components/ChatInterface.tsx:353): Initializes audio context, connects to the agent, and starts recording.
- [`initAudioContext`](components/ChatInterface.tsx:146): Creates or resumes the AudioContext for audio playback.

### Audio Handling

- [`playNextAudioChunk`](components/ChatInterface.tsx:230): Processes and plays queued audio data using Web Audio API.
- [`startRecording`](components/ChatInterface.tsx:511): Starts audio recording and sets up interval for sending audio chunks.
- [`stopRecording`](components/ChatInterface.tsx:546): Stops recording and clears intervals.
- [`toggleRecording`](components/ChatInterface.tsx:562): Toggles recording on/off.

### Pause and Resume Functionality

- [`pauseConversation`](components/ChatInterface.tsx:65): Pauses the conversation by stopping recording, clearing audio queues, and setting paused state.
- [`resumeConversation`](components/ChatInterface.tsx:81): Resumes the conversation by restarting recording if it was active before pause.
- [`handlePauseAndView`](components/ChatInterface.tsx:91): Pauses conversation and fetches the most recent job for preview.

### Message Handling

- [`handleSendMessage`](components/ChatInterface.tsx:457): Sends text messages via WebSocket and updates UI optimistically.
- Event listeners in `connectToAgent` handle incoming messages:
  - `text`: Appends or updates agent text messages.
  - `user_transcript`: Handles user speech transcripts.
  - `audio`: Decodes and queues audio data for playback.
  - `notes_list`: Calls the notes callback.
  - `error`: Handles errors and updates connection status.

### File Uploads

- [`handleImageUpload`](components/ChatInterface.tsx:48) and [`handleVideoUpload`](components/ChatInterface.tsx:52): Trigger file input clicks.
- [`handleFileChange`](components/ChatInterface.tsx:56) and [`handleVideoFileChange`](components/ChatInterface.tsx:86): Process selected files, convert to base64, add to messages, and send via WebSocket.

### Job Data Management

- [`handleGoToJobBoard`](components/ChatInterface.tsx:122): Navigates to the job board page.
- [`handlePauseAndView`](components/ChatInterface.tsx:91): Pauses conversation and fetches the most recent job for preview in a modal.
- **Job Data Polling**: useEffect hook that polls `/api/jobs` endpoint every 5 seconds to check for newly created jobs during the session.
- **Session Tracking**: Tracks session start time and filters jobs created after session initialization.
- **Job Preview Modal**: Displays extracted job details in a modal overlay when paused, allowing users to resume conversation or navigate to job board.

### UI and Effects

- [`scrollToBottom`](components/ChatInterface.tsx:127): Scrolls the messages container to the bottom.
- UseEffect hooks manage cleanup, user interaction for audio resume, and message scrolling.

## UI Layout

The component renders a chat interface with:

- **Header**: Displays title, connection status indicator, resume button when paused, "View Job" button when job data is detected, and logout button.
- **Messages Area**: Shows chat messages, with conditional rendering for enhanced start screen, speaking indicator, and job preview modal overlay.
- **Input Area**: Includes buttons for recording, image/video upload, and text input form, disabled when paused.
- **Start Screen**: Enhanced welcome screen with "Start Assessment" button that initializes the session and begins job data tracking.
- **Job Preview Modal**: Full-screen overlay displaying extracted job details with options to resume conversation or navigate to job board.

## Dependencies

- React hooks: `useState`, `useEffect`, `useRef`, `useImperativeHandle`, `useCallback`.
- Custom libraries: [`VoiceAgentWebSocket`](lib/websocket-client.ts), [`AudioRecorder`](lib/audio-recorder.ts).
- Web APIs: WebSocket, Web Audio API, FileReader.

## Notes

- The component handles audio fragmentation and deduplication for messages.
- Video uploads are limited to 50MB (with error message showing 25MB due to base64 encoding overhead).
- Audio is processed at 24kHz sample rate.
- The component is forward-ref enabled for external control.
- Job data polling occurs every 5 seconds when the assessment is started (increased from 2 seconds for better performance).
- Session start time is tracked to filter jobs created during the current session.
- Pause/Resume functionality allows users to temporarily halt conversation for job review.
- Job preview modal provides immediate feedback on extracted job data without leaving the chat.
- Logout functionality integrates with Supabase authentication.
- Conversation state is preserved during pause, including recording status and audio queues.
