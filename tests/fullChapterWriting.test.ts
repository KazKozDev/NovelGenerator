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

  it('asks again for a scene that ends where it began, and keeps the rewrite that moves', async () => {
    const run = mockRun('scene');
    const chapter = run.chapters[0];
    chapter.plan.detailedScenes = [{
      ...chapter.plan.detailedScenes![0],
      shift: { register: 'position', from: 'on the platform with no ticket', to: 'aboard the train as it pulls out' },
    }];
    const still = 'Alex waited on the platform and thought about the ticket he did not have.';
    const moved = 'Alex swung aboard as the couplings took up the slack and the platform slid away behind him.';
    const asks: string[] = [];
    let journalled = 0;

    const mockLLM: NovelLLM = vi.fn(async (prompt, system) => {
      const lit = literaryResponse(prompt, system);
      if (lit !== undefined) return lit;
      if (system.includes('single prose writer')) {
        asks.push(prompt);
        return JSON.stringify({ prose: asks.length === 1 ? still : moved });
      }
      if (system.includes('continuity record')) {
        journalled++;
        // The first scene never leaves the platform; the rewrite can be quoted for the move.
        return journalled === 1
          ? JSON.stringify({ notes: [{ kind: 'position', note: 'Alex is still on the platform.', quote: 'waited on the platform' }], shift: { happened: false, quote: '' } })
          : JSON.stringify({ notes: [{ kind: 'position', note: 'Alex is aboard.', quote: 'swung aboard' }], shift: { happened: true, quote: 'swung aboard as the couplings took up the slack' } });
      }
      return JSON.stringify({ summary: 'Alex boarded.', facts: [], events: [], promises: [] });
    });

    await (new NovelEngine(mockLLM, new MemoryRunStore()) as any).writeRemaining(run).catch(() => {});

    expect(asks).toHaveLength(2);
    expect(asks[0]).toContain('WHAT THIS SCENE SHIFTS: position');
    // The re-ask names the move that did not happen, and asks for the scene rather than a patch.
    expect(asks[1]).toContain('ended where it began');
    expect(asks[1]).toContain('aboard the train as it pulls out');
    expect(chapter.sceneDrafts?.[0]).toBe(moved);
    expect(chapter.sceneJournal?.[0].shiftQuote).toContain('swung aboard');
  });

  it('sends a scene back when a required beat is reported and a beat is played twice', async () => {
    const run = mockRun('scene');
    const chapter = run.chapters[0];
    chapter.plan.detailedScenes = [chapter.plan.detailedScenes![0]];
    const told = 'By the time the guard turned away, Alex had already bought the ticket. The coin fell. Alex picked it up. Later, the coin fell again and Alex picked it up again.';
    const shown = 'The guard turned his head and Alex slid the notes across the sill. The coin rang once on the gravel between them.';
    const asks: string[] = [];
    let journalled = 0;

    const mockLLM: NovelLLM = vi.fn(async (prompt, system) => {
      const lit = literaryResponse(prompt, system);
      if (lit !== undefined) return lit;
      if (system.includes('single prose writer')) {
        asks.push(prompt);
        return JSON.stringify({ prose: asks.length === 1 ? told : shown });
      }
      if (system.includes('continuity record')) {
        journalled++;
        return journalled === 1
          ? JSON.stringify({
            notes: [{ kind: 'event', note: 'Alex has a ticket.', quote: 'had already bought the ticket' }],
            reported: [{ beat: 'Coin slips onto gravel', quote: 'By the time the guard turned away, Alex had already bought the ticket.' }],
            secondTake: [{ beat: 'Guard steps closer', first: 'The coin fell. Alex picked it up.', second: 'the coin fell again and Alex picked it up again' }],
          })
          : JSON.stringify({ notes: [{ kind: 'event', note: 'Alex paid.', quote: 'slid the notes across the sill' }], reported: [], secondTake: [] });
      }
      return JSON.stringify({ summary: 'Alex boarded.', facts: [], events: [], promises: [] });
    });

    await (new NovelEngine(mockLLM, new MemoryRunStore()) as any).writeRemaining(run).catch(() => {});

    expect(asks).toHaveLength(2);
    // One re-ask carries both faults, each with the passage that proves it.
    expect(asks[1]).toContain('reports "Coin slips onto gravel" instead of performing it');
    expect(asks[1]).toContain('plays "Guard steps closer" twice');
    expect(chapter.sceneDrafts?.[0]).toBe(shown);
    expect(chapter.sceneJournal?.[0].reported).toBeUndefined();
  });

  it('discards an inspection finding whose quotation is not in the scene', async () => {
    const run = mockRun('scene');
    const chapter = run.chapters[0];
    chapter.plan.detailedScenes = [chapter.plan.detailedScenes![0]];
    const draft = 'Alex slid the notes across the sill and the guard looked away.';
    let written = 0;

    const mockLLM: NovelLLM = vi.fn(async (prompt, system) => {
      const lit = literaryResponse(prompt, system);
      if (lit !== undefined) return lit;
      if (system.includes('single prose writer')) { written++; return JSON.stringify({ prose: draft }); }
      if (system.includes('continuity record')) {
        return JSON.stringify({
          notes: [{ kind: 'event', note: 'Alex paid.', quote: 'slid the notes across the sill' }],
          // Composed, not copied: the scene says nothing of the kind, so the finding is not a finding.
          reported: [{ beat: 'Conductor checks luggage', quote: 'The conductor had checked the luggage an hour before.' }],
          secondTake: [],
        });
      }
      return JSON.stringify({ summary: 'Alex paid.', facts: [], events: [], promises: [] });
    });

    await (new NovelEngine(mockLLM, new MemoryRunStore()) as any).writeRemaining(run).catch(() => {});

    // No fault survived the quotation check, so no scene was written a second time.
    expect(written).toBe(1);
    expect(chapter.sceneJournal?.[0].reported).toBeUndefined();
  });

  it('leaves a scene standing when the rewrite does not move either', async () => {
    const run = mockRun('scene');
    const chapter = run.chapters[0];
    chapter.plan.detailedScenes = [{
      ...chapter.plan.detailedScenes![0],
      shift: { register: 'position', from: 'on the platform', to: 'aboard the train' },
    }];
    const drafts = ['Alex waited on the platform.', 'Alex went on waiting on the platform.'];
    let written = 0;

    const mockLLM: NovelLLM = vi.fn(async (prompt, system) => {
      const lit = literaryResponse(prompt, system);
      if (lit !== undefined) return lit;
      if (system.includes('single prose writer')) return JSON.stringify({ prose: drafts[Math.min(written++, 1)] });
      if (system.includes('continuity record')) {
        return JSON.stringify({ notes: [{ kind: 'position', note: 'Alex is on the platform.', quote: 'on the platform' }], shift: { happened: false, quote: '' } });
      }
      return JSON.stringify({ summary: 'Alex waited.', facts: [], events: [], promises: [] });
    });

    await (new NovelEngine(mockLLM, new MemoryRunStore()) as any).writeRemaining(run).catch(() => {});

    // One attempt, then the scene stands and the chapter review has it. A run is not lost to this.
    expect(written).toBe(2);
    expect(chapter.sceneDrafts?.[0]).toBe(drafts[0]);
    expect(chapter.sceneJournal?.[0].shiftQuote).toBeUndefined();
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
