import { inputKey, readProgressivePlan } from '../utils/novel/v2/progressive';
import { describe, expect, it } from 'vitest';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { restoreSnapshot, snapshotProject } from '../utils/novel/v2/export';
import type { NovelLLM } from '../utils/novel/v2/llm';
import type { ProjectInput } from '../utils/novel/v2/types';
const input: ProjectInput = { generation_mode: 'progressive', premise: 'A witness deliberately conceals a letter.', chapter_count: 2, genre: 'mystery', target_total_words: 1000, author_requirements: 'Keep the deliberate concealment.' };
function model(store: MemoryProjectStore, fail?: string): NovelLLM {
  return async (prompt, _system, options) => {
    const stage = options?.stage || '';
    if (stage === fail) throw new Error('Interrupted');
    if (stage === 'develop-story') return JSON.stringify({ plan: 'Witness conceals a letter; truth revealed.', chapters: [{ chapter: 1, text: 'Witness hides letter voluntarily.' }, { chapter: 2, text: 'Truth is revealed.' }] });
    if (stage.endsWith('-brief')) {
      expect(prompt).toContain('Witness hides letter voluntarily.');
      expect(prompt).toContain('Truth is revealed.');
      return JSON.stringify({ plan: 'Witness protects sibling by concealing a letter. Chapter 1 sets this cause up; chapter 2 reveals its consequence.', brief: 'Repair: witness protects sibling; reveal this cause in chapter 1 and its consequence in chapter 2.', clarifications: [{ unclear: 'Why does the witness hide the letter?', resolution: 'Show that disclosure threatens the sibling.', chapters: [1, 2] }] });
    }
    if (stage === 'develop-audit') return JSON.stringify({ summary: 'Causal chain supported.', supported: true, findings: [] });
    const chapter = prompt.includes('Rewrite chapter 1 in full') ? 1 : 2;
    if (chapter === 2) {
      expect(prompt).toContain('protects sibling');
      // Published manuscript remains the entire prior version while chapters are staged.
      expect(store.manuscript()[0].text).not.toContain(stage);
    }
    return `Witness hides letter voluntarily. Truth is revealed. ${stage} chapter ${chapter}: protects sibling.`;
  };
}
describe('whole-book progressive development', () => {
  it('defaults to successive complete stories and propagates causal repair', async () => {
    const store = new MemoryProjectStore(); store.saveProgressive({ version: 1, input_key: inputKey(input), plan: 'Legacy seed', planning_source: 'manifestation', versions: [], pending: null, completed: false });
    const stages: string[] = [];
    const next = model(store);
    const result = await new Orchestrator(store).runBook(input, async (...args) => { stages.push(args[2]?.stage || ''); return next(...args); });
    expect(stages[0]).toBe('develop-story');
    expect(stages.some(stage => stage.startsWith('design'))).toBe(false);
    expect(stages).not.toContain('develop-plan');
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(store.loadProgressive()?.versions.map(v => v.pass)).toEqual(['story', 'scenes', 'prose', 'polish']);
    expect(store.loadProgressive()?.completed).toBe(true);
    expect(store.manuscript()).toHaveLength(2);
    expect(store.manuscript().every(c => c.text.includes('protects sibling'))).toBe(true);
    expect(store.loadDesign()).toBeNull();
    expect(store.loadProgressive()?.planning_source).toBe('manifestation');
    expect(store.loadProgressive()?.plan).toContain('protects sibling');
    expect(store.loadProgressive()?.versions.every(version => !!version.plan)).toBe(true);
  });
  it('resumes staged chapters from a portable snapshot without exposing a half-revised book', async () => {
    const store = new MemoryProjectStore(); store.saveProgressive({ version: 1, input_key: inputKey(input), plan: 'Legacy seed', planning_source: 'manifestation', versions: [], pending: null, completed: false });
    let rewrites = 0;
    const delegate = model(store);
    const interrupted: NovelLLM = async (...args) => {
      if (args[2]?.stage === 'develop-scenes' && ++rewrites === 2) throw new Error('Interrupted');
      return delegate(...args);
    };
    expect((await new Orchestrator(store).runBook(input, interrupted)).status).toBe('FAILED');
    expect(store.loadProgressive()?.pending?.chapters).toHaveLength(1);
    expect(store.loadProgressive()?.pending?.plan).toContain('protects sibling');
    expect(store.loadProgressive()?.plan).not.toContain('protects sibling');
    expect(store.manuscript().map(c => c.text)).toEqual(['Witness hides letter voluntarily.', 'Truth is revealed.']);
    const resumed = new MemoryProjectStore();
    restoreSnapshot(resumed, snapshotProject(store));
    const seen: string[] = [];
    const next = model(resumed);
    await new Orchestrator(resumed).runBook(input, async (...args) => { seen.push(args[2]?.stage || ''); return next(...args); });
    expect(seen.filter(s => s === 'develop-scenes')).toHaveLength(1);
    expect(seen).not.toContain('develop-plan');
    expect(seen).not.toContain('develop-scenes-brief');
    expect(resumed.loadProgressive()?.completed).toBe(true);
  });
  it('retries a failed final audit without rewriting completed prose', async () => {
    const store = new MemoryProjectStore(); store.saveProgressive({ version: 1, input_key: inputKey(input), plan: 'Legacy seed', planning_source: 'manifestation', versions: [], pending: null, completed: false });
    expect((await new Orchestrator(store).runBook(input, model(store, 'develop-audit'))).status).toBe('FAILED');
    expect(store.loadProgressive()?.completed).toBe(true);
    expect(store.loadReport()).toBeNull();
    const stages: string[] = [];
    const next = model(store);
    const result = await new Orchestrator(store).runBook(input, async (...args) => { stages.push(args[2]?.stage || ''); return next(...args); });
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(stages).toEqual(['develop-audit']);
  });
  it('keeps saved input intact when a different book is supplied to resume', async () => {
    const store = new MemoryProjectStore(); store.saveProgressive({ version: 1, input_key: inputKey(input), plan: 'Legacy seed', planning_source: 'manifestation', versions: [], pending: null, completed: false });
    await new Orchestrator(store).runBook(input, model(store));
    const result = await new Orchestrator(store).runBook({ ...input, premise: 'Different book' }, model(store));
    expect(result.status).toBe('FAILED');
    expect(result.callsUsed).toBe(0);
    expect(store.loadInput()).toEqual({ ...input, generation_mode: 'progressive' });
  });
  it('preserves structured updated plans in story and editorial replies', async () => {
    const store = new MemoryProjectStore(); store.saveProgressive({ version: 1, input_key: inputKey(input), plan: 'Legacy seed', planning_source: 'manifestation', versions: [], pending: null, completed: false });
    const next = model(store);
    const plans: Record<string, unknown>[] = [];
    const result = await new Orchestrator(store).runBook(input, async (...args) => {
      const response = await next(...args);
      if (args[2]?.stage === 'develop-story' || args[2]?.stage?.endsWith('-brief')) {
        const raw = JSON.parse(response);
        raw.plan = { causal_chain: raw.plan, ending: 'The witness protects the sibling; the truth emerges.' };
        plans.push(raw.plan);
        return JSON.stringify(raw);
      }
      return response;
    });
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(store.loadProgressive()?.versions.map(v => JSON.parse(v.plan!))).toEqual(plans);
    expect(JSON.parse(store.loadProgressive()!.plan)).toEqual(plans.at(-1));
  });
  it('refuses clarification briefs that omit how uncertainty will be resolved', async () => {
    const store = new MemoryProjectStore(); store.saveProgressive({ version: 1, input_key: inputKey(input), plan: 'Legacy seed', planning_source: 'manifestation', versions: [], pending: null, completed: false });
    const next = model(store);
    const result = await new Orchestrator(store).runBook(input, async (...args) => {
      const response = await next(...args);
      if (args[2]?.stage === 'develop-scenes-brief') {
        const raw = JSON.parse(response);
        raw.clarifications = [{ unclear: 'Why hide the letter?', chapters: [1, 2] }];
        return JSON.stringify(raw);
      }
      return response;
    });
    expect(result.status).toBe('FAILED');
    expect(result.stoppedReason).toContain('concrete uncertainty');
    expect(store.loadProgressive()?.versions.map(v => v.pass)).toEqual(['story']);
    expect(store.manuscript()).toHaveLength(2);
  });
  it('still rejects empty or invalid plan values', () => {
    for (const value of [null, undefined, '', '  ', {}, [], 42, false]) {
      expect(() => readProgressivePlan(value)).toThrow('nonempty updated plan');
    }
  });
  it('does not advance when the first whole story fails', async () => {
    const store = new MemoryProjectStore(); store.saveProgressive({ version: 1, input_key: inputKey(input), plan: 'Legacy seed', planning_source: 'manifestation', versions: [], pending: null, completed: false });
    const stages: string[] = [];
    const next = model(store, 'develop-story');
    const result = await new Orchestrator(store).runBook(input, async (...args) => { stages.push(args[2]?.stage || ''); return next(...args); });
    expect(result.status).toBe('FAILED');
    expect(stages).not.toContain('develop-scenes-brief');
    expect(store.loadProgressive()?.versions).toEqual([]);
    expect(store.manuscript()).toEqual([]);
  });
  it('resumes directly at the first whole story after interruption', async () => {
    const store = new MemoryProjectStore(); store.saveProgressive({ version: 1, input_key: inputKey(input), plan: 'Legacy seed', planning_source: 'manifestation', versions: [], pending: null, completed: false });
    expect((await new Orchestrator(store).runBook(input, model(store, 'develop-story'))).status).toBe('FAILED');
    const restored = new MemoryProjectStore();
    restoreSnapshot(restored, snapshotProject(store));
    const stages: string[] = [];
    const next = model(restored);
    const result = await new Orchestrator(restored).runBook(input, async (...args) => { stages.push(args[2]?.stage || ''); return next(...args); });
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(stages.every(stage => !stage.startsWith('design'))).toBe(true);
    expect(stages[0]).toBe('develop-story');
  });
  it('rejects corrupt or mismatched drafts before clearing a live project', async () => {
    const store = new MemoryProjectStore(); store.saveProgressive({ version: 1, input_key: inputKey(input), plan: 'Legacy seed', planning_source: 'manifestation', versions: [], pending: null, completed: false });
    await new Orchestrator(store).runBook(input, model(store));
    const snap = snapshotProject(store);
    (snap.files.progressive_draft as any).versions[0].chapters[1].chapter = 1;
    expect(() => restoreSnapshot(store, snap)).toThrow('malformed');
    expect(store.manuscript()).toHaveLength(2);
  });
});
