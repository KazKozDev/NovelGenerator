import { describe, expect, it } from 'vitest';
import { readCoverage, premiseChecks, deedGaps, canonGaps, chainGaps } from '../utils/novel/v2/premiseChecks';
import { readHabits, habitUses, habitBrief, confirmedHabits, mergeHabits, somaticBeats } from '../utils/novel/v2/habits';
import { repairReviewEvidence } from '../utils/novel/v2/reviewEvidenceRepair';
import { readStateTrace, TRANSITION_CHECKS } from '../utils/novel/v2/stateTransitions';
import { textFindings } from '../utils/novel/v2/storyQuality';
import { premiseReply } from './premiseReplies';
import type { ThesisPlan } from '../utils/novel/v2/theses';

const thesis = (id: string) => ({ id, chapter: 1, pov_id: 'C', participants: [{ character_id: 'C', intention: 'Learn the truth', knows: [] }], when: 'Night', where: 'Room', state_before: 'Jo has been told about the fire.', action: 'Jo opens the letter.', why: 'She must know', resistance: 'Fear', outcome: 'Jo knows who wrote it.', establishes: [], reader_learns: [], requires: [], writer_task: 'Dramatize', target_words: 100 });
const plan = { title: 'T', premise_givens: ['Jo opens the letter.', 'The mill burns.', 'Past tense.'], characters: [{ id: 'C', name: 'Jo', goal: 'Truth', initial_knowledge: [], capabilities: [], limitations: [] }], theses: [thesis('T1'), thesis('T2')], ending: 'Jo leaves.' } as ThesisPlan;
const entry = (given: number, field: string, kind = 'story') => ({ given, kind, thesis_id: 'T2', field, note: 'n' });

describe('premise coverage', () => {
  it('returns the plan for a given that no scene plays, and leaves form requirements alone', () => {
    const issues = readCoverage({ coverage: [entry(0, 'action'), entry(1, 'state_before'), entry(2, 'none', 'requirement')] }, plan);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'major', thesis_ids: ['T2'] });
    expect(issues[0].problem).toContain('The mill burns.');
    expect(readCoverage({ coverage: [entry(0, 'outcome'), entry(1, 'none'), entry(2, 'none', 'requirement')] }, plan)[0].problem).toContain('absent from the outline');
  });
  it('refuses coverage that skips or repeats a given', () => {
    expect(() => readCoverage({ coverage: [entry(0, 'action'), entry(0, 'action'), entry(2, 'none')] }, plan)).toThrow('exactly once');
    expect(() => readCoverage({ coverage: [entry(0, 'action')] }, plan)).toThrow('one entry');
  });
  it('asks coverage and the mechanism separately and returns both sets of findings', async () => {
    const stages: string[] = [];
    const issues = await premiseChecks(plan, '{}', '', async (prompt, _system, options) => {
      stages.push(options!.stage!);
      if (options!.stage === 'thesis-plan-stress') { expect(prompt).toContain('neutral observer'); return JSON.stringify({ ready: false, issues: [{ severity: 'major', thesis_ids: ['T1'], problem: 'The note points at its writer, not at Jo', required_change: 'Decide what the note shows' }] }); }
      if (options!.stage === 'thesis-plan-dryrun') { expect(prompt).toContain('about to be frozen'); return JSON.stringify({ ready: false, issues: [{ severity: 'major', thesis_ids: ['T2', 'T1'], problem: 'T2 needs the letter open; no scene opens it', required_change: 'Open it in T1' }] }); }
      return JSON.stringify({ coverage: [entry(0, 'action'), entry(1, 'none'), entry(2, 'none', 'requirement')] });
    });
    expect(stages).toEqual(['thesis-premise-coverage', 'thesis-plan-stress', 'thesis-plan-dryrun']);
    expect(issues.map(issue => issue.problem.slice(0, 20))).toEqual(['Premise given not on', 'T2 needs the letter ', 'The note points at i']);
    expect(premiseReply({ stage: 'thesis-block-write' })).toBeUndefined();
  });
});

describe('measured text findings', () => {
  const filler = (seed: string) => Array.from({ length: 120 }, (_, i) => `${seed}${i}`).join(' ') + '.';
  it('reports a narrated sentence written twice, but not repeated speech', () => {
    const twice = 'A cold suspicion settled in her stomach as she watched him.';
    const findings = textFindings([{ thesis_id: 'T1', text: `${twice}\n\n“I will not say that again to anyone here.”` }, { thesis_id: 'T2', text: `Later. ${twice}\n\n“I will not say that again to anyone here.”` }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'major', thesis_ids: ['T1', 'T2'], strings: [twice] });
  });
  it('counts a named move by its markers, a body that reacts too often, and scenes opening on one word', () => {
    const blocks = ['A', 'B', 'C', 'D', 'E'].map(id => ({ thesis_id: id, text: `The hall smelled of ${id.toLowerCase()}dust tonight. Her heart hammered hard against her ${id.toLowerCase()}ribs and ribs. Her stomach lurched near ${id.toLowerCase()}door. ${filler(id.toLowerCase())}` }));
    const habit = { device: 'Heart pounding for fear', markers: ['hammering', 'rib'], example: '' };
    const descriptions = textFindings(blocks, [habit]).map(finding => finding.description);
    expect(descriptions.some(text => text.startsWith('Move made 5 times — Heart pounding for fear'))).toBe(true);
    expect(descriptions.some(text => text.startsWith('A: 2 sentences where the body reacts'))).toBe(true);
    expect(descriptions.some(text => text.includes('5 of 5 scenes open on "smelled"'))).toBe(true);
    expect(textFindings(blocks, [habit]).every(finding => finding.severity === 'minor')).toBe(true);
    expect(textFindings(blocks).some(finding => finding.description.startsWith('Move made'))).toBe(false);
  });
});

describe('habit ledger', () => {
  const scene = 'Her heart hammered against her ribs. Nora picked up the hidden notebook.\n\nThe smile did not reach his eyes.';
  it('keeps a named habit only when its markers find it in the scene, and never twice', () => {
    const kept = readHabits({ habits: [
      { device: 'Heart pounding for fear', markers: ['hammered', 'ribs'], example: 'x' },
      { device: 'Same again', markers: ['ribs', 'hammering'], example: 'x' },
      { device: 'Invented', markers: ['thunder', 'rolled'], example: 'x' },
      { device: 'Pronouns only', markers: ['her', 'his'], example: 'x' },
      { device: 'Smile that fails', markers: ['reach', 'eyes'], example: 'x' },
    ] }, scene);
    expect(kept.map(habit => habit.device)).toEqual(['Heart pounding for fear', 'Smile that fails']);
    expect(kept[0].example).toBe('Her heart hammered against her ribs.');
    expect(readHabits({ habits: [{ device: 'Again', markers: ['hammered', 'ribs'], example: '' }] }, scene, kept)).toEqual([]);
    expect(() => readHabits({}, scene)).toThrow('array');
  });
  it('finds the move in other words, and tells the next writer the device with its count', () => {
    const habit = readHabits({ habits: [{ device: 'Heart pounding for fear', markers: ['hammered', 'ribs'], example: '' }] }, scene)[0];
    const blocks = [{ thesis_id: 'T1', text: scene }, { thesis_id: 'T2', text: 'His pulse was hammering at the cage of his ribs again.' }];
    expect(habitUses(blocks, [habit])[0].uses.map(use => use.thesis_id)).toEqual(['T1', 'T2']);
    const brief = habitBrief(blocks, [habit, { device: 'Lemon polish opening', markers: ['lemon', 'polish'], example: 'The hall smelled of lemon polish.', known: true }, { device: 'Unused', markers: ['velvet', 'dark'], example: '' }]);
    expect(brief).toContain('Heart pounding for fear (already written 2 times');
    expect(brief).toContain("Lemon polish opening (this writer's habit in earlier books");
    expect(brief).not.toContain('Unused');
    expect(brief).toContain('at most once in this scene');
  });
  it('remembers for the next book what was made three times, or made again', () => {
    const habit = { device: 'Heart pounding', markers: ['hammered', 'ribs'], example: '' };
    const one = [{ thesis_id: 'T1', text: scene }];
    expect(confirmedHabits(one, [habit])).toEqual([]);
    expect(confirmedHabits(one, [{ ...habit, known: true }])).toHaveLength(1);
    expect(confirmedHabits([...one, ...one, ...one], [habit])[0].known).toBe(true);
    expect(mergeHabits([habit], [{ ...habit, device: 'Other name' }, { device: 'New', markers: ['reach', 'eyes'], example: '' }])).toHaveLength(2);
  });
  it('counts sentences in which the body acts by itself, outside speech', () => {
    expect(somaticBeats('Her heart hammered. The floor seemed to tilt under her. “My heart is pounding,” she said. She counted the bills twice.')).toHaveLength(2);
  });
});

describe('deeds in the plan', () => {
  it('returns the plan for a participant given a sensation or nothing to do', () => {
    const withDeeds = (does: (string | undefined)[]) => ({ ...plan, theses: plan.theses.map((t, i) => ({ ...t, participants: [{ ...t.participants[0], does: does[i] }] })) }) as ThesisPlan;
    expect(deedGaps(withDeeds(['Counts the bills twice', 'Locks the drawer']))).toEqual([]);
    const gaps = deedGaps(withDeeds(['Her heart pounds', undefined]));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ severity: 'major', thesis_ids: ['T1', 'T2'] });
    expect(gaps[0].problem).toContain('T1 C ("Her heart pounds")');
  });
});

describe('state trace failures', () => {
  const scene = 'Jo sat down.\n\nJo stood.';
  const tracePlan = { ...plan, characters: [{ ...plan.characters[0], id: 'C' }] } as ThesisPlan;
  const trace = (events: any[]) => ({ ready: true, issues: [], state_trace: { events, checks: Object.fromEntries(TRANSITION_CHECKS.map(key => [key, { status: 'supported', evidence: '@P0001', explanation: 'Compared' }])) } });
  const event = (before: string, after: string, evidence = '@P0001') => ({ character_id: 'C', dimension: 'posture', subject: 'body', before, after, evidence });
  it('reads a posture in the reviewer\'s own words instead of refusing the review', () => {
    expect(readStateTrace(trace([event('on her feet', 'sitting'), event('sitting at the desk', 'stood', '@P0002')]), tracePlan, scene, 'T1', scene).issues).toEqual([]);
    expect(readStateTrace(trace([event('hovering', 'drifting')]), tracePlan, scene, 'T1', scene).issues).toEqual([]);
    expect(readStateTrace(trace([event('standing', 'sitting'), event('standing', 'sat', '@P0002')]), tracePlan, scene, 'T1', scene).issues[0].kind).toBe('continuity');
  });
  it('drops an event the locator cannot ground and keeps the rest of the review', async () => {
    const raw = trace([event('standing', 'seated'), event('seated', 'standing', 'Invented')]);
    const locator = async () => JSON.stringify({ references: [{ path: 'state_trace.events.1', evidence: '@P0002', supported: false, explanation: 'Not in the scene.' }] });
    await expect(repairReviewEvidence(raw, scene, locator, '', 'review', scene)).rejects.toThrow('Unverified review evidence at state_trace.events.1');
    const kept = await repairReviewEvidence(raw, scene, locator, '', 'review', scene, true);
    expect(kept.state_trace.events).toHaveLength(1);
  });
});

describe('what code can see is missing from a plan', () => {
  const fact = (id: string, established_in: string, knowledge: object[] = []) => ({ id, truth: `Truth ${id}`, established_in, knowledge });
  const scene = (id: string, fact_ids: string[], action = 'Jo opens the letter') => ({ ...thesis(id), fact_ids, action });
  it('reports a fact used before the scene that makes it so, and a tracked thing no scene handles', () => {
    const gappy = { ...plan, tracked: [{ id: 'K1', name: 'The forged passport', start: 'In a safe' }, { id: 'K2', name: 'The letter', start: 'Sealed' }],
      canon: { resolution: 'Jo leaves.', facts: [fact('F1', 'T2'), fact('F2', 'INITIAL', [{ character_id: 'C', learned_in: 'INITIAL' }])] }, theses: [scene('T1', ['F1', 'F2']), scene('T2', ['F1'])] } as unknown as ThesisPlan;
    const problems = canonGaps(gappy).filter(issue => issue.severity === 'major').map(issue => issue.problem);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('Fact F1 ("Truth F1") is used in T1 before the scene that makes it so (T2)');
    expect(problems[1]).toContain('"The forged passport" is named as a thing the plot turns on, but no scene mentions it');
  });
  it('finds nothing in a plan whose facts and things are in place', () => {
    const sound = { ...plan, tracked: [{ id: 'K2', name: 'The letter', start: 'Sealed' }], canon: { resolution: 'Jo leaves.', facts: [fact('F1', 'T1', [{ character_id: 'C', learned_in: 'T1' }])] }, theses: [scene('T1', ['F1']), scene('T2', ['F1'])] } as unknown as ThesisPlan;
    expect(canonGaps(sound)).toEqual([]);
  });
});

describe('the plan played forward by code', () => {
  const people = [{ id: 'C1', name: 'Nora', goal: 'g', initial_knowledge: [], capabilities: [], limitations: [] }, { id: 'C2', name: 'Claire', goal: 'g', initial_knowledge: [], capabilities: [], limitations: [] }];
  const scene = (id: string, present: string[], place: string, extra: object = {}) => ({ ...thesis(id), pov_id: 'C1', place, participants: present.map(c => ({ character_id: c, intention: 'i', knows: [], does: 'd' })), needs_things: [], needs_knowledge: [], moves: [], ...extra });
  const chain = (theses: object[], more: object = {}) => ({ ...plan, characters: people, places: [{ id: 'L1', name: 'the office' }, { id: 'L2', name: 'the car' }], tracked: [{ id: 'K1', name: 'the notebook', start: 'In her desk', at: 'L1' }],
    canon: { resolution: 'Jo leaves.', facts: [{ id: 'F1', truth: 'Claire knew of the affair.', established_in: 'INITIAL', reader_learns_in: 'T3', knowledge: [{ character_id: 'C2', learned_in: 'INITIAL' }, { character_id: 'C1', learned_in: 'T3' }] }] }, theses, ...more }) as unknown as ThesisPlan;
  it('passes a chain in which every need was met by an earlier scene', () => {
    expect(chainGaps(chain([scene('T1', ['C1'], 'L1', { moves: [{ thing: 'K1', to: 'C1' }] }), scene('T2', ['C1'], 'L2', { needs_things: [{ thing: 'K1', at: 'C1' }], moves: [{ thing: 'K1', to: 'L2' }] }),
      scene('T3', ['C1', 'C2'], 'L1'), scene('T4', ['C1'], 'L2', { needs_things: [{ thing: 'K1', at: 'L2' }], needs_knowledge: [{ who: 'C1', fact: 'F1' }] })], { ending_rests_on: ['F1'] }))).toEqual([]);
  });
  it('names the scene that needs a thing and the scene that left it somewhere else', () => {
    const gaps = chainGaps(chain([scene('T1', ['C1'], 'L2', { moves: [{ thing: 'K1', to: 'L2' }] }), scene('T2', ['C1'], 'L1', { needs_things: [{ thing: 'K1', at: 'C1' }] })]));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ severity: 'major', thesis_ids: ['T2', 'T1'] });
    expect(gaps[0].problem).toBe('T2 needs "the notebook" with Nora, but it is in the car — left there by T1 — and no scene between moves it.');
  });
  it('reports knowledge used before it is learned, a thing needed after it is gone, and an ending that rests on what its heroine never learns', () => {
    const problems = chainGaps(chain([scene('T1', ['C1'], 'L1', { needs_knowledge: [{ who: 'C1', fact: 'F1' }], moves: [{ thing: 'K1', to: 'GONE' }] }), scene('T2', ['C1'], 'L1', { needs_things: [{ thing: 'K1', at: 'L1' }] })],
      { ending_rests_on: ['F1'], canon: { resolution: 'Jo leaves.', facts: [{ id: 'F1', truth: 'Claire knew of the affair.', established_in: 'INITIAL', reader_learns_in: 'NEVER', knowledge: [{ character_id: 'C2', learned_in: 'INITIAL' }] }] } })).map(issue => issue.problem);
    expect(problems.some(problem => problem.startsWith('T1 has Nora act on "Claire knew of the affair.", but no scene ever gives it to them'))).toBe(true);
    expect(problems.some(problem => problem.includes('but it is gone (destroyed, surrendered or out of reach) — left there by T1'))).toBe(true);
    expect(problems.some(problem => problem.includes('and Nora never learns it'))).toBe(true);
    expect(problems.some(problem => problem.includes('the reader is never given it'))).toBe(true);
  });
  it('refuses a need that the scene could not use, and says nothing about a plan with no chain', () => {
    expect(chainGaps(chain([scene('T1', ['C1'], 'L1', { needs_things: [{ thing: 'K1', at: 'C2' }] })]))[0].problem).toContain('that person is not in the scene');
    expect(chainGaps(plan)).toEqual([]);
  });
});
