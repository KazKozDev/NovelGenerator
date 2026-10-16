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
