import type { Passage } from './continuityEval';
import type { LedgerClaim, SourceUnit } from './continuityLedger';
export interface ExtractionTarget { anchor: string; entities: string[]; sources: string[]; holders: string[] }
const key = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

/** NuExtract's documented absent values are null. This adapter never changes source or entity. */
export function adaptExtraction(answer: string): string {
  const data = JSON.parse(answer.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!Array.isArray(data?.claims)) throw new Error('Extraction needs claims.');
  return JSON.stringify({ ...data, claims: data.claims.map((c: Record<string, unknown>) => {
    if (!c || typeof c !== 'object') return c;
    return { ...c, when: c.when === null ? 'unknown' : c.when, event: c.event === null ? 'unknown' : c.event,
      holder: c.holder === null && (c.source === 'event' || c.source === 'narration') ? 'narrator' : c.holder };
  }) });
}

/** Source spans, accepted names and provenance are fixed manually; no LLM grades an LLM. */
export function scoreExtraction(passages: Passage[], units: SourceUnit[], claims: LedgerClaim[], targets: ExtractionTarget[]) {
  const rows = targets.map(target => {
    const spans = passages.flatMap(p => {
      const at = p.text.indexOf(target.anchor);
      if (at >= 0 && p.text.indexOf(target.anchor, at + 1) >= 0) throw new Error('Gold anchor is repeated: ' + target.anchor);
      return at < 0 ? [] : [{ passage: p.id, start: at, end: at + target.anchor.length }];
    });
    if (spans.length !== 1) throw new Error('Gold anchor must occur in exactly one passage: ' + target.anchor);
    const ids = new Set(units.filter(u => spans.some(s => s.passage === u.passage && u.start < s.end && u.end > s.start)).map(u => u.id));
    const cited = claims.filter(c => c.refs.some(r => ids.has(r)));
    const named = cited.filter(c => target.entities.map(key).includes(key(c.entity)));
    const correct = named.filter(c => target.sources.includes(c.source) && target.holders.map(key).includes(key(c.holder)));
    return { anchor: target.anchor, matched: correct.map(c => c.id), missing: !cited.length,
      wrong_entity: !!cited.length && !named.length,
      wrong_source: !!named.length && !named.some(c => target.sources.includes(c.source)),
      wrong_holder: !!named.length && !named.some(c => target.holders.map(key).includes(key(c.holder))),
      promoted_to_fact: !target.sources.some(s => s === 'event' || s === 'narration') && named.some(c => c.source === 'event' || c.source === 'narration'),
      candidates: cited.map(c => c.id), correct: !!correct.length };
  });
  return { targets: rows.length, correct: rows.filter(r => r.correct).length, missing: rows.filter(r => r.missing).length,
    wrong_entity: rows.filter(r => r.wrong_entity).length, wrong_source: rows.filter(r => r.wrong_source).length,
    wrong_holder: rows.filter(r => r.wrong_holder).length, promoted_to_fact: rows.filter(r => r.promoted_to_fact).length, rows };
}
