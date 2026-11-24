import type { AuthorArchitecture, SceneNode, EnactedState, SceneExecution } from './types';
export function sceneKnowledge(plan: AuthorArchitecture, node: SceneNode, prefix: EnactedState): Pick<SceneExecution, 'availableFacts' | 'acquireNow'> {
  const acquired = new Set(prefix.scenes.flatMap(s => s.acquisitions.filter(a => a.character === node.pov).map(a => a.fact)));
  const allKnown = plan.revelations.facts.filter(f => f.initialKnownBy.includes(node.pov) || acquired.has(f.id));
  const facts = allKnown.filter(f => !f.supersededBy || !allKnown.some(known => known.id === f.supersededBy));
  return {
    availableFacts: facts.map(f => ({ id: f.id, text: f.truth, kind: f.kind || 'objective', attributedTo: f.attributedTo || null })),
    acquireNow: plan.revelations.facts.flatMap(f => f.acquisitions.filter(a => a.scene === node.id && a.character === node.pov && !allKnown.some(known => known.id === f.id)).map(a => ({ id: f.id, text: f.truth, action: a.action, kind: f.kind || 'objective', attributedTo: f.attributedTo || null }))),
  };
}
/** Private truth is for the author choosing presentation, never writer knowledge. */
export function readerPresentation(plan: AuthorArchitecture, scene: string) {
  return plan.revelations.facts.flatMap(f => f.readerEvidence.filter(e => e.scene === scene).map(e => ({ fact: f.id, event: e.event, interpretation: e.interpretation, mode: f.mode, revealNow: f.reveal === scene })));
}
