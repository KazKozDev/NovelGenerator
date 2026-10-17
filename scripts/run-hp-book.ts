import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { generateOllamaText } from '../services/ollamaService';
import { generateCompatibleText } from '../services/compatibleService';
import type { NovelLLM } from '../utils/novel/v2/llm';
import type { ProjectInput } from '../utils/novel/v2/types';

import { bookFileName, ensureBookFolder } from '../services/bookStorageService';

const input: ProjectInput = {
  planning_version: 2,
  generation_mode: 'craft',
  title: 'Гарри Поттер и Тёмный Резонанс',
  premise: `In the shadowed aftermath of the Department of Mysteries, the psychic link between Harry Potter and Lord Voldemort mutates from violent intrusion into an intimate, magnetic resonance. Disillusioned by Dumbledore's evasions and the crushing expectations of the wizarding world, Harry finds himself drawn into nocturnal mental intrusions where cruelty gives way to an unsettling understanding. In secluded encounters across forgotten, warded ruins, an intense and forbidden obsession ignites between boy and Dark Lord—a psychological clash of shared trauma, power, and unspoken devotion that threatens to burn both sides of the war to ash.`,
  chapter_count: 5,
  genre: 'dark psychological fantasy / romance',
  target_total_words: 8750,
  author_requirements: 'Voice: third-limited. Tone: dark, psychological, intimate. Style: descriptive, visceral. Audience: adult. Tense: past. Ending: closed. Intimate scenes: on the page, restrained, intense.',
};

const bookTitle = input.title || 'Harry Potter - Resonance';
const { bookDir } = await ensureBookFolder(bookTitle);
const subfolders = {
  manuscripts: (await ensureBookFolder(bookTitle, 'manuscripts')).dir,
  reports: (await ensureBookFolder(bookTitle, 'reports')).dir,
  blueprints: (await ensureBookFolder(bookTitle, 'blueprints')).dir,
};
const outDir = bookDir;

const logFile = join(subfolders.reports, bookFileName('журнал запуска', 'log', false));
writeFileSync(logFile, '');
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(logFile, line + '\n');
}

writeFileSync(join(subfolders.blueprints, bookFileName('вход', 'json', false)), JSON.stringify(input, null, 2));

const primaryModel = process.env.MODEL || 'deepseek-v4.1-flash:cloud';
const fallbackModel = 'glm-5.3-flash:cloud';
const endpoint = process.env.ENDPOINT || 'http://127.0.0.1:11434';

let calls = 0;
let totalTokens = 0;

const novelLlm: NovelLLM = async (prompt, system, options) => {
  calls++;
  const callId = calls;
  const stage = options?.stage || 'general';
  const start = Date.now();
  log(`Call #${callId} [${stage}] started (prompt: ${prompt.length} chars)`);

  let lastError: unknown = null;
  const modelsToTry = [primaryModel, fallbackModel];

  for (const m of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await generateOllamaText(
          prompt,
          system,
          options?.schema,
          options?.temperature ?? 0.7,
          m,
          endpoint,
          options?.maxTokens || 4000
        );

        if (text && text.trim().length > 0) {
          const duration = ((Date.now() - start) / 1000).toFixed(1);
          log(`Call #${callId} [${stage}] succeeded with ${m} in ${duration}s (${text.length} chars, ~${text.split(/\s+/).length} words)`);
          return text;
        }
      } catch (err: any) {
        lastError = err;
        log(`Call #${callId} [${stage}] model ${m} attempt ${attempt} failed: ${err.message}`);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  // Fallback to compatible endpoint if local ollama failed
  try {
    log(`Call #${callId} [${stage}] attempting fallback to compatible endpoint (auto)...`);
    const compText = await generateCompatibleText(prompt, system, options?.maxTokens || 4000, 'auto', options?.temperature ?? 0.7, options?.schema);
    if (compText && compText.trim().length > 0) {
      log(`Call #${callId} [${stage}] succeeded with compatible auto fallback`);
      return compText;
    }
  } catch (compErr: any) {
    log(`Call #${callId} compatible fallback failed: ${compErr.message}`);
  }

  throw new Error(`Call #${callId} failed on all models: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};

async function main() {
  log(`Starting novel generation for: "${input.premise.slice(0, 80)}..."`);
  log(`Target: ${input.chapter_count} chapters, ~${input.target_total_words} words total`);
  log(`Primary Model: ${primaryModel}`);

  const store = new MemoryProjectStore();
  const orchestrator = new Orchestrator(store, { maxCalls: 300, maxTimeMs: 2 * 60 * 60 * 1000 }, (stage, chapter) => {
    log(`Progress: stage=${stage}${chapter !== undefined ? `, chapter=${chapter}` : ''}`);
  });

  const result = await orchestrator.runBook(input, novelLlm);
  log(`Generation finished with status: ${result.status}`);

  // Flush files
  const authorDraft = store.loadAuthor();
  if (authorDraft?.desk?.files) {
    for (const [name, content] of Object.entries(authorDraft.desk.files)) {
      const ext = name.split('.').pop() || 'txt';
      const base = name.replace(/\.[^.]+$/, '');
      const outPath = join(subfolders.blueprints, bookFileName(base, ext, false));
      writeFileSync(outPath, content);
      log(`Saved blueprint: ${outPath} (${content.length} bytes)`);
    }
    if (authorDraft.desk.journal) {
      writeFileSync(join(subfolders.reports, bookFileName('журнал автора', 'md', false)), authorDraft.desk.journal.join('\n'));
    }
  }

  // Ensure book.md is formatted cleanly
  const manuscript = store.manuscript();
  if (manuscript.length > 0) {
    const sorted = [...manuscript].sort((a, b) => a.chapter - b.chapter);
    const bookContent = sorted
      .map(ch => `## Chapter ${ch.chapter}\n\n${ch.text.trim()}`)
      .join('\n\n\n');
    const manuscriptPath = join(subfolders.manuscripts, bookFileName('книга', 'md', false));
    writeFileSync(manuscriptPath, `# ${bookTitle}\n\n${bookContent}\n`);
    log(`Saved manuscript: ${manuscriptPath} (~${bookContent.split(/\s+/).length} words across ${manuscript.length} chapters)`);

    for (const ch of sorted) {
      const chPath = join(subfolders.manuscripts, bookFileName(`глава ${String(ch.chapter).padStart(2, '0')}`, 'md', false));
      writeFileSync(chPath, `## Chapter ${ch.chapter}\n\n${ch.text.trim()}\n`);
    }
  }

  const report = store.loadReport();
  if (report) {
    const reportPath = join(subfolders.reports, bookFileName('редакторский отчёт', 'json', false));
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(`Saved report (${report.status}): ${reportPath}`);
  }

  const resultPath = join(subfolders.reports, bookFileName('результат', 'json', false));
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
  log(`Done! Everything saved to: ${bookDir}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  log(`FATAL: ${err instanceof Error ? err.stack || err.message : String(err)}`);
  process.exit(1);
});
