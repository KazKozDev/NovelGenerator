/**
 * Natural-language-inference contradiction scores for canon-vs-prose checks.
 *
 * The continuity reviewer is an LLM judging long passages; an NLI
 * cross-encoder answers a narrower, cheaper question — does sentence B
 * contradict claim A? — with a number. Intended plug point: score each new
 * chapter's sentences against the short StoryState claims that speak about
 * the same subject, and surface hits above threshold as advisory findings
 * (never blocking: NLI reads literal semantics and misses irony, idiom and
 * deliberately unreliable narration).
 *
 * Input discipline matters: feed SHORT claims and SINGLE sentences, not
 * paragraphs. Cost is claims × sentences per chapter, so sample — the few
 * claims about the chapter's participants, not the whole canon.
 *
 * Label order depends on the checkpoint and MUST match its card. The
 * default below follows the cross-encoder/nli-deberta card
 * (contradiction, entailment, neutral).
 */
export type NLIName = 'contradiction' | 'entailment' | 'neutral';

export interface NLIScores {
  contradiction: number;
  entailment: number;
  neutral: number;
}

export type NLIScorer = (premise: string, hypothesis: string) => Promise<NLIScores>;

import type { ProgressCallback } from './modelProgress';
import { loadWithFallback, localModelWorker, progressOptions } from './modelProgress';
import { sentencesOf } from './review';

/** Browser-first default; override with any NLI checkpoint plus its label order. */
export const DEFAULT_NLI_MODEL = 'Xenova/nli-deberta-v3-base';
export const NLI_LABELS_CE: NLIName[] = ['contradiction', 'entailment', 'neutral'];

export function softmax(logits: number[]): number[] {
  if (!logits.length) return [];
  const peak = Math.max(...logits);
  const exps = logits.map(value => Math.exp(value - peak));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return total > 0 ? exps.map(value => value / total) : logits.map(() => 1 / logits.length);
}

export function createNLIScorer(
  model = DEFAULT_NLI_MODEL,
  dtype: 'q8' | 'fp32' = 'q8',
  labels: NLIName[] = NLI_LABELS_CE,
  onProgress?: ProgressCallback,
): NLIScorer {
  // The label order is this checkpoint's, and it stays here: the worker returns logits and knows
  // nothing about what position three means.
  const scoresFrom = (logits: number[]): NLIScores => {
    const probabilities = softmax(logits);
    const scores: NLIScores = { contradiction: 0, entailment: 0, neutral: 0 };
    labels.forEach((name, index) => { scores[name] = probabilities[index] ?? 0; });
    return scores;
  };
  // A caller that wants the download reported keeps the page's own loader; nothing passes one today.
  const worker = onProgress ? undefined : localModelWorker();
  if (worker) return async (premise, hypothesis) => scoresFrom(await worker.pairLogits(model, premise, hypothesis));
  let ready: Promise<{
    tokenize: (premise: string, hypothesis: string) => unknown;
    classify: (input: unknown) => Promise<number[]>;
  }> | undefined;
  const load = () => loadWithFallback(model, async dtype => {
    const { AutoTokenizer, AutoModelForSequenceClassification } = await import('@huggingface/transformers');
    const [tokenizer, classifier] = await Promise.all([
      AutoTokenizer.from_pretrained(model, progressOptions(onProgress)),
      AutoModelForSequenceClassification.from_pretrained(model, { dtype, ...progressOptions(onProgress) }),
    ]);
    return {
      tokenize: (premise: string, hypothesis: string) => tokenizer(premise, { text_pair: hypothesis, padding: true, truncation: true }),
      classify: async (input: unknown) => {
        const output = await classifier(input as never);
        const logits = (output.logits as { tolist(): number[] }).tolist();
        return Array.isArray(logits[0]) ? (logits as unknown as number[][])[0] : logits;
      },
    };
  });
  return async (premise, hypothesis) => {
    ready ||= load();
    const { tokenize, classify } = await ready;
    return scoresFrom(await classify(tokenize(premise, hypothesis)));
  };
}

const sharedScorers = new Map<string, NLIScorer>();

/** One instance per model: weights are hundreds of MB and load once. */
export function sharedNLIScorer(model = DEFAULT_NLI_MODEL, dtype: 'q8' | 'fp32' = 'q8', onProgress?: ProgressCallback): NLIScorer {
  const key = `${model}|${dtype}`;
  const existing = sharedScorers.get(key);
  if (existing) return existing;
  const created = createNLIScorer(model, dtype, NLI_LABELS_CE, onProgress);
  sharedScorers.set(key, created);
  return created;
}

export interface ContradictionFinding {
  claim: string;
  sentence: string;
  contradiction: number;
}

/**
 * Every sentence against every claim, highest contradiction first.
 * One pair at a time: a batch would pad to the longest sentence and a
 * chapter asks about dozens of pairs, not thousands.
 */
export async function contradictionFindings(
  claims: string[],
  sentences: string[],
  score: NLIScorer,
  threshold = 0.8,
): Promise<ContradictionFinding[]> {
  const findings: ContradictionFinding[] = [];
  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    for (const claim of claims) {
      if (!claim.trim()) continue;
      const result = await score(claim, sentence);
      if (result.contradiction >= threshold) findings.push({ claim, sentence, contradiction: result.contradiction });
    }
  }
  return findings.sort((first, second) => second.contradiction - first.contradiction);
}

/**
 * Advisory canon scan for one chapter: short StoryState claims about the
 * chapter's participants against the chapter's own sentences (>=8 words).
 * Returns findings, never throws on model output — the caller decides what
 * a hit means. Sample claims before calling: the few facts about people in
 * this chapter, not the whole canon.
 */
export async function scanChapterContradictions(
  claims: string[],
  content: string,
  score: NLIScorer,
  threshold = 0.8,
): Promise<ContradictionFinding[]> {
  return contradictionFindings(claims, sentencesOf(content), score, threshold);
}
