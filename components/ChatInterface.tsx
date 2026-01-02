'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { VoiceAgentWebSocket } from '@/lib/websocket-client';
import { useRouter } from 'next/navigation';
import { AudioRecorder } from '@/lib/audio-recorder';

interface Message {
    id: string;
    role: 'user' | 'agent';
    text?: string;
    image?: string;
    video?: string;
    timestamp: Date;
}

interface ChatInterfaceProps {
    onNotesList?: (notes: any[]) => void;
    onError?: (error: string) => void;
}

export interface ChatInterfaceRef {
    sendMessage: (type: string, data?: any) => void;
}

const ChatInterface = forwardRef<ChatInterfaceRef, ChatInterfaceProps>(({
    onNotesList,
    onError
}, ref) => {
    const router = useRouter();
    const [isConnected, setIsConnected] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
    const [hasJobData, setHasJobData] = useState(false);

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

    const handleImageUpload = () => {
        fileInputRef.current?.click();
    };

    const handleVideoUpload = () => {
        videoInputRef.current?.click();
    };

    const handleSkip = () => {
        router.push('/jobs');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !wsRef.current || !isConnected) return;

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64Data = event.target?.result as string;

            // Add optimistic message
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'user',
                image: base64Data,
                timestamp: new Date()
            }]);

            // Send to server
            wsRef.current?.send(JSON.stringify({
                type: 'image',
                data: base64Data
            }));
        };
        reader.readAsDataURL(file);
    };

    const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !wsRef.current || !isConnected) return;

        // Validation: 50MB limit
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
            if (onErrorRef.current) {
                onErrorRef.current('Video file too large. Please select a video smaller than 25MB.');
            } else {
                alert('Video file too large. Please select a video smaller than 25MB.');
            }
            return;
        }

        // Reset file input
        if (videoInputRef.current) {
            videoInputRef.current.value = '';
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64Data = event.target?.result as string;

            // Add optimistic message
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'user',
                video: base64Data,
                timestamp: new Date()
            }]);

            // Send to server
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

    const playNextAudioChunk = useCallback(async () => {
        if (!audioContextRef.current || audioPlayQueueRef.current.length === 0 || isPlayingRef.current) {
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
    }, []);

    // Refs for callbacks
    const onNotesListRef = useRef(onNotesList);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onNotesListRef.current = onNotesList;
        onErrorRef.current = onError;
    }, [onNotesList, onError]);

    const [isStarted, setIsStarted] = useState(false);
    const sessionStartTimeRef = useRef<Date | null>(null);

    // Check if new job
    useEffect(() => {
        const checkJobData = async () => {
            try {
                const response = await fetch('/api/jobs');
                const data = await response.json();
                
                // Store session start time on first check
                if (sessionStartTimeRef.current === null) {
                    sessionStartTimeRef.current = new Date();
                    console.log('Session started at:', sessionStartTimeRef.current);
                    return;
                }
                
                // Check if any jobs were created after session started
                const recentJobs = data.jobs?.filter((job: any) => {
                    const jobCreatedAt = new Date(job.created_at);
                    return jobCreatedAt > sessionStartTimeRef.current!;
                });
                
                if (recentJobs && recentJobs.length > 0) {
                    console.log(`Found ${recentJobs.length} job(s) created during this session`);
                    setHasJobData(true);
                }
            } catch (error) {
                console.error('Error checking job data:', error);
            }
        };

        if (isStarted) {
            // Check immediately when started
            checkJobData();
            // Poll every 2 seconds to check for new jobs
            const interval = setInterval(checkJobData, 2000);
            return () => clearInterval(interval);
        }
    }, [isStarted]);

    const connectToAgent = useCallback(() => {
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
        wsRef.current = new VoiceAgentWebSocket(wsUrl);
        recorderRef.current = new AudioRecorder();

        wsRef.current.on('notes_list', (message) => {
            if (message.data && onNotesListRef.current) {
                onNotesListRef.current(message.data as any);
            }
        });

        wsRef.current.on('text', (message) => {
            if (message.data) {
                // Failsafe: if we receive text, we are connected
                setConnectionStatus('connected');
                setIsConnected(true);

                setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    const newData = String(message.data);

                    // Specific fix for "Hello" duplicate: check if we are just starting
                    // If the new data is exactly the same as the start of the last message, it might be a re-send?
                    // Actually, the issue is fragmentation. 

                    if (lastMsg && lastMsg.role === 'agent') {
                        // Create a new array with the last message updated
                        const updated = [...prev];
                        // Append text to the last message
                        updated[prev.length - 1] = {
                            ...lastMsg,
                            text: (lastMsg.text || '') + newData
                        };
                        return updated;
                    } else {
                        // New agent message
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
            if (message.data) {
                // Failsafe: if we receive user transcript, we are connected
                setConnectionStatus('connected');
                setIsConnected(true);
                // For user transcript, we generally want to see it as a distinct block if it's new
                // But if we have an optimistic message (from text input) we might want to dedupe?
                // The current issue reported was agent duplicates. user "Hi" manual input vs transcript?
                // If user types "Hi", we add it. Then we get transcript "Hi"? 
                // Let's just append for now to avoid fragmentation.
                setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    const newData = String(message.data);

                    if (lastMsg && lastMsg.role === 'user' && !lastMsg.image) {
                        // Optional: dedupe if exact match
                        if (lastMsg.text === newData) return prev;

                        // Append if it looks like a continuation
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
            if (message.data) {
                // Failsafe: if we receive audio, we are connected
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
            // setIsStarted(false); // Reset start state on error
        });

        wsRef.current.on('interrupted', () => {
            console.log('Response interrupted');
            audioPlayQueueRef.current = [];
            isPlayingRef.current = false;
            setIsAgentSpeaking(false);
        });

        wsRef.current.on('turn_complete', () => {
            console.log('Turn completed');
        });

        setConnectionStatus('connecting');
        wsRef.current.connect()
            .then(() => {
                console.log('WebSocket connected');
                setConnectionStatus('connected');
                setIsConnected(true);
                wsRef.current?.send(JSON.stringify({ type: 'get_notes' }));
            })
            .catch((error) => {
                console.error('Failed to connect:', error);
                setConnectionStatus('disconnected');
                // setIsStarted(false); // Don't reset start state on error to avoid flicker
                if (onErrorRef.current) {
                    onErrorRef.current('Failed to connect to voice agent');
                }
            });
    }, [playNextAudioChunk]);

    const handleStart = () => {
        try {
            console.log('Starting assessment...');
            setIsStarted(true);
            initAudioContext();
            connectToAgent();
            // Auto-start recording for seamless interaction
            startRecording().catch(console.error);
        } catch (error) {
            console.error('Error starting assessment:', error);
            if (onErrorRef.current) {
                onErrorRef.current('Failed to start assessment. Please refresh and try again.');
            }
        }
    };

    useEffect(() => {
        // Only cleanup on unmount
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
    }, [playNextAudioChunk]);

    const startRecording = async () => {
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
                // Check if socket is actually open before sending
                if (wsRef.current && wsRef.current.isConnected() && audioQueueRef.current.length > 0) {
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
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim() || !wsRef.current || !isConnected) return;

        // Add user message to UI immediately
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'user',
            text: inputText,
            timestamp: new Date()
        }]);

        // Send text to server
        wsRef.current.send(JSON.stringify({
            type: 'text',
            data: inputText
        }));

        setInputText('');
    };

    const getStatusColor = () => {
        switch (connectionStatus) {
            case 'connected': return 'bg-green-500';
            case 'connecting': return 'bg-yellow-500';
            default: return 'bg-red-500';
        }
    };

    return (
        <div className="flex flex-col h-[600px] w-full max-w-2xl mx-auto bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-100">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex justify-between items-center">
                <h2 className="text-white font-semibold text-lg">Agent Chat</h2>
                <div className="flex items-center space-x-3"> {/* ← CHANGED: space-x-2 to space-x-3 */}
                    <div className="flex items-center space-x-2 bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
                        <div className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`}></div>
                        <span className="text-xs text-white/90 capitalize font-medium">{connectionStatus}</span>
                    </div>
                    {/* Skip Button Added */}
                    {hasJobData && (
                        <button
                            onClick={handleSkip}
                            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 backdrop-blur-sm"
                            title="Skip to Job Board"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <span>View Jobs</span>
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
                        disabled={!isStarted}
                        className={`
              p-3 rounded-full transition-all duration-300 transform hover:scale-105 flex-shrink-0
              ${isRecording
                                ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 ring-4 ring-red-100'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }
              ${!isStarted ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
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
                        disabled={!isConnected}
                        className={`p-3 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Upload Image"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </button>

                    <button
                        onClick={handleVideoUpload}
                        disabled={!isConnected}
                        className={`p-3 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                            placeholder="Type a message..."
                            disabled={!isConnected}
                            className="flex-1 px-4 py-3 bg-gray-100 rounded-full border-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white transition-all outline-none text-sm text-gray-700 placeholder-gray-400"
                        />
                        <button
                            type="submit"
                            disabled={!inputText.trim() || !isConnected}
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
