import { expect, it } from 'vitest';
import { validateCanon } from '../utils/novel/v2/storyCanon';
import type { ThesisPlan } from '../utils/novel/v2/theses';

it('reports every canon defect in one refusal, so one repair can answer them all', () => {
  const thesis = (id: string, fact_ids: string[]) => ({ id, fact_ids });
  const fact = (id: string, established_in: string, learned_in: string) => ({ id, truth: 'True', established_in, knowledge: [{ character_id: 'C1', learned_in }] });
  const plan = { ending: 'End', characters: [{ id: 'C1' }], theses: [thesis('T1', ['F1']), thesis('T2', ['F2', 'F3'])],
    canon: { resolution: 'End', facts: [fact('F1', 'T1', 'T1'), fact('F2', 'T2', 'INITIAL'), fact('F3', 'T2', 'T1')] } } as unknown as ThesisPlan;
  let message = '';
  try { validateCanon(plan); } catch (error) { message = (error as Error).message; }
  expect(message).toContain('2 canon defects');
  expect(message).toContain('Canonical knowledge F2 for C1 in INITIAL precedes');
  expect(message).toContain('Canonical knowledge F3 for C1 in T1 precedes');
  plan.canon!.facts[2].knowledge[0].learned_in = 'T2';
  expect(() => validateCanon(plan)).toThrow(/^Canonical knowledge F2 for C1/);
  plan.canon!.facts[1].knowledge[0].learned_in = 'T2';
  expect(() => validateCanon(plan)).not.toThrow();
});
