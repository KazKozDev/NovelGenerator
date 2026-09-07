import { Character } from '../types';
import { generateText as generateGeminiText } from '../services/llmService';


const INVALID_CHARACTER_KEYWORDS = new Set([
  'i understand',
  'i understand the task',
  'i will',
  'i will extract',
  "i'll",
  'here is',
  'here are',
  'character',
  'characters',
  'character name',
  'character names',
  'main character',
  'main characters',
  'supporting character',
  'supporting characters',
  'protagonist',
  'antagonist',
  'role',
  'note',
  'notes',
  'description',
  'physical description',
  'personality',
  'personality traits',
  'motivation',
  'character arc',
  'arc',
  'relationships',
  'connections',
  'chapter',
  'chapters',
  'summary',
  'setting',
  'world',
  'story',
  'outline',
  'based on',
  'sure',
  'certainly',
  'format',
  'example',
  'status',
  'details',
  'active characters',
  'output',
  'name',
]);

/**
 * Strips leading bullets, numbers, markdown formatting (*, _, `, #) and trailing colons/dashes.
 */
export function cleanCharacterCandidateName(rawName: string): string {
  if (!rawName) return '';
  let cleaned = rawName
    .replace(/^[\s*\-#\d.]+/, '')
    .replace(/[*_`#]/g, '')
    .trim();

  // If name ends with colon or dash, strip it
  cleaned = cleaned.replace(/[:\-–—]+$/, '').trim();
  return cleaned;
}

/**
 * Validates whether a candidate string is genuinely a character name,
 * rejecting AI conversational filler ("I understand the task", "Here are the characters"),
 * markdown headers, instructions, or template placeholders ("CHARACTER NAME").
 */
export function isValidCharacterName(rawName: string): boolean {
  if (!rawName) return false;
  const cleaned = cleanCharacterCandidateName(rawName);
  if (cleaned.length < 2 || cleaned.length > 40) return false;

  const lower = cleaned.toLowerCase().trim();

  // Check exact blacklist
  if (INVALID_CHARACTER_KEYWORDS.has(lower)) return false;

  // Check conversational and instructional prefixes
  const metaPrefixes = [
    'i understand',
    "i'll",
    'i will',
    'here is',
    'here are',
    'note',
    'character name',
    'main character',
    'please',
    'based on',
    'sure',
    'certainly',
    'as an ai',
    'below is',
    'below are',
    'the following',
  ];
  if (metaPrefixes.some(prefix => lower.startsWith(prefix))) return false;

  // Words count check: fictional character names rarely exceed 4 words
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length > 4) return false;

  // Check for forbidden conversational/instructional words inside name
  const forbiddenTokens = [
    'understand',
    'extract',
    'task',
    'prompt',
    'assistant',
    'output',
    'guideline',
    'instruction',
    'format',
    'template',
    'provide',
    'generate',
    'return',
  ];
  for (const word of words) {
    const cleanWord = word.replace(/[^a-z]/g, '');
    if (forbiddenTokens.includes(cleanWord)) {
      return false;
    }
  }

  // Must contain at least one letter (Latin, Cyrillic, etc.)
  if (!/[A-Za-zÀ-ÿА-я]/.test(cleaned)) return false;

  // Cannot end with sentence punctuation if multiple words (indicates a sentence, not a name)
  if (/[.!?]$/.test(cleaned) && words.length > 1) return false;

  return true;
}

/**
 * Extracts character name and description pairs from text, rejecting filler and template markers.
 */
export function findCharacterMatches(text: string): Array<[string, string]> {
  if (!text) return [];
  const lines = text.split('\n');
  const matches: Array<[string, string]> = [];
  const seenNames = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Pattern 1: Split at first colon: e.g. "Name: Description" or "- **Name**: Description"
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const candidateKey = line.substring(0, colonIndex);
      const candidateValue = line.substring(colonIndex + 1).trim();
      const cleanedName = cleanCharacterCandidateName(candidateKey);

      if (isValidCharacterName(cleanedName) && candidateValue.length > 5) {
        const lowerName = cleanedName.toLowerCase();
        if (!seenNames.has(lowerName)) {
          seenNames.add(lowerName);
          matches.push([cleanedName, candidateValue]);
        }
      }
    } else {
      // Pattern 2: Dash-separated e.g. "- John Doe – description"
      const dashMatch = line.match(/^[-*•]\s*([A-Z][A-Za-z\s.'-]+?)\s*[-–—]\s*(.+)$/);
      if (dashMatch) {
        const cleanedName = cleanCharacterCandidateName(dashMatch[1]);
        const candidateValue = dashMatch[2].trim();
        if (isValidCharacterName(cleanedName) && candidateValue.length > 5) {
          const lowerName = cleanedName.toLowerCase();
          if (!seenNames.has(lowerName)) {
            seenNames.add(lowerName);
            matches.push([cleanedName, candidateValue]);
          }
        }
      }
    }
  }

  return matches;
}

export async function extractCharactersFromString(
  outlineText: string, 
  llmFallback: typeof generateGeminiText
): Promise<Record<string, Character>> {
  const characters: Record<string, Character> = {};
  
  const charSectionMatch = outlineText.match(/MAIN CHARACTERS\s*\n(.*?)(?=\n\n[A-Z\s]+:|$)/is);
  const characterTextFromOutline = charSectionMatch && charSectionMatch[1] ? charSectionMatch[1] : '';

  // 1. First attempt: check if outline text already contains clean character definitions
  if (characterTextFromOutline) {
    const directMatches = findCharacterMatches(characterTextFromOutline);
    if (directMatches.length >= 2) {
      for (const [name, description] of directMatches) {
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
      return characters;
    }
  }

  // 2. LLM Extraction with strict anti-filler prompt
  let characterDetailsText = "";
  if (characterTextFromOutline) {
    const charPrompt = `Extract the characters and their descriptions from this outline section:

${characterTextFromOutline}

OUTPUT RULES:
- Output ONLY characters in this exact format:
Name: Detailed physical description, personality, motivation, role.
- One character per line.
- DO NOT write introductions, conclusions, or conversational text like "I understand the task" or "Here is the list".
- DO NOT use placeholders like "CHARACTER NAME".
- Include protagonist, antagonist, and key supporting characters.`;
    characterDetailsText = await llmFallback(charPrompt, "You are a precise data extraction assistant. Return only Name: Description lines.");
  } else {
    // Fallback: Try to extract from the whole outline if section is missing
    const charPromptFallback = `Based on this story outline, extract the key characters:

${outlineText}

OUTPUT RULES:
- Output ONLY characters in this exact format:
Name: Brief description, role in story, key personality traits, motivation.
- One character per line.
- DO NOT write any introductions like "I understand the task" or "Here are the characters".
- DO NOT use placeholders like "CHARACTER NAME".
- Include protagonist, antagonist, and key supporting characters.`;
    characterDetailsText = await llmFallback(charPromptFallback, "You are a precise data extraction assistant. Return only Name: Description lines.");
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

  // 3. Fallback: if LLM extraction returned 0 characters, try direct parse of outline
  if (Object.keys(characters).length === 0) {
    const fallbackMatches = findCharacterMatches(characterTextFromOutline || outlineText);
    for (const [name, description] of fallbackMatches) {
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
 * Sanitizes pseudo-JSON constructs frequently produced by LLMs:
 * - Placeholder ellipses: [...] -> [], {...} -> {}
 * - Ellipses inside arrays: ["item 1", ...] -> ["item 1"]
 * - Ellipses at start of arrays: [..., "item 2"] -> ["item 2"]
 * - Trailing commas: {"a": 1,} -> {"a": 1}, ["a",] -> ["a"]
 */
export function sanitizeJsonPlaceholders(jsonStr: string): string {
  if (!jsonStr) return '';
  return jsonStr
    // Replace [...] and [ ... ] with []
    .replace(/\[\s*\.{2,}\s*\]/g, '[]')
    // Replace {...} and { ... } with {}
    .replace(/\{\s*\.{2,}\s*\}/g, '{}')
    // Replace [ "item", ... ] or [ "item", ... , "item2" ]
    .replace(/,\s*\.{2,}\s*([\]\}])/g, '$1')
    .replace(/([\[\{])\s*\.{2,}\s*,?/g, '$1')
    .replace(/,\s*\.{2,}\s*,/g, ',')
    // Remove trailing commas before } or ]
    .replace(/,\s*([\]\}])/g, '$1');
}

/**
 * Clean and normalize JSON string returned from LLM by stripping markdown code fences
 * and conversational wrappers.
 */
export function cleanJsonString(raw: string): string {
  if (!raw) return '';
  // Strip any reasoning / think blocks from thinking models
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

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

  return sanitizeJsonPlaceholders(cleaned);
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
 * Safely parse a JSON string from LLMs with automatic recovery from:
 * - Markdown code fences surrounded by conversational text
 * - Trailing commentary, notes, or explanations after valid JSON
 * - Multiple sequential JSON objects (NDJSON / concatenated objects)
 */
export function parseLenientJson<T = any>(raw: string): T {
  if (!raw || typeof raw !== 'string') {
    throw new Error("Cannot parse empty JSON response");
  }

  // 1. Strip reasoning / think blocks
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Extract markdown code blocks anywhere in text
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/gi;
  const candidates: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match[1] && match[1].trim()) {
      candidates.push(match[1].trim());
    }
  }
  candidates.push(text);

  const tryParseSingleOrMulti = (str: string): any => {
    let s = sanitizeJsonPlaceholders(str.trim());
    if (!s) return null;

    // Direct JSON.parse
    try {
      return JSON.parse(s);
    } catch (err: any) {
      // Check for position-based syntax error (e.g. "at position 219 (line 11 column 1)")
      const posMatch = err.message.match(/at position (\d+)/i);
      if (posMatch) {
        const firstPos = parseInt(posMatch[1], 10);
        const firstChunk = s.slice(0, firstPos).trim();
        const remaining = s.slice(firstPos).trim();

        try {
          const firstParsed = JSON.parse(firstChunk);
          const multiObjects: any[] = [firstParsed];
          let rest = remaining;

          while (rest.length > 0) {
            rest = rest.trim();
            const nextStart = rest.search(/[\{\[]/);
            if (nextStart === -1) break;
            rest = rest.slice(nextStart);

            try {
              const nextParsed = JSON.parse(rest);
              multiObjects.push(nextParsed);
              break;
            } catch (nextErr: any) {
              const nextPosMatch = nextErr.message.match(/at position (\d+)/i);
              if (nextPosMatch) {
                const subPos = parseInt(nextPosMatch[1], 10);
                const subChunk = rest.slice(0, subPos).trim();
                try {
                  multiObjects.push(JSON.parse(subChunk));
                  rest = rest.slice(subPos).trim();
                } catch {
                  break;
                }
              } else {
                break;
              }
            }
          }

          if (multiObjects.length > 1) {
            return multiObjects;
          }
          return firstParsed;
        } catch {
          // Fall through
        }
      }
    }

    // Bracket scanner: find outermost matching { ... } or [ ... ]
    const firstBrace = s.search(/[\{\[]/);
    if (firstBrace !== -1) {
      const isArray = s[firstBrace] === '[';
      const closingChar = isArray ? ']' : '}';
      const lastBrace = s.lastIndexOf(closingChar);
      if (lastBrace > firstBrace) {
        const slice = s.slice(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(slice);
        } catch {
          // Fall through
        }
      }
    }

    return null;
  };

  for (const candidate of candidates) {
    const parsed = tryParseSingleOrMulti(candidate);
    if (parsed !== null && parsed !== undefined) {
      return parsed as T;
    }
  }

  // Fallback to existing cleanJsonString
  const cleaned = cleanJsonString(raw);
  return JSON.parse(cleaned) as T;
}

export interface ChapterPlanParseResult {
  chapters: any[];
  parsedJson: { chapters: any[] };
}

/**
 * Parses and normalizes chapter plan output from any LLM into a standard `{ chapters: any[] }` structure.
 */
export function parseChapterPlanJson(raw: string): ChapterPlanParseResult {
  const parsed = parseLenientJson<any>(raw);

  if (!parsed) {
    throw new Error("Failed to parse chapter plan: empty response.");
  }

  let chapters: any[] = [];

  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
      if (Array.isArray(parsed[0].chapters)) {
        chapters = parsed[0].chapters;
      } else {
        chapters = parsed;
      }
    } else {
      chapters = parsed;
    }
  } else if (typeof parsed === 'object' && parsed !== null) {
    if (Array.isArray(parsed.chapters)) {
      chapters = parsed.chapters;
    } else if (Array.isArray(parsed.chapterList)) {
      chapters = parsed.chapterList;
    } else if (Array.isArray(parsed.plan)) {
      chapters = parsed.plan;
    } else if (Array.isArray(parsed.items)) {
      chapters = parsed.items;
    } else if (Array.isArray(parsed.data)) {
      chapters = parsed.data;
    } else {
      const potentialChapters = Object.values(parsed).filter(
        (v: any) => typeof v === 'object' && v !== null && (('title' in v) || ('summary' in v) || ('sceneBreakdown' in v))
      );
      if (potentialChapters.length > 0) {
        chapters = potentialChapters;
      } else {
        const arrayKey = Object.keys(parsed).find(k => Array.isArray((parsed as any)[k]));
        if (arrayKey && (parsed as any)[arrayKey].length > 0) {
          chapters = (parsed as any)[arrayKey];
        }
      }
    }
  }

  if (!Array.isArray(chapters) || chapters.length === 0) {
    throw new Error("Generated JSON does not contain a recognizable list of chapters.");
  }

  return {
    chapters,
    parsedJson: { chapters }
  };
}


/**
 * Clean scaffolding, meta-notes, and leftover bracket slot markers from generated prose.
 */
export function cleanProseArtifacts(prose: string): string {
  if (!prose) return '';
  // Strip any reasoning / think blocks
  let cleaned = prose.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

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

export interface ChapterAnalysisFallbackContext {
  chapterNumber: number;
  plannedTitle: string;
  chapterContent: string;
  plannedSummary?: string;
}

export interface ChapterAnalysisResult {
  summary: string;
  timeElapsed?: string;
  endTimeOfChapter?: string;
  specificMarkers?: string;
  primaryEmotion?: string;
  tensionLevel?: number;
  unresolvedHook?: string;
  pacingScore?: number;
  dialogueRatio?: number;
  wordCount?: number;
  keyEvents?: string[];
  characterMoments?: string[];
  foreshadowing?: string[];
}

/**
 * Resiliently parses chapter analysis JSON returned from LLMs.
 * Recovers from pseudo-JSON like `[...]`, markdown wrappers, unquoted keys,
 * and provides a graceful fallback if the LLM output is corrupted so novel generation
 * is never aborted.
 */
export function parseChapterAnalysisJson(
  raw: string,
  context: ChapterAnalysisFallbackContext
): ChapterAnalysisResult {
  const approximateWordCount = context.chapterContent
    ? context.chapterContent.split(/\s+/).filter(Boolean).length
    : 0;

  const defaultResult: ChapterAnalysisResult = {
    summary: context.plannedSummary || `Chapter ${context.chapterNumber} chronicles the events of "${context.plannedTitle}".`,
    timeElapsed: "Same day",
    endTimeOfChapter: "Evening",
    specificMarkers: "None",
    primaryEmotion: "Anticipation",
    tensionLevel: 6,
    unresolvedHook: "Unresolved tension heading into the next chapter",
    pacingScore: 6,
    dialogueRatio: 35,
    wordCount: approximateWordCount,
    keyEvents: [],
    characterMoments: [],
    foreshadowing: []
  };

  if (!raw || typeof raw !== 'string') {
    return defaultResult;
  }

  // Attempt 1: Standard cleanJsonString + JSON.parse
  try {
    const cleaned = cleanJsonString(raw);
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') {
      return {
        summary: parsed.summary || parsed.Summary || defaultResult.summary,
        timeElapsed: parsed.timeElapsed || parsed.TimeElapsed || defaultResult.timeElapsed,
        endTimeOfChapter: parsed.endTimeOfChapter || parsed.EndTimeOfChapter || defaultResult.endTimeOfChapter,
        specificMarkers: parsed.specificMarkers || parsed.SpecificMarkers || defaultResult.specificMarkers,
        primaryEmotion: parsed.primaryEmotion || parsed.PrimaryEmotion || defaultResult.primaryEmotion,
        tensionLevel: typeof parsed.tensionLevel === 'number' ? parsed.tensionLevel : defaultResult.tensionLevel,
        unresolvedHook: parsed.unresolvedHook || parsed.UnresolvedHook || defaultResult.unresolvedHook,
        pacingScore: typeof parsed.pacingScore === 'number' ? parsed.pacingScore : defaultResult.pacingScore,
        dialogueRatio: typeof parsed.dialogueRatio === 'number' ? parsed.dialogueRatio : defaultResult.dialogueRatio,
        wordCount: typeof parsed.wordCount === 'number' ? parsed.wordCount : approximateWordCount,
        keyEvents: Array.isArray(parsed.keyEvents) ? parsed.keyEvents : Array.isArray(parsed.Events) ? parsed.Events : [],
        characterMoments: Array.isArray(parsed.characterMoments) ? parsed.characterMoments : [],
        foreshadowing: Array.isArray(parsed.foreshadowing) ? parsed.foreshadowing : []
      };
    }
  } catch {
    // Continue to Attempt 2
  }

  // Attempt 2: parseLenientJson with sanitized input
  try {
    const sanitizedRaw = sanitizeJsonPlaceholders(raw);
    const parsed = parseLenientJson<any>(sanitizedRaw);
    if (parsed && typeof parsed === 'object') {
      return {
        summary: parsed.summary || parsed.Summary || defaultResult.summary,
        timeElapsed: parsed.timeElapsed || parsed.TimeElapsed || defaultResult.timeElapsed,
        endTimeOfChapter: parsed.endTimeOfChapter || parsed.EndTimeOfChapter || defaultResult.endTimeOfChapter,
        specificMarkers: parsed.specificMarkers || parsed.SpecificMarkers || defaultResult.specificMarkers,
        primaryEmotion: parsed.primaryEmotion || parsed.PrimaryEmotion || defaultResult.primaryEmotion,
        tensionLevel: typeof parsed.tensionLevel === 'number' ? parsed.tensionLevel : defaultResult.tensionLevel,
        unresolvedHook: parsed.unresolvedHook || parsed.UnresolvedHook || defaultResult.unresolvedHook,
        pacingScore: typeof parsed.pacingScore === 'number' ? parsed.pacingScore : defaultResult.pacingScore,
        dialogueRatio: typeof parsed.dialogueRatio === 'number' ? parsed.dialogueRatio : defaultResult.dialogueRatio,
        wordCount: typeof parsed.wordCount === 'number' ? parsed.wordCount : approximateWordCount,
        keyEvents: Array.isArray(parsed.keyEvents) ? parsed.keyEvents : Array.isArray(parsed.Events) ? parsed.Events : [],
        characterMoments: Array.isArray(parsed.characterMoments) ? parsed.characterMoments : [],
        foreshadowing: Array.isArray(parsed.foreshadowing) ? parsed.foreshadowing : []
      };
    }
  } catch {
    // Continue to Attempt 3
  }

  // Attempt 3: Regex extraction for key fields from raw response
  try {
    const summaryMatch = raw.match(/"summary"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    const tensionMatch = raw.match(/"tensionLevel"\s*:\s*(\d+)/i);
    const pacingMatch = raw.match(/"pacingScore"\s*:\s*(\d+)/i);
    const emotionMatch = raw.match(/"primaryEmotion"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
    const hookMatch = raw.match(/"unresolvedHook"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);

    if (summaryMatch && summaryMatch[1]) {
      return {
        ...defaultResult,
        summary: summaryMatch[1].replace(/\\"/g, '"'),
        tensionLevel: tensionMatch ? parseInt(tensionMatch[1], 10) : defaultResult.tensionLevel,
        pacingScore: pacingMatch ? parseInt(pacingMatch[1], 10) : defaultResult.pacingScore,
        primaryEmotion: emotionMatch ? emotionMatch[1] : defaultResult.primaryEmotion,
        unresolvedHook: hookMatch ? hookMatch[1] : defaultResult.unresolvedHook,
      };
    }
  } catch {
    // Fall through to Attempt 4
  }

  // Attempt 4: Safe fallback
  console.warn(`parseChapterAnalysisJson: Failed to parse raw analysis JSON for Chapter ${context.chapterNumber}, using safe fallback.`);
  return defaultResult;
}


