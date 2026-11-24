import { describe, it, expect } from 'vitest';
import { CraftSession, revision, object, text, referenceSchema, assertSchema, hasProseQuote } from '../utils/novel/craft/state';
import { planArchitecture, validateArchitecture, acceptArchitecture, acceptedArchitecture } from '../utils/novel/craft/planning';
import { executionBase, commitEnacted, emptyEnacted, prepareExecution, executionPrompt } from '../utils/novel/craft/runtime';
import { authorArchitecture, authorProse, scriptedAuthorLLM } from './fixtures/authorArchitecture';
import { runCraftBook } from '../utils/novel/craft/craftOrchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { authorKey } from '../utils/novel/author';

const input = { premise: 'Nora exposes a forgery.', genre: 'thriller', author_requirements: '', chapter_count: 1, target_total_words: 1200 };
describe('sequential author engine', () => {
  it('compiles reference types without sharing enum restrictions across primitive fields', () => {
    const source = object({ id: text, timeline: text, description: text });
    const schema = referenceSchema(source, { timeline: ['T1'] });
    expect(() => assertSchema({ id: 'E1', timeline: 'T1', description: 'A concrete event.' }, schema)).not.toThrow();
    expect(() => assertSchema({ id: 'E1', timeline: 'T2', description: 'A concrete event.' }, schema)).toThrow('expected T1');
    expect(source.properties!.id.enum).toBeUndefined();
  });
  it('commits author operations once and retries an interrupted operation without losing prior decisions', async () => {
    const files: Record<string, string> = {}, session = new CraftSession(files, 'book', () => {});
    await session.put('source.json', { goal: 'Expose the forgery.' });
    let calls = 0;
    const run = () => session.run<{ decision: string }>('choice', 'choice.json', 'concept', ['source.json'], object({ decision: text }), 'Choose an action.', async () => { calls++; return '{"decision":"Speak."}'; });
    await run(); await run(); expect(calls).toBe(1);
    await session.put('source.json', { goal: 'Hide the forgery.' });
    expect(session.state.operations.choice.status).toBe('pending');
    await run(); expect(calls).toBe(2);
    await expect(session.run('fail', 'fail.json', 'concept', ['source.json'], object({ decision: text }), 'Decide.', async () => '{')).rejects.toThrow('saved decisions retained');
    expect(files['choice.json']).toContain('Speak.');
    const resumed = new CraftSession(files, 'book', () => {});
    expect(resumed.state.operations.fail.status).toBe('failed');
    await resumed.run('fail', 'fail.json', 'concept', ['source.json'], object({ decision: text }), 'Decide.', async () => '{"decision":"Continue."}');
    expect(resumed.state.operations.fail.status).toBe('committed');
  });
  it('restores an exact historical decision and makes its dependent work pending', async () => {
    const session = new CraftSession({}, 'book', () => {});
    await session.put('world.json', { cause: 'A physical trap.' });
    const original = session.state.revisions['world.json'];
    await session.run('route', 'route.json', 'graph', ['world.json'], object({ decision: text }), 'Choose.', async () => '{"decision":"Inspect the trap."}');
    await session.put('world.json', { cause: 'A mistaken replacement.' });
    await session.restoreJsonArtifact('world.json', original);
    expect(session.read('world.json')).toEqual({ cause: 'A physical trap.' });
    expect(session.state.operations.route.status).toBe('pending');
  });
  it('rejects an in-flight response after its source changes instead of overwriting newer decisions', async () => {
    const session = new CraftSession({}, 'book', () => {});
    await session.put('source.json', { goal: 'Original goal.' });
    await expect(session.run('route', 'route.json', 'graph', ['source.json'], object({ decision: text }), 'Choose.', async () => { await session.put('source.json', { goal: 'Changed goal.' }); return '{"decision":"A stale route."}'; })).rejects.toThrow('inputs changed');
    expect(session.files['route.json']).toBeUndefined();
  });
  it('grows contract → form → logline → concept → events → character/opposition → linked scenes', async () => {
    const files: Record<string, string> = {}, calls: { stage: string; prompt: string }[] = [];
    const session = new CraftSession(files, authorKey(input), () => {});
    const plan = await planArchitecture(input, session, scriptedAuthorLLM(authorArchitecture(), calls));
    validateArchitecture(plan);
    expect(calls.map(c => c.stage)).toEqual(['contract','form','logline','concept','cast','truth','characters','opposition','beats','promises','payoffs','revelations','pacing','graph'].map(s => `craft-author-${s}`));
    expect(calls.find(c => c.stage === 'craft-author-concept')!.prompt).toContain(plan.concept.logline);
    expect(calls.find(c => c.stage === 'craft-author-graph')!.prompt).toContain('key breaks.');
    expect(calls.every(c => !c.prompt.includes('How Books Are Written: Craft, Structure, and Bestseller Techniques'))).toBe(true);
    await acceptArchitecture(plan, session);
    expect(acceptedArchitecture(session)).toEqual(plan);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['book-contract.json','story-truth.json','character-engines.json','opposition-plan.json','promises.json','setups-payoffs.json','revelation-plan.json','pacing-plan.json','scene-graph.json']));
  });
  it('rejects broken causal references and future-scene knowledge presented as earlier acquisition', () => {
    const plan = authorArchitecture();
    plan.graph.scenes[1].causedBy[0].scene = 'SC3';
    expect(() => validateArchitecture(plan)).toThrow('earlier scene consequence');
    const other = authorArchitecture(); other.revelations.facts[1].acquisitions[0].evidenceEvent = 'unknown';
    expect(() => validateArchitecture(other)).toThrow('acquisition evidence');
  });
  it('uses enacted losses and reader reaction to prepare the next task while isolating future facts', async () => {
    const plan = authorArchitecture(), files: Record<string, string> = {}, calls: { stage: string; prompt: string }[] = [];
    const session = new CraftSession(files, 'book', () => {}), llm = scriptedAuthorLLM(plan, calls);
    await acceptArchitecture(plan, session);
    const afterOne = await commitEnacted(plan, plan.graph.scenes[0], authorProse(1), emptyEnacted(), session, llm);
    const afterTwo = await commitEnacted(plan, plan.graph.scenes[1], authorProse(2), afterOne, session, llm);
    const before = executionBase(plan, plan.graph.scenes[0], emptyEnacted());
    expect(before.availableFacts.some(f => f.id === 'F1')).toBe(false);
    const last = await prepareExecution(plan, plan.graph.scenes[2], afterTwo, '{"expectations":["How will she act without a key?"]}', session, llm);
    expect(last.availableFacts.some(f => f.id === 'F1')).toBe(true);
    expect(calls.find(c => c.stage === 'craft-author-execution')!.prompt).toContain('Testify publicly without a usable key.');
    expect(calls.find(c => c.stage === 'craft-author-adapt')!.prompt).toContain('How will she act without a key?');
    expect(executionPrompt(before, [])).not.toContain('The key has broken');
    expect(executionPrompt(before, [])).not.toContain(plan.concept.ending.externalOutcome);
    expect(afterTwo.scenes[1].textRevision).toBe(await revision(authorProse(2)));
  });
  it('does not promote invented quotes or planned acquisitions into enacted canon', async () => {
    const plan = authorArchitecture(), session = new CraftSession({}, 'book', () => {});
    await expect(commitEnacted(plan, plan.graph.scenes[0], authorProse(1), emptyEnacted(), session, async () => JSON.stringify({ events: [{ event: 'E1', quote: 'Invented prose.', outcome: 'She succeeds.' }], acquisitions: [], resources: [], relationships: [], options: [], summary: 'False.', deferred: [], deviations: [] }))).rejects.toThrow('exact prose evidence');
    expect(session.files['enacted-state.json']).toBeUndefined();
  });
  it('accepts resilient quote evidence with smart quotes, surrounding quotes, or punctuation variants', async () => {
    expect(hasProseQuote('Nora said, “The lock is broken.”', '"The lock is broken."')).toBe(true);
    expect(hasProseQuote('Nora took the key, slipping it into her pocket.', 'Nora took the key.')).toBe(true);
    expect(hasProseQuote('Nora took the key.\n\nShe walked away.', 'Nora took the key. She walked away.')).toBe(true);
    expect(hasProseQuote('Nora took the key.', 'Invented prose.')).toBe(false);

    const plan = authorArchitecture(), session = new CraftSession({}, 'book', () => {});
    const result = await commitEnacted(plan, plan.graph.scenes[0], authorProse(1), emptyEnacted(), session, async () => JSON.stringify({
      events: [{ event: 'E1', quote: '“Nora took the key”', outcome: 'She has the key.' }],
      acquisitions: [],
      resources: [{ resource: 'R1', available: true, quote: 'E1: Nora took the key.' }],
      relationships: [],
      options: [],
      summary: 'Nora took the key.',
      deferred: [],
      deviations: []
    }));
    expect(result.scenes).toHaveLength(1);
    expect(session.files['enacted-state.json']).toBeDefined();
  });
  it('runs the new author operations in the actual production entry point', async () => {
    const store = new MemoryProjectStore(), calls: { stage: string; prompt: string }[] = [];
    await runCraftBook(input, store, scriptedAuthorLLM(authorArchitecture(), calls), () => {});
    expect(store.manuscript()[0].text).toContain('The key snapped');
    const files = store.loadAuthor()!.desk!.files;
    expect(JSON.parse(files['enacted-state.json']).scenes).toHaveLength(3);
    expect(JSON.parse(files['engine-state.json']).phase).toBe('complete');
    expect(calls.filter(c => c.stage === 'craft-author-execution')).toHaveLength(3);
    expect(calls.filter(c => c.stage === 'craft-write')).toHaveLength(3);
    expect(files['scenes/SC3/reader-decision.json']).toContain('progress');
    expect(store.loadReport()).not.toBeNull();
  });
});
