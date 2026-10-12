import { expect, it } from 'vitest';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { premiseReply } from './premiseReplies';
import type { ThesisPlan } from '../utils/novel/v2/theses';

const thesis = (id: string, requires: string[] = []) => ({ id, chapter: 1, pov_id: 'C1', fact_ids: id === 'T1' ? ['F1'] : [], participants: [{ character_id: 'C1', intention: 'Keep it hidden', knows: [], does: 'Locks the drawer' }], when: 'Night', where: 'Study', state_before: 'Quiet', action: 'Nora hides the notebook', why: 'Fear', resistance: 'Time', outcome: 'Hidden', establishes: [], reader_learns: [], requires, writer_task: 'Show', target_words: 8 });
const plan = { title: 'T', premise_givens: [], ending: 'End', characters: [{ id: 'C1', name: 'Nora', goal: 'Hide', initial_knowledge: [], capabilities: [], limitations: [] }],
  canon: { resolution: 'End', facts: [{ id: 'F1', truth: 'The notebook exists.', established_in: 'T1', knowledge: [] }] }, theses: [thesis('T1'), thesis('T2', ['T1'])] } as unknown as ThesisPlan;
const input = { premise: 'Nora hides a notebook.', author_requirements: '', genre: 'thriller', chapter_count: 1, target_total_words: 16, generation_mode: 'theses' as const, planning_version: 2 as const };
const verified = (count: number) => JSON.stringify({ ready: true, checks: Array.from({ length: count }, (_, issue) => ({ issue, status: 'repaired', evidence: '@P0001', explanation: 'The cause is now in the plan' })), issues: [] });

it('checks the plan once and repairs it once: no second stress test, and what the repair left open is carried, not repaired again', async () => {
  const store = new MemoryProjectStore(); const stages: string[] = []; let reviews = 0, stress = 0, repairs = 0;
  const result = await new Orchestrator(store).runBook(input, async (_prompt, _system, options) => {
    const stage = options?.stage || ''; stages.push(stage);
    if (stage === 'thesis-plan-stress') stress++;
    { const premise = premiseReply(options); if (premise) return premise; }
    if (stage === 'thesis-plan') return JSON.stringify(plan);
    if (stage === 'thesis-plan-repair') return JSON.stringify({ ...plan, title: `Repair ${++repairs}` });
    if (stage === 'thesis-plan-review') return ++reviews === 1 ? JSON.stringify({ ready: false, issues: [{ severity: 'major', thesis_ids: ['T1'], problem: 'The hiding has no cause', required_change: 'Give it one' }] })
      : JSON.stringify({ ready: false, checks: [{ issue: 0, status: 'unresolved', evidence: '@P0001', explanation: 'Still no cause' }], issues: [] });
    throw new Error(`Stop at ${stage}`);
  });
  expect(result.stoppedReason).toContain('Stop at thesis-block-write');
  expect(stress).toBe(1); expect(repairs).toBe(1);
  expect(stages.filter(stage => /plan|coverage/.test(stage))).toEqual(['thesis-plan', 'thesis-plan-review', 'thesis-premise-coverage', 'thesis-plan-stress', 'thesis-plan-dryrun', 'thesis-plan-repair', 'thesis-plan-review']);
  expect(store.loadTheses()!.plan_ready).toBe(true);
  expect(store.loadTheses()!.carried_findings!.map(issue => issue.problem)).toEqual(['The hiding has no cause']);
});
it('does not test again a plan that passed its first review unrepaired', async () => {
  const store = new MemoryProjectStore(); let stress = 0;
  await new Orchestrator(store).runBook(input, async (_prompt, _system, options) => {
    if (options?.stage === 'thesis-plan-stress') stress++;
    { const premise = premiseReply(options); if (premise) return premise; }
    if (options?.stage === 'thesis-plan') return JSON.stringify(plan);
    if (options?.stage === 'thesis-plan-review') return JSON.stringify({ ready: true, issues: [] });
    throw new Error(`Stop at ${options?.stage}`);
  });
  expect(stress).toBe(1);
});

it('does not build a second outline, however much is wrong with the first: it is repaired once and written', async () => {
  const store = new MemoryProjectStore(); const stages: string[] = []; let reviews = 0;
  const many = Array.from({ length: 13 }, (_, at) => ({ severity: 'major', thesis_ids: ['T1'], problem: `Construction failure ${at}`, required_change: 'Decide who acts' }));
  const result = await new Orchestrator(store).runBook(input, async (_prompt, _system, options) => {
    const stage = options?.stage || ''; stages.push(stage);
    { const premise = premiseReply(options); if (premise) return premise; }
    if (stage === 'thesis-plan') return JSON.stringify(plan);
    if (stage === 'thesis-plan-repair') return JSON.stringify({ ...plan, title: 'Repaired' });
    if (stage === 'thesis-plan-review') return ++reviews === 1 ? JSON.stringify({ ready: false, issues: many }) : verified(13);
    throw new Error(`Stop at ${stage}`);
  });
  expect(result.stoppedReason).toContain('Stop at thesis-block-write');
  expect(stages).not.toContain('thesis-replan');
  expect(stages.filter(stage => stage === 'thesis-plan-repair')).toHaveLength(1);
  expect(store.loadTheses()!.plan!.title).toBe('Repaired');
});
