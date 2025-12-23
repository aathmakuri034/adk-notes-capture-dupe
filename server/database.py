import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'notes.db')

def init_db():
    """Initialize the database table."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            details JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def save_note(title: str, description: str, details: list[str], note_id: str = None):
    """
    Save a note to the database.
    
    Args:
        title: The title of the note.
        description: A brief description.
        details: A list of strings containing the point-by-point details.
        note_id: Optional ID of the note to update. If None, creates a new note.
    """
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    if note_id:
        # Check if note exists
        c.execute('SELECT id FROM notes WHERE id = ?', (note_id,))
        if c.fetchone():
            c.execute('''
                UPDATE notes 
                SET title = ?, description = ?, details = ?, created_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (title, description, json.dumps(details), note_id))
            conn.commit()
            conn.close()
            return f"Note updated with ID: {note_id}"
    
    # Check for duplicates (compare with the most recent note) - only for new notes
    if not note_id:
        c.execute('SELECT title, details FROM notes ORDER BY created_at DESC LIMIT 1')
        row = c.fetchone()
        if row:
            last_title, last_details_json = row
            last_details = json.loads(last_details_json)
            if title == last_title and details == last_details:
                conn.close()
                return "Note already exists (duplicate)."

    c.execute('''
        INSERT INTO notes (title, description, details)
        VALUES (?, ?, ?)
    ''', (title, description, json.dumps(details)))
    new_note_id = c.lastrowid
    conn.commit()
    conn.close()
    return f"Note saved with ID: {new_note_id}"

def delete_note(note_id: str):
    """Delete a note from the database."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('DELETE FROM notes WHERE id = ?', (note_id,))
    conn.commit()
    conn.close()
    return f"Note {note_id} deleted."

def get_notes():
    """Retrieve all notes from the database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT * FROM notes ORDER BY created_at DESC')
    rows = c.fetchall()
    notes = []
    for row in rows:
        notes.append({
            "id": str(row["id"]),
            "title": row["title"],
            "description": row["description"],
            "details": json.loads(row["details"]),
            "timestamp": row["created_at"]
        })
    conn.close()
    return notes
