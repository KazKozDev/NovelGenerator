import type { AuthorArchitecture } from './types';
/** Scene-local planting actions without tomorrow's explanation of their meaning. */
export function setupsForScene(plan: AuthorArchitecture, scene: string) {
  return plan.payoffs.setups.flatMap(setup => setup.appearances.filter(a => a.scene === scene).map(a => ({ id: setup.id, name: setup.name, role: a.role, action: a.action, interpretationNow: a.interpretation, ...(a.role === 'payoff' ? { changedMeaningNow: setup.changedMeaning } : {}) })));
}
