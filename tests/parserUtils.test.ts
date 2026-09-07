import { describe, it, expect } from 'vitest';
import {
  cleanJsonString,
  safeJsonParse,
  cleanProseArtifacts,
  parseEvaluationResponse,
  parseLenientJson,
  parseChapterPlanJson
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

