/**
 * The cross-encoder, on a thread of its own.
 *
 * onnxruntime-web executes on whichever thread calls it, and asking it to proxy into a worker did not
 * move it: timed inside the running application, two pairs held the main thread for 706ms and the
 * first call for 35 seconds, with a 50ms timer firing six times instead of seven hundred. A chapter
 * asks about forty pairs.
 *
 * So the model is loaded and run here instead, and the page only ever sends text and receives numbers.
 * Whatever the runtime blocks, it blocks this thread, where nothing is being drawn.
 */
import { AutoModelForSequenceClassification, AutoTokenizer } from '@huggingface/transformers';

type Request = { id: number; model: string; dtype: 'q8' | 'fp32'; pairs: [string, string][] };

let ready: Promise<{ tokenize: (current: string, earlier: string) => unknown; score: (input: unknown) => Promise<number> }> | undefined;

async function load(model: string, dtype: 'q8' | 'fp32') {
  const [tokenizer, sequence] = await Promise.all([
    AutoTokenizer.from_pretrained(model),
    AutoModelForSequenceClassification.from_pretrained(model, { dtype }),
  ]);
  return {
    tokenize: (current: string, earlier: string) => tokenizer(current, { text_pair: earlier, padding: true, truncation: true }),
    score: async (input: unknown) => Number((await sequence(input as never)).logits.data[0]),
  };
}

self.addEventListener('message', async (event: MessageEvent<Request>) => {
  const { id, model, dtype, pairs } = event.data;
  try {
    ready ||= load(model, dtype);
    const { tokenize, score } = await ready;
    const scores: number[] = [];
    // One pair at a time, as on the server: a batch would be padded to its longest paragraph, and a
    // chapter asks about one pair per paragraph.
    for (const [current, earlier] of pairs) scores.push(await score(tokenize(current, earlier)));
    (self as unknown as Worker).postMessage({ id, scores });
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
