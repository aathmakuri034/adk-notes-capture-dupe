import Database from 'better-sqlite3';
import { join } from 'path';

// Store database in the consumer's project root, not inside node_modules.
const DB_PATH = join(process.cwd(), 'notes.db');

let db: Database.Database | null = null;

export interface Note {
  id: string;
  title: string;
  description: string;
  details: string[];
  jobId?: string;
  timestamp: string;
}

/** Get the database instance, initializing if needed. */
function getDb(): Database.Database {
  if (!db) initDb();
  return db as Database.Database;
}

export function initDb(): void {
  if (db) return;
  db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      details TEXT,
      job_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Lightweight migration: add job_id if missing
  const columns = db.prepare('PRAGMA table_info(notes)').all() as Array<{ name: string }>;
  const hasJobId = columns.some(col => col.name === 'job_id');
  if (!hasJobId) {
    db.exec('ALTER TABLE notes ADD COLUMN job_id TEXT');
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function saveNote(
  title: string,
  description: string,
  details: string[],
  noteId?: string,
  jobId?: string
): string {
  const conn = getDb();

  if (noteId) {
    const existing = conn.prepare('SELECT id FROM notes WHERE id = ?').get(noteId);
    if (existing) {
      conn.prepare(`
        UPDATE notes
        SET title = ?, description = ?, details = ?, job_id = ?, created_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(title, description, JSON.stringify(details), jobId, noteId);
      return `Note updated with ID: ${noteId}`;
    }
  }

  // Check for duplicates (compare with the most recent note) - only for new notes
  if (!noteId) {
    const row = conn.prepare('SELECT title, details FROM notes ORDER BY created_at DESC LIMIT 1').get() as { title: string; details: string } | undefined;
    if (row) {
      const lastDetails = JSON.parse(row.details) as string[];
      if (title === row.title && JSON.stringify(details) === JSON.stringify(lastDetails)) {
        return 'Note already exists (duplicate).';
      }
    }
  }

  const result = conn.prepare(`
    INSERT INTO notes (title, description, details, job_id)
    VALUES (?, ?, ?, ?)
  `).run(title, description, JSON.stringify(details), jobId);

  return `Note saved with ID: ${result.lastInsertRowid}`;
}

export function saveNoteDetailed(
  title: string,
  description: string,
  details: string[],
  noteId?: string,
  jobId?: string
): { message: string; id?: string; isDuplicate?: boolean } {
  const message = saveNote(title, description, details, noteId, jobId);
  if (message.startsWith('Note saved with ID:')) {
    return { message, id: message.replace('Note saved with ID: ', '') };
  }
  if (message.startsWith('Note updated with ID:')) {
    return { message, id: message.replace('Note updated with ID: ', '') };
  }
  return { message, isDuplicate: true };
}

export function updateNoteJobId(noteId: string, jobId: string): void {
  const conn = getDb();
  conn.prepare('UPDATE notes SET job_id = ? WHERE id = ?').run(jobId, noteId);
}

export function deleteNote(noteId: string): string {
  const conn = getDb();
  conn.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
  return `Note ${noteId} deleted.`;
}

export function getNotes(): Note[] {
  const conn = getDb();

  const rows = conn.prepare('SELECT * FROM notes ORDER BY created_at DESC').all() as Array<{
    id: number;
    title: string;
    description: string;
    details: string;
    job_id?: string;
    created_at: string;
  }>;

  return rows.map(row => ({
    id: String(row.id),
    title: row.title,
    description: row.description,
    details: JSON.parse(row.details) as string[],
    jobId: row.job_id,
    timestamp: row.created_at,
  }));
}

export function getNote(noteId: string): Note | null {
  const conn = getDb();

  const row = conn.prepare('SELECT * FROM notes WHERE id = ?').get(noteId) as {
    id: number;
    title: string;
    description: string;
    details: string;
    job_id?: string;
    created_at: string;
  } | undefined;

  if (!row) return null;

  return {
    id: String(row.id),
    title: row.title,
    description: row.description,
    details: JSON.parse(row.details) as string[],
    jobId: row.job_id,
    timestamp: row.created_at,
  };
}
