'use client';

import { useState, useCallback, useRef } from 'react';
import ChatInterface, { ChatInterfaceRef } from '@/components/ChatInterface';
import NotesDisplay from '@/components/NotesDisplay';

interface Note {
  id: string;
  title: string;
  description: string;
  details: string[];
  timestamp: string;
}

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
  const chatInterfaceRef = useRef<ChatInterfaceRef>(null);

  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg);
    setTimeout(() => setError(null), 5000);
  }, []);

  const handleSaveNote = useCallback((note: Note) => {
    setNotes(prev => [note, ...prev]);
  }, []);

  const handleNotesList = useCallback((notesList: any[]) => {
    setNotes(notesList);
  }, []);

  const handleRequestSave = useCallback(() => {
    if (chatInterfaceRef.current) {
      chatInterfaceRef.current.sendMessage('generate_summary');
    }
  }, []);

  const handleDeleteNote = useCallback((id: string) => {
    if (chatInterfaceRef.current) {
      chatInterfaceRef.current.sendMessage('delete_note', id);
    }
  }, []);

  const handleUpdateNote = useCallback((note: Note) => {
    if (chatInterfaceRef.current) {
      const content = `Title: ${note.title}\nDescription: ${note.description}\nDetails: ${note.details.join('\n')}`;
      chatInterfaceRef.current.sendMessage('update_note', {
        id: note.id,
        content: content
      });
    }
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Job Scope Assistant
          </h1>
          <p className="text-gray-600">
            Describe your home project using voice, text, or images
          </p>
        </div>

        {error && (
          <div className="mb-4 mx-auto max-w-2xl">
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
              <p className="font-medium">Error: {error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
          {/* Left Column - Chat Interface */}
          <div className="bg-white rounded-lg shadow-lg p-1">
            <ChatInterface
              ref={chatInterfaceRef}
              onNotesList={handleNotesList}
              onError={handleError}
            />
          </div>

          {/* Right Column - Notes Display */}
          <div className="bg-white rounded-lg shadow-lg p-4 h-[600px]">
            <NotesDisplay
              notes={notes}
              history={[]} // ChatInterface handles history internally
              currentTranscript=""
              currentResponse=""
              onSaveNote={handleSaveNote}
              onRequestSave={handleRequestSave}
              onDeleteNote={handleDeleteNote}
              onUpdateNote={handleUpdateNote}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
