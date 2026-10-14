import { describe, expect, it } from 'vitest';
import { auditBook, auditKey, readObligations, readPlotFindings, readPlotReview, readObligationReview } from '../utils/novel/v3/bookAudit';
import { manuscriptPassages } from '../utils/novel/v3/continuityDiscovery';
import { readDrama } from '../utils/novel/v3/drama';
import { newDesk, recount, writeAtDesk } from '../utils/novel/v3/authorDesk';
import { authorKey } from '../utils/novel/v3/author';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import type { NovelLLM } from '../utils/novel/v2/llm';

const input = { premise: 'Claire frames Nora for her husband’s murder.', author_requirements: 'Closed ending.', genre: 'mystery', chapter_count: 2, target_total_words: 600 };
const shape = `TURN 1: Nora meets Julian
TURN 2: Nora discovers the trap
TURN 3: Nora tells the truth
STAKE 1: marriage | separation
STAKE 2: license | suspension
STAKE 3: freedom | accusation
QUESTION: who arranged it | Claire arranged it
GUN: keycard | keycard evidence | 1 | 2
FALSE: Nora believes herself safe | Nora is accused
IRONY: Claire knows | Nora trusts Claire | Nora discovers Claire knew
WANT: Nora keeps the affair
NEED: Nora faces her choices
DECISIVE: Nora testifies
LEARN 1: Julian is Claire's husband
LEARN 2: Claire arranged the murder`;
const first = 'At 3:35 Nora put her keycard in her bag and left. She took it home.';
const wrong = 'At 3:50 Desmond took the keycard Nora left on the desk. Claire was convicted.';
const fixed = 'At 3:50 Desmond used his own keycard. Claire was convicted.';
const files = { 'drama.md': shape, 'chapter-1.md': first, 'chapter-2.md': wrong };
const continuity = { verdict: 'error', check: { status: 'confirmed', same_entity: true, same_event: true, same_time: true, established_facts: true, incompatible: true, incompatibility: 'The single keycard leaves with Nora but remains on the desk.', explanation_refs: [] }, reason: 'The same keycard is taken home and left on the desk during the same visit.', evidence: [
  { passage: 'ch1:p1', quote: 'Nora put her keycard in her bag and left.', source: 'narration' },
  { passage: 'ch2:p1', quote: 'Desmond took the keycard Nora left on the desk.', source: 'narration' },
] };
const cleanResponses: NovelLLM = async (prompt, _system, options) => {
  if (options?.stage === 'premise-plan') return '{"verdict":"faithful","reason":"The fixture plan preserves the premise.","issues":[]}';
  if (options?.stage === 'book-obligations') {
    const debts = JSON.parse(prompt.split('OBLIGATIONS: ')[1].split('\nMANUSCRIPT: ')[0]);
    const passages = JSON.parse(prompt.split('MANUSCRIPT: ')[1]);
    return JSON.stringify({ obligations: debts.map((d: any) => {
      const p = passages.find((p: any) => p.id.startsWith(`ch${d.from}:`));
      const last = passages.find((p: any) => p.id.startsWith(`ch${d.to}:`));
      return { id: d.id, verdict: 'met', reason: 'Fixture verdict with validated scene evidence.', evidence: [{ passage: p.id, quote: p.text.split('.')[0] }, ...(d.kind === 'irony' ? [{ passage: p.id, quote: p.text }] : []), { passage: last.id, quote: last.text }] };
    }) });
  }
  return '{"findings":[]}';
};
function seed(second = wrong) {
  const store = new MemoryProjectStore(), desk = newDesk(2);
  desk.files = { ...desk.files, ...files, 'chapter-2.md': second };
  store.saveAuthor({ version: 1, input_key: authorKey(input), clock: '', plan: '', chapters: [], waiting: '', noticed: [], completed: false, desk });
  return { store, desk };
}
const command = (tool: string, file = '', content = '') => `THOUGHT: Continue.\nTOOL: ${tool}\nFILE: ${file}\n---\n${content}`;

describe('scene evidence and reserved final book checks', () => {
  it('accepts different scene words and rejects invented evidence or editorial declarations', () => {
    const held = readDrama('TURN 1: she retrieves the brass key', 2).held;
    const passages = manuscriptPassages([{ chapter: 1, text: 'She lifted the toothed sliver from the hook.' }]);
    const item = { id: 'd1', verdict: 'met', reason: 'The scene enacts the retrieval without copying its description.', evidence: [{ passage: 'ch1:p1', quote: passages[0].text }] };
    expect(readObligations(JSON.stringify({ obligations: [item] }), passages, held)[0].verdict).toBe('met');
    expect(() => readObligations(JSON.stringify({ obligations: [{ ...item, evidence: [{ passage: 'ch1:p1', quote: 'She retrieves the brass key.' }] }] }), passages, held)).toThrow('source');
    const meta = [{ id: 'ch1:p1', text: 'The question the book is asking is who killed him.' }];
    expect(() => readObligations(JSON.stringify({ obligations: [{ ...item, evidence: [{ passage: 'ch1:p1', quote: meta[0].text }] }] }), meta, held)).toThrow('Planning commentary');
  });

  it('requires every debt, exact provenance and the owed chapter range', () => {
    const held = readDrama('DECISIVE: she testifies', 2).held;
    const passages = manuscriptPassages([{ chapter: 1, text: 'She testified.' }, { chapter: 2, text: 'She left.' }]);
    expect(() => readObligations('{"obligations":[]}', passages, held)).toThrow('Every obligation');
    expect(() => readObligations(JSON.stringify({ obligations: [{ id: 'd1', verdict: 'met', reason: 'Done.', evidence: [{ passage: 'ch1:p1', quote: 'She testified.' }] }] }), passages, held)).toThrow('range');
    expect(() => readPlotFindings('{"findings":[{"verdict":"error","reason":"No evidence","evidence":[]}]}', passages, 'causality')).toThrow('evidence');
  });

  it('retains valid findings and scene assessments beside malformed ones', () => {
    const passages = manuscriptPassages([{ chapter: 1, text: 'She took the key.' }, { chapter: 2, text: 'She opened the door.' }]);
    const valid = { verdict: 'error', reason: 'An outcome lacks its stated cause.', evidence: [{ passage: 'ch2:p1', quote: 'She opened the door.' }] };
    const plot = readPlotReview(JSON.stringify({ findings: [valid, { ...valid, evidence: [{ passage: 'ch2:p1', quote: 'She...door.' }] }] }), passages, 'causality');
    expect(plot.findings).toHaveLength(1); expect(plot.rejected).toHaveLength(1);
    const held = readDrama('TURN 1: she takes the key\nDECISIVE: she opens the door', 2).held;
    const review = readObligationReview(JSON.stringify({ obligations: [
      { id: 'd1', verdict: 'met', reason: 'The action is shown.', evidence: [{ passage: 'ch1:p1', quote: 'She took the key.' }] },
      { id: 'd2', verdict: 'met', reason: 'An invented quotation.', evidence: [{ passage: 'ch2:p1', quote: 'She...door.' }] },
    ] }), passages, held);
    expect(review.obligations.map(d => d.id)).toEqual(['d1']); expect(review.rejected).toHaveLength(1);
  });

  it('passes the full manuscript to continuity and keeps causality and premise independent', async () => {
    const seen: string[] = [];
    const held = readDrama(shape, 2).held;
    const audit = await auditBook(input, files, held, async (prompt, system, options) => {
      seen.push(options!.stage!);
      expect(options?.route).toBe('validator');
      expect(prompt).toContain(first);
      expect(prompt).toContain(wrong);
      if (options?.stage === 'continuity-discovery') return JSON.stringify({ findings: [continuity] });
      if (options?.stage === 'book-causality' || options?.stage === 'book-premise') return JSON.stringify({ findings: [{ verdict: 'error', reason: options.stage === 'book-causality' ? 'No established coordination links Claire to the executor.' : 'The promised frame is replaced with a bare conviction.', evidence: [{ passage: 'ch2:p1', quote: 'Claire was convicted.' }] }] });
      return cleanResponses(prompt, system, options);
    });
    expect(seen).toEqual(['continuity-discovery', 'book-obligations', 'book-causality', 'book-premise']);
    expect(audit.calls).toBe(4);
    expect(audit.failures).toEqual([]);
    expect(audit.findings.map(f => f.category)).toEqual(['continuity', 'causality', 'premise']);
    expect(audit.findings[0].evidence_refs).toContain(`ch1:p1: ${first}`);
    expect(auditKey(input, { ...files, 'chapter-2.md': fixed }, held)).not.toBe(audit.key);
  });

  it('preserves confirmed contradictions in the final status even when the author says done twice', async () => {
    const { store } = seed();
    const result = await new Orchestrator(store).runBook(input, async (prompt, system, options) => {
      if (options?.stage === 'author-step') return command('done');
      if (options?.stage === 'continuity-discovery') return JSON.stringify({ findings: [continuity] });
      return cleanResponses(prompt, system, options);
    });
    expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(result.report?.central_resolution.supported).toBe(false);
    expect(result.report?.findings.some(f => f.certainty === 'confirmed' && f.evidence_refs.length === 2)).toBe(true);
  });

  it('audits the last edit after exhaustion without spending the writing allowance, and reuses unchanged results', async () => {
    const { store, desk } = seed('');
    desk.budget = 2;
    store.saveAuthor({ ...store.loadAuthor()!, desk });
    const script = [command('write', 'chapter-2.md', wrong), command('change', 'chapter-2.md', `Desmond took the keycard Nora left on the desk.\n===\nDesmond used his own keycard.`)];
    const reads: string[] = [];
    let auditStarted = false;
    await writeAtDesk(input, store, async (prompt, system, options) => {
      if (options?.stage === 'author-step') { expect(auditStarted).toBe(false); return script.shift() || command('done'); }
      if (options?.stage === 'author-reader') return 'Nothing left hanging.';
      if (options?.stage === 'continuity-discovery') { auditStarted = true; reads.push(prompt); return JSON.stringify({ findings: prompt.includes('Nora left on the desk') ? [continuity] : [] }); }
      return cleanResponses(prompt, system, options);
    });
    expect(reads).toHaveLength(1);
    expect(reads[0]).toContain('Desmond used his own keycard.');
    expect(store.loadAuthor()!.desk!.spent).toBe(2);
    expect(store.loadReport()!.status).toBe('COMPLETE');
    const finalDesk = store.loadAuthor()!.desk!;
    expect(finalDesk.audit!.key).toBe(auditKey(input, finalDesk.files, recount(finalDesk, 2).held));
    let calls = 0;
    await writeAtDesk(input, store, async () => { calls++; throw new Error('Unchanged audit should be reused'); });
    expect(calls).toBe(0);
  });

  it('protects the final checks and recovery calls from the outer writing limit too', async () => {
    const { store } = seed();
    let writerCalls = 0;
    const stages: string[] = [];
    const result = await new Orchestrator(store, { maxCalls: 10, maxTimeMs: 60000 }).runBook(input, async (prompt, system, options) => {
      stages.push(options!.stage!);
      if (options?.stage === 'author-step') { writerCalls++; return command('change', 'chapter-2.md', `Desmond took the keycard Nora left on the desk.\n===\nDesmond used his own keycard.`); }
      return cleanResponses(prompt, system, options);
    });
    expect(writerCalls).toBe(1);
    expect(stages).toEqual(['author-step', 'author-similar', 'continuity-discovery', 'book-obligations', 'book-causality', 'book-premise']);
    expect(result.callsUsed).toBe(6);
    expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(result.report!.findings.some(f => f.category === 'premise-plan' && f.certainty === 'unavailable')).toBe(true);
    expect(result.report!.need_more_evidence).toEqual([]);
  });

  it('still checks saved chapters if an optional question reaches the outer reserve', async () => {
    const { store } = seed();
    const result = await new Orchestrator(store, { maxCalls: 9, maxTimeMs: 60000 }).runBook(input, async (prompt, system, options) => {
      if (options?.stage === 'author-step') return command('ask_keeper', '', 'Where is the keycard?');
      return cleanResponses(prompt, system, options);
    });
    expect(result.status).toBe('COMPLETE');
    expect(result.callsUsed).toBe(5);
    expect(store.loadAuthor()!.desk!.audit!.calls).toBe(4);
  });

  it('does not feed final audit findings back into drafting on resume', async () => {
    const { store, desk } = seed('');
    desk.audit = { key: 'old incomplete revision', obligations: [], findings: [], failures: ['incomplete'], calls: 0 };
    store.saveAuthor({ ...store.loadAuthor()!, desk });
    const script = [command('write', 'chapter-2.md', fixed), command('done')];
    let sawFullFeedback = false;
    await writeAtDesk(input, store, async (prompt, system, options) => {
      if (options?.stage === 'author-step') {
        if (prompt.includes('Whole-book checks of the current revision')) sawFullFeedback = true;
        return script.shift() || command('done');
      }
      return cleanResponses(prompt, system, options);
    });
    expect(sawFullFeedback).toBe(false);
    expect(store.loadAuthor()!.desk!.audit!.failures).toEqual([]);
  });

  it('cannot report a clean book when checks fail or return hallucinated quotes', async () => {
    const { store } = seed();
    const result = await new Orchestrator(store).runBook(input, async (prompt, system, options) => {
      if (options?.stage === 'author-step') return command('done');
      if (options?.stage === 'continuity-discovery') return JSON.stringify({ findings: [{ ...continuity, evidence: continuity.evidence.map(e => ({ ...e, passage: 'missing', quote: 'invented source' })) }] });
      if (options?.stage === 'book-causality') throw new Error('review transport unavailable');
      return cleanResponses(prompt, system, options);
    });
    expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(result.report!.need_more_evidence).toHaveLength(2);
    expect(result.report!.findings.filter(f => f.certainty === 'unavailable')).toHaveLength(2);
  });

  it('ignores administrative notes but invalidates prose and obligation changes', () => {
    const held = readDrama(shape, 2).held;
    const key = auditKey(input, { ...files, 'notebook.md': 'Still drafting.' }, held);
    expect(auditKey(input, { ...files, 'notebook.md': 'The book is ready.', 'dossier.md': 'Administrative note.' }, held)).toBe(key);
    expect(auditKey(input, { ...files, 'chapter-1.md': first + ' She called for help.' }, held)).not.toBe(key);
    expect(auditKey(input, files, [{ ...held[0], pay: 'A different outcome.' }, ...held.slice(1)])).not.toBe(key);
    expect(auditKey({ ...input, premise: 'Another story.' }, files, held)).not.toBe(key);
  });

  it('recovers bad source IDs using the same reader and retains already valid obligations', async () => {
    const held = readDrama('TURN 1: she takes the key\nDECISIVE: she opens the door', 2).held;
    const sourceFiles = { 'chapter-1.md': 'She took the key.', 'chapter-2.md': 'She opened the door.' };
    let attempts = 0;
    const result = await auditBook(input, sourceFiles, held, async (prompt, system, options) => {
      expect(options?.route).toBe('validator');
      if (options?.stage !== 'book-obligations') return cleanResponses(prompt, system, options);
      const schema = options.schema as any;
      expect(schema.$defs.reference.enum).toEqual(['ch1:p1', 'ch2:p1']);
      attempts++;
      const item = (id: string, passage: string) => ({ id, verdict: 'met', reason: 'The scene enacts this action.', evidence: [{ passage }] });
      if (attempts === 1) return JSON.stringify({ obligations: [item('d1', 'ch1:p1'), item('d2', 'ch9:p999')] });
      expect(prompt).toContain('ch9:p999');
      expect(prompt).toContain('PROTOCOL RECOVERY');
      return JSON.stringify({ obligations: [{ ...item('d1', 'ch1:p1'), reason: 'A retry must not replace the accepted assessment.' }, item('d2', 'ch2:p1')] });
    });
    expect(attempts).toBe(2); expect(result.calls).toBe(5);
    expect(result.obligations.map(r => r.id)).toEqual(['d1', 'd2']);
    expect(result.obligations[0].reason).toBe('The scene enacts this action.');
    expect(result.failures).toEqual([]); expect(result.recovery).toHaveLength(1);
  });

  it('recovers invalid JSON and transport errors once, without erasing valid findings', async () => {
    const attempts = new Map<string, number>();
    const result = await auditBook(input, files, [], async (_prompt, _system, options) => {
      const stage = options!.stage!, n = (attempts.get(stage) || 0) + 1; attempts.set(stage, n);
      if (stage === 'book-obligations') return '{"obligations":[]}';
      if (n === 1 && stage === 'book-causality') throw new Error('temporary network error');
      if (n === 1 && stage === 'book-premise') return 'invalid JSON';
      if (stage === 'continuity-discovery') return JSON.stringify({ findings: n === 1 ? [continuity, { ...continuity, evidence: [{ passage: 'missing' }] }] : [continuity] });
      return '{"findings":[]}';
    });
    expect(result.calls).toBe(7); expect(result.failures).toEqual([]);
    expect(result.findings.some(f => f.category === 'continuity')).toBe(true);
  });

  it('does not treat disappearance of a rejected allegation as a clean recovery', async () => {
    let calls = 0;
    const result = await auditBook(input, files, [], async (_prompt, _system, options) => {
      if (options?.stage === 'book-obligations') return '{"obligations":[]}';
      if (options?.stage === 'book-causality' && ++calls === 1) return JSON.stringify({ findings: [{ verdict: 'error', reason: 'The accusation lacks evidence.', evidence: [{ passage: 'missing' }] }] });
      return '{"findings":[]}';
    });
    expect(result.failures.join(' ')).toContain('Recovery omitted');
  });

  it('reports an unperformed edit when the author closes without repairing it', async () => {
    const { store } = seed(fixed); let turn = 0;
    await writeAtDesk(input, store, async (prompt, system, options) => {
      if (options?.stage === 'author-step') return ++turn === 1 ? command('change', 'chapter-2.md', 'Missing separator and source') : command('done');
      return cleanResponses(prompt, system, options);
    });
    expect(store.loadReport()!.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(store.loadReport()!.findings.some(f => f.certainty === 'tool_rejected' && f.description.includes('NOT APPLIED'))).toBe(true);
    expect(store.loadAuthor()!.desk!.files['chapter-2.md']).toBe(fixed);
  });

  it('recovers a truncated audit using compact JSON at the same fixed limit', async () => {
    const limits: number[] = [];
    const result = await auditBook(input, files, [], async (prompt, _system, options) => {
      if (options?.stage === 'book-obligations') return '{"obligations":[]}';
      if (options?.stage === 'book-causality') {
        limits.push(options.maxTokens!);
        expect(prompt).toContain('Compact JSON only');
        if (limits.length === 1) throw new Error('output reached its token limit');
        expect(prompt).toContain('output limit is fixed');
      }
      return '{"findings":[]}';
    });
    expect(limits).toEqual([8000, 8000]);
    expect(result.calls).toBe(5); expect(result.failures).toEqual([]);
  });
  it('caps recovery at eight calls and records persistent failure honestly', async () => {
    const result = await auditBook(input, files, readDrama(shape, 2).held, async () => { throw new Error('provider unavailable'); });
    expect(result.calls).toBe(8); expect(result.recovery).toHaveLength(4);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it('reserves room for all four recovery calls after writing hits its outer limit', async () => {
    const { store } = seed(); const attempts = new Map<string, number>();
    const result = await new Orchestrator(store, { maxCalls: 10, maxTimeMs: 60000 }).runBook(input, async (prompt, system, options) => {
      if (options?.stage === 'premise-plan') return cleanResponses(prompt, system, options);
      if (options?.stage === 'author-step') return command('write', 'notebook.md', 'The book is written.');
      const stage = options!.stage!, n = (attempts.get(stage) || 0) + 1; attempts.set(stage, n);
      if (n === 1) throw new Error('temporary failure');
      return cleanResponses(prompt, system, options);
    });
    expect(result.callsUsed).toBe(10); expect(store.loadAuthor()!.desk!.audit!.calls).toBe(8);
    expect(result.status).toBe('COMPLETE');
  });

  it('does not repeat audits for closing notebook updates', async () => {
    const { store } = seed(fixed); let turn = 0, auditCalls = 0;
    await writeAtDesk(input, store, async (prompt, system, options) => {
      if (options?.stage === 'author-step') {
        turn++;
        return turn <= 2 ? command('write', 'notebook.md', `The book is ready. Closing note ${turn}.`) : command('done');
      }
      if (['continuity-discovery', 'book-obligations', 'book-causality', 'book-premise'].includes(options!.stage!)) auditCalls++;
      return cleanResponses(prompt, system, options);
    });
    expect(auditCalls).toBe(4);
    expect(store.loadAuthor()!.desk!.files['notebook.md']).toContain('Closing note 2');
  });

  it('persists rejected edits, skips a premature done, and clears the receipt after a real rewrite', async () => {
    const { store } = seed(fixed); let turn = 0;
    const oversized = Array.from({ length: 221 }, () => 'word').join(' ');
    await writeAtDesk(input, store, async (prompt, system, options) => {
      if (options?.stage === 'author-step') {
        turn++;
        if (turn === 1) return command('change', 'chapter-2.md', `Desmond used his own keycard.\n===\n${oversized}`) + '\n' + command('done');
        if (turn === 2) {
          expect(prompt).toContain('ACTION RESULT: NOT APPLIED');
          expect(prompt).toContain('REJECTED EDITS STILL NOT APPLIED');
          expect(store.loadAuthor()!.desk!.finished).toBe(false);
          expect(store.loadAuthor()!.desk!.files['chapter-2.md']).toBe(fixed);
          return command('write', 'chapter-2.md', fixed + ' Nora told the truth.');
        }
        return command('done');
      }
      return cleanResponses(prompt, system, options);
    });
    expect(turn).toBeGreaterThanOrEqual(3);
    expect(store.loadAuthor()!.desk!.failed_edits).toEqual([]);
    expect(store.loadReport()!.findings.some(f => f.certainty === 'tool_rejected')).toBe(false);
  });

  it('reports an incomplete book as partial and never marks the draft completed', async () => {
    const { store, desk } = seed(''); desk.spent = desk.budget; desk.offered = true;
    store.saveAuthor({ ...store.loadAuthor()!, desk });
    const result = await new Orchestrator(store).runBook(input, async () => { throw new Error('No complete manuscript to check'); });
    expect(result.status).toBe('PARTIAL');
    expect(store.loadAuthor()!.completed).toBe(false);
    expect(result.report!.need_more_evidence[0]).toContain('incomplete');
  });
});
