import { describe, expect, it } from 'vitest';
import { reconcileEditorialFindings } from '../utils/novel/targetedEditorial';

const finding = { description: 'Timer inconsistent', evidence_refs: ['chapter-1: “Only five minutes remained.”'] };
const chapters = (content: string) => [{ num: 1, content }];

describe('live editorial evidence', () => {
  it('retains original evidence after edits and undo for semantic verification', () => {
    const report = [finding];
    expect(reconcileEditorialFindings(report, chapters('Only five minutes remained.'))).toEqual(report);
    expect(reconcileEditorialFindings(report, chapters('The timer was reset.'))).toEqual(report);
    expect(reconcileEditorialFindings(report, chapters('Only five minutes remained.'))).toEqual(report);
    expect(report).toHaveLength(1);
  });
  it('normalizes punctuation and whitespace', () => {
    expect(reconcileEditorialFindings([finding], chapters('Only five\n minutes remained.'))).toHaveLength(1);
  });
  it('keeps a finding while any evidence remains in its cited chapter', () => {
    const multiple = { ...finding, evidence_refs: [...finding.evidence_refs, 'chapter-2: The clock stopped.'] };
    expect(reconcileEditorialFindings([multiple], [{ num: 1, content: 'Revised.' }, { num: 2, content: 'The clock stopped.' }])).toHaveLength(1);
    expect(reconcileEditorialFindings([finding], [{ num: 2, content: 'Only five minutes remained.' }])).toEqual([finding]);
  });
  it('keeps findings without concrete evidence and supports legacy quotes', () => {
    expect(reconcileEditorialFindings([{ description: 'Review pacing' }], chapters('Revised.'))).toHaveLength(1);
    expect(reconcileEditorialFindings([{ description: 'Timer', quote: 'five minutes remained' }], chapters('Revised.'))).toHaveLength(1);
  });
});
