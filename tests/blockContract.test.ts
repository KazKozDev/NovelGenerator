import { expect, it } from 'vitest';
import { blockContract } from '../utils/novel/v2/blockContract';
import type { ThesisPlan, Thesis } from '../utils/novel/v2/theses';
const thesis = (id: string, action: string, state_before: string): Thesis => ({ id, chapter: 1, pov_id: 'C', participants: [{ character_id: 'C', intention: 'Speak honestly', knows: [] }], when: 'Evening', where: 'Street', state_before, action, why: 'Trust', resistance: 'Fear', outcome: action, establishes: [], reader_learns: [], requires: [], writer_task: 'Show this event', target_words: 500 });
const plan: ThesisPlan = { title: 'Evening', premise_givens: [], characters: [], ending: 'Together', theses: [thesis('T01', 'Ron confesses', 'Friends'), thesis('T02', 'Harry responds', 'Ron has confessed'), thesis('T03', 'They arrange another date', 'Mutual agreement')] };
plan.theses[0].reader_learns = ['Ron loves Harry']; plan.theses[1].reader_learns = [' Ron loves   Harry ', 'Harry reciprocates'];
it('gives the response its own event while retaining the earlier disclosure owner and reserving the next event', () => {
  const blocks = plan.theses.map(t => ({ thesis_id: t.id, text: `${t.id} actual prose`, review: { ready: true, issues: [] } }));
  const contract = blockContract(plan, 'T02', blocks);
  expect(contract.happens_here_first.action).toBe('Harry responds');
  expect(contract.happens_here_first.disclosures).toEqual(['Harry reciprocates']);
  expect(contract.continuing_disclosures[0].first_owner).toBe('T01');
  expect(contract.already_written.map(e => e.owner)).toEqual(['T01']);
  expect(contract.continue_from.actual_previous_ending).toBe('T01 actual prose');
  expect(contract.handoff.reserved_action).toBe('They arrange another date');
});
it('does not label unwritten plan events as completed and preserves uncertainty in written prose', () => {
  expect(blockContract(plan, 'T02', []).already_written).toEqual([]);
  expect(blockContract(plan, 'T02', []).continue_from.actual_previous_ending).toBeNull();
  const contract = blockContract(plan, 'T02', [{ thesis_id: 'T01', text: 'Current unfinished ending', review: { ready: false, status: 'unavailable', error: 'Bad checker reply', issues: [] } }]);
  expect(contract.already_written[0].review_status).toBe('unavailable');
  expect(contract.continue_from.actual_previous_ending).toBe('Current unfinished ending');
  expect(() => blockContract(plan, 'unknown', [])).toThrow();
});
