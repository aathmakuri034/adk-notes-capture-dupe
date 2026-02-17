// Core types for the ADK Notes Capture Agent library

// ============================================
// WebSocket Types
// ============================================

export type MessageType =
  | 'ready'
  | 'audio'
  | 'text'
  | 'user_transcript'
  | 'interrupted'
  | 'turn_complete'
  | 'session_id'
  | 'notes_list'
  | 'note_saved'
  | 'recording_complete'
  | 'error';

export interface WebSocketMessage {
  type: MessageType;
  data?: string | any;
  session_id?: string;
}

export type WebSocketCallback = (message: WebSocketMessage) => void;

// ============================================
// Note Types
// ============================================

export interface Note {
  id: string;
  title: string;
  description?: string;
  summary?: string;
  details?: string[];
  key_points?: string[];
  timestamp: string | Date;
  duration?: number;
  // Legacy fields for backwards compatibility
  userTranscript?: string;
  fullText?: string;
}

// ============================================
// Job Types
// ============================================

export interface JobMetadata {
  estimated_duration_minutes: number;
  urgency: string;
  location_context: string;
  job_category: string;
  problem_type: string;
  complexity: string;
  communication_preference?: string;
  key_details: string[];
}

export interface Job {
  id: string;
  title: string;
  summary: string;
  description?: string;
  category?: string;
  metadata: JobMetadata;
  created_at: string;
  conversation_turns?: number;
}

// ============================================
// Message Types (Chat)
// ============================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  image?: string;
  video?: string;
  timestamp: Date;
}

// ============================================
// Configuration Types
// ============================================

export interface ADKConfig {
  /** WebSocket URL for job scope assessment service (default: ws://localhost:8080) */
  jobServiceUrl?: string;
  /** WebSocket URL for voice notes service (default: ws://localhost:8081) */
  notesServiceUrl?: string;
  /** API base URL for fetching jobs/notes (default: /api) */
  apiBaseUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
}

export interface ChatInterfaceConfig extends ADKConfig {
  /** Custom logout handler - if not provided, logout button won't be shown */
  onLogout?: () => void | Promise<void>;
  /** Custom navigation handler for job board */
  onNavigateToJobBoard?: () => void;
  /** Custom handler when a job is extracted */
  onJobExtracted?: (job: Job) => void;
}

export interface NotesCaptureConfig extends ADKConfig {
  /** Called when a note is successfully saved */
  onNoteSaved?: (note: Note) => void;
}

export interface JobBoardConfig extends ADKConfig {
  /** Custom job click handler */
  onJobSelect?: (job: Job) => void;
  /** Custom handler for viewing job JSON */
  onViewJson?: (jobId: string, json: string) => void;
}

// ============================================
// Component Ref Types
// ============================================

export interface ChatInterfaceRef {
  sendMessage: (type: string, data?: any) => void;
}

export interface NotesCaptureRef {
  stopRecording: () => void;
}

// ============================================
// History Types
// ============================================

export interface HistoryItem {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}
