import type { Note } from '../../shared/ws-messages.js';

export type { Note };

export interface NotesRepository {
  saveNote(title: string, description: string, details: string[], noteId?: string): Note;
  deleteNote(noteId: string): void;
  getNotes(): Note[];
  getNote(noteId: string): Note | undefined;
  close(): void;
}

export interface JobExtractor {
  extractFromNote(sessionId: string, title: string, description: string, details: string[]): Promise<void>;
}

export interface ToolCallEvent {
  name: string;
  args: Record<string, unknown>;
  toolCallId: string;
  respond: (result: { success: boolean; note_id?: string; error?: string }) => void;
}

export interface GeminiLiveClient {
  connect(sessionId: string, userId: string): Promise<void>;
  sendAudio(data: Buffer): Promise<void>;
  sendText(text: string): Promise<void>;
  sendImage(data: Buffer, mimeType: string): Promise<void>;
  sendVideo(data: Buffer, mimeType: string, gsUri: string): Promise<void>;
  endTurn(): Promise<void>;
  disconnect(): Promise<void>;
  onAudio(callback: (data: Buffer) => void): void;
  onTranscript(callback: (text: string, isUser: boolean) => void): void;
  onTurnComplete(callback: () => void): void;
  onInterrupted(callback: () => void): void;
  onToolCall(callback: (event: ToolCallEvent) => void): void;
}

export interface StreamingSession {
  connectionId: string;
  sessionId: string;
  userId: string;
}
