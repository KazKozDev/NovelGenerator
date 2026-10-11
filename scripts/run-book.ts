import { allocateThesisWords, renderThesisBook } from '../utils/novel/v2/theses';
/**
 * Test-run driver: drives the v2 pipeline with real models from a terminal,
 * logging every model call to stdout and a file. Run with:
 *
 *   npx vite-node scripts/run-book.ts --writer deepseek-v4.1-flash:cloud \
 *     --editor gemini-3.6-flash --chapters 4 \
 *     --premise "<the premise to write from>" \
 *     --out runs/manual-test
 *
 * --provider gemini uses the Gemini transport instead, with --writer/--editor
 * as model names and GEMINI_API_KEY from the environment or .env.local.
 * The editor defaults to Qwen via QWEN_API_KEY and QWEN_BASE_URL; --editor-provider anthropic asks Claude
 * instead, with ANTHROPIC_API_KEY from the same two places.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { budgetFor, Orchestrator } from '../utils/novel/v2/orchestrator';
import { ChapterPipelineV2 } from '../utils/novel/v2/pipeline';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { restoreSnapshot, snapshotProject } from '../utils/novel/v2/export';
import { setGateModeOverride } from '../utils/novel/v2/semanticGate';
import { generateOllamaText } from '../services/ollamaService';
import { generateGeminiText } from '../services/geminiService';
import { generateAnthropicText } from '../services/anthropicService';
import { generateQwenText } from '../services/qwenService';
import { inputKey } from '../utils/novel/v2/progressive';
import type { NovelLLM } from '../utils/novel/v2/llm';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const provider = arg('provider', 'ollama');
// The two roles may sit with different providers: a writer on Ollama and an
// editor on Gemini is one command line, not two runners.
const writerProvider = arg('writer-provider', provider);
const editorProvider = arg('editor-provider', 'qwen');
const endpoint = arg('endpoint', 'http://127.0.0.1:11434');
const writerModel = arg('writer', writerProvider === 'gemini' ? 'gemini-3.6-flash' : 'deepseek-v4.1-flash:cloud');
const editorModel = arg('editor', editorProvider === 'qwen' ? 'qwen3.8-flash' : editorProvider === 'anthropic' ? 'claude-haiku-5-5' : editorProvider === 'gemini' ? 'gemini-3.6-flash' : 'nemotron-3-ultra:cloud');
// A second writer is optional: --writer2 <model> [--writer2-provider <provider>] drafts every scene twice.
const writer2Model = arg('writer2', '');
const writer2Provider = arg('writer2-provider', writerProvider);
const chapters = Number(arg('chapters', '4'));
const premise = arg('premise', '');
if (!premise.trim()) {
  console.error('A premise is required: pass --premise "<the premise to write from>".');
  process.exit(1);
}
const genre = arg('genre', 'fantasy');
const authorRequirements = arg('author-requirements', '');
const wordsPerChapter = Number(arg('words-per-chapter', '0'));
const totalWords = wordsPerChapter ? wordsPerChapter * chapters : Number(arg('words', '8000'));
if (wordsPerChapter && (!Number.isSafeInteger(wordsPerChapter) || wordsPerChapter < 1)) throw new Error('Invalid words per chapter');
const outDir = arg('out', 'runs/manual-test');
const resumePath = arg('resume', '');
const conceptCandidatesPath = arg('concept-candidates', '');
const replayDir = arg('replay-calls', '');
const replayUntil = Number(arg('replay-until', '0'));
// The local models, the way the application runs them: about 780MB the first
// time, cached by the runtime after that. Not a flag — a script has nowhere to
// record a choice, so it says so here once, and says it the same way every run.
setGateModeOverride('full');
// The budget the application gives a book of this length, unless the run names
// its own.
const maxCalls = Number(arg('max-calls', String(budgetFor(chapters,{generation_mode:'progressive',target_total_words:totalWords}).maxCalls)));
const maxMinutes = Number(arg('max-minutes', String(budgetFor(chapters,{generation_mode:'progressive',target_total_words:totalWords}).maxTimeMs / 60000)));

mkdirSync(outDir, { recursive: true });
const logFile = join(outDir, 'run.log');
const callsDir = join(outDir, 'calls');
mkdirSync(callsDir, { recursive: true });
function log(line: string): void {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  appendFileSync(logFile, `${stamped}\n`);
}

async function main(): Promise<void> {
  log(`writer=${writerProvider}:${writerModel} editor=${editorProvider}:${editorModel} endpoint=${endpoint} gate=full`);
  log(`budget calls=${maxCalls} minutes=${maxMinutes}`);
  log(`book chapters=${chapters} genre=${genre} words=${totalWords} premise=${premise}`);
  const store = new MemoryProjectStore();
  if (resumePath) {
    const snapshot = JSON.parse(readFileSync(resumePath, 'utf8'));
    const saved = snapshot.files?.input;
    if (saved && wordsPerChapter) {
      saved.target_total_words = totalWords;
      const theses = snapshot.files.thesis_draft;
      if (theses) {
        theses.input_key = inputKey(saved);
        if (theses.plan) { theses.plan=allocateThesisWords(theses.plan,saved); theses.plan_ready=false; theses.rounds=[]; }
      }
      log(`WORD TARGET from main page: ${wordsPerChapter} per chapter, ${totalWords} total.`);
    }
    if (!saved || saved.premise !== premise || saved.chapter_count !== chapters ||
        saved.genre !== genre || saved.target_total_words !== totalWords) {
      throw new Error('Resume snapshot does not match the requested book.');
    }
    restoreSnapshot(store, snapshot);
    log(`RESUME ${resumePath}: ${store.manuscript().length} finished chapter(s) kept.`);
  }
  let calls = 0;
  // Transport retries: the Ollama Cloud relay flaps (instant 502s mixed with
  // healthy stretches). A dead relay is retried with backoff instead of failing
  // the book — model-level refusals and validation errors still throw at once.
  const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
  const transportFailed = (error: unknown): boolean =>
    /502|500|context canceled|ECONNREFUSED|ETIMEDOUT|aborted|abort|fetch failed|deadline|15 minute|network|socket hang up|ENOTFOUND|EAI_AGAIN/i.test(
      error instanceof Error ? error.message : String(error));
  let loggedEntries = store.runLog().length;
  // The book on disk as it is written, not once at the end. A run that was
  // stopped in its third chapter used to leave a log and nothing to read: the
  // manuscript and the snapshot were written after the last call, so every
  // chapter already finished went with the process. Now each accepted scene
  // lands in manuscript.md — finished chapters as they shipped, the chapter in
  // progress as the scenes it has so far — with the snapshot beside it.
  let written = '';
  const writeBook = (): void => {
    const finished = new Map(store.manuscript().map(item => [item.chapter, item.text]));
    const parts: string[] = [];
    const draft = store.loadProgressive();
    const theses = store.loadTheses();
    if (theses) writeFileSync(join(outDir, 'thesis-book.md'), renderThesisBook(theses));
    const label = theses ? `# ${theses.plan?.title || 'Book'}${theses.completed ? '' : ' (blocks in progress)'}\n\n` : draft ? `# Whole-book draft: ${draft.versions.at(-1)?.pass || 'plan'}${draft.completed ? '' : ' (development in progress)'}\n\n` : '';
    let signature = label;
    for (let chapter = 1; chapter <= chapters; chapter++) {
      const done = finished.get(chapter);
      const scenes = done === undefined ? store.chapterScenes(chapter).filter(record => record.prose.trim()) : [];
      if (done === undefined && !scenes.length) continue;
      const text = done ?? scenes.map(record => record.prose).join('\n\n***\n\n');
      parts.push(`## Chapter ${chapter}${done === undefined ? ` (in progress: ${scenes.length} scene(s) written)` : ''}\n\n${text}`);
      signature += `${chapter}:${text};`;
    }
    if (!parts.length || signature === written) return;
    written = signature;
    writeFileSync(join(outDir, 'manuscript.md'), label + parts.join('\n\n'));
    writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify(snapshotProject(store), null, 2));
  };
  const flushStoreLog = (): void => {
    const entries = store.runLog();
    for (const entry of entries.slice(loggedEntries)) log(`  [${entry.stage}] ${entry.detail}`);
    loggedEntries = entries.length;
    writeBook();
    if (store.loadDesign() || store.loadProgressive() || store.loadTheses()) writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify(snapshotProject(store), null, 2));
  };
  const llm: NovelLLM = async (prompt, system, options) => {
    flushStoreLog();
    calls++;
    if (replayDir && calls <= replayUntil) {
      const callId = String(calls).padStart(3, '0');
      const recordedPrompt = readFileSync(join(replayDir, `${callId}-prompt.txt`), 'utf8');
      if (recordedPrompt !== prompt) throw new Error(`Replay prompt mismatch at call ${calls}; refusing to reuse a different request.`);
      const replay = readFileSync(join(replayDir, `${callId}-response.txt`), 'utf8');
      log(`REPLAY#${calls} stage=${options?.stage} from ${replayDir}; validation runs anew.`);
      writeFileSync(join(callsDir, `${callId}-prompt.txt`), prompt);
      writeFileSync(join(callsDir, `${callId}-response.txt`), replay);
      return replay;
    }
    if (conceptCandidatesPath && options?.stage === 'design') {
      const replay = readFileSync(conceptCandidatesPath, 'utf8');
      log(`REPLAY#${calls} design candidates from ${conceptCandidatesPath}; selection and all gates run anew.`);
      writeFileSync(join(callsDir, `${String(calls).padStart(3, '0')}-prompt.txt`), prompt);
      writeFileSync(join(callsDir, `${String(calls).padStart(3, '0')}-response.txt`), replay);
      return replay;
    }
    const second = options?.route === 'writer2' && !!writer2Model;
    const model = second ? writer2Model : options?.route === 'writer' || options?.route === 'writer2' ? writerModel : editorModel;
    const via = second ? writer2Provider : options?.route === 'writer' || options?.route === 'writer2' ? writerProvider : editorProvider;
    log(`CALL#${calls} stage=${options?.stage || 'unlabelled'} route=${options?.route || 'validator'} model=${model}${options?.deliberate ? ' deliberate' : ''} prompt=${prompt.length}ch`);
    const callId = String(calls).padStart(3, '0');
    writeFileSync(join(callsDir, `${callId}-prompt.txt`), prompt);
    const started = Date.now();
    let incompleteRetries = 0;
    let outputTokens = options?.maxTokens ?? 16384;
    let streamed = '';
    let lastStreamLog = 0;
    for (let attempt = 1; ; attempt++) {
      try {
        const result = via === 'qwen'
          ? await generateQwenText(prompt, system, outputTokens, model, options?.temperature ?? 0.2, metadata => log(`QWEN#${calls} attempt=${attempt} ${JSON.stringify(metadata)}`), options?.schema)
          : via === 'anthropic'
          ? await generateAnthropicText(prompt, system, options?.maxTokens ?? 16384, model, Boolean(options?.deliberate))
          : via === 'gemini'
          ? await generateGeminiText(prompt, system, options?.schema, options?.temperature ?? 0.2,
            undefined, undefined, options?.maxTokens ?? 16384, Boolean(options?.json), model, Boolean(options?.deliberate))
          : await generateOllamaText(
            prompt, system, undefined, options?.temperature ?? 0.2,
            model, endpoint, outputTokens,
            undefined, undefined, chunk => {
              streamed += chunk;
              writeFileSync(join(callsDir, `${callId}-partial.txt`), streamed);
              if (Date.now() - lastStreamLog >= 10000) {
                log(`STREAM#${calls} attempt=${attempt} received=${streamed.length}ch elapsed=${Math.round((Date.now() - started) / 1000)}s`);
                lastStreamLog = Date.now();
              }
            }, metadata => log(`OLLAMA#${calls} attempt=${attempt} requested_tokens=${outputTokens} ${JSON.stringify(metadata)}`),
          );
        writeFileSync(join(callsDir, `${callId}-response.txt`), result);
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
        if (via === 'ollama' && /token limit|without a completion record/.test(message) && incompleteRetries++ < 1) {
          if (/token limit/.test(message)) outputTokens *= 2;
          log(`RETRY#${calls} incomplete response: ${message}; output_tokens=${outputTokens}`);
          streamed = '';
          lastStreamLog = 0;
          continue;
        }
        if (!transportFailed(error) || attempt >= 30) {
          log(`FAIL#${calls} attempt=${attempt} ${message}`);
          throw error;
        }
        log(`RETRY#${calls} attempt=${attempt} transport down (${message.slice(0, 90)}), sleeping 45s`);
        streamed = '';
        lastStreamLog = 0;
        await sleep(45000);
      }
    }
  };
  // What this writer model repeated in earlier books, kept beside the runs.
  const memoryFile = (name: string, empty: unknown = []) => {
    const file = join('habits', name.replace(/[^\w.-]+/g, '_') + '.json');
    return {
      load: () => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return empty; } },
      save: (value: unknown) => { mkdirSync('habits', { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2)); },
    };
  };
  const habitMemory = memoryFile(`${writerProvider}-${writerModel}`);
  const orchestrator = new Orchestrator(store, { maxCalls, maxTimeMs: maxMinutes * 60 * 1000 }, new ChapterPipelineV2(),
    (stage, chapter) => log(`STAGE ${stage}${chapter ? ` ch${chapter}` : ''} calls=${calls}`), habitMemory, writer2Model ? { name: `${writer2Provider}:${writer2Model}`, habits: memoryFile(`${writer2Provider}-${writer2Model}`), record: memoryFile(`duel-${writerProvider}-${writerModel}--${writer2Provider}-${writer2Model}`, undefined) as any } : undefined);
  const result = await orchestrator.runBook({
    ...(store.loadInput()?{planning_version:store.loadInput()!.planning_version}:{planning_version:2 as const}),
    premise,
    chapter_count: chapters,
    genre,
    target_total_words: totalWords,
    author_requirements: authorRequirements || store.loadInput()?.author_requirements || '',
    generation_mode: store.loadInput()?.generation_mode || (store.loadProgressive() ? 'progressive' : store.loadDesign() ? 'chapters' : 'progressive'),
  }, llm);
  flushStoreLog();
  // Once more at the end whatever happened, so the files match the final state
  // even when the last thing the run did was fail.
  written = '';
  writeBook();
  writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify(snapshotProject(store), null, 2));
  log(`DONE status=${result.status} calls=${result.callsUsed} tokens~${result.tokensUsed}`);
  if (result.stoppedReason) log(`STOPPED: ${result.stoppedReason}`);
  if (result.status === 'FAILED') process.exit(1);
}

main().catch(error => {
  console.error(`FATAL: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
