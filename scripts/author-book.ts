/**
 * Writes a book with the app's own author engine from a terminal, for reading the result.
 *
 *   npx vite-node scripts/author-book.ts --chapters 6 --words 2300 --genre mystery --premise "..." --out runs/book [--reader qwen3.8-max]
 */
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { writeBookOnce } from '../utils/novel/v3/author';
import { writeAtDesk } from '../utils/novel/v3/authorDesk';
import { generateOllamaText } from '../services/ollamaService';
import { generateQwenText } from '../services/qwenService';
import { labelHuggingFace } from '../services/hfLabelService';
import { HELPER_MODEL, type LabelRequest } from '../utils/novel/v3/envelope';

const arg = (name: string, fallback: string) => { const at = process.argv.indexOf(`--${name}`); return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback; };
const model = arg('model', 'deepseek-v4.1-flash:cloud'), endpoint = arg('endpoint', 'http://127.0.0.1:11434'), out = arg('out', 'runs/book');
// The reader may be another model: --reader qwen3.8-max goes to Qwen, any other name to Ollama; empty means the author's own.
const reader = arg('reader', '');
// The small model that sorts sentences for the engine, on Hugging Face.
const helper = arg('helper', HELPER_MODEL);
const chapters = Number(arg('chapters', '6')), words = Number(arg('words', '2300'));
const input = { planning_version: 2 as const, generation_mode: 'author' as const, premise: arg('premise', ''), chapter_count: chapters, genre: arg('genre', 'thriller'),
  target_total_words: chapters * words, author_requirements: arg('settings', 'Voice: third-limited. Tone: serious. Style: descriptive. Audience: adult. Tense: past. Ending: closed. Intimate scenes: on the page, not faded out.') };
if (!input.premise) throw new Error('--premise is required');
mkdirSync(out, { recursive: true });
const started = Date.now(); let calls = 0, sent = 0, got = 0;
const log = (line: string) => { console.log(line); appendFileSync(join(out, 'log.txt'), line + '\n'); };
const store = new MemoryProjectStore();
const flush = () => {
  const draft = store.loadAuthor(); if (!draft) return;
  // The book as it stood the first time every chapter had text: kept beside the final one, to see what going back did to it.
  if (draft.desk && !existsSync(join(out, 'first-draft')) && Array.from({ length: chapters }, (_, at) => draft.desk!.files[`chapter-${at + 1}.md`]).every(text => text?.trim())) {
    mkdirSync(join(out, 'first-draft'), { recursive: true });
    for (const [name, text] of Object.entries(draft.desk.files)) writeFileSync(join(out, 'first-draft', name), text);
    writeFileSync(join(out, 'first-draft', 'journal.md'), draft.desk.journal.join('\n'));
  }
  if (draft.desk) { for (const [name, text] of Object.entries(draft.desk.files)) writeFileSync(join(out, name), text); writeFileSync(join(out, 'journal.md'), draft.desk.journal.join('\n')); if (draft.desk.held) writeFileSync(join(out, 'held.json'), JSON.stringify({ things: draft.desk.things, held: draft.desk.held }, null, 1)); writeFileSync(join(out, 'answers.md'), draft.desk.answers.map(answer => `## ${answer.who}, step ${answer.step} ${answer.about}\n${answer.text}`).join('\n\n')); return; }
  writeFileSync(join(out, 'notebook.md'), draft.notebook || ''); writeFileSync(join(out, 'clock.md'), draft.clock); writeFileSync(join(out, 'plan.md'), draft.plan);
  draft.chapters.forEach((chapter, at) => writeFileSync(join(out, `chapter-${at + 1}.md`), chapter.text));
  writeFileSync(join(out, 'readers.md'), draft.chapters.map((chapter, at) => `## After chapter ${at + 1}\n${chapter.reader}`).join('\n\n'));
  writeFileSync(join(out, 'threads.md'), draft.threads || ''); writeFileSync(join(out, 'noticed.md'), draft.noticed.join('\n\n'));
};
(arg('engine', 'desk') === 'once' ? writeBookOnce : writeAtDesk)(input, store, async (prompt, system, options) => {
  if (options?.route === 'helper') { const request = JSON.parse(prompt) as LabelRequest; return JSON.stringify(await labelHuggingFace(helper, request.inputs, request.labels, request.template)); }
  calls++; sent += prompt.length + system.length; const at = Date.now();
  const other = options?.route === 'validator' && reader;
  const text = other && /^qwen/i.test(reader) ? await generateQwenText(prompt, system, options?.maxTokens, reader)
    : await generateOllamaText(prompt, system, undefined, options?.temperature ?? 0.8, other ? reader : model, endpoint, options?.maxTokens);
  got += text.length; const did = options?.stage === 'author-step' ? ` ${text.match(/^\**TOOL\**\s*:\**\s*(.*)$/mi)?.[1] || ''} ${text.match(/^\**(?:FILE|NAME)\**\s*:\**\s*(.*)$/mi)?.[1] || ''} — ${(text.match(/^\**THOUGHT\**\s*:\**\s*(.*)$/mi)?.[1] || '').slice(0, 230)}` : '';
  log(`[${calls}] ${options?.stage} ${Math.round((Date.now() - at) / 1000)}s sent ${Math.round(prompt.length / 1000)}K got ${text.split(/\s+/).length} words${did}`);
  if (options?.stage !== 'author-step') log('     ' + text.replace(/\s+/g, ' ').slice(0, 500));
  return text;
}, () => flush()).then(() => {
  flush();
  for (const entry of store.runLog()) if (entry.stage === 'author') appendFileSync(join(out, 'log.txt'), `  ${entry.detail.slice(0, 400)}\n`);
  const draft = store.loadAuthor()!;
  log(`FINISHED in ${Math.round((Date.now() - started) / 1000)}s. ${calls} calls, ${Math.round(sent / 1000)}K sent, ${Math.round(got / 1000)}K received. "${draft.title || 'untitled'}". Chapters: ${draft.chapters.map(chapter => chapter.text.split(/\s+/).length).join(', ')}. Readers noticed something after ${draft.noticed.length} of ${chapters}.`);
}).catch(error => { flush(); log(`STOPPED: ${error instanceof Error ? error.message : error}`); process.exit(1); });
