'use client';

import { useState, useEffect } from 'react';

interface Note {
  id: string;
  title: string;
  description: string;
  details: string[];
  timestamp: string;
  // Legacy fields
  userTranscript?: string;
  summary?: string;
  fullText?: string;
}

interface HistoryItem {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

interface NotesDisplayProps {
  notes: Note[];
  history: HistoryItem[];
  currentTranscript: string;
  currentResponse: string;
  onSaveNote?: (note: Note) => void; // Legacy, maybe remove?
  onRequestSave?: () => void;
  onDeleteNote?: (id: string) => void;
  onUpdateNote?: (note: Note) => void;
}

export default function NotesDisplay({
  notes,
  history,
  currentTranscript,
  currentResponse,
  onSaveNote,
  onRequestSave,
  onDeleteNote,
  onUpdateNote
}: NotesDisplayProps) {
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  const handleSaveCurrent = () => {
    if (onRequestSave) {
      onRequestSave();
    }
  };

  const handleDeleteClick = (id: string) => {
    setNoteToDelete(id);
  };

  const confirmDelete = () => {
    if (noteToDelete && onDeleteNote) {
      onDeleteNote(noteToDelete);
      setNoteToDelete(null);
    }
  };

  const cancelDelete = () => {
    setNoteToDelete(null);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-lg relative">
      {/* Delete Confirmation Modal */}
      {noteToDelete && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10 rounded-lg">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Delete Job Description?</h3>
            <p className="text-gray-600 mb-6">Are you sure you want to delete this job description? This action cannot be undone.</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Notes Header */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700">Saved Job Descriptions</h3>
      </div>

      {/* Saved Notes List */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {notes.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p>No job descriptions saved yet.</p>
            <p className="text-sm mt-2">Start speaking to capture a job description!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <div
                key={note.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-lg font-bold text-gray-800">{note.title || "Untitled Job"}</h4>
                    <span className="text-xs text-gray-500">
                      {new Date(note.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onUpdateNote?.(note)}
                      className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                    >
                      Update
                    </button>
                    <button
                      onClick={() => handleDeleteClick(note.id)}
                      className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setExpandedNote(expandedNote === note.id ? null : note.id)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium ml-2"
                    >
                      {expandedNote === note.id ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                </div>

                <p className="text-sm text-gray-600 mb-3 italic">{note.description}</p>

                {expandedNote === note.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Key Details</h5>
                    <ul className="list-disc list-inside space-y-1">
                      {note.details && note.details.map((detail, idx) => (
                        <li key={idx} className="text-sm text-gray-700">{detail}</li>
                      ))}
                      {/* Fallback for legacy notes */}
                      {!note.details && note.fullText && (
                        <li className="text-sm text-gray-700 whitespace-pre-wrap">{note.fullText}</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

