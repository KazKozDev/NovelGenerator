

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { GEMINI_MODEL_NAME } from '../constants';
import { withResilienceTracking, apiResilienceManager } from '../utils/apiResilienceUtils';

const API_KEY = process.env.API_KEY;

let ai: GoogleGenerativeAI | null = null;

if (API_KEY) {
  ai = new GoogleGenerativeAI(API_KEY);
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
    } else if (error.message.includes("UNAVAILABLE") || error.message.includes("503") || error.message.includes("overloaded")) {
      message = "Gemini API Error: Service is temporarily overloaded. Retrying...";
    } else if (error.message.includes("RESOURCE_EXHAUSTED") || error.message.includes("429")) {
      message = "Gemini API Error: Rate limit exceeded. Waiting before retry...";
    }
    return new Error(message);
  }
  return new Error("Unknown Gemini API Error occurred.");
};

/**
 * Enhanced retry logic with exponential backoff and smart error handling
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5, // Increased for overload scenarios
  baseDelay: number = 2000 // Longer initial delay for overloaded API
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on certain permanent errors
      if (lastError.message.includes("API key not valid") ||
          lastError.message.includes("quota exceeded")) {
        throw lastError;
      }

      // If this was the last attempt, throw
      if (attempt === maxRetries) {
        console.error(`Failed after ${maxRetries + 1} attempts:`, lastError);
        throw lastError;
      }

      // Smart delay calculation based on error type
      let delay = baseDelay * Math.pow(2, attempt);

      // Longer delays for overload/rate limit errors
      if (lastError.message.includes("UNAVAILABLE") ||
          lastError.message.includes("overloaded") ||
          lastError.message.includes("503")) {
        delay = Math.max(delay, 5000 + (attempt * 3000)); // Min 5s, +3s per attempt
      } else if (lastError.message.includes("RESOURCE_EXHAUSTED") ||
                 lastError.message.includes("429")) {
        delay = Math.max(delay, 10000 + (attempt * 5000)); // Min 10s, +5s per attempt
      }

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 1000;
      delay += jitter;

      console.warn(`🔄 Attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}`);
      console.warn(`⏳ Waiting ${Math.round(delay/1000)}s before retry...`);

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

  return withResilienceTracking(() => retryWithBackoff(async () => {
    try {
      const generationConfig: any = {};
      if (temperature !== undefined) {
          generationConfig.temperature = temperature;
      }
      if (topP !== undefined) {
          generationConfig.topP = topP;
      }
      if (topK !== undefined) {
          generationConfig.topK = topK;
      }
      if (responseSchema) {
          generationConfig.responseMimeType = "application/json";
          generationConfig.responseSchema = responseSchema;
      }

      const model = ai!.getGenerativeModel({
        model: GEMINI_MODEL_NAME,
        generationConfig,
        ...(systemInstruction && { systemInstruction })
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      throw handleApiError(error);
    }
  }));
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

  return retryWithBackoff(async () => {
    try {
      const generationConfig: any = {};
      if (temperature !== undefined) {
          generationConfig.temperature = temperature;
      }
      if (topP !== undefined) {
          generationConfig.topP = topP;
      }
      if (topK !== undefined) {
          generationConfig.topK = topK;
      }

      const model = ai!.getGenerativeModel({
        model: GEMINI_MODEL_NAME,
        generationConfig,
        ...(systemInstruction && { systemInstruction })
      });

      const result = await model.generateContentStream(prompt);

      let fullText = '';
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          fullText += chunkText;
          onChunk(chunkText);
        }
      }
      return fullText;
    } catch (error) {
      throw handleApiError(error);
    }
  });
}

// Queue system for handling API overload scenarios
interface QueuedRequest {
  id: string;
  fn: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  priority: 'high' | 'medium' | 'low';
  timestamp: number;
}

class APIRequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private rateLimitDelay = 1000; // Base delay between requests

  enqueue<T>(
    fn: () => Promise<T>,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fn,
        resolve,
        reject,
        priority,
        timestamp: Date.now()
      };

      // Insert based on priority
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      let insertIndex = this.queue.length;

      for (let i = 0; i < this.queue.length; i++) {
        if (priorityOrder[request.priority] < priorityOrder[this.queue[i].priority]) {
          insertIndex = i;
          break;
        }
      }

      this.queue.splice(insertIndex, 0, request);
      console.log(`📋 Queued API request (${priority} priority). Queue size: ${this.queue.length}`);

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;

      try {
        console.log(`🔄 Processing queued request ${request.id} (${request.priority} priority)`);
        const result = await request.fn();
        request.resolve(result);
      } catch (error) {
        console.error(`❌ Queued request ${request.id} failed:`, error);
        request.reject(error);
      }

      // Rate limiting between requests
      if (this.queue.length > 0) {
        console.log(`⏳ Rate limiting: waiting ${this.rateLimitDelay}ms before next request`);
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
      }
    }

    this.processing = false;
    console.log(`✅ Queue processing complete`);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  // Adjust rate limiting based on API responses
  adjustRateLimit(increase: boolean) {
    if (increase) {
      this.rateLimitDelay = Math.min(this.rateLimitDelay * 1.5, 10000); // Max 10s
      console.log(`📈 Increased rate limit delay to ${this.rateLimitDelay}ms`);
    } else {
      this.rateLimitDelay = Math.max(this.rateLimitDelay * 0.8, 500); // Min 500ms
      console.log(`📉 Decreased rate limit delay to ${this.rateLimitDelay}ms`);
    }
  }
}

// Global queue instance
const requestQueue = new APIRequestQueue();

/**
 * Queued version of generateGeminiText for high-load scenarios
 */
export async function generateGeminiTextQueued(
  prompt: string,
  systemInstruction?: string,
  responseSchema?: object,
  temperature?: number,
  topP?: number,
  topK?: number,
  priority: 'high' | 'medium' | 'low' = 'medium'
): Promise<string> {
  return requestQueue.enqueue(
    () => generateGeminiText(prompt, systemInstruction, responseSchema, temperature, topP, topK),
    priority
  );
}

/**
 * Get queue status for UI display
 */
export function getQueueStatus() {
  return {
    size: requestQueue.getQueueSize(),
    processing: requestQueue.isProcessing()
  };
}