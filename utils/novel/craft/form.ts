import type { BookContract, FormPlan } from './types';
export function buildSceneSlots(contract: BookContract, counts: number[]): FormPlan['sceneSlots'] {
  if (counts.length !== contract.chapters || counts.some(n => !Number.isInteger(n) || (contract.layout === 'classic-three-scenes' ? n !== 3 : n < 1 || n > 4))) throw new Error('Scene counts violate the selected form.');
  const count = counts.reduce((sum, n) => sum + n, 0);
  if (contract.words < count) throw new Error('The word target must allow at least one word per scene.');
  let order = 0;
  return counts.flatMap((n, chapter) => Array.from({ length: n }, () => {
    order++;
    return { id: `SC${order}`, order, chapter: chapter + 1, targetWords: Math.floor(contract.words / count) + (order <= contract.words % count ? 1 : 0) };
  }));
}
