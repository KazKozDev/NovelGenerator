

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
  console.error("❌ Error calling Gemini API:", error);
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
    } else if (error.message.includes("SERVICE_DISABLED") || error.message.includes("API_KEY_SERVICE_BLOCKED") || error.message.includes("has not been used in project")) {
      message = "Gemini API Error: Gemini API (generativelanguage.googleapis.com) is not enabled or is blocked for this API key/project. Enable it in Google Cloud Console.";
    } else if (error.message.includes("RECITATION") || (error.message.includes("blocked") && !error.message.includes("SERVICE_BLOCKED"))) {
      message = "Gemini API Error: Content was blocked due to safety filters or copyright concerns. Try adjusting your prompt.";
      console.error("⚠️ Content blocked - this may indicate the prompt triggered safety filters");
    } else if (error.message.includes("timeout") || error.message.includes("DEADLINE_EXCEEDED")) {
      message = "Gemini API Error: Request timed out. The generation may be too complex. Retrying...";
    } else if (error.message.includes("invalid") && error.message.includes("schema")) {
      message = "Gemini API Error: The response schema is invalid or too complex. Simplifying request...";
      console.error("⚠️ Schema validation error - the model couldn't generate valid JSON for the requested schema");
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
          lastError.message.includes("quota exceeded") ||
          lastError.message.includes("exceeded your API quota") ||
          lastError.message.includes("FreeTier") ||
          lastError.message.includes("requests per day") ||
          lastError.message.includes("SERVICE_DISABLED") ||
          lastError.message.includes("API_KEY_SERVICE_BLOCKED") ||
          lastError.message.includes("has not been used in project")) {
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


/**
 * Sanitizes a JSON Schema object for Google Gemini API compatibility.
 * Google's Gemini API response_schema protobuf (google.ai.generativelanguage.v1beta.Schema)
 * only supports: type, format, description, nullable, enum, properties, required, items.
 *
 * Keys like additionalProperties, minItems, maxItems, minLength, maxLength, minimum,
 * maximum, uniqueItems, $schema, default, title, etc. are rejected by Google API with HTTP 400.
 */
export function sanitizeGeminiSchema(schema: unknown): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(sanitizeGeminiSchema);
  }

  const raw = schema as Record<string, any>;
  const cleaned: Record<string, any> = {};

  if (typeof raw.type === 'string') {
    cleaned.type = raw.type.toLowerCase();
  } else if (Array.isArray(raw.type)) {
    // JSON Schema writes an optional integer as type: ['integer', 'null']; Google's protobuf has no
    // union type and expresses the same thing with nullable. Dropping the array used to fall through
    // to the default below, so a field declared as an integer-or-null was described to the model as a
    // string — which is exactly what came back, first as "4" and then as nothing at all, because a
    // field the schema misdescribes is a field the model has no reason to fill correctly.
    const members = raw.type.filter((item: unknown): item is string => typeof item === 'string').map((item: string) => item.toLowerCase());
    const concrete = members.find((item: string) => item !== 'null');
    if (concrete) cleaned.type = concrete;
    if (members.includes('null')) cleaned.nullable = true;
  }

  if (typeof raw.description === 'string') {
    cleaned.description = raw.description;
  }

  if (typeof raw.nullable === 'boolean') {
    cleaned.nullable = raw.nullable || cleaned.nullable;
  }

  if (typeof raw.format === 'string') {
    cleaned.format = raw.format;
  }

  if (Array.isArray(raw.enum)) {
    cleaned.enum = raw.enum.map(String);
  }

  if (raw.properties && typeof raw.properties === 'object' && !Array.isArray(raw.properties)) {
    const cleanedProps: Record<string, any> = {};
    for (const [key, propVal] of Object.entries(raw.properties)) {
      cleanedProps[key] = sanitizeGeminiSchema(propVal);
    }
    cleaned.properties = cleanedProps;
  }

  if (Array.isArray(raw.required)) {
    const requiredList = raw.required.filter((item): item is string => typeof item === 'string');
    if (cleaned.properties) {
      cleaned.required = requiredList.filter(key => Object.prototype.hasOwnProperty.call(cleaned.properties, key));
    } else {
      cleaned.required = requiredList;
    }
  }

  if (raw.items && typeof raw.items === 'object') {
    cleaned.items = sanitizeGeminiSchema(raw.items);
  }

  // Ensure type is present for valid schema nodes
  if (!cleaned.type) {
    if (cleaned.properties) {
      cleaned.type = 'object';
    } else if (cleaned.items) {
      cleaned.type = 'array';
    } else if (cleaned.enum) {
      cleaned.type = 'string';
    } else {
      cleaned.type = 'string';
    }
  }

  return cleaned;
}

export async function generateGeminiText(
  prompt: string,
  systemInstruction?: string,
  responseSchema?: object,
  temperature?: number,
  topP?: number,
  topK?: number,
  maxOutputTokens?: number,
  jsonOnly = false,
  modelName?: string
): Promise<string> {
  if (!ai) {
    throw new Error("Gemini API client is not initialized. API_KEY might be missing.");
  }

  // Use more retries for complex schema requests
  const maxRetries = responseSchema ? 7 : 5;
  const baseDelay = responseSchema ? 3000 : 2000;

  const NO_THINKING_DIRECTIVE = "Do not output thinking, inner monologue, reasoning steps, or <think> tags. Provide direct final output only.";

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
      if (maxOutputTokens !== undefined) {
          generationConfig.maxOutputTokens = maxOutputTokens;
      }
      if (jsonOnly) generationConfig.responseMimeType = "application/json";
      if (responseSchema) {
          generationConfig.responseMimeType = "application/json";
          generationConfig.responseSchema = sanitizeGeminiSchema(responseSchema);
      }

      const finalSystemInstruction = systemInstruction 
        ? `${systemInstruction}\n\n${NO_THINKING_DIRECTIVE}` 
        : NO_THINKING_DIRECTIVE;

      const resolvedModel = modelName?.trim() || GEMINI_MODEL_NAME;
      const model = ai!.getGenerativeModel({
        model: resolvedModel,
        generationConfig,
        systemInstruction: finalSystemInstruction
      });

      console.log(`🔄 Sending request to Gemini API (model: ${resolvedModel})...`);
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const rawText = response.text();
      const text = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      // Why an answer is unusable matters more than that it is. A truncated JSON object and a model
      // that spent its whole budget thinking both arrive as "Expected a complete JSON object" three
      // layers up, and that message sends the reader looking at the schema, which is not the problem.
      const candidate: any = (response as any).candidates?.[0];
      const usage: any = (response as any).usageMetadata;
      const thoughts = usage?.thoughtsTokenCount;
      const spent = [
        usage?.candidatesTokenCount !== undefined ? `${usage.candidatesTokenCount} output tokens` : '',
        thoughts ? `${thoughts} of them spent on reasoning` : '',
      ].filter(Boolean).join(', ');
      if (candidate?.finishReason === 'MAX_TOKENS') {
        throw new Error(`Gemini stopped at the output token limit${maxOutputTokens ? ` of ${maxOutputTokens}` : ''} before finishing its answer${spent ? ` (${spent})` : ''}. The JSON it returned is cut off, not malformed. Raise the limit for this call, or use a model that does not spend the budget on reasoning.`);
      }
      if (!text) {
        throw new Error(`Gemini returned an empty answer (finishReason: ${candidate?.finishReason || 'unknown'}${spent ? `, ${spent}` : ''}).`);
      }
      console.log(`✅ Received response from Gemini API (${text.length} chars${thoughts ? `, ${thoughts} reasoning tokens` : ''})`);
      return text;
    } catch (error) {
      throw handleApiError(error);
    }
  }, maxRetries, baseDelay));
}

export async function generateGeminiTextStream(
  prompt: string,
  onChunk: (chunk: string) => void,
  systemInstruction?: string,
  temperature?: number,
  topP?: number,
  topK?: number,
  modelName?: string,
  responseSchema?: object,
  maxOutputTokens?: number,
): Promise<string> {
  if (!ai) {
    throw new Error("Gemini API client is not initialized. API_KEY might be missing.");
  }

  const NO_THINKING_DIRECTIVE = "Do not output thinking, inner monologue, reasoning steps, or <think> tags. Provide direct final output only.";

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
      // The streaming call could not carry a schema or a token ceiling, so the one call whose output
      // a reader would want to watch — the prose — could not be streamed without giving up both.
      if (maxOutputTokens !== undefined) {
          generationConfig.maxOutputTokens = maxOutputTokens;
      }
      if (responseSchema) {
          generationConfig.responseMimeType = "application/json";
          generationConfig.responseSchema = sanitizeGeminiSchema(responseSchema);
      }

      const finalSystemInstruction = systemInstruction 
        ? `${systemInstruction}\n\n${NO_THINKING_DIRECTIVE}` 
        : NO_THINKING_DIRECTIVE;

      const model = ai!.getGenerativeModel({
        model: modelName?.trim() || GEMINI_MODEL_NAME,
        generationConfig,
        systemInstruction: finalSystemInstruction
      });

      const result = await model.generateContentStream(prompt);

      let fullText = '';
      let insideThinkTag = false;

      const processChunk = (chunkText: string) => {
        let current = chunkText;
        while (current.length > 0) {
          if (insideThinkTag) {
            const closeIdx = current.indexOf('</think>');
            if (closeIdx !== -1) {
              insideThinkTag = false;
              current = current.slice(closeIdx + 8);
            } else {
              break;
            }
          } else {
            const openIdx = current.indexOf('<think>');
            if (openIdx !== -1) {
              const before = current.slice(0, openIdx);
              if (before) {
                fullText += before;
                onChunk(before);
              }
              insideThinkTag = true;
              current = current.slice(openIdx + 7);
            } else {
              fullText += current;
              onChunk(current);
              break;
            }
          }
        }
      };

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          processChunk(chunkText);
        }
      }
      return fullText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    } catch (error) {
      throw handleApiError(error);
    }
  });
}
