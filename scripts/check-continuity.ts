/** Offline, labelled continuity benchmark. No manuscript or generation state is modified.
 * npx vite-node scripts/check-continuity.ts --model qwen3.8-max --repeats 3 --out runs/continuity-bench
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateQwenText } from '../services/qwenService';
import { generateOllamaText } from '../services/ollamaService';
import { assessContinuity, scoreContinuity, type EvalResult } from '../utils/novel/v3/continuityEval';
import { continuityCases } from '../tests/fixtures/continuityCases';

const arg = (name: string, fallback: string) => { const at = process.argv.indexOf(`--${name}`); return at >= 0 ? process.argv[at + 1] || fallback : fallback; };
const model = arg('model', 'qwen3.8-max'), repeats = Number(arg('repeats', '3'));
const endpoint = arg('endpoint', 'http://127.0.0.1:11434');
const out = resolve(arg('out', 'runs/continuity-bench'));
const selected = arg('cases', '').split(',').filter(Boolean);
const cases = continuityCases.filter(c => !selected.length || selected.includes(c.id));
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10 || !cases.length || selected.some(id => !cases.some(c => c.id === id)))
  throw new Error('Use --repeats 1..10 and existing comma-separated --cases IDs.');
// Never overwrite the evidence from an earlier benchmark run.
if (existsSync(join(out, 'report.json'))) throw new Error('Output already contains a report; choose a new --out directory.');
mkdirSync(join(out, 'calls'), { recursive: true });

async function main() {
  const results: (EvalResult & { repetition: number; category: string })[] = [];
  // Verify the committed real-book fixture against the local book when available.
  const sources = [
    { id: 'nora-scarf-same-paragraph', files: ['runs/nora-truth1/chapter-3.md'] },
    { id: 'nora-alibi-admitted', files: ['runs/nora-forward1/chapter-4.md', 'runs/nora-forward1/chapter-4.md', 'runs/nora-forward1/chapter-5.md'] },
  ];
  for (const source of sources) {
    const fixture = continuityCases.find(c => c.id === source.id)!;
    source.files.forEach((file, at) => {
      if (existsSync(file) && !readFileSync(file, 'utf8').includes(fixture.passages[at].text))
        throw new Error(`Saved-book fixture ${source.id} no longer matches ${file}.`);
    });
  }
  const save = () => {
    const stability = cases.map(c => {
      const mine = results.filter(r => r.id === c.id);
      const verdicts = mine.map(r => r.error ? 'unavailable' : r.assessment!.verdict);
      return { id: c.id, verdicts, stable: mine.length === repeats && !mine.some(r => r.error) && new Set(verdicts).size === 1 };
    });
    writeFileSync(join(out, 'report.json'), JSON.stringify({ model, repeats, scope: 'Classification of supplied mismatches; does not measure discovery of all defects in a whole book.',
      summary: scoreContinuity(results), by_category: Object.fromEntries([...new Set(cases.map(c => c.category))].map(category => [category, scoreContinuity(results.filter(r => r.category === category))])), stability,
      cases, results }, null, 2));
  };
  for (let repetition = 1; repetition <= repeats; repetition++) {
    for (const fixture of cases) {
      const file = `${repetition}-${fixture.id}`;
      const result: typeof results[number] = { id: fixture.id, category: fixture.category, expected: fixture.expected, repetition };
      try {
        result.assessment = await assessContinuity(fixture.passages, async (prompt, system, options) => {
          writeFileSync(join(out, 'calls', `${file}-prompt.json`), JSON.stringify({ prompt, system, options }, null, 2));
          const answer = /^qwen/i.test(model)
            ? await generateQwenText(prompt, system, options?.maxTokens, model, options?.temperature, undefined, options?.schema)
            : await generateOllamaText(prompt, system, options?.schema, options?.temperature, model, endpoint, options?.maxTokens);
          writeFileSync(join(out, 'calls', `${file}-answer.txt`), answer);
          return answer;
        });
      } catch (error) { result.error = error instanceof Error ? error.message : String(error); }
      results.push(result); save();
      console.log(`${repetition}/${repeats} ${fixture.id}: ${result.error ? `UNAVAILABLE ${result.error}` : `${result.assessment!.verdict} (expected ${fixture.expected})`}`);
    }
  }
  console.log(JSON.stringify(scoreContinuity(results), null, 2));
  if (results.some(r => r.error)) process.exitCode = 1;
}
main().catch(error => { console.error(String(error)); process.exitCode = 1; });
