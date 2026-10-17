import { describe, it, expect } from 'vitest';
import { COMPARISON_CASES, comparisonPrompt, proseMetrics, judgePrompt } from '../utils/novel/experiments/generationComparison';
describe('generation comparison design', () => {
 it('uses the identical full plan and constraints for both generation units', () => {
  for(const plan of COMPARISON_CASES) {
   for(const mode of ['scenes','chapter'] as const) {
    const prompt=comparisonPrompt(plan,mode,'Already written.',1);
    for(const scene of plan.scenes) expect(prompt).toContain(scene);
    for(const requirement of plan.requirements) expect(prompt).toContain(requirement);
   }
   expect(comparisonPrompt(plan,'scenes','Previous real prose.',1)).toContain('Previous real prose.');
  }
 });
 it('supports a separate isolated-scene control without future scene cards', () => {
  const plan=COMPARISON_CASES[2];
  const prompt=comparisonPrompt(plan,'scenes','Previous prose.',0,true);
  expect(prompt).toContain(plan.scenes[0]);
  expect(prompt).not.toContain(plan.scenes[1]);
  expect(prompt).not.toContain(plan.scenes[2]);
  expect(prompt).toContain('Previous prose.');
 });
 it('counts actual words and repeated sentences rather than treating requested length as actual', () => {
  const metrics=proseMetrics('Нора открыла дверь и положила ключ на стол.\n\nНора открыла дверь и положила ключ на стол.');
  expect(metrics.words).toBe(16);
  expect(metrics.duplicateSentences).toBe(1);
  expect(metrics.paragraphs).toBe(2);
 });
 it('presents anonymized versions and swaps their content without generation labels', () => {
  const prompt=judgePrompt(COMPARISON_CASES[0],'FIRST SAMPLE','SECOND SAMPLE');
  expect(prompt).toContain('ТЕКСТ A:\nFIRST SAMPLE');
  expect(judgePrompt(COMPARISON_CASES[0],'SECOND SAMPLE','FIRST SAMPLE')).toContain('ТЕКСТ A:\nSECOND SAMPLE');
  expect(prompt).not.toContain('scenes');
  expect(prompt).not.toContain('chapter');
 });
});
