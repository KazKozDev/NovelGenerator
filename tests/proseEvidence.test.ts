import { expect, it } from 'vitest';
import { proseEvidence, resolveProseEvidence } from '../utils/novel/v2/proseEvidence';
it('assigns review-local addresses without changing quotation spelling or whitespace', () => {
  const prose = 'Claire said “Nora.”\nA second line.\n\n  She was uncertain.  ';
  expect(proseEvidence(prose).annotated).toContain('@P0002\n  She was uncertain.  ');
  expect(resolveProseEvidence('@P0001', prose)).toBe('Claire said “Nora.”\nA second line.');
  expect(resolveProseEvidence('  @P0002 ', prose)).toBe('  She was uncertain.  ');
  expect(resolveProseEvidence('@P0003', prose)).toBeUndefined();
  expect(resolveProseEvidence('A paraphrase', prose)).toBe('A paraphrase');
});
