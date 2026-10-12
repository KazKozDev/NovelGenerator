import { expect, it } from 'vitest';
import { developChapters, type ChapterDevelopmentState } from '../utils/novel/v2/chapterDevelopment';

const input = { premise: 'Jo hides a letter.', author_requirements: '', genre: 'drama', chapter_count: 1, target_total_words: 1000 };
const chapters = [{ chapter: 1, start: 'Jo holds the letter.', goal: 'Decide', steps: [{ id: 'C1S1', action: 'Jo hides it', resistance: 'Her sister watches', consequence: 'The sister searches', necessity: 'The choice' }], result: 'Hidden', handoff: 'Search begins', budget_rationale: 'One confrontation' }];

it('hands the planner a development its review could not get repaired, instead of ending the book', async () => {
  const state: ChapterDevelopmentState = { chapters: [] }; const stages: string[] = []; let reviewPrompt = '';
  await developChapters(input, 'Jo hides a letter.', '', async (prompt, _system, options) => {
    stages.push(options!.stage!);
    if (options!.stage === 'thesis-chapter-development') return JSON.stringify({ chapters });
    reviewPrompt = prompt;
    return JSON.stringify({ ready: false, issues: [{ chapter: 1, problem: 'C1S1 has no cause', required_change: 'Give it one' }] });
  }, state, () => {});
  expect(state.unresolved).toBe(true);
  expect(state.review!.issues).toHaveLength(1);
  expect(stages.filter(stage => stage.endsWith('review'))).toHaveLength(3);
  expect(reviewPrompt).toContain('absent from the synopsis is NOT a defect');
  const before = stages.length;
  await developChapters(input, 'Jo hides a letter.', '', async () => { throw new Error('A settled development is not reopened'); }, state, () => {});
  expect(stages).toHaveLength(before);
});

it('takes turns between the two models after a second refusal, even when the refusals differ', async () => {
  const { structuredResponse } = await import('../utils/novel/v2/llm');
  const routes: string[] = []; let n = 0;
  await structuredResponse('Task', '', async (_prompt, _system, options) => { routes.push(options!.route!); return JSON.stringify({ answer: ++n }); },
    ['answer'], raw => { if (raw.answer < 5) throw new Error(`Refused ${raw.answer}`); return raw.answer; }, { route: 'validator' });
  expect(routes).toEqual(['validator', 'validator', 'writer', 'validator', 'writer']);
});
it('puts a repair to the other model once the same refusal has come back twice', async () => {
  const { structuredResponse } = await import('../utils/novel/v2/llm');
  const routes: string[] = [];
  const value = await structuredResponse('Task', '', async (_prompt, _system, options) => {
    routes.push(options!.route!);
    return JSON.stringify({ answer: options!.route === 'writer' ? 'right' : 'wrong' });
  }, ['answer'], raw => { if (raw.answer !== 'right') throw new Error('Wrong answer'); return raw.answer; }, { route: 'validator' });
  expect(value).toBe('right');
  expect(routes).toEqual(['validator', 'validator', 'writer']);
});

it('sends the refused edits back with the next repair so they are not offered again', async () => {
  const { structuredResponse } = await import('../utils/novel/v2/llm');
  const prompts: string[] = [];
  await structuredResponse('Task', '', async prompt => {
    prompts.push(prompt);
    if (prompts.length === 1) return JSON.stringify({ answer: 'wrong' });
    return JSON.stringify({ edits: [{ path: '/answer', before: prompts.length === 2 ? 'wrong' : 'still wrong', after: prompts.length === 2 ? 'still wrong' : 'right' }] });
  }, ['answer'], raw => { if (raw.answer !== 'right') throw new Error(`Refused ${raw.answer}`); return raw.answer; });
  expect(prompts[1]).not.toContain('already tried and REFUSED');
  expect(prompts[2]).toContain('already tried and REFUSED');
  expect(prompts[2]).toContain('still wrong');
  expect(prompts[2]).toContain('Refused still wrong');
});

it('rewrites only the chapter a finding names and keeps the others as written', async () => {
  const two = { ...input, chapter_count: 2 };
  const both = [chapters[0], { ...chapters[0], chapter: 2, steps: [{ ...chapters[0].steps[0], id: 'C2S1' }] }];
  const state: ChapterDevelopmentState = { chapters: [] }; const stages: string[] = []; let reviews = 0; let repairPrompt = '';
  await developChapters(two, 'Jo hides a letter.', '', async (prompt, _system, options) => {
    stages.push(options!.stage!);
    if (options!.stage === 'thesis-chapter-development') return JSON.stringify({ chapters: both });
    if (options!.stage === 'thesis-chapter-development-repair') { repairPrompt = prompt; return JSON.stringify({ chapters: [{ ...both[1], goal: 'Search the house' }] }); }
    return JSON.stringify(++reviews === 1 ? { ready: false, issues: [{ chapter: 2, problem: 'C2S1 repeats C1S1', required_change: 'Give chapter 2 its own attempt' }] } : { ready: true, issues: [] });
  }, state, () => {});
  expect(stages).toEqual(['thesis-chapter-development', 'thesis-chapter-development-review', 'thesis-chapter-development-repair', 'thesis-chapter-development-review']);
  expect(repairPrompt).toContain('Rewrite ONLY chapter 2');
  expect(state.chapters[0]).toEqual(both[0]);
  expect(state.chapters[1].goal).toBe('Search the house');
  expect(state.review!.ready).toBe(true);
});

it('repairs a refused answer without paying for the whole task again, until that fails twice', async () => {
  const { structuredResponse } = await import('../utils/novel/v2/llm');
  const material = 'supplied plan text '.repeat(1000) + 'MATERIAL-MIDDLE ' + 'supplied plan text '.repeat(1000);
  const task = `TASK-HEAD write the plan.\n${material}\nTASK-TAIL return {"answer": number}.`;
  const prompts: string[] = []; let n = 0;
  await structuredResponse(task, '', async prompt => { prompts.push(prompt); return n++ ? JSON.stringify({ edits: [{ path: '/answer', before: n - 2, after: n - 1 }] }) : JSON.stringify({ answer: 0 }); },
    ['answer'], raw => { if (raw.answer < 3) throw new Error(`Invalid thesis T12: requires names T14 (${raw.answer})`); return raw.answer; });
  expect(prompts[0]).toContain('MATERIAL-MIDDLE');
  for (const repair of prompts.slice(1, 3)) {
    expect(repair.length).toBeLessThan(12000);
    expect(repair).toContain('TASK-HEAD'); expect(repair).toContain('TASK-TAIL');
    expect(repair).toContain('requires names T14');
    expect(repair).not.toContain('MATERIAL-MIDDLE');
  }
  expect(prompts[3]).toContain('MATERIAL-MIDDLE');
});
it('keeps the material when the refusal is about a citation into it', async () => {
  const { structuredResponse } = await import('../utils/novel/v2/llm');
  const task = `Review.\nMATERIAL-MIDDLE ${'prose paragraph '.repeat(2000)}\nReturn {"answer": number}.`;
  const prompts: string[] = []; let n = 0;
  await structuredResponse(task, '', async prompt => { prompts.push(prompt); return n++ ? JSON.stringify({ edits: [{ path: '/answer', before: 0, after: 1 }] }) : JSON.stringify({ answer: 0 }); },
    ['answer'], raw => { if (!raw.answer) throw new Error('evidence is not a verbatim substring of supplied prose'); return raw.answer; });
  expect(prompts[1]).toContain('MATERIAL-MIDDLE');
});

it('reads a development finding for what it says, and names the field when it cannot', async () => {
  const { readDevelopmentIssues } = await import('../utils/novel/v2/chapterDevelopment');
  expect(readDevelopmentIssues({ issues: [] }, 4)).toEqual([]);
  expect(readDevelopmentIssues({ issues: [
    { chapter: '3', problem: 'The key card is two objects', required_change: 'Say which is which' },
    { problem: 'C2S5 hands over a card nobody retrieved. Required change: in C1S4, have Daniel take it from the nightstand.' },
  ] }, 4)).toEqual([
    { chapter: 3, problem: 'The key card is two objects', required_change: 'Say which is which' },
    { chapter: 2, problem: 'C2S5 hands over a card nobody retrieved.', required_change: 'in C1S4, have Daniel take it from the nightstand.' },
  ]);
  expect(() => readDevelopmentIssues({ issues: [{ chapter: 9, problem: 'Something is off', required_change: '' }] }, 4))
    .toThrow('Issue 1: required_change is empty (say what must change, in its own field); chapter must be a whole number from 1 to 4; got 9');
  expect(() => readDevelopmentIssues({}, 4)).toThrow('issues as an array');
});
