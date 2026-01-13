
import { GoogleGenAI, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY || '';

export const getGeminiAI = () => new GoogleGenAI({ apiKey: API_KEY });

/**
 * Uses Gemini 3 Flash for fast business discovery.
 */
export async function fetchNearbyBusinesses(lat: number, lng: number, query: string) {
  const ai = getGeminiAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Find ${query} near ${lat}, ${lng}. Return JSON list: [{"name": "X", "address": "X", "lat": v, "lng": v}]`,
      config: {
        responseMimeType: "application/json"
      },
    });

    return response;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
}

/**
 * Uses Gemini TTS for fast professional audio announcements.
 */
export async function speakStatus(text: string) {
  const ai = getGeminiAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Diga: ${text}` }] }],
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
    if (base64Audio) {
      await playAudioFromBase64(base64Audio);
    }
  } catch (error) {
    console.error("TTS Error:", error);
  }
}

async function playAudioFromBase64(base64: string) {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const bytes = decode(base64);
  const audioBuffer = await decodeAudioData(bytes, audioContext, 24000, 1);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
