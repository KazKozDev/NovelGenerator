import type { Chapter } from './editorial';
import type { NovelLLM } from '../v2/llm';
import { CraftSession, object as o, text as t, number as n, list as a, revision, hasProseQuote } from './state';

export interface ChapterDigest { chapter: number; synopsis: string; evidence: { id: string; quote: string; meaning: string }[]; openQuestions: string[] }
const digestSchema = o({ chapter: n, synopsis: t, evidence: a(o({ id: t, quote: t, meaning: t })), openQuestions: a() });

/** Bounded chapter reads retain exact evidence; no guessed off-page truth. */
export async function manuscriptDigests(chapters: Chapter[], session: CraftSession, llm: NovelLLM): Promise<ChapterDigest[]> {
  const digests: ChapterDigest[] = [];
  for (const chapter of chapters) {
    const hash = await revision(chapter), source = `digests/${hash}/source.json`;
    await session.put(source, chapter);
    const digest = await session.run<ChapterDigest>(`digest/${hash}`, `digests/${hash}/digest.json`, 'enact', [source], digestSchema,
      `Read chapter ${chapter.chapter} for whole-book author work. Give a compact causal synopsis, exact excerpts for consequential actions/acquisitions/contradictions, and unresolved questions. Evidence IDs must start CH${chapter.chapter}-. Do not invent off-page events or turn dialogue claims into objective facts. Keep this digest below 1000 words.`, llm,
      value => { if (value.chapter !== chapter.chapter || new Set(value.evidence.map(e => e.id)).size !== value.evidence.length || value.evidence.some(e => !e.id.startsWith(`CH${chapter.chapter}-`) || !hasProseQuote(chapter.text, e.quote))) throw new Error('Digest evidence must belong to its exact chapter revision.'); });
    digests.push(digest);
  }
  return digests;
}

export async function wholeBookContext(chapters: Chapter[], session: CraftSession, llm: NovelLLM): Promise<string | undefined> {
  if (chapters.reduce((sum, c) => sum + c.text.length, 0) <= 60000) return undefined;
  return `WHOLE-BOOK CONTEXT: Every chapter below was separately read from its exact prose revision. Summaries are fallible interpretations. Cite only exact supplied excerpts, never summary wording as manuscript quotes. For a missing event cite its setup/outcome.\n${JSON.stringify(await manuscriptDigests(chapters, session, llm))}`;
}
