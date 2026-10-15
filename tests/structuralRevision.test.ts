import { describe, it, expect } from 'vitest';
import { CraftSession } from '../utils/novel/craft/state';
import { acceptArchitecture } from '../utils/novel/craft/planning';
import { restructureBook } from '../utils/novel/craft/revision';
import { authorArchitecture } from './fixtures/authorArchitecture';

const input = { premise: 'Nora exposes a forgery.', genre: 'thriller', author_requirements: '', chapter_count: 1, target_total_words: 1200 };
async function setup() {
  const files: Record<string, string> = { 'scene-1.md': 'The guard confessed. Nora took the key.', 'scene-2.md': 'The key broke. The guard confessed again.', 'scene-3.md': 'Nora read the ledger aloud.' };
  const session = new CraftSession(files, 'book', () => {});
  await acceptArchitecture(authorArchitecture(), session);
  const chapters = [{ chapter: 1, text: [files['scene-1.md'], files['scene-2.md'], files['scene-3.md']].join('\n\n') }];
  return { files, session, chapters };
}
function plan() {
  return { problem: 'The same confession occurs twice.', openingPromise: 'Nora needs access.', endingExecution: 'She speaks publicly.', scenes: [
    { id: 'SC1', chapter: 1, sources: ['SC1'], operation: 'rewrite', instruction: 'Remove the confession, preserve taking the key.', dependencies: ['SC2'], beforeState: 'No key.', afterState: 'Key acquired.', revealChanges: 'The confession moves to SC2.', targetWords: 400 },
    { id: 'SC2', chapter: 1, sources: ['SC2'], operation: 'rewrite', instruction: 'Reveal the confession here for the first time.', dependencies: ['SC1'], beforeState: 'Key held.', afterState: 'Key broken; confession heard.', revealChanges: 'Only first confession.', targetWords: 400 },
    { id: 'SC3', chapter: 1, sources: ['SC3'], operation: 'keep', instruction: 'Keep the climax.', dependencies: [], beforeState: 'Evidence held.', afterState: 'Forgery exposed.', revealChanges: 'No change.', targetWords: 400 },
  ] };
}
describe('coordinated whole-book structural work', () => {
  it('moves a revelation through one shared plan and stages the whole result without mutating sources', async () => {
    const { files, session, chapters } = await setup(); const prompts: string[] = [];
    const result = await restructureBook(input, chapters, session, async (prompt, _s, options) => {
      if (options!.stage === 'craft-author-revision-plan') return JSON.stringify(plan());
      prompts.push(prompt);
      return JSON.stringify({ text: prompt.includes('Execute only target SC1') ? 'Nora took the key.' : 'The key broke. The guard confessed.' });
    });
    expect(prompts).toHaveLength(2);
    expect(prompts.every(p => p.includes('The confession moves to SC2.') && p.includes('Only first confession.'))).toBe(true);
    expect(result.chapters[0].text).toBe('Nora took the key.\n\nThe key broke. The guard confessed.\n\nNora read the ledger aloud.');
    expect(files['scene-1.md']).toContain('guard confessed');
    expect(chapters[0].text).toContain('confessed again');
    expect(Object.keys(files).some(k => k.endsWith('/staged.json'))).toBe(true);
  });
  it('retains source and staged successful operations when a later rewrite fails, then resumes only pending work', async () => {
    const { session, chapters } = await setup(); let writes = 0;
    await expect(restructureBook(input, chapters, session, async (prompt, _s, options) => {
      if (options!.stage === 'craft-author-revision-plan') return JSON.stringify(plan());
      writes++;
      if (prompt.includes('Execute only target SC2')) throw new Error('offline');
      return '{"text":"Nora took the key."}';
    })).rejects.toThrow('saved decisions retained');
    expect(writes).toBe(3); // SC1 once; SC2 twice with recovery
    expect(chapters[0].text).toContain('confessed again');
    let resumedWrites = 0;
    const result = await restructureBook(input, chapters, session, async (_p, _s, options) => {
      expect(options!.stage).toBe('craft-author-revision-write'); resumedWrites++;
      return '{"text":"The key broke. The guard confessed."}';
    });
    expect(resumedWrites).toBe(1);
    expect(result.chapters[0].text).not.toContain('confessed again');
  });
  it('normalizes LLM ID variations and placeholder dependencies in structural strategy and batch plan', async () => {
    const { session } = await setup();
    // Create large book text (> 60000 chars) to trigger large branch (strategy + batch)
    const longText = 'Nora investigated the vault carefully. '.repeat(2000);
    const longChapters = [{ chapter: 1, text: longText }];
    const result = await restructureBook(input, longChapters, session, async (prompt, _s, options) => {
      if (options!.stage === 'craft-author-digest') {
        return JSON.stringify({
          chapter: 1,
          synopsis: 'Nora investigates the vault.',
          evidence: [{ id: 'CH1-1', quote: 'Nora investigated the vault carefully.', meaning: 'Inspection occurred.' }],
          openQuestions: [],
        });
      }
      if (options!.stage === 'craft-author-revision-strategy') {
        return JSON.stringify({
          problem: 'Timing issue in early scenes.',
          openingPromise: 'Nora needs access.',
          endingExecution: 'She speaks publicly.',
          changes: [
            {
              id: 'change-1',
              instruction: 'Move the confession.',
              targets: ['scene-1', 'SC02'],
              sourceIds: ['scene-1', 'none'],
              revealChanges: 'Moves earlier.',
              dependencies: ['none', 'SC3'],
            },
            {
              id: 'change-1', // duplicate ID
              instruction: 'Secondary timing change.',
              targets: ['SC3'],
              sourceIds: ['SC3'],
              revealChanges: 'No change.',
              dependencies: ['scene-1'],
            },
          ],
        });
      }
      if (options!.stage === 'craft-author-revision-batch') {
        return JSON.stringify({
          problem: 'Timing issue.',
          openingPromise: 'Nora needs access.',
          endingExecution: 'She speaks publicly.',
          scenes: [
            { id: 'scene-1', chapter: 1, sources: ['scene-1'], operation: 'rewrite', instruction: 'Rewrite SC1', dependencies: ['none', 'SC2'], beforeState: 'A', afterState: 'B', revealChanges: 'C', targetWords: 400 },
            { id: 'SC02', chapter: 1, sources: ['SC2'], operation: 'rewrite', instruction: 'Rewrite SC2', dependencies: ['scene-1'], beforeState: 'B', afterState: 'C', revealChanges: 'D', targetWords: 400 },
            { id: 'SC3', chapter: 1, sources: ['SC3'], operation: 'keep', instruction: 'Keep SC3', dependencies: [], beforeState: 'C', afterState: 'D', revealChanges: 'E', targetWords: 400 },
          ],
        });
      }
      return '{"text":"Nora concluded the investigation."}';
    });
    expect(result.plan.scenes[0].id).toBe('SC1');
    expect(result.plan.scenes[1].id).toBe('SC2');
    expect(result.plan.scenes[0].dependencies).toEqual(['SC2']);
    expect(result.chapters[0].text).toContain('Nora concluded the investigation.');
  });
});
