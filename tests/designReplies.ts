import type { BookDesign } from '../utils/novel/v2/types';

/** Fixture protocol for staged planning; alternatives differ before selection. */
export function designReply(prompt: string, design: BookDesign): string | undefined {
  if (prompt.includes('Build three pressure situations')) {
    const event = design.causal_map.find(item => !item.before_story);
    return JSON.stringify({ situations: [1, 2, 3].map(index => ({
      id: `T0${index}`, event_id: event.id, situation: 'A decision must be made with the available means.',
      participants: [{ character_id: design.characters[0].id, observations: [] }],
    })) });
  }
  if (prompt.includes('Choose an action for this person')) {
    const packet = JSON.parse(prompt.split('PRIVATE PACKET\n')[1].split('\n')[0]);
    return JSON.stringify({ situation_id: packet.situation_id, character_id: packet.character_id,
      action: 'Act within the available means', goal_served: packet.person.goal,
      knowledge_used: [], alternative: 'Wait for more information', why_this_choice: 'Waiting loses the opportunity',
      expected_consequence: 'An opportunity to proceed', risk_accepted: 'Exposure' });
  }
  if (prompt.includes('Resolve what follows when independently chosen actions meet')) {
    const situations = JSON.parse(prompt.split('PRESSURE SITUATIONS\n')[1].split('\n')[0]);
    return JSON.stringify({ collisions: situations.map((item: any) => ({ situation_id: item.id, event_id: item.event_id,
      action_response_chain: 'The informed choice meets a limit and earns the outcome',
      required_decisions: [{ character_id: design.characters[0].id, actor_name: design.characters[0].name,
        choice_ref: `${item.id}:${design.characters[0].id}`, decision: 'Act within the available means' }], cost: 'Exposure',
      resulting_situation: 'The opportunity has been used', planned_outcome_supported: true, reason: 'Means and motives support it' })),
      ready: true, issues: [] });
  }
  if (prompt.includes('Generate exactly THREE')) {
    return JSON.stringify({ candidates: [0, 1, 2].map(index => ({
      ...design,
      dramatic_core: { ...design.dramatic_core, distinctive_situation: `${design.dramatic_core.distinctive_situation} variant ${index}` },
      ending: { ...design.ending, decisive_action_or_choice: `${design.ending.decisive_action_or_choice} choice ${index}` },
    })) });
  }
  if (prompt.includes('Compare three candidate plans')) {
    return JSON.stringify({ candidate_index: 0, reason: 'Specific causal invention',
      comparisons: [0, 1, 2].map(candidate_index => ({ candidate_index, strengths: 'Concrete stakes', weaknesses: 'Requires careful setup' })) });
  }
}

