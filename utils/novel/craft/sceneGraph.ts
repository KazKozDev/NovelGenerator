import type { AuthorArchitecture, EnactedState, SceneNode } from './types';
import { enactedResources } from './storyWorld';
/** A compact factual frontier drives the next author decision. */
export function causalFrontier(plan: AuthorArchitecture, node: SceneNode, prefix: EnactedState) {
  const immediate = prefix.scenes.at(-1);
  return {
    causedBy: node.causedBy.map(cause => ({ ...cause, enacted: prefix.scenes.find(s => s.id === cause.scene)?.summary || null })),
    availableOptions: immediate?.options || node.optionsBefore,
    resources: enactedResources(plan.world, prefix),
    relationships: prefix.scenes.flatMap(s => s.relationships),
    previousCost: immediate?.summary || 'Opening situation.',
  };
}
