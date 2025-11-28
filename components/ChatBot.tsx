
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat, GenerateContentResponse, Tool, Type, Content } from "@google/genai";
import { Send, X, User, AlertCircle, Terminal, Trash2, Cpu, Activity, Sparkles, Globe, Paperclip, Image as ImageIcon, ScanEye } from 'lucide-react';
import { BookingData } from './BookingForm';

interface ChatBotProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    initialMessage: string | null;
    openBookingForm: (data?: BookingData) => void;
}

interface Message {
    id: string;
    role: 'user' | 'model';
    text: string;
    image?: string; // Base64 string for display
    groundingMetadata?: any;
}

const ChatBot: React.FC<ChatBotProps> = ({ isOpen, setIsOpen, initialMessage, openBookingForm }) => {
    // Lazy load messages from localStorage
    const [messages, setMessages] = useState<Message[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('apple911_chat_history');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    console.error("Failed to parse chat history", e);
                }
            }
        }
        return [
            { id: '1', role: 'model', text: "Apple911 Neural Link Active. I am Tumelo, your digital diagnostic unit. Please state your name so I may address you properly." }
        ];
    });
    
    const [inputValue, setInputValue] = useState('');
    const [selectedImage, setSelectedImage] = useState<string | null>(null); // Base64 for upload
    const [isLoading, setIsLoading] = useState(false);
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Persist messages to localStorage
    useEffect(() => {
        localStorage.setItem('apple911_chat_history', JSON.stringify(messages));
    }, [messages]);

    // Sound Effect for Toggle
    useEffect(() => {
        if (isOpen) {
            const playSound = async () => {
                try {
                    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                    if (!AudioContext) return;
                    
                    const ctx = new AudioContext();
                    
                    if (ctx.state === 'suspended') {
                        await ctx.resume();
                    }

                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();

                    osc.connect(gain);
                    gain.connect(ctx.destination);

                    osc.type = 'sawtooth';
                    
                    const now = ctx.currentTime;
                    osc.frequency.setValueAtTime(220, now);
                    osc.frequency.exponentialRampToValueAtTime(2000, now + 0.15);
                    
                    gain.gain.setValueAtTime(0.2, now); 
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

                    osc.start(now);
                    osc.stop(now + 0.35);
                } catch (e) {
                    console.debug("Audio play failed", e);
                }
            };
            playSound();
        }
    }, [isOpen]);

    // Define tools
    const tools: Tool[] = [
        {
            googleSearch: {} 
        },
        {
            functionDeclarations: [{
                name: "open_booking_form",
                description: "Opens the Smart Booking Form overlay on the user's screen. Can optionally be pre-filled with data collected during conversation.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING, description: "Customer name" },
                        phone: { type: Type.STRING, description: "Customer phone number" },
                        email: { type: Type.STRING, description: "Customer email address" },
                        address: { type: Type.STRING, description: "Physical address" },
                        deviceType: { type: Type.STRING, description: "Device type (iPhone, MacBook, PC, Server)" },
                        serviceType: { 
                            type: Type.STRING, 
                            description: "The specific operation/service type required based on the issue.",
                            enum: ["Repair", "Diagnostic", "Software", "Network"]
                        },
                        issue: { type: Type.STRING, description: "Description of the issue or service required" }
                    }
                }
            }]
        }
    ];

    // Initialize Gemini Chat
    useEffect(() => {
        const initChat = () => {
            try {
                if (!process.env.API_KEY) {
                    console.error("API Key not found");
                    setError("API Key missing. System offline.");
                    return;
                }
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

                // STRICT HISTORY SANITIZATION
                const validHistory: Content[] = [];
                let expectedRole = 'user'; 

                const historyMessages = messages.filter(msg => msg.id !== '1' && msg.text.trim() !== '');

                historyMessages.forEach(msg => {
                    if (msg.role === expectedRole) {
                        // NOTE: We do NOT send image history back to Gemini Flash in chat mode easily due to token/complexity limits in history reconstruction. 
                        // We primarily send text context. For a robust app, you'd store the file URIs.
                        // Here we send text parts only for history to keep it stable.
                        validHistory.push({
                            role: msg.role,
                            parts: [{ text: msg.text }] 
                        });
                        expectedRole = expectedRole === 'user' ? 'model' : 'user';
                    }
                });

                if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
                     validHistory.pop();
                }

                const chat = ai.chats.create({
                    model: 'gemini-2.5-flash',
                    history: validHistory,
                    config: {
                        tools: tools,
                        systemInstruction: `You are "Tumelo", the advanced AI assistant for "Apple911", a high-tech cyber repair unit.

                        // IDENTITY PROTOCOL
                        - Name: Tumelo.
                        - Personality: High-tech, efficient, precise, slightly futuristic/cyberpunk but professional.
                        - KNOWLEDGE BASE: You are a TECH EXPERT.
                        
                        // ADVANCED CAPABILITIES (AI FEATURES)
                        1. **HOLOGRAPHIC VISION REPAIR (Image Analysis):**
                           - If a user sends an image, analyze it for physical damage (cracks, dents, water damage indicators).
                           - Identify the device model visually (e.g., "That looks like an iPhone 13 Pro due to the camera array").
                           - Estimate repair complexity based on the image.

                        2. **LEGACY CODE BREAKER (Error Codes):**
                           - If a user provides an error code (e.g., -2003F, 0x800, 4013), use 'googleSearch' to find the specific Logic Board or OS level cause.
                           - Provide the exact fix or "Safe Mode" boot sequence.

                        3. **DYNAMIC MARKET PRICING:**
                           - If asked for a price, use 'googleSearch' to find the current average ZAR (South African Rand) price for that part (e.g., "iPhone 11 screen price South Africa").
                           - Give an *estimate* based on the search data, but state it is an estimate.

                        4. **SILICON ARCHITECT:**
                           - You have deep knowledge of Apple Silicon (M1/M2/M3). Explain unified memory limitations or soldering risks if asked.

                        // CORE DATA BANK
                        LOCATION: 31 Maple St, Sunnyside, Pretoria, 0002.
                        CONTACT: WhatsApp 0817463629
                        STORE UPLINK: https://www.yaga.co.za/apple911
                        HOURS: Mon-Fri 08:00-17:00.

                        // BOOKING & FORM FILLING PROTOCOL (CRITICAL)
                        If the user wants to book a service:
                        1. **Option A (Self-Fill):** Call 'open_booking_form' immediately.
                        2. **Option B (Interview Mode - PREFERRED):** Offer to fill the form. Collect: Name, Phone, Email, Address, Device, Issue.
                           - **VERIFICATION:** Summarize data.
                           - **SUBMISSION:** Call 'open_booking_form' with the collected parameters.
                        `
                    }
                });
                setChatSession(chat);
            } catch (err) {
                console.error("Failed to init chat", err);
                setError("Neural Link Failed.");
            }
        };

        if (isOpen && !chatSession) {
            initChat();
        }
    }, [isOpen, chatSession, messages]);

    // Handle initial message from parent
    useEffect(() => {
        if (isOpen && initialMessage && chatSession) {
            const sendInitial = async () => {
                await handleSendMessage(initialMessage);
            };
            sendInitial();
        }
    }, [isOpen, initialMessage, chatSession]); 

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                setSelectedImage(base64String);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSendMessage = async (text: string) => {
        if ((!text.trim() && !selectedImage) || !chatSession || isLoading) return;

        const userMsg: Message = { 
            id: Date.now().toString(), 
            role: 'user', 
            text,
            image: selectedImage || undefined 
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setSelectedImage(null); // Clear image after sending
        setIsLoading(true);
        setError(null);

        try {
            // Prepare Request
            let requestParts: any[] = [];
            
            // Add Image Part if exists
            if (userMsg.image) {
                // Remove data:image/png;base64, prefix for the API
                const base64Data = userMsg.image.split(',')[1];
                const mimeType = userMsg.image.split(';')[0].split(':')[1];
                
                requestParts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                });
            }

            // Add Text Part
            if (text.trim()) {
                requestParts.push({ text: text });
            }

            // NOTE: sendMessageStream usually takes { message: string | Part[] }
            // The type definition might require casting or specific structure depending on SDK version
            const result = await chatSession.sendMessageStream({ message: requestParts as any });
            
            let fullResponseText = '';
            let groundingMetadata = null;
            const botMsgId = (Date.now() + 1).toString();
            
            setMessages(prev => [...prev, { id: botMsgId, role: 'model', text: '' }]);

            for await (const chunk of result) {
                const c = chunk as GenerateContentResponse;
                
                if (c.candidates?.[0]?.groundingMetadata) {
                    groundingMetadata = c.candidates[0].groundingMetadata;
                }

                // Handle Tool Calls
                const functionCalls = c.candidates?.[0]?.content?.parts?.filter(part => part.functionCall)?.map(p => p.functionCall);
                
                if (functionCalls && functionCalls.length > 0) {
                     for (const call of functionCalls) {
                         if (call && call.name === 'open_booking_form') {
                             const args = call.args as any;
                             const bookingData: BookingData = {
                                 name: args.name,
                                 phone: args.phone,
                                 email: args.email,
                                 address: args.address,
                                 deviceType: args.deviceType,
                                 serviceType: args.serviceType,
                                 description: args.issue
                             };
                             openBookingForm(bookingData);
                             
                             const toolResp = await chatSession.sendMessage({
                                 message: [{
                                     functionResponse: {
                                         name: 'open_booking_form',
                                         response: { result: 'Form Opened with prefilled data.' }
                                     }
                                 }]
                             });

                             if (toolResp.text) {
                                fullResponseText += toolResp.text;
                                setMessages(prev => 
                                    prev.map(msg => 
                                        msg.id === botMsgId ? { ...msg, text: fullResponseText } : msg
                                    )
                                );
                             }
                         }
                     }
                }

                const chunkText = c.text || '';
                fullResponseText += chunkText;
                
                setMessages(prev => 
                    prev.map(msg => 
                        msg.id === botMsgId ? { ...msg, text: fullResponseText, groundingMetadata: groundingMetadata || msg.groundingMetadata } : msg
                    )
                );
            }
        } catch (err) {
            console.error("Chat error", err);
            setError("Uplink Interrupted.");
        } finally {
            setIsLoading(false);
        }
    };

    const clearHistory = () => {
        localStorage.removeItem('apple911_chat_history');
        setMessages([{ id: '1', role: 'model', text: "Apple911 Neural Link Active. I am Tumelo, your digital diagnostic unit. Please state your name so I may address you properly." }]);
        setChatSession(null); 
    };

    const formatMessageText = (text: string) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlRegex);
        return parts.map((part, i) => {
            if (part.match(urlRegex)) {
                return (
                    <a 
                        key={i} 
                        href={part} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-cyan-400 font-bold underline break-all hover:text-cyan-300 transition-colors bg-cyan-950/50 px-1 rounded border border-cyan-500/20"
                    >
                        {part}
                    </a>
                );
            }
            return part;
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed bottom-0 right-0 md:bottom-24 md:right-8 z-50 flex flex-col items-end animate-fade-in-up">
            {/* Apple HUD Container */}
            <div className={`w-full md:w-[400px] h-[600px] bg-gray-950 relative overflow-hidden border rounded-2xl backdrop-blur-xl flex flex-col transition-all duration-500 ${isLoading ? 'border-cyan-400 shadow-[0_0_50px_rgba(34,211,238,0.8)]' : 'border-cyan-500/50 shadow-[0_0_40px_rgba(34,211,238,0.2)]'}`}>
                
                <svg className="absolute w-0 h-0">
                  <defs>
                    <pattern id="chatGrid" width="1" height="1" patternUnits="userSpaceOnUse">
                        <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(34,211,238,0.15)" strokeWidth="0.05"/>
                    </pattern>
                    <filter id="chatGlow">
                       <feGaussianBlur stdDeviation="0.5" result="coloredBlur"/>
                       <feMerge>
                           <feMergeNode in="coloredBlur"/>
                           <feMergeNode in="SourceGraphic"/>
                       </feMerge>
                    </filter>
                  </defs>
                </svg>

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
                    <svg viewBox="0 0 24 30" className={`w-64 h-64 overflow-visible transition-all duration-500 ${isLoading ? 'stroke-cyan-300 drop-shadow-[0_0_20px_rgba(34,211,238,0.8)]' : 'stroke-cyan-500'}`}>
                        <path d="M16.51 14.54c-.04 2.21 1.94 2.96 2.03 2.99-.01.04-.31 1.08-1.04 2.14-.94 1.36-1.89 1.37-3.34 1.39-1.45.01-1.91-.86-3.57-.86-1.66 0-2.2.85-3.59.88-1.44.03-2.54-1.45-3.46-2.78-1.88-2.72-3.31-7.68-1.38-11.02.95-1.65 2.65-2.7 4.5-2.73 1.41-.03 2.75.95 3.61.95.85 0 2.46-1.18 4.14-1 0.7.03 2.68.28 3.94 2.13-.1.07-2.35 1.37-2.35 4.21z" 
                              fill="none" strokeWidth="0.2" filter="url(#chatGlow)" />
                         <path d="M12.92 4.46c.74-.89 1.24-2.13 1.11-3.33-1.06.04-2.34.73-3.1 1.62-.67.78-1.26 2.04-1.1 3.24 1.18.09 2.37-.63 3.09-1.53z" 
                               fill="none" strokeWidth="0.2" filter="url(#chatGlow)" />
                         <path d="M16.51 14.54c-.04 2.21 1.94 2.96 2.03 2.99-.01.04-.31 1.08-1.04 2.14-.94 1.36-1.89 1.37-3.34 1.39-1.45.01-1.91-.86-3.57-.86-1.66 0-2.2.85-3.59.88-1.44.03-2.54-1.45-3.46-2.78-1.88-2.72-3.31-7.68-1.38-11.02.95-1.65 2.65-2.7 4.5-2.73 1.41-.03 2.75.95 3.61.95.85 0 2.46-1.18 4.14-1 0.7.03 2.68.28 3.94 2.13-.1.07-2.35 1.37-2.35 4.21z" 
                              fill="url(#chatGrid)" stroke="none" opacity="0.3" />
                    </svg>
                </div>
                
                <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none opacity-20"></div>
                
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent h-32 w-full animate-[scan_4s_linear_infinite] pointer-events-none z-0"></div>

                {/* HUD Header */}
                <div className={`relative z-20 bg-gray-900/90 border-b p-4 flex justify-between items-center shadow-lg transition-colors duration-500 ${isLoading ? 'border-cyan-400/50' : 'border-cyan-500/30'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 border rounded-full flex items-center justify-center bg-cyan-950/30 relative overflow-hidden transition-all duration-500 ${isLoading ? 'border-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.6)]' : 'border-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.3)]'}`}>
                             <div className={`absolute inset-0 bg-cyan-500/20 ${isLoading ? 'animate-ping' : 'animate-pulse'}`}></div>
                             <Cpu size={20} className={`relative z-10 transition-colors ${isLoading ? 'text-white' : 'text-cyan-400'}`} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg tracking-widest text-cyan-400 font-mono leading-none drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]">TUMELO.SYS</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-cyan-300 animate-ping' : 'bg-green-500 animate-pulse'}`}></span>
                                <span className="text-[10px] text-cyan-600 font-mono uppercase tracking-widest">{isLoading ? 'PROCESSING...' : 'ONLINE'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={clearHistory} className="text-cyan-700 hover:text-red-500 transition-colors p-2 hover:bg-red-950/20 rounded-full group" title="Purge Memory">
                            <Trash2 size={18} />
                        </button>
                        <button onClick={() => setIsOpen(false)} className="text-cyan-700 hover:text-cyan-400 transition-colors p-2 hover:bg-cyan-950/20 rounded-full">
                            <X size={22} />
                        </button>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6 relative z-10 scroll-smooth">
                     {messages.map((msg) => (
                        <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-col'} gap-1`}>
                                <div className={`flex ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} gap-3 items-start`}>
                                    <div className={`w-8 h-8 flex items-center justify-center shrink-0 border rounded-lg ${msg.role === 'user' ? 'bg-cyan-900/20 border-cyan-500 text-cyan-400' : 'bg-purple-900/20 border-purple-500 text-purple-400'} shadow-[0_0_10px_rgba(0,0,0,0.5)]`}>
                                        {msg.role === 'user' ? <User size={16} /> : <Terminal size={16} />}
                                    </div>
                                    <div className={`p-4 text-sm md:text-base leading-relaxed font-sans relative group rounded-xl border backdrop-blur-md ${
                                        msg.role === 'user' 
                                        ? 'bg-cyan-950/40 text-cyan-50 border-cyan-500/50 rounded-tr-none' 
                                        : 'bg-gray-900/60 text-gray-200 border-purple-500/30 rounded-tl-none'
                                    }`}>
                                        {msg.image && (
                                            <div className="mb-2 rounded-lg overflow-hidden border border-cyan-500/30">
                                                <img src={msg.image} alt="Upload" className="w-full h-auto max-h-48 object-cover opacity-80" />
                                            </div>
                                        )}
                                        <div className="whitespace-pre-wrap">
                                            {formatMessageText(msg.text)}
                                        </div>
                                        <div className={`absolute -bottom-4 ${msg.role === 'user' ? 'right-0 text-cyan-700' : 'left-0 text-purple-700'} text-[9px] font-mono opacity-0 group-hover:opacity-100 transition-opacity`}>
                                            MSG_ID: {msg.id.slice(-4)}
                                        </div>
                                    </div>
                                </div>
                                
                                {msg.role === 'model' && msg.groundingMetadata?.groundingChunks && (
                                    <div className="ml-11 mt-2 bg-gray-900/50 p-3 rounded-lg border border-white/5">
                                        <p className="text-[10px] text-gray-400 font-mono mb-2 flex items-center gap-1"><Globe size={10} /> SEARCH_SOURCES_DETECTED</p>
                                        <div className="flex flex-wrap gap-2">
                                            {msg.groundingMetadata.groundingChunks.map((chunk: any, i: number) => 
                                                chunk.web?.uri ? (
                                                    <a 
                                                        key={i} 
                                                        href={chunk.web.uri} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer" 
                                                        className="text-[10px] bg-cyan-950/50 text-cyan-400 px-2 py-1 rounded border border-cyan-500/20 hover:bg-cyan-900 hover:border-cyan-400 transition-colors truncate max-w-[200px]"
                                                        title={chunk.web.title}
                                                    >
                                                        {chunk.web.title || chunk.web.uri}
                                                    </a>
                                                ) : null
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                     ))}
                     {isLoading && (
                         <div className="flex w-full justify-start">
                             <div className="flex max-w-[85%] flex-row gap-3">
                                 <div className="w-8 h-8 bg-gray-900 border border-cyan-400/80 text-cyan-400 flex items-center justify-center shrink-0 rounded-lg animate-pulse shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                                     <Activity size={16} />
                                 </div>
                                 <div className="bg-gray-900/50 p-3 border border-cyan-500/30 rounded-xl rounded-tl-none flex items-center gap-2">
                                     <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce"></span>
                                     <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce delay-100"></span>
                                     <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce delay-200"></span>
                                 </div>
                             </div>
                         </div>
                     )}
                     {error && (
                         <div className="flex justify-center my-4">
                             <div className="bg-red-950/80 border border-red-500 text-red-400 px-4 py-2 text-xs font-mono rounded-lg flex items-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                                 <AlertCircle size={14} /> ERR_CODE: {error}
                             </div>
                         </div>
                     )}
                     <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className={`p-4 bg-gray-900/90 border-t shrink-0 z-20 transition-colors duration-500 ${isLoading ? 'border-cyan-400/50' : 'border-cyan-500/30'}`}>
                    {selectedImage && (
                        <div className="flex items-center gap-2 mb-2 p-2 bg-cyan-900/20 border border-cyan-500/30 rounded-lg">
                            <ImageIcon size={14} className="text-cyan-400" />
                            <span className="text-xs text-cyan-300 truncate font-mono">IMAGE_QUEUED_FOR_SCAN</span>
                            <button onClick={() => setSelectedImage(null)} className="ml-auto text-red-400 hover:text-red-300"><X size={14}/></button>
                        </div>
                    )}
                    <div className="relative flex items-center gap-3">
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileSelect}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-3 bg-cyan-900/10 text-cyan-400 border border-cyan-800 hover:bg-cyan-500/20 hover:border-cyan-400 transition-all rounded-lg"
                            title="Visual Scan (Upload Image)"
                            disabled={isLoading}
                        >
                            <Paperclip size={18} />
                        </button>
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputValue)}
                            placeholder="Type command or upload image..."
                            className="w-full bg-black/50 text-cyan-50 border border-cyan-800/50 focus:border-cyan-400 pl-4 pr-12 py-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all text-sm font-sans placeholder-cyan-900/70"
                            disabled={isLoading}
                        />
                        <button 
                            onClick={() => handleSendMessage(inputValue)}
                            disabled={(!inputValue.trim() && !selectedImage) || isLoading}
                            className="absolute right-2 p-2 bg-cyan-900/30 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500 hover:text-black hover:border-cyan-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-cyan-400 transition-all rounded-md"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                    <div className="mt-2 flex justify-between items-center text-[10px] text-cyan-800 font-mono uppercase">
                        <span className="flex items-center gap-1">
                            <ScanEye size={10} /> VISION_SCAN_READY
                        </span>
                        <span className="tracking-widest opacity-50">V.2.6.0-TURBO</span>
                    </div>
                </div>

                {/* Decorative Corners */}
                <div className={`absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 rounded-tl-2xl pointer-events-none z-30 transition-colors duration-500 ${isLoading ? 'border-cyan-300' : 'border-cyan-500/50'}`}></div>
                <div className={`absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 rounded-tr-2xl pointer-events-none z-30 transition-colors duration-500 ${isLoading ? 'border-cyan-300' : 'border-cyan-500/50'}`}></div>
                <div className={`absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 rounded-bl-2xl pointer-events-none z-30 transition-colors duration-500 ${isLoading ? 'border-cyan-300' : 'border-cyan-500/50'}`}></div>
                <div className={`absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 rounded-br-2xl pointer-events-none z-30 transition-colors duration-500 ${isLoading ? 'border-cyan-300' : 'border-cyan-500/50'}`}></div>
            </div>
        </div>
    );
};

export default ChatBot;
