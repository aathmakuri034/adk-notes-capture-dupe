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
        // Stops recording if active
        if(isRecording){
            wasRecordingRef.current = true;
            stopRecording()
        }

        // Clear audio queue
        audioPlayQueueRef.current = [];
        audioQueueRef.current = [];
        isPlayingRef.current = false;
        setIsAgentSpeaking(false);

        setIsPaused(true);
    };

    const resumeConversation = () => {
        setIsPaused(false);

        // Resume recording if it was active before pause
        if(wasRecordingRef.current){
            wasRecordingRef.current = false;
            startRecording().catch(console.error);
        }
    };

    const handlePauseAndView = async () => {
        try {
            // Pause the conversation first
            pauseConversation();

            // Fetch the most recent job
            const response = await fetch('/api/jobs');
            const data = await response.json();

            if (data.jobs && data.jobs.length > 0){
                // Get the most recent job (first in array since its sorted)
                const latestJob = data.jobs[0];

                // Fetch full job details
                const jobResponse = await fetch(`/api/jobs/${latestJob.id}`);
                const jobData = await jobResponse.json();

                if(jobData.success){
                    console.log('Extracted job data:', jobData.job);
                    setExtractedJobJson(jobData.job);
                    setShowJsonPreview(true);
                }
            }
        } catch (error) {
            console.error("Error fetching job data: ", error);
            if(onErrorRef.current){
                onErrorRef.current('Failed to load job details');
            }
        }
    };

    const handleGoToJobBoard = () => {
        router.push('/jobs');
    };


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !wsRef.current || !isConnected || isPaused) return;

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
        if (!file || !wsRef.current || !isConnected || isPaused) return;

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
            if (wsRef.current && wsRef.current.isConnected() && !isPaused) {
                wsRef.current.send(JSON.stringify({ type, data }));
            } else if(isPaused){
                console.warn('Cannot send message: Conversation paused')
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

    // Refs for callbacks
    const onNotesListRef = useRef(onNotesList);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onNotesListRef.current = onNotesList;
        onErrorRef.current = onError;
    }, [onNotesList, onError]);

    const [isStarted, setIsStarted] = useState(false);
    const initialJobCountRef = useRef<number | null>(null);

    // Poll for new jobs but DON'T auto-pause
    useEffect(() => {
    const checkJobData = async () => {
        try {
            const response = await fetch('/api/jobs');
            const data = await response.json();
            const currentJobCount = data.jobs?.length || 0;
            
            if (initialJobCountRef.current === null) {
                initialJobCountRef.current = currentJobCount;
                console.log('Initial job count:', currentJobCount);
                console.log('Jobs fetched:', data.jobs);
                return;
            }
            
            console.log(`Checking jobs: current=${currentJobCount}, initial=${initialJobCountRef.current}`);
            
            if (currentJobCount > initialJobCountRef.current) {
                console.log(`✅ New job detected! Count increased from ${initialJobCountRef.current} to ${currentJobCount}`);
                setHasJobData(true);
                // Update the count but DON'T auto-pause or show modal
                initialJobCountRef.current = currentJobCount;
            }
        } catch (error) {
            console.error('Error checking job data:', error);
        }
    };

    if (isStarted && !isPaused) {
        // Check immediately
        checkJobData();
        // Poll every 5 seconds (increased from 3 to give extraction more time)
        const interval = setInterval(checkJobData, 5000);
        return () => clearInterval(interval);
    }
}, [isStarted, isPaused]);

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
            if (message.data && !isPaused) {
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
            if (message.data && !isPaused) {
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
            if (message.data && !isPaused) {
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
    }, [playNextAudioChunk, isPaused]);

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
        if(isPaused) return;

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
                <div className="flex items-center space-x-3"> {/* ← CHANGED: space-x-2 to space-x-3 */}
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
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90%] flex flex-col">
                            {/* Preview Header */}
                            <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-4 flex-shrink-0">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Job Extracted!</h2>
                                        <p className="text-green-100 text-sm">Review the structured data below</p>
                                    </div>
                                </div>
                            </div>

                            {/* JSON Content - scrollable */}
                            <div className="flex-1 overflow-y-auto p-6 bg-gray-900">
                                <pre className="text-green-400 font-mono text-sm leading-relaxed">
                                    <code>{JSON.stringify(extractedJobJson, null, 2)}</code>
                                </pre>
                            </div>

                            {/* Action Buttons */}
                            <div className="p-4 bg-gray-50 border-t border-gray-200">
                                {/* Main action buttons */}
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
                                    <button
                                        onClick={() => {
                                            setShowJsonPreview(false);
                                            router.push('/jobs');
                                        }}
                                        className="flex-1 py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                        <span>Job Board</span>
                                    </button>
                                </div>
                                
                                {/* View in new tab link */}
                                <button
                                    onClick={() => {
                                        // Try different possible ID field names
                                        const jobId = extractedJobJson?.id || extractedJobJson?._id || extractedJobJson?.job_id;
                                        
                                        console.log('Attempting to open job with ID:', jobId);
                                        console.log('Full job data:', extractedJobJson);
                                        
                                        if (jobId) {
                                            window.open(`/jobs/${jobId}`, '_blank');
                                        } else {
                                            alert('Job ID not found. Check console for details.');
                                        }
                                    }}
                                    className="w-full py-2 text-center text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg text-sm font-medium transition-all flex items-center justify-center space-x-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    <span>View full details in new tab</span>
                                </button>
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
