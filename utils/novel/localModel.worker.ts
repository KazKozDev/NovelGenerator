/**
 * Every local model, on one thread that is not the page's.
 *
 * onnxruntime-web executes on whichever thread calls it, so a page that calls it stops painting — two
 * cross-encoder pairs held the main thread for 706ms and the first call for 35 seconds. The
 * cross-encoder was given a thread of its own, then the sentence embedder got a second one, and the
 * five opt-in checks — the contradiction scan, which runs claims × sentences forward passes per
 * accepted chapter and grows with the canon, the language watch, the genre check, the emotion scoring
 * and the summarizer — were still freezing the tab from the page.
 *
 * One worker for all seven. They are never needed at once, weights are hundreds of megabytes, and a
 * single thread makes them queue behind each other instead of contending for the same cores — while
 * the page keeps answering. Three threads also meant three copies of the runtime in the bundle, about
 * 500KB each. Models are cached here by family, name and precision, so whichever check asks second
 * pays no load at all.
 *
 * What crosses the wire is text one way and numbers the other. Every threshold, label order, softmax,
 * sigmoid and ranking rule stays in the module that owns it, where it is tested: this file must never
 * become the second place where a decision about an emotion or a contradiction is made.
 */
import { AutoModel, AutoModelForSeq2SeqLM, AutoModelForSequenceClassification, AutoTokenizer } from '@huggingface/transformers';
import { meanPool, normalize } from './localEmbedder';
import { loadWithFallback } from './modelProgress';

export type LocalModelTask = 'pair-logits' | 'text-logits' | 'generate' | 'embed';

/** The two backends this worker will use: the GPU when the browser has one, the CPU otherwise. */
type Device = 'webgpu' | 'wasm';

/**
 * One question for the worker. The id is added on the wire, so a union stays a union.
 *
 * `dtype` names a precision exactly, for the one caller that has a reason to: the cross-encoder's
 * thresholds were fitted per build, and the int8 model reads about a point below the full-precision
 * one. Left out, the loader tries int8 and falls back to fp32, which is what every other model wants.
 */
export type LocalModelCall =
  | { task: 'pair-logits'; model: string; text: string; pair: string; dtype?: 'q8' | 'fp32' }
  | { task: 'text-logits'; model: string; text: string; dtype?: 'q8' | 'fp32' }
  | { task: 'generate'; model: string; text: string; maxNewTokens: number; dtype?: 'q8' | 'fp32' }
  | { task: 'embed'; model: string; inputs: string[]; dtype?: 'q8' | 'fp32' };

export type LocalModelRequest = LocalModelCall & { id: number };

export interface LocalModelResponse {
  /** 0 for an unsolicited notice — where a model ended up running, or what it gave back. */
  id: number;
  notice?: string;
  /** The worker holds nothing and can be ended; it will be built again when something is asked. */
  idle?: boolean;
  logits?: number[];
  labels?: string[];
  text?: string;
  vectors?: number[][];
  error?: string;
}

interface Held {
  /** The session, so its memory can be given back; transformers.js exposes dispose() on models. */
  session: { dispose?: () => Promise<void> | void };
  where: string;
  lastUsed: number;
}
interface Classifier extends Held {
  kind: 'classifier';
  logitsOf: (text: string, pair?: string) => Promise<number[]>;
  labels: string[];
}
interface Generator extends Held {
  kind: 'generator';
  generate: (text: string, maxNewTokens: number) => Promise<string>;
}
interface Encoder extends Held {
  kind: 'encoder';
  embed: (inputs: string[]) => Promise<number[][]>;
}
type Loaded = Classifier | Generator | Encoder;

const loaded = new Map<string, Promise<Loaded>>();

/**
 * Where to run, and at what precision.
 *
 * The two are orthogonal and only one of them is safe to change on its own. Precision is part of what
 * a fitted threshold means — the int8 cross-encoder reads about a point below the full-precision one,
 * and 4.5 was fitted on int8 — so a caller that names a precision keeps it on every device. The device
 * is just arithmetic: the same weights on a GPU give the same answer sooner, and the page's CPU is left
 * alone entirely. So the GPU is tried first with the precision already chosen, and never with a larger
 * one: fp32 on the GPU would mean a 2.2GB download in place of 600MB, which is a decision for whoever
 * is paying for the bandwidth, not for this loader.
 *
 * Any failure falls through to wasm, which is where every measurement in this repository was taken.
 */
const hasGPU = (): boolean => typeof navigator !== 'undefined' && Boolean((navigator as { gpu?: unknown }).gpu);

/** An unsolicited line for the page's log: no id, so it answers nobody's question. */
const notice = (message: string): void => {
  (self as unknown as Worker).postMessage({ id: 0, notice: message } satisfies LocalModelResponse);
};

async function loadSomewhere<T>(model: string, dtype: 'q8' | 'fp32' | undefined, load: (device: Device, dtype: 'q8' | 'fp32') => Promise<T>): Promise<{ built: T; where: Device }> {
  const attempt = async (device: Device): Promise<{ built: T; where: Device }> => ({
    built: dtype ? await load(device, dtype) : await loadWithFallback(model, precision => load(device, precision)),
    where: device,
  });
  if (hasGPU()) {
    try {
      return await attempt('webgpu');
    } catch (gpuError) {
      notice(`${model} would not load on the GPU (${gpuError instanceof Error ? gpuError.message : String(gpuError)}); running it on the CPU instead`);
    }
  }
  return attempt('wasm');
}

/** A row of logits, whether the head returns one row or a batch of one. */
const firstRow = (raw: number[] | number[][]): number[] =>
  Array.isArray(raw[0]) ? (raw as number[][])[0] : (raw as number[]);

const loadClassifier = async (model: string, requested?: 'q8' | 'fp32'): Promise<Classifier> => {
  const { built, where } = await loadSomewhere(model, requested, async (device: Device, dtype) => {
  const [tokenizer, classifier] = await Promise.all([
    AutoTokenizer.from_pretrained(model),
    AutoModelForSequenceClassification.from_pretrained(model, { dtype, device }),
  ]);
  const config = (classifier as unknown as { config?: { id2label?: Record<string, string> } }).config;
  const labels = config?.id2label
    ? Object.keys(config.id2label).sort((a, b) => Number(a) - Number(b)).map(key => config.id2label![key])
    : [];
  return {
    labels,
    session: classifier as unknown as Classifier['session'],
    logitsOf: async (text: string, pair?: string) => {
      const input = tokenizer(text, { ...(pair === undefined ? {} : { text_pair: pair }), padding: true, truncation: true });
      const output = await classifier(input as never);
      return firstRow((output.logits as { tolist(): number[] | number[][] }).tolist());
    },
  };
  });
  return { kind: 'classifier', where, lastUsed: Date.now(), ...built };
};

const loadGenerator = async (model: string, requested?: 'q8' | 'fp32'): Promise<Generator> => {
  const { built, where } = await loadSomewhere(model, requested, async (device: Device, dtype) => {
  const [tokenizer, seq2seq] = await Promise.all([
    AutoTokenizer.from_pretrained(model),
    AutoModelForSeq2SeqLM.from_pretrained(model, { dtype, device }),
  ]);
  return {
    session: seq2seq as unknown as Generator['session'],
    generate: async (text: string, maxNewTokens: number) => {
      const input = tokenizer(text, { padding: true, truncation: true });
      const output = await (seq2seq as unknown as {
        generate(input: unknown, options: unknown): Promise<{ tolist(): number[][] }>;
      }).generate(input, { max_new_tokens: maxNewTokens });
      const decoded = (tokenizer as unknown as { batch_decode(ids: unknown[], options: unknown): string[] })
        .batch_decode([output.tolist()[0]], { skip_special_tokens: true });
      return decoded[0]?.trim() || '';
    },
  };
  });
  return { kind: 'generator', where, lastUsed: Date.now(), ...built };
};

/**
 * The sentence encoder. The pooling is imported rather than copied: two implementations of
 * mean-pooling would drift, and every cosine threshold in this system was fitted against that one.
 */
const loadEncoder = async (model: string, requested?: 'q8' | 'fp32'): Promise<Encoder> => {
  const { built, where } = await loadSomewhere(model, requested, async (device: Device, dtype) => {
  const [tokenizer, encoder] = await Promise.all([
    AutoTokenizer.from_pretrained(model),
    AutoModel.from_pretrained(model, { dtype, device }),
  ]);
  return {
    session: encoder as unknown as Encoder['session'],
    embed: async (inputs: string[]) => {
      const batch = tokenizer(inputs, { padding: true, truncation: true }) as never as {
        attention_mask: { tolist(): number[][] };
      };
      const output = await encoder(batch as never) as never as { last_hidden_state: { tolist(): number[][][] } };
      const hidden = output.last_hidden_state.tolist();
      if (hidden.length !== inputs.length) throw new Error('The local embedder returned a different number of vectors than inputs.');
      return meanPool(hidden, batch.attention_mask.tolist()).map(normalize);
    },
  };
  });
  return { kind: 'encoder', where, lastUsed: Date.now(), ...built };
};

/**
 * How long a model may sit loaded with nothing to do before it gives its memory back.
 *
 * The cross-encoder is 600MB resident and is asked about forty pairs per chapter, which takes under a
 * minute; the rest of the chapter — planning, writing, reviewing, all of it network — it holds that
 * memory for nothing, and a tab that has held it across three chapters is the one the browser offers to
 * close. Two minutes is longer than any gap inside a chapter's measurement and far shorter than a
 * chapter, so the model survives the work it was loaded for and is gone before the next one starts.
 *
 * The weights stay in the browser's cache, so loading again is a read from disk rather than a download.
 */
const IDLE_RELEASE_MS = 300_000;

/** One load per model and precision, whichever task asked for it first. */
function ready(task: LocalModelTask, model: string, dtype?: 'q8' | 'fp32'): Promise<Loaded> {
  const family = task === 'generate' ? 'generate' : task === 'embed' ? 'embed' : 'classify';
  const key = `${family}|${model}|${dtype || 'auto'}`;
  let pending = loaded.get(key);
  if (!pending) {
    pending = family === 'generate' ? loadGenerator(model, dtype)
      : family === 'embed' ? loadEncoder(model, dtype)
      : loadClassifier(model, dtype);
    loaded.set(key, pending);
    void pending.then(model_ => notice(`${model} is running on the ${model_.where === 'webgpu' ? 'GPU' : 'CPU'}`))
      .catch(() => { loaded.delete(key); }); // A load that failed is not a model anyone can reuse.
    sweepLater();
  }
  return pending;
}

let sweeping: ReturnType<typeof setInterval> | undefined;

/**
 * Models nobody has asked about for a while, released. When the last one goes the worker says so, and
 * the page ends it: the surest way to give back a wasm heap is to stop owning it.
 */
function sweepLater(): void {
  if (sweeping) return;
  sweeping = setInterval(() => {
    void (async () => {
      const now = Date.now();
      for (const [key, pending] of [...loaded]) {
        let held: Loaded;
        try { held = await pending; } catch { loaded.delete(key); continue; }
        if (now - held.lastUsed < IDLE_RELEASE_MS) continue;
        loaded.delete(key);
        try { await held.session.dispose?.(); } catch { /* a session that cannot be closed is still dropped */ }
        notice(`released an idle model after ${Math.round((now - held.lastUsed) / 1000)}s`);
      }
      if (!loaded.size && sweeping) {
        clearInterval(sweeping);
        sweeping = undefined;
        (self as unknown as Worker).postMessage({ id: 0, idle: true } satisfies LocalModelResponse);
      }
    })();
  }, 30_000);
}

self.addEventListener('message', async (event: MessageEvent<LocalModelRequest>) => {
  const request = event.data;
  try {
    const model = await ready(request.task, request.model, request.dtype);
    model.lastUsed = Date.now();
    if (request.task === 'embed') {
      if (model.kind !== 'encoder') throw new Error(`${request.model} is not an encoder.`);
      const vectors = request.inputs.length ? await model.embed(request.inputs) : [];
      (self as unknown as Worker).postMessage({ id: request.id, vectors } satisfies LocalModelResponse);
      return;
    }
    if (request.task === 'generate') {
      if (model.kind !== 'generator') throw new Error(`${request.model} is not a generative model.`);
      const text = await model.generate(request.text, request.maxNewTokens);
      (self as unknown as Worker).postMessage({ id: request.id, text } satisfies LocalModelResponse);
      return;
    }
    if (model.kind !== 'classifier') throw new Error(`${request.model} is not a classifier.`);
    const logits = await model.logitsOf(request.text, request.task === 'pair-logits' ? request.pair : undefined);
    model.lastUsed = Date.now(); // Stamped again on the way out: a long inference is not idle time.
    (self as unknown as Worker).postMessage({ id: request.id, logits, labels: model.labels } satisfies LocalModelResponse);
  } catch (error) {
    (self as unknown as Worker).postMessage({
      id: request.id, error: error instanceof Error ? error.message : String(error),
    } satisfies LocalModelResponse);
  }
});
