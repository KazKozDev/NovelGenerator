import { describe, it, expect, vi } from 'vitest';
import { NovelEngine, createRun } from '../utils/novel/engine';
import { createBookSpec, type NovelRun } from '../utils/novel/contracts';
import { MemoryRunStore } from '../utils/novel/runStore';
import { addCandidate, acceptedVersion, acceptCandidate } from '../utils/novel/storyState';
import { compileBook } from '../utils/novel/presentation';
import type { NovelLLM } from '../utils/novel/review';
import { stampLiterary } from './helpers/literaryFixture';

describe('forwardOnly mode', () => {
  it('does not invalidate downstream chapters when an early chapter moves canon in forwardOnly mode', () => {
    const spec = createBookSpec('A secret agent escapes.', 3, {
      forwardOnly: true,
      skipEditing: false,
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

    // Populate chapters 1, 2, 3 as accepted
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
        content: `Chapter ${i} full text. Alex moved through checkpoint ${i}.`,
        at: Date.now(),
        reason: 'Initial draft',
        review: { validationVersion: 2 as const, status: 'passed' as const, checkedRevision: 1, issues: [] },
        analysis: {
          summary: `Summary of chapter ${i}`,
          facts: [{ id: `f-${i}`, subject: 'Alex', predicate: 'door', value: `${i}`, knownBy: ['Alex'], evidence: { chapter: i, revision: 1, quote: `checkpoint ${i}` } }],
          events: [],
          promises: [],
          beats: [],
        },
      };
      stampLiterary(run, i, version as any);
      (chapter.versions as any[]).push(version);
      run.chapters.push(chapter as any);
    }

    // Now update Chapter 1 with moving canon facts
    const ch1 = run.chapters[0];
    const candidate = addCandidate(ch1, 'Chapter 1 changed text completely.', 'Revised');
    candidate.review = { validationVersion: 2, status: 'passed', checkedRevision: candidate.revision, issues: [] };
    candidate.analysis = {
      summary: 'Summary changed',
      facts: [{ id: 'f-1', subject: 'Alex', predicate: 'door', value: '999', knownBy: ['Alex'], evidence: { chapter: 1, revision: candidate.revision, quote: 'changed text' } }],
      events: [],
      promises: [],
      beats: [],
    };
    stampLiterary(run, 1, candidate as any);

    acceptCandidate(run, 1);

    // In forward-only mode, chapters 2 and 3 MUST remain accepted!
    expect(run.chapters[0].status).toBe('accepted');
    expect(run.chapters[1].status).toBe('accepted');
    expect(run.chapters[2].status).toBe('accepted');
    expect(run.chapters.map(c => c.status)).toEqual(['accepted', 'accepted', 'accepted']);
  });

  it('bypasses globalReview rewrites and completes cleanly when forwardOnly is true', async () => {
    const spec = createBookSpec('A secret agent escapes.', 3, {
      forwardOnly: true,
      skipEditing: false,
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
        content: `Chapter ${i} full text. Alex escaped safely.`,
        at: Date.now(),
        reason: 'Initial draft',
        review: { validationVersion: 2 as const, status: 'passed' as const, checkedRevision: 1, issues: [] },
        analysis: {
          summary: `Summary of chapter ${i}`,
          facts: [],
          events: [],
          promises: [],
          beats: [],
        },
      };
      stampLiterary(run, i, version as any);
      (chapter.versions as any[]).push(version);
      run.chapters.push(chapter as any);
    }

    // LLM returns a failed review for the whole book, but forwardOnly should NOT rewrite earlier chapters
    const llm = vi.fn<NovelLLM>(async (prompt: string, system: string) => {
      if (system.includes('book review') || system.includes('review the entire novel')) {
        return JSON.stringify({
          status: 'failed',
          issues: [{
            id: 'pacing-issue',
            category: 'pacing',
            severity: 'major',
            description: 'The pacing in chapter 1 could be tighter.',
            instruction: 'Rewrite chapter 1 to be tighter.',
            evidence: [{ chapter: 1, revision: 1, quote: 'Chapter 1 full text.' }],
          }],
        });
      }
      if (system.includes('title')) {
        return JSON.stringify({ title: 'The Safe House' });
      }
      return 'Unexpected call';
    });

    const engine = new NovelEngine(llm, new MemoryRunStore());
    await engine.continue(run);

    expect(run.stage).toBe('complete');
    expect(run.title).toBe('The Safe House');
    // Chapter 1 was not rewritten, remains revision 1
    expect(run.chapters[0].versions).toHaveLength(1);
    expect(acceptedVersion(run.chapters[0])?.revision).toBe(1);

    const compiled = compileBook(run);
    expect(compiled).toContain('# The Safe House');
    expect(compiled).toContain('Chapter 1 full text');
  });
});
