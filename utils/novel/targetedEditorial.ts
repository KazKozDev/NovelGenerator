import { assembleManuscript, normalizeChapterBody, parseBookChapters } from './manuscript';

export interface EditorialFinding {
  category?: string;
  severity?: string;
  description: string;
  evidence_refs?: string[];
  reader_impact?: string;
}

export interface TargetedRepairResult {
  changed: boolean;
  chapterNumber: number;
  explanation: string;
  beforeChapterText: string;
  afterChapterText: string;
  updatedManuscript: string;
}

/**
 * Extracts the target chapter number most relevant to the given finding.
 * Checks evidence_refs (e.g. "chapter-2: ..."), the description text, or searches quotes in chapters.
 */
export function findTargetChapter(
  finding: EditorialFinding,
  chapters: { num: number; content: string }[]
): number {
  const referencedChapters: number[] = [];

  // 1. Scan evidence_refs for "chapter-X" or "Chapter X"
  if (Array.isArray(finding.evidence_refs)) {
    for (const ref of finding.evidence_refs) {
      const match = String(ref).match(/\b(?:chapter|глава)[- ]?(\d+)\b/i);
      if (match) {
        referencedChapters.push(parseInt(match[1], 10));
      }
    }
  }

  // 2. Scan description for "chapter X" or "Chapter X"
  if (finding.description) {
    const descMatch = String(finding.description).match(/\b(?:chapter|глава)[- ]?(\d+)\b/i);
    if (descMatch) {
      referencedChapters.push(parseInt(descMatch[1], 10));
    }
  }

  // 3. If no chapter number found, check if evidence quotes match text in any chapter
  if (referencedChapters.length === 0 && Array.isArray(finding.evidence_refs)) {
    for (const ref of finding.evidence_refs) {
      const quote = String(ref).replace(/^(?:chapter|глава)[- ]?\d+:\s*/i, '').trim();
      if (quote.length > 8) {
        const found = chapters.find(c => c.content.includes(quote));
        if (found) {
          referencedChapters.push(found.num);
        }
      }
    }
  }

  // If multiple chapters are cited (e.g., contradiction between setup and payoff),
  // target the later chapter where the discrepancy occurs.
  if (referencedChapters.length > 0) {
    const maxChapter = Math.max(...referencedChapters);
    if (chapters.some(c => c.num === maxChapter)) {
      return maxChapter;
    }
    const minChapter = Math.min(...referencedChapters);
    if (chapters.some(c => c.num === minChapter)) {
      return minChapter;
    }
  }

  return chapters[0]?.num ?? 1;
}

/**
 * Parses JSON response from LLM, supporting direct JSON, markdown code fences, or braced objects.
 */
export function parseRepairJson(raw: string): { changed?: boolean; explanation?: string; text?: string } | null {
  try {
    return JSON.parse(raw);
  } catch {
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]);
      } catch {
        // try braced object fallback
      }
    }
    const braceMatch = raw.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        // failed
      }
    }
    return null;
  }
}

/**
 * Builds the focused repair prompt for a single finding and chapter.
 */
export function buildTargetedRepairPrompt(
  finding: EditorialFinding,
  chapterNumber: number,
  chapterContent: string
): { prompt: string; system: string } {
  const evidenceText = finding.evidence_refs?.length
    ? `\nEvidence cited:\n${finding.evidence_refs.map(r => `  - ${r}`).join('\n')}`
    : '';

  const system =
    'You are a professional book editor. Make minimal, surgical edits to resolve the specified editorial finding in the chapter text. Preserve the author\'s voice, style, character names, and effective prose. Output valid JSON only.';

  const prompt = `EDITORIAL FINDING TO FIX:
Severity: ${finding.severity || 'note'}
Category: ${finding.category || 'General continuity'}
Issue: ${finding.description}${evidenceText}

CURRENT CHAPTER ${chapterNumber} PROSE:
${chapterContent}

TASK:
1. Revise Chapter ${chapterNumber} to resolve the issue above.
2. Make ONLY the minimal necessary changes required to fix the contradiction, inconsistency, or craft flaw.
3. Keep all effective scenes, character dialogue, voice, tone, and existing style intact.
4. Do NOT summarize or truncate the chapter. Return the COMPLETE revised chapter text with the fix integrated.
5. Provide a 1-sentence explanation of what was changed.

Return a valid JSON object with EXACTLY this structure:
{
  "changed": true,
  "explanation": "Brief description of the fix enacted",
  "text": "Complete revised chapter text"
}`;

  return { prompt, system };
}

/**
 * Executes a single surgical repair for one finding against the manuscript.
 */
export async function repairSingleFinding(
  finding: EditorialFinding,
  manuscriptContent: string,
  bookTitle: string,
  callLlm: (prompt: string, system: string) => Promise<string>
): Promise<TargetedRepairResult> {
  const parsedChapters = parseBookChapters(manuscriptContent);
  if (parsedChapters.length === 0) {
    throw new Error('Manuscript has no readable chapters.');
  }

  const targetChapterNum = findTargetChapter(finding, parsedChapters);
  const targetChapter = parsedChapters.find(c => c.num === targetChapterNum) || parsedChapters[0];
  const beforeChapterText = targetChapter.content;

  const { prompt, system } = buildTargetedRepairPrompt(finding, targetChapter.num, beforeChapterText);
  const rawResponse = await callLlm(prompt, system);
  const parsed = parseRepairJson(rawResponse);

  if (!parsed || parsed.changed === false || !parsed.text || !parsed.text.trim()) {
    return {
      changed: false,
      chapterNumber: targetChapter.num,
      explanation: parsed?.explanation || 'Verified: no text modification required',
      beforeChapterText,
      afterChapterText: beforeChapterText,
      updatedManuscript: manuscriptContent,
    };
  }

  const afterChapterText = normalizeChapterBody(parsed.text.trim(), targetChapter.num);
  const updatedChapters = parsedChapters.map(c =>
    c.num === targetChapter.num ? { chapter: c.num, text: afterChapterText } : { chapter: c.num, text: c.content }
  );

  const updatedManuscript = assembleManuscript(updatedChapters, bookTitle);

  return {
    changed: true,
    chapterNumber: targetChapter.num,
    explanation: parsed.explanation || `Updated Chapter ${targetChapter.num}`,
    beforeChapterText,
    afterChapterText,
    updatedManuscript,
  };
}
