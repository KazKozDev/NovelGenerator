import { it, expect } from 'vitest';
import { readSpine, settleSpine } from '../utils/novel/v2/spine';
import { premiseReply } from './premiseReplies';

const spine = () => JSON.parse(premiseReply({ stage: 'thesis-spine' })!);

it('names every missing part of a mechanism at once', () => {
  expect(() => readSpine({ ...spine(), turns: [], chapters: [{ chapter: 1, events: [], worse_because: '' }] }, 2))
    .toThrow(/turns needs at least 3 entries, got 0; chapters has no entry for chapter 2; chapters\[0\]\.events must be a nonempty list of \{where, what\}; chapters\[0\]\.worse_because is empty/);
});

it('lets the people of the story speak first, shows the protagonist only what she could see, and reviews nothing', async () => {
  const stages: string[] = [], prompts: Record<string, string> = {};
  const llm = async (prompt: string, _s: string, options: any) => { stages.push(options.stage); prompts[options.stage] = prompt; return premiseReply(options)!; };
  const settled = await settleSpine('A letter', '', 2, '', llm as any, () => {});
  expect(stages).toEqual(['thesis-voice-opponent', 'thesis-voice-protagonist', 'thesis-spine']);
  expect(prompts['thesis-voice-protagonist']).toContain('1. Trace 1');
  expect(prompts['thesis-voice-protagonist']).not.toContain('Step 1');
  expect(prompts['thesis-voice-protagonist']).not.toContain('Her silence');
  expect(prompts['thesis-spine']).toContain('Her silence');
  expect(prompts['thesis-spine']).toContain('I read it aloud');
  expect(settled.in_two_sentences).toBeTruthy();
});
