/**
 * Local sentence embeddings via Hugging Face transformers.js.
 *
 * Why this exists: the repetition check only gets an embedder when the user
 * runs local Ollama (see repetitionTools in hooks/useBookGenerator.ts), so
 * cloud-provider users get no semantic repetition check at all. This module
 * is a concrete Embedder that runs on the reader's own machine with no
 * server, no key and no Ollama.
 *
 * Model choice: Xenova/all-MiniLM-L6-v2 (384 dims, ~90MB, q8 smaller) is
 * the browser standard for feature-extraction; the multilingual constant
 * covers Russian prose. Embeddings are NOT comparable across models: if the
 * model ID changes, every fitted cosine threshold must be recalibrated on
 * runs/ (see reranker.ts for how the current ones were fitted).
 */
import type { Embedder } from './prosody';
import type { ProgressCallback } from './modelProgress';
import { loadWithFallback, localModelWorker, progressOptions } from './modelProgress';

export const DEFAULT_LOCAL_EMBEDDER = 'Xenova/all-MiniLM-L6-v2';
export const MULTILINGUAL_LOCAL_EMBEDDER = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

/**
 * Mean-pool token vectors with the attention mask; padding never votes.
 *
 * The mask is typed here as numbers and is not always made of them. A tokenizer returns token ids and
 * their mask as int64, and tolist() on an int64 tensor yields BigInt: arithmetic between one of those
 * and a number throws `Cannot mix BigInt and other types`, which is how a live chapter lost its
 * repetition check at 08:31 after the very previous revision had run one. The values are 0 and 1, so
 * the conversion costs nothing and the failure it prevents cost a whole measurement.
 */
export function meanPool(hidden: number[][][], mask: number[][]): number[][] {
  return hidden.map((tokens, index) => {
    const dim = tokens[0]?.length ?? 0;
    const pooled = new Array<number>(dim).fill(0);
    let weight = 0;
    tokens.forEach((vector, token) => {
      const active = Number(mask[index]?.[token] ?? 0);
      if (!active) return;
      weight += active;
      for (let d = 0; d < dim; d++) pooled[d] += Number(vector[d]) * active;
    });
    return weight > 0 ? pooled.map(value => value / weight) : pooled;
  });
}

/** Unit length, so cosine similarity is a dot product downstream. */
export function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? vector.map(value => value / norm) : vector;
}

interface LoadedEncoder {
  // Loose structural types: the transformers.js classes arrive via dynamic
  // import so the browser bundle never pays for them until first use.
  tokenize: (inputs: string[]) => Promise<{ attention_mask: { tolist(): number[][] }; input_ids: unknown }>;
  encode: (batch: unknown) => Promise<{ last_hidden_state: { tolist(): number[][][] } }>;
}

/**
 * In a browser the model runs on the shared local-model worker, and the page exchanges paragraphs for
 * vectors.
 *
 * The same arrangement the cross-encoder needed, for the same measured reason: onnxruntime-web
 * executes on the thread that calls it, so a page that calls it stops answering. This embedder is not
 * an opt-in check — it is the default whenever the provider is not a local Ollama, which is every
 * cloud run — and it reads every paragraph of the chapter and of the chapters accepted before it, once
 * per revision. The cost grows with the book, and a tab that has embedded three chapters this way is
 * the one the browser offers to close.
 *
 * A worker that dies takes its pending questions with it, and the caller sees a rejected promise. The
 * repetition check then reports that it could not be made and the chapter is measured without it,
 * which is what happens on a run with no embedder at all — never a lost chapter.
 */
export function createLocalEmbedder(model = DEFAULT_LOCAL_EMBEDDER, dtype: 'q8' | 'fp32' = 'q8', onProgress?: ProgressCallback): Embedder {
  // A caller that wants the download reported keeps the page's own loader; nothing passes one today.
  const worker = onProgress ? undefined : localModelWorker();
  if (worker) return inputs => inputs.length ? worker.embed(model, inputs) : Promise.resolve([]);
  let ready: Promise<LoadedEncoder> | undefined;
  const load = (): Promise<LoadedEncoder> => loadWithFallback(model, async dtype => {
    const { AutoTokenizer, AutoModel } = await import('@huggingface/transformers');
    const [tokenizer, encoder] = await Promise.all([
      AutoTokenizer.from_pretrained(model, progressOptions(onProgress)),
      AutoModel.from_pretrained(model, { dtype, ...progressOptions(onProgress) }),
    ]);
    return {
      tokenize: async (inputs: string[]) => tokenizer(inputs, { padding: true, truncation: true }) as never,
      encode: async (batch: unknown) => encoder(batch as never) as never,
    };
  });
  return async inputs => {
    if (!inputs.length) return [];
    ready ||= load();
    const { tokenize, encode } = await ready;
    const batch = await tokenize(inputs);
    const output = await encode(batch);
    const hidden = output.last_hidden_state.tolist();
    const mask = batch.attention_mask.tolist();
    if (hidden.length !== inputs.length) throw new Error('The local embedder returned a different number of vectors than inputs.');
    return meanPool(hidden, mask).map(normalize);
  };
}

const shared = new Map<string, Embedder>();

/** One instance per model: the weights are large and every engine would otherwise download them again. */
export function sharedLocalEmbedder(model = DEFAULT_LOCAL_EMBEDDER, dtype: 'q8' | 'fp32' = 'q8'): Embedder {
  const key = `${model}|${dtype}`;
  const existing = shared.get(key);
  if (existing) return existing;
  const created = createLocalEmbedder(model, dtype);
  shared.set(key, created);
  return created;
}
