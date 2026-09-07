import { describe, it, expect } from 'vitest';
import { cleanJsonString, safeJsonParse } from '../utils/parserUtils';

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
