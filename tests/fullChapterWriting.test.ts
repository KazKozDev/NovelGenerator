import { describe, it, expect, vi } from 'vitest';
import { NovelEngine, createRun } from '../utils/novel/engine';
import { writeFullChapter } from '../utils/novel/writer';
import { createBookSpec, type ChapterRecord, type NovelRun } from '../utils/novel/contracts';
import { MemoryRunStore } from '../utils/novel/runStore';
import type { NovelLLM } from '../utils/novel/review';
import { literaryResponse } from './helpers/literaryFixture';

function mockRun(mode: 'full' | 'scene' = 'full'): NovelRun {
  const spec = createBookSpec('A secret agent escapes across borders.', 3, {
    targetWordsPerChapter: 3000,
    chapterMode: mode
  });
  const provider = { provider: 'gemini' as const, ollamaEndpoint: '', ollamaModel: '' };
  const run = createRun(spec, provider);
  run.stage = 'writing';
  run.blueprint = {
    centralConflict: 'Survive the manhunt',
    protagonistChange: 'Learn to trust strangers',
    endingPayoff: 'Deliver the encrypted file',
    characters: {
      'Alex': { name: 'Alex', description: 'Rogue operative on the run.' } as any
    },
    promises: [
      { id: 'p1', description: 'Passport stolen', setupChapter: 1, payoffChapter: 2, required: true }
    ],
    chapters: []
  };
  run.chapters = [{
    number: 1,
    status: 'pending',
    repairAttempts: 0,
    versions: [],
    plan: {
      sceneBreakdown: 'Arrival and departure',
      characterDevelopmentFocus: 'Trust under pressure',
      title: 'The Train Station',
      summary: 'Alex arrives at the terminal and evades security.',
      openingHook: 'Steam hissed against cold glass.',
      chapterEnding: 'The train departed into the fog.',
      plotAdvancement: 'Escape the first perimeter',
      timelineIndicators: 'Morning',
      emotionalToneTension: 'Tense',
      connectionToNextChapter: 'Heading to the safehouse',
      detailedScenes: [
        {
          sceneId: 'scene-1',
          duration: 'Ten minutes', mood: 'Tense',
          location: 'Platform 4',
          participants: ['Alex'],
          objective: 'Buy a ticket without passport',
          conflict: 'Cash only and guard looking over',
          outcome: 'Buys forged ticket',
          keyMoments: ['Guard steps closer', 'Coin slips onto gravel'],
          conflictCarriedBy: 'action'
        },
        {
          sceneId: 'scene-2',
          duration: 'Ten minutes', mood: 'Uneasy',
          location: 'Train Carriage',
          participants: ['Alex'],
          objective: 'Blend in before departure',
          conflict: 'Passenger asks about the blood on coat',
          outcome: 'Deflects with a lie and secures seat',
          keyMoments: ['Conductor checks luggage', 'Whispered excuse'],
          conflictCarriedBy: 'speech'
        }
      ]
    }
  }];
  return run;
}

describe('Full chapter generation', () => {
  it('writeFullChapter produces prompt with all scenes and target word count', async () => {
    const run = mockRun('full');
    const chapter = run.chapters[0];
    let capturedPrompt = '';

    const mockLLM: NovelLLM = vi.fn(async (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify({
        prose: 'Steam hissed against cold glass as Alex stepped onto Platform 4. The guard watched closely.\n\n***\n\nThe carriage was warm and smelled of stale tobacco.'
      });
    });

    const result = await writeFullChapter(run, chapter, mockLLM);

    expect(capturedPrompt).toContain('Platform 4');
    expect(capturedPrompt).toContain('Train Carriage');
    expect(capturedPrompt).toContain('Buys forged ticket');
    expect(capturedPrompt).toContain('Deflects with a lie');
    expect(capturedPrompt).toContain('Target length: approximately 3000 words');
    expect(result).toContain('Platform 4');
    expect(result).toContain('The carriage was warm');
  });

  it('NovelEngine writeRemaining writes entire chapter in one pass when chapterMode is full', async () => {
    const run = mockRun('full');
    let callCount = 0;

    const mockLLM: NovelLLM = vi.fn(async (prompt, system) => {
      callCount++;
      const lit = literaryResponse(prompt, system);
      if (lit !== undefined) return lit;
      if (system.includes('single prose writer')) {
        return JSON.stringify({
          prose: 'First scene at the platform with steam.\n\n***\n\nSecond scene in the train carriage.'
        });
      }
      // Review calls
      return JSON.stringify({
        summary: 'Alex boarded the train.',
        facts: [{
          id: 'f1',
          subject: 'Alex',
          predicate: 'location',
          value: 'train',
          knownBy: ['Alex'],
          evidence: { chapter: 1, revision: 1, quote: 'Second scene in the train carriage.' }
        }],
        events: [],
        promises: []
      });
    });

    const engine = new NovelEngine(mockLLM, new MemoryRunStore());
    await (engine as any).writeRemaining(run).catch(() => {});

    // Chapter was written in one pass, not scene by scene
    expect(run.chapters[0].sceneDrafts?.length).toBe(2);
    expect(run.chapters[0].sceneDrafts?.[0]).toBe('First scene at the platform with steam.');
    expect(run.chapters[0].sceneDrafts?.[1]).toBe('Second scene in the train carriage.');
    expect(run.chapters[0].versions.length).toBeGreaterThanOrEqual(1);
    expect(run.chapters[0].versions[0].content).toContain('First scene at the platform with steam.');
  });

  it('includes Russian dialogue formatting and scene target quotas when language is Russian', async () => {
    const run = mockRun('full');
    run.spec.language = 'Russian';
    const chapter = run.chapters[0];
    let capturedPrompt = '';

    const mockLLM: NovelLLM = vi.fn(async (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify({ prose: '— Куда мы едем? — спросил Алекс.\n— Скоро узнаешь, — ответил проводник.' });
    });

    await writeFullChapter(run, chapter, mockLLM);

    expect(capturedPrompt).toContain('ПРАВИЛА ДИАЛОГОВ');
    expect(capturedPrompt).toContain('35–50%');
    expect(capturedPrompt).toContain('— ');
    expect(capturedPrompt).toContain('Target Scene Length: approximately');
  });
});
