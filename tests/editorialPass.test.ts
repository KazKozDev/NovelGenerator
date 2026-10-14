import { describe, expect, it } from 'vitest';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { authorKey } from '../utils/novel/v3/author';
import { newDesk, readStep, takeStep } from '../utils/novel/v3/authorDesk';
import { prepareEditorialPass } from '../utils/novel/v3/editorialPass';
import type { ProjectInput, FinalReport } from '../utils/novel/v2/types';

const input: ProjectInput = { premise: 'A woman tracks a key.', chapter_count: 2, target_total_words: 600, genre: 'mystery', author_requirements: '' };
const report: FinalReport = { status: 'COMPLETE_WITH_WARNINGS', summary: 'The key moves without explanation.', coverage: { material_examined: '2 chapters', limitations: [] }, findings: [], central_resolution: { supported: false, evidence_refs: [], comment: '' }, unresolved_major_promises: [], need_more_evidence: [] };
const command = (tool: string, file = '', content = '') => `THOUGHT: Repair the key trail.\nTOOL: ${tool}\nFILE: ${file}\n---\n${content}`;
function seed() {
  const store = new MemoryProjectStore();
  const desk = newDesk(2);
  desk.files['chapter-1.md'] = 'She left the key on the table.';
  desk.files['chapter-2.md'] = 'She used the key from her pocket.';
  desk.finished = true;
  store.saveInput(input);
  store.saveAuthor({ version: 1, input_key: authorKey(input), clock: '', plan: '', chapters: [], waiting: '', noticed: [], completed: true, desk });
  store.saveManuscript(1, desk.files['chapter-1.md']); store.saveManuscript(2, desk.files['chapter-2.md']);
  store.saveReport(report);
  return store;
}

describe('separate editorial pass', () => {
  it('repairs related earlier and later chapters, preserves the source and audits only after editing', async () => {
    const store = seed(); const stages: string[] = [];
    const commands = [command('write', 'chapter-1.md', 'She put the key in her pocket.'), command('write', 'chapter-2.md', 'She took the key from her pocket and opened the door.'), command('done')];
    let auditing = false;
    await new Orchestrator(store).runEditorial(input, async (_prompt, system, options) => {
      stages.push(options?.stage || '');
      if (options?.stage === 'author-step') {
        expect(auditing).toBe(false);
        expect(system).toContain('SEPARATE EDITORIAL PASS');
        expect(system).toContain(report.summary);
        expect(system).not.toContain('Starting chapter N automatically locks');
        return commands.shift()!;
      }
      auditing = true; expect(store.loadAuthor()!.desk!.finished).toBe(true);
      return options?.stage === 'book-obligations' ? '{"obligations":[]}' : '{"findings":[]}';
    });
    expect(stages).toEqual(['author-step', 'author-step', 'author-step', 'continuity-discovery', 'book-obligations', 'book-causality', 'book-premise']);
    const desk = store.loadAuthor()!.desk!;
    expect(desk.files['chapter-1.md']).toBe('She put the key in her pocket.');
    expect(store.manuscript()[1].text).toContain('opened the door');
    expect(desk.editorial!.sourceFiles['chapter-1.md']).toBe('She left the key on the table.');
    expect(desk.editorial!.sourceReport).toEqual(report);
    expect(desk.editorial!.active).toBe(false);
    expect(await takeStep(desk, readStep(command('write', 'chapter-1.md', 'Erase.')), 2, async () => '')).toContain('LOCKED');
  });

  it('rejects unfinished or mismatched books without changing them', () => {
    const store = seed(); const before = store.loadAuthor();
    expect(() => prepareEditorialPass({ ...input, premise: 'Different' }, store)).toThrow('original premise');
    expect(store.loadAuthor()).toEqual(before);
    store.saveAuthor({ ...before!, completed: false });
    expect(() => prepareEditorialPass(input, store)).toThrow('Finish the complete draft');
  });

  it('resumes interrupted editing without replacing its source or restoring its allowance', () => {
    const store = seed(); prepareEditorialPass(input, store);
    const draft = store.loadAuthor()!; draft.desk!.spent = 3;
    draft.desk!.files['chapter-1.md'] = 'An edit already saved.'; store.saveAuthor(draft);
    prepareEditorialPass(input, store);
    expect(store.loadAuthor()!.desk!.spent).toBe(3);
    expect(store.loadAuthor()!.desk!.files['chapter-1.md']).toBe('An edit already saved.');
    expect(store.loadAuthor()!.desk!.editorial!.sourceFiles['chapter-1.md']).toBe('She left the key on the table.');
  });
});
