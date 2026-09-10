import { assessLiteraryDevelopment, planLiteraryDevelopment } from './literary';
import { literaryContextKey, literaryCurrent, literaryStillHolds } from './literaryState';
import { proseCraft, narrativeDesign } from './proseCraft';
import { prosodyMetrics, prosodyReport, type Embedder, type ProsodyMetrics } from './prosody';
import type { Reranker } from './reranker';
import { applyPassages, repairableInPlace } from './patch';
import type { Character, ParsedChapterPlan, LLMProviderConfig } from '../../types';
import type { BookBlueprint, BookSpec, ChapterRecord, ChapterVersion, NovelRun, ReviewIssue, ReviewReport } from './contracts';
import { chapterRole, genreCraft, specPrompt } from './contracts';
import { acceptCandidate, acceptedVersion, addCandidate, canonBefore, canonForPrompt, emptyStoryState, evidenceExists, nextUnacceptedChapter, reconcileCheckpoint, validateAnalysis } from './storyState';
import { analyseChapter, beatCoverageIssue, confirmedFindings, findingStreaks, restatedFromEarlierScenes, sameFinding, sameFindingSet, reviewBook, reviewChapter, stripThinking, generateProse, structuredResponse, type NovelLLM } from './review';
import type { RunStore } from './runStore';
import { writeScene } from './writer';

export function createRun(spec: BookSpec, provider: LLMProviderConfig): NovelRun {
  return {
    schemaVersion: 1, validationVersion: 2, literaryValidationVersion: 1, id: crypto.randomUUID(), spec: structuredClone(spec), provider: { ...provider },
    outline: '', chapters: [], canon: emptyStoryState(), stage: 'outline', updatedAt: Date.now(),
  };
}

export function validateBlueprint(value: any, spec: BookSpec): BookBlueprint {
  for (const field of ['centralConflict', 'protagonistChange', 'endingPayoff']) {
    if (typeof value[field] !== 'string' || !value[field].trim()) throw new Error(`Blueprint missing ${field}.`);
  }
  if (!Array.isArray(value.characters) || !value.characters.length || !Array.isArray(value.promises) || !value.promises.length) throw new Error('Blueprint needs characters and narrative promises.');
  const characters: Record<string, Character> = {};
  for (const character of value.characters) {
    if (typeof character.name !== 'string' || !character.name.trim() || typeof character.description !== 'string' || !character.description.trim() || characters[character.name]) throw new Error('Invalid or duplicate character design.');
    characters[character.name] = {
      name: character.name, description: character.description, first_appearance: 1,
      status: 'not established', location: 'not established', emotional_state: 'not established',
      relationships: {}, development: [],
    };
  }
  const ids = new Set<string>();
  for (const promise of value.promises) {
    if (typeof promise.id !== 'string' || !promise.id || ids.has(promise.id) || typeof promise.description !== 'string' ||
        typeof promise.required !== 'boolean' || !Number.isInteger(promise.setupChapter) || !Number.isInteger(promise.payoffChapter) ||
        promise.setupChapter < 1 || promise.payoffChapter < promise.setupChapter || promise.payoffChapter > spec.chapterCount) {
      throw new Error('Invalid narrative promise timing or identity.');
    }
    ids.add(promise.id);
  }
  if (!value.promises.some((promise: { required: boolean }) => promise.required)) throw new Error('The book must have at least one required narrative payoff.');
  return { centralConflict: value.centralConflict, protagonistChange: value.protagonistChange, endingPayoff: value.endingPayoff, characters, promises: value.promises, chapters: [] };
}

/**
 * A chapter is planned against the book, not in isolation: a live run returned chapter three as a
 * byte-identical copy of chapter two, and prose cannot repair that — by then the repetition is the
 * plan. Muteness is checked once for the whole book instead (see speechSomewhere): a single chapter
 * may legitimately have nobody to talk to, and "two participants" does not mean two speakers when
 * one of them is a figure watched across a courtyard.
 */
export function validateChapterPlan(value: any, spec: BookSpec, earlier: ParsedChapterPlan[] = []): ParsedChapterPlan {
  if (!value || typeof value !== 'object') throw new Error('Invalid chapter plan object.');
  const target = value.chapter || value.chapterPlan || value.chapter_plan || value.plan || value;
  const aliases: Record<string, string[]> = {
    title: ['chapterTitle', 'chapter_title', 'heading'], summary: ['chapterSummary', 'chapter_summary', 'synopsis'],
    sceneBreakdown: ['scene_breakdown'], characterDevelopmentFocus: ['character_development_focus'],
    plotAdvancement: ['plot_advancement'], timelineIndicators: ['timeline_indicators'],
    emotionalToneTension: ['emotional_tone_tension'], connectionToNextChapter: ['connection_to_next_chapter'],
    openingHook: ['opening_hook'], chapterEnding: ['chapter_ending'], detailedScenes: ['detailed_scenes', 'scenes'],
  };
  const plan: any = { ...target };
  for (const [field, alternatives] of Object.entries(aliases)) {
    if (plan[field] === undefined) plan[field] = alternatives.map(key => target[key]).find(item => item !== undefined);
    if (field !== 'detailedScenes' && (typeof plan[field] !== 'string' || !plan[field].trim())) throw new Error(`Chapter plan missing ${field}.`);
  }
  if (!Array.isArray(plan.detailedScenes) || !plan.detailedScenes.length || plan.detailedScenes.length > 8) throw new Error('A chapter needs 1–8 fully planned scenes.');
  const ids = new Set<string>();
  plan.detailedScenes = plan.detailedScenes.map((raw: any, index: number) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid scene object.');
    const scene = { ...raw, sceneId: raw.sceneId || raw.scene_id || raw.id || `scene-${index + 1}`,
      objective: raw.objective || raw.goal, conflict: raw.conflict || raw.obstacle,
      outcome: raw.outcome || raw.result, participants: raw.participants || raw.characters,
      keyMoments: raw.keyMoments || raw.key_moments || raw.beats };
    for (const field of ['sceneId', 'location', 'objective', 'conflict', 'outcome', 'duration', 'mood']) {
      if (typeof scene[field] !== 'string' || !scene[field].trim()) throw new Error(`Scene missing ${field}.`);
    }
    // A scene may legitimately have no one in it — a room after everyone has gone, the closing image
    // of a chapter — and rejecting that killed a live run over a plan that was right.
    if (ids.has(scene.sceneId) || !Array.isArray(scene.participants) ||
        !scene.participants.every((name: unknown) => typeof name === 'string' && name.trim()) ||
        !Array.isArray(scene.keyMoments) || !scene.keyMoments.length ||
        !scene.keyMoments.every((beat: unknown) => typeof beat === 'string' && beat.trim())) throw new Error('Invalid scene identity, participants or beats.');
    if (scene.narrativeWeight !== undefined && (!Number.isInteger(scene.narrativeWeight) || scene.narrativeWeight < 1 || scene.narrativeWeight > 5)) throw new Error('Scene narrativeWeight must be an integer from 1 to 5.');
    // Older checkpoints planned scenes before this field existed; their prose is not retroactively defective.
    if (scene.conflictCarriedBy !== undefined && !['speech', 'action', 'solitude'].includes(scene.conflictCarriedBy)) throw new Error('Scene conflictCarriedBy must be speech, action or solitude.');
    if (scene.conflictCarriedBy === 'speech' && scene.participants.length < 2) throw new Error('A scene carried by speech needs at least two characters present to speak.');
    ids.add(scene.sceneId);
    return scene;
  });
  const fingerprint = JSON.stringify(plan.detailedScenes);
  const twin = earlier.findIndex(item => JSON.stringify(item.detailedScenes) === fingerprint || (item.title === plan.title && item.summary === plan.summary));
  if (twin !== -1) throw new Error(`This plan repeats chapter ${twin + 1}. Plan the next movement of the story: different scenes, a different situation at the end, and a title of its own.`);
  return { ...plan, targetWordCount: spec.targetWordsPerChapter };
}

const text = { type: 'string', minLength: 1 };
/** Constrained decoding keeps a long plan well-formed; an unterminated JSON object is unrecoverable. */
export const blueprintSchema = {
  type: 'object', required: ['centralConflict', 'protagonistChange', 'endingPayoff', 'characters', 'promises'],
  properties: {
    centralConflict: text, protagonistChange: text, endingPayoff: text,
    characters: { type: 'array', minItems: 1, items: { type: 'object', required: ['name', 'description'], properties: { name: text, description: text }, additionalProperties: false } },
    promises: { type: 'array', minItems: 1, items: { type: 'object', required: ['id', 'description', 'setupChapter', 'payoffChapter', 'required'], properties: { id: text, description: text, setupChapter: { type: 'integer' }, payoffChapter: { type: 'integer' }, required: { type: 'boolean' } }, additionalProperties: false } },
  }, additionalProperties: false,
};
const planStrings = ['title', 'summary', 'sceneBreakdown', 'characterDevelopmentFocus', 'plotAdvancement', 'timelineIndicators', 'emotionalToneTension', 'connectionToNextChapter', 'openingHook', 'chapterEnding', 'moralDilemma', 'consequencesOfChoices', 'rhythmPacing'];
export const chapterPlanSchema = {
  type: 'object', required: [...planStrings, 'tensionLevel', 'detailedScenes'],
  properties: {
    ...Object.fromEntries(planStrings.map(field => [field, text])),
    tensionLevel: { type: 'integer' },
    detailedScenes: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', required: ['sceneId', 'location', 'participants', 'objective', 'conflict', 'outcome', 'duration', 'mood', 'keyMoments', 'narrativeWeight', 'conflictCarriedBy'], properties: { narrativeWeight: { type: 'integer', minimum: 1, maximum: 5 }, conflictCarriedBy: { type: 'string', enum: ['speech', 'action', 'solitude'] }, sceneId: text, location: text, participants: { type: 'array', items: text }, objective: text, conflict: text, outcome: text, duration: text, mood: text, keyMoments: { type: 'array', minItems: 1, items: text } }, additionalProperties: false } },
  }, additionalProperties: false,
};

/**
 * A competent reviewer surfaces a different real defect on each pass, so a chapter converges over
 * several rounds. This is patience, not leniency: acceptance still requires zero non-minor issues.
 */
const MAX_CHAPTER_REPAIRS = 5;
/** Repairs of the same finding before the loop admits that local revision is the wrong tool for it. */
const LOCAL_REPAIR_ATTEMPTS = 2;

/** An absolute ceiling, so a chapter that keeps producing new defects still ends. */
const MAX_CHAPTER_VERSIONS = 14;

/** One second chance per chapter: a texture retry costs a call and must not become its own loop. */
const MAX_TEXTURE_RETRIES = 1;

/** One redraw of an unusable review: two samples that both miss the prose are a verdict, not bad luck. */
/**
 * Redraws of a review that could not be used. It was one, which meant two attempts asked the same
 * question the same way; the second now carries the reason the first was discarded, so a third is
 * worth having. A live chapter died here with every measured check clean, because a reader quoted
 * three passages from memory.
 */
const MAX_REVIEW_REDRAWS = 2;

/**
 * A repair may not buy its fix with the chapter's texture. This compares a revision against the text
 * it came from, so it needs no fitted threshold: silencing the dialogue a chapter had, or fusing its
 * paragraphs into far longer blocks, is a regression whatever the absolute numbers are.
 */
export function textureRegression(before: ProsodyMetrics, after: ProsodyMetrics, shorteningExpected = false, origin?: ProsodyMetrics): string | undefined {
  const damage: string[] = [];
  // Between "do not pad" and "do not condense" a repair could quietly take a fifth of the chapter.
  if (!shorteningExpected && after.words < before.words * 0.85) {
    damage.push(`it cut the chapter from ${before.words} to ${after.words} words although no issue asked for anything to be removed.`);
  }
  // Below a handful of spoken paragraphs "halved" is arithmetic, not damage: a solitary chapter with
  // one line would spend a repair defending it. Guard an exchange, not a stray line.
  const spokenBefore = Math.round(before.dialogueShare * before.paragraphs);
  if (spokenBefore >= 3 && after.dialogueShare < before.dialogueShare / 2) {
    damage.push(`it cut spoken dialogue from ${Math.round(before.dialogueShare * 100)}% of paragraphs to ${Math.round(after.dialogueShare * 100)}%.`);
  }
  if (after.medianParagraphWords > before.medianParagraphWords * 1.25 && after.medianParagraphWords > 60) {
    damage.push(`it grew the median paragraph from ${before.medianParagraphWords} to ${after.medianParagraphWords} words by fusing separate beats.`);
  }
  if (after.longestParagraphWords > before.longestParagraphWords * 1.5 && after.longestParagraphWords > 250) {
    damage.push(`it grew the longest paragraph from ${before.longestParagraphWords} to ${after.longestParagraphWords} words.`);
  }
  // Nine revisions of one chapter raised comparison density from 3.4 to 4.8 per 1000 words without a
  // single step large enough to notice. Drift is only visible against where the chapter started.
  const drifted = (name: string, from: number | undefined, to: number | undefined) =>
    // A chapter that began with none of a device and acquired it through repairs has drifted too, so
    // the rise is relative with an absolute floor rather than a ratio that division by zero silences.
    from !== undefined && to !== undefined && to > from * 1.25 && to > 1
      ? `it has carried ${name} from ${from.toFixed(1)} to ${to.toFixed(1)} per 1000 words across this chapter's revisions.` : undefined;
  if (origin) {
    for (const note of [drifted('comparisons', origin.similesPer1000, after.similesPer1000),
      drifted('modifier pairs', origin.stackedAdjectivesPer1000, after.stackedAdjectivesPer1000),
      drifted('coordinate series', origin.serialExplanationsPer1000, after.serialExplanationsPer1000)]) if (note) damage.push(note);
  }
  return damage.length ? damage.join(' ') : undefined;
}

export class NeedsRevisionError extends Error {}

/**
 * Whether a freshly written scene is one the chapter already has. Compared on sentences rather than
 * on the whole string: a copy that differs by a word is the same failure as a byte-identical one.
 */
export function copyOfEarlierScene(scene: string, earlier: string[] = []): boolean {
  const sentences = (text: string) => new Set(text.split(/(?<=[.!?…])\s+/).map(item => item.trim()).filter(item => item.length > 80));
  const fresh = sentences(scene);
  if (fresh.size < 3) return false; // Too short to judge; the emptiness check speaks for these.
  return earlier.some(previous => {
    const before = sentences(previous);
    if (!before.size) return false;
    const shared = [...fresh].filter(item => before.has(item)).length;
    return shared / fresh.size > 0.5;
  });
}

/** Findings about a share of the chapter rather than a place in it. */
export const distributedIssues = ['speech-tag-bloat', 'simile-density', 'adjective-stacking', 'serial-explanation', 'paragraph-monotony'];

/**
 * Each of these asks the writer to go through the whole chapter, and four such demands in one repair
 * produced four revisions that moved almost nothing: comparisons fell half a point and the other three
 * measures stood. Passing one at a time keeps a repair to a single sweep; the rest return next round,
 * still measured, still failing, until each has had its turn.
 *
 * Severity alone never gave them that turn. The same sweep is the gravest one every round, so a chapter
 * held up by its meaning spent every round of a long repair on that one measure while the four others
 * stood untouched from the first draft to the last. `served` records which sweeps this chapter has
 * already had a round for; the next round goes to one that has not, and when all of them have, the
 * rotation starts again on whatever is still measured.
 */
export function nextSweep(issues: ReviewIssue[], served: string[] = []): { issues: ReviewIssue[]; served: string[] } {
  const spread = issues.filter(issue => distributedIssues.includes(issue.id));
  if (!spread.length) return { issues, served };
  const waiting = spread.filter(issue => !served.includes(issue.id));
  const round = waiting.length ? waiting : spread;
  const rank = { critical: 0, major: 1, minor: 2 } as const;
  const chosen = [...round].sort((first, second) => rank[first.severity] - rank[second.severity])[0];
  return {
    issues: spread.length < 2 ? issues : issues.filter(issue => !distributedIssues.includes(issue.id) || issue === chosen),
    served: waiting.length ? [...served, chosen.id] : [chosen.id],
  };
}

/** The findings a repair should carry when the sweeps take their turns in order. */
export function oneDistributedAtATime(issues: ReviewIssue[], served: string[] = []): ReviewIssue[] {
  return nextSweep(issues, served).issues;
}

/** Whether a revision left the prose as it was: sentence sets identical, whitespace aside. */
export function unchanged(before: string, after: string): boolean {
  const sentences = (text: string) => text.split(/(?<=[.!?…])\s+/).map(item => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const first = sentences(before);
  const second = sentences(after);
  if (first.length !== second.length) return false;
  return first.every((sentence, index) => sentence === second[index]);
}

export class NovelEngine {
  constructor(private llm: NovelLLM, private store: RunStore, private onUpdate: (run: NovelRun) => void = () => {}, private embed?: Embedder, private rerank?: Reranker) {}

  /**
   * Report mode: measured prose texture is recorded on the version and never fails a chapter. The
   * budgets were fitted to one manuscript, so they earn the right to block only after more runs.
   * A measurement failure is logged on the version too; it must not lose a reviewed chapter.
   */
  private async measureProsody(run: NovelRun, chapter: ChapterRecord, candidate: ChapterVersion): Promise<void> {
    if (candidate.prosody?.checkedRevision === candidate.revision) return;
    const earlier = run.chapters.filter(item => item.number < chapter.number)
      .map(item => ({ item, version: acceptedVersion(item) }))
      .filter((entry): entry is { item: ChapterRecord; version: ChapterVersion } => Boolean(entry.version))
      .map(entry => ({ chapter: entry.item.number, revision: entry.version.revision, content: entry.version.content }));
    try {
      candidate.prosody = await prosodyReport(chapter.number, candidate, earlier, run.spec.language, this.embed, undefined, chapter.plan.detailedScenes || [], this.rerank);
    } catch (error) {
      // Only repetition needs the embedder. Dropping every finding when the network hiccups let a
      // chapter measured at 6.0 comparisons per 1000 report itself clean, ceiling and all.
      const offline = await prosodyReport(chapter.number, candidate, [], run.spec.language, undefined, undefined, chapter.plan.detailedScenes || []);
      candidate.prosody = { ...offline, error: error instanceof Error ? error.message : String(error) };
    }
    await this.checkpoint(run);
  }

  private async checkpoint(run: NovelRun) {
    run.updatedAt = Date.now();
    await this.store.save(run); // Never report a saved stage before its transaction commits.
    this.onUpdate(structuredClone(run));
  }

  /**
   * The outline is the book's creative foundation: it belongs to the writer model, not the contract checker.
   * The schema pins outline to a string; a nested chapter object is not a usable outline.
   */
  async outline(run: NovelRun): Promise<void> {
    run.outline = await structuredResponse(`${specPrompt(run.spec)}${narrativeDesign}\nDevelop a complete outline for exactly ${run.spec.chapterCount} chapters. Establish the central conflict, protagonist desire and inner need, opposition, causal escalation, major choices and their costs, planted clues and payoffs, differentiated character voices, and an earned ending. Describe the actual ending, not a teaser.` + '\nReturn JSON {"outline":"the complete outline"}.', 'You are a novel architect developing the author\'s story.', this.llm, ['outline'], raw => {
      if (typeof raw.outline !== 'string' || !raw.outline.trim()) throw new Error('The outline is empty.');
      return raw.outline.trim();
    }, { temperature: 0.6, maxTokens: 8192, route: 'writer', schema: { type: 'object', required: ['outline'], properties: { outline: { type: 'string', minLength: 1 } }, additionalProperties: false } });
    await this.checkpoint(run);
  }

  private async plan(run: NovelRun) {
    run.stage = 'planning';
    await this.checkpoint(run);
    if (!run.blueprint) {
      run.blueprint = await structuredResponse(`${specPrompt(run.spec)}${narrativeDesign}\nAPPROVED OUTLINE:\n${run.outline}\nReturn JSON {"centralConflict":"goal, opposition, escalation and stakes","protagonistChange":"initial belief, decisive choice, cost and final change","endingPayoff":"external and emotional resolution","characters":[{"name":"name","description":"desire, need, contradiction, agency, speech habits and relationships"}],"promises":[{"id":"stable-id","description":"specific setup and earned payoff","setupChapter":1,"payoffChapter":${run.spec.chapterCount},"required":true}]}. Schedule all required payoffs inside this book. Optional series threads may remain open but must have required=false. Include the central conflict and emotional arc among the required promises.`, 'You build an explicit novel blueprint. Respond only with JSON.', this.llm, ['centralConflict', 'protagonistChange', 'endingPayoff', 'characters', 'promises'], raw => validateBlueprint(raw, run.spec), { temperature: 0.3, maxTokens: 8192, route: 'writer', schema: blueprintSchema });
      await this.checkpoint(run);
    }
    for (let number = run.chapters.length + 1; number <= run.spec.chapterCount; number++) {
      const planPrompt = `${specPrompt(run.spec)}${narrativeDesign}\nOUTLINE:\n${run.outline}\nBLUEPRINT AND PREVIOUS CHAPTER PLANS:\n${JSON.stringify(run.blueprint)}\nPlan chapter ${number}/${run.spec.chapterCount}, role=${chapterRole(number, run.spec.chapterCount)}. Every scene needs a goal, resistance, a consequential choice and changed situation. Follow scheduled promise setups and payoffs. Vary pacing intentionally; a quiet consequence scene need not contain a fight or cliffhanger. Return JSON with strings title, summary, sceneBreakdown, characterDevelopmentFocus, plotAdvancement, timelineIndicators, emotionalToneTension, connectionToNextChapter, openingHook, chapterEnding, moralDilemma, consequencesOfChoices, rhythmPacing; integer tensionLevel; and detailedScenes:[{sceneId,location,participants:[names],objective,conflict,outcome,duration,mood,keyMoments:[specific beats],narrativeWeight:1–5,conflictCarriedBy:"speech"|"action"|"solitude"}]. Set conflictCarriedBy to how the scene's conflict actually reaches the reader: "speech" when two or more characters press their opposing aims on each other in conversation, "action" when the decisive pressure is physical, "solitude" when the character faces it alone. A scene with several present characters whose interests differ is normally carried by speech; a novel in which no scene is carried by speech is a novel without dialogue. Allocate narrativeWeight by dramatic importance: brief connective scenes get less space than the decisive confrontation, its reversals and cost. These weights divide the chapter word budget; they are not tension scores or elapsed time. Use 1–8 scenes. For the final chapter, connectionToNextChapter must describe closure or an intentional series thread.`;
      const decode = (raw: any) => validateChapterPlan(raw, run.spec, run.blueprint!.chapters);
      const settings = { maxTokens: 8192, route: 'writer' as const, schema: chapterPlanSchema };
      let plan: ParsedChapterPlan;
      try {
        plan = await structuredResponse(planPrompt, 'You plan causally connected scenes for a novel. Respond only with JSON.', this.llm, ['title', 'detailedScenes'], decode, { temperature: 0.4, ...settings });
      } catch (error) {
        // The generic retry answers a validation failure by lowering temperature, which is the wrong
        // medicine for "you repeated yourself": ask again, pointedly, with room to invent instead.
        if (!/repeats chapter/.test(String(error))) throw error;
        const unfulfilled = (run.blueprint.promises || []).filter(promise => promise.payoffChapter >= number);
        plan = await structuredResponse(`${planPrompt}\nYour previous attempt returned a copy of an earlier chapter of this same book. Plan what happens NEXT instead: the situation this chapter starts from is the one the previous chapter ended in, and it must not end where that chapter ended. These promises are still unpaid and are the material this chapter has to work with:\n${JSON.stringify(unfulfilled)}\nGive the chapter its own title, its own scenes and its own final situation.`,
          'You plan causally connected scenes for a novel. Respond only with JSON.', this.llm, ['title', 'detailedScenes'], decode, { temperature: 0.9, ...settings });
      }
      run.blueprint.chapters.push(plan);
      const chapter: ChapterRecord = { number, plan, status: 'pending', versions: [], repairAttempts: 0 };
      if (run.importedDrafts?.[number - 1]?.trim()) addCandidate(chapter, run.importedDrafts[number - 1], 'Imported manuscript: requires review before acceptance');
      run.chapters.push(chapter);
      await this.checkpoint(run);
    }
    await this.speechSomewhere(run);
  }

  /**
   * Semantic review is sampled, so a second pass over unchanged prose can miss what the first proved.
   * An evidenced non-minor defect therefore survives until the prose that carries it actually changes.
   */
  private carriedIssues(chapter: ChapterRecord, candidate: ChapterVersion, superseded?: ReviewReport): ReviewIssue[] {
    const reports = [superseded, ...chapter.versions.filter(version => version.revision !== candidate.revision && version.content === candidate.content).map(version => version.review)];
    const seen = new Set((candidate.review?.issues || []).map(issue => issue.id));
    const carried: ReviewIssue[] = [];
    for (const report of reports) {
      for (const issue of report?.issues || []) {
        // Literary findings depend on prior prose; their own versioned gate handles carry-over.
        if (issue.id.startsWith('literary-') || issue.severity === 'minor' || seen.has(issue.id)) continue;
        const evidence = issue.evidence.map(item => ({ ...item, chapter: chapter.number, revision: candidate.revision }))
          .filter(item => evidenceExists(item, chapter.number, candidate));
        if (!evidence.length) continue; // The cited prose is gone, so the finding no longer applies.
        seen.add(issue.id);
        carried.push({ ...issue, evidence });
      }
    }
    return carried;
  }

  /**
   * A book where nobody ever speaks is almost always a planning accident rather than a choice: the
   * first live run marked every scene of every chapter as solitude or action. Checked once, over the
   * whole book, and repaired by replanning the chapter that has the most people in a room — never by
   * ending the run, because a mute book is still a book and the author can decide otherwise.
   */
  private async speechSomewhere(run: NovelRun): Promise<void> {
    const plans = run.blueprint!.chapters;
    const scenesOf = (plan: ParsedChapterPlan) => (plan.detailedScenes || []) as { participants: string[]; conflictCarriedBy?: string }[];
    if (!plans.length || plans.some(plan => scenesOf(plan).some(scene => scene.conflictCarriedBy === 'speech'))) return;
    if (!plans.some(plan => scenesOf(plan).some(scene => scene.conflictCarriedBy !== undefined))) return; // planned before the field existed
    const crowded = plans.map((plan, index) => ({ index, together: scenesOf(plan).filter(scene => scene.participants.length >= 2).length }))
      .sort((a, b) => b.together - a.together)[0];
    if (!crowded.together) return; // Nobody shares a scene anywhere: the book is solitary by design.
    const number = crowded.index + 1;
    try {
      const replanned = await structuredResponse(`${specPrompt(run.spec)}${narrativeDesign}\nOUTLINE:\n${run.outline}\nBLUEPRINT AND CHAPTER PLANS:\n${JSON.stringify(run.blueprint)}\nNo scene in this entire book is marked conflictCarriedBy "speech", so the book as planned contains no dialogue at all. Replan chapter ${number}, keeping its events, its place in the story and its ending, so that the confrontation in it is argued out loud between the characters present, and mark that scene "speech". Change nothing that later chapters depend on.`,
        'You plan causally connected scenes for a novel. Respond only with JSON.', this.llm, ['title', 'detailedScenes'],
        raw => {
          const plan = validateChapterPlan(raw, run.spec, plans.filter((_, index) => index !== crowded.index));
          if (!(plan.detailedScenes || []).some((scene: { conflictCarriedBy?: string }) => scene.conflictCarriedBy === 'speech')) throw new Error('The replanned chapter still has no scene carried by speech.');
          return plan;
        }, { temperature: 0.4, maxTokens: 8192, route: 'writer', schema: chapterPlanSchema });
      plans[crowded.index] = replanned;
      run.chapters[crowded.index].plan = replanned;
      await this.checkpoint(run);
    } catch (error) {
      // A book that stays mute is the author's call to make, not a reason to lose the planning work.
      run.chapters[crowded.index].planningNote = `No scene in this book is carried by speech, and replanning chapter ${number} did not change that: ${error instanceof Error ? error.message : String(error)}`;
      await this.checkpoint(run);
    }
  }

  private async acceptOrRepair(run: NovelRun, chapter: ChapterRecord, candidate: ChapterVersion): Promise<void> {
    let repairsRetried = 0;
    let reviewsRedrawn = 0;
    let literaryRedrawn = 0;
    for (;;) {
      if (candidate.review?.validationVersion !== 2 || candidate.review.status !== 'passed' || candidate.review.checkedRevision !== candidate.revision) {
        const superseded = candidate.review;
        candidate.review = await reviewChapter(run, chapter, candidate, this.llm);
        if (candidate.review.status !== 'not_checked') {
          // What the round before this one saw, so a judgement of taste has to be seen twice before it
          // stops a chapter. The previous version's report is the second opinion; there is no need to
          // ask for one.
          const earlier = chapter.versions.find(item => item.revision === candidate.revision - 1)?.review?.issues || [];
          candidate.review.issues = confirmedFindings(candidate.review.issues, earlier)
            .map(issue => (chapter.unrepairable || []).some(known => sameFinding(known as typeof issue, issue))
              ? { ...issue, severity: 'minor' as const } : issue);
          candidate.review.status = candidate.review.issues.some(issue => issue.severity !== 'minor') ? 'failed' : 'passed';
          const carried = this.carriedIssues(chapter, candidate, superseded);
          if (carried.length) {
            candidate.review.issues = [...candidate.review.issues, ...carried];
            candidate.review.status = 'failed';
          }
        }
        await this.checkpoint(run);
      }
      await this.measureProsody(run, chapter, candidate);
      // Which measurements act is expressed as their severity: repetition and serial explanation name
      // a defect and quote it, while the fitted density budgets stay minor and only inform a repair
      // that some other finding already triggered.
      // Merged whenever the review reached a verdict, not only when it passed: gating them behind a
      // clean review meant that a chapter the editor had already failed went into repair without its
      // measured defects, and three doubled paragraphs survived every round untouched.
      if (candidate.review.status !== 'not_checked') {
        const acting = (candidate.prosody?.findings || []).filter(issue => issue.severity !== 'minor'
          && !candidate.review!.issues.some(existing => existing.id === issue.id));
        if (acting.length) candidate.review = { ...candidate.review, status: 'failed', issues: [...candidate.review.issues, ...acting] };
      }
      if (candidate.review.status === 'passed') {
        if (!literaryCurrent(run, chapter.number, candidate)) {
          // Byte-identical prose, or a revision so small that every passage the assessment cites is
          // still on the page: either way the reading it produced still describes this chapter.
          const reusable = chapter.versions.find(version => version !== candidate && literaryCurrent(run, chapter.number, version)
            && (version.content === candidate.content || literaryStillHolds(version, candidate, chapter.number)));
          if (reusable) {
            const identicalLiterary = reusable;
            candidate.literary = structuredClone(identicalLiterary.literary);
            candidate.literary.checkedRevision = candidate.revision;
            for (const item of [...candidate.literary.observations, ...candidate.literary.issues]) {
              for (const evidence of item.evidence) if (evidence.chapter === chapter.number) evidence.revision = candidate.revision;
            }
          } else {
            // A gate that cannot cite its evidence has failed to judge, not judged the chapter badly.
            // The assessment is sampled like the review, so an unusable draw deserves another; what it
            // must never do is end the run by exception, losing every accepted chapter behind it.
            try { candidate.literary = await assessLiteraryDevelopment(run, chapter, candidate, this.llm); }
            catch (error) {
              if (literaryRedrawn >= MAX_REVIEW_REDRAWS) {
                chapter.status = 'needs_revision';
                await this.checkpoint(run);
                throw new NeedsRevisionError(`Chapter ${chapter.number} needs editorial attention: the literary assessment could not be completed (${error instanceof Error ? error.message : String(error)}).`);
              }
              literaryRedrawn++;
              candidate.literary = await assessLiteraryDevelopment(run, chapter, candidate, this.llm);
            }
          }
          await this.checkpoint(run);
        }
        if (candidate.literary.status === 'failed') {
          candidate.review = { ...candidate.review, status: 'failed', issues: [...candidate.review.issues, ...candidate.literary.issues] };
        }
      }
      if (candidate.review.status === 'passed') {
        const identical = chapter.versions.find(version =>
          version.revision !== candidate.revision && version.content === candidate.content && version.analysis,
        );
        if (identical?.analysis) {
          candidate.analysis = structuredClone(identical.analysis);
          for (const items of [candidate.analysis.facts, candidate.analysis.events, candidate.analysis.promises, candidate.analysis.beats || []]) {
            for (const item of items) item.evidence.revision = candidate.revision;
          }
          const knownPromiseIds = new Set(run.blueprint?.promises.map(promise => promise.id) || []);
          candidate.analysis.promises = candidate.analysis.promises.filter(promise => knownPromiseIds.has(promise.promiseId));
          validateAnalysis(candidate.analysis, chapter.number, candidate);
        } else {
          candidate.analysis = await analyseChapter(run, chapter, candidate, this.llm);
        }
        // A chapter is accepted on what it put on the page, not on what it was asked to put there.
        // Accepting a chapter whose planned scene was never written writes the gap into canon, and
        // every later chapter then builds on an event this book never told.
        const gap = beatCoverageIssue(chapter, candidate.analysis, candidate);
        if (gap) {
          candidate.review = { ...candidate.review, status: 'failed', issues: [...candidate.review.issues, gap] };
          await this.checkpoint(run);
        } else {
          acceptCandidate(run, chapter.number);
          await this.checkpoint(run);
          return;
        }
      }
      if (candidate.review.status === 'not_checked') {
        // "Not checked" says we do not know, not that the chapter is bad. The review is sampled, so an
        // unusable draw deserves another before a chapter dies: one whose every citation missed the
        // prose ended a run whose measured texture was clean of every defect this engine can see.
        if (reviewsRedrawn < MAX_REVIEW_REDRAWS) {
          reviewsRedrawn++;
          // Tell the reader why its last report was thrown away. A redraw that repeats the question
          // word for word invites the same answer, and the usual reason is quotation: a passage
          // remembered rather than copied cannot be found in the prose and voids the finding with it.
          candidate.review = await reviewChapter(run, chapter, candidate, this.llm,
            candidate.review.error ? `\nYOUR PREVIOUS REPORT ON THIS CHAPTER WAS DISCARDED: ${candidate.review.error} Every quotation must be copied character for character out of the prose above — open the passage, copy it, do not retype it from memory and do not tidy its punctuation. A finding whose quotation cannot be found is lost entirely, so quote less and quote exactly: a single accurate sentence is worth more than a paragraph approximately recalled.` : '');
          await this.checkpoint(run);
          if (candidate.review.status !== 'not_checked') continue;
        }
        chapter.status = 'needs_revision';
        throw new NeedsRevisionError(`Chapter ${chapter.number} needs editorial attention: ${candidate.review.error || 'Review failed or was offline.'}`);
      }
      // A round that answered the previous findings made progress, whatever it uncovered next. The
      // budget counts rounds that faced the same findings again, which is what being stuck means —
      // and "the same" is what a finding is about, not how it was worded this time. Comparing the
      // reports as text let two chapters spend a full budget each without ever counting as stuck.
      // Per finding, not per report: a finding that outlives three rounds has outlived local repair,
      // whatever else came and went beside it. One chapter carried the same measurement through nine
      // consecutive rounds because the set around it changed every time and the set was what counted.
      const previousShapes = chapter.lastFindingShapes;
      const streaks = findingStreaks(candidate.review.issues, previousShapes);
      chapter.lastFindingShapes = streaks;
      const worn = streaks.filter(item => item.streak >= LOCAL_REPAIR_ATTEMPTS + 1 && item.category !== 'canon' && item.category !== 'format');
      if (worn.length) {
        chapter.planningNote = `Findings no local repair could answer after ${LOCAL_REPAIR_ATTEMPTS + 1} rounds: ${worn.map(item => item.description).join('; ')}`;
        chapter.unrepairable = [...(chapter.unrepairable || []), ...worn.map(({ id, category, description }) => ({ id, category, description }))];
        chapter.lastFindingShapes = streaks.filter(item => !worn.includes(item));
        candidate.review = {
          ...candidate.review,
          issues: candidate.review.issues.map(issue => worn.some(item => item.id === issue.id && item.description === issue.description) ? { ...issue, severity: 'minor' as const } : issue),
        };
        candidate.review.status = candidate.review.issues.some(issue => issue.severity !== 'minor') ? 'failed' : 'passed';
        await this.checkpoint(run);
        continue;
      }
      chapter.repairAttempts = sameFindingSet(candidate.review.issues, (previousShapes || []) as typeof candidate.review.issues) ? chapter.repairAttempts + 1 : 0;
      chapter.lastFindings = JSON.stringify(candidate.review.issues.map(issue => issue.description).sort());
      // A finding that survived two repairs is not going to yield to a third of the same kind. Local
      // revision is the only tool this loop has, so when it has failed twice the honest move is to
      // stop spending the budget on it: the finding is recorded as one the chapter cannot answer
      // locally and demoted, and the round after it faces whatever else is actually there. Two
      // chapters spent a full budget each this way, on findings no local edit could satisfy.
      if (chapter.repairAttempts >= LOCAL_REPAIR_ATTEMPTS) {
        // A contradiction of canon or a broken format always has a local answer — deleting a repeated
        // passage, removing a wedged character — so those keep their standing however long they take.
        const stubborn = candidate.review.issues.filter(issue => issue.severity !== 'minor'
          && issue.category !== 'canon' && issue.category !== 'format');
        if (stubborn.length) {
          chapter.planningNote = `Findings no local repair could answer after ${chapter.repairAttempts} attempts: ${stubborn.map(issue => issue.description).join('; ')}`;
          chapter.unrepairable = [...(chapter.unrepairable || []), ...stubborn.map(({ id, category, description }) => ({ id, category, description }))];
          candidate.review = {
            ...candidate.review,
            issues: candidate.review.issues.map(issue => stubborn.includes(issue) ? { ...issue, severity: 'minor' as const } : issue),
          };
          chapter.repairAttempts = 0;
          chapter.lastFindingShapes = undefined;
          await this.checkpoint(run);
          continue;
        }
      }
      if (chapter.repairAttempts >= MAX_CHAPTER_REPAIRS || chapter.versions.length - (chapter.repairVersionStart || 0) >= MAX_CHAPTER_VERSIONS) {
        chapter.status = 'needs_revision';
        throw new NeedsRevisionError(`Chapter ${chapter.number} needs editorial attention: ${candidate.review.error || candidate.review.issues.map(issue => issue.description).join('; ')}`);
      }
      await this.checkpoint(run);
      const repetition = candidate.review.issues.filter(issue => !issue.id.startsWith('literary-') && (issue.id === 'duplicated-passage' || issue.id === 'restated-passage' || /redundan|repetit|duplicat|identical|overlapping/i.test(issue.description)));
      // A draft too repetitive to survive deletion is a chapter to rewrite, not a run to abandon:
      // fall back to the ordinary repair and let the repair budget end it if nothing improves.
      const version = candidate;
      let content: string;
      let extra = '';
      // Cutting is the repair some issues actually ask for; only then may a revision come back shorter.
      let allowShortening = version.review!.issues.some(issue => issue.id === 'excess-length' || issue.id === 'duplicated-passage' || issue.id === 'restated-passage' || issue.id === 'recycled-passage' || issue.id === 'copied-passage');
      const sweep = nextSweep(version.review!.issues, chapter.distributedServed);
      if (!repetition.length) {
        chapter.distributedServed = sweep.served;
        content = await this.repair(run, chapter, version, sweep.issues);
      } else {
        try { content = await this.removeRedundancy(run, chapter, version, repetition); }
        catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          allowShortening = true;
          extra = `A deletion pass could not repair this chapter (${reason}). Rewrite the repeated material instead: tell each beat once, at the point it belongs, and delete every later retelling of it. Do not compensate for the removed length by restating what the chapter has already established. `;
          content = await this.repair(run, chapter, version, version.review!.issues, extra, true);
        }
      }
      // A repair that returns the chapter unchanged is not a repair, and nothing noticed: the stuck
      // counter watches the findings, which drift in wording every round, so six revisions of
      // byte-identical prose passed for progress and spent the budget.
      if (unchanged(version.content, content)) {
        chapter.distributedServed = sweep.served;
        content = await this.repair(run, chapter, version, sweep.issues,
          `${extra}Your previous attempt returned this chapter unchanged, sentence for sentence. If an issue cannot be answered inside this chapter, answer the ones that can and leave that one; returning the chapter as it stands answers nothing.`, allowShortening);
        // The stuck counter resets whenever the findings are worded differently, which they always
        // are, so a repair that does nothing needs its own count or it spends the whole budget.
        if (unchanged(version.content, content)) {
          // Twice asked, twice nothing changed: the writer has already answered that these findings
          // cannot be met by editing this chapter. That is the same answer the repair budget arrives
          // at after two failed attempts, so it gets the same treatment — the findings become
          // advisory and the chapter goes on — rather than ending the run over prose nobody touched.
          const unanswerable = candidate.review.issues.filter(issue => issue.severity !== 'minor'
            && issue.category !== 'canon' && issue.category !== 'format');
          if (unanswerable.length) {
            chapter.planningNote = `Findings no local repair could answer, and two attempts returned the chapter unchanged: ${unanswerable.map(issue => issue.description).join('; ')}`;
            chapter.unrepairable = [...(chapter.unrepairable || []), ...unanswerable.map(({ id, category, description }) => ({ id, category, description }))];
            candidate.review = {
              ...candidate.review,
              issues: candidate.review.issues.map(issue => unanswerable.includes(issue) ? { ...issue, severity: 'minor' as const } : issue),
            };
            chapter.repairAttempts = 0;
            chapter.lastFindingShapes = undefined;
            await this.checkpoint(run);
            continue;
          }
          chapter.status = 'needs_revision';
          throw new NeedsRevisionError(`Chapter ${chapter.number} needs editorial attention: two repairs in a row returned the chapter unchanged against ${candidate.review.issues.map(issue => issue.description).join('; ')}`);
        }
      }
      const origin = chapter.versions[0] && chapter.versions[0] !== version ? prosodyMetrics(chapter.versions[0].content, run.spec.language) : undefined;
      const damage = textureRegression(prosodyMetrics(version.content, run.spec.language), prosodyMetrics(content, run.spec.language), allowShortening, origin);
      if (damage && repairsRetried < MAX_TEXTURE_RETRIES) {
        // The repair closed its issue by making the prose worse. Ask again, naming what it destroyed,
        // before this version becomes the one every later revision builds on.
        repairsRetried++;
        content = await this.repair(run, chapter, version, candidate.review.issues,
          `${extra}A previous attempt at this repair damaged the chapter: ${damage} Repair the issues without doing that: keep the dialogue, the paragraph shapes and the scene rhythm this chapter already has.`, allowShortening);
        if (textureRegression(prosodyMetrics(version.content, run.spec.language), prosodyMetrics(content, run.spec.language), allowShortening, origin)) {
          // Two attempts damaged it the same way. Keep the repair rather than loop; the report records it.
          repairsRetried = MAX_TEXTURE_RETRIES;
        }
      }
      candidate = addCandidate(chapter, content, 'Repair reported chapter defects');
      await this.checkpoint(run);
    }
  }

  private extractProse(text: string): string {
    // Remove only explicitly delimited model thinking. Never guess which story section to discard.
    return stripThinking(text);
  }

  /**
   * Redundancy is repaired by deletion, never by rewriting. A model asked to rewrite a repeated beat
   * produces a third version of it; asked to cut, it can only remove. The result is checked: every
   * sentence kept must come from the chapter as it stood, and the chapter must actually get shorter.
   */
  /**
   * Redundancy is removed by the application, not by the model. Asking for the whole chapter back
   * makes reproducing four thousand words the precondition for cutting one paragraph, and a single
   * altered comma voids the pass. The model names the passages to drop; the deletion happens here,
   * so nothing can be reworded on the way through.
   */
  private async removeRedundancy(run: NovelRun, chapter: ChapterRecord, version: ChapterVersion, issues: ReviewIssue[]): Promise<string> {
    // Keep separators so deleting a sentence does not flatten the remaining paragraphs.
    const parts = version.content.split(/((?<=[.!?…])\s+)/);
    const sentences = parts.filter((_, index) => index % 2 === 0);
    const numbered = sentences.map((text, index) => ({ id: index + 1, text }));
    const doomed = await structuredResponse(`${specPrompt(run.spec)}\nTHESE PASSAGES SAY THE SAME THING TWICE:\n${JSON.stringify(issues)}\nCHAPTER SENTENCES:\n${JSON.stringify(numbered)}\nFor each repetition, choose the weaker occurrence for deletion and keep the stronger one. Where a whole aftermath or ending is told more than once, select every sentence of the weaker telling. Return JSON {"delete":[2,5]} using only integer sentence IDs from the list above. Each ID selects that specific occurrence. Do not copy or rewrite sentences.`,
      'You choose which repeated sentences a chapter should lose. You never write prose.', this.llm, ['delete'], raw => {
        if (!Array.isArray(raw.delete) || !raw.delete.length) throw new Error('List at least one sentence ID to delete.');
        if (raw.delete.some((id: unknown) => !Number.isInteger(id) || Number(id) < 1 || Number(id) > sentences.length)) {
          throw new Error(`Every deletion must be an integer sentence ID between 1 and ${sentences.length}.`);
        }
        return new Set<number>(raw.delete);
      }, { temperature: 0.1, maxTokens: 8192, route: 'writer',
           schema: { type: 'object', required: ['delete'], properties: { delete: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'integer', minimum: 1, maximum: sentences.length } } }, additionalProperties: false } });

    // Even if all identical occurrences were selected, preserve one copy of the beat.
    const occurrences = new Map<string, number[]>();
    sentences.forEach((text, index) => {
      const key = text.replace(/\s+/g, ' ').trim();
      occurrences.set(key, [...(occurrences.get(key) || []), index + 1]);
    });
    for (const ids of occurrences.values()) {
      if (ids.length > 1 && ids.every(id => doomed.has(id))) doomed.delete(ids[0]);
    }
    const cleaned = sentences.map((text, index) => doomed.has(index + 1) ? '' : text + (parts[index * 2 + 1] || '')).join('').trim();
    if (cleaned === version.content.trim()) throw new Error('The deletion pass did not remove any text.');
    // A deletion pass trims repetition; losing a third of the chapter is a different operation.
    if (cleaned.length < version.content.length * 0.6) throw new Error('The deletion pass would remove too much of the chapter.');
    if (!cleaned) throw new Error('The deletion pass emptied the chapter.');
    return cleaned;
  }

  /**
   * Repairs the passages the findings name, leaving the rest of the chapter untouched because the
   * writer never sees it. Falls back to the whole-chapter repair whenever the findings cannot be
   * placed, describe a proportion rather than a place, or would cover half the chapter anyway.
   */
  private async repairInPlace(run: NovelRun, chapter: ChapterRecord, version: ChapterVersion, issues: ReviewIssue[], extra: string): Promise<string | undefined> {
    const passages = repairableInPlace(version.content, issues, distributedIssues);
    if (!passages) return undefined;
    const prompt = `${specPrompt(run.spec)}${genreCraft(run.spec)}
CHAPTER ${chapter.number} PLAN:
${JSON.stringify(chapter.plan)}
ACCEPTED CANON BEFORE THIS CHAPTER:
${JSON.stringify(canonForPrompt(canonBefore(run, chapter.number)))}
You are repairing named passages of a chapter, not the chapter. Each passage below carries the findings against it. Return a replacement for each id.
PASSAGES:
${JSON.stringify(passages.map(passage => ({ id: passage.id, prose: passage.text, findings: passage.issues.map(issue => ({ description: issue.description, instruction: issue.instruction })) })))}
${extra}
A replacement is finished prose in the story's language, continuous with the chapter on either side of it: it begins where this passage began and ends where it ended, and the sentences around it do not change and are not yours to change. Answer the findings and nothing else — do not improve, extend or explain what they do not name, and do not add memory, backstory or an account of how something came to be. Where a finding says a character uses knowledge the story has not given them, take the knowledge away: let them guess, wonder, be wrong or say nothing. A replacement may be shorter than what it replaces; it must not be a summary of it.
Return JSON {"replacements":[{"id":"f1","prose":"..."}]} with one entry per id above, and nothing else.`;
    try {
      const answer = await structuredResponse(prompt, 'You perform targeted fiction revision on named passages. Return only the requested JSON.', this.llm, ['replacements'], raw => {
        if (!Array.isArray(raw.replacements)) throw new Error('The repair returned no replacements.');
        const given: Record<string, string> = {};
        for (const item of raw.replacements) {
          if (!item || typeof item.id !== 'string' || typeof item.prose !== 'string' || !item.prose.trim()) throw new Error('A replacement is missing its id or its prose.');
          given[item.id] = this.extractProse(item.prose);
        }
        // Every passage answered, and none of them answered with a synopsis of itself: a replacement
        // at a fifth of the length is a summary, and summarising is how a chapter loses its scenes.
        for (const passage of passages) {
          if (given[passage.id] === undefined) throw new Error(`No replacement for passage ${passage.id}.`);
          if (given[passage.id].length < passage.text.length * 0.2) throw new Error(`The replacement for ${passage.id} is a summary of it.`);
        }
        return given;
      }, { temperature: 0.3, maxTokens: Math.max(2048, passages.reduce((total, passage) => total + passage.text.length, 0)) });
      return applyPassages(version.content, passages, answer);
    } catch {
      // A targeted repair that could not be validated is not a reason to lose the round: the chapter
      // falls back to the repair that rewrites it whole, which is what it did before this existed.
      return undefined;
    }
  }

  private async repair(run: NovelRun, chapter: ChapterRecord, version: ChapterVersion, issues: ReviewIssue[], extra = '', allowShortening = false): Promise<string> {
    const inPlace = await this.repairInPlace(run, chapter, version, issues, extra);
    if (inPlace && inPlace !== version.content) return inPlace;
    // Findings about a share of the chapter rather than a place in it. "Change nothing uncited" and
    // "half the lines must end up bare" cannot both be obeyed, and the model obeys the cautious one.
    const distributed = distributedIssues;
    // The repair gets this chapter's literary intent, not the book's whole literary ledger: measured on
    // a live call, that ledger was 50.3% of a 118,000-character prompt while the issues to repair were
    // 2.6% of it, and four revisions moved nothing. Cross-chapter restatement has its own check now.
    // A revision must not silently condense the chapter, but demanding the target length back is how
    // padding gets bought: measured across seven revisions, a repair that lost 500 words returned them
    // as description and comparisons, never as dialogue or event. Ask for the missing length only when
    // an issue actually says content is missing.
    const target = chapter.plan.targetWordCount || run.spec.targetWordsPerChapter;
    const words = version.content.split(/\s+/).filter(Boolean).length;
    const missingContent = issues.some(issue => issue.id === 'incomplete-length' || /missing|omitted|truncat|incomplete|undramatized|not dramatized/i.test(`${issue.description} ${issue.instruction}`));
    const budget = allowShortening
      ? `\nLENGTH CONTRACT: the current version has ${words} words, much of it the same material told more than once. The revision will legitimately be shorter and must not be padded back to ${target} words. Keep every distinct scene, event and clue at full length; lose only the retellings.`
      : missingContent
        ? `\nLENGTH CONTRACT: the current version has ${words} words and the chapter target is ${target} words. The issues name content that is missing or undramatized, so add that content and return at least ${Math.ceil(target * 0.8)} words. Add the named material only; do not restate what the chapter already tells.`
        : `\nLENGTH CONTRACT: the current version has ${words} words. Keep every scene, event and clue at full length and do not condense, trim or summarize anything the issues do not name. Do not add length either: no new description, comparison or interior passage beyond what the issues require. A revision of roughly ${words} words is correct.`;
    const raw = await generateProse(this.llm, `${specPrompt(run.spec)}${genreCraft(run.spec)}${proseCraft(run, chapter)}\nLITERARY INTENT FOR THIS CHAPTER:\n${JSON.stringify(chapter.literaryPlan)}\nPLAN:\n${JSON.stringify(chapter.plan)}\nACCEPTED CANON BEFORE THIS CHAPTER:\n${JSON.stringify(canonForPrompt(canonBefore(run, chapter.number)))}\nREPAIR ONLY THESE ISSUES:\n${JSON.stringify(issues)}\nEach issue carries the exact passages it refers to. Locate those passages in the prose below and rewrite those passages. Reproduce every other sentence unchanged, word for word: a rewrite that regenerates the whole chapter reintroduces the same defect. The cited wording must not survive in the revision.${issues.some(issue => distributed.includes(issue.id)) ? ` One exception, and only for these issues: ${issues.filter(issue => distributed.includes(issue.id)).map(issue => issue.id).join(', ')}. They describe a proportion of the whole chapter, their quotations are examples rather than the full extent of the defect, and editing only the quoted lines cannot change a proportion — a live chapter sat at 92% through six revisions that way. For those issues change every line in the chapter that carries the same defect, and leave everything else exactly as it stands.` : ''}\n${extra}\nFULL CURRENT PROSE:\n${version.content}\nReturn ONLY the complete revised chapter in the story's language. Do not output planning lists, outline scaffolding, working draft variants, or English commentary. Start directly with the story prose. Add no new memory, backstory or explanation of how something came to be: a character may not recall an origin the story has not given, and inventing one is the defect this review keeps finding. Where a finding says a character uses knowledge the story has not given them, repair it by taking the knowledge away — let the character guess, wonder, be wrong or say nothing — whatever the finding's own instruction asks for; a chapter spent fourteen revisions on one such finding because every round was told to supply the missing source and forbidden to invent one. Preserve all unaffected events, clues, names, scene outcomes and intentional voice. Do not add stock gestures, rename characters or impose synonym variation. Do not summarize or omit scenes.${budget}`, 'You perform targeted fiction revision. Return only the final revised story prose without scaffolding.', { temperature: 0.3, maxTokens: Math.max(8192, version.content.length) });
    return this.extractProse(raw).trim();
  }

  private async writeRemaining(run: NovelRun) {
    let chapter: ChapterRecord | undefined;
    while ((chapter = nextUnacceptedChapter(run))) {
      if (!chapter.literaryPlan || chapter.literaryPlan.contextKey !== literaryContextKey(run, chapter.number) || chapter.literaryPlan.chapterPlanKey !== JSON.stringify(chapter.plan)) {
        chapter.literaryPlan = await planLiteraryDevelopment(run, chapter, this.llm);
        await this.checkpoint(run);
      }
      let candidate = chapter.versions.find(version => version.revision === chapter.candidateRevision);
      if (!candidate && chapter.status === 'invalidated') {
        // Keep downstream prose but re-review it against the changed canon before allowing it back in.
        const previous = chapter.versions.find(version => version.revision === chapter.acceptedRevision) || chapter.versions.at(-1);
        if (previous) candidate = addCandidate(chapter, previous.content, 'Revalidate after upstream revision');
      }
      if (!candidate) {
        chapter.sceneDrafts ||= [];
        for (let sceneIndex = chapter.sceneDrafts.length; sceneIndex < chapter.plan.detailedScenes.length; sceneIndex++) {
          let scene = this.extractProse(await writeScene(run, chapter, sceneIndex, this.llm));
          // A live chapter arrived as scene one followed by scene two written four times: the writer,
          // shown the prose already written, returned it again for every remaining scene. Catching the
          // copy here costs one call; letting it through cost that chapter fourteen revisions.
          if (copyOfEarlierScene(scene, chapter.sceneDrafts)) {
            scene = this.extractProse(await writeScene(run, chapter, sceneIndex, this.llm, 'Your previous attempt returned prose already written for an earlier scene of this chapter. That scene is finished. Write the scene requested here: it starts from the situation the earlier prose ended in and must not retell it.'));
            if (copyOfEarlierScene(scene, chapter.sceneDrafts)) throw new Error(`Scene ${sceneIndex + 1} of chapter ${chapter.number} came back as a copy of an earlier scene twice.`);
          }
          if (!scene) throw new Error(`Scene ${sceneIndex + 1} of chapter ${chapter.number} is empty.`);
          // Not the whole scene copied, but passages of it told again. Compared now, the answer is to
          // write one scene of eight hundred words; found after the chapter is finished — where twelve
          // of the twenty-five blocking findings on first drafts were found — the answer is to rewrite
          // the chapter around it. One attempt: a second restatement is the chapter review's business.
          const restated = restatedFromEarlierScenes(scene, chapter.sceneDrafts);
          if (restated.length) {
            const retold = restated.slice(0, 4).map(item => `"${item.sentence}" repeats "${item.source}"`).join('; ');
            const rewritten = this.extractProse(await writeScene(run, chapter, sceneIndex, this.llm,
              `Your previous attempt told again what earlier scenes of this chapter have already put on the page: ${retold}. Those events happened; this scene begins after them. Write this scene's own material, and refer to what is already told only as something the characters take for granted.`));
            if (rewritten && restatedFromEarlierScenes(rewritten, chapter.sceneDrafts).length < restated.length) scene = rewritten;
          }
          chapter.sceneDrafts.push(scene);
          chapter.status = 'draft';
          await this.checkpoint(run);
        }
        candidate = addCandidate(chapter, chapter.sceneDrafts.join('\n\n***\n\n'), 'Initial chapter draft');
        await this.checkpoint(run);
      }
      await this.acceptOrRepair(run, chapter, candidate);
    }
  }

  private async globalReview(run: NovelRun, phase: 'structure' | 'final') {
    const field = phase === 'structure' ? 'structuralReview' : 'finalReview';
    const attempts = phase === 'structure' ? 'structuralAttempts' : 'finalAttempts';
    for (;;) {
      run[field] = await reviewBook(run, this.llm, phase);
      await this.checkpoint(run);
      if (run[field].status === 'passed') return;
      const report = run[field];
      if (report.status === 'not_checked' || (run[attempts] || 0) >= 2) throw new NeedsRevisionError(`Book ${phase} review needs attention: ${report.error || report.issues.map(issue => issue.description).join('; ')}`);
      run[attempts] = (run[attempts] || 0) + 1;
      await this.checkpoint(run);
      const affected = new Set(report.issues.filter(issue => issue.severity !== 'minor').flatMap(issue => issue.evidence.map(evidence => evidence.chapter)));
      // Missing required promise evidence needs a targeted task at its scheduled chapter.
      for (const promise of run.blueprint.promises.filter(item => item.required)) {
        if (!run.canon.promises.some(item => item.promiseId === promise.id && item.kind === 'setup')) affected.add(promise.setupChapter);
        if (!run.canon.promises.some(item => item.promiseId === promise.id && item.kind === 'payoff')) affected.add(promise.payoffChapter);
      }
      if (!affected.size) throw new NeedsRevisionError('Book review failed without an actionable repair target.');
      for (const number of [...affected].sort((a, b) => a - b)) {
        await this.writeRemaining(run);
        const chapter = run.chapters[number - 1];
        const version = acceptedVersion(chapter);
        const issues = report.issues.filter(issue => issue.evidence.some(evidence => evidence.chapter === number));
        const content = await this.repair(run, chapter, version, issues, `GLOBAL REVIEW: ${report.error || ''}\nRequired promises for this chapter: ${JSON.stringify(run.blueprint.promises.filter(promise => promise.setupChapter === number || promise.payoffChapter === number))}`);
        const candidate = addCandidate(chapter, content, `Address ${phase} review`);
        await this.checkpoint(run);
        await this.acceptOrRepair(run, chapter, candidate);
      }
      await this.writeRemaining(run);
    }
  }

  private async lineEdit(run: NovelRun) {
    for (const chapter of run.chapters) {
      await this.writeRemaining(run);
      const version = acceptedVersion(chapter);
      if (chapter.lineEditedRevision === version.revision) continue;
      // Reuse the evidenced local review. No blanket rewrite for a chapter without actionable issues.
      const issues = version.review?.issues.filter(issue => ['dialogue', 'voice', 'pacing', 'hook', 'audience'].includes(issue.category)) || [];
      if (issues.length) {
        const content = await this.repair(run, chapter, version, issues);
        const candidate = addCandidate(chapter, content, 'Targeted line edit');
        await this.checkpoint(run);
        await this.acceptOrRepair(run, chapter, candidate);
      }
      chapter.lineEditedRevision = chapter.acceptedRevision;
      await this.checkpoint(run);
    }
    await this.writeRemaining(run);
  }

  async continue(run: NovelRun, options: { retry?: boolean } = {}): Promise<void> {
    try {
      if (reconcileCheckpoint(run)) await this.checkpoint(run);
      if (!run.outline.trim()) throw new Error('Approve an outline before continuing.');
      if (run.stage === 'complete') return;
      if (options.retry) {
        for (const chapter of run.chapters) {
          if (chapter.candidateRevision === undefined && chapter.status !== 'needs_revision') continue;
          chapter.repairAttempts = 0;
          chapter.lastFindings = undefined;
          chapter.lastFindingShapes = undefined;
          chapter.repairVersionStart = chapter.versions.length;
        }
        await this.checkpoint(run);
      }
      if (run.stage === 'needs_revision') run.stage = run.resumeStage || 'writing';
      run.error = undefined;
      if (run.stage === 'outline' || run.stage === 'planning') {
        await this.plan(run);
        run.stage = 'writing';
        await this.checkpoint(run);
      }
      await this.writeRemaining(run);
      if (run.stage === 'writing' || run.stage === 'structural_review') {
        run.stage = 'structural_review';
        await this.checkpoint(run);
        await this.globalReview(run, 'structure');
        run.stage = 'line_editing';
        await this.checkpoint(run);
      }
      if (run.stage === 'line_editing') {
        await this.lineEdit(run);
        run.stage = 'final_review';
        await this.checkpoint(run);
      }
      if (run.stage === 'final_review') {
        await this.globalReview(run, 'final');
        if (!run.title) {
          try {
            run.title = await structuredResponse(`${specPrompt(run.spec)}\nNOVEL SUMMARY:\n${JSON.stringify(run.canon.summaries)}\nGive this novel a distinctive title. Return JSON {"title":"the title"}.`, 'You title completed novels.', this.llm, ['title'], raw => {
              if (typeof raw.title !== 'string' || !raw.title.trim()) throw new Error('Missing title.');
              return raw.title.trim();
            }, { temperature: 0.5, route: 'writer', schema: { type: 'object', required: ['title'], properties: { title: { type: 'string', minLength: 1 } }, additionalProperties: false } });
          } catch {
            // A cosmetic model failure must not invalidate a fully reviewed manuscript.
            run.title = run.chapters[0]?.plan.title?.trim() || (run.spec.language.toLowerCase().startsWith('ru') ? 'Рукопись без названия' : 'Untitled Manuscript');
          }
        }
        run.stage = 'complete';
        await this.checkpoint(run);
      }
    } catch (error) {
      run.resumeStage = run.stage;
      run.stage = 'needs_revision';
      run.error = error instanceof Error ? error.message : String(error);
      await this.checkpoint(run);
      throw error;
    }
  }
}
