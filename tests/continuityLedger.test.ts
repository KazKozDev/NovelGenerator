import { describe, expect, it } from 'vitest';
import { claimTopics, extractionWindows, readClaims, readTopic, sourceUnits, topicContext, type LedgerClaim } from '../utils/novel/v3/continuityLedger';

const passages = [{ id: 'p1', text: 'She took the scarf, and she left it on the chair.' }, { id: 'p2', text: 'She recalled the scarf in her bag.' }, { id: 'p3', text: 'Later she admitted lying.' }];
const units = sourceUnits(passages);
const raw = { entity: 'scarf', facet: 'location', value: 'with Nora', when: 'departure', event: 'departure', source: 'event', holder: 'narrator', refs: [units[0].id] };
const claims = readClaims(JSON.stringify({ claims: [raw, { ...raw, value: 'on chair', refs: [units[1].id] }, { ...raw, value: 'in bag', source: 'thought', holder: 'Nora', refs: [units[2].id] }] }), units, 'w1').claims;

describe('source-backed assertion ledger', () => {
  it('keeps exact character offsets and separates conflicting clauses of one sentence', () => {
    expect(units.filter(u => u.passage === 'p1')).toHaveLength(2);
    for (const u of units) expect(passages.find(p => p.id === u.passage)!.text.slice(u.start, u.end)).toBe(u.text);
    expect(claims).toHaveLength(3);
    expect(claims[2].source).toBe('thought');
    expect(claims[0].value).not.toBe(claims[1].value);
  });
  it('covers all paragraphs once without splitting oversized source paragraphs', () => {
    const windows = extractionWindows(passages, 2);
    expect(windows.flat().map(p => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(windows[0]).toEqual([passages[0]]);
  });
  it('does not commit a claim referring to an invented source', () => {
    const result = readClaims(JSON.stringify({ claims: [raw, { ...raw, refs: ['invented'] }] }), units, 'w1');
    expect(result.claims).toHaveLength(1); expect(result.rejected).toHaveLength(1);
  });
  it('preserves a source-kind spelling in the facet field without making a belief a fact', () => {
    const result = readClaims(JSON.stringify({ claims: [{ ...raw, facet: 'thought', source: 'thought' }, { ...raw, facet: 'speech', source: 'speech' }] }), units, 'w1');
    expect(result.claims.map(c => [c.facet, c.source])).toEqual([['belief', 'thought'], ['utterance', 'speech']]);
    expect(result.rejected).toEqual([]);
    expect(readClaims(JSON.stringify({ claims: [{ ...raw, facet: 'thought', source: 'event' }] }), units, 'w1').rejected).toHaveLength(1);
  });
  it('groups differing assertions without treating differences as errors or merging distinct objects', () => {
    const distinct: LedgerClaim = { ...claims[0], id: 'other', entity: 'second scarf' };
    expect(claimTopics([...claims, distinct])).toHaveLength(1);
    expect(claimTopics([...claims, distinct])[0].claims).toHaveLength(3);
  });
  it('retrieves later source context instead of judging from the extracted records alone', () => {
    const context = topicContext(claimTopics(claims)[0], passages, units);
    expect(context.passages.map(p => p.id)).toContain('p3');
  });
  it('links an actor taking an object to its state recorded under a different entity key', () => {
    const actor = { ...claims[0], id: 'actor', entity: 'nora', facet: 'action', value: 'took the scarf' };
    const object = { ...claims[1], id: 'object', entity: 'scarf' };
    const topic = claimTopics([actor, object]).find(t => t.entity === 'scarf')!;
    expect(topic.claims.map(c => c.id)).toEqual(['object', 'actor']);
  });
  it('copies primary source evidence automatically and rejects invented extra context', () => {
    const topic = claimTopics(claims)[0];
    const finding = { verdict: 'error', claim_ids: claims.slice(0, 2).map(c => c.id), evidence_ids: units.slice(0, 2).map(u => u.id), reason: 'The same departure takes and leaves the same scarf.' };
    const result = readTopic(JSON.stringify({ findings: [{ ...finding, evidence_ids: [] }, { ...finding, evidence_ids: ['invented'] }] }), topic, units);
    expect(result.findings[0].evidence).toEqual(units.slice(0, 2));
    expect(result.rejected).toHaveLength(1);
    expect(() => readTopic('{}', topic, units)).toThrow();
  });
  it('keeps indexing errors separate and does not accept a story accusation based on them', () => {
    const topic = claimTopics(claims)[0];
    const report = readTopic(JSON.stringify({ index_errors: [{ claim_ids: [claims[0].id], evidence_ids: [units[0].id], reason: 'The archivist assigned the action to the wrong person.' }],
      findings: [{ verdict: 'error', claim_ids: claims.slice(0, 2).map(c => c.id), evidence_ids: units.slice(0, 2).map(u => u.id), reason: 'Conflicting locations.' }] }), topic, units);
    expect(report.index_errors).toHaveLength(1);
    expect(report.findings).toEqual([]);
    expect(report.rejected).toHaveLength(1);
  });
});
