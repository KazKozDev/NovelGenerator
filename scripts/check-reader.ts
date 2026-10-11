/** Test reader understanding on a saved design without changing it. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateGeminiText } from '../services/geminiService';
import { validateBookDesign } from '../utils/novel/v2/designer';
import { simulateReader, reviewReader } from '../utils/novel/v2/reader';
import type { NovelLLM } from '../utils/novel/v2/llm';

const arg = (name: string, fallback: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] || fallback : fallback;
};
const source = arg('snapshot', '');
if (!source) throw new Error('Pass --snapshot <saved project snapshot>.');
const out = arg('out', 'runs/reader-check');
const model = arg('editor', 'gemini-3.6-flash');
const collisionsPath = arg('collisions', '');
const reusePath = arg('reuse-readings', '');
const snapshot = JSON.parse(readFileSync(source, 'utf8'));
const design = validateBookDesign(snapshot.files.book_design, snapshot.files.input.chapter_count);
if (collisionsPath) {
  const recorded = JSON.parse(readFileSync(collisionsPath, 'utf8'));
  if (resolve(recorded.source) !== resolve(source)) throw new Error('Collisions belong to a different snapshot.');
  design.intention_collisions = recorded;
}
mkdirSync(join(out, 'calls'), { recursive: true });
let calls = 0;
const llm: NovelLLM = async (prompt, system, options) => {
  const id = ++calls;
  if (id > 60) throw new Error('Reader check exceeded its 60-call limit.');
  console.log(`CALL ${id} ${options?.stage} ${model}`);
  writeFileSync(join(out, 'calls', `${String(id).padStart(3, '0')}-prompt.txt`), prompt);
  const response = await generateGeminiText(prompt, system, options?.schema, options?.temperature ?? 0.2,
    undefined, undefined, options?.maxTokens ?? 8192, true, model, !!options?.deliberate);
  writeFileSync(join(out, 'calls', `${String(id).padStart(3, '0')}-response.json`), response);
  return response;
};
async function main() {
  const recorded = reusePath ? JSON.parse(readFileSync(reusePath, 'utf8')) : null;
  if (recorded && resolve(recorded.source) !== resolve(source)) throw new Error('Readings belong to a different snapshot.');
  const report = recorded ? await reviewReader(design, recorded.beats, recorded.readings, llm) : await simulateReader(design, llm);
  writeFileSync(join(out, 'report.json'), JSON.stringify({ source, model, calls, ...report }, null, 2));
  console.log(JSON.stringify({ calls, ready: report.review.ready, issues: report.review.issues }, null, 2));
}
main().catch(error => { console.error(String(error)); process.exitCode = 1; });
