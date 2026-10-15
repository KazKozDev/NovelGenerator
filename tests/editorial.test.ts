import { scriptedSavedBookAuthor } from './fixtures/savedBookAuthor';
import { cleanAuditJSON } from './fixtures/baselineAudit';
import { describe, expect, it } from 'vitest';
import { EDITORIAL_FOCUSES, editorialReport, reviseManuscript, reviewManuscript } from '../utils/novel/craft/editorial';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { authorKey } from '../utils/novel/author';
import type { NovelLLM } from '../utils/novel/v2/llm';

const input = { premise: 'Nora opens a locked door.', genre: 'thriller', author_requirements: '', chapter_count: 1, target_total_words: 500 };
const issue = { category: 'causality', severity: 'major', reason: 'No key was acquired.', evidence: [{ chapter: 1, quote: 'She opened the locked door.' }] };
describe('editorial feedback and revision', () => {
  it('repairs the saved text and rechecks the replacement before declaring completion', async () => {
    const requests: string[] = [], saved: string[] = [];
    const llm: NovelLLM = async (prompt, _system, options) => {
      requests.push(prompt);
      if (prompt.startsWith('ORIGINAL CRAFT AUDIT:')) return cleanAuditJSON;
      if (options?.stage === 'craft-editorial-repair') return JSON.stringify({ changed: true, text: 'She took the key and unlocked the door.' });
      return JSON.stringify({ issues: prompt.includes('She opened the locked door.') ? [issue] : [], landmarks: [], readerMap: { loops: [], props: [] } });
    };
    const result = await reviseManuscript(input, [{ chapter: 1, text: 'She opened the locked door.' }], llm, c => saved.push(c[0].text), () => {});
    expect(saved).toEqual(['She took the key and unlocked the door.']);
    expect(requests.at(-1)).toContain(saved[0]);
    expect(result.history[0].before[0].text).toBe('She opened the locked door.');
    expect(editorialReport(result.chapters, 1, result.reviews).status).toBe('COMPLETE');
  });
  it('retains unresolved findings, unavailable checks and incomplete status honestly', () => {
    expect(editorialReport([{ chapter: 1, text: issue.evidence[0].quote }], 1, [{ focus: 'developmental', issues: [issue as any], failures: [] }]).status).toBe('COMPLETE_WITH_WARNINGS');
    expect(editorialReport([{ chapter: 1, text: 'Text' }], 1, [{ focus: 'developmental', issues: [], failures: ['unavailable'] }]).status).toBe('COMPLETE_WITH_WARNINGS');
    expect(editorialReport([], 1, []).status).toBe('PARTIAL');
  });
  it('does not execute unsupported evidence or partially apply a failed sweep', async () => {
    const review = await reviewManuscript(input, [{ chapter: 1, text: 'No door.' }], 'developmental', async () => JSON.stringify({ issues: [issue] }));
    expect(review.issues).toEqual([]);
    expect(review.failures).toHaveLength(1);
    const persisted: unknown[] = [];
    const result = await reviseManuscript({ ...input, chapter_count: 2 }, [{ chapter: 1, text: issue.evidence[0].quote }, { chapter: 2, text: 'Afterward.' }], async (prompt, _system, options) => {
      if (prompt.startsWith('ORIGINAL CRAFT AUDIT:')) return cleanAuditJSON;
      if (options?.stage === 'craft-editorial-repair') {
        if (prompt.includes('Revise chapter 2 only')) throw new Error('offline');
        return JSON.stringify({ changed: true, text: 'New text.' });
      }
      return JSON.stringify({ issues: [issue] });
    }, c => persisted.push(c), () => {});
    expect(persisted).toEqual([]);
    expect(result.chapters[0].text).toBe(issue.evidence[0].quote);
    expect(result.reviews.some(r => r.failures.some(f => f.includes('offline')))).toBe(true);
  });
  it('does not polish sentences while structural repairs remain unresolved', async () => {
    const repairPrompts: string[] = [];
    const result = await reviseManuscript(input, [{ chapter: 1, text: issue.evidence[0].quote }], async (prompt, _s, options) => {
      if (prompt.startsWith('ORIGINAL CRAFT AUDIT:')) return cleanAuditJSON;
      if (options?.stage === 'craft-editorial-repair') { repairPrompts.push(prompt); return '{"changed":false}'; }
      return JSON.stringify({ issues: [issue], landmarks: [], readerMap: { loops: [], props: [] } });
    }, () => {}, () => {});
    expect(repairPrompts).toHaveLength(1);
    expect(repairPrompts[0]).toContain('EDITORIAL FOCUS: developmental');
    expect(result.reviews.at(-1)!.focus).toBe('proofread');
    expect(editorialReport(result.chapters, 1, result.reviews).status).toBe('COMPLETE_WITH_WARNINGS');
  });
  it('edits an existing book without generating a dossier or new scenes', async () => {
    const store = new MemoryProjectStore();
    store.saveAuthor({ version: 1, input_key: authorKey(input), clock: '', plan: '', chapters: [{ text: 'Saved prose.', card: '', facts: '', reader: '' }], waiting: '', noticed: [], completed: true, desk: { files: { 'chapter-1.md': 'Saved prose.' }, answers: [], journal: [], step: 0, budget: 0, spent: 0, finished: true } });
    store.saveManuscript(1, 'Saved prose.');
    const stages: string[] = [];
    const result = await new Orchestrator(store).runEditorial(input, async (p, system, options) => { stages.push(options?.stage || ''); return scriptedSavedBookAuthor(p, system, options); });
    expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(result.report!.findings.some(f => f.category === 'length')).toBe(true);
    expect(stages).toEqual(['craft-author-recover', 'craft-author-revision-plan', ...EDITORIAL_FOCUSES.map(f => ['developmental', 'baseline-developmental'].includes(f) ? 'craft-dev-review' : 'craft-lit-review'), 'craft-beta-reader', 'craft-beta-reader', 'craft-beta-reader']);
    expect(store.manuscript()[0].text).toBe('Saved prose.');
    expect(Object.keys(store.loadAuthor()!.desk!.files).some(f => /editorial-.*-source.json/.test(f))).toBe(true);
  });
  it('resumes interrupted automatic editing through the ordinary Continue path', async () => {
    const store = new MemoryProjectStore();
    const startedAt = '2026-01-01T00:00:00.000Z';
    const sourceName = `editorial-${Date.parse(startedAt)}-source.json`;
    store.saveAuthor({ version: 1, input_key: authorKey(input), clock: '', plan: '', chapters: [{ text: 'Saved revision.', card: '', facts: '', reader: '' }], waiting: '', noticed: [], completed: false, desk: { files: { 'chapter-1.md': 'Saved revision.', [sourceName]: 'Original archive' }, answers: [], journal: [], step: 0, budget: 0, spent: 0, finished: false, editorial: { active: true, sourceFiles: { 'chapter-1.md': 'Original source.' }, sourceReport: null, startedAt } } });
    store.saveManuscript(1, 'Saved revision.');
    const stages: string[] = [];
    const result = await new Orchestrator(store).runBook(input, async (p, system, options) => { stages.push(options!.stage!); return scriptedSavedBookAuthor(p, system, options); });
    expect(result.status).not.toBe('FAILED');
    expect(stages).not.toContain('craft-preparation');
    expect(stages).not.toContain('craft-write');
    expect(store.manuscript()[0].text).toBe('Saved revision.');
    expect(store.loadAuthor()!.desk!.files[sourceName]).toBe('Original archive');
    expect(store.loadAuthor()!.desk!.editorial!.active).toBe(false);
  });
});
