/** Evidence-ledger experiment: blind extraction, automatic topic collection, independent review.
 * npx vite-node scripts/check-continuity-ledger.ts --books runs/nora-truth1,runs/nora-forward1 --out runs/continuity-ledger
 * --resume continues completed calls without re-sending them. No manuscript is changed.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { generateQwenText } from '../services/qwenService';
import { calendarCandidates } from '../utils/novel/v3/calendarConsistency';
import type { NovelLLM } from '../utils/novel/v2/llm';
import { manuscriptPassages } from '../utils/novel/v3/continuityDiscovery';
import { claimTopics, extractClaims, extractionWindows, readClaims, readTopic, sourceUnits, topicContext, verifyTopic, type ClaimExtraction, type LedgerClaim } from '../utils/novel/v3/continuityLedger';

const arg = (name: string, fallback: string) => { const at = process.argv.indexOf(`--${name}`); return at >= 0 ? process.argv[at + 1] || fallback : fallback; };
const model = arg('model', 'qwen3.8-max'), out = resolve(arg('out', 'runs/continuity-ledger'));
const maxCalls = Number(arg('max-calls', '128')), windowWords = Number(arg('window-words', '1300'));
const jobs = Number(arg('jobs', '3'));
if (!Number.isInteger(jobs) || jobs < 1 || jobs > 4) throw new Error('Use --jobs 1..4.');
if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 512 || !Number.isInteger(windowWords) || windowWords < 200) throw new Error('Invalid call/window budget.');
const books = arg('books', '').split(',').filter(Boolean).map(path => {
  const directory = resolve(path);
  const chapters = readdirSync(directory).filter(f => /^chapter-\d+\.md$/.test(f)).map(f => ({ chapter: Number(f.match(/\d+/)![0]), text: readFileSync(join(directory, f), 'utf8') })).sort((a, b) => a.chapter - b.chapter);
  if (chapters.some((c, at) => c.chapter !== at + 1)) throw new Error('Chapter sequence has a gap.');
  const passages = manuscriptPassages(chapters);
  return { name: basename(directory), directory, sha256: createHash('sha256').update(JSON.stringify(chapters)).digest('hex'), passages, units: sourceUnits(passages), calendar_candidates: calendarCandidates(passages) };
});
if (!books.length || new Set(books.map(b => b.name)).size !== books.length) throw new Error('Supply distinct --books.');
type WindowResult = { index: number; passage_ids: string[]; extraction?: ClaimExtraction; error?: string };
type TopicResult = { id: string; original_topic_id?: string; topic_snapshot?: { entity: string; facet: string }; review?: Awaited<ReturnType<typeof verifyTopic>>; error?: string };
interface BookResult { name: string; windows: WindowResult[]; topics: ReturnType<typeof claimTopics>; reviews: TopicResult[]; review_history?: TopicResult[] }
interface Run { model: string; windowWords: number; calls: number; books: typeof books; results: BookResult[]; status: string; migration_notes?: string[] }
const reportPath = join(out, 'report.json');
let run: Run;
if (existsSync(reportPath)) {
  if (!process.argv.includes('--resume')) throw new Error('Output exists. Use a new directory or --resume.');
  run = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (run.model !== model || run.windowWords !== windowWords || JSON.stringify(run.books.map(b => [b.name, b.sha256])) !== JSON.stringify(books.map(b => [b.name, b.sha256]))) throw new Error('Resume inputs do not match saved run.');
  run.books = books; // Same source hashes; refresh deterministic source-derived diagnostics.
} else run = { model, windowWords, calls: 0, books, results: [], status: 'RUNNING' };
mkdirSync(join(out, 'calls'), { recursive: true });
if (process.argv.includes('--restore-source-kinds')) {
  copyFileSync(reportPath, join(out, `report-before-source-kind-normalization-${Date.now()}.json`));
  for (const result of run.results) {
    const book = books.find(b => b.name === result.name)!;
    for (const window of result.windows) {
      if (!window.extraction?.rejected.length) continue;
      const prefix = `${book.name}-extract-${window.index + 1}-`;
      const files = readdirSync(join(out, 'calls')).filter(f => f.startsWith(prefix) && f.endsWith('-answer.txt'))
        .sort((a, b) => statSync(join(out, 'calls', b)).mtimeMs - statSync(join(out, 'calls', a)).mtimeMs);
      if (!files.length) throw new Error('Cannot restore source kinds without the saved raw answer.');
      const ids = new Set(window.passage_ids);
      window.extraction = readClaims(readFileSync(join(out, 'calls', files[0]), 'utf8'), book.units.filter(u => ids.has(u.passage)), `w${window.index + 1}`);
    }
  }
  run.migration_notes = [...(run.migration_notes || []), 'Reparsed saved raw extraction answers: thought/thought -> belief, speech/speech -> utterance. No source text or model output changed.'];
}
if (process.argv.includes('--refresh-reviews')) {
  copyFileSync(reportPath, join(out, `report-before-citation-refresh-${Date.now()}.json`));
  for (const result of run.results) {
    const book = books.find(b => b.name === result.name)!;
    for (const review of result.reviews) {
      if (!review.review) continue;
      const topic = result.topics.find(t => t.id === review.id)!;
      const prefix = `${book.name}-${review.original_topic_id || review.id}-`;
      const files = readdirSync(join(out, 'calls')).filter(f => f.startsWith(prefix) && f.endsWith('-answer.txt'))
        .filter(f => {
          // Sequential IDs can be reused after new categories appear. Match the saved
          // request's actual assertion set, never just the filename or newest response.
          try {
            const request = JSON.parse(readFileSync(join(out, 'calls', f.replace(/-answer\.txt$/, '-prompt.json')), 'utf8'));
            const asserted = JSON.parse(request.prompt.split('Assertions: ')[1].split('\nOriginal context:')[0]);
            return JSON.stringify(asserted.map((c: LedgerClaim) => c.id).sort()) === JSON.stringify(topic.claims.map(c => c.id).sort());
          } catch { return false; }
        })
        .sort((a, b) => statSync(join(out, 'calls', b)).mtimeMs - statSync(join(out, 'calls', a)).mtimeMs);
      if (!files.length) throw new Error('Cannot refresh citations without raw review output.');
      const context = topicContext(topic, book.passages, book.units);
      review.review = readTopic(readFileSync(join(out, 'calls', files[0]), 'utf8'), topic, context.units);
    }
  }
  run.migration_notes = [...(run.migration_notes || []), 'Reparsed saved topic answers: primary source refs copied automatically from selected claims; no model output or prose changed.'];
}
const save = () => writeFileSync(reportPath, JSON.stringify(run, null, 2));
const call = (tag: string): NovelLLM => async (prompt, system, options) => {
  if (run.calls >= maxCalls) throw new Error('Experiment call budget exhausted.');
  run.calls++; save();
  const attemptTag = `${tag}-call-${run.calls}`;
  writeFileSync(join(out, 'calls', `${attemptTag}-prompt.json`), JSON.stringify({ prompt, system, options }, null, 2));
  const text = await generateQwenText(prompt, system, options?.maxTokens, model, options?.temperature);
  writeFileSync(join(out, 'calls', `${attemptTag}-answer.txt`), text);
  return text;
};

async function main() {
  run.status = 'RUNNING'; save();
  for (const book of books) {
    let result = run.results.find(b => b.name === book.name);
    if (!result) { result = { name: book.name, windows: [], topics: [], reviews: [] }; run.results.push(result); }
    if (process.argv.includes('--recheck-errors')) {
      const recheck = result.reviews.filter(r => r.review?.findings.some(f => f.verdict === 'error') || r.review?.rejected.length || r.error);
      result.review_history = [...(result.review_history || []), ...recheck];
      const ids = new Set(recheck.map(r => r.id)); result.reviews = result.reviews.filter(r => !ids.has(r.id)); save();
    }
    const windows = extractionWindows(book.passages, windowWords);
    const pending = [...windows.entries()].filter(([index]) => !result!.windows.some(w => w.index === index));
    for (let at = 0; at < pending.length && run.calls < maxCalls; at += jobs) {
      const batch = pending.slice(at, at + Math.min(jobs, maxCalls - run.calls));
      const known = [...new Set(result.windows.flatMap(w => w.extraction?.claims.map(c => c.entity) || []))];
      await Promise.all(batch.map(async ([index, window]) => {
        const ids = new Set(window.map(p => p.id));
        const units = book.units.filter(u => ids.has(u.passage));
        const row: WindowResult = { index, passage_ids: [...ids] };
        try { row.extraction = await extractClaims(window, units, known, `w${index + 1}`, call(`${book.name}-extract-${index + 1}`)); }
        catch (error) { row.error = error instanceof Error ? error.message : String(error); }
        result!.windows.push(row); result!.windows.sort((a, b) => a.index - b.index); save();
        console.log(`${book.name} extract ${index + 1}/${windows.length}: ${row.error || `${row.extraction!.claims.length} claims, ${row.extraction!.rejected.length} rejected`}`);
      }));
    }
    const claims: LedgerClaim[] = result.windows.flatMap(w => w.extraction?.claims || []);
    const previousTopics = result.topics;
    const nextTopics = claimTopics(claims);
    result.review_history = result.review_history?.map(r => {
      const topic = previousTopics.find(t => t.id === r.id);
      return { ...r, topic_snapshot: r.topic_snapshot || (topic ? { entity: topic.entity, facet: topic.facet } : undefined) };
    });
    // Added categories can move sequential IDs. Reuse only reviews of exactly the same claim set.
    const retained: TopicResult[] = [];
    for (const review of result.reviews) {
      const previous = previousTopics.find(t => t.id === review.id);
      const next = previous && nextTopics.find(t => t.entity === previous.entity && t.facet === previous.facet);
      if (next && JSON.stringify(next.claims.map(c => c.id).sort()) === JSON.stringify(previous!.claims.map(c => c.id).sort()))
        retained.push({ ...review, original_topic_id: review.original_topic_id || review.id, id: next.id });
      else result.review_history = [...(result.review_history || []), { ...review, topic_snapshot: previous ? { entity: previous.entity, facet: previous.facet } : undefined }];
    }
    result.reviews = retained; result.topics = nextTopics; save();
    const pendingTopics = result.topics.filter(t => !result!.reviews.some(r => r.id === t.id));
    for (let at = 0; at < pendingTopics.length && run.calls < maxCalls; at += jobs) {
      const batch = pendingTopics.slice(at, at + Math.min(jobs, maxCalls - run.calls));
      await Promise.all(batch.map(async topic => {
        const row: TopicResult = { id: topic.id };
        try { row.review = await verifyTopic(topic, topicContext(topic, book.passages, book.units), call(`${book.name}-${topic.id}`)); }
        catch (error) { row.error = error instanceof Error ? error.message : String(error); }
        result!.reviews.push(row); save();
        console.log(`${book.name} ${topic.id} ${topic.entity}/${topic.facet}: ${row.error || `${row.review!.findings.filter(f => f.verdict === 'error').length} alleged errors, ${row.review!.findings.filter(f => f.verdict === 'uncertain').length} uncertain, ${row.review!.index_errors?.length || 0} index errors, ${row.review!.rejected.length} rejected`}`);
      }));
    }
  }
  const incomplete = books.some(b => { const r = run.results.find(x => x.name === b.name)!; return r.windows.length !== extractionWindows(b.passages, windowWords).length || r.windows.some(w => w.error || w.extraction?.rejected.length) || r.reviews.length !== r.topics.length || r.reviews.some(t => t.error || t.review?.rejected.length); });
  run.status = incomplete ? 'PARTIAL' : 'COMPLETE'; save();
  console.log(`FINISHED ${run.status}: ${run.calls} calls. Results: ${reportPath}`);
  if (incomplete) process.exitCode = 1;
}
main().catch(error => { run.status = 'FAILED'; save(); console.error(String(error)); process.exitCode = 1; });
