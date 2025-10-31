import React, { useState, useEffect, useCallback } from 'react';
import { generateVideo, pollVideoOperation, generateAudio } from './services/geminiService';
import Loader from './components/Loader';
import VideoPlayer from './components/VideoPlayer';
import { SparklesIcon, VideoCameraIcon, XMarkIcon } from './components/Icons';
import type { Operation, GenerateVideosResponse } from '@google/genai';
import './types';

const VOICE_OPTIONS = {
    'Kore': 'Female',
    'Puck': 'Male 1',
    'Charon': 'Male 2 (Deep)',
    'Zephyr': 'Female 2 (Friendly)',
};

const MUSIC_TRACKS = {
    'none': 'None',
    'uplifting': 'Uplifting',
    'chill': 'Chill',
    'cinematic': 'Cinematic',
};

const MUSIC_URLS: Record<string, string> = {
    'uplifting': 'https://cdn.pixabay.com/audio/2022/08/03/audio_19b1b8c69f.mp3',
    'chill': 'https://cdn.pixabay.com/audio/2022/05/27/audio_188a9f2864.mp3',
    'cinematic': 'https://cdn.pixabay.com/audio/2024/05/17/audio_b51e0e7a57.mp3',
};

// Helper to decode base64 string to Uint8Array
function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// Helper to decode raw PCM data from Gemini into an AudioBuffer
function pcmToAudioBuffer(base64Pcm: string, context: AudioContext): AudioBuffer {
    const raw = decode(base64Pcm);
    const dataInt16 = new Int16Array(raw.buffer);
    const frameCount = dataInt16.length;
    // Gemini TTS is 24kHz mono
    const buffer = context.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
}


const App: React.FC = () => {
    const [prompt, setPrompt] = useState('');
    const [script, setScript] = useState('');
    const [voice, setVoice] = useState<string>('Kore');
    const [backgroundMusic, setBackgroundMusic] = useState<string>('none');
    const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Initializing video generation...');
    const [error, setError] = useState<string | null>(null);
    const [hasApiKey, setHasApiKey] = useState(false);
    const [checkingApiKey, setCheckingApiKey] = useState(true);

    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    
    const checkApiKey = useCallback(async () => {
        try {
            if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
                setHasApiKey(true);
            } else {
                setHasApiKey(false);
            }
        } catch (e) {
            console.error("Error checking API key:", e);
            setHasApiKey(false);
        } finally {
            setCheckingApiKey(false);
        }
    }, []);

    useEffect(() => {
        checkApiKey();
    }, [checkApiKey]);

    const handleSelectKey = async () => {
        try {
            await window.aistudio?.openSelectKey();
            setHasApiKey(true);
        } catch (e) {
            console.error("Error opening select key dialog:", e);
            setError("Could not open the API key selection dialog. Please try again.");
        }
    };

    const handleSubmit = async () => {
        if (!prompt.trim()) {
            setError('Please enter a video prompt.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setVideoUrl(null);
        setAudioBuffer(null);
        
        try {
            // Step 1: Generate and Mix Audio if script is provided
            if (script.trim()) {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();

                setLoadingMessage('Generating voice-over...');
                const voicePromise = generateAudio(script, voice);

                let musicPromise: Promise<ArrayBuffer | null> = Promise.resolve(null);
                if (backgroundMusic !== 'none') {
                    setLoadingMessage('Fetching background music...');
                    musicPromise = fetch(MUSIC_URLS[backgroundMusic])
                        .then(res => {
                            if (!res.ok) throw new Error('Failed to fetch music');
                            return res.arrayBuffer();
                        });
                }

                const [voiceBase64, musicArrayBuffer] = await Promise.all([voicePromise, musicPromise]);
                
                const voiceBuffer = pcmToAudioBuffer(voiceBase64, audioContext);

                if (musicArrayBuffer) {
                    setLoadingMessage('Mixing audio tracks...');
                    const musicBuffer = await audioContext.decodeAudioData(musicArrayBuffer);
                    
                    // Offline context for mixing to avoid pops and ensure correct length/sample rate
                    const mixContext = new OfflineAudioContext(
                        1,
                        Math.max(voiceBuffer.length, musicBuffer.length),
                        audioContext.sampleRate
                    );

                    const voiceSource = mixContext.createBufferSource();
                    voiceSource.buffer = voiceBuffer;

                    const musicSource = mixContext.createBufferSource();
                    musicSource.buffer = musicBuffer;
                    
                    const musicGainNode = mixContext.createGain();
                    musicGainNode.gain.value = 0.2; // Background music at 20% volume

                    voiceSource.connect(mixContext.destination);
                    musicSource.connect(musicGainNode);
                    musicGainNode.connect(mixContext.destination);

                    voiceSource.start();
                    musicSource.start();

                    const mixedBuffer = await mixContext.startRendering();
                    setAudioBuffer(mixedBuffer);
                } else {
                    setAudioBuffer(voiceBuffer);
                }
                await audioContext.close();
            }

            // Step 2: Generate Video
            setLoadingMessage('Starting video generation process...');
            let initialOperation: Operation<GenerateVideosResponse> = await generateVideo(prompt, resolution);

            // Step 3: Poll for video completion
            setLoadingMessage('Video is rendering... this may take a few minutes.');
            const finalOperation = await pollVideoOperation(initialOperation, (message) => {
                setLoadingMessage(message);
            });
            
            const downloadLink = finalOperation.response?.generatedVideos?.[0]?.video?.uri;
            if (downloadLink && process.env.API_KEY) {
                setLoadingMessage('Fetching final video...');
                const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
                if (!videoResponse.ok) throw new Error('Failed to download the generated video.');
                
                const videoBlob = await videoResponse.blob();
                const objectUrl = URL.createObjectURL(videoBlob);
                setVideoUrl(objectUrl);
            } else {
                throw new Error('Video generation did not return a valid download link.');
            }

        } catch (e: any) {
            console.error(e);
            const errorMessage = e.message || 'An unknown error occurred.';
            setError(errorMessage);

            if (errorMessage.includes("Requested entity was not found")) {
                setError("Your API key is invalid or missing permissions. Please select a valid key.");
                setHasApiKey(false);
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    if (checkingApiKey) {
        return <div className="flex items-center justify-center min-h-screen bg-gray-900"><div className="text-center text-gray-400">Loading...</div></div>;
    }

    if (!hasApiKey) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
                <div className="bg-gray-800 rounded-lg p-8 max-w-lg w-full text-center shadow-2xl">
                    <h2 className="text-2xl font-bold mb-4 text-white">API Key Required</h2>
                    <p className="text-gray-400 mb-6">This application requires a Google AI API key. Please select your key to continue.</p>
                    <button onClick={handleSelectKey} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-300 w-full">Select API Key</button>
                    <p className="text-xs text-gray-500 mt-4">For more info on billing, see the <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">documentation</a>.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-10">
                    <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">AI Reel Maker</h1>
                    <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">Turn your ideas into captivating videos with custom voice-overs and music.</p>
                </header>
                
                {error && (
                    <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative mb-6 max-w-4xl mx-auto" role="alert">
                        <strong className="font-bold">Error: </strong>
                        <span className="block sm:inline">{error}</span>
                        <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3"><XMarkIcon className="h-6 w-6 text-red-300"/></button>
                    </div>
                )}
                
                <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-gray-800 rounded-xl p-6 shadow-lg space-y-6">
                        <div>
                            <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">Video Prompt</label>
                            <textarea id="prompt" rows={5} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors" placeholder="e.g., A neon hologram of a cat driving a futuristic car..." value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={isLoading} />
                        </div>
                        <div>
                            <label htmlFor="resolution" className="block text-sm font-medium text-gray-300 mb-2">Video Quality</label>
                            <select id="resolution" className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors disabled:opacity-50" value={resolution} onChange={(e) => setResolution(e.target.value as '720p' | '1080p')} disabled={isLoading}>
                                <option value="720p">720p (Faster)</option>
                                <option value="1080p">1080p (Higher Quality)</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="script" className="block text-sm font-medium text-gray-300 mb-2">Voice-over Script (Optional)</label>
                            <textarea id="script" rows={5} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-colors" placeholder="e.g., In a world unlike any other..." value={script} onChange={(e) => setScript(e.target.value)} disabled={isLoading} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="voice" className="block text-sm font-medium text-gray-300 mb-2">Voice</label>
                                <select id="voice" className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-colors disabled:opacity-50" value={voice} onChange={(e) => setVoice(e.target.value)} disabled={isLoading || !script.trim()}>
                                    {Object.entries(VOICE_OPTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="music" className="block text-sm font-medium text-gray-300 mb-2">Background Music</label>
                                <select id="music" className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-colors disabled:opacity-50" value={backgroundMusic} onChange={(e) => setBackgroundMusic(e.target.value)} disabled={isLoading || !script.trim()}>
                                    {Object.entries(MUSIC_TRACKS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                            </div>
                        </div>
                        <button onClick={handleSubmit} disabled={isLoading || !prompt.trim()} className="w-full flex items-center justify-center bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group">
                            {isLoading ? (
                                <><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating...</>
                            ) : (
                                <><SparklesIcon className="h-5 w-5 mr-2 group-hover:animate-pulse" />Generate Reel</>
                            )}
                        </button>
                    </div>
                    
                    <div className="bg-gray-800 rounded-xl p-6 shadow-lg flex items-center justify-center min-h-[400px]">
                        {isLoading ? <Loader message={loadingMessage} /> : videoUrl ? <VideoPlayer videoUrl={videoUrl} audioBuffer={audioBuffer} /> : (
                            <div className="text-center text-gray-500">
                                <VideoCameraIcon className="mx-auto h-12 w-12 mb-4" />
                                <h3 className="text-lg font-medium text-gray-300">Your Generated Video Will Appear Here</h3>
                                <p className="mt-1 text-sm">Enter a prompt to begin.</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default App;