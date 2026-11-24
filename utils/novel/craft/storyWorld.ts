import type { StoryTruth, EnactedState } from './types';
export function assertWorldCausality(world: StoryTruth): void {
  const seen = new Set<string>();
  for (const event of world.events) {
    if (seen.has(event.id) || event.dependsOn.some(id => !seen.has(id))) throw new Error(`Event ${event.id} needs unique identity and earlier established causes.`);
    seen.add(event.id);
  }
}
/** Current availability is folded from evidence; planned future losses do not apply. */
export function enactedResources(world: StoryTruth, state: EnactedState): { id: string; owner: string; available: boolean; description: string; evidence?: string }[] {
  const resources = new Map(world.resources.map(resource => [resource.id, { ...resource, evidence: undefined as string | undefined }]));
  for (const scene of state.scenes) for (const change of scene.resources) {
    const item = resources.get(change.resource);
    if (item) resources.set(item.id, { ...item, available: change.available, evidence: change.quote });
  }
  return [...resources.values()];
}
