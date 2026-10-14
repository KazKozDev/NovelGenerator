import type { ProjectInput, FinalReport } from './v2/types';

/** The author's draft: notebook, plan, dossier and the desk it is working at. */
export interface AuthorDraft {
  version: 1;
  input_key: string;
  notebook?: string;
  clock: string;
  plan: string;
  title?: string;
  chapters: { text: string; card: string; facts: string; reader: string }[];
  threads?: string;
  desk?: DeskState;
  waiting: string;
  noticed: string[];
  completed: boolean;
}

export interface DeskState {
  files: Record<string, string>;
  answers: {
    who: string;
    step: number;
    about: string;
    text: string;
    stale?: boolean;
    asked?: string;
  }[];
  journal: string[];
  step: number;
  budget: number;
  spent: number;
  finished: boolean;
  editorial?: { active: boolean; sourceFiles: Record<string, string>; sourceReport: FinalReport; startedAt: string };
  chapter_frontier?: number;
  failed_edits?: { step: number; file: string; tool: string; reason: string; proposed?: string }[];
}

export const chapterFile = (n: number): string => `chapter-${n}.md`;

const paragraphs = (text: string) => text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);

export const authorKey = (input: ProjectInput): string =>
  JSON.stringify([input.premise, input.chapter_count, input.target_total_words, input.genre, input.author_requirements]);

const rule = (part: string) => /^[-=*_~\s]{3,}$/.test(part);

/**
 * Strips non-prose markers, protocol footers, and redundant headings from chapter text.
 */
export function cleanChapter(text: string): string {
  const footer = text.search(/^[ \t]*(?:EOF[ \t]*$|TOOL[-_]STEP[-_]END[ \t]*$|={3,}[ \t]*END OF TOOL STEP[ \t]*={3,}[ \t]*$|END OF (?:THE )?(?:CHAPTER|BOOK|NOVEL)\b[^\n]*$|(?:#{1,4}[ \t]+)?Results of this call and what remains:[ \t]*$|LEARN[ \t]+\d+[ \t]*:|Note:[ \t]*LEARN[ \t]+\d+\b)/m);
  if (footer >= 0) text = text.slice(0, footer).trimEnd().replace(/(?:\r?\n)[ \t]*[-*_]{3,}[ \t]*$/, '').trimEnd();
  const seen = new Set<string>();
  const parts = paragraphs(text).filter(part => {
    if (part.length < 80) return true;
    if (seen.has(part)) return false;
    seen.add(part);
    return true;
  });
  const end = parts.findIndex((part, at) => at >= parts.length - 4 && /^[*_#\s]*(END OF (THE )?(CHAPTER|BOOK|NOVEL)\b[^\n]*|THE END)[*_\s.]*$/i.test(part));
  if (end > 0) parts.length = end;
  const aside = (part: string) => /^[*_\s]*\[[^\]\n]{0,160}\b(record|keeper|dossier|notebook|plan\.md|facts)\b[^\]\n]{0,160}\][*_\s.]*$/i.test(part);
  while (parts.length && (rule(parts.at(-1)!) || aside(parts.at(-1)!))) parts.pop();
  while (parts.length && (rule(parts[0]) || /^#{1,3}\s*\**\s*chapter\b[^\n]*$/i.test(parts[0]))) parts.shift();
  return parts.join('\n\n');
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'it', 'its', 'he', 'she', 'they', 'them', 'his', 'her', 'their', 'this', 'that', 'these', 'those', 'is', 'was', 'were', 'be', 'been', 'being', 'had', 'have', 'has', 'do', 'did', 'does', 'as', 'out', 'up', 'down', 'then', 'so', 'if', 'when', 'into', 'there', 'who', 'which']);

/**
 * Detects phrases repeated across chapters beyond healthy motifs.
 */
export function wornPhrases(texts: string[], limit = 14): string[] {
  const seen = new Map<string, number>();
  for (const sentence of texts.flatMap(text => text.split(/[.!?…\n]+/))) {
    const normalized = sentence.toLowerCase()
      .replace(/\bdidn't\b/g, 'did not')
      .replace(/\bwasn't\b/g, 'was not')
      .replace(/\bcouldn't\b/g, 'could not')
      .replace(/\bwouldn't\b/g, 'would not')
      .replace(/\bhadn't\b/g, 'had not')
      .replace(/\bisn't\b/g, 'is not')
      .replace(/\baren't\b/g, 'are not')
      .replace(/\bdon't\b/g, 'do not');
    const tokens = normalized.replace(/[^\p{L}\p{N}'\s]/gu, ' ').split(/\s+/).filter(Boolean);
    for (let len = 2; len <= 5; len++) {
      for (let at = 0; at + len <= tokens.length; at++) {
        const slice = tokens.slice(at, at + len);
        const contentWords = slice.filter(w => !STOPWORDS.has(w) && w.length >= 3);
        if (len === 2 && contentWords.length === 0) continue;
        if (len >= 3 && contentWords.length === 0) continue;
        const gram = slice.join(' ');
        seen.set(gram, (seen.get(gram) || 0) + 1);
      }
    }
  }

  const repeated = [...seen].filter(([, times]) => times >= 3).sort((a, b) => b[1] - a[1]);
  if (!repeated.length) return [];

  const fiveGrams = repeated.filter(([gram]) => gram.split(' ').length === 5);
  const next = new Map<string, string[]>();
  for (const [gram] of fiveGrams) {
    const head = gram.split(' ').slice(0, 4).join(' ');
    next.set(head, [...(next.get(head) || []), gram]);
  }

  const grownPhrases: [string, number][] = [];
  const usedFive = new Set<string>();
  for (const [gram, times] of fiveGrams) {
    if (usedFive.has(gram)) continue;
    const phrase = gram.split(' ');
    usedFive.add(gram);
    for (let grown = 0; grown < 8; grown++) {
      const follow = (next.get(phrase.slice(-4).join(' ')) || []).find(other => !usedFive.has(other));
      if (!follow) break;
      usedFive.add(follow);
      phrase.push(follow.split(' ').at(-1)!);
    }
    if (new Set(phrase).size >= 3) {
      grownPhrases.push([phrase.join(' '), times]);
    }
  }

  const allCandidates: [string, number][] = [...grownPhrases];
  for (const [gram, times] of repeated) {
    const words = gram.split(' ');
    if (words.length < 5) {
      allCandidates.push([gram, times]);
    }
  }

  allCandidates.sort((a, b) => (b[0].length * b[1]) - (a[0].length * a[1]));

  const kept: [string, number][] = [];
  for (const [phrase, times] of allCandidates) {
    const redundant = kept.some(([existing, exTimes]) => existing.includes(phrase) && exTimes >= times);
    if (!redundant) {
      kept.push([phrase, times]);
    }
    if (kept.length >= limit) break;
  }

  return kept.map(([gram, times]) => `"${gram}" (${times} times)`);
}
