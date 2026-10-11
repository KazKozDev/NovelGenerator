import { describe, expect, it, vi } from 'vitest';
import { intentionPacket, readIntentionChoice, readIntentionResolution, readIntentionSituations, simulateIntentions } from '../utils/novel/v2/intentions';
import type { BookDesign, IntentionSituation } from '../utils/novel/v2/types';
import { designBudgetGaps } from '../utils/novel/v2/designer';
import type { NovelLLM } from '../utils/novel/v2/llm';

const person = {
  id: 'C01', name: 'Ines', story_function: 'Discover the secret', goal: 'Keep the hotel',
  motives: ['Protect her home'], capabilities: ['Access to the lobby'], limitations: ['No money'],
  relationships: [], behavior: 'Careful', voice_and_perception: 'Quiet',
  initial_knowledge: ['The mortgage is unpaid'], initial_beliefs: ['The creditor is honest'],
};
const design = {
  characters: [person, { ...person, id: 'C02', name: 'Vance', goal: 'Destroy the secret', initial_knowledge: ['PRIVATE SECRET'] }],
  world_rules: [{ id: 'R01', rule: 'PRIVATE RULE', relevant_consequences: [] }],
  ending: { central_resolution: 'SECRET ENDING' },
  causal_map: [
    { id: 'E00', before_story: true, actor_id: 'C02', action_or_event: 'PRIVATE PAST' },
    { id: 'E01', actor_id: 'C02', action_or_event: 'A notice is delivered' },
    { id: 'E02', actor_id: 'C01', action_or_event: 'Ines responds' },
  ],
} as unknown as BookDesign;
const situation: IntentionSituation = { id: 'T01', event_id: 'E02', situation: 'A notice demands payment',
  participants: [{ character_id: 'C01', observations: [{ source_event_id: 'E01', statement: 'The notice was served', perception: 'Read at the desk' }] }] };
const situations = ['T01', 'T02', 'T03'].map(id => ({ ...situation, id }));
const choice = {
  situation_id: 'T01', character_id: 'C01', action: 'Ask for a postponement', goal_served: 'Keep the hotel',
  knowledge_used: ['initial:C01:0'], alternative: 'Sell the hotel', why_this_choice: 'Avoid losing her home',
  expected_consequence: 'More time', risk_accepted: 'A refusal',
};
const choices = situations.map(item => ({ ...choice, situation_id: item.id }));
const resolution = () => ({ ready: true, issues: [], collisions: situations.map(item => ({
  situation_id: item.id, event_id: item.event_id, action_response_chain: 'A request meets a refusal',
  required_decisions: [{ character_id: 'C01', actor_name: 'Ines', choice_ref: `${item.id}:C01`, decision: choice.action }],
  cost: 'Lost opportunity', resulting_situation: 'The owner must find another means',
  planned_outcome_supported: true, reason: 'Consistent with the known means',
})) });

describe('independent character intentions', () => {
  it('keeps authorial secrets, other goals and hidden rules out of an actor packet', () => {
    const packet = intentionPacket(design, situation, 'C01');
    const serialized = JSON.stringify(packet);
    expect(serialized).not.toMatch(/SECRET|PRIVATE|Discover the secret|Destroy the secret/);
    expect(packet.evidence.map(item => item.id)).toEqual(['initial:C01:0', 'observation:T01:C01:0']);
    expect(packet.beliefs).toEqual(['The creditor is honest']);
  });

  it('leaves out observations derived from hidden past or events not yet reached', () => {
    for (const source_event_id of ['E00', 'E02', 'E99']) {
      const bad = structuredClone(situations);
      bad[0].participants[0].observations[0].source_event_id = source_event_id;
      const read = readIntentionSituations({ situations: bad }, design);
      expect(read[0].participants[0].observations).toEqual([]);
      expect(read[0].refused_observations).toHaveLength(1);
      expect(JSON.stringify(intentionPacket(design, read[0], 'C01'))).not.toMatch(/notice was served/);
    }
    const clean = readIntentionSituations({ situations }, design);
    expect(clean).toHaveLength(3);
    expect(clean[0].refused_observations).toBeUndefined();
  });

  it('rejects unknown participants, duplicate tests and impersonated choices', () => {
    const bad = structuredClone(situations);
    bad[0].participants[0].character_id = 'C99';
    expect(() => readIntentionSituations({ situations: bad }, design)).toThrow(/participant/);
    expect(() => readIntentionSituations({ situations: [situation, situation, situation] }, design)).toThrow(/Invalid/);
    const packet = intentionPacket(design, situation, 'C01');
    expect(() => readIntentionChoice({ ...choice, character_id: 'C02' }, packet)).toThrow(/belong/);
    expect(() => readIntentionChoice({ ...choice, knowledge_used: ['initial:C02:0'] }, packet)).toThrow(/supplied evidence/);
    expect(readIntentionChoice(choice, packet).action).toBe(choice.action);
  });

  it('accepts a unique actor name without its title but still rejects another actor', () => {
    const titled = { ...design, characters: design.characters.map(person => person.id === 'C01' ? { ...person, name: 'Night clerk Ines' } : person) };
    const raw = resolution();
    const result = readIntentionResolution(raw, situations, choices, titled);
    expect(result.collisions[0].required_decisions[0].actor_name).toBe('Night clerk Ines');
    const bad = resolution(); bad.collisions[0].required_decisions[0].actor_name = 'Vance';
    expect(() => readIntentionResolution(bad, situations, choices, titled)).toThrow(/real actor/);
  });
  it('does not pass an unsupported outcome even when the model declares ready', () => {
    const raw = resolution();
    raw.collisions[0].planned_outcome_supported = false;
    const result = readIntentionResolution(raw, situations, choices, design);
    expect(result.review.ready).toBe(false);
    expect(result.review.issues[0]).toMatchObject({ severity: 'major', target_ref: 'causal_map:E02' });
  });

  it('refuses convenient decisions assigned to an untested authority', () => {
    const raw = resolution();
    raw.collisions[2].required_decisions.push({ character_id: null, actor_name: 'Prosecutor', choice_ref: null, decision: 'Cancel the mortgage debt' });
    const result = readIntentionResolution(raw, situations, choices, design);
    expect(result.review.ready).toBe(false);
    expect(result.review.issues).toContainEqual(expect.objectContaining({ target_ref: 'characters:Prosecutor', severity: 'major' }));
  });

  it('requires tested consequences to reach the chapter map', () => {
    const d = { ...design, chapter_map: [{ chapter: 1, event_ids: [], cost: 'Exposure', mechanism: 'Ask' }],
      intention_collisions: readIntentionResolution(resolution(), situations, choices, design) } as unknown as BookDesign;
    expect(designBudgetGaps(d, 1).some(item => item.code === 'intention-unplaced')).toBe(true);
    d.chapter_map[0].event_ids = ['E02'];
    expect(designBudgetGaps(d, 1).some(item => item.code === 'intention-unplaced')).toBe(false);
  });

  it('requires a consequence for every situation', () => {
    const raw = resolution();
    raw.collisions[1] = raw.collisions[0];
    expect(() => readIntentionResolution(raw, situations, choices, design)).toThrow(/missing collision/);
  });

  it('chooses independently and never folds hypothetical consequences into world facts', async () => {
    const before = JSON.stringify(design);
    const actorPrompts: string[] = [];
    const llm: NovelLLM = vi.fn(async (prompt, _system, options) => {
      if (options.stage === 'design-intention-situations') return JSON.stringify({ situations });
      if (options.stage === 'design-intention-resolve') return JSON.stringify(resolution());
      actorPrompts.push(prompt);
      const packet = JSON.parse(prompt.split('PRIVATE PACKET\n')[1].split('\n')[0]);
      return JSON.stringify({ ...choice, situation_id: packet.situation_id });
    });
    const result = await simulateIntentions(design, llm);
    expect(result.choices).toHaveLength(3);
    expect(actorPrompts.every(prompt => !/SECRET|PRIVATE RULE|PRIVATE PAST|Destroy the secret/.test(prompt))).toBe(true);
    expect(JSON.stringify(design)).toBe(before);
  });
});
