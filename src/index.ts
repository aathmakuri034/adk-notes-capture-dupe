// ADK Notes Capture Agent - Main Entry Point
// A voice-enabled job intake and notes capture library

// ============================================
// Components
// ============================================
export {
  ChatInterface,
  NotesCapture,
  NotesDisplay,
  JobBoard,
  UnifiedInterface,
} from './components';

// ============================================
// Component Props Types
// ============================================
export type {
  ChatInterfaceProps,
  NotesCaptureProps,
  NotesDisplayProps,
  JobBoardProps,
  UnifiedInterfaceProps,
} from './components';

// ============================================
// Core Types
// ============================================
export type {
  // WebSocket Types
  MessageType,
  WebSocketMessage,
  WebSocketCallback,

  // Data Types
  Note,
  Job,
  JobMetadata,
  ChatMessage,
  HistoryItem,

  // Configuration Types
  ADKConfig,
  ChatInterfaceConfig,
  NotesCaptureConfig,
  JobBoardConfig,

  // Ref Types
  ChatInterfaceRef,
  NotesCaptureRef,
} from './types';

// ============================================
// Utilities (for advanced users)
// ============================================
export { VoiceAgentWebSocket, AudioRecorder } from './utils';
