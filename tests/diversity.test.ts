import { describe, expect, it } from 'vitest';
import {
  BESTSELLER_REQUIREMENTS,
  SAMPLING,
  STRUCTURE_BANS,
  bestsellerAdvisory,
  buildIdeaSeed,
  hookScore,
  ideaSeedPrompt,
  isRecapEnding,
  jaccardVocabulary,
  languageContract,
  planNoveltyScore,
  uniqueNgramRatio,
} from '../utils/novel/diversity';

describe('diversity pipeline', () => {
  it('separates sampling by role: planners invent, validators judge', () => {
    expect(SAMPLING.outline).toBeGreaterThanOrEqual(0.9);
    expect(SAMPLING.chapterPlan).toBeGreaterThanOrEqual(0.85);
    expect(SAMPLING.validator).toBeLessThanOrEqual(0.2);
    expect(SAMPLING.prose).toBeGreaterThan(SAMPLING.repair);
  });

  it('builds deterministic idea seeds that rotate scene shapes', () => {
    const first = buildIdeaSeed(0);
    expect(buildIdeaSeed(0)).toEqual(first);
    expect(first.genreMix.length).toBeGreaterThan(0);
    expect(buildIdeaSeed(1).sceneShape).not.toBe(buildIdeaSeed(0).sceneShape);
    expect(ideaSeedPrompt(first)).toContain(first.sceneShape);
  });

  it('keeps every prompt block English-only', () => {
    for (const block of [STRUCTURE_BANS, BESTSELLER_REQUIREMENTS, languageContract('English')]) {
      expect(block).not.toMatch(/[а-яё]/i);
    }
    expect(languageContract()).toContain('English');
    expect(languageContract('German')).toContain('German');
  });

  it('measures phrasing originality with unique n-grams', () => {
    const varied = 'The harbor bell rang once across the cold water while gulls scattered over the lighthouse stairs.';
    const looped = 'He walked in. He walked in. He walked in. He walked in. He walked in. He walked in.';
    expect(uniqueNgramRatio(varied)).toBeGreaterThan(uniqueNgramRatio(looped));
    expect(uniqueNgramRatio('')).toBe(1);
  });

  it('scores plan novelty against previous plans', () => {
    expect(planNoveltyScore('a lighthouse trial during a blackout', [])).toBe(1);
    const near = planNoveltyScore('a lighthouse trial during a blackout', ['a lighthouse trial during a blackout']);
    const far = planNoveltyScore('a desert heist with a radio host', ['a lighthouse trial during a blackout']);
    expect(far).toBeGreaterThan(near);
    expect(jaccardVocabulary('same words here', 'same words here')).toBeCloseTo(1);
  });

  it('flags weak hooks and recap endings for the bestseller check', () => {
    const hooked = 'Run! Mara shouted, grabbing the ledger as the alarm tore through the market. Who took the missing drawer?';
    const flat = 'It was a quiet morning in the village. There was a house near the hill. The day passed slowly without events.';
    expect(hookScore(hooked)).toBeGreaterThanOrEqual(5);
    expect(hookScore(flat)).toBeLessThan(5);
    expect(isRecapEnding(`${'Body paragraph with action.\n\n'}In summary, this shows what everything meant.`)).toBe(true);
    expect(isRecapEnding('She closed the ledger and ran for the train.')).toBe(false);
  });

  it('reports bestseller findings as advisory only, never as review issues', () => {
    expect(bestsellerAdvisory('')).toEqual([]);
    const flat = 'It was a quiet morning in the village. There was a house near the hill.\n\nIn summary, this shows what everything meant.';
    expect(bestsellerAdvisory(flat).map(finding => finding.id).sort()).toEqual(['recap-ending', 'weak-opening-hook']);
    const strong = 'Run! Mara shouted, grabbing the ledger as the alarm tore through the market. She closed the ledger and ran for the train.';
    expect(bestsellerAdvisory(strong)).toEqual([]);
  });
});
