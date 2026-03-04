import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { NotesRepository, Note } from '../../application/streaming/types.js';
import { createLogger } from '../../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createLogger({ component: 'sqlite-notes-repository' });

export class SQLiteNotesRepository implements NotesRepository {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const defaultPath = join(__dirname, '../../../data/notes.db');
    const path = dbPath || process.env.NOTES_DB_PATH || defaultPath;

    // Ensure directory exists
    const dbDir = join(path, '..');
    try {
      mkdirSync(dbDir, { recursive: true });
    } catch {
      // Directory may already exist
      logger.info({ dbDir }, "Directory already exists");
    }

    this.db = new Database(path);
    this.initializeSchema();
    logger.info({ path }, 'SQLite notes repository initialized');
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        details TEXT,
        created_at TEXT,
        updated_at TEXT,
        azure_job_file_path TEXT,
        last_transcript_updated TEXT
      )
    `);
  }

  saveNote(title: string, description: string, details: string[], noteId?: string): Note {
    const now = new Date().toISOString();
    const id = noteId || `note_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const detailsJson = JSON.stringify(details);

    // Check if note exists
    const existing = this.getNote(id);

    if (existing) {
      // Update existing note
      const stmt = this.db.prepare(`
        UPDATE notes
        SET title = ?, description = ?, details = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(title, description, detailsJson, now, id);
    } else {
      // Insert new note
      const stmt = this.db.prepare(`
        INSERT INTO notes (id, title, description, details, created_at, updated_at, azure_job_file_path, last_transcript_updated)
        VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
      `);
      stmt.run(id, title, description, detailsJson, now, now);
    }

    return this.getNote(id)!;
  }

  deleteNote(noteId: string): void {
    const stmt = this.db.prepare('DELETE FROM notes WHERE id = ?');
    stmt.run(noteId);
  }

  getNotes(): Note[] {
    const stmt = this.db.prepare('SELECT * FROM notes ORDER BY created_at DESC');
    const rows = stmt.all() as Array<{
      id: string;
      title: string;
      description: string;
      details: string;
      created_at: string;
      updated_at: string;
      azure_job_file_path: string | null;
      last_transcript_updated: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      details: row.details ? JSON.parse(row.details) : [],
      created_at: row.created_at,
      updated_at: row.updated_at,
      azure_job_file_path: row.azure_job_file_path,
      last_transcript_updated: row.last_transcript_updated,
    }));
  }

  getNote(noteId: string): Note | undefined {
    const stmt = this.db.prepare('SELECT * FROM notes WHERE id = ?');
    const row = stmt.get(noteId) as {
      id: string;
      title: string;
      description: string;
      details: string;
      created_at: string;
      updated_at: string;
      azure_job_file_path: string | null;
      last_transcript_updated: string | null;
    } | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      title: row.title,
      description: row.description || '',
      details: row.details ? JSON.parse(row.details) : [],
      created_at: row.created_at,
      updated_at: row.updated_at,
      azure_job_file_path: row.azure_job_file_path,
      last_transcript_updated: row.last_transcript_updated,
    };
  }

  close(): void {
    this.db.close();
  }
}