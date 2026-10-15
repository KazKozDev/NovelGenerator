import type { AuthorArchitecture } from './types';
export function promiseContributions(plan: AuthorArchitecture, scene: string) {
  return plan.promises.promises.flatMap(promise => {
    const progress = promise.progress.filter(step => step.scene === scene);
    const opens = promise.opens === scene, closes = promise.payoff.scene === scene;
    if (!opens && !closes && !progress.length) return [];
    return [{ id: promise.id, expectation: promise.expectation, opens, progress: progress.map(p => p.change), payoffNow: closes ? promise.payoff : null }];
  });
}
