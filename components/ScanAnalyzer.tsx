
import React, { useRef, useState, useEffect } from 'react';
import { X, Camera, Upload, RefreshCw, Zap, Scan, CheckCircle, Smartphone, AlertTriangle } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

export interface ScanResult {
    deviceType: string;
    model: string;
    serialNumber?: string;
    condition: string;
    description: string;
}

interface ScanAnalyzerProps {
    isOpen: boolean;
    onClose: () => void;
    onScanComplete: (data: ScanResult) => void;
}

const ScanAnalyzer: React.FC<ScanAnalyzerProps> = ({ isOpen, onClose, onScanComplete }) => {
    const [mode, setMode] = useState<'camera' | 'upload' | 'analyzing' | 'result'>('camera');
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [analysisStatus, setAnalysisStatus] = useState<string>('');
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Camera Handling
    useEffect(() => {
        if (isOpen && mode === 'camera') {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [isOpen, mode]);

    const startCamera = async () => {
        try {
            // Attempt to use the environment (rear) camera first
            const mediaStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.warn("Primary camera access failed, attempting fallback...", err);
            try {
                // Fallback to any available video source (common for laptops)
                const mediaStream = await navigator.mediaDevices.getUserMedia({ 
                    video: true 
                });
                setStream(mediaStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                }
            } catch (fallbackErr) {
                console.error("Camera access denied completely", fallbackErr);
                setMode('upload'); // Auto-switch to upload mode
            }
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const handleCapture = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(videoRef.current, 0, 0);
            const base64 = canvas.toDataURL('image/jpeg');
            setCapturedImage(base64);
            analyzeImage(base64);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                setCapturedImage(base64);
                analyzeImage(base64);
            };
            reader.readAsDataURL(file);
        }
    };

    const analyzeImage = async (base64Image: string) => {
        setMode('analyzing');
        setAnalysisStatus('INITIALIZING NEURAL NET...');

        try {
            if (!process.env.API_KEY) throw new Error("API Key Missing");
            
            setAnalysisStatus('UPLOADING TO VISION CORE...');
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            // Strip header
            const cleanBase64 = base64Image.split(',')[1];
            const mimeType = base64Image.split(';')[0].split(':')[1];

            setAnalysisStatus('IDENTIFYING HARDWARE...');

            // We use a standard generateContent call for vision analysis
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: {
                    parts: [
                        { inlineData: { mimeType, data: cleanBase64 } },
                        { text: `Analyze this image for tech support. 
                          Identify the device type (iPhone, MacBook, etc.), specific model, visible serial numbers, and physical condition.
                          Return a STRICT JSON object (no markdown) with keys: deviceType, model, serialNumber (if found, else "Unknown"), condition, description.` 
                        }
                    ]
                },
                config: {
                    responseMimeType: "application/json"
                }
            });

            setAnalysisStatus('PROCESSING METADATA...');
            
            const text = response.text || '{}';
            // Robust JSON parsing: strip markdown code blocks if present
            const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const data: ScanResult = JSON.parse(cleanJson);
            
            // Artificial delay for UX
            setTimeout(() => {
                onScanComplete(data);
                setMode('camera'); // Reset for next time
                setCapturedImage(null);
            }, 800);

        } catch (error) {
            console.error("Analysis Failed", error);
            setAnalysisStatus('SCAN FAILED. RETRYING...');
            setTimeout(() => {
                setMode('camera');
                setCapturedImage(null);
            }, 2000);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-gray-950/95 backdrop-blur-xl animate-fade-in-up">
            <div className="relative w-full max-w-lg bg-black border border-cyan-500/50 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(6,182,212,0.2)] flex flex-col h-[600px]">
                
                {/* HUD Overlay */}
                <div className="absolute inset-0 pointer-events-none z-20">
                    <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500/50 shadow-[0_0_10px_#22d3ee]"></div>
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-cyan-500/50 shadow-[0_0_10px_#22d3ee]"></div>
                    
                    {/* Corners */}
                    <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-cyan-500"></div>
                    <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-cyan-500"></div>
                    <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-cyan-500"></div>
                    <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-cyan-500"></div>
                    
                    {/* Center Reticle */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-cyan-500/30 rounded-lg flex items-center justify-center">
                        <div className="w-60 h-60 border-t border-b border-cyan-500/20"></div>
                        <div className="absolute w-full h-0.5 bg-red-500/50 animate-[scan_2s_linear_infinite]"></div>
                    </div>
                </div>

                {/* Header */}
                <div className="relative z-30 p-4 bg-black/80 border-b border-cyan-500/30 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Scan className="text-cyan-400 animate-pulse" size={20} />
                        <h3 className="text-cyan-400 font-mono font-bold tracking-widest text-sm">OPTICAL_ANALYZER</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Main Viewport */}
                <div className="flex-1 relative bg-gray-900 flex items-center justify-center overflow-hidden">
                    
                    {mode === 'camera' && (
                        <>
                            {stream ? (
                                <video 
                                    ref={videoRef} 
                                    autoPlay 
                                    playsInline 
                                    muted // Critical for autoplay compliance
                                    className="w-full h-full object-cover opacity-80"
                                />
                            ) : (
                                <div className="text-cyan-500/50 font-mono text-sm animate-pulse">INITIALIZING OPTICS...</div>
                            )}
                        </>
                    )}

                    {mode === 'upload' && !capturedImage && (
                        <div className="text-center p-8">
                            <Upload className="mx-auto text-cyan-500 mb-4" size={48} />
                            <p className="text-gray-400 font-mono text-sm mb-4">UPLOAD IMAGE FOR ANALYSIS</p>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*" 
                                onChange={handleFileUpload}
                            />
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-cyan-900/30 border border-cyan-500 text-cyan-400 px-6 py-2 rounded-lg font-mono hover:bg-cyan-500 hover:text-black transition-all"
                            >
                                SELECT FILE
                            </button>
                        </div>
                    )}

                    {(mode === 'analyzing' || capturedImage) && (
                        <div className="relative w-full h-full">
                            <img src={capturedImage!} alt="Analysis Target" className="w-full h-full object-cover opacity-50 grayscale" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-40">
                                <div className="w-16 h-16 border-4 border-t-cyan-500 border-r-cyan-500/30 border-b-cyan-500/10 border-l-cyan-500 rounded-full animate-spin mb-4"></div>
                                <p className="text-cyan-400 font-mono tracking-widest text-xs animate-pulse">{analysisStatus}</p>
                            </div>
                        </div>
                    )}

                </div>

                {/* Controls Footer */}
                <div className="relative z-30 p-6 bg-black/80 border-t border-cyan-500/30">
                    <div className="flex justify-center gap-8">
                        {mode === 'camera' && (
                            <>
                                <button 
                                    onClick={() => setMode('upload')}
                                    className="p-4 rounded-full bg-gray-900 border border-gray-700 text-gray-400 hover:border-cyan-500 hover:text-cyan-500 transition-all"
                                    title="Upload File"
                                >
                                    <Upload size={20} />
                                </button>
                                <button 
                                    onClick={handleCapture}
                                    className="p-1 rounded-full border-2 border-cyan-500 hover:scale-105 transition-transform"
                                    title="Capture Frame"
                                >
                                    <div className="w-16 h-16 bg-cyan-500 rounded-full border-4 border-black"></div>
                                </button>
                                <button 
                                    onClick={() => { stopCamera(); startCamera(); }}
                                    className="p-4 rounded-full bg-gray-900 border border-gray-700 text-gray-400 hover:border-cyan-500 hover:text-cyan-500 transition-all"
                                    title="Refresh Camera"
                                >
                                    <RefreshCw size={20} />
                                </button>
                            </>
                        )}
                        {mode === 'upload' && (
                             <button 
                                onClick={() => setMode('camera')}
                                className="p-4 rounded-full bg-gray-900 border border-gray-700 text-gray-400 hover:border-cyan-500 hover:text-cyan-500 transition-all"
                                title="Switch to Camera"
                             >
                                <Camera size={20} />
                             </button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ScanAnalyzer;
