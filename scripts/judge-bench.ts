/**
 * Judge bench: the same scenes, read by several editor models, so an editor can
 * be chosen by what it does rather than by what its card says.
 *
 * A whole book per candidate proves little — the story differs every run — and
 * costs an hour each. The editor's work is the tracker's: read one finished
 * scene against memory and report. So this takes scenes a finished run already
 * wrote, rebuilds the memory each was written from, and asks every candidate
 * for the same extraction. Some scenes are given untouched, as controls; three
 * are given with a defect planted in them that a careful reader should report:
 *
 *   misspell    a recorded name respelt once (should come back in name_variants)
 *   restage     a paragraph of the scene before it written in again
 *               (should come back in restaged_beats, naming that scene)
 *   contradict  a sentence, supplied on the command line, that contradicts
 *               something on record (should come back in contradictions)
 *
 *   npx vite-node scripts/judge-bench.ts --snapshot runs/<run>/snapshot.json \
 *     --models model-a:cloud,model-b:cloud \
 *     --contradict "CH02_S03::<a sentence contradicting a recorded fact>" \
 *     --out runs/judge-bench
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { restoreSnapshot } from '../utils/novel/v2/export';
import { applyDelta, applyResolutions, applyThreads, paragraphsWithIds, trackScene } from '../utils/novel/v2/tracker';
import { generateOllamaText } from '../services/ollamaService';
import { generateGeminiText } from '../services/geminiService';
import { generateAnthropicText } from '../services/anthropicService';
import type { NovelLLM } from '../utils/novel/v2/llm';
import type { ReaderThread, StateDelta, StoryState } from '../utils/novel/v2/types';
import type { SceneRecord } from '../utils/novel/v2/store';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const snapshotPath = arg('snapshot', '');
const models = arg('models', '').split(',').map(item => item.trim()).filter(Boolean);
const endpoint = arg('endpoint', 'http://127.0.0.1:11434');
const outDir = arg('out', 'runs/judge-bench');
const sceneCount = Number(arg('scenes', '5'));
const contradict = arg('contradict', '');
if (!snapshotPath || !models.length) {
  console.error('Usage: --snapshot <snapshot.json> --models a,b[,c] [--contradict "SCENE_ID::sentence"] [--scenes 5] [--out dir]');
  process.exit(1);
}

interface Case {
  scene: string;
  plant: 'control' | 'misspell' | 'restage' | 'contradict';
  planted: string;
  prose: string;
  plan: unknown;
  priorState: StoryState;
  openThreads: ReaderThread[];
  previousScene: string;
}

/** The memory each scene was written from, rebuilt by folding the run's own deltas in order. */
function buildCases(): Case[] {
  const store = new MemoryProjectStore();
  restoreSnapshot(store, JSON.parse(readFileSync(snapshotPath, 'utf8')));
  const design = store.loadDesign();
  if (!design) throw new Error('The snapshot holds no book design.');
  const records: SceneRecord[] = [];
  for (let chapter = 1; chapter <= design.chapter_map.length; chapter++) {
    records.push(...store.chapterScenes(chapter).filter(record => record.delta && record.plan && record.prose.trim()));
  }
  if (records.length < 3) throw new Error(`The snapshot holds ${records.length} tracked scene(s); the bench needs at least three.`);
  let state: StoryState = {
    facts: [], events: [], conditions: {}, knowledge: {}, beliefs: {}, reader_disclosures: [],
    names: design.characters.map(character => ({ name: character.name, kind: 'person', refers_to: character.id, aliases: [], first_seen: 'design' })),
  };
  let threads: ReaderThread[] = [];
  const before: { state: StoryState; threads: ReaderThread[] }[] = [];
  for (const record of records) {
    before.push({ state: JSON.parse(JSON.stringify(state)), threads: threads.filter(thread => thread.status === 'open') });
    state = applyResolutions(applyDelta(state, record.delta as StateDelta, record.id).state, record.resolutions || [], record.id);
    threads = applyThreads(threads, record.delta as StateDelta, record.id);
  }
  // Spread over the run, never the first scene: memory has to hold something to be read against.
  const step = Math.max(1, Math.floor((records.length - 1) / sceneCount));
  const picked = Array.from({ length: Math.min(sceneCount, records.length - 1) }, (_, index) => Math.min(records.length - 1, 1 + index * step));
  const [contradictScene, contradictSentence] = contradict.includes('::') ? contradict.split('::').map(item => item.trim()) : ['', ''];
  const cases: Case[] = [];
  let misspelt = false;
  let restaged = false;
  for (const index of [...new Set(picked)]) {
    const record = records[index];
    const base = { scene: record.id, plan: record.plan, priorState: before[index].state, openThreads: before[index].threads, previousScene: records[index - 1].id };
    const paragraphs = paragraphsWithIds(record.prose).map(item => item.text);
    if (contradictSentence && record.id.toUpperCase() === contradictScene.toUpperCase()) {
      const at = Math.min(2, paragraphs.length);
      cases.push({ ...base, plant: 'contradict', planted: contradictSentence, prose: [...paragraphs.slice(0, at), contradictSentence, ...paragraphs.slice(at)].join('\n\n') });
      continue;
    }
    if (!misspelt) {
      // The recorded name the scene uses most, respelt once with its last letter doubled.
      const name = before[index].state.names.map(entry => entry.name.split(/\s+/).at(-1) || '')
        .filter(word => word.length >= 4 && record.prose.includes(word))
        .sort((first, second) => record.prose.split(second).length - record.prose.split(first).length)[0];
      if (name) {
        const wrong = `${name}${name.at(-1)}`;
        const place = record.prose.indexOf(name, Math.floor(record.prose.length / 3));
        const at = place === -1 ? record.prose.indexOf(name) : place;
        misspelt = true;
        cases.push({ ...base, plant: 'misspell', planted: wrong, prose: `${record.prose.slice(0, at)}${wrong}${record.prose.slice(at + name.length)}` });
        continue;
      }
    }
    if (!restaged) {
      // The longest paragraph of the scene before it, written in again.
      const earlier = paragraphsWithIds(records[index - 1].prose).map(item => item.text).sort((first, second) => second.length - first.length)[0];
      if (earlier && earlier.length > 200) {
        restaged = true;
        const at = Math.min(1, paragraphs.length);
        cases.push({ ...base, plant: 'restage', planted: earlier.slice(0, 80), prose: [...paragraphs.slice(0, at), earlier, ...paragraphs.slice(at)].join('\n\n') });
        continue;
      }
    }
    cases.push({ ...base, plant: 'control', planted: '', prose: record.prose });
  }
  return cases;
}

interface Result {
  model: string;
  scene: string;
  plant: Case['plant'];
  ok: boolean;
  error: string;
  seconds: number;
  calls: number;
  answerChars: number;
  events: number;
  facts: number;
  disclosures: number;
  variants: string[];
  contradictions: number;
  restaged: string[];
  caught: boolean | null;
}

async function judge(model: string, item: Case): Promise<Result> {
  let calls = 0;
  let answerChars = 0;
  const llm: NovelLLM = async (prompt, system, options) => {
    calls++;
    // A model named claude-… is asked through the Anthropic API, gemini-… through the Gemini API; anything else through Ollama.
    const answer = /^claude-/i.test(model)
      ? await generateAnthropicText(prompt, system, options?.maxTokens ?? 16384, model)
      : /^gemini-/i.test(model)
      ? await generateGeminiText(prompt, system, options?.schema, options?.temperature ?? 0.1, undefined, undefined, options?.maxTokens ?? 16384, Boolean(options?.json), model)
      : await generateOllamaText(prompt, system, undefined, options?.temperature ?? 0.1, model, endpoint, options?.maxTokens ?? 16384);
    answerChars += answer.length;
    return answer;
  };
  const started = Date.now();
  const base = { model, scene: item.scene, plant: item.plant };
  try {
    const delta = await trackScene({ priorState: item.priorState, scenePlan: item.plan, sceneProse: item.prose, sourceExcerpts: [], openThreads: item.openThreads }, llm);
    const applied = applyDelta(item.priorState, delta, item.scene);
    const variants = (delta.name_variants || []).map(entry => `${entry.used}→${entry.recorded}`);
    const restaged = applied.restaged.map(entry => entry.earlier);
    const caught = item.plant === 'control' ? null
      : item.plant === 'misspell' ? (delta.name_variants || []).some(entry => String(entry.used).includes(item.planted))
      : item.plant === 'restage' ? restaged.some(ref => ref.toUpperCase().startsWith(item.previousScene.toUpperCase()))
      : delta.contradictions.length > 0;
    return {
      ...base, ok: true, error: '', seconds: Math.round((Date.now() - started) / 1000), calls, answerChars,
      events: delta.events.length, facts: (delta.established_facts || []).length, disclosures: (delta.reader_disclosures || []).length,
      variants, contradictions: delta.contradictions.length, restaged, caught,
    };
  } catch (error) {
    return {
      ...base, ok: false, error: (error instanceof Error ? error.message : String(error)).split('\n')[0].slice(0, 160),
      seconds: Math.round((Date.now() - started) / 1000), calls, answerChars,
      events: 0, facts: 0, disclosures: 0, variants: [], contradictions: 0, restaged: [], caught: item.plant === 'control' ? null : false,
    };
  }
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const cases = buildCases();
  console.log(`cases: ${cases.map(item => `${item.scene}(${item.plant})`).join(' ')}`);
  // Candidates side by side, each reading its scenes in order.
  const all = (await Promise.all(models.map(async model => {
    const results: Result[] = [];
    for (const item of cases) {
      const result = await judge(model, item);
      console.log(`${model} ${item.scene} ${item.plant}: ${result.ok ? `${result.seconds}s ${result.answerChars}ch events=${result.events}${result.caught === null ? '' : ` caught=${result.caught}`}` : `FAILED ${result.error}`}`);
      results.push(result);
    }
    return results;
  }))).flat();
  writeFileSync(join(outDir, 'results.json'), JSON.stringify({ snapshot: snapshotPath, cases: cases.map(({ scene, plant, planted }) => ({ scene, plant, planted })), results: all }, null, 2));
  const lines = ['| Model | Read | Calls | Seconds | Answer | Events | Facts | Planted caught | False name variants | False contradictions | False restagings |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const model of models) {
    const mine = all.filter(item => item.model === model);
    const read = mine.filter(item => item.ok);
    const mean = (pick: (item: Result) => number): string => (read.length ? Math.round(read.reduce((sum, item) => sum + pick(item), 0) / read.length).toString() : '-');
    const planted = mine.filter(item => item.plant !== 'control');
    const controls = read.filter(item => item.plant === 'control');
    lines.push(`| ${model} | ${read.length}/${mine.length} | ${mine.reduce((sum, item) => sum + item.calls, 0)} | ${mean(item => item.seconds)} | ${mean(item => item.answerChars)} | ${mean(item => item.events)} | ${mean(item => item.facts)} | ${planted.filter(item => item.caught).map(item => item.plant).join(', ') || 'none'} of ${planted.map(item => item.plant).join(', ')} | ${read.filter(item => item.plant !== 'misspell').reduce((sum, item) => sum + item.variants.length, 0)} | ${controls.reduce((sum, item) => sum + item.contradictions, 0)} | ${read.filter(item => item.plant !== 'restage').reduce((sum, item) => sum + item.restaged.length, 0)} |`);
  }
  writeFileSync(join(outDir, 'summary.md'), `${lines.join('\n')}\n`);
  console.log(`\n${lines.join('\n')}`);
}

main().catch(error => {
  console.error(`FATAL: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
