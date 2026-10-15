import type { ProjectInput } from '../v2/types';
import type { NovelLLM } from '../v2/llm';
import type { Chapter } from './editorial';
import type { AuthorArchitecture } from './types';
import { CraftSession, object as o, text as t, number as n, list as a, choice as c, revision, hasProseQuote } from './state';
import { normalizeChapterBody, foreignChapterHeadings } from '../manuscript';
import { manuscriptDigests } from './manuscriptContext';

export interface SceneSource { id: string; chapter: number; text: string }
interface RevisionPlan {
  problem: string;
  endingExecution: string;
  openingPromise: string;
  scenes: { id: string; chapter: number; sources: string[]; operation: 'keep' | 'cut-and-replace' | 'compress' | 'merge' | 'split' | 'move' | 'rewrite' | 'plant'; instruction: string; dependencies: string[]; beforeState: string; afterState: string; revealChanges: string; targetWords: number }[];
}
interface RevisionStrategy {
  problem: string;
  openingPromise: string;
  endingExecution: string;
  changes: { id: string; instruction: string; targets: string[]; sourceIds: string[]; revealChanges: string; dependencies: string[] }[];
}
const schema = o({ problem: t, endingExecution: t, openingPromise: t, scenes: a(o({ id: t, chapter: n, sources: a(), operation: c('keep', 'cut-and-replace', 'compress', 'merge', 'split', 'move', 'rewrite', 'plant'), instruction: t, dependencies: a(), beforeState: t, afterState: t, revealChanges: t, targetWords: { type: 'number', minimum: 1 } }), 1) });

/** Migration observes the saved book; it never invents retroactive proven canon. */
export async function recoverSavedBook(input: ProjectInput, chapters: Chapter[], session: CraftSession, llm: NovelLLM): Promise<void> {
  if (session.files['accepted-architecture.json']) return;
  const hash = await revision(chapters), source = `recovery/${hash}/source.json`;
  await session.put(source, { input, chapters });
  const large = chapters.reduce((sum, c) => sum + c.text.length, 0) > 60000;
  const context = `recovery/${hash}/context.json`;
  if (large) await session.put(context, { input, chapterDigests: await manuscriptDigests(chapters, session, llm) });
  const schema = o({ observations: a(o({ id: t, kind: t, chapter: n, quote: t, statement: t })), unknowns: a(o({ question: t, missingEvidence: t })), proposals: a(o({ question: t, proposedAction: t, reason: t })) });
  const recovery = await session.run<{ observations: { id: string; kind: string; chapter: number; quote: string; statement: string }[]; unknowns: unknown[]; proposals: unknown[] }>(
    `recover/${hash}`, `recovery/${hash}/observed.json`, 'enact', [large ? context : source], schema,
    'Recover author working material from an existing manuscript, not a new plot. Observations need exact chapter quotes. Unknown off-page mechanisms stay unknown. A possible fix belongs only in proposals, never observations or proven story truth. Do not generate a new dossier, scene draft or replacement novel.', llm,
    value => { if (new Set(value.observations.map(o => o.id)).size !== value.observations.length || value.observations.some(o => !chapters.some(c => c.chapter === o.chapter && hasProseQuote(c.text, o.quote)))) throw new Error('Recovered canon requires unique IDs and exact saved-book evidence.'); });
  await session.put('recovered-book.json', { sourceRevision: hash, coverage: large ? 'evidence-grounded chapter digests' : 'complete saved prose', ...recovery });
}

/** Existing exact scenes when possible; otherwise old chapters are honest source units. */
export function revisionSources(chapters: Chapter[], files: Record<string, string>, plan?: AuthorArchitecture): SceneSource[] {
  if (files['revision-scene-index.json']) {
    try {
      const scenes = JSON.parse(files['revision-scene-index.json']) as SceneSource[];
      if (chapters.every(ch => scenes.filter(s => s.chapter === ch.chapter).map(s => s.text).join('\n\n') === ch.text)) return scenes;
    } catch { /* Recover segmentation from exact current prose, not stale draft files. */ }
  }
  if (plan) {
    const scenes = plan.graph.scenes.map(s => ({ id: s.id, chapter: s.chapter, text: files[`scene-${s.order}.md`] || '' }));
    if (chapters.every(ch => scenes.filter(s => s.chapter === ch.chapter).map(s => s.text).join('\n\n') === ch.text) && scenes.every(s => s.text.trim())) return scenes;
  }
  return chapters.map(ch => ({ id: `SOURCE-CH${ch.chapter}`, chapter: ch.chapter, text: ch.text }));
}

async function segmentCurrentScenes(chapters: Chapter[], source: SceneSource[], architecture: AuthorArchitecture | undefined, session: CraftSession, llm: NovelLLM): Promise<SceneSource[]> {
  if (!architecture || source.every(s => !s.id.startsWith('SOURCE-CH'))) return source;
  const result: SceneSource[] = [];
  for (const chapter of chapters) {
    const paragraphs = chapter.text.split(/\n\s*\n/);
    const slots = architecture.form.sceneSlots.filter(s => s.chapter === chapter.chapter);
    if (paragraphs.length < slots.length) {
      result.push(source.find(s => s.chapter === chapter.chapter)!);
      continue;
    }
    const hash = await revision(chapter), file = `segmentation/${hash}/source.json`;
    await session.put(file, { chapter: chapter.chapter, paragraphs: paragraphs.map((text, index) => ({ index, text })), sceneIds: slots.map(s => s.id) });
    const split = await session.run<{ ranges: { first: number; last: number }[] }>(`segment/${hash}`, `segmentation/${hash}/ranges.json`, 'enact', [file], o({ ranges: a(o({ first: n, last: n }), slots.length) }),
      'Identify scene boundaries in the exact current prose using paragraph indexes. Return one contiguous range for each declared scene slot, in order, covering every paragraph exactly once. Prefer natural time/location/POV changes. Do not write or invent any prose; only return the source ranges.', llm,
      value => { if (value.ranges.length !== slots.length || value.ranges.some((r, i) => !Number.isInteger(r.first) || !Number.isInteger(r.last) || r.first !== (i ? value.ranges[i - 1].last + 1 : 0) || r.last < r.first || r.last >= paragraphs.length) || value.ranges.at(-1)!.last !== paragraphs.length - 1) throw new Error('Segmentation must cover exact prose once without gaps or overlaps.'); });
    split.ranges.forEach((range, index) => result.push({ id: slots[index].id, chapter: chapter.chapter, text: paragraphs.slice(range.first, range.last + 1).join('\n\n') }));
  }
  return result;
}

function normalizeTargetId(raw: string, targets: { id: string; chapter: number; order?: number }[]): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const clean = raw.trim();
  if (!clean || /^(none|n\/a|null|undefined|nil|-)$/i.test(clean)) return undefined;

  const exact = targets.find(t => t.id === clean);
  if (exact) return exact.id;

  const lower = clean.toLowerCase();
  const caseMatch = targets.find(t => t.id.toLowerCase() === lower);
  if (caseMatch) return caseMatch.id;

  const sceneNumMatch = lower.match(/^(?:scene|sc|s)[-_\s]*0*(\d+)$/i);
  if (sceneNumMatch) {
    const num = parseInt(sceneNumMatch[1], 10);
    const byId = targets.find(t => t.id.toLowerCase() === `sc${num}` || t.id.toLowerCase() === `sc0${num}`);
    if (byId) return byId.id;
    const byOrder = targets.find(t => t.order === num);
    if (byOrder) return byOrder.id;
    const byDigits = targets.find(t => t.id.replace(/\D+/g, '') === String(num));
    if (byDigits) return byDigits.id;
  }

  const chapterNumMatch = lower.match(/^(?:edit-ch|chapter|ch)[-_\s]*0*(\d+)$/i);
  if (chapterNumMatch) {
    const num = parseInt(chapterNumMatch[1], 10);
    const byId = targets.find(t => t.id.toLowerCase() === `edit-ch${num}`);
    if (byId) return byId.id;
    const byChapter = targets.filter(t => t.chapter === num);
    if (byChapter.length === 1) return byChapter[0].id;
  }

  if (/^\d+$/.test(clean)) {
    const num = parseInt(clean, 10);
    const byId = targets.find(t => t.id.toLowerCase() === `sc${num}` || t.id.toLowerCase() === `edit-ch${num}`);
    if (byId) return byId.id;
    const byOrder = targets.find(t => t.order === num);
    if (byOrder) return byOrder.id;
    const byChapter = targets.filter(t => t.chapter === num);
    if (byChapter.length === 1) return byChapter[0].id;
  }

  return undefined;
}

function normalizeSourceId(raw: string, sources: SceneSource[]): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const clean = raw.trim();
  if (!clean || /^(none|n\/a|null|undefined|nil|-)$/i.test(clean)) return undefined;

  const exact = sources.find(s => s.id === clean);
  if (exact) return exact.id;

  const lower = clean.toLowerCase();
  const caseMatch = sources.find(s => s.id.toLowerCase() === lower);
  if (caseMatch) return caseMatch.id;

  const sceneNumMatch = lower.match(/^(?:scene|sc|s)[-_\s]*0*(\d+)$/i);
  if (sceneNumMatch) {
    const num = parseInt(sceneNumMatch[1], 10);
    const byId = sources.find(s => s.id.toLowerCase() === `sc${num}` || s.id.toLowerCase() === `sc0${num}`);
    if (byId) return byId.id;
    const byDigits = sources.find(s => s.id.replace(/\D+/g, '') === String(num));
    if (byDigits) return byDigits.id;
  }

  const chapterNumMatch = lower.match(/^(?:source-ch|chapter|ch)[-_\s]*0*(\d+)$/i);
  if (chapterNumMatch) {
    const num = parseInt(chapterNumMatch[1], 10);
    const byId = sources.find(s => s.id.toLowerCase() === `source-ch${num}`);
    if (byId) return byId.id;
    const byChapter = sources.filter(s => s.chapter === num);
    if (byChapter.length === 1) return byChapter[0].id;
  }

  if (/^\d+$/.test(clean)) {
    const num = parseInt(clean, 10);
    const byId = sources.find(s => s.id.toLowerCase() === `sc${num}` || s.id.toLowerCase() === `source-ch${num}`);
    if (byId) return byId.id;
    const byChapter = sources.filter(s => s.chapter === num);
    if (byChapter.length === 1) return byChapter[0].id;
  }

  return undefined;
}

function normalizePlan(
  value: RevisionPlan,
  assigned: { id: string; chapter: number; order?: number; targetWords: number }[],
  source: SceneSource[],
  sources: Set<string>,
  targets: { id: string; chapter: number; order?: number; targetWords: number }[],
): void {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value.scenes)) value.scenes = [];

  for (const scene of value.scenes) {
    if (!scene || typeof scene !== 'object') continue;
    const normId = normalizeTargetId(scene.id, assigned);
    if (normId) scene.id = normId;

    scene.sources = Array.from(new Set(
      (Array.isArray(scene.sources) ? scene.sources : [])
        .map(id => normalizeSourceId(id, source))
        .filter((id): id is string => !!id && sources.has(id))
    ));

    scene.dependencies = Array.from(new Set(
      (Array.isArray(scene.dependencies) ? scene.dependencies : [])
        .map(id => normalizeTargetId(id, targets))
        .filter((id): id is string => !!id && id !== scene.id)
    ));
  }

  const alignedScenes: RevisionPlan['scenes'] = [];
  const usedSourceKeeps = new Set<string>();

  for (const [index, target] of assigned.entries()) {
    let matched = value.scenes.find(s => s.id === target.id);
    if (!matched && value.scenes.length === assigned.length) {
      matched = value.scenes[index];
    }
    if (!matched) {
      matched = {
        id: target.id,
        chapter: target.chapter,
        sources: [],
        operation: 'rewrite',
        instruction: 'Revise scene according to chapter goals.',
        dependencies: [],
        beforeState: 'Initial state.',
        afterState: 'Revised state.',
        revealChanges: 'No change.',
        targetWords: target.targetWords || 500,
      };
    }

    matched.id = target.id;
    matched.chapter = target.chapter;
    if (!matched.targetWords || matched.targetWords < 1) {
      matched.targetWords = target.targetWords || 500;
    }

    if (matched.operation === 'keep') {
      const validChapterSources = source.filter(s => s.chapter === target.chapter && !usedSourceKeeps.has(s.id));
      const keepSource = matched.sources.find(sId => validChapterSources.some(v => v.id === sId)) || validChapterSources[0]?.id;
      if (keepSource) {
        matched.sources = [keepSource];
        usedSourceKeeps.add(keepSource);
      } else {
        matched.operation = 'rewrite';
        matched.sources = source.filter(s => s.chapter === target.chapter).map(s => s.id).slice(0, 1);
      }
    }

    alignedScenes.push(matched);
  }

  value.scenes = alignedScenes;
}

/** One shared structural decision governs all replacement prose. No per-chapter invention. */
export async function restructureBook(input: ProjectInput, chapters: Chapter[], session: CraftSession, llm: NovelLLM, feedback: unknown = []): Promise<{ chapters: Chapter[]; scenes: SceneSource[]; plan: RevisionPlan }> {
  const architecture = session.files['accepted-architecture.json'] ? session.read<AuthorArchitecture>('accepted-architecture.json') : undefined;
  const source = await segmentCurrentScenes(chapters, revisionSources(chapters, session.files, architecture), architecture, session, llm);
  const sourceRevision = await revision(chapters);
  const prefix = `revision/${sourceRevision}`;
  await session.put(`${prefix}/source.json`, { chapters, scenes: source, bindingContract: input });
  const sources = new Set(source.map(s => s.id));
  const targets = architecture?.form.sceneSlots || chapters.map(c => ({ id: `EDIT-CH${c.chapter}`, chapter: c.chapter, order: c.chapter, targetWords: Math.round(input.target_total_words / input.chapter_count) }));
  await session.put(`${prefix}/targets.json`, targets);
  await session.put(`${prefix}/feedback.json`, feedback);
  // Old drafts provide evidence, not a manufactured objective backstory.
  const currentEnacted = session.files['enacted-state.json'] && !session.read<{ stale?: boolean }>('enacted-state.json').stale;
  const authorInputs = [...(architecture ? ['book-contract.json', 'accepted-architecture.json', ...(currentEnacted ? ['enacted-state.json'] : [])] : session.files['recovered-book.json'] ? ['recovered-book.json'] : []), ...(session.files['deferred-work.json'] ? ['deferred-work.json'] : [])];
  const targetIds = targets.map(t => t.id);
  const sourceIdsList = source.map(s => s.id);
  const instruction = `Author one coherent structural revision. For each declared target slot choose keep, cut-and-replace, compress, merge, split, move, rewrite or plant. Reuse effective prose. Cut repetitions before adding explanation. Decide exactly where each moved reveal first appears and remove its former occurrence. Plan actual opening promise and climactic action/payoff. Preserve supplied ending, chapter count, selected layout and binding premise. For old books unknown off-page events are proposals, never established evidence. dependencies reference target IDs whose changes must be coordinated; sources reference exact existing scene/chapter IDs. Valid target IDs: [${targetIds.join(', ')}]. Valid source IDs: [${sourceIdsList.join(', ')}].`;
  const validatePlan = (value: RevisionPlan, assigned = targets) => {
      if (value.scenes.length !== assigned.length || new Set(value.scenes.map(s => s.id)).size !== assigned.length) throw new Error('Revision must cover each target exactly once.');
      for (const [index, scene] of value.scenes.entries()) {
        if (scene.id !== assigned[index].id || scene.chapter !== assigned[index].chapter) throw new Error('Revision changed target order or chapter contract.');
        if (scene.sources.some(id => !sources.has(id)) || scene.dependencies.some(id => !targets.some(t => t.id === id))) throw new Error('Unknown revision source or dependency.');
        if (scene.operation === 'keep' && (scene.sources.length !== 1 || source.find(s => s.id === scene.sources[0])!.chapter !== scene.chapter)) throw new Error('Keep needs one unchanged source in the same chapter.');
      }
      const kept = value.scenes.filter(s => s.operation === 'keep').map(s => s.sources[0]);
      if (new Set(kept).size !== kept.length) throw new Error('A source cannot be kept twice and duplicate the manuscript.');
  };
  let plan: RevisionPlan;
  const large = targets.length > 12 || chapters.reduce((sum, c) => sum + c.text.length, 0) > 60000;
  if (!large) {
    plan = await session.run<RevisionPlan>(`revision-plan/${sourceRevision}`, `${prefix}/plan.json`, 'revision', [`${prefix}/source.json`, `${prefix}/targets.json`, `${prefix}/feedback.json`, ...authorInputs], schema,
      `${instruction} Return every target exactly once in target order.`, llm,
      value => { normalizePlan(value, targets, source, sources, targets); validatePlan(value, targets); });
  } else {
    const digests = await manuscriptDigests(chapters, session, llm);
    await session.put(`${prefix}/digests.json`, digests);
    await session.put(`${prefix}/author-context.json`, { bindingContract: input, ending: architecture?.concept.ending, beats: architecture?.beats, promises: architecture?.promises, setups: architecture?.payoffs, recovered: session.files['recovered-book.json'] ? session.read('recovered-book.json') : undefined });
    const strategySchema = o({ problem: t, openingPromise: t, endingExecution: t, changes: a(o({ id: t, instruction: t, targets: a(t, 1), sourceIds: a(), revealChanges: t, dependencies: a() })) });
    const strategy = await session.run<RevisionStrategy>(`revision-strategy/${sourceRevision}`, `${prefix}/strategy.json`, 'revision', [`${prefix}/digests.json`, `${prefix}/author-context.json`, `${prefix}/targets.json`, `${prefix}/feedback.json`], strategySchema,
      `${instruction} First decide the global change strategy from evidence-grounded chapter digests. List meaningful changes and all their affected target IDs/source IDs, especially both ends of a moved reveal. Do not write a 300-scene response; unchanged targets need no change record. Do not infer absent events from a digest alone.`, llm,
      value => {
        if (!value || typeof value !== 'object') return;
        if (!Array.isArray(value.changes)) value.changes = [];
        const seenIds = new Set<string>();
        for (let i = 0; i < value.changes.length; i++) {
          const c = value.changes[i];
          if (!c || typeof c !== 'object') continue;
          if (!c.id || seenIds.has(c.id)) {
            c.id = c.id ? `${c.id}-${i + 1}` : `change-${i + 1}`;
          }
          seenIds.add(c.id);

          c.targets = Array.from(new Set(
            (Array.isArray(c.targets) ? c.targets : [])
              .map(id => normalizeTargetId(id, targets))
              .filter((id): id is string => !!id && targets.some(t => t.id === id))
          ));

          c.sourceIds = Array.from(new Set(
            (Array.isArray(c.sourceIds) ? c.sourceIds : [])
              .map(id => normalizeSourceId(id, source))
              .filter((id): id is string => !!id && sources.has(id))
          ));

          c.dependencies = Array.from(new Set(
            (Array.isArray(c.dependencies) ? c.dependencies : [])
              .map(id => normalizeTargetId(id, targets))
              .filter((id): id is string => !!id && targets.some(t => t.id === id) && !c.targets.includes(id))
          ));
        }

        value.changes = value.changes.filter(c => c && c.targets.length > 0);
      });
    plan = { problem: strategy.problem, openingPromise: strategy.openingPromise, endingExecution: strategy.endingExecution, scenes: [] };
    for (let start = 0; start < targets.length; start += 4) {
      const batch = targets.slice(start, start + 4), chapters = new Set(batch.map(t => t.chapter));
      const changedSources = new Set(strategy.changes.filter(c => c.targets.some(id => batch.some(t => t.id === id))).flatMap(c => c.sourceIds));
      const local = source.filter(s => chapters.has(s.chapter) || changedSources.has(s.id));
      const scope = `${prefix}/batch-${start + 1}-scope.json`;
      await session.put(scope, { targets: batch, sourceUnits: local, sourceIndex: source.map(s => ({ id: s.id, chapter: s.chapter })) });
      const part = await session.run<RevisionPlan>(`revision-batch/${sourceRevision}/${start + 1}`, `${prefix}/batch-${start + 1}.json`, 'revision', [scope, `${prefix}/strategy.json`, `${prefix}/digests.json`, `${prefix}/author-context.json`], schema,
        `${instruction} BATCH: output only assigned targets ${batch.map(t => t.id).join(', ')}. Follow the shared global strategy, including cross-chapter reveal changes. Sources in scope are exact text; digests are evidence-backed context, not substitute text.`, llm,
        value => { normalizePlan(value, batch, source, sources, targets); validatePlan(value, batch); });
      plan.scenes.push(...part.scenes);
    }
    normalizePlan(plan, targets, source, sources, targets);
    validatePlan(plan);
    await session.put(`${prefix}/plan.json`, plan);
  }
  await session.put('revision-plan.json', { sourceRevision, ...plan });
  const replacements: SceneSource[] = [];
  for (const target of plan.scenes) {
    if (target.operation === 'keep') {
      replacements.push({ id: target.id, chapter: target.chapter, text: source.find(s => s.id === target.sources[0])!.text });
      continue;
    }
    // Every worker sees the same accepted plan and immutable source, not another
    // worker's independent interpretation or a half-applied manuscript.
    await session.put(`${prefix}/${target.id}-task.json`, target);
    const dependencySources = plan.scenes.filter(s => target.dependencies.includes(s.id)).flatMap(s => s.sources);
    const localSourceFile = `${prefix}/${target.id}-sources.json`;
    await session.put(localSourceFile, { bindingContract: input, sources: source.filter(s => target.sources.includes(s.id) || dependencySources.includes(s.id)), sharedChanges: plan.scenes.map(s => ({ id: s.id, chapter: s.chapter, operation: s.operation, revealChanges: s.revealChanges, beforeState: s.beforeState, afterState: s.afterState })), openingPromise: plan.openingPromise, endingExecution: plan.endingExecution });
    const result = await session.run<{ text: string }>(`revision-write/${sourceRevision}/${target.id}`, `${prefix}/${target.id}.json`, 'revision', [localSourceFile, `${prefix}/${target.id}-task.json`], o({ text: t }),
      `Execute only target ${target.id} according to the complete shared revision. Preserve effective source wording where possible. Every dependent target will execute this same plan. Write continuous fiction, no chapter labels, commentary or explanation of edits. Honor the current viewpoint; later reveals belong only in their planned targets. Aim for ${target.targetWords} words, allowing compression where dramatically needed.`, llm,
      value => {
        if (!value || typeof value.text !== 'string') throw new Error('Revision returned empty prose.');
        if (foreignChapterHeadings(value.text, target.chapter).length) {
          const headingRegex = /^[ \t]*(?:#{1,6}[ \t]+|\*\*)?(?:Chapter|Глава)[ \t]+(\d+)(?:[ \t]*[:—–-][ \t]*(.*?))?[ \t]*(?:\*\*)?[ \t]*$/i;
          value.text = value.text.split(/\r?\n/).filter(line => {
            const m = line.match(headingRegex);
            return !m || Number(m[1]) === target.chapter;
          }).join('\n').trim();
        }
        if (foreignChapterHeadings(value.text, target.chapter).length) throw new Error('Revision returned other chapters.');
      });
    replacements.push({ id: target.id, chapter: target.chapter, text: normalizeChapterBody(result.text, target.chapter) });
  }
  const result = chapters.map(ch => ({ chapter: ch.chapter, text: replacements.filter(s => s.chapter === ch.chapter).map(s => s.text).join('\n\n') }));
  if (result.some(ch => !ch.text.trim())) throw new Error('Structural revision cannot drop a requested chapter.');
  // Staged whole-book result is persisted before a caller commits it atomically.
  await session.put(`${prefix}/staged.json`, { chapters: result, scenes: replacements, sourceRevision });
  return { chapters: result, scenes: replacements, plan };
}
