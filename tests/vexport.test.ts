import { describe, it, expect, vi } from 'vitest';
import { restoreSnapshot, snapshotProject } from '../utils/novel/v2/export';
import { PersistentProjectStore } from '../utils/novel/v2/persistent';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import type { BookDesign, ProjectInput } from '../utils/novel/v2/types';

const input: ProjectInput = {
  premise: 'A lighthouse keeper finds a door in the sea.',
  chapter_count: 1,
  genre: 'mystery',
  target_total_words: 2000,
  author_requirements: '',
  story_language: 'English',
  planning_language: 'English',
};

function design(): BookDesign {
  return {
    contract: { explicit_requirements: [], inferred_decisions: [], language: 'English', tense: 'past', narrative_perspective: 'third', genre_expectations_selected: [] },
    dramatic_core: { distinctive_situation: 's', central_conflict: 'c', stakes: 's', why_now: 'n', sources_of_development: [] },
    style_contract: { narrative_distance: 'd', attention: 'a', register: 'r', humor: 'h', emotional_expression: 'e' },
    characters: [],
    world_rules: [],
    causal_map: [],
    ending: { central_resolution: 'r', decisive_action_or_choice: 'd', required_setup: [], intentionally_open_questions: [] },
    chapter_map: [{ chapter: 1, function: 'f', main_change: 'm', event_ids: [], dependencies: [], setup_or_payoff: [], pov_id: null, target_words: 2000 }],
  };
}

function filled(): MemoryProjectStore {
  const store = new MemoryProjectStore();
  store.saveInput(input);
  store.saveDesign(design());
  store.saveManuscript(1, 'Zor climbed.');
  store.saveState({ facts: [], events: [{ id: 'x', description: 'd', participants: [], evidence_refs: [] }], conditions: {}, knowledge: {}, beliefs: {}, reader_disclosures: [], names: [] });
  store.saveStateSnapshot(1, store.loadState());
  store.saveThreads([{ id: 't1', description: 'door', status: 'open', setup_refs: [], payoff_refs: [] }]);
  store.log('scene', 'written');
  store.checkpoint('chapter-1');
  return store;
}

describe('project snapshot', () => {
  it('round-trips the whole slot through plain JSON', () => {
    const snap = snapshotProject(filled());
    expect(snap.version).toBe(1);
    expect(JSON.parse(JSON.stringify(snap)).files.manuscript).toEqual([{ chapter: 1, text: 'Zor climbed.' }]);
    const fresh = new MemoryProjectStore();
    restoreSnapshot(fresh, JSON.parse(JSON.stringify(snap)));
    expect(fresh.manuscript()).toEqual([{ chapter: 1, text: 'Zor climbed.' }]);
    expect(fresh.loadStateSnapshot(1)?.events).toHaveLength(1);
    expect(fresh.loadThreads()).toHaveLength(1);
    expect(fresh.loadChapterMap()).toHaveLength(1);
    expect(fresh.checkpoints()).toContain('chapter-1');
  });

  it('refuses garbage instead of replacing the live slot', () => {
    const store = filled();
    expect(() => restoreSnapshot(store, { version: 2, files: {} })).toThrow(/Unsupported snapshot/);
    expect(() => restoreSnapshot(store, { version: 1, files: {} })).toThrow(/no input/);
    expect(() => restoreSnapshot(store, 'nope')).toThrow(/Not a project snapshot/);
    // The live slot survived all three attempts.
    expect(store.manuscript()).toHaveLength(1);
  });
});

describe('persistent store', () => {
  it('migrates a localStorage-only book when IndexedDB is absent', async () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    } as Storage);
    // indexedDB is absent in this environment: migration path via legacy keys.
    vi.stubGlobal('indexedDB', undefined);
    try {
      data.set('ngv2.input', JSON.stringify(input));
      data.set('ngv2.design', JSON.stringify(design()));
      data.set('ngv2.manuscript', JSON.stringify([{ chapter: 1, text: 'Zor climbed.' }]));
      const store = await PersistentProjectStore.open();
      expect(store.loadInput()?.premise).toBe(input.premise);
      expect(store.manuscript()).toEqual([{ chapter: 1, text: 'Zor climbed.' }]);
      // Legacy keys go away once the book lives in the new slot.
      expect(data.has('ngv2.input')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
