# Editorial Chat Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Column 1 of the final book display (`BookDisplay.tsx`) into an interactive, chat-first Editorial Assistant Studio (`EditorialChatStudio.tsx`) capable of executing natural language editorial commands via local hybrid search, entity dependency tracking, interactive diff review cards, and an undo stack.

**Architecture:**
A client-side micro-agent architecture running inside React. On manuscript load, prose is split into indexed blocks (`ch{n}_p{m}`). The agent dispatches client tools (`search_manuscript`, `inspect_dependencies`, `propose_diff`) locally without network delays for instant lookup, querying a lightweight BM25/Regex hybrid search engine and an entity/prop dependency graph. The agent outputs structured Diff Review Cards (`[Apply Patch]` / `[Reject]` / `[Undo]`) that patch the manuscript in Column 2 in real-time, scroll smoothly to the edited paragraph with a temporary highlight, and preserve full undo history.

**Tech Stack:** React 19, TypeScript, Vitest, Tailwind CSS (dark zinc palette), Browser-based BM25 & regex indexing.

**Spec:** `docs/superpowers/specs/2026-10-16-editorial-chat-studio-design.md`

## Global Constraints
- No Russian text in source code identifiers, comments, or CSS classes (UI strings shown to the user can be localized or bilingual).
- Strict neutral dark zinc styling (`bg-zinc-900`, `bg-zinc-950`, `border-zinc-800`, `text-zinc-200`) with zero colorful inserts or loud gradients.
- All unit test suites and production build must remain 100% green.
- Atomic search/replace operations must preserve surrounding prose and chapter headings without full-chapter regeneration.

---

### Task 1: Manuscript Block Indexer & Hybrid Search Engine

**Files:**
- Create: `utils/novel/hybridSearch.ts`
- Test: `tests/hybridSearch.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ManuscriptBlock {
    id: string; // "ch1_p0", "ch1_p1"
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

  export function indexManuscriptBlocks(bookContent: string): ManuscriptBlock[];
  export function exactSearch(blocks: ManuscriptBlock[], query: string, chapterNum?: number): SearchMatch[];
  export function bm25Search(blocks: ManuscriptBlock[], query: string, chapterNum?: number, topK?: number): SearchMatch[];
  export function hybridSearch(blocks: ManuscriptBlock[], query: string, chapterNum?: number, topK?: number): SearchMatch[];
  ```

- [ ] **Step 1: Write the failing tests for hybridSearch**

```ts
// tests/hybridSearch.test.ts
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
    expect(matches[0].text).toContain('forty minutes');
  });

  it('hybrid search combines exact and keyword relevance with deduplication', () => {
    const blocks = indexManuscriptBlocks(SAMPLE_MANUSCRIPT);
    const matches = hybridSearch(blocks, 'scaphoid fracture');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].chapterNum).toBe(2);
    expect(matches[0].blockId).toBe('ch2_p1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hybridSearch.test.ts`
Expected: FAIL ("Cannot find module '../utils/novel/hybridSearch'")

- [ ] **Step 3: Implement `utils/novel/hybridSearch.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hybridSearch.test.ts`
Expected: PASS (5/5 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/novel/hybridSearch.ts tests/hybridSearch.test.ts
git commit -m "feat(editorial): implement manuscript block indexer and hybrid search"
```

---

### Task 2: Cross-Text Entity & Dependency Graph

**Files:**
- Create: `utils/novel/entityGraph.ts`
- Test: `tests/entityGraph.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface EntityReference {
    entity: string;
    category: 'character' | 'prop' | 'injury' | 'timer' | 'location';
    occurrences: {
      chapterNum: number;
      blockId: string;
      snippet: string;
    }[];
  }

  export interface EntityGraph {
    entities: Map<string, EntityReference>;
    chapterEntityIndex: Map<number, Set<string>>;
  }

  export interface CrossTextImpactWarning {
    entity: string;
    modifiedChapter: number;
    impactedChapters: number[];
    warning: string;
  }

  export function buildEntityGraph(blocks: ManuscriptBlock[], dossier?: any): EntityGraph;
  export function checkCrossTextImpact(graph: EntityGraph, targetTerm: string, fromChapter: number): CrossTextImpactWarning[];
  ```

- [ ] **Step 1: Write failing tests for entityGraph**

```ts
// tests/entityGraph.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/entityGraph.test.ts`
Expected: FAIL ("Cannot find module '../utils/novel/entityGraph'")

- [ ] **Step 3: Implement `utils/novel/entityGraph.ts`**

```ts
import { ManuscriptBlock } from './hybridSearch';

export interface EntityOccurrence {
  chapterNum: number;
  blockId: string;
  snippet: string;
}

export interface EntityReference {
  entity: string;
  category: 'character' | 'prop' | 'injury' | 'timer' | 'location';
  occurrences: EntityOccurrence[];
}

export interface EntityGraph {
  entities: Map<string, EntityReference>;
  chapterEntityIndex: Map<number, Set<string>>;
}

export interface CrossTextImpactWarning {
  entity: string;
  modifiedChapter: number;
  impactedChapters: number[];
  warning: string;
}

const COMMON_PROP_PATTERNS = [
  /\b(?:oxygen(?:\s+canister|\s+tank|\s+cylinder)?|canister|cylinder)\b/gi,
  /\b(?:cowl|mask|cape|boots?|gloves?|goggles?|glasses?|scanner|stylus|lantern|wire|key|logbook|flashlight)\b/gi,
];

const COMMON_INJURY_PATTERNS = [
  /\b(?:fracture|scaphoid|tremor|concussion|wound|bleeding|bruise|burn)\b/gi,
];

const TIMER_PATTERNS = [
  /\b(?:\d{1,2}:\d{2}(?::\d{2})?|\d+\s*(?:minutes?|hours?|seconds?))\b/gi,
];

export function buildEntityGraph(blocks: ManuscriptBlock[], dossier?: any): EntityGraph {
  const entities = new Map<string, EntityReference>();
  const chapterEntityIndex = new Map<number, Set<string>>();

  function addEntity(name: string, category: EntityReference['category'], block: ManuscriptBlock) {
    const clean = name.trim().toLowerCase();
    if (clean.length < 3) return;

    if (!entities.has(clean)) {
      entities.set(clean, {
        entity: clean,
        category,
        occurrences: [],
      });
    }

    const ref = entities.get(clean)!;
    if (!ref.occurrences.some(o => o.blockId === block.id)) {
      const idx = block.text.toLowerCase().indexOf(clean);
      const start = Math.max(0, idx - 30);
      const end = Math.min(block.text.length, idx + clean.length + 30);
      const snippet = block.text.slice(start, end).trim();

      ref.occurrences.push({
        chapterNum: block.chapterNum,
        blockId: block.id,
        snippet,
      });
    }

    if (!chapterEntityIndex.has(block.chapterNum)) {
      chapterEntityIndex.set(block.chapterNum, new Set());
    }
    chapterEntityIndex.get(block.chapterNum)!.add(clean);
  }

  // Scan dossier characters if available
  if (dossier?.characters && Array.isArray(dossier.characters)) {
    for (const c of dossier.characters) {
      if (typeof c?.name === 'string' && c.name.trim()) {
        const charName = c.name.trim();
        for (const b of blocks) {
          if (new RegExp(`\\b${charName}\\b`, 'i').test(b.text)) {
            addEntity(charName, 'character', b);
          }
        }
      }
    }
  }

  // Scan blocks for props, injuries, timers
  for (const b of blocks) {
    for (const regex of COMMON_PROP_PATTERNS) {
      const matches = b.text.match(regex);
      if (matches) {
        for (const m of matches) addEntity(m, 'prop', b);
      }
    }
    for (const regex of COMMON_INJURY_PATTERNS) {
      const matches = b.text.match(regex);
      if (matches) {
        for (const m of matches) addEntity(m, 'injury', b);
      }
    }
    for (const regex of TIMER_PATTERNS) {
      const matches = b.text.match(regex);
      if (matches) {
        for (const m of matches) addEntity(m, 'timer', b);
      }
    }
  }

  return { entities, chapterEntityIndex };
}

export function checkCrossTextImpact(
  graph: EntityGraph,
  targetTerm: string,
  fromChapter: number
): CrossTextImpactWarning[] {
  if (!targetTerm || !targetTerm.trim()) return [];
  const cleanTerm = targetTerm.trim().toLowerCase();
  const warnings: CrossTextImpactWarning[] = [];

  for (const [entityKey, ref] of graph.entities.entries()) {
    if (cleanTerm.includes(entityKey) || entityKey.includes(cleanTerm)) {
      const otherChapters = Array.from(
        new Set(ref.occurrences.map(o => o.chapterNum).filter(ch => ch !== fromChapter))
      ).sort((a, b) => a - b);

      if (otherChapters.length > 0) {
        warnings.push({
          entity: entityKey,
          modifiedChapter: fromChapter,
          impactedChapters: otherChapters,
          warning: `Entity "${entityKey}" (${ref.category}) also appears in Chapter ${otherChapters.join(', ')}. Changing it in Chapter ${fromChapter} may cause cross-chapter continuity issues.`,
        });
      }
    }
  }

  return warnings;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/entityGraph.test.ts`
Expected: PASS (4/4 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/novel/entityGraph.ts tests/entityGraph.test.ts
git commit -m "feat(editorial): implement cross-text entity dependency graph"
```

---

### Task 3: Patch Applier, Diff Formatter & Undo Stack

**Files:**
- Create: `utils/novel/patchApplier.ts`
- Test: `tests/patchApplier.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PatchResult {
    success: boolean;
    updatedManuscript: string;
    changed: boolean;
    matchedBlockId?: string;
    error?: string;
  }

  export interface UndoStackEntry {
    manuscript: string;
    description: string;
    timestamp: number;
    targetChapter?: number;
  }

  export function applySearchReplacePatch(
    manuscript: string,
    chapterNum: number,
    searchTarget: string,
    replacementText: string
  ): PatchResult;

  export function pushUndoState(
    stack: UndoStackEntry[],
    manuscript: string,
    description: string,
    targetChapter?: number
  ): UndoStackEntry[];

  export function popUndoState(
    stack: UndoStackEntry[]
  ): { previous: UndoStackEntry; updatedStack: UndoStackEntry[] } | null;
  ```

- [ ] **Step 1: Write failing tests for patchApplier**

```ts
// tests/patchApplier.test.ts
import { describe, it, expect } from 'vitest';
import {
  applySearchReplacePatch,
  pushUndoState,
  popUndoState,
} from '../utils/novel/patchApplier';

const TEST_MANUSCRIPT = `
## Chapter 1: The Descent

The pressurized air hissed against the sealed hatch. Clark adjusted the heavy oxygen canister.

Below them, the subterranean limestone stretched into absolute darkness.

## Chapter 2: The Fracture

Bruce stepped forward on the cold tile floor. His wrist throbbed.
`.trim();

describe('patchApplier', () => {
  it('applies exact search and replace in target chapter without touching other chapters', () => {
    const result = applySearchReplacePatch(
      TEST_MANUSCRIPT,
      2,
      'cold tile floor',
      'cold limestone slab'
    );

    expect(result.success).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.updatedManuscript).toContain('cold limestone slab');
    expect(result.updatedManuscript).not.toContain('cold tile floor');
    // Chapter 1 preserved verbatim
    expect(result.updatedManuscript).toContain('oxygen canister');
  });

  it('handles whitespace variations gracefully', () => {
    const result = applySearchReplacePatch(
      TEST_MANUSCRIPT,
      1,
      'Clark   adjusted  the heavy oxygen canister.',
      'Clark tightened the heavy oxygen cylinder.'
    );

    expect(result.success).toBe(true);
    expect(result.updatedManuscript).toContain('oxygen cylinder');
  });

  it('returns success: false with clear error if search target is absent', () => {
    const result = applySearchReplacePatch(
      TEST_MANUSCRIPT,
      1,
      'Non-existent text quote that never existed in ch 1',
      'replacement'
    );

    expect(result.success).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.error).toContain('Target text not found');
  });

  it('manages undo stack transitions cleanly', () => {
    let stack = pushUndoState([], TEST_MANUSCRIPT, 'Initial text', 1);
    expect(stack.length).toBe(1);

    const patchedText = TEST_MANUSCRIPT.replace('limestone', 'granite');
    stack = pushUndoState(stack, patchedText, 'Replaced limestone with granite', 1);
    expect(stack.length).toBe(2);

    const popped = popUndoState(stack);
    expect(popped).not.toBeNull();
    expect(popped?.previous.manuscript).toBe(patchedText);
    expect(popped?.updatedStack.length).toBe(1);
    expect(popped?.updatedStack[0].manuscript).toBe(TEST_MANUSCRIPT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/patchApplier.test.ts`
Expected: FAIL ("Cannot find module '../utils/novel/patchApplier'")

- [ ] **Step 3: Implement `utils/novel/patchApplier.ts`**

```ts
import { parseBookChapters, assembleManuscript } from './manuscript';

export interface PatchResult {
  success: boolean;
  updatedManuscript: string;
  changed: boolean;
  matchedBlockId?: string;
  error?: string;
}

export interface UndoStackEntry {
  manuscript: string;
  description: string;
  timestamp: number;
  targetChapter?: number;
}

function normalizeWs(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

export function applySearchReplacePatch(
  manuscript: string,
  chapterNum: number,
  searchTarget: string,
  replacementText: string
): PatchResult {
  if (!searchTarget || !searchTarget.trim()) {
    return {
      success: false,
      updatedManuscript: manuscript,
      changed: false,
      error: 'Empty search target provided.',
    };
  }

  const chapters = parseBookChapters(manuscript);
  const targetChapterIndex = chapters.findIndex(c => c.num === chapterNum);

  if (targetChapterIndex === -1) {
    return {
      success: false,
      updatedManuscript: manuscript,
      changed: false,
      error: `Chapter ${chapterNum} not found in manuscript.`,
    };
  }

  const targetCh = chapters[targetChapterIndex];
  let body = targetCh.content;
  const rawTarget = searchTarget.trim();

  // Try direct string replacement
  if (body.includes(rawTarget)) {
    const updatedBody = body.replace(rawTarget, replacementText.trim());
    chapters[targetChapterIndex].content = updatedBody;
    const titleMatch = manuscript.match(/^#\s+([^\r\n]+)/m);
    const title = titleMatch ? titleMatch[1] : undefined;

    return {
      success: true,
      updatedManuscript: assembleManuscript(chapters.map(c => ({ chapter: c.num, text: c.content })), title),
      changed: true,
    };
  }

  // Fallback: whitespace-normalized match
  const normTarget = normalizeWs(rawTarget);
  const paragraphs = body.split(/\n\n+/);
  let replaced = false;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (normalizeWs(p).includes(normTarget)) {
      // Find fuzzy window inside paragraph
      const words = normTarget.split(' ');
      const firstWord = words[0];
      const lastWord = words[words.length - 1];

      const startIdx = p.toLowerCase().indexOf(firstWord.toLowerCase());
      const endIdx = p.toLowerCase().lastIndexOf(lastWord.toLowerCase());

      if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
        const actualTarget = p.slice(startIdx, endIdx + lastWord.length);
        paragraphs[i] = p.replace(actualTarget, replacementText.trim());
        replaced = true;
        break;
      }
    }
  }

  if (replaced) {
    chapters[targetChapterIndex].content = paragraphs.join('\n\n');
    const titleMatch = manuscript.match(/^#\s+([^\r\n]+)/m);
    const title = titleMatch ? titleMatch[1] : undefined;

    return {
      success: true,
      updatedManuscript: assembleManuscript(chapters.map(c => ({ chapter: c.num, text: c.content })), title),
      changed: true,
    };
  }

  return {
    success: false,
    updatedManuscript: manuscript,
    changed: false,
    error: `Target text not found in Chapter ${chapterNum}. Check exact wording.`,
  };
}

export function pushUndoState(
  stack: UndoStackEntry[],
  manuscript: string,
  description: string,
  targetChapter?: number,
  maxDepth = 20
): UndoStackEntry[] {
  const newEntry: UndoStackEntry = {
    manuscript,
    description,
    timestamp: Date.now(),
    targetChapter,
  };
  const updated = [...stack, newEntry];
  if (updated.length > maxDepth) {
    return updated.slice(updated.length - maxDepth);
  }
  return updated;
}

export function popUndoState(
  stack: UndoStackEntry[]
): { previous: UndoStackEntry; updatedStack: UndoStackEntry[] } | null {
  if (stack.length === 0) return null;
  const previous = stack[stack.length - 1];
  const updatedStack = stack.slice(0, stack.length - 1);
  return { previous, updatedStack };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/patchApplier.test.ts`
Expected: PASS (4/4 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/novel/patchApplier.ts tests/patchApplier.test.ts
git commit -m "feat(editorial): implement patch applier and undo stack"
```

---

### Task 4: Editorial Agent Orchestrator & Tool Calling Engine

**Files:**
- Create: `utils/novel/editorialAgent.ts`
- Test: `tests/editorialAgent.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ParsedToolCall {
    tool: 'search_manuscript' | 'inspect_dependencies' | 'propose_diff';
    args: Record<string, any>;
  }

  export interface ProposedDiffCard {
    id: string;
    chapterNum: number;
    searchTarget: string;
    replacementText: string;
    rationale: string;
    warnings: string[];
  }

  export interface EditorialAgentResponse {
    assistantMessage: string;
    diffCards: ProposedDiffCard[];
    executedTools: { tool: string; summary: string }[];
  }

  export function parseToolCallsFromModelResponse(text: string): ParsedToolCall[];
  export function buildEditorialAgentPrompt(params: {
    userPrompt: string;
    manuscriptBlocks: ManuscriptBlock[];
    entityGraph: EntityGraph;
    history: { role: 'user' | 'assistant'; content: string }[];
  }): { system: string; prompt: string };
  export async function runEditorialTurn(params: {
    userPrompt: string;
    bookContent: string;
    metadata?: any;
    history: { role: 'user' | 'assistant'; content: string }[];
    callModel: (prompt: string, system: string) => Promise<string>;
  }): Promise<EditorialAgentResponse>;
  ```

- [ ] **Step 1: Write failing tests for editorialAgent**

```ts
// tests/editorialAgent.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseToolCallsFromModelResponse,
  buildEditorialAgentPrompt,
  runEditorialTurn,
} from '../utils/novel/editorialAgent';

const SAMPLE_MANUSCRIPT = `
## Chapter 1: The Vault

Clark placed the heavy oxygen canister on the floor.

## Chapter 2: The Fracture

Bruce grimaced as his wrist clicked. Only forty minutes remained on the secondary dial.
`.trim();

describe('editorialAgent', () => {
  it('parses tool calls from markdown code fences or structured tags', () => {
    const modelOutput = `
I will search for the oxygen canister in Chapter 1.
\`\`\`tool:search_manuscript
{"query": "oxygen canister", "chapter": 1}
\`\`\`
    `.trim();

    const tools = parseToolCallsFromModelResponse(modelOutput);
    expect(tools.length).toBe(1);
    expect(tools[0].tool).toBe('search_manuscript');
    expect(tools[0].args.query).toBe('oxygen canister');
    expect(tools[0].args.chapter).toBe(1);
  });

  it('parses diff proposals into structured ProposedDiffCard', () => {
    const modelOutput = `
Here is the proposed patch:
\`\`\`tool:propose_diff
{
  "chapter": 1,
  "search": "Clark placed the heavy oxygen canister on the floor.",
  "replace": "Clark set the titanium oxygen cylinder gently on the cold stone.",
  "rationale": "Clarify material and stance."
}
\`\`\`
    `.trim();

    const tools = parseToolCallsFromModelResponse(modelOutput);
    expect(tools.length).toBe(1);
    expect(tools[0].tool).toBe('propose_diff');
    expect(tools[0].args.chapter).toBe(1);
    expect(tools[0].args.search).toContain('oxygen canister');
  });

  it('runs an editorial turn with automated local tool execution and cross-text warning injection', async () => {
    const mockCallModel = async (prompt: string, system: string) => {
      if (prompt.includes('tool_results')) {
        return `
I found the mention and checked cross-references.
\`\`\`tool:propose_diff
{
  "chapter": 1,
  "search": "oxygen canister",
  "replace": "oxygen cylinder",
  "rationale": "Upgrade vocabulary"
}
\`\`\`
Done.`;
      }
      return `
\`\`\`tool:search_manuscript
{"query": "oxygen canister"}
\`\`\`
      `;
    };

    const response = await runEditorialTurn({
      userPrompt: 'Замени canister на cylinder в первой главе',
      bookContent: SAMPLE_MANUSCRIPT,
      history: [],
      callModel: mockCallModel,
    });

    expect(response.diffCards.length).toBe(1);
    expect(response.diffCards[0].chapterNum).toBe(1);
    expect(response.diffCards[0].searchTarget).toBe('oxygen canister');
    expect(response.diffCards[0].replacementText).toBe('oxygen cylinder');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editorialAgent.test.ts`
Expected: FAIL ("Cannot find module '../utils/novel/editorialAgent'")

- [ ] **Step 3: Implement `utils/novel/editorialAgent.ts`**

```ts
import { indexManuscriptBlocks, hybridSearch, ManuscriptBlock } from './hybridSearch';
import { buildEntityGraph, checkCrossTextImpact, EntityGraph } from './entityGraph';

export interface ParsedToolCall {
  tool: 'search_manuscript' | 'inspect_dependencies' | 'propose_diff';
  args: Record<string, any>;
}

export interface ProposedDiffCard {
  id: string;
  chapterNum: number;
  searchTarget: string;
  replacementText: string;
  rationale: string;
  warnings: string[];
}

export interface EditorialAgentResponse {
  assistantMessage: string;
  diffCards: ProposedDiffCard[];
  executedTools: { tool: string; summary: string }[];
}

export function parseToolCallsFromModelResponse(text: string): ParsedToolCall[] {
  const tools: ParsedToolCall[] = [];
  const regex = /```(?:tool:([a-z_]+)|json\s*\(tool:([a-z_]+)\))\s*\r?\n([\s\S]*?)\r?\n```/gi;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const toolName = (match[1] || match[2]).toLowerCase().trim();
    const rawArgs = match[3].trim();
    try {
      const args = JSON.parse(rawArgs);
      if (['search_manuscript', 'inspect_dependencies', 'propose_diff'].includes(toolName)) {
        tools.push({ tool: toolName as any, args });
      }
    } catch {
      // Ignore malformed JSON in tool block
    }
  }

  // Also catch generic JSON format: {"tool": "search_manuscript", "args": {...}}
  if (tools.length === 0) {
    const jsonBlockRegex = /```json\s*\r?\n([\s\S]*?)\r?\n```/gi;
    while ((match = jsonBlockRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed?.tool && ['search_manuscript', 'inspect_dependencies', 'propose_diff'].includes(parsed.tool)) {
          tools.push({ tool: parsed.tool, args: parsed.args || parsed });
        }
      } catch {}
    }
  }

  return tools;
}

export function buildEditorialAgentPrompt(params: {
  userPrompt: string;
  manuscriptBlocks: ManuscriptBlock[];
  entityGraph: EntityGraph;
  history: { role: 'user' | 'assistant'; content: string }[];
}): { system: string; prompt: string } {
  const chapterList = Array.from(new Set(params.manuscriptBlocks.map(b => b.chapterNum))).sort((a, b) => a - b);

  const system = `You are a Literary Co-Author and Surgical Editorial Agent.
You assist the author with analyzing, fact-checking, and making atomic surgical edits across the manuscript.
The manuscript has ${chapterList.length} chapters (${chapterList.map(c => `Chapter ${c}`).join(', ')}).

CRITICAL OPERATIONAL RULES:
1. NEVER rewrite whole scenes or chapters. Every edit MUST be an atomic SEARCH/REPLACE patch.
2. You have access to three tools:
   - search_manuscript: {"query": "text to find", "chapter": Optional[number]}
   - inspect_dependencies: {"entity": "prop or character or timer"}
   - propose_diff: {"chapter": number, "search": "exact text to replace", "replace": "new text", "rationale": "reason"}
3. Call tools using markdown code fences:
\`\`\`tool:search_manuscript
{"query": "timer", "chapter": 1}
\`\`\`
4. When you have the exact text, propose a patch using:
\`\`\`tool:propose_diff
{"chapter": 1, "search": "exact quote", "replace": "new text", "rationale": "explanation"}
\`\`\`
5. Check cross-text dependencies: If changing a prop or timer, inspect other chapters so you do not introduce plot holes.
`.trim();

  let prompt = `User request: "${params.userPrompt}"\n\nPlease investigate the manuscript using tools or propose the diff patch directly.`;

  return { system, prompt };
}

export async function runEditorialTurn(params: {
  userPrompt: string;
  bookContent: string;
  metadata?: any;
  history: { role: 'user' | 'assistant'; content: string }[];
  callModel: (prompt: string, system: string) => Promise<string>;
}): Promise<EditorialAgentResponse> {
  const blocks = indexManuscriptBlocks(params.bookContent);
  const graph = buildEntityGraph(blocks, params.metadata?.dossier);

  const { system, prompt } = buildEditorialAgentPrompt({
    userPrompt: params.userPrompt,
    manuscriptBlocks: blocks,
    entityGraph: graph,
    history: params.history,
  });

  const executedTools: { tool: string; summary: string }[] = [];
  const diffCards: ProposedDiffCard[] = [];

  // Round 1
  let modelResponse = await params.callModel(prompt, system);
  let toolCalls = parseToolCallsFromModelResponse(modelResponse);

  // If tool calls emitted, execute them locally and run Round 2
  if (toolCalls.length > 0) {
    const observations: string[] = [];

    for (const tc of toolCalls) {
      if (tc.tool === 'search_manuscript') {
        const query = tc.args.query || '';
        const ch = tc.args.chapter ? Number(tc.args.chapter) : undefined;
        const matches = hybridSearch(blocks, query, ch, 4);
        executedTools.push({
          tool: 'search_manuscript',
          summary: `Searched "${query}" (${matches.length} matches found)`,
        });
        observations.push(`Tool 'search_manuscript' result for "${query}":\n` +
          matches.map(m => `[Chapter ${m.chapterNum}, Block ${m.blockId}]: "${m.fullText}"`).join('\n\n')
        );
      } else if (tc.tool === 'inspect_dependencies') {
        const entity = tc.args.entity || '';
        const ch = tc.args.chapter ? Number(tc.args.chapter) : 1;
        const warnings = checkCrossTextImpact(graph, entity, ch);
        executedTools.push({
          tool: 'inspect_dependencies',
          summary: `Checked dependencies for "${entity}"`,
        });
        observations.push(`Tool 'inspect_dependencies' result for "${entity}":\n` +
          (warnings.length > 0 ? warnings.map(w => w.warning).join('\n') : 'No conflicts in other chapters.')
        );
      } else if (tc.tool === 'propose_diff') {
        const ch = Number(tc.args.chapter || 1);
        const search = tc.args.search || '';
        const replace = tc.args.replace || '';
        const rationale = tc.args.rationale || 'Editorial edit';
        const warnings = checkCrossTextImpact(graph, search, ch).map(w => w.warning);

        diffCards.push({
          id: `diff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          chapterNum: ch,
          searchTarget: search,
          replacementText: replace,
          rationale,
          warnings,
        });
        executedTools.push({
          tool: 'propose_diff',
          summary: `Proposed patch for Chapter ${ch}`,
        });
      }
    }

    // If propose_diff was already in round 1, no need for second call if clear
    if (diffCards.length === 0 && observations.length > 0) {
      const followUpPrompt = `${prompt}\n\nTool Observations:\n${observations.join('\n\n')}\n\nPlease provide your final response and propose diff patches if needed.`;
      modelResponse = await params.callModel(followUpPrompt, system);
      const secondRoundTools = parseToolCallsFromModelResponse(modelResponse);

      for (const tc of secondRoundTools) {
        if (tc.tool === 'propose_diff') {
          const ch = Number(tc.args.chapter || 1);
          const search = tc.args.search || '';
          const replace = tc.args.replace || '';
          const rationale = tc.args.rationale || 'Editorial edit';
          const warnings = checkCrossTextImpact(graph, search, ch).map(w => w.warning);

          diffCards.push({
            id: `diff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            chapterNum: ch,
            searchTarget: search,
            replacementText: replace,
            rationale,
            warnings,
          });
          executedTools.push({
            tool: 'propose_diff',
            summary: `Proposed patch for Chapter ${ch}`,
          });
        }
      }
    }
  }

  // Clean tool tags from message text
  const cleanMessage = modelResponse
    .replace(/```(?:tool:[a-z_]+|json\s*\(tool:[a-z_]+\))[\s\S]*?```/gi, '')
    .trim();

  return {
    assistantMessage: cleanMessage || (diffCards.length > 0 ? 'Here is the proposed editorial patch:' : 'Review completed.'),
    diffCards,
    executedTools,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editorialAgent.test.ts`
Expected: PASS (3/3 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/novel/editorialAgent.ts tests/editorialAgent.test.ts
git commit -m "feat(editorial): implement editorial agent tool calling engine"
```

---

### Task 5: Editorial Chat Studio Component & UI Integration

**Files:**
- Create: `components/EditorialChatStudio.tsx`
- Modify: `components/BookDisplay.tsx`
- Test: `tests/editorialChatStudio.test.tsx`

**Interfaces:**
- Produces:
  ```tsx
  export interface EditorialChatStudioProps {
    bookContent: string;
    metadata: any;
    onApplyPatch: (newManuscript: string, targetChapter?: number, patchSnippet?: string) => boolean | void;
    onUndoPatch: () => void;
    canUndo: boolean;
    activeModelConfig?: any;
    displayTitle?: string;
  }
  ```

- [ ] **Step 1: Write component unit tests for EditorialChatStudio**

```tsx
// tests/editorialChatStudio.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditorialChatStudio from '../components/EditorialChatStudio';

const SAMPLE_MANUSCRIPT = `
## Chapter 1: The Vault

Clark placed the heavy oxygen canister on the floor.
`.trim();

const SAMPLE_METADATA = {
  audit: {
    findings: [
      {
        finding: 'Clarify oxygen timer in Chapter 1',
        chapter: 1,
        quote: 'oxygen canister',
        recommendation: 'Specify exact remaining time'
      }
    ]
  }
};

describe('EditorialChatStudio', () => {
  it('renders Studio Header with title and model badge', () => {
    render(
      <EditorialChatStudio
        bookContent={SAMPLE_MANUSCRIPT}
        metadata={SAMPLE_METADATA}
        onApplyPatch={vi.fn()}
        onUndoPatch={vi.fn()}
        canUndo={false}
      />
    );

    expect(screen.getByText(/Editorial Assistant/i)).toBeInTheDocument();
  });

  it('renders System Audit Accordion Card with findings count', () => {
    render(
      <EditorialChatStudio
        bookContent={SAMPLE_MANUSCRIPT}
        metadata={SAMPLE_METADATA}
        onApplyPatch={vi.fn()}
        onUndoPatch={vi.fn()}
        canUndo={false}
      />
    );

    expect(screen.getByText(/System Editorial Tasks/i)).toBeInTheDocument();
  });

  it('renders input bar with quick prompt chips', () => {
    render(
      <EditorialChatStudio
        bookContent={SAMPLE_MANUSCRIPT}
        metadata={SAMPLE_METADATA}
        onApplyPatch={vi.fn()}
        onUndoPatch={vi.fn()}
        canUndo={false}
      />
    );

    expect(screen.getByPlaceholderText(/Ask editor/i)).toBeInTheDocument();
    expect(screen.getByText(/Check props & invariants/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editorialChatStudio.test.tsx`
Expected: FAIL ("Cannot find module '../components/EditorialChatStudio'")

- [ ] **Step 3: Implement `components/EditorialChatStudio.tsx`**

Build the complete component following strict zinc dark styling:
- System audit accordion at the top with "Apply All" and individual task triggers.
- Chat message feed with user and assistant bubbles.
- Tool execution badges with icons (`🔍`, `⚠️`).
- DiffReviewCard with red/green inline text, warnings, `[Apply Patch]`, `[Reject]`, and `[Undo]`.
- Textarea with `Cmd+Enter` handling, quick prompt chips, and loading spinners.

- [ ] **Step 4: Update `components/BookDisplay.tsx`**

Integrate `<EditorialChatStudio />` in Column 1:
- Wire up `onApplyPatch` to update `bookContent` via `onManualSave`.
- Implement `undoStack` with `pushUndoState` and `popUndoState`.
- Add paragraph `data-block-id` to MarkdownView or scroll smoothly to target chapter header on patch application.
- Retain existing Clean / Changes view modes in Column 2.

- [ ] **Step 5: Run tests to verify all pass**

Run: `npx vitest run tests/editorialChatStudio.test.tsx tests/bookDisplay.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/EditorialChatStudio.tsx components/BookDisplay.tsx tests/editorialChatStudio.test.tsx
git commit -m "feat(editorial): integrate editorial chat studio into book display column 1"
```

---

### Task 6: Full Verification and Build Quality Gate

**Files:**
- Entire repository verification

- [ ] **Step 1: Run full Vitest suite**

Run: `npm test`
Expected: PASS across all test files (existing 48 + 4 new test suites).

- [ ] **Step 2: Run production bundle build**

Run: `npm run build`
Expected: Build succeeds with zero TypeScript or bundling errors.

- [ ] **Step 3: Verify git status and clean working tree**

Run: `git status -s`
Expected: Clean working tree on branch `author-desk`.
