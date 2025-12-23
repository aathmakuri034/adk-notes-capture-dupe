'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { VoiceAgentWebSocket } from '@/lib/websocket-client';
import { AudioRecorder } from '@/lib/audio-recorder';

interface VoiceInterfaceProps {
  onTranscript?: (text: string) => void;
  onResponse?: (text: string) => void;
  onResponseComplete?: () => void;
  onRecordingStart?: () => void;
  onNotesList?: (notes: any[]) => void;
  onError?: (error: string) => void;
}

export interface VoiceInterfaceRef {
  sendMessage: (type: string, data?: any) => void;
}

const VoiceInterface = forwardRef<VoiceInterfaceRef, VoiceInterfaceProps>(({
  onTranscript,
  onResponse,
  onResponseComplete,
  onRecordingStart,
  onNotesList,
  onError
}, ref) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioPlayQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);

  const wsRef = useRef<VoiceAgentWebSocket | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const sendIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useImperativeHandle(ref, () => ({
    sendMessage: (type: string, data?: any) => {
      if (wsRef.current && wsRef.current.isConnected()) {
        wsRef.current.send(JSON.stringify({ type, data }));
      } else {
        console.warn('Cannot send message: WebSocket not connected');
      }
    }
  }));

  // Initialize AudioContext
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000, // Match the sample rate sent by the server
      });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const playNextAudioChunk = async () => {
    if (!audioContextRef.current || audioPlayQueueRef.current.length === 0 || isPlayingRef.current) {
      return;
    }

    isPlayingRef.current = true;
    const audioData = audioPlayQueueRef.current.shift();

    if (audioData) {
      try {
        // Create a buffer from the raw PCM data
        // The server sends raw PCM 16-bit, 24kHz, mono (based on typical Gemini output)
        // We need to convert it to an AudioBuffer

        // Note: The server sends raw PCM, not a WAV file. 
        // decodeAudioData expects a full file format (wav/mp3) or we need to manually create buffer for PCM.
        // Let's try to handle it as raw PCM first.

        // Convert ArrayBuffer to Float32Array for AudioBuffer
        const int16Array = new Int16Array(audioData);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }

        const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);

        source.onended = () => {
          isPlayingRef.current = false;
          playNextAudioChunk();
        };

        source.start();
      } catch (error) {
        console.error('Error playing audio chunk:', error);
        isPlayingRef.current = false;
        playNextAudioChunk();
      }
    } else {
      isPlayingRef.current = false;
    }
  };

  // Refs for callbacks to prevent effect re-execution
  const onTranscriptRef = useRef(onTranscript);
  const onResponseRef = useRef(onResponse);
  const onResponseCompleteRef = useRef(onResponseComplete);
  const onRecordingStartRef = useRef(onRecordingStart);
  const onNotesListRef = useRef(onNotesList);
  const onErrorRef = useRef(onError);

  // Update refs when props change
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onResponseRef.current = onResponse;
    onResponseCompleteRef.current = onResponseComplete;
    onRecordingStartRef.current = onRecordingStart;
    onNotesListRef.current = onNotesList;
    onErrorRef.current = onError;
  }, [onTranscript, onResponse, onResponseComplete, onRecordingStart, onNotesList, onError]);

  useEffect(() => {
    // Initialize WebSocket client
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
    wsRef.current = new VoiceAgentWebSocket(wsUrl);
    recorderRef.current = new AudioRecorder();

    // Set up WebSocket event handlers
    wsRef.current.on('ready', () => {
      console.log('WebSocket ready');
      setConnectionStatus('connected');
      setIsConnected(true);
      // Fetch existing notes
      wsRef.current?.send(JSON.stringify({ type: 'get_notes' }));
    });

    wsRef.current.on('notes_list', (message) => {
      if (message.data && onNotesListRef.current) {
        // message.data is the list
        onNotesListRef.current(message.data as any);
      }
    });

    wsRef.current.on('text', (message) => {
      if (message.data && onResponseRef.current) {
        onResponseRef.current(message.data);
      }
    });

    // Handle notes list
    // We need to add a listener for 'notes_list' in VoiceInterface or handle it here?
    // VoiceInterface only exposes specific events.
    // I should update VoiceInterface to expose a generic 'message' or add 'onNotesList'.
    // For now, I'll hack it by adding a custom listener if VoiceInterface allows, 
    // but VoiceInterface wraps the socket.
    // I need to update VoiceInterface.tsx to handle 'notes_list'.

    wsRef.current.on('user_transcript', (message) => {
      if (message.data && onTranscriptRef.current) {
        onTranscriptRef.current(message.data);
      }
    });

    wsRef.current.on('audio', (message) => {
      if (message.data) {
        // Convert base64 to ArrayBuffer
        const binaryString = atob(message.data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        audioPlayQueueRef.current.push(bytes.buffer);
        playNextAudioChunk();
      }
    });

    wsRef.current.on('error', (message) => {
      const errorMsg = message.data || 'Unknown error';
      console.error('WebSocket error:', errorMsg);
      if (onErrorRef.current) {
        onErrorRef.current(errorMsg);
      }
      setConnectionStatus('disconnected');
      setIsConnected(false);
    });

    wsRef.current.on('interrupted', () => {
      console.log('Response interrupted');
      // Clear audio queue on interruption
      audioPlayQueueRef.current = [];
      isPlayingRef.current = false;
    });

    wsRef.current.on('turn_complete', () => {
      console.log('Turn completed');
      if (onResponseCompleteRef.current) {
        onResponseCompleteRef.current();
      }
    });

    // Connect to WebSocket
    setConnectionStatus('connecting');
    wsRef.current.connect().catch((error) => {
      console.error('Failed to connect:', error);
      setConnectionStatus('disconnected');
      if (onErrorRef.current) {
        onErrorRef.current('Failed to connect to voice agent');
      }
    });

    return () => {
      // Cleanup
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
      }
      recorderRef.current?.stop();
      wsRef.current?.disconnect();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []); // Empty dependency array ensures connection is established only once

  // Add global click listener to resume AudioContext
  useEffect(() => {
    const handleUserInteraction = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          // Trigger playback if queue has items
          if (audioPlayQueueRef.current.length > 0 && !isPlayingRef.current) {
            playNextAudioChunk();
          }
        });
      }
    };

    window.addEventListener('click', handleUserInteraction);
    return () => {
      window.removeEventListener('click', handleUserInteraction);
    };
  }, []);

  const startRecording = async () => {
    // Initialize audio context on user interaction
    initAudioContext();

    if (!recorderRef.current || !wsRef.current || !isConnected) {
      return;
    }

    try {
      // Clear any queued audio
      audioQueueRef.current = [];

      // Start recording
      await recorderRef.current.start((audioData: ArrayBuffer) => {
        audioQueueRef.current.push(audioData);
      });

      setIsRecording(true);

      // Notify that recording has started
      if (onRecordingStart) {
        onRecordingStart();
      }

      // Send audio chunks periodically
      sendIntervalRef.current = setInterval(() => {
        if (wsRef.current && audioQueueRef.current.length > 0) {
          const chunk = audioQueueRef.current.shift();
          if (chunk) {
            wsRef.current.sendAudio(chunk);
          }
        }
      }, 100); // Send every 100ms
    } catch (error) {
      console.error('Error starting recording:', error);
      if (onError) {
        onError('Failed to start recording. Please check microphone permissions.');
      }
    }
  };

  const stopRecording = () => {
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }

    recorderRef.current?.stop();
    setIsRecording(false);

    // Send end signal
    if (wsRef.current) {
      wsRef.current.sendEnd();
    }

    // Clear audio queue
    audioQueueRef.current = [];
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      default:
        return 'bg-red-500';
    }
  };

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Connection Status */}
      <div className="flex items-center space-x-2">
        <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`}></div>
        <span className="text-sm text-gray-600 capitalize">{connectionStatus}</span>
      </div>

      {/* Record Button */}
      <button
        onClick={toggleRecording}
        disabled={!isConnected || connectionStatus !== 'connected'}
        className={`
          w-24 h-24 rounded-full flex items-center justify-center
          transition-all duration-300 transform hover:scale-105
          ${isRecording
            ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/50'
            : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/50'
          }
          ${!isConnected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {isRecording ? (
          <div className="w-8 h-8 bg-white rounded"></div>
        ) : (
          <svg
            className="w-12 h-12 text-white"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>

      {/* Status Text */}
      <p className="text-sm text-gray-600">
        {!isConnected
          ? 'Connecting to voice agent...'
          : isRecording
            ? 'Recording... Click to stop'
            : 'Click to start recording'
        }
      </p>
    </div>
  );
});

VoiceInterface.displayName = 'VoiceInterface';

export default VoiceInterface;

