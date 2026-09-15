import { renderPrompt, systemContract } from '../prompts';
import { contentWords, paragraphsOf, repeatedSpans, splitSentences, type RepeatedSpan } from '../analytics';
import { rerankRepetitionScore, sharedReranker, type Reranker } from '../reranker';
import { structuredResponse, type NovelLLM } from './llm';
import { currentGateMode } from './semanticGate';
import type { BookDesign, ScenePlan } from './types';

/**
 * Span repair: the last line, and deliberately the smallest one.
 *
 * When a scene turns out to repeat prose the book already wrote, the expensive
 * answer is to write the scene again. That costs a full writing call, a full
 * tracking call, and — worse — a different scene, whose delta, handoff and tail
 * differ from the one the following scenes were planned against. One repetition
 * becomes a cascade.
 *
 * So nothing is rewritten but the sentences that actually duplicate. The
 * detector hands over exact spans; those spans are mapped to the sentences
 * holding them; only those sentences travel to the model, and only those
 * sentences come back. The result is spliced by exact string replacement, which
 * means a replacement that does not apply cleanly simply does not apply — the
 * scene is never left in a state nobody chose.
 *
 * The rule that makes this safe is in the prompt and enforced by the shape of
 * the call: a replacement carries the same information as the sentence it
 * replaces. Nothing happens that did not happen, so memory is untouched and the
 * repair can run before the scene is ever tracked.
 *
 * Two detectors feed it, and they see different things. Word runs catch a
 * sentence carried over intact and cost nothing. A cross-encoder catches the
 * paragraph retold in fresh words, which no amount of string matching reaches —
 * and it is the same model, at the same fitted threshold, that the pre-write
 * gate already uses on scene plans. It runs only when the local models are
 * switched on; with them off the repair is exactly what it was.
 */

export interface RepairOutcome {
  prose: string;
  /** Sentences actually replaced, oldest first. */
  repaired: { from: string; to: string }[];
  /** Duplications left standing, with the reason. */
  left: string[];
}

interface Replacement {
  original: string;
  replacement: string;
  refused_because?: string;
}

/**
 * The sentences of `prose` that hold a repeated span. One sentence may hold
 * several spans and is offered once; a span that straddles two sentences brings
 * both, because replacing half of a duplicated thought leaves the other half.
 */
export function duplicatedSentences(prose: string, spans: RepeatedSpan[]): { sentence: string; ref: string }[] {
  const sentences = splitSentences(prose);
  const found = new Map<string, string>();
  for (const span of spans) {
    const needle = span.text.toLowerCase();
    for (const sentence of sentences) {
      const normalized = sentence.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      // The span is a word sequence with punctuation already stripped, so the
      // sentence is normalized the same way before they are compared.
      if (!normalized) continue;
      const words = needle.split(' ');
      // A sentence qualifies when it holds the span or a leading part of it:
      // the span was grown across a sentence boundary and its head lands here.
      if (normalized.includes(needle) || (words.length > 4 && normalized.includes(words.slice(0, 4).join(' ')))) {
        if (!found.has(sentence)) found.set(sentence, span.ref);
      }
    }
  }
  return [...found].map(([sentence, ref]) => ({ sentence, ref }));
}

/**
 * Paragraphs of this scene that retell an earlier paragraph in different words.
 *
 * The cross-encoder decides, at the threshold fitted for it — a number measured
 * on real pairs rather than chosen, which is the whole reason to reach for the
 * model instead of inventing another constant. Content-word overlap only picks
 * which pairs are worth asking about; it never decides.
 *
 * Returns nothing at all when the models are off, when the scene is short, or
 * when the scorer fails: a repetition left standing is a blemish, and a repair
 * driven by a broken scorer is a scene nobody wrote.
 */
export async function retoldParagraphs(
  prose: string,
  earlier: { ref: string; text: string }[],
  rerank?: Reranker,
  maxPairs = 16,
): Promise<{ paragraph: string; ref: string; score: number }[]> {
  const scorer = rerank || (currentGateMode() === 'full' ? sharedReranker() : undefined);
  if (!scorer) return [];
  const mine = paragraphsOf(prose).filter(item => contentWords(item).length >= 25);
  if (!mine.length) return [];
  const theirs = earlier.flatMap(item => paragraphsOf(item.text)
    .filter(paragraph => contentWords(paragraph).length >= 25)
    .map(paragraph => ({ ref: item.ref, paragraph })));
  const pairs: { paragraph: string; ref: string; other: string }[] = [];
  for (let index = 0; index < mine.length; index++) {
    const paragraph = mine[index];
    const words = new Set(contentWords(paragraph));
    // The scene's own earlier paragraphs are candidates too. Every other
    // repetition check in the pipeline compares a scene with what came before
    // it and excludes the scene from its own comparison — necessarily, or it
    // would match itself everywhere — with the result that nothing looked
    // inside a scene at all, and a closing scene could state the same
    // realisation four times in four different sentences without repeating a
    // word run. Only paragraphs already past are offered, so the first
    // statement is never the finding; its restatements are.
    const candidates = [
      ...theirs,
      ...mine.slice(0, index).map(item => ({ ref: 'earlier in this scene', paragraph: item })),
    ];
    if (!candidates.length) continue;
    let best: { ref: string; other: string; overlap: number } | null = null;
    for (const candidate of candidates) {
      const other = contentWords(candidate.paragraph);
      const overlap = other.filter(word => words.has(word)).length / other.length;
      if (!best || overlap > best.overlap) best = { ref: candidate.ref, other: candidate.paragraph, overlap };
    }
    if (best && best.overlap > 0.12) pairs.push({ paragraph, ref: best.ref, other: best.other });
  }
  if (!pairs.length) return [];
  try {
    const scores = await scorer(pairs.slice(0, maxPairs).map(item =>
      [item.paragraph.slice(0, 1200), item.other.slice(0, 1200)] as [string, string]));
    return pairs.slice(0, maxPairs)
      .map((item, index) => ({ paragraph: item.paragraph, ref: item.ref, score: scores[index] ?? 0 }))
      .filter(item => item.score >= rerankRepetitionScore);
  } catch {
    return [];
  }
}

/**
 * How many quotation marks of each kind a piece of text opens or closes.
 *
 * Only the count, and only so a replacement can be compared with what it
 * replaces: a sentence that ended a speech and is swapped for one that does not
 * leaves every following paragraph on the wrong side of the quotation.
 */
export function quoteBalance(text: string): string {
  const straight = (text.match(/"/g) || []).length % 2;
  const open = (text.match(/[“«]/g) || []).length;
  const close = (text.match(/[”»]/g) || []).length;
  return `${straight}:${open - close}`;
}

/**
 * Find what this scene duplicates and repair only that, in place.
 *
 * Returns the prose unchanged when there is nothing to repair, when the model
 * call fails, or when no replacement applies cleanly — a failed repair is a
 * scene that still says exactly what it said, never a scene half-edited.
 */
export async function repairRepetition(
  input: {
    design: BookDesign;
    scene: ScenePlan;
    prose: string;
    earlier: { ref: string; text: string }[];
    rerank?: Reranker;
  },
  llm: NovelLLM,
): Promise<RepairOutcome> {
  const spans = repeatedSpans(input.prose, input.earlier);
  const retold = await retoldParagraphs(input.prose, input.earlier, input.rerank);
  const targets = duplicatedSentences(input.prose, spans);
  // A retold paragraph is repaired sentence by sentence like any other: the
  // contract is the same — same information, different words — and splicing a
  // whole paragraph would change more of the scene than the defect occupies.
  for (const item of retold) {
    for (const sentence of splitSentences(item.paragraph)) {
      if (!targets.some(target => target.sentence === sentence)) targets.push({ sentence, ref: item.ref });
    }
  }
  if (!targets.length) return { prose: input.prose, repaired: [], left: [] };

  const system = systemContract();
  const prompt = renderPrompt('P08_SPAN_REPAIR', {
    story_contract: JSON.stringify(input.design.contract),
    style_contract: JSON.stringify(input.design.style_contract),
    scene_summary: `${input.scene.function || ''}\n${input.scene.required_outcome || ''}`.trim() || '(no summary)',
    duplicated_from: [
      ...spans.map(span => `Repeated word for word from ${span.ref}: "${span.text}"`),
      ...retold.map(item => `Retold in different words from ${item.ref} (paraphrase score ${item.score.toFixed(1)}): "${item.paragraph.slice(0, 240)}"`),
    ].join('\n') || '(none)',
    sentences: targets.map((target, index) => `${index + 1}. (repeats ${target.ref}) ${target.sentence}`).join('\n\n'),
  });

  let replacements: Replacement[];
  try {
    const raw = await structuredResponse(prompt, system, llm, ['replacements'], parsed => parsed,
      { temperature: 0.6, maxTokens: 4096, route: 'writer' }) as { replacements?: unknown };
    replacements = Array.isArray(raw.replacements) ? raw.replacements as Replacement[] : [];
  } catch (error) {
    // A failed repair leaves a repetition in the book, which is a blemish. A
    // half-applied repair leaves a scene nobody wrote, which is worse.
    return {
      prose: input.prose,
      repaired: [],
      left: [`the repair call failed (${error instanceof Error ? error.message : error}); ${targets.length} duplicated sentence(s) stand as written`],
    };
  }

  let prose = input.prose;
  const repaired: { from: string; to: string }[] = [];
  const left: string[] = [];
  for (const entry of replacements) {
    const from = typeof entry?.original === 'string' ? entry.original.trim() : '';
    const to = typeof entry?.replacement === 'string' ? entry.replacement.trim() : '';
    if (!from) continue;
    if (!to) {
      left.push(`"${from.slice(0, 60)}…" was kept: ${entry.refused_because || 'no replacement offered'}`);
      continue;
    }
    if (!prose.includes(from)) {
      // The model paraphrased the sentence it was asked to replace. Splicing on
      // a near match would edit a sentence nobody pointed at.
      left.push(`"${from.slice(0, 60)}…" does not occur in the scene verbatim, so nothing was replaced`);
      continue;
    }
    // A replacement that still carries the sentence it replaces is not a repair;
    // spliced in, it leaves the duplication standing beside its own rewrite, and
    // the manuscript ships the pair. Seen in a finished book as: "…it takes what
    // is not." "The fire shows what is wanted. It takes what is not."
    if (to.includes(from)) {
      left.push(`"${from.slice(0, 60)}…" was kept: the replacement still contained it word for word`);
      continue;
    }
    // Quotation marks are load-bearing in prose and a swap can leave them odd,
    // which turns the rest of the paragraph into dialogue or out of it. Code
    // cannot judge a sentence, but it can count.
    if (quoteBalance(from) !== quoteBalance(to)) {
      left.push(`"${from.slice(0, 60)}…" was kept: the replacement would have left the paragraph's quotation marks unbalanced`);
      continue;
    }
    prose = prose.replace(from, to);
    repaired.push({ from, to });
  }
  for (const target of targets) {
    if (!repaired.some(item => item.from === target.sentence) && !left.some(item => item.startsWith(`"${target.sentence.slice(0, 60)}`))) {
      left.push(`"${target.sentence.slice(0, 60)}…" still repeats ${target.ref}`);
    }
  }
  return { prose, repaired, left };
}
