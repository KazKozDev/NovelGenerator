import type { AuthorArchitecture, SceneNode, EnactedState } from './types';
/** Author-only moves for the current conflict; private motives never reach prose input. */
export function oppositionForScene(plan: AuthorArchitecture, node: SceneNode, prefix: EnactedState) {
  const agents = plan.characters.characters.filter(c => c.id === plan.opposition.agent || c.name === plan.opposition.agent || node.participants.includes(c.id) && c.id !== node.pov);
  return {
    agent: plan.opposition.agent, limits: plan.opposition.limits,
    moves: plan.opposition.steps.filter(step => node.events.includes(step.event)),
    knowledgeByAgent: agents.map(person => {
      const acquired = new Set(prefix.scenes.flatMap(s => s.acquisitions.filter(a => a.character === person.id).map(a => a.fact)));
      return { character: person.id, initialKnowledge: person.initialKnowledge, facts: plan.revelations.facts.filter(f => f.initialKnownBy.includes(person.id) || acquired.has(f.id)).map(f => ({ id: f.id, text: f.truth, kind: f.kind || 'objective', attributedTo: f.attributedTo || null })) };
    }),
  };
}
