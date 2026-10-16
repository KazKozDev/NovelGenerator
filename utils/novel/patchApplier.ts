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

export function cleanDiffArtifacts(str: string): string {
  let s = str.trim();
  // Strip leading diff signs like '--', '---', '-', '+', '++'
  s = s.replace(/^[-+]{1,3}\s*/, '');
  // Strip leading markdown quotes or list bullets
  s = s.replace(/^[>•*]\s*/, '');
  // Strip surrounding quotes if fully wrapped
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith('“') && s.endsWith('”')) ||
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('«') && s.endsWith('»'))
  ) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

export function normalizeLenient(str: string): string {
  return str
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’`]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function tryReplaceInBody(
  body: string,
  rawTarget: string,
  replacement: string
): { updatedBody: string; changed: boolean } {
  const cleanedTarget = cleanDiffArtifacts(rawTarget);
  const cleanedReplacement = cleanDiffArtifacts(replacement);

  if (!cleanedTarget) return { updatedBody: body, changed: false };

  // 1. Direct match (exact)
  if (body.includes(cleanedTarget)) {
    return {
      updatedBody: body.replace(cleanedTarget, cleanedReplacement),
      changed: true,
    };
  }

  // 2. Trailing ellipsis stripped match
  const withoutTrailingEllipsis = cleanedTarget.replace(/(?:\.{3,}|…)+$/, '').trim();
  if (withoutTrailingEllipsis && withoutTrailingEllipsis.length > 5 && body.includes(withoutTrailingEllipsis)) {
    return {
      updatedBody: body.replace(withoutTrailingEllipsis, cleanedReplacement),
      changed: true,
    };
  }

  // 3. Middle ellipsis match (e.g. "Start of sentence... end of sentence")
  const parts = cleanedTarget.split(/(?:\.{3,}|…)/).map(s => s.trim()).filter(Boolean);
  if (parts.length === 2 && parts[0].length >= 5 && parts[1].length >= 5) {
    const [startPart, endPart] = parts;
    const startIdx = body.indexOf(startPart);
    if (startIdx !== -1) {
      const endIdx = body.indexOf(endPart, startIdx + startPart.length);
      if (endIdx !== -1 && endIdx - startIdx < 2500) {
        const fullMatchedSpan = body.slice(startIdx, endIdx + endPart.length);
        return {
          updatedBody: body.replace(fullMatchedSpan, cleanedReplacement),
          changed: true,
        };
      }
    }
  }

  // 3.5. Multi-paragraph normalized match (spanning multiple paragraphs in body)
  const normTarget = normalizeLenient(withoutTrailingEllipsis || cleanedTarget);
  const normBody = normalizeLenient(body);
  if (normTarget.length >= 20 && normBody.includes(normTarget)) {
    const targetWords = normTarget.split(' ').filter(Boolean);
    if (targetWords.length >= 4) {
      const firstW = targetWords[0];
      const lastW = targetWords[targetWords.length - 1];
      const startIdx = body.toLowerCase().indexOf(firstW.toLowerCase());
      if (startIdx !== -1) {
        const endSearchFrom = Math.min(body.length, startIdx + Math.floor(cleanedTarget.length * 0.7));
        const endIdx = body.toLowerCase().indexOf(lastW.toLowerCase(), endSearchFrom);
        if (endIdx !== -1 && endIdx >= startIdx) {
          const matchedFull = body.slice(startIdx, endIdx + lastW.length);
          return {
            updatedBody: body.replace(matchedFull, cleanedReplacement),
            changed: true,
          };
        }
      }
    }
  }

  // 4. Whitespace and typography normalized match
  const paragraphs = body.split(/\n\n+/);
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const normP = normalizeLenient(p);
    if (normP.includes(normTarget)) {
      const words = normTarget.split(' ').filter(Boolean);
      if (words.length > 0) {
        const firstWord = words[0];
        const lastWord = words[words.length - 1];

        const startIdx = p.toLowerCase().indexOf(firstWord.toLowerCase());
        const endIdx = p.toLowerCase().lastIndexOf(lastWord.toLowerCase());

        if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
          const actualTarget = p.slice(startIdx, endIdx + lastWord.length);
          paragraphs[i] = p.replace(actualTarget, cleanedReplacement);
          return {
            updatedBody: paragraphs.join('\n\n'),
            changed: true,
          };
        }
      }
    }
  }

  // 5. High-confidence token overlap match (> 80% word tokens matched within a paragraph)
  const targetWords = normTarget.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (targetWords.length >= 4) {
    let bestPIndex = -1;
    let bestScore = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const pWords = new Set(normalizeLenient(paragraphs[i]).toLowerCase().split(/\s+/));
      let matches = 0;
      for (const w of targetWords) {
        if (pWords.has(w)) matches++;
      }
      const score = matches / targetWords.length;
      if (score > bestScore) {
        bestScore = score;
        bestPIndex = i;
      }
    }

    if (bestScore >= 0.8 && bestPIndex !== -1) {
      // Find candidate sentences inside the best paragraph
      const sentences = paragraphs[bestPIndex].split(/(?<=[.!?])\s+/);
      for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
        const s = sentences[sIdx];
        const sWords = new Set(normalizeLenient(s).toLowerCase().split(/\s+/));
        let sMatches = 0;
        for (const w of targetWords) {
          if (sWords.has(w)) sMatches++;
        }
        if (sMatches / targetWords.length >= 0.7) {
          paragraphs[bestPIndex] = paragraphs[bestPIndex].replace(s, cleanedReplacement);
          return {
            updatedBody: paragraphs.join('\n\n'),
            changed: true,
          };
        }
      }
    }
  }

  return { updatedBody: body, changed: false };
}

export function applyBlockRangePatch(
  manuscript: string,
  chapterNum: number,
  startBlockId: string,
  endBlockId?: string,
  replacementText: string = ''
): PatchResult {
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

  const startMatch = startBlockId.match(/_p(\d+)/i) || startBlockId.match(/(\d+)$/);
  const endMatch = (endBlockId || startBlockId).match(/_p(\d+)/i) || (endBlockId || startBlockId).match(/(\d+)$/);

  if (!startMatch) {
    return {
      success: false,
      updatedManuscript: manuscript,
      changed: false,
      error: `Could not parse paragraph index from start block ID "${startBlockId}".`,
    };
  }

  let startP = parseInt(startMatch[1], 10);
  let endP = endMatch ? parseInt(endMatch[1], 10) : startP;
  if (startP > endP) [startP, endP] = [endP, startP];

  const ch = chapters[targetChapterIndex];
  const paragraphs = ch.content.split(/\n\n+/);

  if (startP >= paragraphs.length) {
    return {
      success: false,
      updatedManuscript: manuscript,
      changed: false,
      error: `Block ID ${startBlockId} (paragraph ${startP}) is beyond Chapter ${chapterNum} length (${paragraphs.length} paragraphs).`,
    };
  }

  const boundedEndP = Math.min(paragraphs.length - 1, endP);
  const cleanedReplacement = cleanDiffArtifacts(replacementText || '');

  // Delete or replace paragraphs from startP to boundedEndP
  if (cleanedReplacement) {
    paragraphs.splice(startP, boundedEndP - startP + 1, cleanedReplacement);
  } else {
    paragraphs.splice(startP, boundedEndP - startP + 1);
  }

  ch.content = paragraphs.join('\n\n');

  const titleMatch = manuscript.match(/^#\s+([^\r\n]+)/m);
  const title = titleMatch ? titleMatch[1] : undefined;

  return {
    success: true,
    updatedManuscript: assembleManuscript(chapters.map(c => ({ chapter: c.num, text: c.content })), title),
    changed: true,
    matchedChapter: chapterNum,
  };
}

export function applySearchReplacePatch(
  manuscript: string,
  chapterNum: number,
  searchTarget: string,
  replacementText: string,
  startBlockId?: string,
  endBlockId?: string
): PatchResult {
  if (startBlockId) {
    return applyBlockRangePatch(manuscript, chapterNum, startBlockId, endBlockId, replacementText);
  }

  const cleanedTarget = cleanDiffArtifacts(searchTarget || '');
  const cleanedReplacement = cleanDiffArtifacts(replacementText || '');

  if (!cleanedTarget) {
    return {
      success: false,
      updatedManuscript: manuscript,
      changed: false,
      error: 'Empty search target provided.',
    };
  }

  // Detect no-op edits
  if (cleanedTarget === cleanedReplacement && cleanedTarget !== '') {
    return {
      success: false,
      updatedManuscript: manuscript,
      changed: false,
      error: 'The search target and replacement text are identical (no-op edit).',
    };
  }

  const chapters = parseBookChapters(manuscript);
  const targetChapterIndex = chapters.findIndex(c => c.num === chapterNum);

  const titleMatch = manuscript.match(/^#\s+([^\r\n]+)/m);
  const title = titleMatch ? titleMatch[1] : undefined;

  // 1. Try applying to the requested chapter
  if (targetChapterIndex !== -1) {
    const attempt = tryReplaceInBody(chapters[targetChapterIndex].content, cleanedTarget, cleanedReplacement);
    if (attempt.changed) {
      chapters[targetChapterIndex].content = attempt.updatedBody;
      return {
        success: true,
        updatedManuscript: assembleManuscript(chapters.map(c => ({ chapter: c.num, text: c.content })), title),
        changed: true,
        matchedChapter: chapterNum,
      };
    }
  }

  // 2. Cross-chapter recovery: if not in requested chapter, check other chapters
  for (let i = 0; i < chapters.length; i++) {
    if (i === targetChapterIndex) continue;
    const attempt = tryReplaceInBody(chapters[i].content, cleanedTarget, cleanedReplacement);
    if (attempt.changed) {
      chapters[i].content = attempt.updatedBody;
      return {
        success: true,
        updatedManuscript: assembleManuscript(chapters.map(c => ({ chapter: c.num, text: c.content })), title),
        changed: true,
        matchedChapter: chapters[i].num,
      };
    }
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
