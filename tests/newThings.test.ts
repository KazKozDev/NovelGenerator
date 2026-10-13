import { describe, expect, it } from 'vitest';
import { firstSeenHere, piecesOf, type ObjectsRequest } from '../utils/novel/v3/newThings';
import { newDesk, takeStep } from '../utils/novel/v3/authorDesk';

describe('things the last chapter names that no earlier chapter has', () => {
  const earlier = ['Nora kept her notebook in the drawer. Her bag hung on the chair by the window.', 'The keys lay on the hall table all week.'];
  const last = 'Claire came in carrying a small paper box and set it on the desk. Nora took the notebook from the drawer. She thought carefully about the key in her hand.';

  it('code looks each object up in the earlier chapters and keeps what was never there', () => {
    const found = [{ text: 'small paper box', score: 0.7 }, { text: 'notebook', score: 0.9 }, { text: 'key', score: 0.8 }, { text: 'car', score: 0.6 }, { text: 'desk', score: 0.6 }];
    const fresh = firstSeenHere(last, earlier, found);
    expect(fresh.map(item => item.name)).toEqual(['small paper box', 'desk']);
    expect(fresh[0].line).toBe('Claire came in carrying a small paper box and set it on the desk.');
  });

  it('cuts a chapter into pieces of whole sentences', () => {
    const pieces = piecesOf(`${'She walked the long way home through the rain. '.repeat(30)}`, 400);
    expect(pieces.length).toBeGreaterThan(2); expect(pieces.every(piece => piece.length <= 450 && piece.endsWith('.'))).toBe(true);
  });

  it('tells the author with the last chapter, at no cost; says nothing for other chapters or when the network is not there', async () => {
    const desk = newDesk(3); desk.told_promises = true; desk.files['chapter-1.md'] = earlier[0]; desk.files['chapter-2.md'] = earlier[1];
    const asked: string[] = [];
    const ask = async (kind: string, prompt: string) => { asked.push(kind); if (kind !== 'objects') throw new Error('not here'); const request = JSON.parse(prompt) as ObjectsRequest; return JSON.stringify(request.texts.map(text => text.includes('paper box') ? [{ text: 'small paper box', score: 0.7 }, { text: 'notebook', score: 0.9 }] : [])); };
    const told = await takeStep(desk, { thought: '', tool: 'write', file: 'chapter-3.md', name: '', content: last }, 3, ask as never);
    expect(told).toContain('Things this chapter names that no earlier chapter has'); expect(told).toContain('— small paper box: "Claire came in carrying a small paper box');
    expect(told).not.toContain('— notebook'); expect(desk.spent).toBe(0); expect(desk.arrivals?.[0].name).toBe('small paper box');
    const other = newDesk(3); other.files['chapter-1.md'] = earlier[0];
    expect(await takeStep(other, { thought: '', tool: 'write', file: 'chapter-2.md', name: '', content: last }, 3, (async (kind: string) => { if (kind === 'objects') throw new Error('asked too early'); return 'A reader: fine.'; }) as never)).not.toContain('no earlier chapter');
    const down = newDesk(2); down.told_promises = true; down.files['chapter-1.md'] = earlier[0];
    const quiet = await takeStep(down, { thought: '', tool: 'write', file: 'chapter-2.md', name: '', content: last }, 2, async () => { throw new Error('GLiNER is not installed'); });
    expect(quiet).toContain('is written'); expect(quiet).not.toContain('no earlier chapter'); expect(down.journal.some(line => line.includes('could not be looked for'))).toBe(true);
  });
});
