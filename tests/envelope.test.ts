import { describe, expect, it } from 'vitest';
import { ENVELOPE, around, mentions, readNumbers, readThings, sideBySide } from '../utils/novel/v3/envelope';
import { newDesk, takeStep } from '../utils/novel/v3/authorDesk';

describe('the sealed envelope', () => {
  it('reads the list of things a small model gives, and passes over anything else', () => {
    expect(readThings('Here is the list:\n- the brass key: key, keys\n2. **the side door**: door, entrance\nnothing more')).toEqual([
      { thing: 'the brass key', words: ['key', 'keys'] }, { thing: 'the side door', words: ['door', 'entrance'] }]);
  });

  it('finds the sentences that name a thing, and reads back only numbers that exist', () => {
    const text = 'She kept the key on a chain at her neck. It rained all night on the harbor road. The keys were never out of her sight.';
    expect(mentions(text, { thing: 'the brass key', words: ['key'] })).toHaveLength(2);
    expect(readNumbers('2, 7 and 1', 2)).toEqual([2, 1]);
    expect(readNumbers('none', 5)).toEqual([]);
  });

  it('shows the clause where the thing is named, not the head of a long sentence', () => {
    const line = `${'She had built a room and someone had come into it and moved the furniture, '.repeat(3)}and there was a locked drawer in her desk.`;
    expect(around(line, { thing: 'the desk drawer', words: ['drawer'] })).toContain('locked drawer');
  });

  it('sets the author\'s own lines side by side, and only for things the envelope speaks of', () => {
    const things = [{ thing: 'the desk drawer', words: ['drawer'] }, { thing: 'the pen', words: ['pen'] }];
    const held = { [ENVELOPE]: [{ thing: 'the desk drawer', line: 'The drawer was not locked.' }], 'chapter-1.md': [{ thing: 'the desk drawer', line: 'She locked the drawer every night.' }],
      'chapter-2.md': [{ thing: 'the desk drawer', line: 'The drawer stood open.' }, { thing: 'the pen', line: 'Her pen lay on the sill.' }] };
    const shown = sideBySide(things, held, 'chapter-2.md', ['chapter-1.md', 'chapter-2.md'], false);
    expect(shown).toContain('the envelope: "The drawer was not locked."');
    expect(shown).toContain('chapter-1.md: "She locked the drawer every night."');
    expect(shown).toContain('chapter-2.md, just written: "The drawer stood open."');
    expect(shown).not.toContain('the pen');
  });

  it('hands a chapter back with what it says of the envelope\'s things, at no cost, and seals the envelope when the second chapter is begun', async () => {
    const desk = newDesk(3); desk.files[ENVELOPE] = 'Claire took the card from the desk drawer on Tuesday; the drawer was not locked.';
    const asked: string[] = [];
    const ask = async (kind: string, prompt: string) => { asked.push(kind); return /List the physical things/.test(prompt) ? 'the desk drawer: drawer' : /Answer yes or no/.test(prompt) ? 'yes' : '1'; };
    const write = (file: string, content: string) => takeStep(desk, { thought: '', tool: 'write', file, name: '', content }, 3, ask as never);
    const first = await write('chapter-1.md', 'Nora locked the drawer of her desk and put the key in her bag. Then she went home through the rain.');
    expect(first).toContain('the envelope: "Claire took the card from the desk drawer on Tuesday; the drawer was not locked."');
    expect(first).toContain('chapter-1.md, just written: "Nora locked the drawer of her desk and put the key in her bag."');
    expect(asked.every(kind => kind === 'helper')).toBe(true);
    expect(await write(ENVELOPE, 'Something else happened.')).toContain('is written');
    await write('chapter-2.md', 'The second day came. Nora opened the drawer and found it empty.');
    expect(await write(ENVELOPE, 'Something else again.')).toContain('sealed');
    expect(desk.files[ENVELOPE]).toBe('Something else happened.');
  });

  it('does nothing when the envelope is empty or the helper cannot be reached', async () => {
    const desk = newDesk(3);
    const told = await takeStep(desk, { thought: '', tool: 'write', file: 'chapter-1.md', name: '', content: 'Nora locked the drawer and went home.' }, 3, async () => { throw new Error('no helper'); });
    expect(told).not.toContain('envelope');
    desk.files[ENVELOPE] = 'The drawer was not locked.';
    const again = await takeStep(desk, { thought: '', tool: 'write', file: 'chapter-1.md', name: '', content: 'Nora locked the drawer and went home at last.' }, 3, async () => { throw new Error('no helper'); });
    expect(again).toContain('is written'); expect(again).not.toContain('turns on');
  });
});
