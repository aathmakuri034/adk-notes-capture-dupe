# ChatInterface.tsx Explanation

## Overview

The [`ChatInterface`](components/ChatInterface.tsx:25) component is a React-based chat interface designed for interacting with a voice agent via WebSocket. It supports text messaging, voice recording/playback, image and video uploads, and real-time communication with a backend server. The component is built using TypeScript and integrates with custom libraries for WebSocket handling and audio recording.

## Key Features

- **Real-time Chat**: Displays messages from both user and agent, with support for text, images, and videos.
- **Voice Interaction**: Allows recording and sending audio data, and plays back audio responses from the agent.
- **File Uploads**: Supports uploading images and videos (with size limits for videos).
- **Connection Management**: Handles WebSocket connection states (disconnected, connecting, connected).
- **Audio Playback**: Queues and plays audio chunks received from the server.
- **Optimistic UI Updates**: Adds user messages immediately to the UI for better responsiveness.

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

- [`playNextAudioChunk`](components/ChatInterface.tsx:157): Processes and plays queued audio data using Web Audio API.
- [`startRecording`](components/ChatInterface.tsx:400): Starts audio recording and sets up interval for sending audio chunks.
- [`stopRecording`](components/ChatInterface.tsx:433): Stops recording and clears intervals.
- [`toggleRecording`](components/ChatInterface.tsx:449): Toggles recording on/off.

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

### UI and Effects

- [`scrollToBottom`](components/ChatInterface.tsx:127): Scrolls the messages container to the bottom.
- UseEffect hooks manage cleanup, user interaction for audio resume, and message scrolling.

## UI Layout

The component renders a chat interface with:

- **Header**: Displays title and connection status indicator.
- **Messages Area**: Shows chat messages, with conditional rendering for start screen and speaking indicator.
- **Input Area**: Includes buttons for recording, image/video upload, and text input form.

## Dependencies

- React hooks: `useState`, `useEffect`, `useRef`, `useImperativeHandle`, `useCallback`.
- Custom libraries: [`VoiceAgentWebSocket`](lib/websocket-client.ts), [`AudioRecorder`](lib/audio-recorder.ts).
- Web APIs: WebSocket, Web Audio API, FileReader.

## Notes

- The component handles audio fragmentation and deduplication for messages.
- Video uploads are limited to 50MB.
- Audio is processed at 24kHz sample rate.
- The component is forward-ref enabled for external control.
