import React, { useState, useEffect } from 'react';
import { PlayIcon, ArrowDownTrayIcon } from './Icons';

interface VideoPlayerProps {
    videoUrl: string;
    audioData: string | null;
}

// Helper functions for audio processing
function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function writeWavHeader(samples: Int16Array, sampleRate: number, numChannels: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true); // byteRate
    view.setUint16(32, numChannels * 2, true); // blockAlign
    view.setUint16(34, 16, true); // bitsPerSample
    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write the PCM data
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        view.setInt16(offset, samples[i], true);
    }

    return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl, audioData }) => {
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [audioSource, setAudioSource] = useState<AudioBufferSourceNode | null>(null);

    useEffect(() => {
        if (audioData) {
            const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            setAudioContext(ctx);
            
            const raw = decode(audioData);
            const dataInt16 = new Int16Array(raw.buffer);
            const frameCount = dataInt16.length;
            const buffer = ctx.createBuffer(1, frameCount, 24000);
            const channelData = buffer.getChannelData(0);
            for (let i = 0; i < frameCount; i++) {
                channelData[i] = dataInt16[i] / 32768.0;
            }
            setAudioBuffer(buffer);
        }
        
        return () => {
          audioContext?.close();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioData]);

    const handlePlayAudio = () => {
        if (!audioContext || !audioBuffer) return;
        
        if (isAudioPlaying) {
            audioSource?.stop();
            setIsAudioPlaying(false);
        } else {
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.onended = () => {
                setIsAudioPlaying(false);
                setAudioSource(null);
            };
            source.start();
            setAudioSource(source);
            setIsAudioPlaying(true);
        }
    };
    
    const handleDownloadAudio = () => {
        if (!audioData) return;
        const raw = decode(audioData);
        const dataInt16 = new Int16Array(raw.buffer);
        const wavBuffer = writeWavHeader(dataInt16, 24000, 1);
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'voice-over.wav';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };


    return (
        <div className="w-full">
            <video src={videoUrl} controls className="w-full rounded-lg shadow-2xl aspect-[9/16] object-cover" />
            <div className="mt-4 flex flex-col sm:flex-row gap-4">
                <a
                    href={videoUrl}
                    download="ai-generated-reel.mp4"
                    className="flex-1 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                    <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                    Download Video
                </a>
                {audioData && (
                    <>
                        <button
                            onClick={handlePlayAudio}
                            className="flex-1 flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                        >
                            <PlayIcon className="h-5 w-5 mr-2" />
                            {isAudioPlaying ? 'Stop Voice-over' : 'Play Voice-over'}
                        </button>
                        <button
                            onClick={handleDownloadAudio}
                            className="flex-1 flex items-center justify-center bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                        >
                           <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                            Download Audio
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default VideoPlayer;
