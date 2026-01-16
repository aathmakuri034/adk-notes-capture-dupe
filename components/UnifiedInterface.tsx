// app/components/UnifiedInterface.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ChatInterface, { ChatInterfaceRef } from './ChatInterface';
import NotesCapture, { NotesCaptureRef } from './NotesCapture';
import NotesDisplay from './NotesDisplay';

type InterfaceMode = 'job' | 'notes';

interface Note {
  id: string;
  title: string;
  description: string;
  details: string[];
  timestamp: string;
}

const UnifiedInterface = () => {
  const [mode, setMode] = useState<InterfaceMode>('job');
  const [error, setError] = useState<string | null>(null);
  const [savedJobs, setSavedJobs] = useState<Note[]>([]);

  const chatRef = useRef<ChatInterfaceRef>(null);
  const notesRef = useRef<NotesCaptureRef>(null);

  // Handle notes list updates from WebSocket (SQLite database)
  const handleNotesList = useCallback((notes: any[]) => {
    if (notes && Array.isArray(notes)) {
      const formattedJobs: Note[] = notes.map((note: any) => ({
        id: note.id,
        title: note.title || 'Untitled Job',
        description: note.description || '',
        details: note.details || [],
        timestamp: note.timestamp || new Date().toISOString(),
      }));
      setSavedJobs(formattedJobs);
    }
  }, []);

  // Delete job via WebSocket
  const handleDeleteJob = useCallback((id: string) => {
    if (chatRef.current) {
      chatRef.current.sendMessage('delete_note', id);
    }
  }, []);

  const handleModeToggle = async () => {
    // If leaving notes mode, stop recording FIRST
    if (mode === 'notes' && notesRef.current) {
        await notesRef.current.stopRecording();
    }

    setMode(prev => (prev === 'job' ? 'notes' : 'job'));
    setError(null);
    };


  const handleError = (errorMsg: string) => {
    setError(errorMsg);
    setTimeout(() => setError(null), 5000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header with Mode Toggle */}
        <div className="bg-white rounded-t-2xl shadow-lg p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Voice Assistant</h1>
              <p className="text-gray-600 mt-1">
                {mode === 'job' 
                  ? 'Job Scope Assessment & Extraction'
                  : 'Quick Voice Notes Capture'
                }
              </p>
            </div>
            
            {/* Mode Toggle Switch */}
            <div className="flex items-center space-x-4">
              <span className={`text-sm font-medium transition-colors ${mode === 'job' ? 'text-blue-600' : 'text-gray-400'}`}>
                Job Scope
              </span>
              
              <button
                onClick={handleModeToggle}
                className="relative inline-flex h-12 w-24 items-center rounded-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg transition-all hover:shadow-xl"
              >
                <span
                  className={`inline-block h-10 w-10 transform rounded-full bg-white shadow-md transition-transform ${
                    mode === 'notes' ? 'translate-x-12' : 'translate-x-1'
                  }`}
                >
                  <div className="h-full w-full flex items-center justify-center">
                    {mode === 'job' ? (
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                  </div>
                </span>
              </button>
              
              <span className={`text-sm font-medium transition-colors ${mode === 'notes' ? 'text-purple-600' : 'text-gray-400'}`}>
                Voice Notes
              </span>
            </div>
          </div>
          
          {/* Mode Description */}
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-gray-200">
            <div className="flex items-start space-x-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                mode === 'job' ? 'bg-blue-100' : 'bg-purple-100'
              }`}>
                {mode === 'job' ? (
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">
                  {mode === 'job' ? 'Job Scope Mode' : 'Voice Notes Mode'}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {mode === 'job' 
                    ? 'Have a detailed conversation about a project. The assistant will extract structured job information including category, requirements, and technical details.'
                    : 'Quickly record voice memos. The assistant will automatically extract a title, summary, and key points from your recording.'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded-r-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800 font-medium">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-500 hover:text-red-700"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Interface Container */}
        <div className="bg-white rounded-b-2xl shadow-2xl overflow-hidden">
          {mode === 'job' ? (
            <div className="flex h-[700px]">
              {/* Chat Interface - Left Side */}
              <div className="flex-1 border-r border-gray-200">
                <ChatInterface
                  ref={chatRef}
                  onError={handleError}
                  onNotesList={handleNotesList}
                />
              </div>
              {/* Notes Display - Right Side */}
              <div className="w-[400px] p-4">
                <NotesDisplay
                  notes={savedJobs}
                  history={[]}
                  currentTranscript=""
                  currentResponse=""
                  onDeleteNote={handleDeleteJob}
                />
              </div>
            </div>
          ) : (
            <div className="h-[700px]">
              <NotesCapture
                ref={notesRef}
                onError={handleError}
              />
            </div>
          )}
        </div>

        {/* Feature Comparison */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`p-6 rounded-xl border-2 transition-all ${
            mode === 'job' 
              ? 'bg-blue-50 border-blue-300 shadow-lg' 
              : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-800">Job Scope Mode</h3>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">✓</span>
                Conversational job assessment
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">✓</span>
                Image & video upload support
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">✓</span>
                Detailed schema extraction
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">✓</span>
                Category-specific fields
              </li>
            </ul>
          </div>

          <div className={`p-6 rounded-xl border-2 transition-all ${
            mode === 'notes' 
              ? 'bg-purple-50 border-purple-300 shadow-lg' 
              : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-800">Voice Notes Mode</h3>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start">
                <span className="text-purple-500 mr-2">✓</span>
                Quick voice recording
              </li>
              <li className="flex items-start">
                <span className="text-purple-500 mr-2">✓</span>
                Auto title generation
              </li>
              <li className="flex items-start">
                <span className="text-purple-500 mr-2">✓</span>
                Summary extraction
              </li>
              <li className="flex items-start">
                <span className="text-purple-500 mr-2">✓</span>
                Key points highlighting
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnifiedInterface;
