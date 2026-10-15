import { validatePacket } from '../utils/novel/craft/projection';
import { describe, expect, it } from 'vitest';
import { authorArchitecture, scriptedAuthorLLM } from './fixtures/authorArchitecture';
import { CraftSession } from '../utils/novel/craft/state';
import { planArchitecture, acceptArchitecture } from '../utils/novel/craft/planning';
import { continueArchitecture, emptyEnacted, executionBase, projectArchitecture } from '../utils/novel/craft/runtime';
import type { EnactedScene } from '../utils/novel/craft/types';

function enacted(): EnactedScene { return { id: 'SC1', textRevision: 'evidence', events: [{ event: 'E1', outcome: 'Key obtained at cost.', quote: 'She took it.' }], acquisitions: [], resources: [{ resource: 'R1', available: false, quote: 'It was lost.' }], relationships: [], options: ['Act without the key.'], summary: 'Cover lost.', deferred: [], deviations: [] }; }

describe('author forms and discovery routes', () => {
  it('keeps an outliner route stable unless actual prose establishes a deviation', async () => {
    const plan = authorArchitecture(), session = new CraftSession({}, 'book', () => {});
    const result = await continueArchitecture(plan, enacted(), session, async () => { throw new Error('No speculative replanning.'); });
    expect(result).toBe(plan);
  });
  it('lets discovery change an unwritten connective outcome while preserving published history and climax', async () => {
    const plan = authorArchitecture(); plan.form.method = 'discovery'; plan.contract.method = 'discovery';
    const session = new CraftSession({}, 'book', () => {}); await acceptArchitecture(plan, session);
    const changed = structuredClone(plan.graph.scenes[1]); changed.outcome = 'She photographs the ledger instead of carrying it.';
    const event = { ...plan.world.events[1], outcome: changed.outcome };
    const result = await continueArchitecture(plan, enacted(), session, async () => JSON.stringify({ scenes: [changed], events: [event] }));
    expect(result.graph.scenes[0]).toEqual(plan.graph.scenes[0]);
    expect(result.graph.scenes[1].outcome).toContain('photographs');
    expect(result.graph.scenes[2]).toEqual(plan.graph.scenes[2]);
    expect(result.concept.ending).toEqual(plan.concept.ending);
  });
  it('lets hybrid discover tactics but refuses a changed planned outcome or a rewritten climax', async () => {
    const plan = authorArchitecture(); plan.form.method = 'hybrid'; plan.contract.method = 'hybrid';
    const session = new CraftSession({}, 'book', () => {}); await acceptArchitecture(plan, session);
    const changed = structuredClone(plan.graph.scenes[1]); changed.sceneContract.action = 'She distracts Cole by requesting an entry receipt.';
    const result = await continueArchitecture(plan, enacted(), session, async () => JSON.stringify({ scenes: [changed], events: [] }));
    expect(result.graph.scenes[1].sceneContract.action).toContain('entry receipt');
    const other = new CraftSession({}, 'other', () => {}); await acceptArchitecture(plan, other);
    await expect(continueArchitecture(plan, enacted(), other, async () => JSON.stringify({ scenes: [{ ...changed, outcome: 'The guard wins and the ledger burns.' }], events: [] }))).rejects.toThrow('selected writing method');
    const third = new CraftSession({}, 'third', () => {}); await acceptArchitecture(plan, third);
    await expect(continueArchitecture(plan, enacted(), third, async () => JSON.stringify({ scenes: [plan.graph.scenes[2]], events: [] }))).rejects.toThrow('protected or enacted');
  });
  it('supports flexible chapter sizes and batches long projections without losing causal predecessors', async () => {
    const plan = authorArchitecture();
    plan.form.layout = 'flexible'; plan.contract.layout = 'flexible'; plan.contract.chapters = 3; plan.contract.words = 3600;
    plan.graph.scenes = Array.from({ length: 9 }, (_, i) => {
      const original = structuredClone(plan.graph.scenes[i % 3]), order = i + 1;
      return { ...original, id: `SC${order}`, order, chapter: i < 2 ? 1 : i < 6 ? 2 : 3, events: [`E${order}`], dependsOn: i ? [`SC${i}`] : [], causedBy: i ? [{ scene: `SC${i}`, consequence: 'The preceding cost forces a new route.', relation: 'therefore' as const }] : [] };
    });
    plan.form.sceneSlots = plan.graph.scenes.map(s => ({ id: s.id, chapter: s.chapter, order: s.order, targetWords: 400 }));
    plan.world.events = plan.graph.scenes.map((s, i) => ({ ...structuredClone(plan.world.events[i % 3]), id: `E${i + 1}`, dependsOn: i ? [`E${i}`] : [] }));
    plan.beats.beats[1].scene = 'SC9'; plan.beats.beats[1].eventIds = ['E9'];
    plan.promises.promises[0].payoff.scene = 'SC9';
    plan.pacing.scenes = plan.graph.scenes.map((s, i) => ({ ...structuredClone(plan.pacing.scenes[i % 3]), scene: s.id }));
    const input = { premise: plan.contract.premise, genre: 'thriller', author_requirements: '', chapter_count: 3, target_total_words: 3600, scene_layout: 'flexible' as const };
    const session = new CraftSession({}, 'book', () => {}), calls: { stage: string; prompt: string }[] = [];
    const result = await planArchitecture(input, session, scriptedAuthorLLM(plan, calls));
    expect(result.form.sceneSlots.map(s => s.chapter)).toEqual([1,1,2,2,2,2,3,3,3]);
    expect(result.graph.scenes).toHaveLength(9);
    expect(() => validatePacket(projectArchitecture(result), 3, 9, 'flexible')).not.toThrow();
    const batches = calls.filter(c => c.stage === 'craft-author-graph');
    expect(batches).toHaveLength(2);
    expect(batches[1].prompt).toContain('SC6');
    expect(batches[1].prompt).toContain('priorConsequences');
    const after = calls.length;
    await planArchitecture(input, session, scriptedAuthorLLM(plan, calls));
    expect(calls).toHaveLength(after);
  });
  it('keeps a false belief attributed and replaces it only after the viewpoint acquires counterevidence', () => {
    const plan = authorArchitecture();
    plan.revelations.facts.push({ id: 'FB', truth: 'Cole would never conceal a forged record.', kind: 'belief', attributedTo: 'C1', supersededBy: 'FR', initialKnownBy: ['C1'], acquisitions: [], readerEvidence: [], reveal: 'SC1', mode: 'mystery' });
    plan.revelations.facts.push({ id: 'FR', truth: 'Cole knowingly altered the signed ledger.', kind: 'objective', attributedTo: null, supersededBy: null, initialKnownBy: [], acquisitions: [{ character: 'C1', scene: 'SC2', action: 'Compare the signed entry with the ledger.', evidenceEvent: 'E2' }], readerEvidence: [], reveal: 'SC2', mode: 'mystery' });
    const first = executionBase(plan, plan.graph.scenes[0], emptyEnacted());
    expect(first.availableFacts.find(f => f.id === 'FB')!.kind).toBe('belief');
    expect(JSON.stringify(first)).not.toContain('Cole knowingly altered');
    expect(JSON.stringify(first)).not.toContain('supersededBy');
    const state = emptyEnacted(); state.scenes.push({ ...enacted(), id: 'SC2', acquisitions: [{ character: 'C1', fact: 'FR', quote: 'His signature was beneath the altered line.' }] });
    const later = executionBase(plan, plan.graph.scenes[2], state);
    expect(later.availableFacts.some(f => f.id === 'FB')).toBe(false);
    expect(later.availableFacts.find(f => f.id === 'FR')!.kind).toBe('objective');
  });
  it('keeps knowledge separate across viewpoint and timeline changes', () => {
    const plan = authorArchitecture();
    plan.form.timelines.push({ id: 'T0', function: 'Historical cause revealed later.' });
    plan.form.viewpoints.push({ id: 'C2', person: 'first-person', function: 'A competing interpretation.' });
    plan.characters.characters[1].voice.syntax = 'Clipped first-person fragments.';
    plan.graph.scenes[1].pov = 'C2'; plan.graph.scenes[1].timeline = 'T0';
    const state = emptyEnacted(); state.scenes.push({ ...enacted(), acquisitions: [{ character: 'C1', fact: 'F1', quote: 'The key broke.' }] });
    const execution = executionBase(plan, plan.graph.scenes[1], state);
    expect(execution.narrativePerson).toBe('first-person');
    expect(execution.availableFacts.map(f => f.id)).not.toContain('F1');
    expect(execution.profiles.find(c => c.id === 'C2')!.voice.syntax).toContain('Clipped');
  });
});
