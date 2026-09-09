/**
 * Headless full-pipeline novel run.
 * Usage: node scripts/run-novel.mjs --premise-file p.txt --chapters 6 --out runs/test6 [--words 4000]
 *        node scripts/run-novel.mjs --resume runs/test6
 * Writes runs/<dir>/checkpoint.json after every engine transaction, plus a live log.
 */
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const arg = name => { const i = argv.indexOf(`--${name}`); return i === -1 ? undefined : argv[i + 1]; };

const outDir = path.resolve(arg('out') || arg('resume') || 'runs/run');
await mkdir(outDir, { recursive: true });
const checkpointPath = path.join(outDir, 'checkpoint.json');
const logPath = path.join(outDir, 'run.log');
const callDir = path.join(outDir, 'calls');
await mkdir(callDir, { recursive: true });

const log = (message, details = '') => {
  const line = `${new Date().toISOString()} ${message}${details ? ` ${details}` : ''}`;
  console.log(line);
  appendFileSync(logPath, line + '\n');
};

/** Atomic file checkpoint: a crash mid-write must never destroy the previous manuscript. */
class FileRunStore {
  async load() {
    try { return JSON.parse(await readFile(checkpointPath, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  }
  async save(run) {
    const temporary = `${checkpointPath}.tmp`;
    await writeFile(temporary, JSON.stringify(run));
    await rename(temporary, checkpointPath);
  }
  async clear() { await writeFile(checkpointPath, ''); }
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { createBookSpec } = await server.ssrLoadModule('/utils/novel/contracts.ts');
  const { createRun, NovelEngine } = await server.ssrLoadModule('/utils/novel/engine.ts');
  const { generateText } = await server.ssrLoadModule('/services/llmService.ts');
  const { embedOllama } = await server.ssrLoadModule('/services/ollamaService.ts');

  const store = new FileRunStore();
  let run = await store.load();

  const writer = { provider: 'ollama', ollamaEndpoint: arg('endpoint') || 'http://127.0.0.1:11434', ollamaModel: arg('writer') || 'qwen3.5:397b-cloud' };
  // Thinking is enabled for judgement only: reasoning models answer trivially without it, and Ollama
  // returns their reasoning in a separate field that never reaches the manuscript.
  const validator = { provider: 'ollama', ollamaEndpoint: writer.ollamaEndpoint, ollamaModel: arg('validator') || 'mistral-large-3:675b-cloud', think: true };

  if (!run) {
    const premiseFile = arg('premise-file');
    if (!premiseFile) throw new Error('A new run needs --premise-file.');
    const premise = (await readFile(premiseFile, 'utf8')).trim();
    const spec = createBookSpec(premise, Number(arg('chapters') || 6), {
      genre: arg('genre') || 'psychological thriller', narrativeVoice: 'third-limited', tone: 'unsettling',
      targetAudience: 'adult', writingStyle: 'literary', generationSpeedMode: 'quality',
      language: arg('language') || 'Russian', tense: 'past', ending: 'closed',
      targetWordsPerChapter: Number(arg('words') || 4000),
    });
    run = createRun(spec, writer);
    log(`NEW RUN ${run.id} chapters=${spec.chapterCount} words=${spec.targetWordsPerChapter}`);
  } else {
    log(`RESUME ${run.id} stage=${run.stage}`);
  }
  // The writer model must never be the validator model: prose and contract-checking are separate roles.
  run.provider = writer;
  run.validationProvider = validator;
  await store.save(run);
  log(`writer=${writer.ollamaModel} validator=${validator.ollamaModel}`);

  let calls = 0;
  const llm = async (prompt, system, options = {}) => {
    const route = options.route === 'validator' ? 'validator' : 'writer';
    const provider = route === 'validator' ? run.validationProvider : run.provider;
    const start = Date.now();
    const id = ++calls;
    log(`CALL#${id} ${route}/${provider.ollamaModel} in=${prompt.length + system.length}ch json=${Boolean(options.json || options.schema)}`, `:: ${system.slice(0, 70)}`);
    let result = '';
    let success = false;
    try {
      result = await generateText(prompt, system, options.schema, options.temperature ?? 0.4, undefined, undefined, provider, options.maxTokens, options.json);
      success = true;
      return result;
    } finally {
      // Keep every raw response: a contract failure is only diagnosable against what the model actually returned.
      await writeFile(path.join(callDir, `${String(id).padStart(4, '0')}-${route}.txt`), `SYSTEM: ${system}\n\nPROMPT:\n${prompt}\n\n---OUTPUT---\n${result}`).catch(() => {});
      const seconds = ((Date.now() - start) / 1000).toFixed(1);
      log(`CALL#${id} ${success ? 'ok' : 'FAILED'} ${seconds}s out=${result.length}ch (~${result.split(/\s+/).filter(Boolean).length}w)`);
      run.calls ||= [];
      run.calls.push({ purpose: system, durationMs: Date.now() - start, inputCharacters: prompt.length + system.length, outputCharacters: result.length, success });
    }
  };

  // Report mode: measured prose texture is logged, never blocks a chapter.
  const embeddingModel = arg('embed') ?? 'qwen3-embedding:4b';
  const embed = embeddingModel === 'off' ? undefined
    : async inputs => embedOllama(inputs, embeddingModel, writer.ollamaEndpoint);
  log(`embeddings=${embeddingModel}`);

  const reported = new Set();
  let lastStage = '';
  const engine = new NovelEngine(llm, store, state => {
    const accepted = state.chapters.filter(chapter => chapter.acceptedRevision !== undefined && chapter.candidateRevision === undefined).length;
    const drafted = state.chapters.reduce((total, chapter) => total + (chapter.sceneDrafts?.length || 0), 0);
    const words = state.chapters.reduce((total, chapter) => {
      const version = chapter.versions.find(item => item.revision === chapter.acceptedRevision);
      return total + (version ? version.content.split(/\s+/).filter(Boolean).length : 0);
    }, 0);
    const stage = `${state.stage} chapters=${state.chapters.length} accepted=${accepted} scenes=${drafted} words=${words}`;
    if (stage !== lastStage) { lastStage = stage; log(`STATE ${stage}`); }
    for (const chapter of state.chapters) {
      for (const version of chapter.versions) {
        const key = `${chapter.number}.${version.revision}`;
        if (!version.prosody || version.prosody.checkedRevision !== version.revision || reported.has(key)) continue;
        reported.add(key);
        const m = version.prosody.metrics;
        const number = value => value === undefined ? 'n/a' : value.toFixed(1);
        log(`PROSODY ch${chapter.number} rev${version.revision}`,
          `words=${m.words} paragraphs=${m.paragraphs} median=${m.medianParagraphWords}w longest=${m.longestParagraphWords}w ` +
          `dialogue=${Math.round(m.dialogueShare * 100)}% similes/1k=${number(m.similesPer1000)} stacked/1k=${number(m.stackedAdjectivesPer1000)} ` +
          `repetition=${version.prosody.repetitionChecked ? 'checked' : 'not checked'}${version.prosody.error ? ` error=${version.prosody.error}` : ''} ` +
          `advisory=[${version.prosody.findings.map(issue => issue.id).join(', ') || 'none'}]`);
        for (const issue of version.prosody.findings) log(`  · ${issue.id}: ${issue.description}`);
      }
    }
  }, embed);

  if (!run.outline.trim()) { log('STAGE outline'); await engine.outline(run); }
  await engine.continue(run);

  log(`COMPLETE stage=${run.stage} title=${run.title || '-'}`);
  const { compileBook, metadata } = await server.ssrLoadModule('/utils/novel/presentation.ts');
  await writeFile(path.join(outDir, 'book.md'), compileBook(run));
  await writeFile(path.join(outDir, 'metadata.json'), metadata(run));
  log(`Saved book.md and metadata.json to ${outDir}`);
} catch (error) {
  log(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally { await server.close(); }
