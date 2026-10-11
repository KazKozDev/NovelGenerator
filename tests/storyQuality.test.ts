import { describe, expect, it } from 'vitest';
import { duplicateParagraphs, QUALITY_KEYS, STORY_QUALITY, validateQualityChecks } from '../utils/novel/v2/storyQuality';
describe('story quality evidence', () => {
  it('covers all seventeen supplied defects in addition to continuity checks', () => {
    expect(Object.keys(STORY_QUALITY)).toHaveLength(17);
    expect(new Set(QUALITY_KEYS).size).toBe(20);
  });
  it('finds exact long paragraph replay across and within blocks', () => {
    const paragraph = Array.from({ length: 35 }, (_, i) => `word${i}`).join(' ');
    expect(duplicateParagraphs([{ thesis_id: 'T1', text: paragraph }, { thesis_id: 'T2', text: paragraph + '\n\n' + paragraph }])).toHaveLength(2);
  });
  it('normalizes whitespace but preserves case, wording and brief intentional refrains', () => {
    expect(duplicateParagraphs([{ thesis_id: 'T1', text: 'Never again.' }, { thesis_id: 'T2', text: 'Never again.' }])).toEqual([]);
    const p = Array.from({ length: 31 }, (_, i) => `word${i}`).join(' ');
    expect(duplicateParagraphs([{ thesis_id: 'T1', text: p }, { thesis_id: 'T2', text: p.replaceAll(' ', '  ') }])).toHaveLength(1);
  });
});

it('rejects optimistic audits that omit criteria or provide blank evidence', () => {
  const checks = Object.fromEntries(QUALITY_KEYS.map(key => [key, { passed: true, evidence: 'T01 clue tested in T04' }]));
  expect(validateQualityChecks(checks)).toBe(checks);
  delete checks.resolution;
  expect(() => validateQualityChecks(checks)).toThrow('resolution');
  checks.resolution = { passed: false, evidence: ' ' };
  expect(() => validateQualityChecks(checks)).toThrow('resolution');
});
