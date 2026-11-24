import { describe, it, expect } from 'vitest';
import {
  indexManuscriptBlocks,
  exactSearch,
  bm25Search,
  hybridSearch,
} from '../utils/novel/hybridSearch';

const SAMPLE_MANUSCRIPT = `
## Chapter 1: The Descent

The pressurized air hissed against the sealed hatch. Clark adjusted the heavy oxygen canister.

Below them, the subterranean limestone stretched into absolute darkness.

## Chapter 2: The Fracture

Clark checked the regulator valve. Only forty minutes remained on the secondary dial.

Bruce stepped forward on the broken stone floor. His scaphoid fracture throbbed.
`.trim();

describe('hybridSearch', () => {
  it('indexes manuscript into chapter-tagged paragraph blocks with block IDs', () => {
    const blocks = indexManuscriptBlocks(SAMPLE_MANUSCRIPT);
    expect(blocks.length).toBe(4);
    expect(blocks[0].id).toBe('ch1_p0');
    expect(blocks[0].chapterNum).toBe(1);
    expect(blocks[0].text).toContain('pressurized air hissed');
    expect(blocks[2].id).toBe('ch2_p0');
    expect(blocks[2].chapterNum).toBe(2);
    expect(blocks[2].text).toContain('regulator valve');
  });

  it('performs exact search matching phrases and word boundaries', () => {
    const blocks = indexManuscriptBlocks(SAMPLE_MANUSCRIPT);
    const matches = exactSearch(blocks, 'oxygen canister');
    expect(matches.length).toBe(1);
    expect(matches[0].blockId).toBe('ch1_p0');
    expect(matches[0].chapterNum).toBe(1);
    expect(matches[0].snippet).toContain('oxygen canister');
  });

  it('filters exact search by specific chapter when requested', () => {
    const blocks = indexManuscriptBlocks(SAMPLE_MANUSCRIPT);
    const matchesCh2 = exactSearch(blocks, 'Clark', 2);
    expect(matchesCh2.length).toBe(1);
    expect(matchesCh2[0].chapterNum).toBe(2);
  });

  it('performs BM25 keyword ranking for semantic/paraphrased queries', () => {
    const blocks = indexManuscriptBlocks(SAMPLE_MANUSCRIPT);
    const matches = bm25Search(blocks, 'forty minutes remaining valve');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].blockId).toBe('ch2_p0');
    expect(matches[0].fullText).toContain('forty minutes');
  });

  it('hybrid search combines exact and keyword relevance with deduplication', () => {
    const blocks = indexManuscriptBlocks(SAMPLE_MANUSCRIPT);
    const matches = hybridSearch(blocks, 'scaphoid fracture');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].chapterNum).toBe(2);
    expect(matches[0].blockId).toBe('ch2_p1');
  });
});
