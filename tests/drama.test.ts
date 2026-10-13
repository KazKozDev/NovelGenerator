import { describe, expect, it } from 'vitest';
import { actSpans, dramaticLedger, dueInChapter, missingShape, openDebts, phraseIn, readDrama, syncDrama } from '../utils/novel/v3/drama';
import { deskView, newDesk, readStep, takeStep } from '../utils/novel/v3/authorDesk';

const shapeText = (chapters: number) => `TURN 1: she left the drawer
TURN 2: she stopped trusting the clerk
TURN 3: she decided the last bargain
STAKE 1: her name on the paper | the debt is sealed
STAKE 2: the house is attached | the lien is filed
STAKE 3: her freedom is pledged | the sentence is passed
QUESTION: who signed the guarantee | the clerk signed it himself
GUN: brass key | the lock turns | 1 | ${Math.max(chapters, 2)}
FALSE: she is cleared today | the warrant comes back
IRONY: the brass key on the hook | she trusts the forced door | the key opens the lock
WANT: she wants the house cleared
NEED: she burns her own name
DECISIVE: she burns the guarantee
${Array.from({ length: chapters }, (_, index) => `LEARN ${index + 1}: the ${['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'][index] || 'item' + index} lesson appears`).join('\n')}`;
const pay1 = 'She left the drawer and learned the price. Her name on the paper was pledged and the debt is sealed when she signed. Who signed the guarantee is what she asked. She found the brass key on the hook. She wants the house cleared. She is cleared today and believed the room was safe. She learned the alpha lesson appears.';
const pay2 = 'She stopped trusting the clerk and told him so. She decided the last bargain and paid it. The house is attached and the lien is filed. Her freedom is pledged and the sentence is passed when she signed. The clerk signed it himself. The lock turns and the door opened. The warrant comes back and she lost the day. She trusts the forced door and told no one. The key opens the lock and she burned the proof. She burns the guarantee. She burns her own name. She learned the beta lesson appears.';
const step = (thought: string, tool: string, file: string, content = '') => `THOUGHT: ${thought}\nTOOL: ${tool}\nFILE: ${file}\n---\n${content}`;

describe('the shape of a book', () => {
  it('divides any length into three acts that each contain a chapter', () => {
    expect(actSpans(1).map(span => [span.from, span.to])).toEqual([[1, 1], [1, 1], [1, 1]]);
    expect(actSpans(3).map(span => [span.from, span.to])).toEqual([[1, 1], [2, 2], [3, 3]]);
    expect(actSpans(8).map(span => [span.from, span.to])).toEqual([[1, 2], [3, 6], [7, 8]]);
    for (const chapters of [4, 5, 6, 12]) {
      const spans = actSpans(chapters);
      expect(spans[0].from).toBe(1);
      expect(spans[2].to).toBe(chapters);
      expect(spans[1].from).toBeLessThanOrEqual(spans[1].to);
      expect(spans[1].to).toBe(spans[2].from - 1);
      expect(spans[0].to + 1).toBe(spans[1].from);
    }
    expect(actSpans(2).map(span => span.from)).toEqual([1, 2, 2]);
  });

  it('counts a phrase by its words inside one sentence', () => {
    expect(phraseIn('A brass key hung on the hook.', 'the brass key')).toBe(true);
    expect(phraseIn('The lock turned for her.', 'the lock turns')).toBe(true);
    expect(phraseIn('The key was upstairs. The lock was downstairs.', 'brass key lock')).toBe(false);
  });

  it('reads obligations and leaves a line it cannot count', () => {
    const { held, unread } = readDrama([
      'TURN 2: she stops trusting the clerk',
      'QUESTION: who signed the guarantee | the clerk signed it himself',
      'STAKE: her name on the paper | the debt is sealed | 6',
      'GUN: brass key | the lock turns | 2 | 7',
      'DECISIVE: she burns the guarantee',
      'And then a paragraph of intentions that is not a line.',
    ].join('\n'), 8);
    expect(held.map(item => item.kind)).toEqual(['turn', 'question', 'stake', 'gun', 'decisive']);
    expect(held.find(item => item.kind === 'gun')).toMatchObject({ plantBy: 2, fireBy: 7 });
    expect(held.find(item => item.kind === 'turn')).toMatchObject({ plantBy: 3, fireBy: 6 });
    expect(unread).toEqual(['And then a paragraph of intentions that is not a line.']);
  });

  it('keeps the first wording of a debt when its line is rewritten to words already on the page', () => {
    const files = { 'drama.md': 'TURN 1: she left the drawer', 'chapter-1.md': 'She understood the morning and stayed.' };
    const first = syncDrama(files, 3);
    const renamed = syncDrama({ ...files, 'drama.md': 'TURN 1: she understood the morning' }, 3, first.held);
    expect(renamed.held.map(item => item.plant)).toEqual(['she left the drawer']);
    expect(renamed.held[0].fired).toBe(0);
  });

  it('keeps a gun that is already on the page after its line is deleted, and drops one that never was', () => {
    const files: Record<string, string> = {
      'drama.md': 'GUN: brass key | the lock turns | 1 | 3\nGUN: spare glove | the print matches | 1 | 3',
      'chapter-1.md': 'A brass key hung on the hook.',
      'chapter-2.md': '',
      'chapter-3.md': '',
    };
    const first = syncDrama(files, 3);
    expect(first.held).toHaveLength(2);
    files['drama.md'] = '';
    const next = syncDrama(files, 3, first.held);
    expect(next.held.map(item => item.plant)).toEqual(['brass key']);
    expect(next.held[0].planted).toBe(1);
    expect(next.held[0].fired).toBe(0);
  });

  it('marks a gun held only when its use follows its appearance', () => {
    const files = {
      'drama.md': 'GUN: brass key | the lock turns | 1 | 3',
      'chapter-1.md': 'A brass key hung on the hook.',
      'chapter-2.md': 'She waited.',
      'chapter-3.md': 'The lock turned and the door gave.',
    };
    const seen = syncDrama(files, 3);
    expect(seen.held[0]).toMatchObject({ planted: 1, fired: 3 });
    expect(dramaticLedger(3, seen.held, [])).toContain('Obligations held: 1 of 1.');
  });

  it('meets a turn by the words of the debt', () => {
    const seen = syncDrama({ 'drama.md': 'TURN 1: she understood the margin', 'chapter-1.md': 'She understood the margin and stayed in the chair.' }, 3);
    expect(seen.held[0].fired).toBe(1);
  });

  it('names the nearest sentence when the debt and the page almost meet', () => {
    const line = openDebts(syncDrama({ 'drama.md': 'TURN 1: she understood the margin line', 'chapter-1.md': 'She understood the morning and stayed.' }, 3).held).join('\n');
    expect(line).toContain('Nearest in chapter 1');
    expect(line).toContain('margin');
  });

  it('holds a clock for the last chapter and does not charge it to the first', () => {
    const envelope = '11:20 Claire came up the fire stair into room 412.';
    const files: Record<string, string> = {
      'envelope.md': envelope,
      'chapter-1.md': 'At 11:20 Claire came up the fire stair into room 412.',
      'chapter-3.md': '',
    };
    const early = syncDrama(files, 3);
    expect(early.held[0].fired).toBe(0);
    expect(dueInChapter(early.held, 1)).toEqual([]);
    expect(dramaticLedger(3, early.held, [])).toContain('owed by chapter 3 alone');
    expect(dramaticLedger(3, early.held, [])).not.toContain('set down by chapter 1');
    files['chapter-3.md'] = 'Claire came up the fire stair and let herself into room 412.';
    expect(syncDrama(files, 3).held[0].fired).toBe(3);
    files['chapter-3.md'] = 'At 4:00 Claire came up the fire stair into room 412.';
    const clash = openDebts(syncDrama(files, 3).held).join('\n');
    expect(clash).toContain('4:00');
    expect(clash).toContain('11:20');
  });

  it('keeps the irony open when an earlier chapter corrected it and the last chapter did not', () => {
    const files: Record<string, string> = {
      'drama.md': 'IRONY: the margin line | claire will kill him | she was describing nora',
      'chapter-1.md': 'She read the margin line and kept it.',
      'chapter-2.md': 'She believed claire will kill him. Then she was describing nora.',
      'chapter-3.md': 'Claire killed him in the room and Nora kept silent.',
    };
    const open = openDebts(syncDrama(files, 3).held).join('\n');
    expect(open).toContain('Corrected in chapter 2');
    expect(open).toContain('chapter 3 does not carry that ending');
    files['chapter-3.md'] = 'She was describing nora, and that was the end of it.';
    expect(syncDrama(files, 3).held[0].fired).toBe(3);
  });

  it('names an unmet debt on the chapter that owed it', () => {
    const { held } = readDrama('GUN: brass key | the lock turns | 1 | 3\nTURN 1: the clerk lies to her', 3);
    const open = syncDrama({ 'drama.md': 'GUN: brass key | the lock turns | 1 | 3\nTURN 1: the clerk lies to her', 'chapter-1.md': 'She came in.' }, 3, held).held;
    expect(dueInChapter(open, 1).join('\n')).toContain('brass key');
    expect(dueInChapter(open, 1).join('\n')).toContain('clerk lies');
    expect(dueInChapter(open, 2)).toEqual([]);
  });
});

describe('the desk and what the book owes', () => {
  it('a two-chapter book can discharge every named debt', () => {
    const files = { 'drama.md': shapeText(2), 'chapter-1.md': pay1, 'chapter-2.md': pay2 };
    const shape = syncDrama(files, 2);
    expect(missingShape(shape.held, 2)).toEqual([]);
    expect(openDebts(shape.held)).toEqual([]);
  });
  it('shows the acts on an empty desk and does not refuse done for a book that named nothing', async () => {
    const desk = newDesk(3);
    expect(desk.files['drama.md']).toBe('');
    const view = deskView(desk, 3, '');
    expect(view).toContain('act 1 is chapter 1');
    expect(view).toContain('The shape is not named yet');
    const done = await takeStep(desk, readStep('THOUGHT: Done.\nTOOL: done'), 3, async () => '');
    expect(done).toContain('The book stays open');
    expect(desk.finished).toBe(false);
  });

  it('refuses done while a named gun is unfired and calls remain, and prints when the budget is spent', async () => {
    const desk = newDesk(3);
    desk.told_promises = true;
    await takeStep(desk, readStep(step('The debts.', 'write', 'drama.md', shapeText(3))), 3, async () => '');
    await takeStep(desk, readStep(step('Open.', 'write', 'chapter-1.md', 'A brass key hung on the hook.')), 3, async () => '');
    const held = await takeStep(desk, readStep(step('Done.', 'done', '')), 3, async () => '');
    expect(held).toContain('The book stays open');
    expect(held).toContain('brass key');
    expect(desk.finished).toBe(false);
    desk.files['drama.md'] = '';
    desk.spent = desk.budget;
    const printed = await takeStep(desk, readStep(step('Print.', 'done', '')), 3, async () => '');
    expect(printed).toBe('');
    expect(desk.finished).toBe(true);
    expect(desk.drama?.some(item => item.plant === 'brass key')).toBe(true);
  });

  it('says so when the chapter that owed a gun did not set it down', async () => {
    const desk = newDesk(3);
    desk.told_promises = true;
    await takeStep(desk, readStep(step('The debts.', 'write', 'drama.md', shapeText(3))), 3, async () => '');
    const told = await takeStep(desk, readStep(step('Chapter.', 'write', 'chapter-1.md', 'She came in from the rain and sat down.')), 3, async () => '');
    expect(told).toContain('brass key');
  });
});
