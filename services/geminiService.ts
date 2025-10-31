import { GoogleGenAI, Modality, type Operation } from '@google/genai';

const POLLING_INTERVAL_MS = 10000; // Poll every 10 seconds

const LOADING_MESSAGES = [
    "Warming up the digital cameras...",
    "Casting virtual actors...",
    "Scouting for digital locations...",
    "Rendering the first few frames...",
    "Applying cinematic filters...",
    "Syncing audio and video...",
    "This can take a few minutes, please be patient.",
    "Almost there, adding the final touches..."
];

export const generateVideo = async (prompt: string): Promise<Operation> => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt,
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: '9:16', // Portrait for reels
        }
    });

    return operation;
};

export const pollVideoOperation = async (
    operation: Operation, 
    onProgress: (message: string) => void
): Promise<Operation> => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    let currentOperation = operation;
    let messageIndex = 0;

    const intervalId = setInterval(() => {
        messageIndex = (messageIndex + 1) % LOADING_MESSAGES.length;
        onProgress(LOADING_MESSAGES[messageIndex]);
    }, 5000); // Change message every 5 seconds

    while (!currentOperation.done) {
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
        try {
            currentOperation = await ai.operations.getVideosOperation({ operation: currentOperation });
        } catch (e) {
            clearInterval(intervalId);
            console.error("Error polling video operation:", e);
            throw new Error("Failed while checking video generation status.");
        }
    }
    
    clearInterval(intervalId);

    if (currentOperation.error) {
        throw new Error(`Video generation failed: ${currentOperation.error.message}`);
    }

    return currentOperation;
};

export const generateAudio = async (script: string): Promise<string> => {
     if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say with a clear, engaging tone: ${script}` }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
        throw new Error("Audio generation failed to produce data.");
    }

    return base64Audio;
};
