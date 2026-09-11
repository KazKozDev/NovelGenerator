import { describe, it, expect, vi } from 'vitest';
import { NovelEngine, createRun } from '../utils/novel/engine';
import { createBookSpec, type NovelRun } from '../utils/novel/contracts';
import { MemoryRunStore } from '../utils/novel/runStore';
import { addCandidate, acceptedVersion } from '../utils/novel/storyState';
import { compileBook } from '../utils/novel/presentation';
import type { NovelLLM } from '../utils/novel/review';

describe('skipEditing option', () => {
  it('directly accepts chapter candidate without review or repair when skipEditing is true', async () => {
    const spec = createBookSpec('A secret agent escapes.', 3, {
      skipEditing: true,
    });
    const run = createRun(spec, { provider: 'gemini', ollamaEndpoint: '', ollamaModel: '' });
    run.stage = 'writing';
    run.blueprint = {
      centralConflict: 'Survive the manhunt',
      protagonistChange: 'Learn to trust',
      endingPayoff: 'Deliver the encrypted file',
      characters: { 'Alex': { name: 'Alex', description: 'Operative.' } as any },
      promises: [],
      chapters: [],
    };
    run.chapters = [{
      number: 1,
      status: 'pending',
      repairAttempts: 0,
      versions: [],
      plan: {
        sceneBreakdown: 'Escape the station',
        characterDevelopmentFocus: 'Trust',
        timelineIndicators: 'Morning',
        emotionalToneTension: 'Tense',
        connectionToNextChapter: 'Departure',
        title: 'Escape',
        summary: 'Alex escapes the station.',
        openingHook: 'Steam hissed.',
        chapterEnding: 'The train left.',
        plotAdvancement: 'Perimeter breached',
        targetWordCount: 1000,
        detailedScenes: [],
      },
    }];

    const llm = vi.fn<NovelLLM>(async () => {
      throw new Error('LLM should not be called for review or repair when skipEditing is true');
    });

    const engine = new NovelEngine(llm, new MemoryRunStore()) as any;
    const candidate = addCandidate(run.chapters[0], 'Alex stepped onto the platform and slipped into the shadows of the luggage car.', 'Draft');
    
    await engine.acceptOrRepair(run, run.chapters[0], candidate);

    expect(run.chapters[0].status).toBe('accepted');
    expect(acceptedVersion(run.chapters[0])?.content).toContain('Alex stepped onto the platform');
    expect(llm).toHaveBeenCalledTimes(1);
    expect(candidate.analysis?.summary).toContain('Source excerpts');
    expect(candidate.review?.status).toBe('not_checked');
    expect(candidate.literary).toBeUndefined();
  });

  it('bypasses globalReview and lineEdit when continuing with skipEditing', async () => {
    const spec = createBookSpec('A secret agent escapes.', 3, {
      skipEditing: true,
    });
    const run = createRun(spec, { provider: 'gemini', ollamaEndpoint: '', ollamaModel: '' });
    run.outline = 'Outline approved.';
    run.stage = 'writing';
    run.blueprint = {
      centralConflict: 'Survive the manhunt',
      protagonistChange: 'Learn to trust',
      endingPayoff: 'Deliver the encrypted file',
      characters: { 'Alex': { name: 'Alex', description: 'Operative.' } as any },
      promises: [],
      chapters: [],
    };

    // Pre-populate all 3 chapters as already accepted
    for (let i = 1; i <= 3; i++) {
      const chapter = {
        number: i,
        status: 'accepted' as const,
        repairAttempts: 0,
        versions: [],
        acceptedRevision: 1,
        plan: {
          chapterNumber: i,
          title: `Chapter ${i}`,
          summary: `Summary of chapter ${i}`,
          openingHook: `Hook ${i}`,
          chapterEnding: `Ending ${i}`,
          plotAdvancement: `Advancement ${i}`,
          conflictOrDilemma: `Dilemma ${i}`,
          characterChoices: [{ character: 'Alex', choice: `Choice ${i}` }],
          closingHook: `Closing ${i}`,
          tone: 'tense',
          pointOfView: 'third-limited',
          targetWordCount: 1000,
          detailedScenes: [],
        },
      };
      const version = {
        revision: 1,
        content: `Chapter ${i} full text. Alex moved through the checkpoint.`,
        at: Date.now(),
        reason: 'Initial draft',
        review: { validationVersion: 2 as const, status: 'passed' as const, checkedRevision: 1, issues: [] },
        literary: {
          version: 1 as const,
          status: 'passed' as const,
          checkedRevision: 1,
          contextKey: '',
          issues: [],
          observations: [{
            kind: 'ending' as const,
            subject: `Chapter ${i}`,
            before: 'start',
            after: 'end',
            mechanism: 'progression',
            evidence: [{ chapter: i, revision: 1, quote: `Chapter ${i} full text.` }],
          }],
        },
        analysis: {
          summary: `Summary of chapter ${i}`,
          facts: [],
          events: [],
          promises: [],
          beats: [],
        },
      };
      (chapter.versions as any[]).push(version);
      run.chapters.push(chapter as any);
    }

    // Set correct contextKeys
    const { literaryContextKey } = await import('../utils/novel/literaryState');
    for (let i = 1; i <= 3; i++) {
      run.chapters[i - 1].versions[0].literary!.contextKey = literaryContextKey(run, i);
    }

    const llm = vi.fn<NovelLLM>(async () => JSON.stringify({ title: 'The Flight' }));
    const engine = new NovelEngine(llm, new MemoryRunStore());

    await engine.continue(run);

    expect(run.stage).toBe('complete');
    expect(run.structuralReview).toBeUndefined();
    expect(run.finalReview?.status).toBe('not_checked');
    
    // Check that book compiles cleanly
    const book = compileBook(run);
    expect(book).toContain('# The Flight');
    expect(book).toContain('Chapter 1 full text');
    expect(book).toContain('Chapter 2 full text');
    expect(book).toContain('Chapter 3 full text');
  });
});
