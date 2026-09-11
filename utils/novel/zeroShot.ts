/**
 * Zero-shot topic/genre classification without a genre-labeled dataset.
 *
 * bart-large-mnli turns classification into entailment: each candidate
 * label becomes the hypothesis "This text is about {label}." and the
 * label with the highest entailment wins. Intended plug point: verify the
 * frozen BookSpec genre against the generated outline/prose (a "thriller"
 * that scores highest on "romance" drifted), and route genre-mix seeds.
 *
 * Label order here is BART-MNLI (contradiction, neutral, entailment) —
 * NOT the cross-encoder order in nli.ts. This is exactly why every
 * factory takes its label order as a parameter.
 */
import type { ProgressCallback } from './modelProgress';
import { loadWithFallback, localModelWorker, progressOptions } from './modelProgress';

export const DEFAULT_ZEROSHOT_MODEL = 'Xenova/bart-large-mnli';
export const ZEROSHOT_LABELS = ['contradiction', 'neutral', 'entailment'] as const;

export type ZeroShotClassifier = (text: string, labels: string[]) => Promise<{ label: string; score: number }[]>;

const templateFor = (label: string, template: string): string => template.replace('{label}', label);

const sharedClassifiers = new Map<string, ZeroShotClassifier>();

/** One instance per model: weights load once and are shared. */
export function sharedZeroShotClassifier(model = DEFAULT_ZEROSHOT_MODEL, dtype: 'q8' | 'fp32' = 'q8', onProgress?: ProgressCallback): ZeroShotClassifier {
  const key = `${model}|${dtype}`;
  const existing = sharedClassifiers.get(key);
  if (existing) return existing;
  const created = createZeroShotClassifier(model, dtype, 'This text is about {label}.', onProgress);
  sharedClassifiers.set(key, created);
  return created;
}

export function rankEntailments(entailments: { label: string; score: number }[]): { label: string; score: number }[] {
  return [...entailments].sort((first, second) => second.score - first.score);
}

export function createZeroShotClassifier(
  model = DEFAULT_ZEROSHOT_MODEL,
  dtype: 'q8' | 'fp32' = 'q8',
  template = 'This text is about {label}.',
  onProgress?: ProgressCallback,
): ZeroShotClassifier {
  // BART-MNLI's order, not the cross-encoder's, which is the whole reason label order is a parameter:
  // the worker hands back logits and this side knows which position means entailment.
  const entailIndex = ZEROSHOT_LABELS.indexOf('entailment');
  const entailmentFrom = (logits: number[]): number => {
    if (!logits.length) return 0;
    const peak = Math.max(...logits);
    const exps = logits.map(value => Math.exp(value - peak));
    const total = exps.reduce((sum, value) => sum + value, 0);
    return total > 0 ? exps[entailIndex] / total : 0;
  };
  const worker = onProgress ? undefined : localModelWorker();
  if (worker) return async (text, labels) => {
    if (!text.trim() || !labels.length) return [];
    const scored: { label: string; score: number }[] = [];
    for (const label of labels) {
      scored.push({ label, score: entailmentFrom(await worker.pairLogits(model, text, templateFor(label, template))) });
    }
    return rankEntailments(scored);
  };
  let ready: Promise<{
    tokenize: (text: string, hypothesis: string) => unknown;
    entailmentOf: (input: unknown) => Promise<number>;
  }> | undefined;
  const load = () => loadWithFallback(model, async dtype => {
    const { AutoTokenizer, AutoModelForSequenceClassification } = await import('@huggingface/transformers');
    const [tokenizer, classifier] = await Promise.all([
      AutoTokenizer.from_pretrained(model, progressOptions(onProgress)),
      AutoModelForSequenceClassification.from_pretrained(model, { dtype, ...progressOptions(onProgress) }),
    ]);
    return {
      tokenize: (text: string, hypothesis: string) => tokenizer(text, { text_pair: hypothesis, padding: true, truncation: true }),
      entailmentOf: async (input: unknown) => {
        const output = await classifier(input as never);
        const raw = (output.logits as { tolist(): number[] }).tolist();
        return entailmentFrom(Array.isArray(raw[0]) ? (raw as unknown as number[][])[0] : raw);
      },
    };
  });
  return async (text, labels) => {
    if (!text.trim() || !labels.length) return [];
    ready ||= load();
    const { tokenize, entailmentOf } = await ready;
    const scored: { label: string; score: number }[] = [];
    // One pair at a time, like the NLI scorer: chapters ask about a
    // handful of labels, not thousands.
    for (const label of labels) {
      scored.push({ label, score: await entailmentOf(tokenize(text, templateFor(label, template))) });
    }
    return rankEntailments(scored);
  };
}
