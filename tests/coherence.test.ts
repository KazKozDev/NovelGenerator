import { describe, expect, it } from 'vitest';
import {
  COHERENCE_RULES,
  PLANNING_COHERENCE,
  REVIEW_COHERENCE,
  recurrentMotifs,
  rhythmDrift,
} from '../utils/novel/coherence';

const long = (words: number, seed: string): string =>
  Array.from({ length: words }, (_, index) => `${seed}-${index}`).join(' ') + '.';

describe('coherence detectors', () => {
  it('keeps every prompt block English-only', () => {
    for (const block of [COHERENCE_RULES, PLANNING_COHERENCE, REVIEW_COHERENCE]) {
      expect(block).not.toMatch(/[а-яё]/i);
    }
  });

  it('makes the staging line answer what a character can do, not only what they can see', () => {
    expect(PLANNING_COHERENCE).toMatch(/physical conditions constrain action/);
    expect(PLANNING_COHERENCE).toMatch(/if a planned moment requires an act those conditions forbid/i);
    expect(COHERENCE_RULES).toMatch(/PERSISTING CONDITIONS/);
    expect(COHERENCE_RULES).toMatch(/FIXED QUANTITIES/);
  });

  it('gives the review the four defects a sentence-level check cannot see', () => {
    for (const dimension of [/persisting physical conditions/, /quantities that keep their value/,
      /proper names spelled exactly/, /holds the contract's tense/, /defining it by what it is not/]) {
      expect(REVIEW_COHERENCE).toMatch(dimension);
    }
  });

  it('flags a refrain circled three times across distinct sentences', () => {
    const content = [
      'He woke with the taste of ash on his tongue and stared at the ceiling.',
      'The letter brought the taste of ash on his tongue back before noon.',
      'Even the wine could not wash the taste of ash on his tongue away.',
    ].join(' ');
    const findings = recurrentMotifs(content);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].sentences).toBe(3);
    expect(findings[0].quotes).toHaveLength(2);
  });

  it('stays silent at two uses and on stopword glue', () => {
    const twice = [
      'He woke with the taste of ash on his tongue and stared at the ceiling.',
      'The letter brought the taste of ash on his tongue back before noon.',
      'The harbor bell rang once across the cold water at dawn.',
    ].join(' ');
    expect(recurrentMotifs(twice)).toEqual([]);
    const glue = [
      'And then he went to the market early in the morning.',
      'And then he went to the harbor late in the evening.',
      'And then he went to the chapel alone before the service.',
    ].join(' ');
    expect(recurrentMotifs(glue)).toEqual([]);
  });

  it('detects rhythmic collapse toward the climax', () => {
    const opening = Array.from({ length: 4 }, (_, i) => long(20, `open${i}`)).join(' ');
    const middle = Array.from({ length: 4 }, (_, i) => long(15, `mid${i}`)).join(' ');
    const closing = 'He ran fast. The door slammed hard. No light anywhere. He held his breath.';
    const report = rhythmDrift(`${opening} ${middle} ${closing}`);
    expect(report.sentences).toBe(12);
    expect(report.firstMedian).toBeGreaterThanOrEqual(14);
    expect(report.lastMedian).toBeLessThanOrEqual(10);
    expect(report.drifted).toBe(true);
  });

  it('passes sustained rhythm and short texts', () => {
    const sustained = Array.from({ length: 12 }, (_, i) => long(15, `steady${i}`)).join(' ');
    expect(rhythmDrift(sustained).drifted).toBe(false);
    expect(rhythmDrift('Short opening. Quick middle. Abrupt end.').drifted).toBe(false);
  });
});
