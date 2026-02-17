'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import type { Note, NotesCaptureRef, NotesCaptureConfig, WebSocketMessage } from '../types';

interface NotesWebSocketMessage {
  type: 'ready' | 'audio' | 'text' | 'note_saved' | 'notes_list' | 'error' | 'recording_complete';
  data?: any;
}

class NotesWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private callbacks: Map<string, Set<(message: NotesWebSocketMessage) => void>> = new Map();
  private debug: boolean;

  constructor(url: string = 'ws://localhost:8081', debug: boolean = false) {
    this.url = url;
    this.debug = debug;
  }

  private log(...args: any[]) {
    if (this.debug) {
      console.log('[NotesWebSocket]', ...args);
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.log('Connecting to', this.url);
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => {
          this.log('Connected');
          resolve();
        };
        this.ws.onmessage = (event) => {
          try {
            const message: NotesWebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Parse error:', error);
          }
        };
        this.ws.onerror = (error) => reject(error);
        this.ws.onclose = () => this.log('Connection closed');
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(message: NotesWebSocketMessage) {
    const callbacks = this.callbacks.get(message.type);
    if (callbacks) {
      callbacks.forEach(callback => callback(message));
    }
  }

  on(type: string, callback: (message: NotesWebSocketMessage) => void) {
    if (!this.callbacks.has(type)) {
      this.callbacks.set(type, new Set());
    }
    this.callbacks.get(type)!.add(callback);
  }

  sendAudio(audioData: ArrayBuffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const base64 = this.arrayBufferToBase64(audioData);
      this.ws.send(JSON.stringify({ type: 'audio', data: base64 }));
    }
  }

  send(data: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

class NotesAudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isActive: boolean = false;

  async start(onAudioData: (data: ArrayBuffer) => void) {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

      const bufferSize = 4096;
      this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.isActive = true;

      this.processor.onaudioprocess = (e) => {
        if (!this.isActive) return;

        const inputData = e.inputBuffer.getChannelData(0);

        const buffer = new ArrayBuffer(inputData.length * 2);
        const view = new DataView(buffer);

        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          view.setInt16(i * 2, s * 0x7fff, true);
        }

        onAudioData(buffer);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

    } catch (error) {
      console.error('Microphone error:', error);
      throw new Error('Failed to access microphone');
    }
  }

  stop() {
    this.isActive = false;

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export interface NotesCaptureProps extends NotesCaptureConfig {
  onError?: (error: string) => void;
}

const NotesCapture = forwardRef<NotesCaptureRef, NotesCaptureProps>(({
  notesServiceUrl = 'ws://localhost:8081',
  debug = false,
  onNoteSaved,
  onError
}, ref) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const userStoppedRef = useRef(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [showSavedNote, setShowSavedNote] = useState(false);
  const [lastSavedNote, setLastSavedNote] = useState<Note | null>(null);

  const wsRef = useRef<NotesWebSocket | null>(null);
  const recorderRef = useRef<NotesAudioRecorder | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  useImperativeHandle(ref, () => ({
    stopRecording: () => {
      if (isRecording) {
        stopNoteRecording();
      }
    }
  }));

  const connectToNotesService = useCallback(async () => {
    try {
      if (debug) console.log('Connecting to notes service:', notesServiceUrl);

      wsRef.current = new NotesWebSocket(notesServiceUrl, debug);
      recorderRef.current = new NotesAudioRecorder();

      wsRef.current.on('ready', () => {
        if (debug) console.log('Notes service ready');
        setIsConnected(true);
      });

      wsRef.current.on('text', (message) => {
        if (message.data) {
          if (debug) console.log('Transcript:', message.data);
          setCurrentTranscript(prev => prev + ' ' + message.data);
        }
      });

      wsRef.current.on('note_saved', (message) => {
        if (message.data) {
          if (debug) console.log('Note saved:', message.data);
          const newNote: Note = {
            id: message.data.id,
            title: message.data.title,
            summary: message.data.summary,
            key_points: message.data.key_points || [],
            timestamp: new Date(message.data.timestamp),
            duration: recordingDuration
          };

          setNotes(prev => [newNote, ...prev]);
          setLastSavedNote(newNote);
          setShowSavedNote(true);

          if (onNoteSaved) {
            onNoteSaved(newNote);
          }

          setTimeout(() => setShowSavedNote(false), 5000);
        }
      });

      wsRef.current.on('notes_list', (message) => {
        if (message.data && Array.isArray(message.data)) {
          setNotes(message.data);
        }
      });

      wsRef.current.on('recording_complete', () => {
        if (debug) console.log('Backend recording complete signal received');
      });

      wsRef.current.on('error', (message) => {
        console.error('Error:', message.data);
        if (onError) onError(message.data);
      });

      await wsRef.current.connect();
      wsRef.current.send(JSON.stringify({ type: 'get_notes' }));

    } catch (error) {
      console.error('Connection failed:', error);
      if (onError) onError('Failed to connect');
    }
  }, [notesServiceUrl, debug, onNoteSaved, onError, recordingDuration]);

  useEffect(() => {
    connectToNotesService();
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      recorderRef.current?.stop();

      if (userStoppedRef.current) {
        wsRef.current?.send(JSON.stringify({ type: 'stop_recording' }));
      }

      wsRef.current?.disconnect();
    };
  }, [connectToNotesService]);

  const startNoteRecording = async () => {
    if (debug) console.log('Starting recording...');
    userStoppedRef.current = false;

    if (!recorderRef.current || !wsRef.current || !wsRef.current.isConnected()) {
      console.error('Not ready');
      return;
    }

    try {
      setCurrentTranscript('');
      setRecordingDuration(0);
      recordingStartTimeRef.current = Date.now();

      if (debug) console.log('Sending START_RECORDING signal');

      await new Promise(resolve => setTimeout(resolve, 100));
      wsRef.current.send(JSON.stringify({ type: "start_recording" }));

      await recorderRef.current.start((audioData: ArrayBuffer) => {
        if (wsRef.current && wsRef.current.isConnected()) {
          wsRef.current.sendAudio(audioData);
        }
      });

      if (debug) console.log('Recording started');
      setIsRecording(true);

      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
        setRecordingDuration(elapsed);
      }, 1000);

    } catch (error) {
      console.error('Recording error:', error);
      if (onError) onError('Failed to start recording');
    }
  };

  const stopNoteRecording = () => {
    if (debug) console.log('Stopping recording (user)');
    userStoppedRef.current = true;

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    recorderRef.current?.stop();
    setIsRecording(false);

    wsRef.current?.send(JSON.stringify({ type: 'stop_recording' }));
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      stopNoteRecording();
    } else {
      startNoteRecording();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimestamp = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Voice Notes</h1>
              <p className="text-purple-100 text-sm">Capture your thoughts</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-white/10 px-4 py-2 rounded-full">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}></div>
            <span className="text-xs text-white/90 font-medium">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 bg-white">
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-col items-center space-y-4">
              <button
                onClick={handleToggleRecording}
                disabled={!isConnected}
                className={`
                  w-24 h-24 rounded-full transition-all duration-300 transform hover:scale-105 shadow-2xl
                  ${isRecording
                    ? 'bg-gradient-to-br from-red-500 to-pink-500 ring-8 ring-red-100 animate-pulse'
                    : 'bg-gradient-to-br from-purple-500 to-indigo-500'
                  }
                  ${!isConnected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  flex items-center justify-center
                `}
              >
                {isRecording ? (
                  <div className="w-8 h-8 bg-white rounded-sm" />
                ) : (
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </button>

              <div className="text-center">
                <p className="text-lg font-semibold text-gray-800">
                  {isRecording ? 'Recording...' : 'Tap to Record'}
                </p>
                {isRecording && (
                  <p className="text-2xl font-mono text-purple-600 mt-2">
                    {formatDuration(recordingDuration)}
                  </p>
                )}
              </div>
            </div>

            {currentTranscript && (
              <div className="mt-6 bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-200">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                  <span className="text-xs font-semibold text-purple-600">LIVE TRANSCRIPT</span>
                </div>
                <p className="text-gray-700 text-sm">{currentTranscript}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Recent Notes</h2>
              <span className="text-sm text-gray-500">{notes.length} notes</span>
            </div>

            {notes.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">No notes yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {notes.map((note) => (
                  <div key={note.id} className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow border border-gray-100">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-bold text-gray-800">{note.title}</h3>
                      <span className="text-xs text-gray-400">{formatTimestamp(note.timestamp)}</span>
                    </div>
                    <p className="text-gray-600 text-sm mb-3">{note.summary}</p>
                    {note.key_points && note.key_points.length > 0 && (
                      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-purple-600 mb-2">KEY POINTS</p>
                        <ul className="space-y-1">
                          {note.key_points.map((point, idx) => (
                            <li key={idx} className="flex items-start text-sm text-gray-700">
                              <span className="text-purple-500 mr-2">•</span>
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showSavedNote && lastSavedNote && (
        <div className="fixed bottom-6 right-6 bg-white rounded-xl shadow-2xl p-4 max-w-sm z-50">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm">Note Saved!</p>
              <p className="text-gray-600 text-xs">{lastSavedNote.title}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

NotesCapture.displayName = 'NotesCapture';

export default NotesCapture;
