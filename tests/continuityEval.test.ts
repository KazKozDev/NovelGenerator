import { describe, expect, it } from 'vitest';
import { assessContinuity, assessmentPrompt, readAssessment, scoreContinuity, type ContinuityAssessment } from '../utils/novel/v3/continuityEval';
import { continuityCases } from './fixtures/continuityCases';

const passages = [{ id: 'A', text: 'The key stayed in the box.' }, { id: 'B', text: 'The same key was in her bag.' }];
const assessment: ContinuityAssessment = { verdict: 'error', evidence: [
  { passage: 'A', quote: 'key stayed in the box', source: 'narration' },
  { passage: 'B', quote: 'key was in her bag', source: 'narration' },
], reason: 'The same key has incompatible locations.' };

describe('offline continuity evaluation', () => {
  it('requires evidence in its actual source, including for non-error verdicts', () => {
    expect(readAssessment(JSON.stringify(assessment), passages)).toEqual(assessment);
    for (const verdict of ['error', 'explained', 'uncertain']) {
      expect(() => readAssessment(JSON.stringify({ ...assessment, verdict, evidence: [{ ...assessment.evidence[0], quote: 'invented quote' }, assessment.evidence[1]] }), passages)).toThrow('source');
    }
    expect(() => readAssessment(JSON.stringify({ ...assessment, evidence: [assessment.evidence[0], assessment.evidence[0]] }), passages)).toThrow('same quote');
    expect(() => readAssessment(JSON.stringify({ ...assessment, evidence: [{ ...assessment.evidence[0], passage: 'B' }, assessment.evidence[1]] }), passages)).toThrow('source');
  });
  it('allows two different quotes within one paragraph', () => {
    const source = [{ id: 'A', text: 'The key stayed in the box. The same key was in her bag.' }];
    const reply = { ...assessment, evidence: assessment.evidence.map(e => ({ ...e, passage: 'A' })) };
    expect(readAssessment(JSON.stringify(reply), source).verdict).toBe('error');
  });
  it('rejects a correct verdict supported by a shortened rather than exact quotation', () => {
    const fixture = continuityCases.find(c => c.id === 'nora-alibi-admitted')!;
    const reply = { verdict: 'explained', reason: 'Nora explicitly admits lying.', evidence: [
      { passage: 'ch4-alibi', quote: fixture.passages[1].text, source: 'speech' },
      { passage: 'ch5-admission', quote: '*Because I lied,* Nora said. *Because I\'ve been lying since October...*', source: 'speech' },
    ] };
    expect(() => readAssessment(JSON.stringify(reply), fixture.passages)).toThrow('source');
  });
  it('does not leak labels or human explanations to the judge', async () => {
    let calls = 0;
    await assessContinuity(passages, async (prompt, system, options) => {
      calls++;
      expect(prompt).toBe(assessmentPrompt(passages));
      expect(prompt).not.toContain('expected');
      expect(system).toContain('Do not invent a lie');
      expect(options?.stage).toBe('continuity-eval');
      return JSON.stringify(assessment);
    });
    expect(calls).toBe(1);
    for (const fixture of continuityCases) expect(assessmentPrompt(fixture.passages)).not.toContain(fixture.rationale);
  });
  it('records failed readings as unavailable, without silently retrying', async () => {
    let calls = 0;
    await expect(assessContinuity(passages, async () => { calls++; throw new Error('token limit'); })).rejects.toThrow('token limit');
    expect(calls).toBe(1);
  });
  it('does not equate missing answers or abstentions with clean books', () => {
    const score = scoreContinuity([
      { id: 'hit', expected: 'error', assessment },
      { id: 'false-alarm', expected: 'explained', assessment },
      { id: 'abstain', expected: 'error', assessment: { ...assessment, verdict: 'uncertain' } },
      { id: 'failed', expected: 'error', error: 'token limit' },
    ]);
    expect(score).toMatchObject({ total: 4, valid: 3, unavailable: 1, correct: 1, precision: 0.5, recall: 1 / 3, accuracy: 0.25, false_positives: 1, missed_errors: 2, uncertain: 1 });
    expect(scoreContinuity([]).accuracy).toBeNull();
    expect(scoreContinuity([{ id: 'failed', expected: 'explained', error: 'offline' }]).precision).toBeNull();
  });
  it('rejects malformed answers and ambiguous source identifiers', () => {
    for (const bad of ['{}', '{', JSON.stringify({ ...assessment, verdict: 'clean' }), JSON.stringify({ ...assessment, reason: '' }), JSON.stringify({ ...assessment, evidence: [] })])
      expect(() => readAssessment(bad, passages)).toThrow();
    expect(() => assessmentPrompt([passages[0], passages[0]])).toThrow('unique');
  });
});
