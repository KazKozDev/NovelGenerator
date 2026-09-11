import { describe, expect, it, vi } from 'vitest';
import { createBookSpec, type ChapterRecord } from '../utils/novel/contracts';
import { createRun } from '../utils/novel/engine';
import {
  DEEPCHECK_LANG_KEY,
  DEEPCHECK_NLI_KEY,
  checkChapter,
  checkEmotions,
  checkGenre,
  claimsForChapter,
  deepCheckTools,
  isLocalModelOn,
} from '../utils/novel/deepCheck';

function setup() {
  const run = createRun(createBookSpec('Thorne guards a letter.', 3, { targetWordsPerChapter: 300 }), {
    provider: 'ollama', ollamaModel: 'test', ollamaEndpoint: 'http://localhost:11434',
  });
  run.outline = 'Thorne guards the letter and pays the price.';
  const content = 'Thorne opened door 1 and stepped into the cold hallway beyond it.';
  run.chapters = [1, 2, 3].map(number => {
    const chapter: ChapterRecord = {
      number,
      status: number === 1 ? 'accepted' : 'pending',
      repairAttempts: 0,
      versions: [],
      plan: {
        title: `Part ${number}`, summary: 'A consequential choice', sceneBreakdown: 'One encounter',
        characterDevelopmentFocus: 'Trust', plotAdvancement: 'Disclosure', timelineIndicators: 'Evening',
        emotionalToneTension: 'Tense', connectionToNextChapter: 'Consequences', openingHook: 'A knock',
        chapterEnding: 'A decision', moralDilemma: 'Loyalty', consequencesOfChoices: 'Cost',
        rhythmPacing: 'Steady', tensionLevel: 5,
        detailedScenes: [{
          sceneId: 's1', location: 'house', participants: ['Thorne'], objective: 'Guard the letter',
          conflict: 'Fear', outcome: 'A choice', duration: 'an hour', mood: 'tense', keyMoments: ['the knock'],
        }],
      } as ChapterRecord['plan'],
    };
    if (number === 1) {
      chapter.acceptedRevision = 1;
      chapter.versions = [{
        revision: 1, content, reason: 'test', createdAt: 0,
        review: { status: 'passed', issues: [], checkedRevision: 1 },
        analysis: {
          summary: 'Thorne opens the door.',
          facts: [{
            id: 'door-1', subject: 'Thorne', predicate: 'location', value: 'door 1',
            knownBy: ['Thorne'], evidence: { chapter: 1, revision: 1, quote: 'Thorne opened door 1' },
          }],
          events: [], promises: [],
        },
      }];
    }
    return chapter;
  });
  return run;
}

describe('quiet deep checks', () => {
  it('stays off without explicit consent, even in a browser-shaped env', () => {
    expect(isLocalModelOn(DEEPCHECK_NLI_KEY)).toBe(false);
    expect(isLocalModelOn(DEEPCHECK_LANG_KEY)).toBe(false);
    expect(deepCheckTools(() => {})).toEqual({});
  });

  it('samples short canon claims about the chapter people', () => {
    const run = setup();
    expect(claimsForChapter(run, 2)).toEqual(['Thorne location: door 1']);
    expect(claimsForChapter(run, 2, 0)).toEqual([]);
  });

  it('reports contradictions and language mismatch as advisory data', async () => {
    const run = setup();
    const score = vi.fn(async (claim: string, sentence: string) => ({
      contradiction: claim.includes('door 1') && sentence.includes('Paris') ? 0.9 : 0.1,
      entailment: 0.05,
      neutral: 0.05,
    }));
    const identify = vi.fn(async () => ({ label: 'ru', score: 0.9 }));
    const report = await checkChapter(
      run, 2,
      'Thorne swore he had never been to Paris in his entire life before today.',
      { score, identify },
    );
    expect(report.contradictions).toHaveLength(1);
    expect(report.language).toMatchObject({ label: 'ru', expected: 'English', ok: false });
  });

  it('verifies the outline genre once per book', async () => {
    const run = setup();
    const thriller = vi.fn(async (_text: string, _labels: string[]) => [
      { label: 'thriller', score: 0.7 },
      { label: 'fantasy', score: 0.2 },
    ]);
    const verdict = await checkGenre(run, 'A detective chases a killer through the docks.', thriller);
    expect(verdict).toMatchObject({ top: 'thriller', expected: 'fantasy', ok: false });
    expect(thriller.mock.calls[0][1]).toContain('fantasy');
    const fantasy = vi.fn(async () => [{ label: 'fantasy', score: 0.8 }]);
    expect((await checkGenre(run, 'Dragons circle the tower.', fantasy))?.ok).toBe(true);
    expect(await checkGenre(run, '   ', fantasy)).toBeUndefined();
  });

  it('scores chapter emotions over capped passages', async () => {
    const score = vi.fn(async (text: string) => ({
      labels: ['grief', 'joy'],
      scores: text.includes('wept') ? [0.9, 0.1] : [0.2, 0.1],
    }));
    const felt = await checkEmotions(2, 'Mara wept over the ledger.\n\nJoy carried her home.', score);
    expect(felt).toMatchObject({ chapter: 2, dominant: 'grief' });
    expect(felt!.variety).toBeCloseTo(0.5);
    expect(score).toHaveBeenCalledTimes(2);
    expect(await checkEmotions(2, '   ', score)).toBeUndefined();
  });

  it('stays silent when no tools are configured', async () => {
    const run = setup();
    const report = await checkChapter(run, 2, 'Thorne opened door 1 and stepped into the cold hallway beyond it.', {});
    expect(report).toEqual({ chapter: 2, contradictions: [], language: undefined });
  });
});
