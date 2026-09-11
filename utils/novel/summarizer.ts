/**
 * Abstractive compression for the pipeline's longest prompts.
 *
 * The literary assessment prompt was measured at hundreds of thousands of
 * characters, most of it history quotations sent twice. This module is the
 * compression half: long ledgers and journals go in, short faithful
 * summaries come out. English-only checkpoint (distilbart-cnn); Russian
 * books skip it until a multilingual summarizer is fitted.
 *
 * Chunking is greedy on paragraph boundaries so no sentence is cut in
 * half; each chunk is summarized separately and the summaries concatenate.
 */
import type { ProgressCallback } from './modelProgress';
import { loadWithFallback, localModelWorker, progressOptions } from './modelProgress';

export const DEFAULT_SUMMARIZER_MODEL = 'Xenova/distilbart-cnn-6-6';

export type Summarizer = (text: string, maxNewTokens?: number) => Promise<string>;

/** Split text into chunks of at most maxChars on paragraph (then sentence) boundaries. */
export function chunkForSummary(text: string, maxChars = 3000): string[] {
  const paragraphs = text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
  const source = paragraphs.length ? paragraphs : [text.trim()].filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  const push = (piece: string) => {
    if (!piece) return;
    if ((current + '\n\n' + piece).trim().length <= maxChars || !current) {
      current = (current ? `${current}\n\n` : '') + piece;
      return;
    }
    chunks.push(current);
    current = piece;
  };
  for (const paragraph of source) {
    if (paragraph.length <= maxChars) {
      push(paragraph);
      continue;
    }
    // One oversized paragraph: fall back to sentence boundaries.
    for (const sentence of paragraph.split(/(?<=[.!?…])\s+/).map(item => item.trim()).filter(Boolean)) push(sentence);
  }
  if (current.trim()) chunks.push(current);
  return chunks.filter(chunk => chunk.trim().length > 0);
}

const sharedSummarizers = new Map<string, Summarizer>();

/** One instance per model: weights load once and are shared. */
export function sharedSummarizer(model = DEFAULT_SUMMARIZER_MODEL, dtype: 'q8' | 'fp32' = 'q8', onProgress?: ProgressCallback): Summarizer {
  const key = `${model}|${dtype}`;
  const existing = sharedSummarizers.get(key);
  if (existing) return existing;
  const created = createSummarizer(model, dtype, onProgress);
  sharedSummarizers.set(key, created);
  return created;
}

export function createSummarizer(
  model = DEFAULT_SUMMARIZER_MODEL,
  dtype: 'q8' | 'fp32' = 'q8',
  onProgress?: ProgressCallback,
): Summarizer {
  // The chunking stays here — it is what keeps a sentence from being cut in half — and the worker
  // only ever generates from a chunk that is already whole.
  const worker = onProgress ? undefined : localModelWorker();
  if (worker) return async (text, maxNewTokens = 256) => {
    if (!text.trim()) return '';
    const parts: string[] = [];
    for (const chunk of chunkForSummary(text)) parts.push(await worker.generate(model, chunk, maxNewTokens));
    return parts.filter(Boolean).join(' ');
  };
  let ready: Promise<{
    tokenize: (text: string) => unknown;
    generate: (input: unknown, maxNewTokens: number) => Promise<string>;
  }> | undefined;
  const load = () => loadWithFallback(model, async dtype => {
    const { AutoTokenizer, AutoModelForSeq2SeqLM } = await import('@huggingface/transformers');
    const [tokenizer, summarizer] = await Promise.all([
      AutoTokenizer.from_pretrained(model, progressOptions(onProgress)),
      AutoModelForSeq2SeqLM.from_pretrained(model, { dtype, ...progressOptions(onProgress) }),
    ]);
    return {
      tokenize: (text: string) => tokenizer(text, { padding: true, truncation: true }),
      generate: async (input: unknown, maxNewTokens: number) => {
        const output = await (summarizer as unknown as {
          generate(input: unknown, options: unknown): Promise<{ tolist(): number[][] }>;
        }).generate(input, { max_new_tokens: maxNewTokens });
        const ids = output.tolist()[0];
        const decoded = (tokenizer as unknown as { batch_decode(ids: unknown[], options: unknown): string[] }).batch_decode([ids], { skip_special_tokens: true });
        return decoded[0]?.trim() || '';
      },
    };
  });
  return async (text, maxNewTokens = 256) => {
    if (!text.trim()) return '';
    ready ||= load();
    const { tokenize, generate } = await ready;
    const parts: string[] = [];
    for (const chunk of chunkForSummary(text)) parts.push(await generate(tokenize(chunk), maxNewTokens));
    return parts.filter(Boolean).join(' ');
  };
}
