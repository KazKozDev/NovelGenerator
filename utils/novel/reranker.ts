/**
 * A cross-encoder second pass over the repetition check.
 *
 * An embedder compresses each paragraph on its own, so it cannot tell a scene that continues across
 * a chapter break from a scene told for the second time: both come out as two nearby points. Measured
 * over 525 cross-chapter pairs from the runs in runs/, the six pairs a reader judges repetitions sit
 * at ranks 1, 3, 4, 5, 8 and 9 under this model (1, 2, 4, 6, 9, 11 in full precision), against 1, 2,
 * 3, 21, 40 and 91 under the cosine — and one of them, a sentence carried whole into the next
 * chapter, sits at cosine 0.763, under every threshold the cosine could be given.
 */
import { localModelWorker, type LocalModelClient } from './modelProgress';

export type Reranker = (pairs: [string, string][]) => Promise<number[]>;

/**
 * Where the reading stops being ambiguous, in this build's own scale — the int8 model runs about a
 * point below the full-precision one, though the two rank the 525 pairs almost identically (0.974).
 *
 * The model scores how much two texts belong together, not whether one retells the other, so its
 * scale has a long shoulder of merely related passages: eight pairs read between 2.2 and 3.2 were a
 * shared motif every time — the same robe, the same window, the same light switch — and none of them
 * a repetition. At 4.5 the five pairs above the line are all repetitions, including two the cosine
 * cannot see at any threshold: a sentence carried whole into the next chapter at cosine 0.763, and
 * the same light switch clicked twice in the same figure of speech at 0.709. The pair just below the
 * line, at 4.49, is a motif. The margin is that narrow, and it is measured on one book.
 */
export const rerankRepetitionScore = 4.5;

/**
 * The cosine's job under a reranker is to pick which pair to ask about, not to decide. It keeps the
 * best match for each paragraph and lets anything plausibly related through; the decision is the
 * reranker's. A floor this low costs one scored pair per paragraph, about forty for a chapter.
 */
export const rerankCandidateFloor = 0.6;

/** Model and precision that keep the download to roughly 600MB rather than 2.2GB. */
export const defaultRerankerModel = 'onnx-community/bge-reranker-v2-m3-ONNX';

/**
 * The one local model that is on by default, and by far the heaviest: 600MB resident in the worker and
 * about a second of CPU per pair, some forty pairs a chapter. Anything but 'off' leaves it on, so the
 * default stays what it was — but it is a switch a reader can find now, because a tab that stops
 * answering wants exactly this one turned off first to see whether it was the cause.
 */
export const RERANK_STORAGE_KEY = 'novel-repetition-reranker';

/**
 * In a browser the model runs on the shared local-model worker, and the page exchanges text for
 * numbers. onnxruntime-web executes on the thread that calls it — measured in the running application,
 * two pairs held the main thread for 706ms and the first call for 35 seconds — and asking it to proxy
 * itself into a worker did not move it. Owning a thread is the only arrangement that does, and one
 * thread serves every local model rather than one each.
 *
 * The precision is named rather than negotiated: the thresholds above were fitted per build, and the
 * int8 model reads about a point below the full-precision one, so a silent fall back to fp32 would
 * move the line this check decides on. One pair at a time, as on the server: a batch would be padded
 * to its longest paragraph, and a chapter asks about one pair per paragraph.
 */
function browserReranker(model: string, dtype: 'q8' | 'fp32', worker: LocalModelClient): Reranker {
  return async pairs => {
    const scores: number[] = [];
    for (const [current, earlier] of pairs) {
      const logits = await worker.pairLogits(model, current, earlier, dtype);
      scores.push(logits[0] ?? 0);
    }
    return scores;
  };
}

/**
 * A reranker backed by transformers.js. The model is fetched on first use and cached by the runtime,
 * so a caller that never reaches the repetition check never downloads it.
 */
export function createReranker(model = defaultRerankerModel, dtype: 'q8' | 'fp32' = 'q8'): Reranker {
  const worker = localModelWorker();
  if (worker) return browserReranker(model, dtype, worker);
  let ready: Promise<{ tokenize: (current: string, earlier: string) => unknown; score: (input: unknown) => Promise<number> }> | undefined;
  const load = async () => {
    const { AutoTokenizer, AutoModelForSequenceClassification } = await import('@huggingface/transformers');
    const [tokenizer, sequence] = await Promise.all([
      AutoTokenizer.from_pretrained(model),
      AutoModelForSequenceClassification.from_pretrained(model, { dtype }),
    ]);
    return {
      tokenize: (current: string, earlier: string) => tokenizer(current, { text_pair: earlier, padding: true, truncation: true }),
      score: async (input: unknown) => Number((await sequence(input as never)).logits.data[0]),
    };
  };
  return async pairs => {
    if (!pairs.length) return [];
    ready ||= load();
    const { tokenize, score } = await ready;
    const scores: number[] = [];
    // One pair at a time: a batch would be padded to its longest paragraph, and a chapter asks about
    // one pair per paragraph — about forty — not forty thousand.
    for (const [current, earlier] of pairs) scores.push(await score(tokenize(current, earlier)));
    return scores;
  };
}

const shared = new Map<string, Reranker>();

/**
 * One instance per model. The weights are large and slow to load, and every engine the application
 * builds — a new one per action — would otherwise start its own download.
 */
export function sharedReranker(model = defaultRerankerModel, dtype: 'q8' | 'fp32' = 'q8'): Reranker {
  const key = `${model}|${dtype}`;
  const existing = shared.get(key);
  if (existing) return existing;
  const created = createReranker(model, dtype);
  shared.set(key, created);
  return created;
}
