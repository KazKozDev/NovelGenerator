import { renderPrompt, systemContract } from '../prompts';
import { structuredResponse, withRoom, type NovelLLM } from './llm';
import type { BookDesign, IntentionChoice, IntentionSituation, IntentionSimulation, PlanIssue } from './types';

type Structure = Pick<BookDesign, 'characters' | 'causal_map' | 'world_rules'>;
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/**
 * Timing and identity are checked in code; perceptibility is judged in resolution.
 *
 * A situation that names no real event or an unknown person is refused, and the
 * refusal says which. An observation that cites the hidden past, the tested event
 * or a later one, or gives no way of perceiving it, is left out of the packet
 * instead: the check exists to keep an actor from knowing too much, and an actor
 * who knows less is the safe side of it. Refusing the whole answer over one
 * observation ended a live book twenty-five calls into its design. What was left
 * out stays on the situation, where the record and the resolution can see it.
 */
export function readIntentionSituations(raw: any, design: Structure): IntentionSituation[] {
  if (!Array.isArray(raw?.situations) || raw.situations.length !== 3) throw new Error('Expected three intention situations.');
  const seen = new Set<string>();
  const cast = new Set(design.characters.map(person => person.id));
  return raw.situations.map((situation: any) => {
    const at = design.causal_map.findIndex(event => event.id === situation?.event_id && !event.before_story);
    if (!nonempty(situation?.id) || seen.has(situation.id)) throw new Error('Invalid intention situation: a missing or repeated situation id.');
    if (at < 0) throw new Error(`Invalid intention situation ${situation.id}: event_id "${situation.event_id}" is not an on-page event of the causal map.`);
    if (!nonempty(situation.situation) || !Array.isArray(situation.participants) || !situation.participants.length) {
      throw new Error(`Invalid intention situation ${situation.id}: it needs a situation text and at least one participant.`);
    }
    seen.add(situation.id);
    const participants = new Set<string>();
    const refused: string[] = Array.isArray(situation.refused_observations) ? [...situation.refused_observations] : [];
    const packets = situation.participants.map((packet: any) => {
      if (!cast.has(packet?.character_id) || participants.has(packet.character_id) || !Array.isArray(packet.observations)) {
        throw new Error(`Unknown or duplicate intention participant "${packet?.character_id}" in ${situation.id}.`);
      }
      participants.add(packet.character_id);
      const observations = packet.observations.filter((observation: any) => {
        const source = design.causal_map.findIndex(event => event.id === observation?.source_event_id && !event.before_story);
        const reason = source < 0 ? 'cites the hidden past or no event on the map'
          : source >= at ? 'cites the tested event or a later one'
          : !nonempty(observation.statement) || !nonempty(observation.perception) ? 'gives no statement or no way of perceiving it'
          : '';
        if (reason) refused.push(`${packet.character_id} from ${observation?.source_event_id}: ${reason}`);
        return !reason;
      });
      return { ...packet, observations };
    });
    return { ...situation, participants: packets, ...(refused.length ? { refused_observations: refused } : {}) };
  });
}

/** Actor packets never include the author plan, other people's goals or private rules. */
export function intentionPacket(design: Structure, situation: IntentionSituation, characterId: string) {
  const person = design.characters.find(item => item.id === characterId);
  const participant = situation.participants.find(item => item.character_id === characterId);
  if (!person || !participant) throw new Error('Cannot build an unknown participant packet.');
  return {
    situation_id: situation.id,
    character_id: characterId,
    situation: situation.situation,
    person: {
      name: person.name, goal: person.goal, motives: person.motives,
      capabilities: person.capabilities, limitations: person.limitations, behavior: person.behavior,
    },
    beliefs: person.initial_beliefs,
    evidence: [
      ...person.initial_knowledge.map((statement, index) => ({ id: `initial:${characterId}:${index}`, statement })),
      ...participant.observations.map((item, index) => ({
        id: `observation:${situation.id}:${characterId}:${index}`, statement: item.statement, perception: item.perception,
      })),
    ],
  };
}

export function readIntentionChoice(raw: any, packet: ReturnType<typeof intentionPacket>): IntentionChoice {
  if (raw?.situation_id !== packet.situation_id || raw?.character_id !== packet.character_id ||
      ['action', 'goal_served', 'alternative', 'why_this_choice', 'expected_consequence', 'risk_accepted'].some(key => !nonempty(raw[key])) ||
      !Array.isArray(raw.knowledge_used) || raw.knowledge_used.some((id: unknown) => !packet.evidence.some(item => item.id === id)) ||
      raw.action.trim() === raw.alternative.trim()) {
    throw new Error('Choice must belong to this actor and use only their supplied evidence.');
  }
  // Ignore extra model fields; choices have no authority to update the construction.
  return Object.fromEntries(['situation_id', 'character_id', 'action', 'goal_served', 'knowledge_used', 'alternative',
    'why_this_choice', 'expected_consequence', 'risk_accepted'].map(key => [key, raw[key]])) as unknown as IntentionChoice;
}

export function readIntentionResolution(raw: any, situations: IntentionSituation[], choices: IntentionChoice[], design: Structure): IntentionSimulation {
  if (!Array.isArray(raw?.collisions) || raw.collisions.length !== situations.length || !Array.isArray(raw.issues)) {
    throw new Error('Intention resolution must account for every situation.');
  }
  const seen = new Set<string>();
  for (const collision of raw.collisions) {
    const situation = situations.find(item => item.id === collision?.situation_id);
    if (!situation || seen.has(situation.id) || collision.event_id !== situation.event_id ||
        typeof collision.planned_outcome_supported !== 'boolean' ||
        !Array.isArray(collision.required_decisions) || !collision.required_decisions.length ||
        ['action_response_chain', 'cost', 'resulting_situation', 'reason'].some(key => !nonempty(collision[key]))) {
      throw new Error('Invalid or missing collision consequence.');
    }
    for (const step of collision.required_decisions) {
      const actor = design.characters.find(person => person.id === step.character_id);
      const label = typeof step.actor_name === 'string' ? step.actor_name.trim().toLowerCase() : '';
      const labelMatches = design.characters.filter(person => person.name.trim().toLowerCase() === label ||
        person.name.trim().toLowerCase().endsWith(` ${label}`));
      const sameActor = !!actor && labelMatches.length === 1 && labelMatches[0].id === actor.id;
      if (!nonempty(step.actor_name) || !nonempty(step.decision) ||
          (step.character_id !== null && !sameActor) ||
          (step.choice_ref !== null && !choices.some(choice => choice.situation_id === situation.id &&
            choice.character_id === step.character_id && step.choice_ref === `${situation.id}:${choice.character_id}`))) {
        throw new Error('A decisive step must identify its real actor and a choice from this situation.');
      }
      if (actor) step.actor_name = actor.name;
    }
    seen.add(situation.id);
  }
  const issues: PlanIssue[] = raw.issues;
  if (issues.some(issue => !issue || !['major', 'blocking', 'optional'].includes(issue.severity) ||
      !/^(characters|causal_map|world_rules|dramatic_core|ending):/.test(issue.target_ref) ||
      !nonempty(issue.problem) || !nonempty(issue.required_decision))) throw new Error('Invalid intention repair issue.');
  for (const collision of raw.collisions) {
    for (const step of collision.required_decisions) {
      if (step.choice_ref === null) issues.push({
        id: `INT:${collision.situation_id}:${step.actor_name}`, severity: 'major',
        target_ref: step.character_id ? `causal_map:${collision.event_id}` : `characters:${step.actor_name}`,
        category: 'intentions', problem: `The outcome requires an unchosen decision by ${step.actor_name}: ${step.decision}`,
        evidence_refs: [collision.situation_id], consequence_for_writing: 'The ending depends on convenient compliance.',
        required_decision: `Represent this person's goal, knowledge and means and earn their decision: ${step.decision}`,
        suggested_adjustment: 'Repair the causal mechanism or include this decision maker in the independent choices.',
      });
    }
  }
  // A judge's ready flag cannot conceal an unsupported outcome.
  for (const collision of raw.collisions) {
    if (!collision.planned_outcome_supported) issues.push({
      id: `INT:${collision.situation_id}`, severity: 'major', target_ref: `causal_map:${collision.event_id}`,
      category: 'intentions', problem: collision.reason, evidence_refs: [collision.situation_id],
      consequence_for_writing: collision.resulting_situation,
      required_decision: `Repair the causal event against these choices: ${collision.action_response_chain}`,
      suggested_adjustment: collision.reason,
    });
  }
  return {
    situations, choices, collisions: raw.collisions,
    review: { ready: !issues.some(issue => issue.severity === 'major' || issue.severity === 'blocking'), issues },
  };
}

/** Three turning points, independent actor choices, then one consequence resolution. */
export async function simulateIntentions(design: Partial<BookDesign> & Structure, llm: NovelLLM): Promise<IntentionSimulation> {
  // Planning metadata is excluded; prior experiments are not facts about the world.
  const plan = JSON.stringify({ contract: design.contract, dramatic_core: design.dramatic_core,
    ending: design.ending, characters: design.characters, world_rules: design.world_rules, causal_map: design.causal_map });
  const situations = await structuredResponse(renderPrompt('P01_INTENTION_SITUATIONS', { plan }),
    systemContract(), llm, ['situations'], raw => readIntentionSituations(raw, design),
    { stage: 'design-intention-situations', deliberate: true, temperature: 0.3, maxTokens: 8192 });
  const choices: IntentionChoice[] = [];
  for (const situation of situations) {
    for (const participant of situation.participants) {
      const packet = intentionPacket(design, situation, participant.character_id);
      choices.push(await withRoom(maxTokens => structuredResponse(renderPrompt('P01_INTENTION_CHOICE', { packet: JSON.stringify(packet) }),
        systemContract(), llm, ['situation_id', 'character_id', 'action', 'goal_served', 'knowledge_used', 'alternative',
          'why_this_choice', 'expected_consequence', 'risk_accepted'], raw => readIntentionChoice(raw, packet),
        { stage: 'design-intention-choice', temperature: 0.4, maxTokens }), 2048));
    }
  }
  return resolveIntentions(design, situations, choices, llm);
}

/** Re-evaluate recorded choices without asking actors to pick more convenient ones. */
export async function resolveIntentions(design: Partial<BookDesign> & Structure,
  situations: IntentionSituation[], choices: IntentionChoice[], llm: NovelLLM): Promise<IntentionSimulation> {
  readIntentionSituations({ situations }, design);
  const expected = situations.flatMap(situation => situation.participants.map(person => `${situation.id}:${person.character_id}`));
  if (choices.length !== expected.length || new Set(choices.map(choice => `${choice.situation_id}:${choice.character_id}`)).size !== expected.length ||
      choices.some(choice => !expected.includes(`${choice.situation_id}:${choice.character_id}`))) throw new Error('Every participant must choose exactly once.');
  for (const choice of choices) {
    readIntentionChoice(choice, intentionPacket(design, situations.find(item => item.id === choice.situation_id)!, choice.character_id));
  }
  const plan = JSON.stringify({ contract: design.contract, dramatic_core: design.dramatic_core,
    ending: design.ending, characters: design.characters, world_rules: design.world_rules, causal_map: design.causal_map });
  return structuredResponse(renderPrompt('P01_INTENTION_RESOLVE', {
    plan, situations: JSON.stringify(situations), choices: JSON.stringify(choices),
  }), systemContract(), llm, ['collisions', 'ready', 'issues'], raw => readIntentionResolution(raw, situations, choices, design),
    { stage: 'design-intention-resolve', deliberate: true, temperature: 0.1, maxTokens: 8192 });
}
