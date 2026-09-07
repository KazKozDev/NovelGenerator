import { Character } from '../types';
import { generateText as generateGeminiText } from '../services/llmService';


// Helper for Python-like re.findall for specific character pattern
function findCharacterMatches(text: string): Array<[string, string]> {
  const pattern = /([A-Z][A-Za-z\s\-'.]+):\s+([^\n]+)/g;
  const matches: Array<[string, string]> = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    matches.push([match[1].trim(), match[2].trim()]);
  }
  return matches;
}

export async function extractCharactersFromString(
  outlineText: string, 
  llmFallback: typeof generateGeminiText
): Promise<Record<string, Character>> {
  const characters: Record<string, Character> = {};
  
  const charSectionMatch = outlineText.match(/MAIN CHARACTERS\s*\n(.*?)(?=\n\n[A-Z\s]+:|$)/is);
  let characterDetailsText = "";

  if (charSectionMatch && charSectionMatch[1]) {
    const characterTextFromOutline = charSectionMatch[1];
    const charPrompt = `From the 'MAIN CHARACTERS' section below, extract each character's details.

${characterTextFromOutline}

For EACH character, format as:
CHARACTER NAME: Detailed physical description, core personality traits, primary motivation, overall character arc, role, connections.

Include all characters mentioned (protagonist, antagonist, supporting).`;
    characterDetailsText = await llmFallback(charPrompt, "You are a data extraction assistant.");
  } else {
     // Fallback: Try to extract from the whole outline if section is missing
    const charPromptFallback = `Based on this story outline, create a detailed character guide:

${outlineText}

For EACH character clearly mentioned with a description, format as:
CHARACTER NAME: Brief description, role in story, key personality traits, motivation, background (if available in outline).

Include protagonist, antagonist, and key supporting characters.`;
    characterDetailsText = await llmFallback(charPromptFallback, "You are a data extraction assistant.");
  }

  if (characterDetailsText) {
    const matches = findCharacterMatches(characterDetailsText);
    for (const match of matches) {
      const name = match[0];
      const description = match[1];
      characters[name] = {
        name,
        description,
        first_appearance: 0,
        status: "unknown",
        development: [],
        relationships: {},
        location: "unknown",
        emotional_state: "unknown",
      };
    }
  }
  return characters;
}

export async function extractWorldNameFromString(
  outlineText: string,
  llmFallback: typeof generateGeminiText
): Promise<string> {
  const patterns = [
    /Neo-[A-Za-z]+/g,
    /[A-Z][a-z]+land/g,
    /[A-Z][a-z]+ Kingdom/g,
    /[A-Z][a-z]+ Empire/g,
    /[A-Z][a-z]+ Realm/g,
    /[A-Z][a-z]+ World/g,
    /[A-Z][a-z]+ City/g,
  ];
  
  const foundNames: string[] = [];
  for (const pattern of patterns) {
    const matches = outlineText.match(pattern);
    if (matches) {
      foundNames.push(...matches);
    }
  }
  
  if (foundNames.length > 0) {
    const counts: Record<string, number> = {};
    for (const name of foundNames) {
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  }
  
  // Fallback using regex for specific section
  const worldNameMatch = outlineText.match(/WORLD BUILDING DETAILS\s*\n1.\s*The name of the main world\/city\/setting:\s*([^\n]+)/i);
  if (worldNameMatch && worldNameMatch[1]) {
    return worldNameMatch[1].trim();
  }

  // LLM fallback if regex fails
  const worldPrompt = `Based on this story outline, what is the primary name for the main world/city/setting?

${outlineText}

Reply with ONLY the world name, nothing else.`;
  const llmName = await llmFallback(worldPrompt, "You are a data extraction assistant.");
  return llmName.trim();
}

export async function extractMotifsFromString(
  outlineText: string,
  llmFallback: typeof generateGeminiText
): Promise<string[]> {
  const motifMatch = outlineText.match(/RECURRING MOTIFS\/THEMES\s*\n(.*?)(?=\n\n[A-Z\s]+:|$)/is);
  if (motifMatch && motifMatch[1]) {
    return motifMatch[1].split('\n')
      .map(motif => motif.trim().replace(/^[*-]\s*/, ''))
      .filter(motif => motif.length > 0);
  }

  // LLM fallback
  const motifPrompt = `Based on this story outline, identify 3-5 recurring motifs, symbols, objects, or core themes:
${outlineText}
Format as a simple list, one item per line.
These should be concrete elements or clear themes that can recur or be referenced.`;
  const motifsTextFallback = await llmFallback(motifPrompt, "You are a literary analyst.");
  if (motifsTextFallback) {
    return motifsTextFallback.split('\n').map(motif => motif.trim()).filter(motif => motif.length > 0);
  }
  return [];
}

/**
 * Clean and normalize JSON string returned from LLM by stripping markdown code fences
 * and conversational wrappers.
 */
export function cleanJsonString(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.trim();

  // Strip markdown code block fences (```json ... ``` or ``` ... ```)
  const codeBlockMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  } else {
    // If not a pure code block, look for first { or [ to last } or ]
    const firstBrace = cleaned.search(/[\{\[]/);
    const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1).trim();
    }
  }

  return cleaned;
}

/**
 * Safely parse JSON string with markdown stripping and fallback value on error.
 */
export function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    const cleaned = cleanJsonString(raw);
    if (!cleaned) return fallback;
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.warn('safeJsonParse failed to parse JSON, returning fallback:', err);
    return fallback;
  }
}

/**
 * Clean scaffolding, meta-notes, and leftover bracket slot markers from generated prose.
 */
export function cleanProseArtifacts(prose: string): string {
  if (!prose) return '';
  let cleaned = prose.trim();

  // Strip conversational/scaffolding preambles from LLM
  cleaned = cleaned.replace(
    /^(?:Here is the (?:integrated |polished |rewritten )?chapter.*|Every slot marker is resolved below.*|Below is the (?:integrated |polished |rewritten )?chapter.*|## slot Chapter marker.*)\n+/im,
    ''
  );

  // Remove lingering slot tags like [SLOT_NAME], [ACTION_SLOT], [DESCRIPTION_1], etc.
  cleaned = cleaned.replace(/\[(?:SLOT|ACTION|DIALOGUE|DESCRIPTION|INTERNAL|TRANSITION)[^\]]*\]/gi, '');

  return cleaned.trim();
}

export interface ParsedEvaluation {
  qualityScore: number;
  changesApplied: string[];
  planElementsPresent: boolean;
  remainingIssues: string[];
}

/**
 * Robust evaluation response parser. Handles pure JSON, code fences, and markdown/bullet points.
 */
export function parseEvaluationResponse(raw: string): ParsedEvaluation {
  // 1. Try standard JSON parsing with cleanJsonString
  try {
    const cleaned = cleanJsonString(raw);
    if (cleaned) {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed === 'object' && parsed !== null) {
        const rawScore = parsed.qualityScore ?? parsed.score;
        const qualityScore = typeof rawScore === 'number'
          ? rawScore
          : parseInt(String(rawScore || '75'), 10) || 75;

        let changesApplied: string[] = [];
        if (Array.isArray(parsed.changesApplied)) {
          changesApplied = parsed.changesApplied.map(String);
        } else if (parsed.changesApplied) {
          changesApplied = [String(parsed.changesApplied)];
        } else {
          changesApplied = ['Edits applied'];
        }

        const remainingIssues = Array.isArray(parsed.remainingIssues)
          ? parsed.remainingIssues.map(String)
          : [];

        return {
          qualityScore: Math.min(100, Math.max(0, qualityScore)),
          changesApplied: changesApplied.length > 0 ? changesApplied : ['Edits applied'],
          planElementsPresent: Boolean(parsed.planElementsPresent ?? true),
          remainingIssues
        };
      }
    }
  } catch {
    // Fall back to text extraction below
  }

  // 2. Markdown / text extraction fallback (e.g. "**Quality Score**: 85/100")
  let score = 75;
  const scoreMatch = raw.match(/(?:\*\*|#)?(?:quality\s*score|score)(?:\*\*|#)?\s*[:=]\s*(\d+)/i);
  if (scoreMatch && scoreMatch[1]) {
    score = parseInt(scoreMatch[1], 10);
    if (isNaN(score)) score = 75;
  }

  const changes: string[] = [];
  const changesSectionMatch = raw.match(
    /(?:\*\*|#)?(?:changes\s*applied|improvements|changes|major\s*strengths)(?:\*\*|#)?\s*[:=]?\s*([\s\S]*?)(?=(?:\*\*|#)?(?:plan\s*elements|remaining\s*issues|areas\s*needing|$))/i
  );
  if (changesSectionMatch && changesSectionMatch[1]) {
    const lines = changesSectionMatch[1].split('\n')
      .map(line => line.trim().replace(/^[-*•\d.]+\s*/, ''))
      .filter(line => line.length > 0 && !/^(none|n\/a)$/i.test(line));
    changes.push(...lines);
  }

  const issues: string[] = [];
  const issuesSectionMatch = raw.match(
    /(?:\*\*|#)?(?:remaining\s*issues|issues|problems|areas\s*needing\s*improvement|ai\s*patterns)(?:\*\*|#)?\s*[:=]?\s*([\s\S]*?)$/i
  );
  if (issuesSectionMatch && issuesSectionMatch[1]) {
    const lines = issuesSectionMatch[1].split('\n')
      .map(line => line.trim().replace(/^[-*•\d.]+\s*/, ''))
      .filter(line => line.length > 0 && !/^(none|no issues|n\/a)$/i.test(line));
    issues.push(...lines);
  }

  const planElementsPresent = !/plan\s*elements\s*(?:present)?\s*[:=]?\s*(?:no|false)/i.test(raw);

  return {
    qualityScore: Math.min(100, Math.max(0, score)),
    changesApplied: changes.length > 0 ? changes : ['Edits applied'],
    planElementsPresent,
    remainingIssues: issues
  };
}

