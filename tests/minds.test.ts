import { describe, expect, it } from 'vitest';
import { hasMinds, knownFacts, mindRows, readMinds, mindIssues, writerScene, writerOutline, writerContract, writerRequest, turningPoints } from '../utils/novel/v2/minds';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { premiseReply } from './premiseReplies';
import type { ThesisPlan } from '../utils/novel/v2/theses';

const who = (id: string, intention: string, believes: string[], does: string) => ({ character_id: id, intention, knows: [], believes, does });
const thesis = (id: string, requires: string[], action: string, beneath: string, fact_ids: string[]) => ({ id, chapter: 1, pov_id: 'C1', fact_ids,
  participants: [who('C1', 'Keep the Thursdays secret', ['Claire suspects nothing'], 'Writes the date in her planner'), who('C2', 'SECRET-INTENT make Nora write the plan down', ['Nora will keep notes'], 'Lays cash on the desk')],
  when: 'Tuesday', where: 'Office', state_before: 'An ordinary intake', action, why: 'HIDDEN-WHY', resistance: 'She cannot react', outcome: 'Sessions are booked', beneath,
  establishes: [], reader_learns: [], requires, writer_task: 'Her gaze stays on their hands a beat too long', target_words: 8 });
const plan = { title: 'Thursday', premise_givens: ['PREMISE-TWIST Claire was scripting Nora'], ending: 'ENDING-SECRET Claire framed Nora',
  characters: [{ id: 'C1', name: 'Nora', goal: 'Keep both lives', initial_knowledge: [], capabilities: [], limitations: [] }, { id: 'C2', name: 'Claire', goal: 'SECRET-GOAL frame Nora', initial_knowledge: [], capabilities: [], limitations: [] }],
  tracked: [{ id: 'K1', name: 'The session notes', start: 'Blank, in the desk' }],
  canon: { resolution: 'ENDING-SECRET Claire framed Nora', facts: [
    { id: 'F1', truth: 'Nora meets a man on Thursdays.', established_in: 'INITIAL', reader_learns_in: 'T1', knowledge: [{ character_id: 'C1', learned_in: 'INITIAL' }, { character_id: 'C2', learned_in: 'INITIAL' }] },
    { id: 'F2', truth: 'Claire describes how she would kill her husband.', established_in: 'T2', reader_learns_in: 'T2', knowledge: [{ character_id: 'C1', learned_in: 'T2' }, { character_id: 'C2', learned_in: 'T2' }] },
    { id: 'F3', truth: 'Claire has known about the affair from the start.', established_in: 'INITIAL', reader_learns_in: 'T3', knowledge: [{ character_id: 'C2', learned_in: 'INITIAL' }, { character_id: 'C1', learned_in: 'T3' }] }] },
  theses: [thesis('T1', [], 'The couple arrive; Claire mentions Thursday evenings', 'BENEATH-ONE Claire is testing her', ['F1']),
    thesis('T2', ['T1'], 'Claire describes a fantasy', 'BENEATH-TWO it is a script', ['F2']), thesis('T3', ['T1', 'T2'], 'NEXT-ACTION Nora rereads her notes', 'Nothing hidden', ['F3'])] } as unknown as ThesisPlan;

describe('minds kept apart', () => {
  it('is on for a plan that says what lies beneath its scenes', () => {
    expect(hasMinds(plan)).toBe(true);
    expect(hasMinds({ ...plan, theses: plan.theses.map(t => ({ ...t, beneath: undefined })) } as ThesisPlan)).toBe(false);
  });
  it('gives the writer the head of the point-of-view character and nothing that she does not have', () => {
    const shown = JSON.stringify([writerRequest({ premise: 'PREMISE-TEXT', author_requirements: 'Past tense', genre: 'thriller', chapter_count: 1, target_total_words: 24 }), writerOutline(plan, 'T2'), writerScene(plan, 'T2', {}), writerContract(plan, 'T2', [])]);
    for (const hidden of ['PREMISE-TEXT', 'PREMISE-TWIST', 'ENDING-SECRET', 'SECRET-GOAL', 'SECRET-INTENT', 'HIDDEN-WHY', 'BENEATH-', 'NEXT-ACTION', 'known about the affair from the start']) expect(shown).not.toContain(hidden);
    expect(shown).toContain('Claire suspects nothing');
    expect(shown).toContain('Lays cash on the desk');
    expect(shown).toContain('Nora meets a man on Thursdays.');
    expect(shown).toContain('Her gaze stays on their hands');
    expect(shown).toContain('Past tense');
    expect(JSON.stringify(writerScene({ ...plan, characters: plan.characters.map(c => c.id === 'C1' ? { ...c, initial_knowledge: ['She is a marriage counselor'] } : c) } as ThesisPlan, 'T2', {}))).toContain('She is a marriage counselor');
    const reviewed = [{ thesis_id: 'T1', text: 'Earlier scene.', review: { ready: true, issues: [], state_trace: { source_revision: '', events: [], checks: {} } } }] as any;
    expect(JSON.stringify(writerContract(plan, 'T2', reviewed))).not.toContain('actual_consequence_checks');
  });
  it('knows what a person has learned by a scene from the plan, and from what the text showed them learning', () => {
    expect([...knownFacts(plan, {}, 'C1', 'T2')]).toEqual(['F1']);
    expect([...knownFacts(plan, { T1: { minds: [{ key: 'C1|F3', status: 'learns', quote: 'q' }] } }, 'C1', 'T2')].sort()).toEqual(['F1', 'F3']);
  });
  it('asks of a scene only what its people and the reader do not yet have', () => {
    const keys = mindRows(plan, {}, 'T1').map(row => `${row.key}:${row.due}`);
    expect(keys).toEqual(['C1|F2:T2', 'C1|F3:T3', '@READER|F2:T2', '@READER|F3:T3', 'C2|F2:T2']);
    expect(mindRows(plan, {}, 'T1', 3).map(row => row.key)).toEqual(['C1|F2', 'C1|F3', '@READER|F2']);
    expect(mindRows(plan, {}, 'T2').find(row => row.key === 'C1|F2')!.due).toBe('here');
  });
  it('turns knowledge from a later scene into a finding, and leaves alone what the scene is meant to give', () => {
    const scene = 'Nora wrote the date down.\n\nShe thought: your wife is describing your murder.';
    const rows = mindRows(plan, {}, 'T1');
    const answers = readMinds({ minds: [{ key: 'C1|F2', status: 'already_knows', quote: 'She thought: your wife is describing your murder.' }, { key: 'C1|F3', status: 'learns', quote: 'A sentence that is not in the scene.' }] }, rows, scene);
    expect(answers.find(answer => answer.key === 'C1|F3')!.status).toBe('no');
    const issues = mindIssues(rows, answers, 'T1');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'major', kind: 'unsupported_knowledge', thesis_ids: ['T1'], evidence: 'She thought: your wife is describing your murder.' });
    expect(issues[0].problem).toContain('Nora already knows');
    const here = mindRows(plan, {}, 'T2');
    expect(mindIssues(here, readMinds({ minds: [{ key: 'C1|F2', status: 'learns', quote: 'She thought: your wife is describing your murder.' }] }, here, scene), 'T2')).toEqual([]);
  });
  it('tests the scenes the most later scenes hang from', () => {
    expect(turningPoints(plan)).toEqual(['T1', 'T2']);
  });
});

it('writes a sealed book: the writer never sees the truth, the ledger catches knowledge from a later scene, and each person in a turning point is asked alone', async () => {
  const store = new MemoryProjectStore(); const writes: string[] = []; const stages: string[] = []; let statePrompt = ''; let repair = ''; let choicePrompt = '';
  await new Orchestrator(store).runBook({ premise: 'PREMISE-TEXT Claire was scripting Nora all along.', author_requirements: 'Past tense', genre: 'thriller', chapter_count: 1, target_total_words: 24, generation_mode: 'theses', planning_version: 2 }, async (prompt, _system, options) => {
    const stage = options?.stage || ''; stages.push(stage);
    if (stage === 'thesis-choice') { choicePrompt ||= prompt; return JSON.stringify({ would_do: 'Says nothing and books the sessions', otherwise: 'Refers them on', because: 'Speaking costs her licence' }); }
    if (stage === 'thesis-choice-compare') return JSON.stringify({ ready: true, issues: [] });
    if (stage === 'thesis-state') { statePrompt ||= prompt; return JSON.stringify({ states: [], minds: [{ key: 'C1|F2', status: 'already_knows', quote: 'She thought of the murder Claire kept describing.' }] }); }
    { const premise = premiseReply(options); if (premise) return premise; }
    if (stage === 'thesis-plan') return JSON.stringify(plan);
    if (stage === 'thesis-plan-review') return JSON.stringify({ ready: true, issues: [] });
    if (stage === 'thesis-block-write') { writes.push(prompt); return 'Nora wrote the date in her planner.\n\nShe thought of the murder Claire kept describing.'; }
    if (stage === 'thesis-block-review') return JSON.stringify({ ready: true, issues: [] });
    if (stage === 'thesis-block-repair') { repair = prompt; throw new Error('Stop at the repair'); }
    throw new Error(`Unexpected stage ${stage}`);
  });
  for (const hidden of ['PREMISE-TEXT', 'PREMISE-TWIST', 'ENDING-SECRET', 'SECRET-GOAL', 'SECRET-INTENT', 'BENEATH-', 'NEXT-ACTION', 'read_plan']) expect(writes[0]).not.toContain(hidden);
  expect(writes[0]).toContain('Claire suspects nothing');
  expect(writes[0]).toContain('THE SCENE TO WRITE, AS ITS POINT-OF-VIEW CHARACTER HAS IT');
  expect(writes[0]).not.toContain('handoff');
  expect(store.runLog().some(entry => entry.detail.includes('How this book is written: writer sealed'))).toBe(true);
  expect(statePrompt).toContain('Claire describes how she would kill her husband.');
  expect(repair).toContain('Nora already knows, thinks or assumes what they have no way to know yet (learns it in T2)');
  expect(stages.filter(stage => stage === 'thesis-choice')).toHaveLength(4);
  expect(choicePrompt).toContain('Claire suspects nothing');
  expect(choicePrompt).not.toContain('SECRET-INTENT');
  expect(choicePrompt).not.toContain('Thursday evenings');
});
