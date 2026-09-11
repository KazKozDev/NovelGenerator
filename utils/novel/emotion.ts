/**
 * Emotion scoring for character emotional arcs.
 *
 * Character arcs are currently free text that no check reads. A GoEmotions
 * classifier (28 labels + neutral) turns each scene or chapter into numbers,
 * which makes two advisory metrics possible: does the chapter feel anything
 * at all (variety), and does a character's dominant emotion actually move
 * across chapters (arc travel — compare top emotions per chapter).
 *
 * Default checkpoint ships ONNX weights including an INT8 build
 * (SamLowe/roberta-base-go_emotions-onnx), so the browser download stays
 * small. Sequence-classification with sigmoid: emotions are multi-label, a
 * passage can carry anger AND disappointment at once.
 */
export interface EmotionScores {
  labels: string[];
  scores: number[];
}

export type EmotionScorer = (text: string) => Promise<EmotionScores>;

import type { ProgressCallback } from './modelProgress';
import { loadWithFallback, localModelWorker, progressOptions } from './modelProgress';

/** ONNX + INT8 builds available; override with any text-classification checkpoint. */
export const DEFAULT_EMOTION_MODEL = 'SamLowe/roberta-base-go_emotions-onnx';

export function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

export function createEmotionScorer(model = DEFAULT_EMOTION_MODEL, dtype: 'q8' | 'fp32' = 'q8', onProgress?: ProgressCallback): EmotionScorer {
  // Multi-label, so the squashing is a sigmoid and not a softmax — and it stays on this side.
  const named = (logits: number[], labels: string[]): EmotionScores => ({
    labels: labels.length === logits.length ? labels : logits.map((_, index) => `label_${index}`),
    scores: logits.map(sigmoid),
  });
  const worker = onProgress ? undefined : localModelWorker();
  if (worker) return async text => {
    const { logits, labels } = await worker.textLogits(model, text);
    return named(logits, labels);
  };
  let ready: Promise<{
    tokenize: (text: string) => unknown;
    classify: (input: unknown) => Promise<{ logits: number[]; labels: string[] }>;
  }> | undefined;
  const load = () => loadWithFallback(model, async dtype => {
    const { AutoTokenizer, AutoModelForSequenceClassification } = await import('@huggingface/transformers');
    const [tokenizer, classifier] = await Promise.all([
      AutoTokenizer.from_pretrained(model, progressOptions(onProgress)),
      AutoModelForSequenceClassification.from_pretrained(model, { dtype, ...progressOptions(onProgress) }),
    ]);
    const config = (classifier as unknown as { config?: { id2label?: Record<string, string> } }).config;
    const labels = config?.id2label
      ? Object.keys(config.id2label).sort((a, b) => Number(a) - Number(b)).map(key => config.id2label![key])
      : [];
    return {
      tokenize: (text: string) => tokenizer(text, { padding: true, truncation: true }),
      classify: async (input: unknown) => {
        const output = await classifier(input as never);
        const raw = (output.logits as { tolist(): number[] }).tolist();
        const logits = Array.isArray(raw[0]) ? (raw as unknown as number[][])[0] : raw;
        const names = labels.length === logits.length ? labels : logits.map((_, index) => `label_${index}`);
        return { logits, labels: names };
      },
    };
  });
  return async text => {
    ready ||= load();
    const { tokenize, classify } = await ready;
    const { logits, labels } = await classify(tokenize(text));
    return named(logits, labels);
  };
}

export function topEmotions(result: EmotionScores, count = 3): { label: string; score: number }[] {
  return result.labels
    .map((label, index) => ({ label, score: result.scores[index] ?? 0 }))
    .sort((first, second) => second.score - first.score)
    .slice(0, Math.max(0, count));
}

/**
 * Share of passages whose dominant emotion is felt (not neutral, >= 0.3).
 * A chapter at 0 is emotionally flat whatever the prose claims; the number
 * guides revision, it never blocks acceptance.
 */
export function dominantEmotion(result: EmotionScores): string {
  return topEmotions(result, 1)[0]?.label || 'neutral';
}

/**
 * Arc travel across chapters: the dominant emotion per chapter and whether
 * it ever moved. An arc that never travels is flat whatever the prose
 * claims; advisory, never blocking.
 */
export function arcTravel(chapters: EmotionScores[]): { dominant: string[]; traveled: boolean } {
  const dominant = chapters.map(dominantEmotion);
  return { dominant, traveled: new Set(dominant.map(label => label.toLowerCase())).size > 1 };
}

const sharedScorers = new Map<string, EmotionScorer>();

/** One instance per model: weights load once and are shared. */
export function sharedEmotionScorer(model = DEFAULT_EMOTION_MODEL, dtype: 'q8' | 'fp32' = 'q8', onProgress?: ProgressCallback): EmotionScorer {
  const key = `${model}|${dtype}`;
  const existing = sharedScorers.get(key);
  if (existing) return existing;
  const created = createEmotionScorer(model, dtype, onProgress);
  sharedScorers.set(key, created);
  return created;
}

export function emotionVariety(passages: EmotionScores[], floor = 0.3): number {
  if (!passages.length) return 0;
  const felt = passages.filter(result => {
    const top = topEmotions(result, 1)[0];
    return top !== undefined && top.label.toLowerCase() !== 'neutral' && top.score >= floor;
  }).length;
  return felt / passages.length;
}
