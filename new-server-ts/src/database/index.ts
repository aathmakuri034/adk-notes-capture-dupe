import type { NotesRepository, Note as InternalNote } from '../application/streaming/types.js';

export interface FrontendNote {
  id: string;
  title: string;
  description: string;
  details: string[];
  timestamp: string;
}
export type { FrontendNote as Note };

function toFrontendNote(note: InternalNote): FrontendNote {
  return {
    id: note.id,
    title: note.title,
    description: note.description,
    details: note.details,
    timestamp: note.created_at,
  };
}

export interface NotesApi {
  getNotes(): FrontendNote[];
  getNote(noteId: string): FrontendNote | null;
  deleteNote(noteId: string): boolean;
  close(): void;
}

export function createNotesApi(repository: NotesRepository): NotesApi {
  return {
    getNotes: () => repository.getNotes().map(toFrontendNote),
    getNote: (noteId) => {
      const note = repository.getNote(noteId);
      return note ? toFrontendNote(note) : null;
    },
    deleteNote: (noteId) => {
      const existing = repository.getNote(noteId);
      if (!existing) return false;
      repository.deleteNote(noteId);
      return true;
    },
    close: () => repository.close(),
  };
}

/**
 * Creates a NotesApi backed by SQLite. Each call opens a new database
 * connection — callers should cache the returned instance for the
 * lifetime of their process.
 */
export async function createDefaultNotesApi(): Promise<NotesApi> {
  const { SQLiteNotesRepository } = await import(
    '../infrastructure/database/sqlite-notes-repository.js'
  );
  return createNotesApi(new SQLiteNotesRepository());
}