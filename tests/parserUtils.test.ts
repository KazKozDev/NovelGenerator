import { describe, it, expect } from 'vitest';
import {
  cleanJsonString,
  safeJsonParse,
  cleanProseArtifacts,
  parseEvaluationResponse,
  parseLenientJson,
  parseChapterPlanJson,
  cleanCharacterCandidateName,
  isValidCharacterName,
  findCharacterMatches,
  extractCharactersFromString,
  sanitizeJsonPlaceholders,
  parseChapterAnalysisJson
} from '../utils/parserUtils';


describe('parserUtils - cleanJsonString and safeJsonParse', () => {
  it('parses standard valid JSON string', () => {
    const input = '{"chapters": [{"title": "Chapter 1"}]}';
    const result = safeJsonParse(input, { chapters: [] });
    expect(result).toEqual({ chapters: [{ title: 'Chapter 1' }] });
  });

  it('strips markdown code fences (```json ... ```)', () => {
    const input = '```json\n{"chapters": [{"title": "Chapter 1"}]}\n```';
    const cleaned = cleanJsonString(input);
    expect(cleaned).toBe('{"chapters": [{"title": "Chapter 1"}]}');
    const result = safeJsonParse(input, { chapters: [] });
    expect(result).toEqual({ chapters: [{ title: 'Chapter 1' }] });
  });

  it('strips markdown code fences without language tag (``` ... ```)', () => {
    const input = '```\n{"decision": "accept"}\n```';
    const cleaned = cleanJsonString(input);
    expect(cleaned).toBe('{"decision": "accept"}');
    const result = safeJsonParse(input, {});
    expect(result).toEqual({ decision: 'accept' });
  });

  it('extracts JSON object when surrounded by conversational text', () => {
    const input = 'Here is your outline:\n{"chapters": [{"title": "Ch 1"}]}\nHope you like it!';
    const result = safeJsonParse(input, { chapters: [] });
    expect(result).toEqual({ chapters: [{ title: 'Ch 1' }] });
  });

  it('handles invalid JSON by returning fallback', () => {
    const input = 'This is definitely not JSON';
    const fallback = { fallback: true };
    const result = safeJsonParse(input, fallback);
    expect(result).toEqual(fallback);
  });
});

describe('parserUtils - cleanProseArtifacts', () => {
  it('strips preamble and lingering slot bracket tags', () => {
    const raw = `Every slot marker is resolved below.

The rain poured down on Diagon Alley. [ACTION_SLOT] Harry pulled his cloak tighter. [SLOT_ENDING]`;
    const cleaned = cleanProseArtifacts(raw);
    expect(cleaned).toBe('The rain poured down on Diagon Alley.  Harry pulled his cloak tighter.');
    expect(cleaned).not.toContain('Every slot marker is resolved below');
    expect(cleaned).not.toContain('[ACTION_SLOT]');
  });

  it('strips "Here is the chapter" preamble', () => {
    const raw = `Here is the integrated chapter for your story:

Harry walked into the room.`;
    const cleaned = cleanProseArtifacts(raw);
    expect(cleaned).toBe('Harry walked into the room.');
  });

  it('strips model thinking and deliberation preambles before chapter title', () => {
    const raw = `Let me look at this carefully. The user has given me a task that is somewhat garbled.
My role per the system prompt: I'm a text integration specialist.
So what should I do? Options: Write the chapter myself.
Also important: "Do not output thinking, inner monologue, reasoning steps, or # Chapter One: The Light Across the Yard

The kettle had gone cold an hour ago, but Marina still sat at the kitchen table with her back to the window.`;

    const cleaned = cleanProseArtifacts(raw);
    expect(cleaned).toContain('# Chapter One: The Light Across the Yard');
    expect(cleaned).toContain('The kettle had gone cold an hour ago');
    expect(cleaned).not.toContain('Let me look at this carefully');
    expect(cleaned).not.toContain('My role per the system prompt');
    expect(cleaned).not.toContain('So what should I do');
  });

  it('strips preamble reasoning and trailing slot-counting checklist', () => {
    const raw = `The user wants me to synthesize a complete chapter prose for Chapter 1: "The Light Across the Yard" - a Russian psychological horror story.
The slot content sections are empty, so I need to write the full prose myself.
Let me plan the chapter:

Chapter 1: The Light Across the Yard
The lamp across the courtyard came on at 3:14, as it had for one hundred and eighty-three nights. Marina stood at her kitchen window.
She left the lamp on. She sat facing the window this time.

Now let me count slots:
Dialogue slots: 11
Action slots: 9
Forbidden words check: None present.`;

    const cleaned = cleanProseArtifacts(raw);
    expect(cleaned).toContain('Chapter 1: The Light Across the Yard');
    expect(cleaned).toContain('The lamp across the courtyard came on at 3:14');
    expect(cleaned).toContain('She left the lamp on. She sat facing the window this time.');
    expect(cleaned).not.toContain('The user wants me to synthesize');
    expect(cleaned).not.toContain('Now let me count slots');
    expect(cleaned).not.toContain('Forbidden words check');
  });
});

describe('parserUtils - parseEvaluationResponse', () => {
  it('parses valid JSON schema evaluation', () => {
    const input = JSON.stringify({
      qualityScore: 88,
      changesApplied: ['Smoothed dialogue', 'Removed repetitive adjectives'],
      planElementsPresent: true,
      remainingIssues: []
    });
    const parsed = parseEvaluationResponse(input);
    expect(parsed.qualityScore).toBe(88);
    expect(parsed.changesApplied).toEqual(['Smoothed dialogue', 'Removed repetitive adjectives']);
    expect(parsed.planElementsPresent).toBe(true);
  });

  it('parses markdown formatted evaluation without throwing syntax error', () => {
    const markdownInput = `**Quality Score**: 82/100
**Major Strengths**:
- Excellent pacing
- Natural banter between Harry and Ron
**Plan Elements Present**: Yes
**Areas Needing Improvement**:
- Could add one more atmospheric detail`;

    const parsed = parseEvaluationResponse(markdownInput);
    expect(parsed.qualityScore).toBe(82);
    expect(parsed.changesApplied.length).toBeGreaterThan(0);
    expect(parsed.planElementsPresent).toBe(true);
  });

  it('provides safe defaults when input is unparseable', () => {
    const parsed = parseEvaluationResponse('Unrelated gibberish');
    expect(parsed.qualityScore).toBe(75);
    expect(parsed.changesApplied).toEqual(['Edits applied']);
  });
});

describe('parserUtils - parseChapterPlanJson and multi-object JSON resilience', () => {
  it('recovers from multiple concatenated JSON objects (unexpected non-whitespace character after JSON)', () => {
    // Simulates the exact user bug:
    // Model outputs Chapter 1 as a JSON object, then Chapter 2 starts at line 11 column 1
    const multiJson = `{
  "title": "Chapter 1: The Spark",
  "summary": "Elena discovers the anomaly in the ruins.",
  "conflictType": "external",
  "tensionLevel": 6,
  "rhythmPacing": "fast",
  "targetWordCount": 5000,
  "moralDilemma": "None yet",
  "openingHook": "Alarms ringing",
  "climaxMoment": "Breaching the door",
  "chapterEnding": "A sudden silence"
}
{
  "title": "Chapter 2: The Fire",
  "summary": "Elena faces the perimeter guards.",
  "conflictType": "interpersonal",
  "tensionLevel": 7,
  "rhythmPacing": "medium",
  "targetWordCount": 5000,
  "moralDilemma": "Whether to surrender",
  "openingHook": "Footsteps approaching",
  "climaxMoment": "The standoff",
  "chapterEnding": "Captured"
}`;

    const result = parseChapterPlanJson(multiJson);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe('Chapter 1: The Spark');
    expect(result.chapters[1].title).toBe('Chapter 2: The Fire');
    expect(result.parsedJson.chapters).toHaveLength(2);
  });

  it('parses valid JSON when followed by trailing commentary or bracketed notes', () => {
    const jsonWithNotes = `{
  "chapters": [
    { "title": "Chapter 1", "summary": "Summary 1" },
    { "title": "Chapter 2", "summary": "Summary 2" }
  ]
}
[Note from AI: These chapters establish the initial conflict.]`;

    const result = parseChapterPlanJson(jsonWithNotes);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe('Chapter 1');
  });

  it('normalizes top-level array of chapters into { chapters: [...] }', () => {
    const arrayJson = `[
  { "title": "Chapter 1", "summary": "Summary 1" },
  { "title": "Chapter 2", "summary": "Summary 2" },
  { "title": "Chapter 3", "summary": "Summary 3" }
]`;

    const result = parseChapterPlanJson(arrayJson);
    expect(result.chapters).toHaveLength(3);
    expect(result.parsedJson.chapters).toHaveLength(3);
  });

  it('normalizes keyed chapter objects into chapters array', () => {
    const keyedJson = `{
  "chapter_1": { "title": "Chapter 1", "summary": "Summary 1" },
  "chapter_2": { "title": "Chapter 2", "summary": "Summary 2" }
}`;

    const result = parseChapterPlanJson(keyedJson);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe('Chapter 1');
  });

  it('extracts markdown code block surrounded by conversational text', () => {
    const markdownWithChatter = `Here is your requested chapter plan:

\`\`\`json
{
  "chapters": [
    { "title": "Chapter 1", "summary": "Summary 1" }
  ]
}
\`\`\`

Let me know if you would like me to adjust any scene!`;

    const result = parseChapterPlanJson(markdownWithChatter);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].title).toBe('Chapter 1');
  });
});

describe('parserUtils - Character Name Validation and Cleansing', () => {
  it('identifies and rejects conversational filler, meta prompts, and placeholders', () => {
    expect(isValidCharacterName('I understand the task')).toBe(false);
    expect(isValidCharacterName('I understand')).toBe(false);
    expect(isValidCharacterName('I will extract')).toBe(false);
    expect(isValidCharacterName("I'll return the characters")).toBe(false);
    expect(isValidCharacterName('CHARACTER NAME')).toBe(false);
    expect(isValidCharacterName('Character Name:')).toBe(false);
    expect(isValidCharacterName('Main Characters')).toBe(false);
    expect(isValidCharacterName('Protagonist')).toBe(false);
    expect(isValidCharacterName('Note')).toBe(false);
    expect(isValidCharacterName('Here is the list of characters')).toBe(false);
    expect(isValidCharacterName('Please provide')).toBe(false);
    expect(isValidCharacterName('I understand the task and will now extract each character from the outline')).toBe(false);
  });

  it('accepts valid fictional character names in diverse formats', () => {
    expect(isValidCharacterName('Delilah Vance')).toBe(true);
    expect(isValidCharacterName('Marcus')).toBe(true);
    expect(isValidCharacterName('Dr. Jekyll')).toBe(true);
    expect(isValidCharacterName('The Blind Monk')).toBe(true);
    expect(isValidCharacterName('Jean-Luc Picard')).toBe(true);
    expect(isValidCharacterName('Алексей')).toBe(true);
  });

  it('cleans candidate names from markdown and list numbering', () => {
    expect(cleanCharacterCandidateName('1. **Delilah Vance**')).toBe('Delilah Vance');
    expect(cleanCharacterCandidateName('- *Marcus* :')).toBe('Marcus');
    expect(cleanCharacterCandidateName('### Elena:')).toBe('Elena');
  });

  it('extracts character pairs while skipping conversational filler', () => {
    const rawLlmOutput = `I understand the task: Here is the character extraction from the outline.
CHARACTER NAME: Detailed physical description, core personality traits.

Delilah Vance: A former detective turned rogue investigator with a sharp mind.
- **Marcus**: The stoic barkeep who knows the secrets of the underground.
Note: These characters represent the core conflict.
`;

    const matches = findCharacterMatches(rawLlmOutput);
    expect(matches).toHaveLength(2);
    expect(matches[0][0]).toBe('Delilah Vance');
    expect(matches[0][1]).toContain('former detective');
    expect(matches[1][0]).toBe('Marcus');
    expect(matches[1][1]).toContain('stoic barkeep');
  });

  it('extractCharactersFromString gracefully filters out meta-filler from LLM responses', async () => {
    const mockOutline = `STORY PREMISE: Sci-fi noir.
MAIN CHARACTERS
Delilah Vance: Cybernetic investigator searching for her brother.
Marcus Kane: Underworld fixer with conflicting loyalties.

CHAPTER BREAKDOWN:
Chapter 1: The Alley`;

    const mockLlmFallback = async () => `I understand the task: Here are the characters.
CHARACTER NAME: Prototype description.
Delilah Vance: Cybernetic investigator searching for her brother.
Marcus Kane: Underworld fixer with conflicting loyalties.
I hope this character list helps with the story!`;

    const characters = await extractCharactersFromString(mockOutline, mockLlmFallback);
    const names = Object.keys(characters);

    expect(names).toContain('Delilah Vance');
    expect(names).toContain('Marcus Kane');
    expect(names).not.toContain('I understand the task');
    expect(names).not.toContain('CHARACTER NAME');
    expect(names).not.toContain('Note');
    expect(names.length).toBe(2);
  });
});

describe('parserUtils - Chapter Analysis Parsing & Pseudo-JSON Recovery', () => {
  it('sanitizes placeholder ellipses [...] and {...} that crash standard JSON.parse', () => {
    // Simulates the exact user bug:
    // AI outputs "Events": [...] or "characterMoments": [ ... ]
    const rawAiResponse = `{
      "summary": "Elena confronts the perimeter security and escapes into the underbelly.",
      "timeElapsed": "2 hours",
      "endTimeOfChapter": "Dusk",
      "specificMarkers": "6:00 PM bells",
      "primaryEmotion": "Suspense",
      "tensionLevel": 7,
      "unresolvedHook": "Who sent the warning cipher?",
      "pacingScore": 8,
      "dialogueRatio": 40,
      "wordCount": 4200,
      "keyEvents": [...],
      "Events": [ ... ],
      "characterMoments": [...],
      "foreshadowing": ["The broken seal", ...]
    }`;

    const sanitized = sanitizeJsonPlaceholders(rawAiResponse);
    expect(() => JSON.parse(sanitized)).not.toThrow();

    const parsed = JSON.parse(sanitized);
    expect(parsed.keyEvents).toEqual([]);
    expect(parsed.Events).toEqual([]);
    expect(parsed.characterMoments).toEqual([]);
    expect(parsed.foreshadowing).toEqual(['The broken seal']);
  });

  it('parseChapterAnalysisJson successfully recovers analysis even with malformed [...] arrays', () => {
    const rawAiResponse = `{
      "summary": "Elena enters the forbidden archives.",
      "tensionLevel": 8,
      "pacingScore": 7,
      "Events": [...],
      "characterMoments": [...]
    }`;

    const result = parseChapterAnalysisJson(rawAiResponse, {
      chapterNumber: 2,
      plannedTitle: "The Forbidden Archives",
      chapterContent: "Elena stepped through the archway...",
      plannedSummary: "Elena searches the archives."
    });

    expect(result.summary).toBe("Elena enters the forbidden archives.");
    expect(result.tensionLevel).toBe(8);
    expect(result.pacingScore).toBe(7);
    expect(result.keyEvents).toEqual([]);
  });

  it('parseChapterAnalysisJson gracefully falls back when response is total gibberish without crashing', () => {
    const gibberish = "I cannot analyze this right now. Please try again.";

    const result = parseChapterAnalysisJson(gibberish, {
      chapterNumber: 2,
      plannedTitle: "The Forbidden Archives",
      chapterContent: "Elena walked slowly into the darkness. She held her breath.",
      plannedSummary: "Elena enters the archives."
    });

    expect(result.summary).toBe("Elena enters the archives.");
    expect(result.tensionLevel).toBe(6);
    expect(result.wordCount).toBe(10);
    expect(result.keyEvents).toEqual([]);
  });
});



