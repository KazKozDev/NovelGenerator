/**
 * Write one chapter of an existing book again, leaving the rest as it stands.
 *
 *   npx vite-node scripts/rerun-chapter.ts --project path/to.project.json --chapter 4 \
 *     --writer deepseek-v4.1-flash:cloud --editor qwen3.5:397b-cloud --out runs/ch4
 *
 * The pipeline already knows how to resume: it skips any chapter the manuscript
 * holds and restarts an unfinished one from the previous chapter's state
 * snapshot. So a chapter is rewritten by restoring the project without it — its
 * manuscript, its scenes and its plan removed, everything earlier untouched —
 * and letting the run walk forward into the gap.
 *
 * What comes out is comparable to what went in: same design, same memory going
 * in, same models if you name the same ones. Only the checks have changed.
 * Chapters after the rewritten one are dropped too, because they were written
 * against prose that no longer exists.
 */
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { ChapterPipelineV2 } from '../utils/novel/v2/pipeline';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { restoreSnapshot, snapshotProject } from '../utils/novel/v2/export';
import { setGateModeOverride } from '../utils/novel/v2/semanticGate';
import { generateOllamaText } from '../services/ollamaService';
import { generateGeminiText } from '../services/geminiService';
import type { NovelLLM } from '../utils/novel/v2/llm';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const projectPath = arg('project', '');
const chapter = Number(arg('chapter', '0'));
if (!projectPath || !Number.isFinite(chapter) || chapter < 1) {
  console.error('Usage: --project <file.project.json> --chapter <n> [--out dir] [--writer m] [--editor m]');
  process.exit(1);
}
const provider = arg('provider', 'ollama');
const endpoint = arg('endpoint', 'http://127.0.0.1:11434');
const writerModel = arg('writer', 'deepseek-v4.1-flash:cloud');
const editorModel = arg('editor', 'qwen3.5:397b-cloud');
const outDir = arg('out', `runs/rerun-ch${chapter}`);
const maxCalls = Number(arg('max-calls', '120'));
setGateModeOverride('full');

mkdirSync(outDir, { recursive: true });
const logFile = join(outDir, 'run.log');
const log = (line: string): void => {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  appendFileSync(logFile, `${stamped}\n`);
};

const snapshot = JSON.parse(readFileSync(projectPath, 'utf8')) as { files: Record<string, unknown> };
const files = snapshot.files;

// Everything from this chapter on goes: the chapter itself is being rewritten,
// and what followed it was written against prose that will not exist any more.
const keptChapter = (value: unknown): boolean => typeof value === 'number' && value < chapter;
const drop = <T extends { chapter?: unknown }>(key: string): T[] => {
  const list = Array.isArray(files[key]) ? files[key] as T[] : [];
  const kept = list.filter(item => keptChapter(item.chapter));
  files[key] = kept;
  return kept;
};
const before = Array.isArray(files.manuscript) ? files.manuscript.length : 0;
const manuscript = drop<{ chapter: number; text: string }>('manuscript');
drop('scenes');
drop('scene_plans');
files.final_report = null;
log(`project=${projectPath} chapter=${chapter} kept ${manuscript.length} of ${before} chapters`);
log(`provider=${provider} writer=${writerModel} editor=${editorModel} gate=full`);

const store = new MemoryProjectStore();
restoreSnapshot(store, snapshot);

let calls = 0;
let logged = 0;
const flushStoreLog = (): void => {
  const entries = store.runLog();
  for (const entry of entries.slice(logged)) log(`  [${entry.stage}] ${entry.detail}`);
  logged = entries.length;
};
flushStoreLog();

const llm: NovelLLM = async (prompt, system, options) => {
  calls++;
  const model = options?.route === 'writer' ? writerModel : editorModel;
  log(`CALL#${calls} route=${options?.route || 'validator'} model=${model} prompt=${prompt.length}ch`);
  const started = Date.now();
  const result = provider === 'gemini'
    ? await generateGeminiText(prompt, system, options?.schema, options?.temperature ?? 0.2,
      undefined, undefined, options?.maxTokens ?? 16384, Boolean(options?.json), model)
    : await generateOllamaText(prompt, system, undefined, options?.temperature ?? 0.2,
      model, endpoint, options?.maxTokens ?? 16384);
  log(`OK#${calls} ${((Date.now() - started) / 1000).toFixed(0)}s answer=${result.length}ch`);
  if (result.length < 400) log(`BODY#${calls} ${JSON.stringify(result)}`);
  flushStoreLog();
  return result;
};

const input = store.loadInput()!;
const result = await new Orchestrator(store, { maxCalls, maxTimeMs: 60 * 60 * 1000 }, new ChapterPipelineV2(),
  (stage, at) => log(`STAGE ${stage}${at ? ` ch${at}` : ''} calls=${calls}`)).runBook(input, llm);

flushStoreLog();
log(`DONE status=${result.status} calls=${calls}`);
if (result.stoppedReason) log(`NOTES: ${result.stoppedReason}`);

writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify(snapshotProject(store), null, 2));
const rewritten = store.manuscript().find(item => item.chapter === chapter);
writeFileSync(join(outDir, `chapter-${chapter}.md`), rewritten?.text || '(nothing written)');
log(`chapter ${chapter} written to ${outDir}/chapter-${chapter}.md`);
