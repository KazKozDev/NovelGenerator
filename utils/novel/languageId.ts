/**
 * Language identification for RU/EN routing.
 *
 * The pipeline currently routes review/prosody rules on spec.language plus
 * script regexes; a real identifier settles mixed-language chapters and
 * catches a model answering in the wrong language. Returns the top label
 * with its score and leaves the decision to the caller.
 */
import type { ProgressCallback } from './modelProgress';
import { loadWithFallback, localModelWorker, progressOptions } from './modelProgress';

export const DEFAULT_LANGID_MODEL = 'onnx-community/language_detection-ONNX';

export interface LanguageGuess {
  label: string;
  score: number;
}

export type LanguageIdentifier = (text: string) => Promise<LanguageGuess>;

const ISO3_TO_ISO2: Record<string, string> = {
  eng: 'en', rus: 'ru', deu: 'de', fra: 'fr', spa: 'es', ita: 'it', zho: 'zh', jpn: 'ja', ara: 'ar',
};

const NAME_TO_ISO2: Record<string, string> = {
  english: 'en', russian: 'ru', german: 'de', french: 'fr', spanish: 'es', italian: 'it',
  английский: 'en', русский: 'ru',
};

/** Reduce a model label ('en', 'en_US', 'eng', 'English') to a 2-letter code. */
export function shortCode(label: string): string {
  const head = label.toLowerCase().split(/[_-]/)[0].trim();
  if (/^[a-z]{2}$/.test(head)) return head;
  if (ISO3_TO_ISO2[head]) return ISO3_TO_ISO2[head];
  if (NAME_TO_ISO2[head]) return NAME_TO_ISO2[head];
  return head;
}

/** True when the detected label and the requested story language agree. */
export function languageMatches(detectedLabel: string, storyLanguage: string): boolean {
  const story = storyLanguage.toLowerCase();
  const storyCode = /^[a-z]{2,3}$/.test(story) ? (story.length === 3 ? ISO3_TO_ISO2[story] || story : story) : NAME_TO_ISO2[story] || story;
  return shortCode(detectedLabel) === storyCode;
}

const sharedIdentifiers = new Map<string, LanguageIdentifier>();

/** One instance per model: weights load once and are shared. */
export function sharedLanguageIdentifier(model = DEFAULT_LANGID_MODEL, dtype: 'q8' | 'fp32' = 'q8', onProgress?: ProgressCallback): LanguageIdentifier {
  const key = `${model}|${dtype}`;
  const existing = sharedIdentifiers.get(key);
  if (existing) return existing;
  const created = createLanguageIdentifier(model, dtype, onProgress);
  sharedIdentifiers.set(key, created);
  return created;
}

export function createLanguageIdentifier(
  model = DEFAULT_LANGID_MODEL,
  dtype: 'q8' | 'fp32' = 'q8',
  onProgress?: ProgressCallback,
): LanguageIdentifier {
  // The top label and its softmax share, read from logits plus the checkpoint's own id2label.
  const guessFrom = (logits: number[], labels: string[]): LanguageGuess => {
    if (!logits.length) return { label: 'unknown', score: 0 };
    let best = 0;
    logits.forEach((value, index) => { if (value > logits[best]) best = index; });
    const peak = Math.max(...logits);
    const total = logits.reduce((sum, value) => sum + Math.exp(value - peak), 0);
    return { label: labels[best] || `label_${best}`, score: Math.exp(logits[best] - peak) / total };
  };
  const worker = onProgress ? undefined : localModelWorker();
  if (worker) return async text => {
    if (!text.trim()) return { label: 'unknown', score: 0 };
    const { logits, labels } = await worker.textLogits(model, text);
    return guessFrom(logits, labels);
  };
  let ready: Promise<{
    tokenize: (text: string) => unknown;
    topLabel: (input: unknown) => Promise<LanguageGuess>;
  }> | undefined;
  const load = () => loadWithFallback(model, async dtype => {
    const { AutoTokenizer, AutoModelForSequenceClassification } = await import('@huggingface/transformers');
    const [tokenizer, classifier] = await Promise.all([
      AutoTokenizer.from_pretrained(model, progressOptions(onProgress)),
      AutoModelForSequenceClassification.from_pretrained(model, { dtype, ...progressOptions(onProgress) }),
    ]);
    return {
      tokenize: (text: string) => tokenizer(text, { padding: true, truncation: true }),
      topLabel: async (input: unknown) => {
        const output = await classifier(input as never);
        const raw = (output.logits as { tolist(): number[] }).tolist();
        const logits = Array.isArray(raw[0]) ? (raw as unknown as number[][])[0] : raw;
        const config = (classifier as unknown as { config?: { id2label?: Record<string, string> } }).config;
        const labels = logits.map((_, index) => config?.id2label?.[String(index)] || `label_${index}`);
        return guessFrom(logits, labels);
      },
    };
  });
  return async text => {
    if (!text.trim()) return { label: 'unknown', score: 0 };
    ready ||= load();
    const { tokenize, topLabel } = await ready;
    return topLabel(tokenize(text));
  };
}
