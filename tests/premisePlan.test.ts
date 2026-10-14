import { describe, expect, it } from 'vitest';
import { premisePlanKey, premisePlanSources, readPremisePlan, reviewPremisePlan } from '../utils/novel/v3/premisePlan';
import { newDesk, writeAtDesk } from '../utils/novel/v3/authorDesk';
import { authorKey } from '../utils/novel/v3/author';
import { MemoryProjectStore } from '../utils/novel/v2/store';

const premise = 'Claire describes how Nora would kill her husband, and every detail matches his death.';
const bad = 'The murder never happened. Julian slips in the shower. Claire is never charged.';
const good = 'Claire arranges the killing to frame Nora; every described detail matches the death.';
const faithful = JSON.stringify({ verdict: 'faithful', reason: 'The intended killing and framing preserve the premise.', issues: [] });
const conflict = JSON.stringify({ verdict: 'conflict', reason: 'The promised killing is replaced with an accident.', issues: [{ premise_quote: 'how Nora would kill her husband', note_file: 'notebook.md', note_quote: 'The murder never happened.', reason: 'The planned accident removes the central promised killing.' }] });
const shape = `TURN 1: Nora meets Julian
TURN 2: Nora finds the trap
TURN 3: Nora confesses
STAKE 1: marriage | divorce
STAKE 2: license | suspension
STAKE 3: freedom | accusation
QUESTION: who killed Julian | Claire arranged it
GUN: notebook | notebook exposes Claire | 1 | 1
FALSE: Nora is safe | Nora is accused
IRONY: Claire knows | Nora trusts | Nora learns
WANT: Nora wants secrecy
NEED: Nora pays the price
DECISIVE: Nora testifies
LEARN 1: Claire arranged the killing`;
const command = (tool: string, file: string, content: string) => `THOUGHT: Continue.\nTOOL: ${tool}\nFILE: ${file}\n---\n${content}`;
function seed() {
  const input = { premise, chapter_count: 1, target_total_words: 300, genre: 'mystery', author_requirements: '' };
  const desk = newDesk(1); desk.files['notebook.md'] = bad; desk.files['drama.md'] = shape;
  const store = new MemoryProjectStore();
  store.saveAuthor({ version: 1, input_key: authorKey(input), clock: '', plan: '', chapters: [], waiting: '', noticed: [], completed: false, desk });
  return { store, input };
}

describe('premise fidelity before writing', () => {
  it('accepts a supported accident substitution finding and rejects fabricated evidence', () => {
    expect(readPremisePlan(conflict, premise, { 'notebook.md': bad }).verdict).toBe('conflict');
    expect(() => readPremisePlan(conflict, premise, { 'notebook.md': good })).toThrow('evidence');
    expect(() => readPremisePlan(conflict, 'A different story.', { 'notebook.md': bad })).toThrow('evidence');
    expect(() => readPremisePlan('{"verdict":"conflict","reason":"Wrong","issues":[]}', premise, { 'notebook.md': bad })).toThrow('disagree');
    expect(readPremisePlan(faithful, premise, { 'notebook.md': good }).verdict).toBe('faithful');
  });
  it('extracts exact evidence from stable source IDs rather than asking the model to copy quotes', () => {
    const sources = premisePlanSources(premise, { 'notebook.md': bad });
    const planned = sources.find(s => s.file === 'notebook.md')!;
    const answer = JSON.stringify({ verdict: 'conflict', reason: 'The killing was replaced.', issues: [{ premise_ref: 'premise:1', note_ref: planned.id, reason: 'The actual planned event contradicts the promised killing.' }] });
    expect(readPremisePlan(answer, premise, { 'notebook.md': bad }).issues[0]).toMatchObject({ premise_quote: premise, note_quote: bad, note_file: 'notebook.md' });
    expect(() => readPremisePlan(answer.replace(planned.id, 'notebook.md:999'), premise, { 'notebook.md': bad })).toThrow('reference');
  });

  it('invalidates the check for any note or premise change but not a prose edit', () => {
    const files = { 'notebook.md': bad, 'chapter-1.md': 'She spoke.' };
    expect(premisePlanKey(premise, { ...files, 'chapter-1.md': 'She fell silent.' })).toBe(premisePlanKey(premise, files));
    expect(premisePlanKey(premise, { ...files, 'notebook.md': good })).not.toBe(premisePlanKey(premise, files));
    expect(premisePlanKey('Another premise.', files)).not.toBe(premisePlanKey(premise, files));
  });
  it('does not mistake absent plans or a failed check for approval', async () => {
    expect((await reviewPremisePlan(premise, {}, async () => faithful)).verdict).toBe('uncertain');
    expect((await reviewPremisePlan(premise, { 'notebook.md': bad }, async () => { throw new Error('transport failed'); })).verdict).toBe('unavailable');
  });
  it('repairs a contradictory assessment protocol once without treating the invalid response as approval', async () => {
    let calls = 0;
    const review = await reviewPremisePlan(premise, { 'notebook.md': bad }, async () => {
      calls++;
      return calls === 1 ? JSON.stringify({ ...JSON.parse(conflict), verdict: 'faithful' }) : conflict;
    });
    expect(calls).toBe(2); // Invalid response and protocol repair by the same reader.
    expect(review.verdict).toBe('conflict');
    expect(review.initial_review).toBeUndefined();
  });
  it('uses only the configured reader for plan assessment', async () => {
    const routes: string[] = [];
    const review = await reviewPremisePlan(premise, { 'notebook.md': bad }, async (_prompt, _system, options) => {
      routes.push(options!.route!); return conflict;
    });
    expect(routes).toEqual(['validator']);
    expect(review.verdict).toBe('conflict');
  });

  it('stores a chapter despite plan conflict and lets the author close without approval', async () => {
    const { store, input } = seed(); let turns = 0;
    await writeAtDesk(input, store, async (prompt, _system, options) => {
      if (options?.stage === 'premise-plan') return conflict;
      if (options?.stage === 'author-step') {
        turns++;
        expect(prompt).not.toContain('PLAN REPAIR ONLY');
        if (turns === 1) return command('write', 'chapter-1.md', 'Nora chose her own ending.');
        expect(prompt).toContain('advisory feedback');
        return command('done', '', '');
      }
      if (options?.stage === 'author-reader') return 'Nothing left hanging.';
      if (options?.stage === 'book-obligations') return '{"obligations":[]}';
      return '{"findings":[]}';
    });
    expect(turns).toBe(2);
    expect(store.manuscript()).toEqual([{ chapter: 1, text: 'Nora chose her own ending.' }]);
    expect(store.loadAuthor()!.desk!.finished).toBe(true);
    expect(store.loadAuthor()!.desk!.plan_stop).toBeUndefined();
    expect(store.loadReport()!.findings.some(f => f.category === 'premise-plan')).toBe(true);
    expect(store.loadReport()!.status).toBe('COMPLETE_WITH_WARNINGS');
  });

  it('never enters repair-only mode when the plan review is unavailable', async () => {
    const { store, input } = seed(); let turns = 0;
    await writeAtDesk(input, store, async (prompt, _system, options) => {
      if (options?.stage === 'premise-plan') throw new Error('review unavailable');
      if (options?.stage === 'author-step') {
        turns++; expect(prompt).not.toContain('PLAN REPAIR ONLY');
        return turns === 1 ? command('write', 'chapter-1.md', 'The author writes.') : command('done', '', '');
      }
      if (options?.stage === 'author-reader') return 'Nothing left hanging.';
      if (options?.stage === 'book-obligations') return '{"obligations":[]}';
      return '{"findings":[]}';
    });
    expect(store.manuscript()).toHaveLength(1);
    expect(store.loadAuthor()!.desk!.finished).toBe(true);
    expect(store.loadReport()!.findings.some(f => f.category === 'premise-plan' && f.certainty === 'unavailable')).toBe(true);
  });

  it('allows writing and closing without service-note labels', async () => {
    const { store, input } = seed(); const saved = store.loadAuthor()!; saved.desk!.files['drama.md'] = ''; store.saveAuthor(saved);
    let turns = 0;
    await writeAtDesk(input, store, async (_prompt, _system, options) => {
      if (options?.stage === 'author-step') return ++turns === 1 ? command('write', 'chapter-1.md', 'A chapter without labels.') : command('done', '', '');
      if (options?.stage === 'premise-plan') return conflict;
      if (options?.stage === 'author-reader') return 'Nothing left hanging.';
      if (options?.stage === 'book-obligations') return '{"obligations":[]}';
      return '{"findings":[]}';
    });
    expect(store.manuscript()[0].text).toBe('A chapter without labels.');
    expect(store.loadAuthor()!.desk!.finished).toBe(true);
    expect(store.loadReport()!.findings.some(f => f.description.startsWith('The shape is missing:'))).toBe(true);
  });

  it('continues a partial saved book with its pages intact and a fresh writing allowance', async () => {
    const { store, input } = seed();
    const saved = store.loadAuthor()!; saved.desk!.files['chapter-1.md'] = 'Existing opening.'; saved.desk!.finished = true; saved.desk!.spent = saved.desk!.budget;
    store.saveAuthor(saved); store.saveManuscript(1, 'Existing opening.');
    store.saveReport({ status: 'PARTIAL', summary: 'Interrupted', findings: [], coverage: { material_examined: '', limitations: [] }, central_resolution: { supported: false, evidence_refs: [], comment: '' }, unresolved_major_promises: [], need_more_evidence: [] });
    let turns = 0;
    await writeAtDesk(input, store, async (_prompt, _system, options) => {
      if (options?.stage === 'premise-plan') return faithful;
      if (options?.stage === 'author-step') { turns++; return command('done', '', ''); }
      if (options?.stage === 'premise-plan') return faithful;
      if (options?.stage === 'author-reader') return 'Nothing left hanging.';
      if (options?.stage === 'book-obligations') return '{"obligations":[]}';
      return '{"findings":[]}';
    });
    expect(turns).toBeGreaterThan(0);
    expect(store.manuscript()).toEqual([{ chapter: 1, text: 'Existing opening.' }]);
    expect(store.loadAuthor()!.desk!.journal.join('\n')).toContain('resumed an incomplete manuscript with a fresh writing allowance');
  });

});
