import { renderPrompt, systemContract } from '../prompts';
import { structuredResponse, type NovelLLM } from './llm';
import { buildSceneHandoff } from './handoff';
import { imageAllowance, imageSentences, knownImages, readWornImages } from './images';
import { voiceBrief } from './planner';
import { profileOf } from './profile';
import { imageTargets, quoteBalance, trimImagesAcross, type RewriteTarget, narrationRule } from './repair';
import { stripApparatus } from './sceneWriter';
import type { ProjectStore, SceneRecord } from './store';
import { applyDelta, applyResolutions, applyThreads, paragraphsWithIds, storyNames, trackScene } from './tracker';
import type { BookDesign, ChapterPlan, SceneHandoff, StoryState, WornImage } from './types';

/**
 * The chapter check: the one place a finished text can be corrected for free.
 *
 * The final audit reads the whole book and reports, and it has never rewritten
 * anything, for a reason that still holds: a scene changed after the scenes
 * that follow it were planned and written leaves them standing on something
 * that is no longer there. So a book that stated a count one way in its first
 * chapter and resolved it another way in its last shipped with both, and a
 * report saying so.
 *
 * The end of a chapter is different. Its scenes are written and nothing after
 * them exists: the next chapter is planned from memory, and memory can be
 * rebuilt from the corrected scenes before that plan is made. A correction here
 * has no downstream to break. This is the only moment that is true, so this is
 * where the correcting is done — and of three measured books, the one written
 * with it was the only one whose audit found no contradiction of fact.
 *
 * Two repairs and no others, both of them splices rather than rewrites. `align`
 * replaces sentences that state a particular the book does not hold, by exact
 * string, the way span repair replaces a duplicated one. `insert` adds one
 * short beat between two paragraphs and touches neither. The scene around
 * either is the scene that was accepted.
 *
 * Every charge has to point. The editor quotes the sentences it means and code
 * discards a quote the scene does not contain; it names the paragraph a beat
 * follows and code refuses one that is not there. Then the corrected scene is
 * read again by the tracker against the state it was written from, and a
 * correction memory refuses is taken back out: the scene returns to what it
 * was, with a warning, rather than staying in a state nobody checked.
 */

export interface ChapterRepair {
  id: string;
  kind: 'align' | 'insert';
  problem: string;
  scene_id: string;
  /** align: what the book holds, which the quoted sentences state otherwise. */
  canonical: string;
  /** align: sentences of the scene, verbatim. */
  quotes: string[];
  /** insert: the paragraph the beat follows, scene-local (p3). */
  after_paragraph: string;
  /** insert: what the beat has to put on the page. */
  must_establish: string;
}

export interface ChapterCheck {
  repairs: ChapterRepair[];
  /** Proposals code did not accept, with the reason. Reported, never silent. */
  refused: string[];
  /** What the editor left for the chapters ahead. */
  later: string[];
  /** Pictures the chapter keeps returning to, named for code to count. */
  images: WornImage[];
}

/** A chapter gets a few corrections, not an edit. Past this the chapter wanted replanning, not repair. */
export const MAX_CHAPTER_REPAIRS = 3;
/** A beat, not a scene: long enough to show one thing happen. */
export const MAX_INSERT_WORDS = 150;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The chapter's accepted scenes in plan order, which is the order the manuscript joins them in. */
export function chapterRecords(store: ProjectStore, chapter: number, plan: ChapterPlan): SceneRecord[] {
  const stored = new Map(store.chapterScenes(chapter).map(record => [record.id, record]));
  return plan.scenes.map(scene => stored.get(scene.id)).filter((record): record is SceneRecord => !!record?.delta && !!record.plan);
}

/** Every paragraph under a reference that names its scene, so a charge can point at it. */
export function describeChapterText(records: SceneRecord[]): string {
  return records.map(record => paragraphsWithIds(record.prose)
    .map(paragraph => `[${record.id}#${paragraph.id}] ${paragraph.text}`).join('\n\n')).join('\n\n');
}

/**
 * Proposals as code will act on them. Nothing is repaired on a charge that does
 * not point at the text: a scene of another chapter, a quotation the scene does
 * not contain, a paragraph that is not there.
 */
export function settleRepairs(raw: unknown, records: SceneRecord[]): { repairs: ChapterRepair[]; refused: string[] } {
  const proposed = Array.isArray((raw as { repairs?: unknown })?.repairs) ? (raw as { repairs: unknown[] }).repairs : [];
  const scenes = new Map(records.map(record => [record.id.toUpperCase(), record]));
  const repairs: ChapterRepair[] = [];
  const refused: string[] = [];
  for (const [index, entry] of proposed.entries()) {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const id = text(item.id) || `R${index + 1}`;
    const problem = text(item.problem);
    const record = scenes.get(text(item.scene_id).toUpperCase());
    const label = `${id}${problem ? ` (${problem.slice(0, 120)})` : ''}`;
    if (!record) {
      refused.push(`${label}: it names "${text(item.scene_id) || 'no scene'}", which is not a scene of this chapter`);
      continue;
    }
    if (repairs.length >= MAX_CHAPTER_REPAIRS) {
      refused.push(`${label}: the chapter already has ${MAX_CHAPTER_REPAIRS} corrections`);
      continue;
    }
    const kind = text(item.kind).toLowerCase();
    if (kind === 'align') {
      const canonical = text(item.canonical);
      const quotes = [...new Set((Array.isArray(item.quotes) ? item.quotes : []).map(text).filter(Boolean))]
        .filter(quote => record.prose.includes(quote));
      if (!canonical) refused.push(`${label}: it does not say what the book holds`);
      else if (!quotes.length) refused.push(`${label}: it quotes nothing ${record.id} says word for word`);
      else repairs.push({ id, kind: 'align', problem, scene_id: record.id, canonical, quotes, after_paragraph: '', must_establish: '' });
    } else if (kind === 'insert') {
      const paragraph = /p\d+/i.exec(text(item.after_paragraph))?.[0]?.toLowerCase() || '';
      const must = text(item.must_establish);
      if (!must) refused.push(`${label}: it does not say what the beat must establish`);
      else if (!paragraphsWithIds(record.prose).some(entry => entry.id === paragraph)) {
        refused.push(`${label}: ${record.id} has no paragraph "${text(item.after_paragraph) || '(none given)'}" for the beat to follow`);
      } else repairs.push({ id, kind: 'insert', problem, scene_id: record.id, canonical: '', quotes: [], after_paragraph: paragraph, must_establish: must });
    } else {
      refused.push(`${label}: "${text(item.kind) || '(no kind)'}" is not a repair this stage makes`);
    }
  }
  return { repairs, refused };
}

/** The repairs and images the chapter's closing call proposed, as code will act on them. */
export function readChapterCheck(raw: unknown, records: SceneRecord[]): ChapterCheck {
  const answer = (raw && typeof raw === 'object' ? raw : {}) as { leave_to_later?: unknown; worn_images?: unknown };
  const settled = settleRepairs(answer, records);
  const later = (Array.isArray(answer.leave_to_later) ? answer.leave_to_later : []).map(text).filter(Boolean);
  return { ...settled, later, images: readWornImages(answer.worn_images) };
}

/**
 * Replace the quoted sentences with ones that state what the book holds. The
 * same splice span repair uses and the same refusals: a replacement applies by
 * exact string or not at all.
 */
export async function correctSpans(input: { design: BookDesign; prose: string; repair: ChapterRepair }, llm: NovelLLM): Promise<{ prose: string; corrected: number; left: string[] }> {
  const { repair } = input;
  const prompt = renderPrompt('P10_SPAN_CORRECT', {
    story_contract: JSON.stringify(input.design.contract),
    style_contract: JSON.stringify(input.design.style_contract),
    narration: narrationRule(input.design),
    canonical: repair.canonical,
    problem: repair.problem || '(not stated)',
    sentences: repair.quotes.map((quote, index) => `${index + 1}. ${quote}`).join('\n\n'),
  });
  const raw = await structuredResponse(prompt, systemContract(), llm, ['replacements'], parsed => parsed,
    { temperature: 0.4, maxTokens: 4096, route: 'writer', stage: 'span-correct' }) as { replacements?: unknown };
  const replacements = Array.isArray(raw.replacements) ? raw.replacements as { original?: unknown; replacement?: unknown; refused_because?: unknown }[] : [];
  let prose = input.prose;
  let corrected = 0;
  const left: string[] = [];
  const handled = new Set<string>();
  for (const entry of replacements) {
    const from = text(entry?.original);
    const to = text(entry?.replacement);
    const short = `"${from.slice(0, 60)}…"`;
    // Only what the check pointed at. A replacement for some other sentence is
    // an edit nobody asked for, however well meant.
    if (!repair.quotes.includes(from) || handled.has(from)) continue;
    handled.add(from);
    if (!to) left.push(`${short} was kept: ${text(entry?.refused_because) || 'no correction offered'}`);
    else if (!prose.includes(from)) left.push(`${short} no longer occurs in the scene, so nothing was replaced`);
    else if (to.includes(from)) left.push(`${short} was kept: the correction still contained it word for word`);
    else if (quoteBalance(from) !== quoteBalance(to)) left.push(`${short} was kept: the correction would have left the paragraph's quotation marks unbalanced`);
    else {
      prose = prose.replace(from, to);
      corrected++;
    }
  }
  for (const quote of repair.quotes) {
    if (!handled.has(quote)) left.push(`"${quote.slice(0, 60)}…" came back with no correction`);
  }
  return { prose, corrected, left };
}

/** One short beat after a named paragraph. Nothing around it moves. */
export async function insertBeat(input: { design: BookDesign; state: StoryState; prose: string; repair: ChapterRepair }, llm: NovelLLM): Promise<{ prose: string; inserted: string; left: string[] }> {
  const paragraphs = paragraphsWithIds(input.prose);
  const at = paragraphs.findIndex(entry => entry.id === input.repair.after_paragraph);
  if (at === -1) return { prose: input.prose, inserted: '', left: [`paragraph ${input.repair.after_paragraph} is no longer in the scene`] };
  const names = storyNames(input.state);
  const prompt = renderPrompt('P11_BEAT_INSERT', {
    story_contract: JSON.stringify(input.design.contract),
    style_contract: JSON.stringify(input.design.style_contract),
    narration: narrationRule(input.design),
    voice_brief: voiceBrief(input.design.style_contract),
    must_establish: input.repair.must_establish,
    problem: input.repair.problem || '(not stated)',
    named_entities: names.length ? names.map(entry => `- ${entry.name}`).join('\n') : '(no named entities recorded yet)',
    paragraphs_before: paragraphs.slice(Math.max(0, at - 3), at + 1).map(entry => entry.text).join('\n\n'),
    paragraph_after: paragraphs[at + 1]?.text || '(the scene ends here)',
    max_words: String(MAX_INSERT_WORDS),
  });
  const answer = await llm(prompt, systemContract(), { temperature: 0.7, maxTokens: 1024, route: 'writer', stage: 'beat-insert' });
  const beat = stripApparatus(answer).prose;
  const words = beat.split(/\s+/).filter(Boolean).length;
  if (!words || /^```|^\s*\{|<\/?think>/i.test(beat)) return { prose: input.prose, inserted: '', left: ['the writer returned no usable passage'] };
  // The limit is the safety of the whole repair: a beat is small enough that
  // the paragraph after it still follows. A passage half again over it is a
  // scene written into the middle of another one.
  if (words > MAX_INSERT_WORDS * 1.5) return { prose: input.prose, inserted: '', left: [`the passage came back at ${words} words against a limit of ${MAX_INSERT_WORDS}`] };
  const next = [...paragraphs.slice(0, at + 1).map(entry => entry.text), beat, ...paragraphs.slice(at + 1).map(entry => entry.text)];
  return { prose: next.join('\n\n'), inserted: beat, left: [] };
}

/**
 * Did the correction touch anything memory was built from?
 *
 * A corrected scene used to be read by the tracker again, whole, every time:
 * the most expensive call there is, to learn in most cases that a sentence
 * memory had never cited now says something else. The delta points at its
 * evidence by paragraph. If the paragraphs that changed are ones no record
 * cites, memory holds nothing drawn from them and nothing to bring up to date;
 * if a record does cite one — the wrong particular was itself recorded — the
 * scene is read again. A beat added between paragraphs always is: it moves
 * every paragraph after it, and it puts something new on the page.
 */
export function touchesMemory(record: SceneRecord, prose: string): boolean {
  const before = paragraphsWithIds(record.prose);
  const after = paragraphsWithIds(prose);
  if (before.length !== after.length) return true;
  const changed = new Set(before.filter((paragraph, index) => paragraph.text !== after[index].text).map(paragraph => paragraph.id));
  if (!changed.size) return false;
  const delta = record.delta as unknown as Record<string, unknown> | null;
  for (const list of Object.values(delta || {})) {
    if (!Array.isArray(list)) continue;
    for (const item of list as { evidence_refs?: unknown; scene_refs?: unknown }[]) {
      for (const refs of [item?.evidence_refs, item?.scene_refs]) {
        if (Array.isArray(refs) && refs.some(ref => changed.has(String(ref)))) return true;
      }
    }
  }
  return false;
}

function cloneState(state: StoryState): StoryState {
  return JSON.parse(JSON.stringify(state)) as StoryState;
}

export interface ChapterRepairInput {
  design: BookDesign;
  chapter: number;
  plan: ChapterPlan;
  store: ProjectStore;
  startState: StoryState;
  startHandoff: SceneHandoff | null;
  /** The closing call's answer: `repairs` and `worn_images` are read from it. */
  proposals: unknown;
}

export interface ChapterRepairOutcome {
  warnings: string[];
  /** Scene ids whose text changed. */
  repaired: string[];
}

/**
 * Check the chapter, apply what the check proposed, and prove each corrected
 * scene against memory before it is kept.
 *
 * `startState` and `startHandoff` are the chapter's own starting point. Memory
 * cannot un-apply a delta, so a corrected scene is folded by rebuilding the
 * chapter from there: every scene's delta again, in order, with the corrected
 * scene's new one in its place. The handoffs are rebuilt on the same pass,
 * because the last of them is what the next chapter is planned from.
 */
export async function repairChapter(input: ChapterRepairInput, llm: NovelLLM): Promise<ChapterRepairOutcome> {
  const { design, chapter, plan, store } = input;
  const warnings: string[] = [];
  const records = chapterRecords(store, chapter, plan);
  if (!records.length) return { warnings, repaired: [] };
  const check = readChapterCheck(input.proposals, records);
  for (const note of check.refused) {
    warnings.push(`Chapter ${chapter} check: a proposed correction was not made — ${note}.`);
    store.log('chapter-check', `Refused: ${note}`);
  }
  if (check.later.length) store.log('chapter-check', `Chapter ${chapter}: left for the chapters ahead — ${check.later.join('; ')}`);
  if (check.images.length) {
    // Kept with the chapter's plan: the scenes of every later chapter are
    // written and searched against the images named here.
    store.saveChapterPlan({ ...(store.loadChapterPlan(chapter) || plan), worn_images: check.images });
    store.log('chapter-check', `Chapter ${chapter}: recurring image(s) named — ${check.images.map(image => `${image.image} [${image.anchors.join(', ')}]`).join('; ')}`);
  }
  const repaired = await applyRepairs(input, check, records, warnings, llm);
  const trimmed = await trimChapterImages(input, warnings, llm);
  return { warnings, repaired: [...new Set([...repaired, ...trimmed])] };
}

/**
 * The images the book has named, counted across everything accepted so far, and
 * the sentences of this chapter past each one's allowance rewritten without it.
 * No scene is read into memory again: a sentence loses a picture and keeps what
 * happened in it, which is the same contract span repair works under.
 */
async function trimChapterImages(input: ChapterRepairInput, warnings: string[], llm: NovelLLM): Promise<string[]> {
  const { design, chapter, plan, store } = input;
  const images = knownImages(store, chapter);
  if (!images.length) return [];
  const profile = profileOf(design);
  const earlier = store.manuscript().filter(item => item.chapter < chapter).map(item => item.text).join('\n\n');
  const records = chapterRecords(store, chapter, plan);
  const count = (image: WornImage): number => imageSentences(earlier, image).length
    + records.reduce((sum, record) => sum + imageSentences(record.prose, image).length, 0);
  // What each scene has past each image's allowance, the allowance spent in
  // reading order: the uses a book is allowed are its first ones.
  const targets = new Map<string, RewriteTarget[]>();
  const over: { image: WornImage; total: number; allowance: number }[] = [];
  for (const image of images) {
    const allowance = imageAllowance(image, profile);
    const total = count(image);
    if (total <= allowance) continue;
    over.push({ image, total, allowance });
    let used = imageSentences(earlier, image).length;
    for (const record of records) {
      const here = imageSentences(record.prose, image).length;
      const keep = Math.max(0, allowance - used);
      if (here > keep) targets.set(record.id, [...(targets.get(record.id) || []), ...imageTargets(record.prose, [{ image, uses: total, keep }])]);
      used += here;
    }
  }
  if (!over.length) return [];
  // One call for the chapter, every scene's sentences in it.
  const rewritten = await trimImagesAcross({
    design,
    summary: `Chapter ${chapter}: sentences from several scenes, each to be rewritten without the image it is marked with.`,
    scenes: records.map(record => ({ id: record.id, prose: record.prose, targets: targets.get(record.id) || [] })),
  }, llm);
  const changed: string[] = [];
  for (const [index, record] of records.entries()) {
    const out = rewritten.get(record.id);
    if (!out || !out.repaired.length) continue;
    records[index] = {
      ...record,
      prose: out.prose,
      original_prose: record.original_prose ?? record.prose,
      paragraph_ids: paragraphsWithIds(out.prose).map(paragraph => paragraph.id),
    };
    changed.push(record.id);
  }
  // The count again, after: what is reported is what the text now holds.
  for (const item of over) {
    const now = count(item.image);
    const detail = `the image "${item.image.image}" stood at ${item.total} use(s) against an allowance of ${item.allowance}; ${item.total - now} sentence(s) in this chapter were rewritten without it and it now stands at ${now}`;
    warnings.push(`Chapter ${chapter}: ${detail}.`);
    store.log('images', `Chapter ${chapter}: ${detail}.`);
  }
  // Every scene again, in order: saving one moves it to the end of the store.
  if (changed.length) for (const record of records) store.saveScene(record);
  return changed;
}

async function applyRepairs(
  input: ChapterRepairInput,
  check: ChapterCheck,
  records: SceneRecord[],
  warnings: string[],
  llm: NovelLLM,
): Promise<string[]> {
  const { design, chapter, store } = input;
  if (!check.repairs.length) {
    store.log('chapter-check', `Chapter ${chapter}: nothing to correct.`);
    return [];
  }
  const staged: SceneRecord[] = [];
  const repaired: string[] = [];
  let state = cloneState(input.startState);
  for (const record of records) {
    let current = record;
    const mine = check.repairs.filter(repair => repair.scene_id === record.id);
    if (mine.length) {
      let prose = record.prose;
      const done: string[] = [];
      for (const repair of mine) {
        const what = repair.problem || repair.canonical || repair.must_establish;
        try {
          if (repair.kind === 'align') {
            const out = await correctSpans({ design, prose, repair }, llm);
            prose = out.prose;
            if (out.corrected) done.push(`${out.corrected} sentence(s) corrected to "${repair.canonical}"`);
            for (const standing of out.left) warnings.push(`Chapter ${chapter} check, ${record.id}: ${standing}.`);
          } else {
            const out = await insertBeat({ design, state, prose, repair }, llm);
            prose = out.prose;
            if (out.inserted) done.push(`a beat added after ${repair.after_paragraph} to establish "${repair.must_establish}"`);
            for (const standing of out.left) warnings.push(`Chapter ${chapter} check, ${record.id}: no beat was added — ${standing}.`);
          }
        } catch (error) {
          warnings.push(`Chapter ${chapter} check, ${record.id}: "${what}" was not corrected (${error instanceof Error ? error.message.split('\n')[0] : error}).`);
        }
      }
      if (prose !== record.prose && !touchesMemory(record, prose)) {
        // Memory cites none of what changed: the text is corrected and the
        // record of the scene stands as it was.
        current = {
          ...record,
          prose,
          original_prose: record.original_prose ?? record.prose,
          paragraph_ids: paragraphsWithIds(prose).map(paragraph => paragraph.id),
        };
        repaired.push(record.id);
        warnings.push(`Chapter ${chapter} check corrected ${record.id}: ${done.join('; ')}. The scene as first written is kept beside it.`);
        store.log('chapter-check', `${record.id} corrected: ${done.join('; ')}. No record of the scene cited the sentences that changed.`);
      } else if (prose !== record.prose) {
        // The proof. The corrected scene is read again against the state it was
        // written from; what it now says goes into memory in place of what it
        // said, or the scene goes back to what it was.
        try {
          const delta = await trackScene({
            priorState: state,
            scenePlan: record.plan,
            sceneProse: prose,
            sourceExcerpts: [],
            openThreads: store.loadThreads().filter(thread => thread.status === 'open'),
          }, llm);
          const applied = applyDelta(state, delta, record.id);
          if (applied.blockers.length) {
            warnings.push(`Chapter ${chapter} check, ${record.id}: the correction was taken back out — memory refused the corrected scene (${applied.blockers.join('; ').replace(/\.$/, '')}).`);
            store.log('chapter-check', `${record.id}: correction reverted; ${applied.blockers.join('; ')}`);
          } else {
            current = {
              ...record,
              prose,
              original_prose: record.original_prose ?? record.prose,
              paragraph_ids: paragraphsWithIds(prose).map(paragraph => paragraph.id),
              delta,
              // The answers were given about the scene as it stood. The questions
              // travel on in the handoff rather than being answered from a text
              // that has since changed.
              resolutions: [],
            };
            repaired.push(record.id);
            warnings.push(`Chapter ${chapter} check corrected ${record.id}: ${done.join('; ')}. The scene as first written is kept beside it.`);
            store.log('chapter-check', `${record.id} corrected: ${done.join('; ')}.`);
          }
        } catch (error) {
          warnings.push(`Chapter ${chapter} check, ${record.id}: the correction was taken back out — the corrected scene could not be read into memory (${error instanceof Error ? error.message.split('\n')[0] : error}).`);
          store.log('chapter-check', `${record.id}: correction reverted; re-reading failed.`);
        }
      }
    }
    const folded = applyDelta(state, current.delta!, current.id);
    state = applyResolutions(folded.state, current.resolutions || [], current.id);
    staged.push(current);
  }
  if (!repaired.length) return repaired;

  // Commit: the chapter again from its start, every scene saved in order so the
  // manuscript joins them as planned, each with the handoff the rebuilt memory gives it.
  let rebuilt = cloneState(input.startState);
  let handoff = input.startHandoff;
  for (const [index, record] of staged.entries()) {
    const folded = applyDelta(rebuilt, record.delta!, record.id);
    rebuilt = applyResolutions(folded.state, record.resolutions || [], record.id);
    const threads = applyThreads(store.loadThreads(), record.delta!, record.id);
    store.saveThreads(threads);
    handoff = buildSceneHandoff({
      scene: record.plan!,
      nextScene: staged[index + 1]?.plan || undefined,
      state: rebuilt,
      delta: record.delta!,
      resolutions: record.resolutions || [],
      threads,
      previous: handoff,
    });
    store.saveScene({ ...record, handoff });
  }
  store.saveState(rebuilt);
  return repaired;
}
