import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { generateOllamaText } from '../services/ollamaService';
import { generateCompatibleText } from '../services/compatibleService';
import type { NovelLLM } from '../utils/novel/v2/llm';
import type { ProjectInput } from '../utils/novel/v2/types';

const outDir = 'runs/hp-voldemort-5-chapters';
mkdirSync(outDir, { recursive: true });

const logFile = join(outDir, 'run.log');
writeFileSync(logFile, '');
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(logFile, line + '\n');
}

const input: ProjectInput = {
  planning_version: 2,
  generation_mode: 'craft',
  premise: `In the shadowed aftermath of the Department of Mysteries, the psychic link between Harry Potter and Lord Voldemort mutates from violent intrusion into an intimate, magnetic resonance. Disillusioned by Dumbledore's evasions and the crushing expectations of the wizarding world, Harry finds himself drawn into nocturnal mental intrusions where cruelty gives way to an unsettling understanding. In secluded encounters across forgotten, warded ruins, an intense and forbidden obsession ignites between boy and Dark Lord—a psychological clash of shared trauma, power, and unspoken devotion that threatens to burn both sides of the war to ash.`,
  chapter_count: 5,
  genre: 'dark psychological fantasy / romance',
  target_total_words: 8750,
  author_requirements: 'Voice: third-limited. Tone: dark, psychological, intimate. Style: descriptive, visceral. Audience: adult. Tense: past. Ending: closed. Intimate scenes: on the page, restrained, intense.',
};

writeFileSync(join(outDir, 'input.json'), JSON.stringify(input, null, 2));

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
      writeFileSync(join(outDir, name), content);
      log(`Saved ${name} (${content.length} bytes)`);
    }
    if (authorDraft.desk.journal) {
      writeFileSync(join(outDir, 'journal.md'), authorDraft.desk.journal.join('\n'));
    }
  }

  // Ensure book.md is formatted cleanly
  const manuscript = store.manuscript();
  if (manuscript.length > 0) {
    const bookContent = manuscript
      .sort((a, b) => a.chapter - b.chapter)
      .map(ch => `## Chapter ${ch.chapter}\n\n${ch.text.trim()}`)
      .join('\n\n\n');
    writeFileSync(join(outDir, 'book.md'), bookContent);
    log(`Saved book.md (${bookContent.length} bytes, ~${bookContent.split(/\s+/).length} words across ${manuscript.length} chapters)`);
  }

  const report = store.loadReport();
  if (report) {
    writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    log(`Saved report.json (${report.status}): ${report.summary}`);
  }

  writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2));
  log(`Done!`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  log(`FATAL: ${err instanceof Error ? err.stack || err.message : String(err)}`);
  process.exit(1);
});
