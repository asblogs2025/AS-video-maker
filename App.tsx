import React, { useState, useEffect, useCallback, useRef } from 'react';
import { generateVideo, pollVideoOperation, generateAudio } from './services/geminiService';
import Loader from './components/Loader';
import VideoPlayer from './components/VideoPlayer';
import { SparklesIcon, VideoCameraIcon, XMarkIcon } from './components/Icons';
import type { Operation } from '@google/genai';
import './types';

const App: React.FC = () => {
    const [prompt, setPrompt] = useState('');
    const [script, setScript] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Initializing video generation...');
    const [error, setError] = useState<string | null>(null);
    const [hasApiKey, setHasApiKey] = useState(false);
    const [checkingApiKey, setCheckingApiKey] = useState(true);

    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [audioData, setAudioData] = useState<string | null>(null);
    
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
            await window.aistudio.openSelectKey();
            // Assume success after opening dialog to avoid race conditions
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
        setAudioData(null);
        
        try {
            // Step 1: Generate Audio if script is provided
            if (script.trim()) {
                setLoadingMessage('Generating voice-over audio...');
                const generatedAudio = await generateAudio(script);
                setAudioData(generatedAudio);
            }

            // Step 2: Generate Video
            setLoadingMessage('Starting video generation process...');
            let initialOperation: Operation = await generateVideo(prompt);

            // Step 3: Poll for video completion
            setLoadingMessage('Video is rendering... this may take a few minutes.');
            const finalOperation = await pollVideoOperation(initialOperation, (message) => {
                setLoadingMessage(message);
            });
            
            const downloadLink = finalOperation.response?.generatedVideos?.[0]?.video?.uri;
            if (downloadLink && process.env.API_KEY) {
                setLoadingMessage('Fetching final video...');
                const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
                if (!videoResponse.ok) {
                    throw new Error('Failed to download the generated video.');
                }
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
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900">
                <div className="text-center text-gray-400">Loading...</div>
            </div>
        );
    }

    if (!hasApiKey) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
                <div className="bg-gray-800 rounded-lg p-8 max-w-lg w-full text-center shadow-2xl">
                    <h2 className="text-2xl font-bold mb-4 text-white">API Key Required</h2>
                    <p className="text-gray-400 mb-6">This application requires a Google AI API key to generate videos with the Veo model. Please select your API key to continue.</p>
                    <button
                        onClick={handleSelectKey}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-300 w-full"
                    >
                        Select API Key
                    </button>
                    <p className="text-xs text-gray-500 mt-4">
                        For more information on billing, please visit the{' '}
                        <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                            billing documentation
                        </a>.
                    </p>
                </div>
            </div>
        );
    }


    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-10">
                    <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                        AI Reel Maker
                    </h1>
                    <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
                        Turn your ideas into captivating videos with voice-overs, powered by Gemini.
                    </p>
                </header>
                
                {error && (
                    <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative mb-6 max-w-4xl mx-auto" role="alert">
                        <strong className="font-bold">Error: </strong>
                        <span className="block sm:inline">{error}</span>
                        <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3">
                            <XMarkIcon className="h-6 w-6 text-red-300"/>
                        </button>
                    </div>
                )}
                
                <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Input Section */}
                    <div className="bg-gray-800 rounded-xl p-6 shadow-lg">
                        <div className="space-y-6">
                            <div>
                                <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">Video Prompt</label>
                                <textarea
                                    id="prompt"
                                    rows={5}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                                    placeholder="e.g., A neon hologram of a cat driving a futuristic car at top speed"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                            <div>
                                <label htmlFor="script" className="block text-sm font-medium text-gray-300 mb-2">Voice-over Script (Optional)</label>
                                <textarea
                                    id="script"
                                    rows={5}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-colors"
                                    placeholder="e.g., In a world unlike any other, one cat defies the laws of physics..."
                                    value={script}
                                    onChange={(e) => setScript(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                            <button
                                onClick={handleSubmit}
                                disabled={isLoading || !prompt.trim()}
                                className="w-full flex items-center justify-center bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group"
                            >
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="h-5 w-5 mr-2 group-hover:animate-pulse" />
                                        Generate Reel
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                    
                    {/* Output Section */}
                    <div className="bg-gray-800 rounded-xl p-6 shadow-lg flex items-center justify-center min-h-[400px]">
                        {isLoading ? (
                            <Loader message={loadingMessage} />
                        ) : videoUrl ? (
                            <VideoPlayer videoUrl={videoUrl} audioData={audioData} />
                        ) : (
                            <div className="text-center text-gray-500">
                                <VideoCameraIcon className="mx-auto h-12 w-12 mb-4" />
                                <h3 className="text-lg font-medium text-gray-300">Your Generated Video Will Appear Here</h3>
                                <p className="mt-1 text-sm">Enter a prompt and click "Generate Reel" to begin.</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default App;
