/** Targets permit a 10% shortfall, but never rely on a model's length claim. */
export function wordBudget(text: string, target: number) {
  const words = text.match(/\S+/gu)?.length || 0;
  const minimum = Math.ceil(target * 0.9);
  return { words, target, minimum, missing: Math.max(0, minimum - words), ready: words >= minimum };
}
