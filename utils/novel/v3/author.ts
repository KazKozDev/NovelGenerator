import type { ProjectInput } from '../v2/types';
import type { DeskState } from './authorDesk';

/** The author's draft: notebook, plan, dossier and the desk it is working at. The book itself is written in authorDesk.ts. */
export interface AuthorDraft {
  version: 1;
  input_key: string;
  /**
   * The author's own thinking, written before anything else and open beside it for the whole
   * book: the ending it writes toward, what is really going on, the voice. The two runs that
   * had one gave the liveliest prose of all; when the clock took its place the books went dry.
   */
  notebook?: string;
  clock: string;
  plan: string;
  /** The book's own title, given by the author with the plan. */
  title?: string;
  chapters: { text: string; card: string; facts: string; reader: string }[];
  /** Everything set up and not yet paid off, as the author last listed it. */
  threads?: string;
  /** The author's desk, when the book is written by the author working as it sees fit. */
  desk?: DeskState;
  /** What the last reader said they are waiting for; given to the next chapter. */
  waiting: string;
  /** What readers said did not add up, chapter by chapter; carried forward and reported. */
  noticed: string[];
  completed: boolean;
}

const paragraphs = (text: string) => text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
export const authorKey = (input: ProjectInput): string => JSON.stringify([input.premise, input.chapter_count, input.target_total_words, input.genre, input.author_requirements]);

const rule = (part: string) => /^[-=*_~\s]{3,}$/.test(part);
/**
 * A chapter is prose. Code takes off what is not: the "Chapter One" heading the page already
 * carries, a rule left at the end before the card, and a paragraph that appears twice.
 * A rule at the end used to be read as a chapter that stops mid-sentence: in the first book
 * written through the app, six good chapters were refused for it and written again.
 */
export function cleanChapter(text: string): string {
  const seen = new Set<string>();
  const parts = paragraphs(text).filter(part => { if (part.length < 80) return true; if (seen.has(part)) return false; seen.add(part); return true; });
  // "END OF CHAPTER TWO", and after the last chapter the title of the book again: a model's flourish, not the chapter.
  const end = parts.findIndex((part, at) => at >= parts.length - 4 && /^[*_#\s]*(END OF (THE )?(CHAPTER|BOOK|NOVEL)\b[^\n]*|THE END)[*_\s.]*$/i.test(part));
  if (end > 0) parts.length = end;
  // A pointer to the author's own desk — "[Record: see keeper entry for chapter 1.]" — is a note to itself, not a line of the book.
  const aside = (part: string) => /^[*_\s]*\[[^\]\n]{0,160}\b(record|keeper|dossier|notebook|plan\.md|facts)\b[^\]\n]{0,160}\][*_\s.]*$/i.test(part);
  while (parts.length && (rule(parts.at(-1)!) || aside(parts.at(-1)!))) parts.pop();
  while (parts.length && (rule(parts[0]) || /^#{1,3}\s*\**\s*chapter\b[^\n]*$/i.test(parts[0]))) parts.shift();
  return parts.join('\n\n');
}

/**
 * Turns of phrase the book has already used three times or more, counted by code. Shown the
 * whole chapter before it, a model took it for a pattern: "looked at the middle distance and
 * said nothing" eight times in one book, "a sky deciding whether to rain" four. A refrain used
 * twice is a motif; the author is told which ones have stopped being that.
 */
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'it', 'its', 'he', 'she', 'they', 'them', 'his', 'her', 'their', 'this', 'that', 'these', 'those', 'is', 'was', 'were', 'be', 'been', 'being', 'had', 'have', 'has', 'do', 'did', 'does', 'as', 'out', 'up', 'down', 'then', 'so', 'if', 'when', 'into', 'there', 'who', 'which']);

/**
 * Turns of phrase the book has already used three times or more, counted by code.
 * Catches 2 to 5+ word phrases, normalizing common contractions and filtering out
 * trivial stopword chains. Shown to the author as phrases that have stopped being
 * motifs and started being habits.
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
    // Collect 2-gram to 5-gram sequences
    for (let len = 2; len <= 5; len++) {
      for (let at = 0; at + len <= tokens.length; at++) {
        const slice = tokens.slice(at, at + len);
        // Do not count pure stopword combinations (e.g. "in the", "it was a")
        const contentWords = slice.filter(w => !STOPWORDS.has(w) && w.length >= 3);
        if (len === 2 && contentWords.length === 0) continue;
        if (len >= 3 && contentWords.length === 0) continue;
        const gram = slice.join(' ');
        seen.set(gram, (seen.get(gram) || 0) + 1);
      }
    }
  }

  // Filter grams that appeared at least 3 times
  const repeated = [...seen].filter(([, times]) => times >= 3).sort((a, b) => b[1] - a[1]);
  if (!repeated.length) return [];

  // Group 5-grams to grow overlapping long phrases (5+ words)
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

  // Combine grown phrases with 2-4 word phrases, filtering out substrings of longer phrases
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
