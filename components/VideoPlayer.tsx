import React, { useState, useEffect, useRef } from 'react';
import { PlayIcon, ArrowDownTrayIcon } from './Icons';

interface VideoPlayerProps {
    videoUrl: string;
    audioBuffer: AudioBuffer | null;
}

// Helper function to convert an AudioBuffer to a WAV Blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);
    const channels: Float32Array[] = [];
    let i, sample;
    let offset = 0;
    let pos = 0;

    for (i = 0; i < numOfChan; i++) {
        channels.push(buffer.getChannelData(i));
    }

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // write interleaved data
    for (i = 0; i < buffer.length; i++) {
        for (let j = 0; j < numOfChan; j++) {
            sample = Math.max(-1, Math.min(1, channels[j][i]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
    }
    
    function setUint16(data: number) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data: number) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
    
    return new Blob([view], { type: 'audio/wav' });
}


const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl, audioBuffer }) => {
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

    useEffect(() => {
        if (audioBuffer && !audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Cleanup on component unmount or when audioBuffer changes
        return () => {
            if (audioSourceRef.current) {
                audioSourceRef.current.stop();
            }
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(console.error);
                audioContextRef.current = null;
            }
        };
    }, [audioBuffer]);

    const handlePlayAudio = () => {
        const audioContext = audioContextRef.current;
        if (!audioContext || !audioBuffer) return;

        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        if (isAudioPlaying) {
            if (audioSourceRef.current) {
                audioSourceRef.current.stop();
            }
            setIsAudioPlaying(false);
        } else {
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.onended = () => {
                setIsAudioPlaying(false);
                audioSourceRef.current = null;
            };
            source.start();
            audioSourceRef.current = source;
            setIsAudioPlaying(true);
        }
    };
    
    const handleDownloadAudio = () => {
        if (!audioBuffer) return;
        const wavBlob = audioBufferToWav(audioBuffer);
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'generated-audio.wav';
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
                {audioBuffer && (
                    <>
                        <button
                            onClick={handlePlayAudio}
                            className="flex-1 flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                        >
                            <PlayIcon className="h-5 w-5 mr-2" />
                            {isAudioPlaying ? 'Stop Audio' : 'Play Audio'}
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