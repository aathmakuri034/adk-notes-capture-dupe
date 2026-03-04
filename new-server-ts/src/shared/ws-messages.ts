// Note type for notes_list response
export interface Note {
  id: string;
  title: string;
  description: string;
  details: string[];
  created_at: string;
  updated_at: string;
  azure_job_file_path: string | null;
  last_transcript_updated: string | null;
}

// Client messages (from frontend to server)
export type ClientMessage =
  | { type: 'audio'; data: string }
  | { type: 'video'; data: string; mode: string }
  | { type: 'video_file'; data: string }
  | { type: 'image'; data: string }
  | { type: 'text'; data: string }
  | { type: 'end' }
  | { type: 'get_notes' }
  | { type: 'delete_note'; data: string }
  | { type: 'update_note'; data: { id: string; content: string } }
  | { type: 'generate_summary' };

// Server messages (from server to frontend)
export type ServerMessage =
  | { type: 'ready' }
  | { type: 'text'; data: string }
  | { type: 'audio'; data: string }
  | { type: 'user_transcript'; data: string }
  | { type: 'model_transcript'; data: string }
  | { type: 'notes_list'; data: Note[] }
  | { type: 'turn_complete'; session_id?: string }
  | { type: 'interrupted'; data: string }
  | { type: 'session_id'; data: string }
  | { type: 'error'; data: string };

// Message type guards
export function isClientMessage(obj: unknown): obj is ClientMessage {
  if (typeof obj !== 'object' || obj === null) return false;
  const msg = obj as { type?: unknown };
  return typeof msg.type === 'string';
}

export function isServerMessage(obj: unknown): obj is ServerMessage {
  if (typeof obj !== 'object' || obj === null) return false;
  const msg = obj as { type?: unknown };
  return typeof msg.type === 'string';
}

// Message parsers
export function parseClientMessage(data: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (isClientMessage(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseServerMessage(data: string): ServerMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (isServerMessage(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// Message serializers
export function serializeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}