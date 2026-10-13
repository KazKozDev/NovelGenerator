import { describe, expect, it } from 'vitest';
import { extractionCases } from './fixtures/extractionCases';
import { sourceUnits, type LedgerClaim } from '../utils/novel/v3/continuityLedger';
import { adaptExtraction, scoreExtraction } from '../utils/novel/v3/extractionEval';

describe('extraction attribution benchmark', () => {
  it('adapts absent timing without promoting a speech source or inventing its holder', () => {
    const data = JSON.parse(adaptExtraction(JSON.stringify({ claims: [
      { source: 'speech', entity: 'nora', holder: null, when: null, event: null },
      { source: 'event', entity: 'paul', holder: null, when: null, event: null },
    ] })));
    expect(data.claims[0]).toEqual({ source: 'speech', entity: 'nora', holder: null, when: 'unknown', event: 'unknown' });
    expect(data.claims[1].holder).toBe('narrator');
  });
  it('finds every frozen gold anchor in its source', () => {
    for (const c of extractionCases) expect(scoreExtraction(c.passages, sourceUnits(c.passages), [], c.targets).missing).toBe(c.targets.length);
  });
  it('counts a spoken assertion promoted to narration even if a correct duplicate exists', () => {
    const c = extractionCases[0], units = sourceUnits(c.passages);
    const refs = units.filter(u => u.text.includes('I was')).map(u => u.id);
    const speech: LedgerClaim = { id: 's', entity: 'nora', facet: 'location', value: 'office at noon', when: 'noon', event: 'alibi', source: 'speech', holder: 'nora', refs };
    const result = scoreExtraction(c.passages, units, [speech, { ...speech, id: 'bad', source: 'narration', holder: 'narrator' }], c.targets);
    expect(result.correct).toBe(1); expect(result.missing).toBe(1); expect(result.promoted_to_fact).toBe(1);
  });
  it('keeps entity and speaker attribution errors distinct', () => {
    const c = extractionCases[1], units = sourceUnits(c.passages);
    const claim: LedgerClaim = { id: 's', entity: 'claire', facet: 'ownership', value: 'house', when: 'unknown', event: 'unknown', source: 'speech', holder: 'nora', refs: units.filter(u => u.text.includes('I own the house')).map(u => u.id) };
    const score = scoreExtraction(c.passages, units, [claim], c.targets);
    expect(score.wrong_entity).toBe(1); expect(score.correct).toBe(0);
    const holder = scoreExtraction(c.passages, units, [{ ...claim, entity: 'nora', holder: 'claire' }], c.targets);
    expect(holder.wrong_entity).toBe(0); expect(holder.wrong_holder).toBe(1);
  });
  it('refuses ambiguous gold anchors instead of grading an arbitrary occurrence', () => {
    expect(() => scoreExtraction([{ id: 'A', text: 'One. One.' }], [], [], [{ anchor: 'One.', entities: ['nora'], sources: ['event'], holders: ['narrator'] }])).toThrow('repeated');
  });
});
