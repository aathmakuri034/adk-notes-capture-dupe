'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { VoiceAgentWebSocket } from '../utils/websocket-client';
import { AudioRecorder } from '../utils/audio-recorder';
import type { ChatMessage, ChatInterfaceRef, ChatInterfaceConfig, Job } from '../types';

export interface ChatInterfaceProps extends ChatInterfaceConfig {
  onNotesList?: (notes: any[]) => void;
  onError?: (error: string) => void;
}

const ChatInterface = forwardRef<ChatInterfaceRef, ChatInterfaceProps>(({
  jobServiceUrl = 'ws://localhost:8080',
  apiBaseUrl = '/api',
  debug = false,
  onLogout,
  onNavigateToJobBoard,
  onJobExtracted,
  onNotesList,
  onError
}, ref) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [hasJobData, setHasJobData] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [extractedJobJson, setExtractedJobJson] = useState<any>(null);
  const [isPaused, setIsPaused] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioPlayQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);

  const wsRef = useRef<VoiceAgentWebSocket | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const sendIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const wasRecordingRef = useRef(false);

  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleVideoUpload = () => {
    videoInputRef.current?.click();
  };

  const pauseConversation = () => {
    if (isRecording) {
      wasRecordingRef.current = true;
      stopRecording();
    }

    audioPlayQueueRef.current = [];
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsAgentSpeaking(false);

    setIsPaused(true);
  };

  const resumeConversation = () => {
    setIsPaused(false);

    if (wasRecordingRef.current) {
      wasRecordingRef.current = false;
      startRecording().catch(console.error);
    }
  };

  const handlePauseAndView = async () => {
    try {
      pauseConversation();

      const response = await fetch(`${apiBaseUrl}/jobs`);
      const data = await response.json();

      if (data.jobs && data.jobs.length > 0) {
        const latestJob = data.jobs[0];

        const jobResponse = await fetch(`${apiBaseUrl}/jobs/${latestJob.id}`);
        const jobData = await jobResponse.json();

        if (jobData.success) {
          if (debug) console.log('Extracted job data:', jobData.job);
          setExtractedJobJson(jobData.job);
          setShowJsonPreview(true);

          if (onJobExtracted) {
            onJobExtracted(jobData.job);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching job data: ", error);
      if (onErrorRef.current) {
        onErrorRef.current('Failed to load job details');
      }
    }
  };

  const handleGoToJobBoard = () => {
    if (onNavigateToJobBoard) {
      onNavigateToJobBoard();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !wsRef.current || !isConnected || isPaused) return;

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target?.result as string;

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'user',
        image: base64Data,
        timestamp: new Date()
      }]);

      wsRef.current?.send(JSON.stringify({
        type: 'image',
        data: base64Data
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !wsRef.current || !isConnected || isPaused) return;

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      if (onErrorRef.current) {
        onErrorRef.current('Video file too large. Please select a video smaller than 50MB.');
      }
      return;
    }

    if (videoInputRef.current) {
      videoInputRef.current.value = '';
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target?.result as string;

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'user',
        video: base64Data,
        timestamp: new Date()
      }]);

      wsRef.current?.send(JSON.stringify({
        type: 'video_file',
        data: base64Data
      }));
    };
    reader.readAsDataURL(file);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useImperativeHandle(ref, () => ({
    sendMessage: (type: string, data?: any) => {
      if (wsRef.current && wsRef.current.isConnected() && !isPaused) {
        wsRef.current.send(JSON.stringify({ type, data }));
      } else if (isPaused) {
        console.warn('Cannot send message: Conversation paused');
      } else {
        console.warn('Cannot send message: WebSocket not connected');
      }
    }
  }));

  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const playNextAudioChunk = useCallback(async () => {
    if (isPaused || !audioContextRef.current || audioPlayQueueRef.current.length === 0 || isPlayingRef.current) {
      if (audioPlayQueueRef.current.length === 0) {
        setIsAgentSpeaking(false);
      }
      return;
    }

    isPlayingRef.current = true;
    setIsAgentSpeaking(true);
    const audioData = audioPlayQueueRef.current.shift();

    if (audioData) {
      try {
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
      setIsAgentSpeaking(false);
    }
  }, [isPaused]);

  const onNotesListRef = useRef(onNotesList);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onNotesListRef.current = onNotesList;
    onErrorRef.current = onError;
  }, [onNotesList, onError]);

  const [isStarted, setIsStarted] = useState(false);
  const initialJobCountRef = useRef<number | null>(null);

  useEffect(() => {
    const checkJobData = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/jobs`);
        const data = await response.json();
        const currentJobCount = data.jobs?.length || 0;

        if (initialJobCountRef.current === null) {
          initialJobCountRef.current = currentJobCount;
          if (debug) console.log('Initial job count:', currentJobCount);
          return;
        }

        if (debug) console.log(`Checking jobs: current=${currentJobCount}, initial=${initialJobCountRef.current}`);

        if (currentJobCount > initialJobCountRef.current) {
          if (debug) console.log(`New job detected! Count increased from ${initialJobCountRef.current} to ${currentJobCount}`);
          setHasJobData(true);
          initialJobCountRef.current = currentJobCount;
        }
      } catch (error) {
        console.error('Error checking job data:', error);
      }
    };

    if (isStarted && !isPaused) {
      checkJobData();
      const interval = setInterval(checkJobData, 5000);
      return () => clearInterval(interval);
    }
  }, [isStarted, isPaused, apiBaseUrl, debug]);

  const connectToAgent = useCallback(() => {
    wsRef.current = new VoiceAgentWebSocket(jobServiceUrl, debug);
    recorderRef.current = new AudioRecorder();

    wsRef.current.on('notes_list', (message) => {
      if (message.data && onNotesListRef.current) {
        onNotesListRef.current(message.data as any);
      }
    });

    wsRef.current.on('text', (message) => {
      if (message.data && !isPaused) {
        setConnectionStatus('connected');
        setIsConnected(true);

        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          const newData = String(message.data);

          if (lastMsg && lastMsg.role === 'agent') {
            const updated = [...prev];
            updated[prev.length - 1] = {
              ...lastMsg,
              text: (lastMsg.text || '') + newData
            };
            return updated;
          } else {
            return [...prev, {
              id: Date.now().toString(),
              role: 'agent',
              text: newData,
              timestamp: new Date()
            }];
          }
        });
      }
    });

    wsRef.current.on('user_transcript', (message) => {
      if (message.data && !isPaused) {
        setConnectionStatus('connected');
        setIsConnected(true);

        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          const newData = String(message.data);

          if (lastMsg && lastMsg.role === 'user' && !lastMsg.image) {
            if (lastMsg.text === newData) return prev;

            const updated = [...prev];
            updated[prev.length - 1] = {
              ...lastMsg,
              text: (lastMsg.text || '') + ' ' + newData
            };
            return updated;
          } else {
            return [...prev, {
              id: Date.now().toString(),
              role: 'user',
              text: newData,
              timestamp: new Date()
            }];
          }
        });
      }
    });

    wsRef.current.on('audio', (message) => {
      if (message.data && !isPaused) {
        setConnectionStatus('connected');
        setIsConnected(true);

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
      if (debug) console.log('Response interrupted');
      audioPlayQueueRef.current = [];
      isPlayingRef.current = false;
      setIsAgentSpeaking(false);
    });

    wsRef.current.on('turn_complete', () => {
      if (debug) console.log('Turn completed');
    });

    setConnectionStatus('connecting');
    wsRef.current.connect()
      .then(() => {
        if (debug) console.log('WebSocket connected');
        setConnectionStatus('connected');
        setIsConnected(true);
        wsRef.current?.send(JSON.stringify({ type: 'get_notes' }));
      })
      .catch((error) => {
        console.error('Failed to connect:', error);
        setConnectionStatus('disconnected');
        if (onErrorRef.current) {
          onErrorRef.current('Failed to connect to voice agent');
        }
      });
  }, [playNextAudioChunk, isPaused, jobServiceUrl, debug]);

  const handleStart = () => {
    try {
      if (debug) console.log('Starting assessment...');
      setIsStarted(true);
      initAudioContext();
      connectToAgent();
      startRecording().catch(console.error);
    } catch (error) {
      console.error('Error starting assessment:', error);
      if (onErrorRef.current) {
        onErrorRef.current('Failed to start assessment. Please refresh and try again.');
      }
    }
  };

  useEffect(() => {
    return () => {
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
      }
      recorderRef.current?.stop();
      wsRef.current?.disconnect();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    const handleUserInteraction = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          if (audioPlayQueueRef.current.length > 0 && !isPlayingRef.current && !isPaused) {
            playNextAudioChunk();
          }
        });
      }
    };

    window.addEventListener('click', handleUserInteraction);
    return () => {
      window.removeEventListener('click', handleUserInteraction);
    };
  }, [playNextAudioChunk, isPaused]);

  const startRecording = async () => {
    if (isPaused) return;

    initAudioContext();

    if (!recorderRef.current || !wsRef.current) {
      console.warn('Recorder or WebSocket not initialized');
      return;
    }

    try {
      audioQueueRef.current = [];
      await recorderRef.current.start((audioData: ArrayBuffer) => {
        audioQueueRef.current.push(audioData);
      });

      setIsRecording(true);

      sendIntervalRef.current = setInterval(() => {
        if (wsRef.current && wsRef.current.isConnected() && audioQueueRef.current.length > 0 && !isPaused) {
          const chunk = audioQueueRef.current.shift();
          if (chunk) {
            wsRef.current.sendAudio(chunk);
          }
        }
      }, 100);
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

    if (wsRef.current) {
      wsRef.current.sendEnd();
    }

    audioQueueRef.current = [];
  };

  const toggleRecording = () => {
    if (isPaused) return;

    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !wsRef.current || !isConnected || isPaused) return;

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      text: inputText,
      timestamp: new Date()
    }]);

    wsRef.current.send(JSON.stringify({
      type: 'text',
      data: inputText
    }));

    setInputText('');
  };

  const getStatusColor = () => {
    if (isPaused) return 'bg-yellow-500';
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      default: return 'bg-red-500';
    }
  };

  const getStatusText = () => {
    if (isPaused) return 'paused';
    return connectionStatus;
  };

  return (
    <div className="flex flex-col h-[600px] w-full max-w-2xl mx-auto bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex justify-between items-center">
        <h2 className="text-white font-semibold text-lg">Agent Chat</h2>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
            <div className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`}></div>
            <span className="text-xs text-white/90 capitalize font-medium">{getStatusText()}</span>
          </div>
          {isPaused && (
            <button
              onClick={resumeConversation}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 shadow-lg animate-pulse"
              title="Resume Conversation"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Resume</span>
            </button>
          )}

          {hasJobData && !showJsonPreview && (
            <button
              onClick={handlePauseAndView}
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 backdrop-blur-sm animate-pulse"
              title="Pause & View Extracted Job"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>View Job</span>
            </button>
          )}

          {/* Logout Button - only show if onLogout is provided */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="ml-4 bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-all shadow-md"
            >
              Logout
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 relative">
        {!isStarted && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-6 text-center">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Start Conversation</h3>
              <p className="text-gray-500 mb-6">Click below to start the Job Scope Assistant and enable audio.</p>
              <button
                onClick={handleStart}
                className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-blue-500/30"
              >
                Start Assessment
              </button>
            </div>
          </div>
        )}

        {/* JSON Preview Overlay */}
        {showJsonPreview && extractedJobJson && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-20 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90%] overflow-hidden flex flex-col">
              {/* Preview Header */}
              <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 flex-shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Job Extracted!</h2>
                    <p className="text-green-100 text-sm">Review the details below</p>
                  </div>
                </div>
              </div>

              {/* Job Summary Card */}
              <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-blue-50 to-purple-50">
                <h3 className="text-2xl font-bold text-gray-900 mb-3">{extractedJobJson.title}</h3>
                <p className="text-gray-700 mb-6 leading-relaxed">{extractedJobJson.description}</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="text-xs text-gray-500 mb-1 font-medium">Category</div>
                    <div className="font-semibold text-gray-900 capitalize">{extractedJobJson.category}</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="text-xs text-gray-500 mb-1 font-medium">Urgency</div>
                    <div className="font-semibold text-gray-900 capitalize">{extractedJobJson.urgency}</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="text-xs text-gray-500 mb-1 font-medium">Complexity</div>
                    <div className="font-semibold text-gray-900 capitalize">{extractedJobJson.complexity}</div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 bg-gray-50 border-t border-gray-200">
                <div className="flex gap-3 mb-3">
                  <button
                    onClick={() => {
                      setShowJsonPreview(false);
                      setHasJobData(false);
                      resumeConversation();
                    }}
                    className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Resume</span>
                  </button>
                  {onNavigateToJobBoard && (
                    <button
                      onClick={() => {
                        setShowJsonPreview(false);
                        onNavigateToJobBoard();
                      }}
                      className="flex-1 py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span>Job Board</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {messages.length === 0 && isStarted && (
          <div className="text-center text-gray-400 mt-20">
            <p>Waiting for agent...</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-2xl shadow-sm ${msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-none'
                : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                }`}
            >
              {msg.text && <p className="text-sm leading-relaxed">{msg.text}</p>}
              {msg.image && (
                <div className="mt-2 rounded-lg overflow-hidden border border-gray-200">
                  <img src={msg.image} alt="User upload" className="max-w-full h-auto max-h-64 object-cover" />
                </div>
              )}
              {msg.video && (
                <div className="mt-2 rounded-lg overflow-hidden border border-gray-200">
                  <video src={msg.video} controls className="max-w-full h-auto max-h-64 object-cover" />
                </div>
              )}
              <span className={`text-[10px] block mt-1 ${msg.role === 'user' ? 'text-blue-100' : 'text-gray-400'
                }`}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        {isAgentSpeaking && (
          <div className="flex justify-start">
            <div className="bg-white p-3 rounded-2xl rounded-bl-none border border-gray-200 shadow-sm flex items-center space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-100">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
        />
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          ref={videoInputRef}
          onChange={handleVideoFileChange}
        />
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleRecording}
            disabled={!isStarted || isPaused}
            className={`
              p-3 rounded-full transition-all duration-300 transform hover:scale-105 flex-shrink-0
              ${isRecording
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 ring-4 ring-red-100'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }
              ${!isStarted || isPaused ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            {isRecording ? (
              <div className="w-5 h-5 bg-white rounded-sm animate-pulse" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>

          <button
            onClick={handleImageUpload}
            disabled={!isConnected || isPaused}
            className={`p-3 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0 ${!isConnected || isPaused ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Upload Image"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          <button
            onClick={handleVideoUpload}
            disabled={!isConnected || isPaused}
            className={`p-3 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0 ${!isConnected || isPaused ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Upload Video"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>

          <form onSubmit={handleSendMessage} className="flex-1 flex items-center space-x-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isPaused ? "Conversation paused..." : "Type a message..."}
              disabled={!isConnected || isPaused}
              className="flex-1 px-4 py-3 bg-gray-100 rounded-full border-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white transition-all outline-none text-sm text-gray-700 placeholder-gray-400"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || !isConnected || isPaused}
              className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/30"
            >
              <svg className="w-5 h-5 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
});

ChatInterface.displayName = 'ChatInterface';

export default ChatInterface;
