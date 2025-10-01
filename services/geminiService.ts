

import { GoogleGenAI, Type } from "@google/genai";
import { GEMINI_MODEL_NAME } from '../constants';

const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI | null = null;

if (API_KEY) {
  ai = new GoogleGenAI({ apiKey: API_KEY });
} else {
  console.error("CRITICAL: API_KEY environment variable is not set. Gemini API calls will fail.");
}

const handleApiError = (error: unknown): Error => {
  console.error("Error calling Gemini API:", error);
  if (error instanceof Error) {
    let message = `Gemini API Error: ${error.message}`;
    if (error.message.includes("API key not valid")) {
      message = "Gemini API Error: The provided API key is not valid. Please check your configuration.";
    } else if (error.message.includes("quota")) {
      message = "Gemini API Error: You have exceeded your API quota. Please check your Google AI Studio account.";
    }
    return new Error(message);
  }
  return new Error("Unknown Gemini API Error occurred.");
};

/**
 * Retry logic with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on certain errors
      if (lastError.message.includes("API key not valid") || 
          lastError.message.includes("quota")) {
        throw lastError;
      }
      
      // If this was the last attempt, throw
      if (attempt === maxRetries) {
        console.error(`Failed after ${maxRetries + 1} attempts:`, lastError);
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, lastError.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error("Retry failed");
}


export async function generateGeminiText(
  prompt: string,
  systemInstruction?: string,
  responseSchema?: object,
  temperature?: number,
  topP?: number,
  topK?: number
): Promise<string> {
  if (!ai) {
    throw new Error("Gemini API client is not initialized. API_KEY might be missing.");
  }

  return retryWithBackoff(async () => {
    try {
      const config: any = {};
      if (systemInstruction) {
          config.systemInstruction = systemInstruction;
      }
      if (responseSchema) {
          config.responseMimeType = "application/json";
          config.responseSchema = responseSchema;
      }
      if (temperature !== undefined) {
          config.temperature = temperature;
      }
      if (topP !== undefined) {
          config.topP = topP;
      }
      if (topK !== undefined) {
          config.topK = topK;
      }

      const result = await ai!.models.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: prompt,
        ...(Object.keys(config).length > 0 && { config }),
      });
      return result.text;
    } catch (error) {
      throw handleApiError(error);
    }
  });
}

export async function generateGeminiTextStream(
  prompt: string,
  onChunk: (chunk: string) => void,
  systemInstruction?: string,
  temperature?: number,
  topP?: number,
  topK?: number
): Promise<string> {
  if (!ai) {
    throw new Error("Gemini API client is not initialized. API_KEY might be missing.");
  }
  try {
    const config: any = {};
    if (systemInstruction) {
        config.systemInstruction = systemInstruction;
    }
    if (temperature !== undefined) {
        config.temperature = temperature;
    }
    if (topP !== undefined) {
        config.topP = topP;
    }
    if (topK !== undefined) {
        config.topK = topK;
    }

    const stream = await ai.models.generateContentStream({
      model: GEMINI_MODEL_NAME,
      contents: prompt,
      ...(Object.keys(config).length > 0 && { config }),
    });

    let fullText = '';
    for await (const chunk of stream) {
      // Use chunk.text as per Gemini guidance for streaming
      const chunkText = chunk.text;
      if (chunkText) {
        fullText += chunkText;
        onChunk(chunkText);
      }
    }
    return fullText;
  } catch (error) {
    throw handleApiError(error);
  }
}