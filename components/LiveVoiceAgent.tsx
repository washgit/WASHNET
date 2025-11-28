
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Tool, Type } from '@google/genai';
import { Mic, MicOff, X, Activity, Volume2, Wifi, Zap, FileText, MessageSquare, ShoppingBag, FileCheck, User, ScanEye, Minimize2, Maximize2, Move } from 'lucide-react';
import { createPcmBlob, decodeAudioData } from '../utils/audioUtils';
import { BookingData } from './BookingForm';
import { ScanResult } from './ScanAnalyzer';

interface LiveVoiceAgentProps {
    isOpen: boolean;
    onClose: () => void;
    initialContext?: string;
    openBookingForm: (data?: BookingData) => void;
    openScanAnalyzer: () => void;
    scanResult: ScanResult | null;
    onNavigate: (section: string) => void;
}

const LiveVoiceAgent: React.FC<LiveVoiceAgentProps> = ({ isOpen, onClose, initialContext, openBookingForm, openScanAnalyzer, scanResult, onNavigate }) => {
    // --- Session State ---
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
    const [whatsappUrl, setWhatsappUrl] = useState("https://wa.me/27817463629");

    // --- UI State (Floating Window) ---
    const [isMinimized, setIsMinimized] = useState(false);
    const [position, setPosition] = useState({ x: 20, y: 100 }); // Default position
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    
    // --- Refs ---
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const appleLogoRef = useRef<SVGSVGElement>(null); 
    const sessionRef = useRef<any>(null);
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const prevScanResultRef = useRef<ScanResult | null>(null);

    // --- Center Window on Open ---
    useEffect(() => {
        if (isOpen) {
            // Center horizontally, place somewhat near top vertically
            const x = Math.max(0, (window.innerWidth - 400) / 2);
            setPosition({ x, y: 100 });
        }
    }, [isOpen]);

    // --- Cyber Sound Effect ---
    useEffect(() => {
        if (isOpen) {
            const playStartupSound = async () => {
                try {
                    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                    if (!AudioContext) return;
                    
                    const ctx = new AudioContext();
                    if (ctx.state === 'suspended') await ctx.resume();

                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();

                    osc.connect(gain);
                    gain.connect(ctx.destination);

                    osc.type = 'sine';
                    const now = ctx.currentTime;
                    
                    osc.frequency.setValueAtTime(150, now);
                    osc.frequency.exponentialRampToValueAtTime(2000, now + 0.35);
                    
                    gain.gain.setValueAtTime(0, now);
                    gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

                    osc.start(now);
                    osc.stop(now + 0.45);
                } catch (e) {
                    console.error("Sound effect failed", e);
                }
            };
            playStartupSound();
        }
    }, [isOpen]);

    // --- Drag Logic ---
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // --- Tools Definition ---
    const tools: Tool[] = [
        {
            functionDeclarations: [{
                name: "update_whatsapp_context",
                description: "Updates the WhatsApp contact button on the user's screen with a summary.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        summary: { type: Type.STRING, description: "Conversation summary." },
                    },
                    required: ["summary"],
                },
            }]
        },
        {
            functionDeclarations: [{
                name: "open_booking_form",
                description: "Opens Smart Booking Form.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        phone: { type: Type.STRING },
                        email: { type: Type.STRING },
                        address: { type: Type.STRING },
                        deviceType: { type: Type.STRING },
                        serviceType: { type: Type.STRING, enum: ["Repair", "Diagnostic", "Software", "Network"] },
                        issue: { type: Type.STRING }
                    }
                }
            }]
        },
        {
            functionDeclarations: [{
                name: "open_scan_analyzer",
                description: "Opens the Scan Analyzer camera interface.",
                parameters: { type: Type.OBJECT, properties: {} }
            }]
        },
        {
            functionDeclarations: [{
                name: "navigate_to_section",
                description: "Navigates to a website section.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        section: { type: Type.STRING, enum: ["home", "services", "remote", "book-now"] }
                    },
                    required: ["section"]
                }
            }]
        }
    ];

    // --- Session Handling ---
    const startSession = async () => {
        try {
            setStatus('connecting');
            if (!process.env.API_KEY) throw new Error("API Key missing");

            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            if (outputAudioContextRef.current.state === 'suspended') {
                await outputAudioContextRef.current.resume();
            }

            const analyzer = outputAudioContextRef.current.createAnalyser();
            analyzer.fftSize = 64; 
            analyzer.smoothingTimeConstant = 0.5;
            analyzerRef.current = analyzer;

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const configData: any = {
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: async () => {
                        console.log("Live Session Opened");
                        setStatus('connected');
                        setIsConnected(true);
                        await startInputStream();
                        if (sessionPromiseRef.current) {
                            sessionPromiseRef.current.then(session => {
                                const contextPrompt = initialContext ? `Context: User is interested in "${initialContext}". ` : "";
                                session.sendRealtimeInput({ 
                                    content: [{ parts: [{ text: `System: User connected. ${contextPrompt}IMMEDIATELY greet them verbally. Say: "Hello, I am Tumelo from Apple911 Solutions. How can I help you today?"` }] }] 
                                });
                            });
                        }
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        const serverContent = message.serverContent;
                        if (serverContent?.interrupted) {
                            sourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
                            sourcesRef.current.clear();
                            if (outputAudioContextRef.current) nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
                            return;
                        }
                        if (message.toolCall) {
                            const responses = message.toolCall.functionCalls.map(fc => {
                                if (fc.name === 'update_whatsapp_context') {
                                    const summary = (fc.args as any).summary;
                                    const encoded = encodeURIComponent(summary);
                                    setWhatsappUrl(`https://wa.me/27817463629?text=${encoded}`);
                                    return { id: fc.id, name: fc.name, response: { result: 'WhatsApp Link Updated.' } };
                                } else if (fc.name === 'open_booking_form') {
                                    const args = fc.args as any;
                                    const bookingData: BookingData = {
                                        name: args.name, phone: args.phone, email: args.email,
                                        address: args.address, deviceType: args.deviceType,
                                        serviceType: args.serviceType, description: args.issue
                                    };
                                    openBookingForm(bookingData);
                                    return { id: fc.id, name: fc.name, response: { result: 'Booking Form Opened.' } };
                                } else if (fc.name === 'open_scan_analyzer') {
                                    openScanAnalyzer();
                                    return { id: fc.id, name: fc.name, response: { result: 'Scanner Interface Opened.' } };
                                } else if (fc.name === 'navigate_to_section') {
                                    onNavigate((fc.args as any).section);
                                    return { id: fc.id, name: fc.name, response: { result: `Navigated.` } };
                                }
                                return { id: fc.id, name: fc.name, response: { result: 'Unknown tool' } };
                            });
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then(session => session.sendToolResponse({ functionResponses: responses }));
                            }
                        }
                        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (base64Audio && outputAudioContextRef.current) {
                            const ctx = outputAudioContextRef.current;
                            const audioBuffer = await decodeAudioData(base64Audio, ctx, 24000, 1);
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                            const source = ctx.createBufferSource();
                            source.buffer = audioBuffer;
                            if (analyzerRef.current) {
                                source.connect(analyzerRef.current);
                                analyzerRef.current.connect(ctx.destination);
                            } else {
                                source.connect(ctx.destination);
                            }
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            sourcesRef.current.add(source);
                            source.onended = () => sourcesRef.current.delete(source);
                        }
                    },
                    onclose: () => handleDisconnect(),
                    onerror: (e: any) => {
                        console.error("Session Error", e);
                        setStatus('error');
                    }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    tools: tools,
                    systemInstruction: `You are "Tumelo", a highly advanced, warm, and empathetic AI support specialist for "Apple911 Solutions".
                    - Name: Tumelo.
                    - Tone: Warm, human-like, professional, efficient.
                    - Role: Diagnostics & Booking Facilitator.
                    - LATENCY: Keep responses concise.
                    - KNOWLEDGE: Tech Expert (M-Series, iOS, Windows, Linux).
                    - VISUAL DIAGNOSIS: If user has a broken device or wants to show something, say "I can look at that. Opening scanner now." and call 'open_scan_analyzer'.
                    - NAVIGATION: Use 'navigate_to_section' if asked to go to specific pages.
                    - AGENT TRANSFER: Use 'update_whatsapp_context' if user wants human agent.
                    - BOOKING: Use 'open_booking_form' to fill details. Treat "Issue" as transcript.`
                }
            };

            sessionPromiseRef.current = ai.live.connect(configData);
            const session = await sessionPromiseRef.current;
            sessionRef.current = session;
        } catch (e) {
            console.error("Connection Failed", e);
            setStatus('error');
        }
    };

    const startInputStream = async () => {
        if (!inputAudioContextRef.current || !sessionPromiseRef.current) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000, channelCount: 1 } 
            });
            streamRef.current = stream;
            const ctx = inputAudioContextRef.current;
            const source = ctx.createMediaStreamSource(stream);
            sourceRef.current = source;
            const processor = ctx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;
            processor.onaudioprocess = (e) => {
                if (isMuted) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createPcmBlob(inputData);
                sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(processor);
            processor.connect(ctx.destination);
        } catch (e) { console.error("Mic Error", e); }
    };

    const handleDisconnect = () => {
        setIsConnected(false);
        setStatus('disconnected');
        streamRef.current?.getTracks().forEach(t => t.stop());
        sourceRef.current?.disconnect();
        processorRef.current?.disconnect();
        inputAudioContextRef.current?.close();
        outputAudioContextRef.current?.close();
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        sessionRef.current = null;
        sessionPromiseRef.current = null;
    };

    const toggleMute = () => setIsMuted(!isMuted);

    // Inject Scan Results
    useEffect(() => {
        if (scanResult && scanResult !== prevScanResultRef.current && isConnected) {
            prevScanResultRef.current = scanResult;
            if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then(session => {
                    session.sendRealtimeInput({ 
                        content: [{ parts: [{ text: `System Update: Scan Results: ${JSON.stringify(scanResult)}. Summarize these and ask to proceed.` }] }] 
                    });
                });
            }
        }
    }, [scanResult, isConnected]);

    // Visualizer Loop
    useEffect(() => {
        const draw = () => {
            if (!analyzerRef.current || !appleLogoRef.current) return;
            const bufferLength = analyzerRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyzerRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for(let i = 0; i < bufferLength; i++) sum += dataArray[i];
            const average = sum / bufferLength;
            const normalized = average / 128;
            const scale = 1 + (normalized * 0.15); 
            const glow = normalized * 20; 
            appleLogoRef.current.style.transform = `scale(${scale})`;
            appleLogoRef.current.style.filter = `drop-shadow(0 0 ${10 + glow}px rgba(34, 211, 238, ${0.5 + (normalized * 0.5)}))`;
            animationFrameRef.current = requestAnimationFrame(draw);
        };
        if (isConnected) draw();
        else {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (appleLogoRef.current) {
                appleLogoRef.current.style.transform = 'scale(1)';
                appleLogoRef.current.style.filter = 'drop-shadow(0 0 10px rgba(34, 211, 238, 0.3))';
            }
        }
    }, [isConnected]);

    useEffect(() => {
        if (isOpen && !isConnected && status === 'disconnected') startSession();
        else if (!isOpen && isConnected) handleDisconnect();
    }, [isOpen]);

    if (!isOpen) return null;

    // --- Render ---
    return (
        <div 
            style={{ 
                left: `${position.x}px`, 
                top: `${position.y}px`,
                position: 'fixed',
                zIndex: 60 
            }}
            className={`flex flex-col bg-gray-900 border border-cyan-500/50 rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(6,182,212,0.3)] transition-all duration-300 ease-out ${
                isMinimized ? 'w-[300px] h-auto' : 'w-[90vw] max-w-md h-[600px]'
            } animate-fade-in-up`}
        >
             <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.05)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none"></div>

            {/* Header / Drag Handle */}
            <div 
                className="relative z-10 p-4 bg-gray-950/80 border-b border-cyan-500/30 flex justify-between items-center cursor-move select-none"
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-cyan-500'}`}></div>
                    <span className="text-cyan-400 font-mono text-xs tracking-widest uppercase">
                        {status === 'connected' ? 'TUMELO_ONLINE' : 'INITIALIZING...'}
                    </span>
                    <Move size={12} className="text-gray-600 ml-2" />
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsMinimized(!isMinimized)} className="text-cyan-600 hover:text-cyan-300 p-1">
                        {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    </button>
                    <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Minimized View */}
            {isMinimized && (
                <div className="p-4 bg-gray-950/90 flex justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <Activity className={`text-cyan-500 ${isConnected ? 'animate-pulse' : ''}`} size={20} />
                        <span className="text-white font-mono text-sm">Active</span>
                    </div>
                    <button onClick={toggleMute} className={`p-2 rounded-full ${isMuted ? 'bg-red-500/20 text-red-500' : 'bg-gray-800 text-gray-300'}`}>
                        {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                </div>
            )}

            {/* Maximized View */}
            {!isMinimized && (
                <>
                    {/* Main Visualizer */}
                    <div className="flex-1 flex flex-col items-center justify-center relative z-10 min-h-[200px]">
                        <div className="w-48 h-48 flex items-center justify-center">
                             <svg 
                                ref={appleLogoRef}
                                viewBox="0 0 24 30" 
                                className="w-full h-full transition-transform duration-75 ease-linear overflow-visible"
                                style={{ filter: 'drop-shadow(0 0 10px rgba(34, 211, 238, 0.3))' }}
                             >
                                <path d="M16.51 14.54c-.04 2.21 1.94 2.96 2.03 2.99-.01.04-.31 1.08-1.04 2.14-.94 1.36-1.89 1.37-3.34 1.39-1.45.01-1.91-.86-3.57-.86-1.66 0-2.2.85-3.59.88-1.44.03-2.54-1.45-3.46-2.78-1.88-2.72-3.31-7.68-1.38-11.02.95-1.65 2.65-2.7 4.5-2.73 1.41-.03 2.75.95 3.61.95.85 0 2.46-1.18 4.14-1 0.7.03 2.68.28 3.94 2.13-.1.07-2.35 1.37-2.35 4.21z" fill="none" stroke="#22d3ee" strokeWidth="0.5" />
                                <path d="M12.92 4.46c.74-.89 1.24-2.13 1.11-3.33-1.06.04-2.34.73-3.1 1.62-.67.78-1.26 2.04-1.1 3.24 1.18.09 2.37-.63 3.09-1.53z" fill="none" stroke="#22d3ee" strokeWidth="0.5" />
                            </svg>
                        </div>
                        <div className="mt-6 text-center">
                            <h3 className="text-xl font-bold text-white font-mono tracking-tight">TUMELO</h3>
                            <p className="text-cyan-500/80 text-xs font-mono tracking-wider mt-1">
                                {status === 'connecting' ? 'ESTABLISHING UPLINK...' : status === 'connected' ? 'LISTENING_MODE_ACTIVE' : 'DISCONNECTED'}
                            </p>
                        </div>
                    </div>

                    {/* Context Actions Grid */}
                    {isConnected && (
                        <div className="px-6 mb-4 grid grid-cols-3 gap-2 relative z-20">
                            <a 
                                href={whatsappUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-green-900/20 border border-green-500/30 text-green-400 p-2 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-green-500 hover:text-black transition-all group h-20"
                            >
                                <MessageSquare size={16} className="group-hover:scale-110 transition-transform" />
                                <span className="text-[9px] font-bold font-mono text-center leading-tight">HUMAN<br/>AGENT</span>
                            </a>
                            <button 
                                onClick={openScanAnalyzer}
                                className="bg-cyan-900/20 border border-cyan-500/30 text-cyan-400 p-2 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-cyan-500 hover:text-black transition-all group h-20"
                            >
                                <ScanEye size={20} className="group-hover:scale-110 transition-transform animate-pulse" />
                                <span className="text-[9px] font-bold font-mono text-center leading-tight">OPTICAL<br/>SCAN</span>
                            </button>
                            <a 
                                href="https://www.yaga.co.za/apple911"
                                target="_blank"
                                rel="noreferrer"
                                className="bg-yellow-900/20 border border-yellow-500/30 text-yellow-400 p-2 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-yellow-500 hover:text-black transition-all group h-20"
                            >
                                <ShoppingBag size={16} className="group-hover:scale-110 transition-transform" />
                                <span className="text-[9px] font-bold font-mono text-center leading-tight">YAGA<br/>STORE</span>
                            </a>
                        </div>
                    )}

                    {/* Footer Controls */}
                    <div className="relative z-10 p-4 bg-gray-950/50 border-t border-cyan-500/30 backdrop-blur-md">
                         <div className="flex items-center justify-center gap-6">
                             <button 
                                onClick={toggleMute}
                                className={`p-3 rounded-full border transition-all ${
                                    isMuted ? 'bg-red-500/20 border-red-500 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-white hover:text-white'
                                }`}
                             >
                                 {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                             </button>
                             <button 
                                onClick={handleDisconnect}
                                className="p-3 rounded-full bg-red-600/20 border border-red-500 text-red-500 hover:bg-red-600 hover:text-white transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                             >
                                 <Zap size={20} />
                             </button>
                         </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default LiveVoiceAgent;
