import { describe, it, expect } from 'vitest';
import { indexManuscriptBlocks } from '../utils/novel/hybridSearch';
import { buildEntityGraph, checkCrossTextImpact } from '../utils/novel/entityGraph';

const MULTI_CHAPTER_PROSE = `
## Chapter 1

Clark held the titanium oxygen canister tightly. The timer read 1:56.
Bruce watched with his cracked cowl resting on the metal table.

## Chapter 2

The second oxygen canister had leaked. Clark checked the pressure gauge.
Bruce felt the scaphoid fracture in his left wrist click.

## Chapter 3

Bruce wiped the blood from his cheek with the edge of his torn sleeve.
The timer struck zero.
`.trim();

describe('entityGraph', () => {
  it('extracts recurring props, timers, and injuries into the entity graph', () => {
    const blocks = indexManuscriptBlocks(MULTI_CHAPTER_PROSE);
    const graph = buildEntityGraph(blocks);

    expect(graph.entities.has('oxygen canister')).toBe(true);
    const canisterRef = graph.entities.get('oxygen canister')!;
    expect(canisterRef.occurrences.length).toBe(2);
    expect(canisterRef.occurrences.map(o => o.chapterNum)).toEqual([1, 2]);
  });

  it('detects timers and numbers in format like 1:56', () => {
    const blocks = indexManuscriptBlocks(MULTI_CHAPTER_PROSE);
    const graph = buildEntityGraph(blocks);

    const timerMatches = Array.from(graph.entities.values()).filter(e => e.category === 'timer');
    expect(timerMatches.length).toBeGreaterThan(0);
  });

  it('generates cross-text impact warning when an entity used across chapters is modified in one chapter', () => {
    const blocks = indexManuscriptBlocks(MULTI_CHAPTER_PROSE);
    const graph = buildEntityGraph(blocks);

    const warnings = checkCrossTextImpact(graph, 'oxygen canister', 1);
    expect(warnings.length).toBe(1);
    expect(warnings[0].entity).toBe('oxygen canister');
    expect(warnings[0].modifiedChapter).toBe(1);
    expect(warnings[0].impactedChapters).toContain(2);
    expect(warnings[0].warning).toContain('Chapter 2');
  });

  it('does not warn if entity only exists in the modified chapter', () => {
    const blocks = indexManuscriptBlocks(MULTI_CHAPTER_PROSE);
    const graph = buildEntityGraph(blocks);

    const warnings = checkCrossTextImpact(graph, 'metal table', 1);
    expect(warnings.length).toBe(0);
  });
});
