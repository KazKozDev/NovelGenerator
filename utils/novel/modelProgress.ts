/**
 * Shared plumbing for local Hugging Face models: download progress, the dtype fallback, and the
 * worker every opt-in model runs on.
 *
 * Every model factory accepts an optional onProgress callback and forwards
 * it as progress_callback to from_pretrained: first use downloads weights
 * (tens to hundreds of MB), so the UI can show a bar instead of silence.
 * The callback is best-effort — runtimes that never report still resolve.
 */
import type { ProgressCallback } from '@huggingface/transformers';
import type { LocalModelCall, LocalModelResponse } from './localModel.worker';

export type { ProgressCallback };

/** from_pretrained options shared by all local factories. */
export function progressOptions(onProgress?: ProgressCallback): { progress_callback?: ProgressCallback } {
  return onProgress ? { progress_callback: onProgress } : {};
}

/**
 * Quantized (q8/int8) ONNX exports occasionally ship with broken
 * quantization params — a missing scale aborts session creation with an
 * error like "Missing required scale ... for DequantizeLinear". The fp32
 * weights have no quantized nodes at all, so a q8 failure retries once in
 * fp32 before giving up. Both failing names the model, so the next error
 * says which download is at fault instead of dumping a graph-node ID.
 */
export async function loadWithFallback<T>(model: string, load: (dtype: 'q8' | 'fp32') => Promise<T>): Promise<T> {
  try {
    return await load('q8');
  } catch (q8Error) {
    try {
      return await load('fp32');
    } catch {
      throw new Error(`Failed to load local model ${model} (q8 and fp32): ${q8Error instanceof Error ? q8Error.message : String(q8Error)}`);
    }
  }
}

/**
 * The page's end of the local-model worker.
 *
 * One worker for every local model, created on first use and kept: the alternative is a thread per
 * checkpoint, each with its own copy of the runtime — three of them, half a megabyte each, before
 * these were brought together. Inference happens there and the numbers come back here, so every
 * label order, threshold and ranking rule stays in the module that owns it.
 *
 * A worker that dies takes its pending questions with it, and the caller sees a rejected promise —
 * which is what these checks already handle by staying quiet: an advisory scan that cannot be made
 * reports nothing and never touches the run.
 */
export interface LocalModelClient {
  pairLogits(model: string, text: string, pair: string, dtype?: 'q8' | 'fp32'): Promise<number[]>;
  textLogits(model: string, text: string): Promise<{ logits: number[]; labels: string[] }>;
  generate(model: string, text: string, maxNewTokens: number): Promise<string>;
  embed(model: string, inputs: string[]): Promise<number[][]>;
}

let client: LocalModelClient | undefined;
let announce: ((message: string) => void) | undefined;

/**
 * Where the worker's unsolicited lines go: which device a model ended up on, a GPU that refused one, a
 * model released for idleness. Set once by whoever owns the log; until then the lines go to the console,
 * which the terminal bridge forwards anyway.
 */
export function reportLocalModels(say: (message: string) => void): void {
  announce = say;
}

/** The client in a browser; undefined wherever there is no Worker, and the caller loads in-process. */
export function localModelWorker(): LocalModelClient | undefined {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return undefined;
  if (client) return client;
  let worker: Worker | undefined;
  let sequence = 0;
  const waiting = new Map<number, { resolve: (value: LocalModelResponse) => void; reject: (error: Error) => void }>();
  const ask = (request: LocalModelCall): Promise<LocalModelResponse> => new Promise((resolve, reject) => {
    if (!worker) {
      worker = new Worker(new URL('./localModel.worker.ts', import.meta.url), { type: 'module' });
      worker.addEventListener('message', (event: MessageEvent<LocalModelResponse>) => {
        // id 0 is the worker speaking for itself rather than answering.
        if (!event.data.id) {
          if (event.data.notice) (announce || ((line: string) => console.log(`[LocalModels] ${line}`)))(event.data.notice);
          // Nothing loaded and nothing pending: end it, and the next question builds a new one. This is
          // what actually gives the memory back — a disposed session still leaves the worker's heap.
          if (event.data.idle && !waiting.size && worker) {
            worker.terminate();
            worker = undefined;
          }
          return;
        }
        const pending = waiting.get(event.data.id);
        if (!pending) return;
        waiting.delete(event.data.id);
        if (event.data.error) pending.reject(new Error(event.data.error));
        else pending.resolve(event.data);
      });
      worker.addEventListener('error', () => {
        for (const pending of waiting.values()) pending.reject(new Error('The local model worker stopped.'));
        waiting.clear();
        worker = undefined;
      });
    }
    const id = ++sequence;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ ...request, id });
  });
  return (client = {
    async pairLogits(model, text, pair, dtype) {
      return (await ask({ task: 'pair-logits', model, text, pair, dtype })).logits || [];
    },
    async textLogits(model, text) {
      const answer = await ask({ task: 'text-logits', model, text });
      return { logits: answer.logits || [], labels: answer.labels || [] };
    },
    async generate(model, text, maxNewTokens) {
      return (await ask({ task: 'generate', model, text, maxNewTokens })).text || '';
    },
    async embed(model, inputs) {
      return (await ask({ task: 'embed', model, inputs })).vectors || [];
    },
  });
}
