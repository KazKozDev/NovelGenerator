import { describe, expect, it } from 'vitest';
import { trackedItems, statesBefore, readStates, stateIssues, stateBrief, type StateLedger } from '../utils/novel/v2/stateLedger';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { premiseReply } from './premiseReplies';
import type { ThesisPlan } from '../utils/novel/v2/theses';

const thesis = (id: string, requires: string[] = []) => ({ id, chapter: 1, pov_id: 'C1', fact_ids: id === 'T1' ? ['F1'] : [], participants: [{ character_id: 'C1', intention: 'Keep it hidden', knows: [], does: 'Locks the drawer' }], when: 'Night', where: 'Study', state_before: 'Quiet', action: 'Nora hides the notebook', why: 'Fear', resistance: 'Time', outcome: 'Hidden', establishes: [], reader_learns: [], requires, writer_task: 'Show', target_words: 8 });
const plan = { title: 'T', premise_givens: [], ending: 'End', characters: [{ id: 'C1', name: 'Nora', goal: 'Hide', initial_knowledge: [], capabilities: [], limitations: [] }],
  tracked: [{ id: 'K1', name: 'The hidden notebook', start: 'In the desk drawer' }, { id: '', name: 'Malformed', start: '' }],
  canon: { resolution: 'End', facts: [{ id: 'F1', truth: 'The notebook exists.', established_in: 'T1', knowledge: [] }] }, theses: [thesis('T1'), thesis('T2', ['T1']), thesis('T3', ['T2'])] } as unknown as ThesisPlan;
const scene = 'Nora slid the notebook under the passenger seat of her car.\n\nShe drove home.';

describe('state ledger', () => {
  it('follows the planner\'s things and every character, and nothing when the plan names none', () => {
    expect(trackedItems(plan).map(item => item.id)).toEqual(['K1', '@C1']);
    expect(trackedItems({ ...plan, tracked: undefined } as ThesisPlan)).toEqual([]);
  });
  it('hands a scene the last state the text recorded, skipping scenes that left a thing alone', () => {
    const ledger: StateLedger = { T1: { revision: 'r', states: [{ id: 'K1', status: 'changed', state: 'In her bag', quote: 'q' }] }, T2: { revision: 'r', states: [{ id: 'K1', status: 'unchanged', state: 'In her bag', quote: '' }] } };
    expect(statesBefore(plan, ledger, 'T1')[0]).toMatchObject({ state: 'In the desk drawer', since: 'before the book' });
    expect(statesBefore(plan, ledger, 'T3')[0]).toMatchObject({ state: 'In her bag', since: 'T1' });
    expect(stateBrief(statesBefore(plan, ledger, 'T3'))).toContain('- The hidden notebook: In her bag (T1)');
    expect(stateBrief(statesBefore(plan, ledger, 'T3'))).not.toContain('Where Nora is');
  });
  it('believes an answer only as far as its quote is in the scene', () => {
    const before = statesBefore(plan, {}, 'T2');
    const read = (answer: object) => readStates({ states: [{ id: 'K1', ...answer }] }, before, scene)[0];
    expect(read({ status: 'conflict', state: 'Under the car seat', quote: 'Nora slid the notebook under the  passenger seat of her car.' })).toMatchObject({ status: 'conflict', state: 'Under the car seat' });
    expect(read({ status: 'conflict', state: 'In the safe', quote: 'She locked it in the safe.' })).toMatchObject({ status: 'unchanged', state: 'In the desk drawer' });
    expect(read({ status: 'changed', state: 'Gone', quote: '' }).status).toBe('unchanged');
    expect(readStates({ states: [] }, before, scene).map(state => state.status)).toEqual(['unchanged', 'unchanged']);
    expect(() => readStates({}, before, scene)).toThrow('array');
  });
  it('turns a conflict into a finding that names both states and the scene that left the first', () => {
    const before = statesBefore(plan, { T1: { revision: 'r', states: [{ id: 'K1', status: 'changed', state: 'In the false bottom of the drawer', quote: 'q' }] } }, 'T2');
    const issues = stateIssues(before, readStates({ states: [{ id: 'K1', status: 'conflict', state: 'Under the car seat', quote: 'Nora slid the notebook under the passenger seat of her car.' }] }, before, scene), 'T2');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'major', kind: 'continuity', thesis_ids: ['T2'], evidence: 'Nora slid the notebook under the passenger seat of her car.' });
    expect(issues[0].problem).toContain('as T1 left it — "In the false bottom of the drawer"');
  });
});

it('asks each scene where the things are, tells the next writer, and sends a conflict back for repair', async () => {
  const store = new MemoryProjectStore(); const writes: string[] = []; const reviewSchemas: any[] = []; let repair = '';
  await new Orchestrator(store).runBook({ premise: 'Nora hides a notebook.', author_requirements: '', genre: 'thriller', chapter_count: 1, target_total_words: 24, generation_mode: 'theses', planning_version: 2 }, async (prompt, _system, options) => {
    const stage = options?.stage;
    if (stage === 'thesis-state') {
      const id = prompt.match(/SCENE (T\d):/)![1];
      return JSON.stringify({ states: [id === 'T1' ? { id: 'K1', status: 'changed', state: 'In her bag', quote: 'Nora put the notebook in her bag.' } : { id: 'K1', status: 'conflict', state: 'In the desk drawer', quote: 'The notebook lay in the desk drawer.' }] });
    }
    { const premise = premiseReply(options); if (premise) return premise; }
    if (stage === 'thesis-plan') return JSON.stringify(plan);
    if (stage === 'thesis-plan-review') return JSON.stringify({ ready: true, issues: [] });
    if (stage === 'thesis-block-write') { writes.push(prompt); return writes.length === 1 ? 'Nora put the notebook in her bag.\n\nShe left.' : 'The notebook lay in the desk drawer.\n\nShe stared at it.'; }
    if (stage === 'thesis-block-review') { reviewSchemas.push(options?.schema); return JSON.stringify({ ready: true, issues: [] }); }
    if (stage === 'thesis-block-repair') { repair = prompt; throw new Error('Stop at the repair'); }
    throw new Error(`Unexpected stage ${stage}`);
  });
  expect((reviewSchemas[0] as any).properties.state_trace).toBeUndefined();
  expect(writes[1]).toContain('- The hidden notebook: In her bag (T1)');
  expect(store.loadTheses()!.state_ledger!.T1.states[0]).toMatchObject({ id: 'K1', status: 'changed', state: 'In her bag' });
  expect(repair).toContain('as T1 left it');
  expect(repair).toContain('The notebook lay in the desk drawer.');
});
