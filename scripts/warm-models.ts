/**
 * Fetch the two local models once, then stage them where the browser can
 * reach them.
 *
 *   npx vite-node scripts/warm-models.ts
 *
 * Loading each model in Node downloads its weights into the transformers.js
 * package cache, which is the only cache a script can use. The browser cannot
 * read that — it has no filesystem — so the same files are copied under
 * `public/models/`, which Vite serves, and `modelSource.ts` points the library
 * there. The application then loads about 780MB from localhost on first use instead
 * of from Hugging Face.
 *
 * Safe to re-run: already-downloaded weights are read from the cache, and the
 * copy overwrites. `public/models/` is git-ignored — a repository is not a CDN.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sharedReranker, defaultRerankerModel } from '../utils/novel/reranker';
import { sharedNLIScorer, DEFAULT_NLI_MODEL } from '../utils/novel/nli';

const CACHE = 'node_modules/@huggingface/transformers/.cache';
const PUBLIC = 'public/models';
const FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json'];

const started = Date.now();
const log = (line: string): void => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${line}`);
const megabytes = (path: string): string => `${(statSync(path).size / 1024 / 1024).toFixed(0)}MB`;

async function warm(): Promise<void> {
  log(`reranker ${defaultRerankerModel} …`);
  await sharedReranker()([['warm', 'warm']]);
  log(`NLI ${DEFAULT_NLI_MODEL} …`);
  await sharedNLIScorer()('The door is locked.', 'The door stands open.');
  log('both loaded');
}

function stage(model: string): void {
  const from = join(CACHE, model);
  if (!existsSync(from)) {
    log(`${model}: nothing in the cache to stage — it loaded remotely, or the cache moved`);
    return;
  }
  // Interrupted downloads leave partial files beside the real ones; copying
  // those would serve the browser a truncated model that fails at session
  // creation, with an error naming a graph node rather than the download.
  for (const name of readdirSync(join(from, 'onnx'))) {
    if (name.includes('.tmp.')) rmSync(join(from, 'onnx', name));
  }
  mkdirSync(join(PUBLIC, model, 'onnx'), { recursive: true });
  for (const file of FILES) {
    if (existsSync(join(from, file))) copyFileSync(join(from, file), join(PUBLIC, model, file));
  }
  const weights = join('onnx', 'model_quantized.onnx');
  if (!existsSync(join(from, weights))) {
    log(`${model}: no quantized weights in the cache; the browser will fetch this one remotely`);
    return;
  }
  copyFileSync(join(from, weights), join(PUBLIC, model, weights));
  log(`${model}: staged ${megabytes(join(PUBLIC, model, weights))}`);
}

await warm();
for (const model of [defaultRerankerModel, DEFAULT_NLI_MODEL]) stage(model);
log(`served from ${PUBLIC}/ — the application now loads them from localhost`);
