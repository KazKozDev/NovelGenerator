// Generation parameters for different stages of book generation
// Temperature controls randomness: 0.0 = deterministic, 1.0 = very creative
// TopP controls diversity: lower = more focused, higher = more diverse

export interface GenerationParams {
  temperature: number;
  topP: number;
  topK?: number;
}

// For story outline generation - more creative
export const OUTLINE_PARAMS: GenerationParams = {
  temperature: 0.9,
  topP: 0.95,
  topK: 40,
};

// For chapter content generation - balanced creativity
export const CHAPTER_CONTENT_PARAMS: GenerationParams = {
  temperature: 0.8,
  topP: 0.9,
  topK: 40,
};

// For analysis and extraction - more deterministic
export const ANALYSIS_PARAMS: GenerationParams = {
  temperature: 0.3,
  topP: 0.7,
  topK: 20,
};

// For editing and refinement - moderate creativity
export const EDITING_PARAMS: GenerationParams = {
  temperature: 0.6,
  topP: 0.85,
  topK: 30,
};

// For character/world extraction - deterministic
export const EXTRACTION_PARAMS: GenerationParams = {
  temperature: 0.2,
  topP: 0.6,
  topK: 10,
};

// For title generation - creative
export const TITLE_PARAMS: GenerationParams = {
  temperature: 0.85,
  topP: 0.9,
  topK: 40,
};
