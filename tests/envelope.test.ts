import { describe, expect, it } from 'vitest';
import { ENVELOPE, KEEP_AT, around, labelsFor, listedThings, mentions, sceneOf, sideBySide, type LabelRequest } from '../utils/novel/v3/envelope';
import { newDesk, takeStep } from '../utils/novel/v3/authorDesk';
import { deskTabs } from '../utils/novel/v3/deskTabs';

describe('the sealed envelope', () => {
  it('reads the things the author listed at the foot of its envelope', () => {
    const envelope = 'She took the key from the drawer and left by the side door.\n\nTHINGS:\n- the brass key\n- **the side door of the hotel**: door, entrance\n3. the glass on the nightstand\n';
    expect(listedThings(envelope)).toEqual([{ thing: 'the brass key', words: ['key'] }, { thing: 'the side door of the hotel', words: ['door', 'entrance'] }, { thing: 'the glass on the nightstand', words: ['glass'] }]);
    expect(listedThings('THINGS: the lamp, the tie, the service stair')).toHaveLength(3);
    expect(listedThings('A scene with no list.')).toEqual([]);
    expect(listedThings('THINGS\nthe side door\nthe balcony door\nthe window that will not close\nthe hour, four o\'clock').map(thing => thing.words[0])).toEqual(['side door', 'balcony door', 'window', 'hour']);
    expect(sceneOf(envelope)).not.toContain('brass');
  });

  it('finds the sentences that name a thing', () => {
    const text = 'She kept the key on a chain at her neck. It rained all night on the harbor road. The keys were never out of her sight.';
    expect(mentions(text, { thing: 'the brass key', words: ['key'] })).toHaveLength(2);
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

  it('keeps only the lines the network marks as a fact, by a mark that code sets; costs nothing; and seals the envelope when the second chapter is begun', async () => {
    const desk = newDesk(4); desk.files[ENVELOPE] = 'Claire took the card from the desk drawer on Tuesday; the drawer was not locked.\n\nTHINGS:\nthe desk drawer';
    const asked: LabelRequest[] = [];
    // The network: a number for each sentence, and nothing else.
    const ask = async (kind: string, prompt: string) => { expect(kind).toBe('helper'); const request = JSON.parse(prompt) as LabelRequest; asked.push(request); return JSON.stringify(request.inputs.map(line => /like a drawer/.test(line) ? KEEP_AT - 0.3 : KEEP_AT + 0.3)); };
    const write = (file: string, content: string) => takeStep(desk, { thought: '', tool: 'write', file, name: '', content }, 4, ask as never);
    const first = await write('chapter-1.md', 'Nora locked the drawer of her desk and put the key in her bag. Her mind slid shut like a drawer in the dark. Then she went home through the rain.');
    expect(first).toContain('the envelope: "Claire took the card from the desk drawer on Tuesday; the drawer was not locked."');
    expect(first).toContain('chapter-1.md, just written: "Nora locked the drawer of her desk and put the key in her bag."');
    expect(first).not.toContain('like a drawer');
    expect(asked[0].labels).toEqual(labelsFor({ thing: 'the desk drawer', words: ['drawer'] }));
    expect(desk.spent).toBe(0);
    expect(await write(ENVELOPE, 'Something else happened.')).toContain('is written');
    await write('chapter-2.md', 'The second day came. Nora opened the drawer and found it empty.');
    expect(await write(ENVELOPE, 'Something else again.')).toContain('sealed');
    expect(desk.files[ENVELOPE]).toBe('Something else happened.');
  });

  it('is read once, unasked, by someone who asks what it leaves open, before anything is written to it', async () => {
    const desk = newDesk(4); const scene = `${'Claire came in by the side door and put the card on the nightstand. '.repeat(10)}\n\nTHINGS\nthe card`;
    let read = '', readers = 0;
    const ask = async (kind: string, prompt: string) => { if (kind !== 'reader') throw new Error('no network'); readers++; desk.spent++; read = prompt; return 'Who signed for the room that night?'; };
    const write = (file: string, content: string) => takeStep(desk, { thought: '', tool: 'write', file, name: '', content }, 4, ask as never);
    const told = await write(ENVELOPE, scene);
    expect(told).toContain('has read your envelope'); expect(told).toContain('Who signed for the room that night?'); expect(told).toContain('That cost one call');
    expect(read).toContain('side door'); expect(read).not.toContain('THINGS');
    // Once: writing the envelope again brings nobody.
    expect(await write(ENVELOPE, scene + ' She signed as Nora.')).not.toContain('has read your envelope'); expect(readers).toBe(1);
    const tab = deskTabs(desk).find(item => item.name === 'Envelope')!;
    expect(tab.text).toContain('Who signed for the room that night?'); expect(deskTabs(desk).find(item => item.name === 'Characters')!.count).toBe(0);
  });

  it('does nothing when the envelope is empty, lists no things, or the network cannot be reached', async () => {
    const desk = newDesk(3);
    const down = async () => { throw new Error('no network'); };
    const write = (content: string) => takeStep(desk, { thought: '', tool: 'write', file: 'chapter-1.md', name: '', content }, 3, down);
    expect(await write('Nora locked the drawer and went home.')).not.toContain('envelope');
    desk.files[ENVELOPE] = 'The drawer was not locked.'; desk.rewrites = { 'chapter-1.md': 0 };
    expect(await write('Nora locked the drawer and went home at last.')).not.toContain('envelope names');
    desk.files[ENVELOPE] = 'The drawer was not locked.\n\nTHINGS:\nthe drawer'; desk.rewrites = { 'chapter-1.md': 0 };
    const told = await write('Nora locked the drawer and went home in the end.');
    expect(told).toContain('is written'); expect(told).not.toContain('envelope names');
    expect(desk.journal.filter(line => line.includes('could not be gathered'))).toHaveLength(1);
  });
});
