import { describe, expect, it } from 'vitest';
import { designBudgetGaps, placeEndingRequirements, premiseGivenGaps, unplacedEndingRequirements } from '../utils/novel/v2/designer';
import { scenesFor } from '../utils/novel/v2/ledger';
import { namesSubject, sceneBrief, sceneCommitments } from '../utils/novel/v2/planner';
import { countImages, imageAllowance, imageSentences, readWornImages } from '../utils/novel/v2/images';
import { chapterSeams, checkChapterPlan, factClashes, seamProblems, statesAgree, statesChange } from '../utils/novel/v2/planGate';
import { readFactClashes, readSeams } from '../utils/novel/v2/semanticGate';
import { factKey, sameQuestionFacts } from '../utils/novel/v2/tracker';
import { defaultProfile } from '../utils/novel/v2/profile';
import type { BookDesign, ChapterPlan, ScenePlan, StateDelta, StoryState } from '../utils/novel/v2/types';

function design(weight: 'low' | 'medium' | 'high' = 'medium'): BookDesign {
  return {
    contract: { working_title: 't', explicit_requirements: [], inferred_decisions: [], tense: 'past', narrative_perspective: 'third', genre_expectations_selected: [] },
    profile: { ...defaultProfile(), dialogue_weight: weight, cost_kinds: ['a certainty'], mechanism_ledger: ['compare the records', 'question the guest'] },
    dramatic_core: { distinctive_situation: 's', central_conflict: 'c', stakes: 's', why_now: 'n', sources_of_development: [] },
    style_contract: { narrative_distance: 'd', attention: 'a', register: 'r', humor: 'h', emotional_expression: 'e' },
    characters: [
      { id: 'C01', name: 'Ines', story_function: 'clerk', goal: 'g', motives: [], capabilities: [], limitations: [], relationships: [], behavior: 'b', voice_and_perception: 'v', initial_knowledge: [], initial_beliefs: [] },
      { id: 'C02', name: 'Tobias', story_function: 'guest', goal: 'g', motives: [], capabilities: [], limitations: [], relationships: [], behavior: 'b', voice_and_perception: 'v', initial_knowledge: [], initial_beliefs: [] },
    ],
    world_rules: [], causal_map: [],
    ending: { central_resolution: 'r', decisive_action_or_choice: 'd', required_setup: [], intentionally_open_questions: [] },
    chapter_map: [1, 2, 3].map(chapter => ({
      chapter, function: chapter === 1 ? 'Ines finds the rewritten ledger in her mother\'s handwriting' : 'f', main_change: 'm', event_ids: [], dependencies: [],
      setup_or_payoff: [], pov_id: 'C01', target_words: 3000, mechanism: chapter === 2 ? 'question the guest' : 'compare the records', cost: 'a certainty', pressure_rung: chapter,
    })),
  };
}

describe('what the ending needs, placed before the last chapter', () => {
  it('reports a requirement no earlier chapter prepares, and not one that is placed', () => {
    const book = design();
    book.ending.required_setup = ['The ledger with the mother\'s handwriting', 'The reason Ines gives the evidence away'];
    const gaps = designBudgetGaps(book, 3).filter(gap => gap.code === 'ending-unplaced');
    expect(gaps).toHaveLength(1);
    expect(gaps[0].detail).toContain('"The reason Ines gives the evidence away"');
    expect(gaps[0].detail).not.toContain('handwriting');
    book.chapter_map[1].setup_or_payoff = ['Setup: the reason she will give the evidence away'];
    expect(designBudgetGaps(book, 3).filter(gap => gap.code === 'ending-unplaced')).toEqual([]);
  });

  it('does not count the last chapter as preparation for its own ending', () => {
    const book = design();
    book.ending.required_setup = ['The signet ring found in the dated parcel'];
    book.chapter_map[2].function = 'Ines finds the signet ring in the dated parcel and gives it away';
    expect(designBudgetGaps(book, 3).some(gap => gap.code === 'ending-unplaced')).toBe(true);
  });
});

const scene = (id: string, participants: string[]): ScenePlan => ({
  id, pov_id: 'C01', location: `Room ${id}`, story_time: 'night', participants, initial_conditions: [],
  function: 'Ines compares the ledger with the staff log', participant_intentions: [], pressure_or_uncertainty: 'the night audit is unfinished',
  development: 'she lays both books open', required_outcome: 'Ines holds proof the entry was rewritten.', flexible_elements: [],
  required_fact_refs: [], required_source_refs: [], setup_or_payoff: [], transition_to_next: '', target_words: 900, outcome_kind: id.endsWith('1') ? 'knowledge' : 'possession',
});

const plan = (scenes: ScenePlan[]): ChapterPlan => ({
  status: 'ready', chapter: 1, function: 'f', starting_situation: 's', ending_change: 'e', scenes, forward_dependencies: [],
  replan_reason: null, mechanism: 'compare the records', cost: 'a certainty', pressure_rung: 1,
});

const gate = (book: BookDesign, scenes: ScenePlan[]) => checkChapterPlan({
  design: book, chapter: 1, plan: plan(scenes), spentMechanisms: [], priorRungs: [], recentShapes: [], priorOutcomeKinds: [],
  endingRequirements: [], openThreads: [], remainingChapters: 3,
}).filter(item => item.code === 'solitary-chapter');

describe('someone to speak to, decided when the scene is cast', () => {
  it('refuses a chapter of a spoken book in which most scenes hold one person', () => {
    const found = gate(design('medium'), [scene('CH01_S01', ['C01']), scene('CH01_S02', ['C01', 'C02']), scene('CH01_S03', ['C01'])]);
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('blocking');
    expect(found[0].detail).toMatch(/2 of this chapter's 3 scenes hold one person alone.*At least 2 scene\(s\)/);
  });

  it('accepts the same chapter once half its scenes are peopled, or the book declared itself quiet', () => {
    expect(gate(design('medium'), [scene('CH01_S01', ['C01', 'C02']), scene('CH01_S02', ['C01', 'C02']), scene('CH01_S03', ['C01'])])).toEqual([]);
    expect(gate(design('low'), [scene('CH01_S01', ['C01']), scene('CH01_S02', ['C01']), scene('CH01_S03', ['C01'])])).toEqual([]);
  });

  it('leaves a chapter that is one unbroken solitary situation alone', () => {
    expect(gate(design('high'), [scene('CH01_S01', ['C01'])])).toEqual([]);
  });
});

describe('an image counted by the words that mark it', () => {
  const image = { image: 'the sea on the shingle', anchors: ['sea', 'shingle', 'stones', 'tide'] };

  it('finds the picture in sentences that share no phrase', () => {
    const prose = 'The sea worked at the shingle. She locked the drawer. Out there the tide was dragging stones. The sea was grey. Stone by stone the sea took the beach.';
    expect(imageSentences(prose, image)).toEqual(['The sea worked at the shingle.', 'Out there the tide was dragging stones.', 'Stone by stone the sea took the beach.']);
  });

  it('will not count on a single word, which marks a subject and not an image', () => {
    expect(readWornImages([{ image: 'the sea', anchors: ['sea'] }, { image: 'the sea', anchors: ['sea', 'seas'] }, image])).toEqual([image]);
  });

  it('gives a declared refrain its own budget and everything else the phrase tolerance', () => {
    const profile = { ...defaultProfile(), declared_motifs: [{ motif: 'The sea on the shingle at night', allowed_uses: 9, reason: 'the book\'s clock' }] };
    expect(imageAllowance(image, profile)).toBe(9);
    expect(imageAllowance(image, defaultProfile())).toBe(4);
    expect(countImages([image], 'The sea worked at the shingle.', defaultProfile())).toEqual([{ image, uses: 1, allowance: 4 }]);
  });
});

describe('a premise given placed in other words', () => {
  it('counts a given as placed when the construction carries it in another tense, and not when it is absent', () => {
    const book = design();
    book.contract.premise_givens = [
      { given: 'has just checked in again under his own name', kind: 'situation' },
      { given: 'a burning warehouse', kind: 'thing' },
    ];
    book.chapter_map[0].function = 'Tobias checks in at midnight and asks for the same room';
    expect(premiseGivenGaps(book)).toEqual(['a burning warehouse']);
  });
});

describe('a plan that agrees with itself and with the record', () => {
  const check = (scenes: ScenePlan[], extra: Partial<Parameters<typeof checkChapterPlan>[0]> = {}) => checkChapterPlan({
    design: design(), chapter: 1, plan: plan(scenes), spentMechanisms: [], priorRungs: [], recentShapes: [], priorOutcomeKinds: [],
    endingRequirements: [], openThreads: [], remainingChapters: 3, ...extra,
  });
  const two = (first: Partial<ScenePlan>, second: Partial<ScenePlan>) => [
    { ...scene('CH01_S01', ['C01', 'C02']), ...first },
    { ...scene('CH01_S02', ['C01', 'C02']), ...second },
  ];

  it('returns a plan whose scene opens somewhere the scene before it did not leave things', () => {
    const found = check(two(
      { state_at_end: { ledger: 'closed, set on the corner of the desk', C01: 'at the front desk' } },
      { state_at_start: { Ledger: 'lying open on the desk', C01: 'behind the front desk' } },
    )).filter(item => item.code === 'scene-seam');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('blocking');
    expect(found[0].detail).toContain('CH01_S01 ends with ledger: "closed, set on the corner of the desk", and CH01_S02 opens with Ledger: "lying open on the desk"');
  });

  it('accepts a seam said twice in slightly different words, and a key only one scene mentions', () => {
    expect(statesAgree('in the back office', 'the back office, at the desk')).toBe(true);
    expect(statesAgree('closed, set on the corner of the desk', 'lying open on the desk')).toBe(false);
    expect(seamProblems({ scene: 'CH01_S01', state: { ledger: 'wrapped in a cloth in her bag' } }, { ...scene('CH01_S02', ['C01']), state_at_start: { lamp: 'lit' } })).toEqual([]);
  });

  it('accepts an opening that says what changed between the scenes, and one that says the same in other words', () => {
    const ended = { scene: 'CH01_S01', state: { C01: 'standing behind the counter with the key in her hand, watching the stairs', C02: 'at the kitchen table, refusing further questions' } };
    expect(seamProblems(ended, { ...scene('CH01_S02', ['C01']), state_at_start: { C01: 'has left the building at the end of her shift and walked to the house on the quay', C02: 'at home in the kitchen' } })).toEqual([]);
    expect(seamProblems(ended, { ...scene('CH01_S02', ['C01']), state_at_start: { C01: 'asleep in the attic room' } })).toHaveLength(1);
    expect(statesChange('an hour later, back at the desk')).toBe(true);
    expect(statesChange('lying open on the desk')).toBe(false);
  });

  it('lets the model decide contradiction, blocks an unexplained break and sends an explained one to a reader', async () => {
    const ended = { scene: 'CH01_S01', state: { ledger: 'shut on the corner of the desk', C01: 'behind the counter' } };
    const next = { ...scene('CH01_S02', ['C01']), state_at_start: { ledger: 'lying open on the desk', C01: 'has walked down to the quay' } };
    const plan = { scenes: [next] } as unknown as ChapterPlan;
    const sure = async () => ({ contradiction: 0.99, entailment: 0, neutral: 0.01 });
    const verdicts = await readSeams(plan, ended, sure);
    expect(seamProblems(ended, next, verdicts)).toHaveLength(1);
    const toRead = chapterSeams(plan, ended, verdicts).filter(seam => seam.changeStated);
    expect(toRead.map(seam => seam.key)).toEqual(['C01']);
    const calm = await readSeams(plan, ended, async () => ({ contradiction: 0.02, entailment: 0.9, neutral: 0.08 }));
    expect(chapterSeams(plan, ended, calm)).toEqual([]);
    expect(await readSeams(plan, ended, undefined, 'off')).toBeUndefined();
  });

  it('checks the first scene of a chapter against where the last chapter left things', () => {
    const found = check([{ ...scene('CH01_S01', ['C01', 'C02']), state_at_start: { ledger: 'on the lobby counter in plain view' } }],
      { previousEnd: { scene: 'CH00_S03', state: { ledger: 'wrapped in a cloth in her bag' } } });
    expect(found.filter(item => item.code === 'scene-seam')).toHaveLength(1);
  });

  it('returns a plan that fixes a particular differently from the record, and not one about something else', () => {
    const facts = [{ id: 'CH01_S02-f1', statement: 'The registration card of the missing guest shows departure 9 January from room 9.' }];
    expect(factClashes(['The registration card of the missing guest shows departure 12 January from room 14.'], facts)).toHaveLength(1);
    expect(factClashes(['The pilot stayed in room 11 for seven nights.'], facts)).toEqual([]);
    expect(factClashes(['The registration card of the missing guest shows departure 9 January from room 9.'], facts)).toEqual([]);
    const found = check(two({}, { establishes: ['The registration card of the missing guest shows departure twelve January from room 14.'] }), { facts });
    expect(found.filter(item => item.code === 'fact-clash').map(item => item.detail)[0]).toMatch(/CH01_S02 plans to establish .* the record already holds .* \(CH01_S02-f1\)/);
  });

  it('holds a later scene of the plan to what an earlier scene of the same plan fixes', () => {
    const found = check(two(
      { establishes: ['Three guests were struck from the winter ledger that week.'] },
      { establishes: ['One guest was struck from the winter ledger that week.'] },
    ));
    expect(found.filter(item => item.code === 'fact-clash')).toHaveLength(1);
  });

  it('returns a chapter planned with more scenes than its length holds', () => {
    expect(scenesFor(3000, 1250)).toBe(2);
    expect(scenesFor(9000, 1250)).toBe(7);
    const scenes = [scene('CH01_S01', ['C01', 'C02']), scene('CH01_S02', ['C01', 'C02']), scene('CH01_S03', ['C01', 'C02'])];
    expect(check(scenes, { maxScenes: 2 }).filter(item => item.code === 'too-many-scenes')).toHaveLength(1);
    expect(check(scenes, { maxScenes: 3 }).filter(item => item.code === 'too-many-scenes')).toEqual([]);
  });

  it('counts a premise given as taken up when the plan assigns it to a scene by id', () => {
    const owed = [{ thread: { id: 'PREMISE-t4', description: 'the returning pilot requests the identical upstairs chamber', status: 'open' as const, setup_refs: ['CH01_PREMISE'], payoff_refs: [] }, madeInChapter: 1 }];
    const book = design();
    const at = (scenes: ScenePlan[]) => checkChapterPlan({
      design: book, chapter: 3, plan: { ...plan(scenes), chapter: 3, pressure_rung: 3 }, spentMechanisms: [], priorRungs: [1, 2], recentShapes: [], priorOutcomeKinds: [],
      endingRequirements: [], openThreads: owed, remainingChapters: 1,
    }).filter(item => item.code === 'promise-ageing');
    expect(at(two({}, {}))).toHaveLength(1);
    expect(at(two({}, { pays_premise: [{ id: 'premise-t4', action: 'He names the room he wants before she can offer one.' }] }))).toEqual([]);
  });

  it('reads the commitments into shapes code can compare, whatever the model sent', () => {
    const read = sceneCommitments({ ...scene('CH01_S01', ['C01']), state_at_end: { C01: ' at the desk ', lamp: null, n: 3 } as never, establishes: 'one fact' as never, pays_premise: [{ id: ' PREMISE-t1 ' }, { action: 'no id' }] as never });
    expect(read.state_at_end).toEqual({ C01: 'at the desk', n: '3' });
    expect(read.establishes).toEqual(['one fact']);
    expect(read.pays_premise).toEqual([{ id: 'PREMISE-t1', action: '' }]);
    const brief = sceneBrief({ ...scene('CH01_S01', ['C01']), ...read, state_at_start: { ledger: 'closed' } });
    expect(brief).toContain('Opens with: ledger — closed');
    expect(brief).toContain('Closes with: C01 — at the desk; n — 3. The next scene opens from exactly this.');
    expect(brief).toContain('Fixes these particulars, as given');
  });
});

describe('what the ending needs, placed by code when the designer leaves it', () => {
  it('deals an unplaced requirement to a chapter before the last, and leaves a placed design as it is', () => {
    const book = design();
    book.ending.required_setup = ['The reason Ines gives the evidence away', 'The key to the attic trunk'];
    expect(unplacedEndingRequirements(book)).toHaveLength(2);
    const placed = placeEndingRequirements(book);
    expect(unplacedEndingRequirements(placed)).toEqual([]);
    expect(placed.chapter_map[1].setup_or_payoff.join(' ')).toContain('The reason Ines gives the evidence away');
    expect(placed.chapter_map[0].setup_or_payoff.join(' ')).toContain('The key to the attic trunk');
    expect(placed.chapter_map[2].setup_or_payoff).toEqual([]);
    expect(placeEndingRequirements(placed)).toBe(placed);
  });
});

describe('particulars the book fixes', () => {
  const state = (facts: StoryState['facts']): StoryState => ({ facts, events: [], conditions: {}, knowledge: {}, beliefs: {}, reader_disclosures: [], names: [] });
  const held = [{ id: 'DESIGN-R01', statement: 'The map room is on the second floor.', evidence_refs: [], subject: 'the map room', attribute: 'floor' }];
  const stating = (facts: StateDelta['established_facts']) => ({ established_facts: facts } as unknown as StateDelta);

  it('pairs a stated fact with the recorded one only under the same subject and property', () => {
    const pairs = sameQuestionFacts(state(held), stating([
      { subject: 'The map room', attribute: 'Floor', statement: 'The map room is at the top of the house, on the third floor.', evidence_refs: ['p4'] },
      { subject: 'the map room', attribute: 'windows', statement: 'The map room has two windows.', evidence_refs: ['p4'] },
      { subject: 'the map room', attribute: 'floor', statement: 'the map room is on the second floor', evidence_refs: ['p5'] },
      { statement: 'A fact with no key is compared with nothing.', evidence_refs: ['p6'] },
    ]));
    expect(pairs.map(pair => pair.index)).toEqual([0]);
    expect(pairs[0].recorded.id).toBe('DESIGN-R01');
    expect(factKey({ subject: 'The Map Room', attribute: 'floor' })).toBe(factKey({ subject: 'map room', attribute: 'Floor' }));
  });

  it('calls a pair a clash only when the model is sure both ways round, and never without a model', async () => {
    const pairs = sameQuestionFacts(state(held), stating([{ subject: 'the map room', attribute: 'floor', statement: 'The map room is on the third floor.', evidence_refs: ['p4'] }]));
    const sure = async () => ({ contradiction: 0.99, entailment: 0, neutral: 0.01 });
    expect(await readFactClashes(pairs, sure)).toHaveLength(1);
    let asked = 0;
    const oneWay = async () => (asked++ ? { contradiction: 0.1, entailment: 0.5, neutral: 0.4 } : { contradiction: 0.99, entailment: 0, neutral: 0.01 });
    expect(await readFactClashes(pairs, oneWay)).toEqual([]);
    expect(await readFactClashes(pairs, undefined, 'off')).toEqual([]);
  });

  it('gives the writer every fact about something its scene names', () => {
    expect(namesSubject('{"location":"the map room, at night"}', 'The map room')).toBe(true);
    expect(namesSubject('{"location":"the quay"}', 'the map room')).toBe(false);
  });

  it('returns a design that fixes no particulars or leaves its past a placeholder', () => {
    const bare = design();
    expect(designBudgetGaps(bare, 3).map(gap => gap.code)).toContain('particulars-unfixed');
    const open = { ...bare, causal_map: [{ id: 'E01', before_story: true, cause: 'A hard winter.', actor_id: 'C02', action_or_event: 'Someone concealed a specific event at the house.', consequence: '', requires: [], enables: [] }] };
    expect(designBudgetGaps(open, 3).map(gap => gap.code)).toContain('past-undecided');
    const decided = { ...open, causal_map: [{ ...open.causal_map[0], action_or_event: 'The steward burned the tenancy roll in the map room to hide that the rents had been paid twice.' }] };
    expect(designBudgetGaps(decided, 3).map(gap => gap.code)).not.toContain('past-undecided');
  });
});
