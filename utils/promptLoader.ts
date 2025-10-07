/**
 * Prompt loading and templating utilities
 */

export interface PromptTemplate {
  systemPrompt: string;
  userPrompt: string;
}

// Since this runs in browser, we'll embed the prompts directly in the code
// This is more efficient for a bundled application
const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {};

/**
 * Load a prompt template from the embedded templates
 */
export function loadPromptTemplate(promptName: string): PromptTemplate {
  const template = PROMPT_TEMPLATES[promptName];
  if (!template) {
    console.error(`Prompt template not found: ${promptName}`);
    throw new Error(`Could not load prompt template: ${promptName}`);
  }
  return template;
}

/**
 * Register a prompt template (for initialization)
 */
export function registerPromptTemplate(name: string, template: PromptTemplate) {
  PROMPT_TEMPLATES[name] = template;
}

/**
 * Replace template variables in a prompt string
 */
export function formatPrompt(template: string, variables: Record<string, any>): string {
  let formatted = template;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    formatted = formatted.replace(regex, String(value || ''));
  }

  return formatted;
}

/**
 * Get a formatted prompt ready for use with the AI
 */
export function getFormattedPrompt(promptName: string, variables: Record<string, any> = {}): PromptTemplate {
  const template = loadPromptTemplate(promptName);

  return {
    systemPrompt: formatPrompt(template.systemPrompt, variables),
    userPrompt: formatPrompt(template.userPrompt, variables)
  };
}

/**
 * Prompt names enum for type safety
 */
export enum PromptNames {
  STORY_OUTLINE = 'story-outline-generation',
  CHAPTER_PLANNING = 'chapter-planning',
  CHAPTER_WRITING = 'chapter-writing',
  CHAPTER_ANALYSIS = 'chapter-analysis',
  SELF_CRITIQUE = 'self-critique',
  CHARACTER_UPDATES = 'character-updates',
  TRANSITION_WRITING = 'transition-writing',
  TITLE_GENERATION = 'title-generation',
  EDITING_AGENT_ANALYSIS = 'editing-agent-analysis',
  EDITING_AGENT_TARGETED = 'editing-agent-targeted',
  EDITING_AGENT_REGENERATE = 'editing-agent-regenerate',
  EDITING_AGENT_POLISH = 'editing-agent-polish',
  EDITING_AGENT_EVALUATION = 'editing-agent-evaluation',
  CONSISTENCY_CHECKER = 'consistency-checker',
  PROFESSIONAL_POLISH = 'professional-polish',
  FINAL_EDITING_PASS = 'final-editing-pass',
  SPECIALIZED_EDITORS = 'specialized-editors',
  // Hybrid Multi-Agent System
  STRUCTURE_AGENT = 'structure-agent',
  CHARACTER_AGENT = 'character-agent',
  SCENE_AGENT = 'scene-agent',
  SYNTHESIS_AGENT = 'synthesis-agent'
}