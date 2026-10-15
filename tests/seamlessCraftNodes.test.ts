import { describe, expect, it } from 'vitest';
import { extractLastWords, extractUsedImagery, stripSubtextDecoding, joinScenesWithCameraBreaks } from '../utils/novel/craft/craftRules';
import { blindWriterContext } from '../utils/novel/craft/blindContext';
import type { Packet, Card } from '../utils/novel/craft/craftOrchestrator';

describe('5 Algorithmic Craft Nodes (Seamless Pipeline)', () => {
  const dummyPacket: Packet = {
    names: { protagonist: 'Harry' },
    initialProtagonistKnowledge: ['Letters have arrived.'],
    facts: [],
    scenes: [],
  };

  const dummyCard: Card = {
    id: 'SC2',
    chapter: 1,
    order: 2,
    pov: 'Harry',
    time: 'dusk',
    location: 'study',
    causalLink: 'therefore',
    purpose: 'confront truth',
    action: 'answers the question',
    choice: 'speak plainly',
    cost: 'safety',
    change: 'vulnerability',
    valueCharge: { start: 'uncertain', end: 'exposed', shift: '+ to -' },
    conflict: { external: 'door blocked', interpersonal: 'Voldemort waiting', internal: 'fear of exposure' },
    dialogueAims: {},
    rhythm: 'dialogue',
    readerBefore: '',
    readerAfter: '',
    dependsOn: ['SC1'],
    povKnows: [],
    newFacts: [],
    props: ['beedle_book'],
  };

  it('Node 1: extracts tail of previous scene for Tail-Head handoff', () => {
    const prevScene = 'Word '.repeat(250) + 'Which one do you think I am?';
    const tail = extractLastWords(prevScene, 50);
    expect(tail).toContain('Which one do you think I am?');
    expect(tail.split(/\s+/).length).toBeLessThanOrEqual(51);

    const context = blindWriterContext(dummyPacket, dummyCard, [], [], [prevScene], 'fantasy');
    expect(context).toContain('LAST_SCENE_ENDING');
    expect(context).toContain('TAIL-HEAD HANDOFF DIRECTIVE');
    expect(context).toContain('DO NOT reset the timeline, rewind, or re-narrate events');
  });

  it('Node 2: maintains dynamic stop-list of used metaphors and imagery', () => {
    const page1 = 'His tongue had a copper taste, like a struck match in a cold room.';
    const imagery = extractUsedImagery([page1]);
    expect(imagery).toContain('copper taste');
    expect(imagery).toContain('struck match');

    const context = blindWriterContext(dummyPacket, dummyCard, [], [], [page1], 'fantasy', {
      usedImagery: imagery,
    });
    expect(context).toContain('BANNED SENSORY IMAGERY & PREVIOUSLY USED METAPHORS');
    expect(context).toContain('"copper taste"');
    expect(context).toContain('"struck match"');
  });

  it('Node 3: locks single-POV camera and inserts *** breaks on POV shift', () => {
    const context = blindWriterContext(dummyPacket, dummyCard, [], [], [], 'fantasy');
    expect(context).toContain('STRICT SINGLE-POV CAMERA LOCK (POV: Harry)');
    expect(context).toContain('NEVER jump into another character\'s head');

    const scene1 = { text: 'Harry watched the fire.', pov: 'Harry' };
    const scene2 = { text: 'Narcissa looked in the mirror.', pov: 'Narcissa' };
    const scene3 = { text: 'Narcissa took the mirror.', pov: 'Narcissa' };

    const joined = joinScenesWithCameraBreaks([scene1, scene2, scene3]);
    expect(joined).toBe('Harry watched the fire.\n\n* * *\n\nNarcissa looked in the mirror.\n\nNarcissa took the mirror.');
  });

  it('Node 4: strips subtext decoding sentences following dialogue', () => {
    const rawProse = `"Which one do you think I am?" he asked.\nHarry heard what was underneath the question: an invitation to surrender.\nHe did not reply.`;
    const stripped = stripSubtextDecoding(rawProse);
    expect(stripped).not.toContain('Harry heard what was underneath');
    expect(stripped).toContain('"Which one do you think I am?" he asked.');
    expect(stripped).toContain('He did not reply.');
  });

  it('Node 5: injects exact prop state and inscriptions for physical continuity', () => {
    const context = blindWriterContext(dummyPacket, dummyCard, [], [], [], 'fantasy', {
      objectStates: {
        beedle_book: {
          id: 'beedle_book',
          name: 'The Tales of Beedle the Bard',
          location: 'Harry bedside table',
          inscriptions: [
            {
              section: 'The Hopping Pot',
              author: 'Voldemort',
              exactText: 'And yet he used it. What does that make him?',
            },
          ],
        },
      },
    });

    expect(context).toContain('EXACT PROP STATES (BINDING PHYSICAL CONTINUITY)');
    expect(context).toContain('The Tales of Beedle the Bard');
    expect(context).toContain('The Hopping Pot');
    expect(context).toContain('And yet he used it. What does that make him?');
    expect(context).toContain('quote existing inscriptions verbatim');
  });
});
