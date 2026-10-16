import { parseBookChapters } from './manuscript';

export interface ManuscriptBlock {
  id: string;
  chapterNum: number;
  pIndex: number;
  text: string;
  normalizedText: string;
}

export interface SearchMatch {
  blockId: string;
  chapterNum: number;
  pIndex: number;
  score: number;
  snippet: string;
  fullText: string;
  matchType: 'exact' | 'bm25' | 'hybrid';
}

export function indexManuscriptBlocks(bookContent: string): ManuscriptBlock[] {
  const chapters = parseBookChapters(bookContent);
  const blocks: ManuscriptBlock[] = [];

  for (const ch of chapters) {
    const paragraphs = ch.content
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0 && !p.startsWith('* * *'));

    paragraphs.forEach((p, pIndex) => {
      blocks.push({
        id: `ch${ch.num}_p${pIndex}`,
        chapterNum: ch.num,
        pIndex,
        text: p,
        normalizedText: p.toLowerCase(),
      });
    });
  }

  return blocks;
}

export function exactSearch(
  blocks: ManuscriptBlock[],
  query: string,
  chapterNum?: number
): SearchMatch[] {
  if (!query || !query.trim()) return [];
  const cleanQuery = query.trim().toLowerCase();
  const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');

  const matches: SearchMatch[] = [];

  for (const b of blocks) {
    if (chapterNum !== undefined && b.chapterNum !== chapterNum) continue;

    const idx = b.normalizedText.search(regex);
    if (idx !== -1 || b.normalizedText.includes(cleanQuery)) {
      const matchIndex = idx !== -1 ? idx : b.normalizedText.indexOf(cleanQuery);
      const start = Math.max(0, matchIndex - 40);
      const end = Math.min(b.text.length, matchIndex + cleanQuery.length + 40);
      const snippet = (start > 0 ? '…' : '') + b.text.slice(start, end).trim() + (end < b.text.length ? '…' : '');

      matches.push({
        blockId: b.id,
        chapterNum: b.chapterNum,
        pIndex: b.pIndex,
        score: 1.0,
        snippet,
        fullText: b.text,
        matchType: 'exact',
      });
    }
  }

  return matches;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

export function bm25Search(
  blocks: ManuscriptBlock[],
  query: string,
  chapterNum?: number,
  topK = 5
): SearchMatch[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || blocks.length === 0) return [];

  const candidateBlocks = chapterNum !== undefined
    ? blocks.filter(b => b.chapterNum === chapterNum)
    : blocks;

  const N = candidateBlocks.length;
  if (N === 0) return [];

  // Doc frequencies
  const docFreq = new Map<string, number>();
  const docTokens = candidateBlocks.map(b => {
    const tokens = tokenize(b.text);
    const unique = new Set(tokens);
    for (const t of unique) {
      docFreq.set(t, (docFreq.get(t) || 0) + 1);
    }
    return { block: b, tokens, length: tokens.length };
  });

  const avgdl = docTokens.reduce((acc, d) => acc + d.length, 0) / N || 1;
  const k1 = 1.2;
  const bParam = 0.75;

  const scored: SearchMatch[] = [];

  for (const doc of docTokens) {
    let score = 0;
    const termCounts = new Map<string, number>();
    for (const t of doc.tokens) {
      termCounts.set(t, (termCounts.get(t) || 0) + 1);
    }

    for (const q of queryTokens) {
      const nq = docFreq.get(q) || 0;
      if (nq === 0) continue;
      const idf = Math.log((N - nq + 0.5) / (nq + 0.5) + 1);
      const tf = termCounts.get(q) || 0;
      const termScore = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - bParam + bParam * (doc.length / avgdl))));
      score += termScore;
    }

    if (score > 0) {
      const snippet = doc.block.text.length > 120
        ? doc.block.text.slice(0, 120).trim() + '…'
        : doc.block.text;

      scored.push({
        blockId: doc.block.id,
        chapterNum: doc.block.chapterNum,
        pIndex: doc.block.pIndex,
        score,
        snippet,
        fullText: doc.block.text,
        matchType: 'bm25',
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export function hybridSearch(
  blocks: ManuscriptBlock[],
  query: string,
  chapterNum?: number,
  topK = 5
): SearchMatch[] {
  const exact = exactSearch(blocks, query, chapterNum);
  const bm25 = bm25Search(blocks, query, chapterNum, topK * 2);

  const resultMap = new Map<string, SearchMatch>();

  for (const m of exact) {
    resultMap.set(m.blockId, { ...m, score: 2.0, matchType: 'exact' });
  }

  for (const m of bm25) {
    if (resultMap.has(m.blockId)) {
      const existing = resultMap.get(m.blockId)!;
      existing.score += m.score;
      existing.matchType = 'hybrid';
    } else {
      resultMap.set(m.blockId, m);
    }
  }

  const results = Array.from(resultMap.values());
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
