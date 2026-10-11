import { describe, expect, it } from 'vitest';
import { contenders, emptyRecord, measure, chooseDraft, sceneKind, type DuelRecord } from '../utils/novel/v2/duel';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { premiseReply } from './premiseReplies';
import type { ThesisPlan } from '../utils/novel/v2/theses';

const words = (n: number, seed = 'w') => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ') + '.';

describe('two writers, one scene', () => {
  it('has both write until one plainly leads a kind of scene, then tries the other again every fifth scene', () => {
    const record = emptyRecord();
    expect(contenders(record, 'peopled', 1)).toEqual(['writer', 'writer2']);
    record.peopled = { writer: 3, writer2: 2 };
    expect(contenders(record, 'peopled', 6)).toEqual(['writer', 'writer2']);
    record.peopled = { writer: 1, writer2: 4 };
    expect(contenders(record, 'peopled', 6)).toEqual(['writer2']);
    expect(contenders(record, 'peopled', 10)).toEqual(['writer', 'writer2']);
    expect(contenders(record, 'solitary', 6)).toEqual(['writer', 'writer2']);
    expect(sceneKind([1])).toBe('solitary'); expect(sceneKind([1, 2])).toBe('peopled');
  });
  it('measures a draft without reading it, and names what puts it out', () => {
    expect(measure(words(100), 100, 'T2', [], []).out).toBe('');
    expect(measure(words(40), 100, 'T2', [], []).out).toBe('only 40 of 100 words');
    expect(measure(words(250), 100, 'T2', [], []).out).toContain('250 words against a target of 100');
    const twice = 'A cold suspicion settled in her stomach as she watched him.';
    expect(measure(`${twice} ${words(90)}`, 100, 'T2', [{ thesis_id: 'T1', text: twice }], []).out).toBe('repeats a sentence the book already has');
    const measured = measure(`Her heart hammered against her ribs. Her stomach lurched. ${words(90)}`, 100, 'T2', [], [{ device: 'Heart pounding', markers: ['hammered', 'ribs'], example: '' }]);
    expect(measured).toMatchObject({ bodily: 1, spent: 1 });
  });
  it('lets a draft win without the editor when the other failed its measurements, and asks the editor blind otherwise', async () => {
    const draft = (author: 'writer' | 'writer2', text: string) => ({ author, text, measured: measure(text, 100, 'T2', [], []) });
    let asked = 0;
    const silent = async () => { asked++; return ''; };
    expect(await chooseDraft([draft('writer', words(30)), draft('writer2', words(100))], {}, '', false, '', silent, () => {})).toMatchObject({ winner: 'writer2', by: 'the other failed its measurements' });
    expect(asked).toBe(0);
    let prompt = '';
    const pickA = async (p: string) => { prompt = p; return JSON.stringify({ outcome: 'A', voice: 'same', choose: 'A', because: 'The scene happens in it' }); };
    const first = draft('writer', 'FIRST ' + words(99)), second = draft('writer2', 'SECOND ' + words(99));
    expect((await chooseDraft([first, second], { id: 'T2' }, 'Earlier prose.', false, '', pickA, () => {})).winner).toBe('writer');
    expect((await chooseDraft([first, second], { id: 'T2' }, 'Earlier prose.', true, '', pickA, () => {})).winner).toBe('writer2');
    expect(prompt.indexOf('SECOND')).toBeLessThan(prompt.indexOf('FIRST'));
    expect(prompt).not.toMatch(/writer2|second writer|first writer/i);
    const logged: string[] = [];
    const useless = async () => JSON.stringify({ choose: 'both' });
    expect(await chooseDraft([draft('writer', words(180)), draft('writer2', words(100))], {}, '', false, '', useless, line => logged.push(line))).toMatchObject({ winner: 'writer2', by: 'measurements' });
    expect(logged[0]).toContain('Draft choice not obtained');
  });
});

it('drafts each scene twice, keeps the chosen draft, sends its repair back to its own writer, and remembers who won', async () => {
  const thesis = (id: string, requires: string[] = []) => ({ id, chapter: 1, pov_id: 'C1', fact_ids: id === 'T1' ? ['F1'] : [], participants: [{ character_id: 'C1', intention: 'Keep it hidden', knows: [], does: 'Locks the drawer' }], when: 'Night', where: 'Study', state_before: 'Quiet', action: 'Nora hides the notebook', why: 'Fear', resistance: 'Time', outcome: 'Hidden', establishes: [], reader_learns: [], requires, writer_task: 'Show', target_words: 8 });
  const plan = { title: 'T', premise_givens: [], ending: 'End', tracked: [{ id: 'K1', name: 'The notebook', start: 'On the desk' }], characters: [{ id: 'C1', name: 'Nora', goal: 'Hide', initial_knowledge: [], capabilities: [], limitations: [] }],
    canon: { resolution: 'End', facts: [{ id: 'F1', truth: 'The notebook exists.', established_in: 'T1', knowledge: [] }] }, theses: [thesis('T1'), thesis('T2', ['T1'])] } as unknown as ThesisPlan;
  const store = new MemoryProjectStore(); const routes: string[] = []; let saved: DuelRecord | undefined; let reviews = 0; let repairRoute = '';
  await new Orchestrator(store, undefined, null, () => {}, undefined, { name: 'second', record: { load: () => undefined, save: record => { saved = record; } } })
    .runBook({ premise: 'Nora hides a notebook.', author_requirements: '', genre: 'thriller', chapter_count: 1, target_total_words: 16, generation_mode: 'progressive', planning_version: 2 }, async (prompt, _system, options) => {
      const stage = options?.stage || '';
      { const premise = premiseReply(options); if (premise) return premise; }
      if (stage === 'thesis-synopsis') return 'A notebook is hidden.';
      if (stage === 'thesis-state') return JSON.stringify({ states: [], minds: [] });
      if (stage === 'thesis-chapter-development') return JSON.stringify({ chapters: [{ chapter: 1, start: 's', goal: 'g', steps: [{ id: 'C1S1', action: 'a', resistance: 'r', consequence: 'c', necessity: 'n' }], result: 'r', handoff: 'h', budget_rationale: 'b' }] });
      if (stage === 'thesis-chapter-development-review' || stage === 'thesis-plan-review') return JSON.stringify({ ready: true, issues: [] });
      if (stage === 'thesis-plan') return JSON.stringify(plan);
      if (stage === 'thesis-block-write') { routes.push(options!.route!); return JSON.stringify({ tool: 'finish', text: options!.route === 'writer2' ? 'SECOND writer: Nora locked the notebook in the drawer.' : 'FIRST writer: Nora hid the notebook under the seat.' }); }
      if (stage === 'thesis-draft-choice') return JSON.stringify({ outcome: 'same', voice: 'same', choose: prompt.indexOf('SECOND writer') < prompt.indexOf('FIRST writer') ? 'A' : 'B', because: 'It plays the hiding' });
      if (stage === 'thesis-block-review') return JSON.stringify(++reviews === 1 ? { ready: false, issues: [{ severity: 'major', kind: 'missing_event', evidence: '@P0001', consequence: 'c', thesis_ids: ['T1'], problem: 'p', required_change: 'r' }] } : { ready: true, issues: [] });
      if (stage === 'thesis-block-repair') { repairRoute = options!.route!; return JSON.stringify({ tool: 'finish' }); }
      throw new Error(`Stop at ${stage}`);
    });
  const draft = store.loadTheses()!;
  expect(routes.slice(0, 2).sort()).toEqual(['writer', 'writer2']);
  expect(draft.blocks[0].text).toContain('SECOND writer');
  expect(draft.authors!.T1).toBe('writer2');
  expect(repairRoute).toBe('writer2');
  expect(draft.duels![0]).toMatchObject({ thesis_id: 'T1', kind: 'solitary', winner: 'writer2', by: 'editor' });
  expect(saved!.solitary.writer2).toBeGreaterThanOrEqual(1);
  expect(store.runLog().some(entry => entry.detail.includes("T1 (solitary): two drafts, second writer's goes in — editor"))).toBe(true);
});
