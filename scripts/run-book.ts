/**
 * Test-run driver: drives the v2 pipeline with real models from a terminal,
 * logging every model call to stdout and a file. Run with:
 *
 *   npx vite-node scripts/run-book.ts --writer deepseek-v4.1-flash:cloud \
 *     --editor mistral-large-3:675b-cloud --chapters 4 \
 *     --premise "<the premise to write from>" \
 *     --out runs/manual-test
 *
 * --provider gemini uses the Gemini transport instead, with --writer/--editor
 * as model names and GEMINI_API_KEY from the environment or .env.local.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { ChapterPipelineV2 } from '../utils/novel/v2/pipeline';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { snapshotProject } from '../utils/novel/v2/export';
import { setGateModeOverride } from '../utils/novel/v2/semanticGate';
import { generateOllamaText } from '../services/ollamaService';
import { generateGeminiText } from '../services/geminiService';
import type { NovelLLM } from '../utils/novel/v2/llm';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const provider = arg('provider', 'ollama');
const endpoint = arg('endpoint', 'http://127.0.0.1:11434');
const writerModel = arg('writer', 'deepseek-v4.1-flash:cloud');
const editorModel = arg('editor', 'mistral-large-3:675b-cloud');
const chapters = Number(arg('chapters', '4'));
const premise = arg('premise', '');
if (!premise.trim()) {
  console.error('A premise is required: pass --premise "<the premise to write from>".');
  process.exit(1);
}
const genre = arg('genre', 'fantasy');
const totalWords = Number(arg('words', '8000'));
const outDir = arg('out', 'runs/manual-test');
// The local models, the way the application runs them: about 780MB the first
// time, cached by the runtime after that. Not a flag — a script has nowhere to
// record a choice, so it says so here once, and says it the same way every run.
setGateModeOverride('full');
// A longer book needs a longer leash than the in-app default: the budget is the
// run's own, not a property of the pipeline.
const maxCalls = Number(arg('max-calls', '200'));
const maxMinutes = Number(arg('max-minutes', '60'));

mkdirSync(outDir, { recursive: true });
const logFile = join(outDir, 'run.log');
function log(line: string): void {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  appendFileSync(logFile, `${stamped}\n`);
}

async function main(): Promise<void> {
  log(`provider=${provider} writer=${writerModel} editor=${editorModel}${provider === 'ollama' ? ` endpoint=${endpoint}` : ''} gate=full`);
  log(`budget calls=${maxCalls} minutes=${maxMinutes}`);
  log(`book chapters=${chapters} genre=${genre} words=${totalWords} premise=${premise}`);
  const store = new MemoryProjectStore();
  let calls = 0;
  // Transport retries: the Ollama Cloud relay flaps (instant 502s mixed with
  // healthy stretches). A dead relay is retried with backoff instead of failing
  // the book — model-level refusals and validation errors still throw at once.
  const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
  const transportFailed = (error: unknown): boolean =>
    /502|500|context canceled|ECONNREFUSED|ETIMEDOUT|aborted|abort|fetch failed|deadline|15 minute|network|socket hang up|ENOTFOUND|EAI_AGAIN/i.test(
      error instanceof Error ? error.message : String(error));
  let loggedEntries = 0;
  const flushStoreLog = (): void => {
    const entries = store.runLog();
    for (const entry of entries.slice(loggedEntries)) log(`  [${entry.stage}] ${entry.detail}`);
    loggedEntries = entries.length;
  };
  const llm: NovelLLM = async (prompt, system, options) => {
    calls++;
    const model = options?.route === 'writer' ? writerModel : editorModel;
    log(`CALL#${calls} route=${options?.route || 'validator'} model=${model} prompt=${prompt.length}ch`);
    const started = Date.now();
    for (let attempt = 1; ; attempt++) {
      try {
        const result = provider === 'gemini'
          ? await generateGeminiText(prompt, system, options?.schema, options?.temperature ?? 0.2,
            undefined, undefined, options?.maxTokens ?? 16384, Boolean(options?.json), model)
          : await generateOllamaText(
            prompt, system, undefined, options?.temperature ?? 0.2,
            model, endpoint, options?.maxTokens ?? 16384,
          );
        log(`OK#${calls} attempt=${attempt} ${((Date.now() - started) / 1000).toFixed(0)}s answer=${result.length}ch`);
        // An answer this short is never a book design or a scene, and "answer=35ch"
        // in the log tells you nothing about why. The body is what says whether the
        // model refused, hit a cap, or returned a shape the contract did not expect.
        if (result.length < 400) log(`BODY#${calls} ${JSON.stringify(result)}`);
        // The pipeline's own record — how many scenes were planned, which plans
        // the gate rejected before prose, what was repaired, what memory refused
        // — is the most informative thing in a run, and it was reaching the disk
        // only in the final snapshot. A run that dies never writes one, and a run
        // in progress could only be read by counting calls and guessing.
        flushStoreLog();
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!transportFailed(error) || attempt >= 30) {
          log(`FAIL#${calls} attempt=${attempt} ${message}`);
          throw error;
        }
        log(`RETRY#${calls} attempt=${attempt} transport down (${message.slice(0, 90)}), sleeping 45s`);
        await sleep(45000);
      }
    }
  };
  const orchestrator = new Orchestrator(store, { maxCalls, maxTimeMs: maxMinutes * 60 * 1000 }, new ChapterPipelineV2(),
    (stage, chapter) => log(`STAGE ${stage}${chapter ? ` ch${chapter}` : ''} calls=${calls}`));
  const result = await orchestrator.runBook({
    premise,
    chapter_count: chapters,
    genre,
    target_total_words: totalWords,
    author_requirements: '',
  }, llm);
  flushStoreLog();
  writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify(snapshotProject(store), null, 2));
  const manuscript = store.manuscript().map(m => `## Chapter ${m.chapter}\n\n${m.text}`).join('\n\n');
  writeFileSync(join(outDir, 'manuscript.md'), manuscript);
  log(`DONE status=${result.status} calls=${result.callsUsed} tokens~${result.tokensUsed}`);
  if (result.stoppedReason) log(`STOPPED: ${result.stoppedReason}`);
  if (result.status === 'FAILED') process.exit(1);
}

main().catch(error => {
  console.error(`FATAL: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
