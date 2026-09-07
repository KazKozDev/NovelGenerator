import { describe, it, expect } from 'vitest';
import {
  cleanJsonString,
  safeJsonParse,
  cleanProseArtifacts,
  parseEvaluationResponse
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
