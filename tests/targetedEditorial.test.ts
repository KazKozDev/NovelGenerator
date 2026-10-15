import { describe, expect, it } from 'vitest';
import {
  findTargetChapter,
  buildTargetedRepairPrompt,
  parseRepairJson,
  repairSingleFinding,
} from '../utils/novel/targetedEditorial';

describe('targetedEditorial', () => {
  const chapters = [
    { num: 1, content: 'Bruce was wearing a green coat. He walked to the car.' },
    { num: 2, content: 'Clark held the log in his hands. He opened the drawer.' },
    { num: 3, content: 'The rain fell on the roof. Clark spoke into the phone.' },
  ];

  it('finds target chapter from evidence_refs', () => {
    const finding = {
      description: 'The coat color changed inexplicably.',
      evidence_refs: ['chapter-1: Bruce was wearing a green coat.'],
    };
    expect(findTargetChapter(finding, chapters)).toBe(1);
  });

  it('finds target chapter from description when evidence_refs is empty', () => {
    const finding = {
      description: 'In Chapter 2, Clark never explains where the log came from.',
      evidence_refs: [],
    };
    expect(findTargetChapter(finding, chapters)).toBe(2);
  });

  it('picks the later chapter when two chapters contradict each other', () => {
    const finding = {
      description: 'Conflict between coat in chapter 1 and chapter 3.',
      evidence_refs: ['chapter-1: green coat', 'chapter-3: blue coat'],
    };
    expect(findTargetChapter(finding, chapters)).toBe(3);
  });

  it('parses JSON responses with and without code fences', () => {
    const direct = '{"changed": true, "explanation": "Fixed", "text": "New text"}';
    expect(parseRepairJson(direct)).toEqual({ changed: true, explanation: 'Fixed', text: 'New text' });

    const fenced = '```json\n{"changed": true, "explanation": "Fixed fenced", "text": "Fenced text"}\n```';
    expect(parseRepairJson(fenced)).toEqual({ changed: true, explanation: 'Fixed fenced', text: 'Fenced text' });

    const braced = 'Here is the fix: {"changed": false, "explanation": "Already good"} thanks';
    expect(parseRepairJson(braced)).toEqual({ changed: false, explanation: 'Already good' });

    expect(parseRepairJson('invalid json string')).toBeNull();
  });

  it('builds a focused prompt containing the finding and chapter prose', () => {
    const finding = {
      category: 'Causality',
      severity: 'major',
      description: 'The log is missing an origin.',
      evidence_refs: ['chapter-2: Clark held the log'],
    };
    const { prompt, system } = buildTargetedRepairPrompt(finding, 2, chapters[1].content);
    expect(prompt).toContain('EDITORIAL FINDING TO FIX:');
    expect(prompt).toContain('The log is missing an origin.');
    expect(prompt).toContain('chapter-2: Clark held the log');
    expect(prompt).toContain('CURRENT CHAPTER 2 PROSE:');
    expect(prompt).toContain(chapters[1].content);
    expect(system).toContain('minimal, surgical edits');
  });

  it('repairs a single finding and updates the manuscript', async () => {
    const manuscript = '# Test Novel\n\n## Chapter 1\n\n' + chapters[0].content + '\n\n## Chapter 2\n\n' + chapters[1].content;
    const finding = {
      description: 'Clark needs to look at the desk before opening the drawer.',
      evidence_refs: ['chapter-2: Clark held the log in his hands.'],
    };

    const mockLlm = async (p: string) => {
      expect(p).toContain('Clark needs to look at the desk');
      return JSON.stringify({
        changed: true,
        explanation: 'Added gaze toward the desk first',
        text: 'Clark looked at the desk, then held the log in his hands. He opened the drawer.',
      });
    };

    const result = await repairSingleFinding(finding, manuscript, 'Test Novel', mockLlm);
    expect(result.changed).toBe(true);
    expect(result.chapterNumber).toBe(2);
    expect(result.explanation).toBe('Added gaze toward the desk first');
    expect(result.updatedManuscript).toContain('Clark looked at the desk, then held the log');
    expect(result.updatedManuscript).toContain('Bruce was wearing a green coat');
  });

  it('parses author model tag from run_log or metadata', async () => {
    const { parseModelConfigFromTag, formatModelDisplayLabel } = await import('../utils/novel/targetedEditorial');

    const deepseekTag = 'author: ollama:deepseek-v4.1-flash:cloud · reader: huggingface:XiaomiMiMo/MiMo-V2.5-Pro';
    const parsed = parseModelConfigFromTag(deepseekTag);
    expect(parsed).toEqual({
      provider: 'ollama',
      ollamaModel: 'deepseek-v4.1-flash:cloud',
      ollamaEndpoint: '/api/ollama',
    });
    expect(formatModelDisplayLabel(parsed!)).toBe('DeepSeek (deepseek-v4.1-flash:cloud)');

    const qwenTag = 'author: qwen:qwen3.8-flash · reader: the author\'s own';
    const parsedQwen = parseModelConfigFromTag(qwenTag);
    expect(parsedQwen).toEqual({
      provider: 'qwen',
      qwenModel: 'qwen3.8-flash',
    });
    expect(formatModelDisplayLabel(parsedQwen!)).toBe('Qwen: qwen3.8-flash');
  });
});

