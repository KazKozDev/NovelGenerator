/** Blind whole-book discovery. Existing prose only; no author notes or earlier judgements sent.
 * npx vite-node scripts/discover-continuity.ts --books runs/nora-truth1,runs/nora-forward1 --repeats 3 --out runs/continuity-discovery
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { generateQwenText } from '../services/qwenService';
import { discoverContinuity, manuscriptPassages, type DiscoveryReport } from '../utils/novel/v3/continuityDiscovery';

const arg = (name: string, fallback: string) => { const at = process.argv.indexOf(`--${name}`); return at >= 0 ? process.argv[at + 1] || fallback : fallback; };
const model = arg('model', 'qwen3.8-max'), repeats = Number(arg('repeats', '3'));
const out = resolve(arg('out', 'runs/continuity-discovery'));
const books = arg('books', '').split(',').filter(Boolean).map(resolveBook);
function resolveBook(path: string) {
  const directory = resolve(path);
  const files = readdirSync(directory).filter(f => /^chapter-\d+\.md$/.test(f)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const chapters = files.map(file => ({ chapter: Number(file.match(/\d+/)![0]), text: readFileSync(join(directory, file), 'utf8') }));
  if (chapters.some((c, at) => c.chapter !== at + 1)) throw new Error('Chapter sequence has a gap.');
  const passages = manuscriptPassages(chapters);
  return { name: basename(directory), directory, files, chapters: chapters.length, words: chapters.reduce((n, c) => n + c.text.split(/\s+/).filter(Boolean).length, 0),
    sha256: createHash('sha256').update(JSON.stringify(chapters)).digest('hex'), passages };
}
if (!books.length || new Set(books.map(b => b.name)).size !== books.length || !Number.isInteger(repeats) || repeats < 1 || repeats > 10)
  throw new Error('Supply --books with unique book names and --repeats 1..10.');
if (existsSync(join(out, 'report.json'))) throw new Error('Output already contains a report. Choose a new --out directory.');
mkdirSync(join(out, 'calls'), { recursive: true });

async function main() {
  const results: { book: string; repetition: number; seconds: number; report?: DiscoveryReport; error?: string }[] = [];
  const save = () => writeFileSync(join(out, 'report.json'), JSON.stringify({ model, repeats,
    scope: 'Blind discovery in complete saved chapter files. Quotes are checked; semantic verdicts require independent review. There is no exhaustive gold list.',
    books, results }, null, 2));
  save();
  for (const book of books) {
    for (let repetition = 1; repetition <= repeats; repetition++) {
      const tag = `${book.name}-${repetition}`, start = Date.now();
      const result: typeof results[number] = { book: book.name, repetition, seconds: 0 };
      try {
        result.report = await discoverContinuity(book.passages, async (prompt, system, options) => {
          writeFileSync(join(out, 'calls', `${tag}-prompt.json`), JSON.stringify({ prompt, system, options }, null, 2));
          const answer = await generateQwenText(prompt, system, options?.maxTokens, model, options?.temperature);
          writeFileSync(join(out, 'calls', `${tag}-answer.txt`), answer);
          return answer;
        });
      } catch (error) { result.error = error instanceof Error ? error.message : String(error); }
      result.seconds = Math.round((Date.now() - start) / 1000); results.push(result); save();
      console.log(`${book.name} ${repetition}/${repeats}: ${result.error ? `UNAVAILABLE ${result.error}` : `${result.report!.findings.filter(f => f.verdict === 'error').length} alleged errors, ${result.report!.findings.filter(f => f.verdict === 'uncertain').length} uncertain, ${result.report!.rejected.length} rejected quotes`} (${result.seconds}s)`);
    }
  }
  if (results.some(r => r.error || r.report?.rejected.length)) process.exitCode = 1;
}
main().catch(error => { console.error(String(error)); process.exitCode = 1; });
