import { expect, it } from 'vitest';
import { readDiscovery } from '../utils/novel/v3/continuityDiscovery';
import { readPlotReview, auditFeedback } from '../utils/novel/v3/bookAudit';
const passages = [{ id: 'ch1:p1', text: 'Nora was forty-six.' }, { id: 'ch2:p1', text: 'At forty-six, Nora felt tired.' }, { id: 'ch3:p1', text: 'The witness admitted lying.' }];
const check = { status: 'refuted', same_entity: true, same_event: true, same_time: true, established_facts: true, incompatible: false, incompatibility: 'Both ages are 46.', explanation_refs: [] };
const candidate = { verdict: 'error', reason: 'Both ages agree; no contradiction.', check, evidence: passages.slice(0, 2).map(p => ({ passage: p.id, source: 'narration', quote: 'MODEL INVENTION' })) };
it('extracts sources in code and rejects the identical-age allegation without another reader', () => {
  const result = readDiscovery(JSON.stringify({ findings: [candidate] }), passages);
  expect(result.findings[0].status).toBe('refuted');
  expect(result.findings[0].verdict).toBe('explained');
  expect(result.findings[0].evidence[0].quote).toBe(passages[0].text);
});
it('keeps inconsistent confirmations and unsupported speech uncertain', () => {
  for (const patch of [{ incompatible: false }, { same_time: false }, { established_facts: false }, { explanation_refs: ['ch3:p1'] }]) {
    const result = readDiscovery(JSON.stringify({ findings: [{ ...candidate, check: { ...check, status: 'confirmed', incompatible: true, ...patch } }] }), passages);
    expect(result.findings[0].status).toBe('insufficient_data');
  }
});
it('rejects invented references and retains good assessments beside them', () => {
  const result = readDiscovery(JSON.stringify({ findings: [candidate, { ...candidate, evidence: [{ passage: 'missing' }] }] }), passages);
  expect(result.findings).toHaveLength(1);
  expect(result.rejected).toHaveLength(1);
});
it('keeps refuted findings visible in the report but out of repair feedback', () => {
  const review = readPlotReview(JSON.stringify({ findings: [candidate] }), passages, 'premise');
  expect(review.findings[0].certainty).toBe('refuted');
  const feedback = auditFeedback({ key: '', obligations: [], findings: review.findings, failures: [], calls: 4 });
  expect(feedback).not.toContain(candidate.reason);
});
