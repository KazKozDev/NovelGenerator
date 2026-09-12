import { assessLiteraryDevelopment, planLiteraryDevelopment } from './literary';
import { BESTSELLER_REQUIREMENTS, OUTCOME_TYPES, SAMPLING, SCENE_SHAPES, SHIFT_REGISTERS, STRUCTURE_BANS, buildIdeaSeed, ideaSeedPrompt, languageContract, normalizeSceneShape } from './diversity';
import { PLANNING_COHERENCE } from './coherence';
import { literaryContextKey, literaryCurrent, literaryStillHolds } from './literaryState';
import { proseCraft, narrativeDesign, sceneCountGuidance } from './proseCraft';
import { newlyBroken, newlyOrphaned, prosodyMetrics, prosodyReport, spokenLinesLost, type Embedder, type ProsodyMetrics } from './prosody';
import type { Reranker } from './reranker';
import type { Summarizer } from './summarizer';
import { applyPassages, repairableInPlace } from './patch';
import type { Character, ParsedChapterPlan, LLMProviderConfig } from '../../types';
import type { BookBlueprint, BookSpec, ChapterArc, ChapterRecord, ChapterVersion, MajorTurn, NovelRun, PlanningIssue, ReviewIssue, ReviewReport, SceneJournal } from './contracts';
import { chapterRole, genreCraft, specPrompt } from './contracts';
import { acceptCandidate, acceptedVersion, addCandidate, canonBefore, canonForPrompt, emptyStoryState, evidenceExists, nextUnacceptedChapter, reconcileCheckpoint, standingConditions, validateAnalysis } from './storyState';
import { analyseChapter, beatCoverageIssue, citedOnlyTheOpening, confirmedFindings, findingStreaks, planWithoutRetelling, restatedFromEarlierScenes, sameFinding, sameFindingSet, reviewBook, reviewChapter, stripThinking, generateProse, structuredResponse, type NovelLLM } from './review';
import type { NLIScorer } from './nli';
import type { RunStore } from './runStore';
import { writeFullChapter, writeScene } from './writer';
import { quotedFrom, readSceneJournal } from './sceneJournal';
import { rememberChapter, writeDirect } from './memory';
import { checkChapter, checkEmotions, checkGenre, type DeepCheckTools } from './deepCheck';

export function createRun(spec: BookSpec, provider: LLMProviderConfig): NovelRun {
  return {
    schemaVersion: 1, validationVersion: 2, literaryValidationVersion: 1, id: crypto.randomUUID(), spec: structuredClone(spec), provider: { ...provider },
    outline: '', chapters: [], canon: emptyStoryState(), stage: 'outline', updatedAt: Date.now(),
  };
}

/**
 * An integer, however the model spelled it.
 *
 * Gemini's structured output returns "4" for an integer field often enough that a live book died on
 * it: the schedule was correct, the type was a string, and the validator refused a plan that was
 * right. A numeric string carries the same information as a number and is worth reading rather than
 * rejecting — but it is read once, here, and written back as a number, because everything downstream
 * compares payoffChapter to a chapter number with ===, and a string that survives this point fails
 * silently in every one of those comparisons instead of loudly in this one.
 */
export function asInteger(value: unknown): number | undefined {
  if (Number.isInteger(value)) return value as number;
  if (typeof value === 'string' && /^\s*-?\d+\s*$/.test(value)) return Number(value.trim());
  return undefined;
}

/** The same leniency for a boolean a model quoted: "true" is the answer it meant. */
export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' && ['true', 'false'].includes(value.trim().toLowerCase())) return value.trim().toLowerCase() === 'true';
  return undefined;
}

/**
 * Chapter joins the book plan does not actually make.
 *
 * Every arc records the state its chapter starts from and the state it leaves, written by one call in
 * one pass — so the two sides of every join are there to be compared, and nothing has ever compared
 * them. Two shapes are recognisable without reading for meaning: a chapter that starts where the
 * previous one started, which is a state copied forward rather than moved, and a chapter that starts
 * from something with no word in common with what the previous one left, which is a jump the plan
 * does not describe.
 *
 * Both are signals, not verdicts. They are deliberately not thrown: a fuzzy measure that kills a
 * blueprint costs the whole book, and the blueprint gets two attempts. What they do is pick the pairs
 * worth one narrow question, and travel to the planner of that chapter.
 */
export function looseJoins(arcs: ChapterArc[] = []): { chapter: number; problem: string }[] {
  const words = (text: string) => new Set(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(word => word.length > 3));
  const shared = (first: string, second: string) => {
    const a = words(first), b = words(second);
    if (!a.size || !b.size) return 1; // Nothing written is not a finding about what was written.
    let count = 0;
    for (const word of b) if (a.has(word)) count++;
    return count;
  };
  const ordered = [...arcs].sort((first, second) => first.chapter - second.chapter);
  const found: { chapter: number; problem: string }[] = [];
  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1], current = ordered[index];
    if (current.entryState && previous.entryState && current.entryState.trim().toLocaleLowerCase() === previous.entryState.trim().toLocaleLowerCase()) {
      found.push({ chapter: current.chapter, problem: `starts from the same state chapter ${previous.chapter} started from, so nothing moved between them` });
      continue;
    }
    if (!shared(previous.exitState, current.entryState)) {
      found.push({ chapter: current.chapter, problem: `starts from "${current.entryState}", which has nothing in common with what chapter ${previous.chapter} left: "${previous.exitState}"` });
    }
  }
  return found;
}

/** Characters the blueprint invented: named in the plan, absent from the outline it was built from. */
export function castNotInOutline(characters: Record<string, unknown>, outline: string): string[] {
  const text = outline.toLocaleLowerCase();
  return Object.keys(characters).filter(name => {
    const parts = name.split(/\s+/).filter(part => part.length > 2);
    // A full name may be shortened in the outline, so any substantial part of it counts as present.
    return parts.length > 0 && !parts.some(part => text.includes(part.toLocaleLowerCase()));
  });
}

export function validateBlueprint(value: any, spec: BookSpec): BookBlueprint {
  for (const field of ['centralConflict', 'protagonistChange', 'endingPayoff']) {
    if (typeof value[field] !== 'string' || !value[field].trim()) throw new Error(`Blueprint missing ${field}.`);
  }
  if (!Array.isArray(value.characters) || !value.characters.length || !Array.isArray(value.promises) || !value.promises.length) throw new Error('Blueprint needs characters and narrative promises.');
  const characters: Record<string, Character> = {};
  for (const character of value.characters) {
    if (typeof character.name !== 'string' || !character.name.trim() || typeof character.description !== 'string' || !character.description.trim() || characters[character.name]) throw new Error('Invalid or duplicate character design.');
    // Limits are read where they are given and never invented here: a blueprint saved before the
    // field existed has no limits, which is not the same as a character who has none.
    const limits: string[] = Array.isArray(character.limits)
      ? [...new Set((character.limits as unknown[]).filter((limit): limit is string => typeof limit === 'string' && !!limit.trim()).map(limit => limit.trim()))].slice(0, 6)
      : [];
    characters[character.name] = {
      name: character.name, description: character.description, first_appearance: 1,
      status: 'not established', location: 'not established', emotional_state: 'not established',
      relationships: {}, development: [], ...(limits.length ? { limits } : {}),
    };
  }
  const ids = new Set<string>();
  for (const promise of value.promises) {
    // One message for seven different defects taught the retry nothing: a model told only that a
    // promise is invalid returns the same schedule with the same fault, and the book dies at its
    // first call. Each rule now says which promise and what is wrong with it, because these messages
    // are what the second attempt gets to work from.
    const named = `promise ${JSON.stringify(promise?.id ?? null)}`;
    // Read once and written back, so the schedule the book runs on is numbers and booleans.
    for (const field of ['setupChapter', 'payoffChapter'] as const) {
      const parsed = asInteger(promise?.[field]);
      if (parsed !== undefined) promise[field] = parsed;
    }
    const asked = asBoolean(promise?.required);
    if (asked !== undefined) promise.required = asked;
    if (typeof promise?.id !== 'string' || !promise.id.trim()) throw new Error(`Every narrative promise needs a non-empty id; one arrived as ${JSON.stringify(promise?.id ?? null)}.`);
    if (ids.has(promise.id)) throw new Error(`Two narrative promises share the id ${JSON.stringify(promise.id)}. Give each promise its own id.`);
    if (typeof promise.description !== 'string' || !promise.description.trim()) throw new Error(`The ${named} has no description.`);
    if (typeof promise.required !== 'boolean') throw new Error(`The ${named} must say whether it is required, as true or false, not ${JSON.stringify(promise.required)}.`);
    if (!Number.isInteger(promise.setupChapter) || promise.setupChapter < 1 || promise.setupChapter > spec.chapterCount) {
      throw new Error(`The ${named} is set up in chapter ${JSON.stringify(promise.setupChapter)}. This book has chapters 1 to ${spec.chapterCount}, and setupChapter must be one of them.`);
    }
    const openSeriesThread = promise.required === false && (promise.payoffChapter === null || promise.payoffChapter === undefined);
    if (!openSeriesThread) {
      if (!Number.isInteger(promise.payoffChapter)) {
        throw new Error(`The ${named} is required, so it must be paid off inside this book: give payoffChapter an integer from ${promise.setupChapter} to ${spec.chapterCount}, not ${JSON.stringify(promise.payoffChapter)}. Only a promise with required=false may be left open with payoffChapter null.`);
      }
      if (promise.payoffChapter > spec.chapterCount) {
        throw new Error(`The ${named} pays off in chapter ${promise.payoffChapter}, but this book ends at chapter ${spec.chapterCount}. Schedule the payoff inside the book, or mark the promise required=false and leave payoffChapter null.`);
      }
      if (promise.payoffChapter < promise.setupChapter) {
        throw new Error(`The ${named} pays off in chapter ${promise.payoffChapter}, before it is set up in chapter ${promise.setupChapter}. A payoff cannot precede its setup.`);
      }
    }
    ids.add(promise.id);
  }
  if (!value.promises.some((promise: { required: boolean }) => promise.required)) throw new Error('The book must have at least one required narrative payoff.');

  let majorTurns: MajorTurn[] | undefined;
  if (Array.isArray(value.majorTurns)) {
    majorTurns = value.majorTurns.map((turn: any) => ({
      id: String(turn.id || ''),
      functions: Array.isArray(turn.functions) ? turn.functions.map(String) : [],
      chapter: asInteger(turn.chapter) ?? 1,
      event: String(turn.event || ''),
      cause: String(turn.cause || ''),
      characterAction: String(turn.characterAction || ''),
      consequence: String(turn.consequence || ''),
    }));
  }

  let chapterArcs: ChapterArc[] | undefined;
  if (Array.isArray(value.chapterArcs)) {
    chapterArcs = value.chapterArcs.map((arc: any) => ({
      chapter: asInteger(arc.chapter) ?? 1,
      cost: String(arc.cost || ''),
      structuralRole: String(arc.structuralRole || ''),
      entryState: String(arc.entryState || ''),
      causalLink: String(arc.causalLink || ''),
      protagonistStrategy: String(arc.protagonistStrategy || ''),
      development: String(arc.development || ''),
      internalDevelopment: String(arc.internalDevelopment || ''),
      chapterChange: String(arc.chapterChange || ''),
      exitState: String(arc.exitState || ''),
      endingFunction: String(arc.endingFunction || ''),
      pacingPriority: String(arc.pacingPriority || ''),
      setupPromiseIds: Array.isArray(arc.setupPromiseIds) ? arc.setupPromiseIds.map(String) : [],
      payoffPromiseIds: Array.isArray(arc.payoffPromiseIds) ? arc.payoffPromiseIds.map(String) : [],
    }));
  }

  // A chapter that takes nothing away leaves the next one nothing to work against, and a book whose
  // chapters all end in gain is the outline equivalent of a scene that ends where it began. One such
  // chapter is a rest; two are a book without consequences. Plans made before arcs declared a cost
  // declare none at all, and those stay readable.
  if (chapterArcs?.some(arc => arc.cost)) {
    const costless = chapterArcs.filter(arc => !arc.cost);
    if (costless.length > 1) throw new Error(`Chapters ${costless.map(arc => arc.chapter).join(', ')} cost the protagonist nothing. A book may have one such chapter; say what each of the others takes away for good.`);
  }

  // What wins the ending, and what paid for it in advance. The check is the one the promise ledger
  // already makes for evidence, moved to the plan: a means introduced in the final chapter is a
  // means the book invented when it needed it.
  const climaxValue = value.climax;
  if (!climaxValue || typeof climaxValue !== 'object' || typeof climaxValue.decisiveAction !== 'string' || !climaxValue.decisiveAction.trim()) {
    throw new Error('The blueprint must say what decisive action ends the book.');
  }
  if (!Array.isArray(climaxValue.preparedBy) || !climaxValue.preparedBy.length) throw new Error('The climax must name the promises that prepare it.');
  const climax = { decisiveAction: climaxValue.decisiveAction.trim(), preparedBy: climaxValue.preparedBy.map(String) };
  for (const id of climax.preparedBy) {
    const promise = value.promises.find((item: { id: string }) => item.id === id);
    if (!promise) throw new Error(`The climax is prepared by "${id}", which is not one of this book's promises.`);
    if (promise.setupChapter >= spec.chapterCount) throw new Error(`The climax is prepared by "${id}", which is not set up until chapter ${promise.setupChapter}. What wins the ending must be established before the chapter that uses it.`);
  }

  let planningIssues: PlanningIssue[] | undefined;
  if (Array.isArray(value.planningIssues)) {
    planningIssues = value.planningIssues.map((issue: any) => ({
      location: String(issue.location || ''),
      problem: String(issue.problem || ''),
      neededClarification: String(issue.neededClarification || ''),
    }));
  }

  return {
    centralConflict: value.centralConflict,
    protagonistChange: value.protagonistChange,
    endingPayoff: value.endingPayoff,
    characters,
    promises: value.promises,
    chapters: [],
    climax,
    ...(majorTurns ? { majorTurns } : {}),
    ...(chapterArcs ? { chapterArcs } : {}),
    ...(planningIssues ? { planningIssues } : {}),
  };
}

/**
 * A chapter is planned against the book, not in isolation: a live run returned chapter three as a
 * byte-identical copy of chapter two, and prose cannot repair that — by then the repetition is the
 * plan. Muteness is checked once for the whole book instead (see speechSomewhere): a single chapter
 * may legitimately have nobody to talk to, and "two participants" does not mean two speakers when
 * one of them is a figure watched across a courtyard.
 */
export function validateChapterPlan(value: any, spec: BookSpec, earlier: ParsedChapterPlan[] = [], cast: string[] = []): ParsedChapterPlan {
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
  if (typeof plan.title === 'string') {
    plan.title = plan.title.replace(/^(?:chapter|глава)\s*\d+\s*[:.\-—–]\s*/i, '').trim() || plan.title.trim();
  }
  if (!Array.isArray(plan.detailedScenes) || !plan.detailedScenes.length || plan.detailedScenes.length > 8) throw new Error('A chapter needs 1–8 fully planned scenes.');
  const ids = new Set<string>();
  const normalizations: string[] = [];
  plan.detailedScenes = plan.detailedScenes.map((raw: any, index: number) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid scene object.');
    const scene = { ...raw, sceneId: raw.sceneId || raw.scene_id || raw.id || `scene-${index + 1}`,
      objective: raw.objective || raw.goal, conflict: raw.conflict || raw.obstacle,
      outcome: raw.outcome || raw.result, participants: raw.participants || raw.characters,
      keyMoments: raw.keyMoments || raw.key_moments || raw.beats };
    // duration and mood are not required: a scene is checked on its goal, its resistance and its
    // outcome, and nothing in the engine reads how long it lasts or what mood it is in. A field a
    // planner must invent and no reader consults is the appearance of thoroughness, not thoroughness.
    for (const field of ['sceneId', 'location', 'objective', 'conflict', 'outcome']) {
      if (typeof scene[field] !== 'string' || !scene[field].trim()) throw new Error(`Scene ${index + 1} of this chapter is missing ${field}.`);
    }
    // A scene may legitimately have no one in it — a room after everyone has gone, the closing image
    // of a chapter — and rejecting that killed a live run over a plan that was right.
    // Four different faults used to arrive as "Invalid scene identity, participants or beats", and
    // that message is what the second attempt works from: it named neither the scene nor the fault,
    // so the retry re-sent the same plan. Each one says which scene and what is wrong with it.
    const named = `Scene ${JSON.stringify(scene.sceneId)}`;
    if (ids.has(scene.sceneId)) throw new Error(`${named} appears twice. Give each scene of the chapter its own id.`);
    // One name where a list belongs is the same list with one entry. Written back, and said aloud.
    if (typeof scene.participants === 'string' && scene.participants.trim()) {
      normalizations.push(`${named} gave its participants as one name rather than a list.`);
      scene.participants = [scene.participants.trim()];
    }
    if (!Array.isArray(scene.participants) || !scene.participants.every((name: unknown) => typeof name === 'string' && name.trim())) {
      throw new Error(`${named} needs participants as an array of names, empty if nobody is present; it arrived as ${JSON.stringify(scene.participants)}.`);
    }
    if (!Array.isArray(scene.keyMoments) || !scene.keyMoments.length || !scene.keyMoments.every((beat: unknown) => typeof beat === 'string' && beat.trim())) {
      throw new Error(`${named} needs keyMoments: a non-empty array of concrete, stageable events. It arrived as ${JSON.stringify(scene.keyMoments)}.`);
    }
    if (cast.length) {
      const allowed = new Set(cast.map(name => name.trim().toLocaleLowerCase()));
      const unknown = scene.participants.find((name: string) => !allowed.has(name.trim().toLocaleLowerCase()));
      if (unknown) throw new Error(`${named} has a participant who is not in the approved cast: ${JSON.stringify(unknown)}. The cast is ${JSON.stringify(cast)}, and a chapter plan may not introduce a person the book has not designed.`);
    }
    const weight = asInteger(scene.narrativeWeight);
    if (weight !== undefined) scene.narrativeWeight = weight;
    // A weight outside the scale is a weight the planner meant at one end of it; a plan is not worth
    // losing over the difference between 7 and 5.
    if (Number.isInteger(scene.narrativeWeight) && (scene.narrativeWeight < 1 || scene.narrativeWeight > 5)) {
      const clamped = Math.min(5, Math.max(1, scene.narrativeWeight));
      normalizations.push(`${named} gave narrativeWeight ${scene.narrativeWeight}; read as ${clamped}, the end of the scale it reaches for.`);
      scene.narrativeWeight = clamped;
    }
    if (scene.narrativeWeight !== undefined && !Number.isInteger(scene.narrativeWeight)) throw new Error(`${named} needs narrativeWeight as an integer from 1 to 5, not ${JSON.stringify(scene.narrativeWeight)}.`);
    // Older checkpoints planned scenes before this field existed; their prose is not retroactively defective.
    if (scene.conflictCarriedBy !== undefined && !['speech', 'action', 'solitude'].includes(scene.conflictCarriedBy)) throw new Error(`${named} has conflictCarriedBy ${JSON.stringify(scene.conflictCarriedBy)}; it must be speech, action or solitude.`);
    // A scene that says speech and lists one person contradicts itself, and only one of the two
    // fields can be put right without inventing anything: nobody can be added to the room, but a
    // conflict with one person in it plainly is not carried by dialogue. Refusing instead cost a live
    // book two plans and then the run, with a message the planner could read and still not answer.
    if (scene.conflictCarriedBy === 'speech' && scene.participants.length < 2) {
      normalizations.push(`${named} said its conflict is carried by speech with ${scene.participants.length === 1 ? `only ${JSON.stringify(scene.participants[0])}` : 'nobody'} in it; carried by solitude instead.`);
      scene.conflictCarriedBy = 'solitude';
    }
    // Whose scene it is. A viewpoint the scene does not contain is a planner naming the wrong person,
    // and the scene's own participants are the only correction available without inventing anyone —
    // where the scene has exactly one person in it there is no ambiguity about whose eyes it is.
    // Anything else is refused, because a viewpoint guessed at is worse than none declared.
    if (scene.pov !== undefined) {
      if (typeof scene.pov !== 'string' || !scene.pov.trim()) throw new Error(`${named} has a pov that is not a name: ${JSON.stringify(scene.pov)}.`);
      scene.pov = scene.pov.trim();
      const matches = (name: string) => name.trim().toLocaleLowerCase() === scene.pov.toLocaleLowerCase()
        || name.trim().toLocaleLowerCase().includes(scene.pov.toLocaleLowerCase()) || scene.pov.toLocaleLowerCase().includes(name.trim().toLocaleLowerCase());
      if (scene.participants.length && !scene.participants.some(matches)) {
        if (scene.participants.length === 1) {
          normalizations.push(`${named} is seen through ${JSON.stringify(scene.pov)}, who is not in it; read as ${JSON.stringify(scene.participants[0])}, the only person present.`);
          scene.pov = scene.participants[0].trim();
        } else {
          throw new Error(`${named} is seen through ${JSON.stringify(scene.pov)}, who is not among its participants ${JSON.stringify(scene.participants)}. A scene is seen through someone who is in it.`);
        }
      }
    }
    // The prompt has always listed the shapes a scene may take; this used to accept any non-empty
    // string, so the list was a suggestion. A near miss is normalized to the shape it names, and a
    // label that names no structure is a plan the planner has to make again.
    if (scene.sceneShape !== undefined) {
      if (typeof scene.sceneShape !== 'string' || !scene.sceneShape.trim()) throw new Error('Scene sceneShape must be a non-empty string when present.');
      const shape = normalizeSceneShape(scene.sceneShape);
      if (!shape) throw new Error(`Scene sceneShape "${scene.sceneShape}" is not one of: ${SCENE_SHAPES.join(', ')}.`);
      scene.sceneShape = shape;
    }
    // What the scene moves. Declared here so it can be checked against the prose after the scene is
    // written; a scene that cannot say what changes in it is a scene with nothing to verify.
    if (scene.shift !== undefined) {
      const shift = scene.shift;
      if (!shift || typeof shift !== 'object' || Array.isArray(shift)) throw new Error('Scene shift must be an object with register, from and to.');
      if (!SHIFT_REGISTERS.includes(shift.register)) throw new Error(`Scene shift register must be one of: ${SHIFT_REGISTERS.join(', ')}.`);
      for (const side of ['from', 'to'] as const) {
        if (typeof shift[side] !== 'string' || !shift[side].trim()) throw new Error(`Scene shift ${side} must be a non-empty state.`);
      }
      if (shift.from.trim().toLocaleLowerCase() === shift.to.trim().toLocaleLowerCase()) throw new Error('A scene whose shift ends where it began changes nothing; plan what it moves.');
    }
    // "costly success", "Setback.", "costlySuccess" — the same three answers, spelled by a model.
    if (typeof scene.outcomeType === 'string' && !OUTCOME_TYPES.includes(scene.outcomeType)) {
      const key = scene.outcomeType.trim().toLowerCase().replace(/[\s_.]+/g, '-');
      const match = OUTCOME_TYPES.find(type => type === key)
        || (/^costly/.test(key) || key === 'success-at-a-cost' ? 'costly-success' : undefined)
        || (/^(?:setback|failure|loss|worse)/.test(key) ? 'setback' : undefined)
        || (/^(?:clean|free|uncosted)/.test(key) ? 'clean' : undefined);
      if (match) {
        normalizations.push(`${named} spelled its outcome ${JSON.stringify(scene.outcomeType)}; read as ${JSON.stringify(match)}.`);
        scene.outcomeType = match;
      }
    }
    if (scene.outcomeType !== undefined && !OUTCOME_TYPES.includes(scene.outcomeType)) throw new Error(`${named} has outcomeType ${JSON.stringify(scene.outcomeType)}; it must be one of: ${OUTCOME_TYPES.join(', ')}.`);
    if (scene.freshConstraint !== undefined && typeof scene.freshConstraint !== 'string') throw new Error('Scene freshConstraint must be a string when present.');
    if (scene.staging !== undefined && (typeof scene.staging !== 'string' || !scene.staging.trim())) throw new Error('Scene staging must be a non-empty string when present.');
    ids.add(scene.sceneId);
    return scene;
  });
  // Declared for some scenes and not others, the contract is worth nothing: the scenes that skipped
  // it are exactly the ones with nothing to check. Plans made before these fields existed declare
  // them nowhere, and those stay readable.
  const declaring = plan.detailedScenes.filter((scene: any) => scene.shift !== undefined).length;
  if (declaring && declaring !== plan.detailedScenes.length) throw new Error('Every scene of a chapter must declare what it shifts, or none may.');
  const clean = plan.detailedScenes.filter((scene: any) => scene.outcomeType === 'clean');
  if (clean.length > 1) {
    throw new Error(`Scenes ${clean.map((scene: any) => JSON.stringify(scene.sceneId)).join(', ')} all end in a clean success. A chapter may have one. Keep the single scene whose attempt genuinely costs nothing and give each of the others its true ending: "costly-success" where the attempt works and takes something that cannot be taken back, "setback" where it fails and leaves the situation worse.`);
  }
  // A clean scene on either side of a chapter break is the same standstill spread over two chapters.
  const priorOutcome = earlier.at(-1)?.detailedScenes?.at(-1)?.outcomeType;
  if (priorOutcome === 'clean' && plan.detailedScenes[0].outcomeType === 'clean') throw new Error('The previous chapter already ended in a clean success; this chapter cannot open with another.');
  const fingerprint = JSON.stringify(plan.detailedScenes);
  const twin = earlier.findIndex(item => JSON.stringify(item.detailedScenes) === fingerprint || (item.title === plan.title && item.summary === plan.summary));
  if (twin !== -1) throw new Error(`This plan repeats chapter ${twin + 1}. Plan the next movement of the story: different scenes, a different situation at the end, and a title of its own.`);
  return { ...plan, targetWordCount: spec.targetWordsPerChapter, ...(normalizations.length ? { normalizations } : {}) };
}

export function compactPlanningContext(run: NovelRun) {
  const blueprint = run.blueprint!;
  return {
    centralConflict: blueprint.centralConflict,
    protagonistChange: blueprint.protagonistChange,
    endingPayoff: blueprint.endingPayoff,
    // The chapter that spends the means has to know what they are, and the chapters before it have to
    // know what they are preparing.
    ...(blueprint.climax ? { climax: blueprint.climax } : {}),
    ...(blueprint.majorTurns?.length ? { majorTurns: blueprint.majorTurns } : {}),
    ...(blueprint.chapterArcs?.length ? { chapterArcs: blueprint.chapterArcs } : {}),
    // The limits travel with the description: a plan that schedules a rescue only a man who can fly
    // could make hands the writer a scene that cannot be written without breaking the character.
    characters: Object.fromEntries(Object.entries(blueprint.characters).map(([name, character]) =>
      [name, character.limits?.length ? { description: character.description, limits: character.limits } : character.description])),
    promises: blueprint.promises,
    // What earlier chapters made binding. A planner that never sees these plans the chapter that
    // walks through one of them, and the prose then does exactly what it was planned to do.
    standingConditions: standingConditions(run.canon).map(({ id, statement }) => ({ id, statement })),
    // Where the plan was found not to hold — a join that does not meet, a departure from the approved
    // outline. Recorded at planning time and put in front of every chapter planner, because a finding
    // about the plan that nothing reads is the same as no finding.
    ...(blueprint.planningIssues?.length ? { knownPlanProblems: blueprint.planningIssues } : {}),
    // What earlier chapters could not be made to fix. It was written into five different places and
    // read by none of them, so a chapter that gave up on a defect told nobody, and the chapter after
    // it planned as though the book were clean.
    ...(() => {
      const unresolved = run.chapters.filter(chapter => chapter.planningNote).map(chapter => ({ chapter: chapter.number, note: chapter.planningNote }));
      return unresolved.length ? { unresolvedInEarlierChapters: unresolved } : {};
    })(),
    previousChapters: blueprint.chapters.map((chapter, index) => ({
      number: index + 1,
      title: chapter.title,
      summary: chapter.summary,
      outcome: chapter.detailedScenes?.at(-1)?.outcome,
      consequences: chapter.consequencesOfChoices,
    })),
  };
}

const text = { type: 'string', minLength: 1 };
/** Constrained decoding keeps a long plan well-formed; an unterminated JSON object is unrecoverable. */
export const blueprintSchema = {
  type: 'object', required: ['centralConflict', 'protagonistChange', 'endingPayoff', 'characters', 'promises', 'climax'],
  properties: {
    climax: {
      type: 'object', required: ['decisiveAction', 'preparedBy'],
      properties: {
        decisiveAction: text,
        preparedBy: { type: 'array', minItems: 1, items: text },
      }, additionalProperties: false,
    },
    centralConflict: text, protagonistChange: text, endingPayoff: text,
    majorTurns: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'functions', 'chapter', 'event', 'cause', 'characterAction', 'consequence'],
        properties: {
          id: text,
          functions: { type: 'array', items: text },
          chapter: { type: 'integer' },
          event: text,
          cause: text,
          characterAction: text,
          consequence: text,
        },
        additionalProperties: false,
      },
    },
    chapterArcs: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'chapter', 'cost', 'structuralRole', 'entryState', 'causalLink',
          'protagonistStrategy', 'development', 'internalDevelopment',
          'chapterChange', 'exitState', 'endingFunction', 'pacingPriority',
          'setupPromiseIds', 'payoffPromiseIds'
        ],
        properties: {
          chapter: { type: 'integer' },
          cost: { type: 'string' },
          structuralRole: text,
          entryState: text,
          causalLink: text,
          protagonistStrategy: text,
          development: text,
          internalDevelopment: text,
          chapterChange: text,
          exitState: text,
          endingFunction: text,
          pacingPriority: text,
          setupPromiseIds: { type: 'array', items: text },
          payoffPromiseIds: { type: 'array', items: text },
        },
        additionalProperties: false,
      },
    },
    characters: { type: 'array', minItems: 1, items: { type: 'object', required: ['name', 'description', 'limits'], properties: { name: text, description: text, limits: { type: 'array', items: text } }, additionalProperties: false } },
    promises: {
      type: 'array', minItems: 1,
      items: {
        type: 'object',
        // payoffChapter is required and nullable, not optional: a field a model may omit is a field it
        // omits, and the schedule then arrives with nothing where the payoff belongs.
        required: ['id', 'description', 'setupChapter', 'required', 'payoffChapter'],
        properties: {
          id: text,
          description: text,
          setup: text,
          setupChapter: { type: 'integer' },
          development: text,
          payoff: text,
          payoffChapter: { type: ['integer', 'null'] },
          required: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
    planningIssues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['location', 'problem', 'neededClarification'],
        properties: {
          location: text,
          problem: text,
          neededClarification: text,
        },
        additionalProperties: false,
      },
    },
  }, additionalProperties: false,
};
const planStrings = [
  'title', 'summary', 'sceneBreakdown', 'characterDevelopmentFocus', 'plotAdvancement',
  'timelineIndicators', 'emotionalToneTension', 'connectionToNextChapter', 'openingHook',
  'chapterEnding', 'moralDilemma', 'consequencesOfChoices', 'rhythmPacing',
  'structuralRole', 'causalLink', 'chapterChange', 'protagonistStrategy'
];
export const chapterPlanSchema = {
  type: 'object', required: ['title', 'summary', 'sceneBreakdown', 'characterDevelopmentFocus', 'plotAdvancement', 'timelineIndicators', 'emotionalToneTension', 'connectionToNextChapter', 'openingHook', 'chapterEnding', 'tensionLevel', 'detailedScenes'],
  properties: {
    ...Object.fromEntries(planStrings.map(field => [field, { type: 'string' }])),
    tensionLevel: { type: 'integer' },
    detailedScenes: {
      type: 'array', minItems: 1, maxItems: 8,
      items: {
        type: 'object',
        required: ['sceneId', 'location', 'participants', 'objective', 'conflict', 'outcome', 'keyMoments', 'narrativeWeight', 'conflictCarriedBy', 'shift', 'outcomeType', 'pov'],
        properties: {
          narrativeWeight: { type: 'integer', minimum: 1, maximum: 5 },
          pov: text,
          conflictCarriedBy: { type: 'string', enum: ['speech', 'action', 'solitude'] },
          sceneShape: { type: 'string', enum: [...SCENE_SHAPES] },
          shift: {
            type: 'object', required: ['register', 'from', 'to'],
            properties: {
              register: { type: 'string', enum: [...SHIFT_REGISTERS] },
              from: text,
              to: text,
            }, additionalProperties: false,
          },
          outcomeType: { type: 'string', enum: [...OUTCOME_TYPES] },
          freshConstraint: { type: 'string' },
          staging: { type: 'string' },
          sceneId: text,
          location: text,
          participants: { type: 'array', items: text },
          entryState: { type: 'string' },
          causalLink: { type: 'string' },
          objective: text,
          conflict: text,
          characterResponse: { type: 'string' },
          consequence: { type: 'string' },
          outcome: text,
          duration: text,
          mood: text,
          keyMoments: { type: 'array', minItems: 1, items: text }
        },
        additionalProperties: false
      }
    },
  },
  additionalProperties: false,
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
 * What the journal found wrong with the scene it just read, phrased as instructions to the writer.
 *
 * Every item here was quoted out of the prose before it got this far: the journal discards a finding
 * whose quotation is not in the scene, the same way it discards an invented continuity note. So this
 * is a list of things the page demonstrably does, not a list of opinions about it.
 */
export function sceneFaults(scene: { shift?: { register: string; from: string; to: string } }, entry?: SceneJournal): string[] {
  if (!entry) return [];
  const faults: string[] = [];
  if (scene.shift && !entry.shiftQuote) {
    faults.push(`It ended where it began: nothing on the page shows ${scene.shift.register} moving from "${scene.shift.from}" to "${scene.shift.to}" — the scene approaches that change, reports it as already settled, or leaves it for later. Make the move happen in what is done, said or seen, so the scene could be quoted for it.`);
  }
  for (const item of entry.reported || []) {
    faults.push(`It reports "${item.beat}" instead of performing it — "${item.quote}" tells the reader it happened rather than letting them watch it. Put that act on the page, and cut the sentence that summarizes it.`);
  }
  for (const item of entry.secondTake || []) {
    faults.push(`It plays "${item.beat}" twice: once at "${item.first}" and again at "${item.second}". The second staging is a seam, not a rhythm. Keep the stronger occurrence and let everything after it proceed from the fact that it already happened.`);
  }
  return faults;
}

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

/**
 * Lines a freshly written scene kept from the apparatus that produced it, rather than from the story.
 *
 * The scene writer reads a plan as JSON, and what it reads it can echo: a chapter arrived with a bare
 * "Scene 3:" standing where a paragraph should be, and another with an instruction to itself in the
 * present tense in the middle of past narration. Both survived every check we have, because every
 * check we have reads for meaning and these lines mean exactly what they say — they simply are not
 * the book. Caught here, the answer is to write eight hundred words again; found after the chapter is
 * assembled, it is a repair asked to delete a line it will write once more from the same plan.
 *
 * Deliberately narrow, and matched line by line rather than anywhere in a sentence. A camelCase
 * identifier does not occur in narrative prose in any language, and a label followed by a colon
 * standing alone at the head of a line is a heading whatever language it is in; ordinary prose that
 * happens to contain the word scene, or a number, or a colon, is left alone.
 */
const apparatusMarkers: RegExp[] = [
  /(?:sceneId|keyMoments|narrativeWeight|conflictCarriedBy|pov|sceneShape|outcomeType|freshConstraint|detailedScenes|targetWordCount|openingHook|chapterEnding|plotAdvancement|characterDevelopmentFocus|emotionalToneTension|connectionToNextChapter|timelineIndicators|rhythmPacing|tensionLevel|endingDevelopment|avoidReplaying|sceneBreakdown)/,
  /^[*#>\s]*(?:scene|chapter|beat|act|part|\u0441\u0446\u0435\u043d\u0430|\u0433\u043b\u0430\u0432\u0430|\u044d\u043f\u0438\u0437\u043e\u0434|\u0447\u0430\u0441\u0442\u044c)\s*[\u2116#]?\s*\d+\s*[:.)\u2013\u2014-]/i,
  /^[*#>\s]*(?:pov|target (?:scene )?length|word count|narrative weight|scene shape|staging|objective|outcome|key moments?|\u0446\u0435\u043b\u044c \u0441\u0446\u0435\u043d\u044b|\u043a\u043b\u044e\u0447\u0435\u0432\u044b\u0435 \u043c\u043e\u043c\u0435\u043d\u0442\u044b|\u043c\u0438\u0437\u0430\u043d\u0441\u0446\u0435\u043d\u0430|\u0438\u0441\u0445\u043e\u0434 \u0441\u0446\u0435\u043d\u044b)\s*[:\u2014-]/i,
  /^[\[(](?:note|todo|placeholder|\u043f\u0440\u0438\u043c\.|\u043f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435|\u0437\u0430\u043c\u0435\u0442\u043a\u0430)/i,
];

export function apparatusResidue(scene: string): string[] {
  return scene.split(/\n+/).map(line => line.trim())
    .filter(line => line && apparatusMarkers.some(marker => marker.test(line)))
    .slice(0, 5);
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


/** Whether a revision left the prose as it was: sentence sets identical, whitespace aside. */
export function unchanged(before: string, after: string): boolean {
  const sentences = (text: string) => text.split(/(?<=[.!?…])\s+/).map(item => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const first = sentences(before);
  const second = sentences(after);
  if (first.length !== second.length) return false;
  return first.every((sentence, index) => sentence === second[index]);
}

export class NovelEngine {
  constructor(private llm: NovelLLM, private store: RunStore, private onUpdate: (run: NovelRun) => void = () => {}, private embed?: Embedder, private rerank?: Reranker, private summarize?: Summarizer, private nli?: NLIScorer, private deepCheckTools?: DeepCheckTools) {}

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
    // New identities down to the chapter, not a copy of the manuscript: React needs to see that
    // something changed, and a deep clone of five chapters and their revisions is 5ms of the page's
    // own thread every time the engine saves. The versions beneath are large and only ever appended
    // to, which is the same trade the hook's snapshot already makes.
    this.onUpdate({ ...run, chapters: run.chapters.map(chapter => ({ ...chapter })) });
  }

  /**
   * The outline is the book's creative foundation: it belongs to the writer model, not the contract checker.
   * The schema pins outline to a string; a nested chapter object is not a usable outline.
   */
  async outline(run: NovelRun): Promise<void> {
    const { chapterMode: _, skipEditing: __, ...cleanSpec } = run.spec;
    const outlinePrompt = `AUTHOR CONTRACT

${JSON.stringify(cleanSpec, null, 2)}

Preserve the specified premise, genre, character identities, audience,
viewpoint, language, length, and ending requirements.

Treat style preferences as contextual guidance, not absolute word bans.
Do not impose a cliffhanger on a resolved ending.


TASK

Develop a complete chapter-by-chapter outline for exactly
${run.spec.chapterCount} chapters.

Describe the actual events, major discoveries, consequential choices,
and ending. Do not write a promotional synopsis or withhold spoilers.

Plan a story that fits the author contract’s targetWordsPerChapter.
Give pivotal developments enough space to be dramatized later.

Write all planning text and JSON keys in English.
Future story prose must follow the author contract’s language.


NOVEL STRUCTURE

Build a coherent progression with these dramatic functions:

- Establish the protagonist pursuing something concrete within
  an existing situation.
- Introduce a disruption that makes that situation unstable.
- Establish a commitment, choice, or consequence that draws
  the protagonist into sustained pursuit of the central conflict.
- Develop attempts whose results create or reshape subsequent problems.
- Include a meaningful reorientation: a discovery, reversal, success,
  or failure that changes the protagonist’s understanding or strategy.
- Bring the developing conflict to a crisis that leads into
  the decisive action.
- Resolve the central dramatic question through consequential
  character action.
- Show the meaningful external and emotional consequences.

These are story functions, not mandatory separate chapters.
Several may occur within one chapter. Do not force rigid percentages
or add incidents merely to fill structural slots.

Adapt the progression to the requested genre and narrative design.


CAUSAL DEVELOPMENT

Connect major developments through causes and consequences.

For each chapter, make clear:
- What prior event or existing pressure drives it.
- What the protagonist attempts.
- What resists or complicates that attempt.
- What the response produces.
- How the resulting situation affects what follows.

Do not repeatedly reset the protagonist to the same problem,
strategy, or emotional realization.

Escalation may increase cost, narrow options, deepen a relationship
conflict, expose a mistaken assumption, or change the goal.
It need not consist of larger physical threats.

Coincidence may complicate the situation but must not conveniently
resolve the central conflict.


CHARACTERS

Establish the protagonist’s external desire and relevant internal
need, contradiction, or operating belief.

Develop the internal trajectory through evidence, choices,
and consequences. Allow growth, deterioration, or steadfastness
according to the intended story.

A later chapter must test, complicate, or apply an earlier realization
rather than repeat it.

Give consequential supporting characters their own objectives,
personal stakes, and choices capable of resisting the protagonist.
Do not create a separate subplot for every incidental character.

Differentiate voices through attitude, vocabulary, directness,
and conversational tactics rather than catchphrases alone.

Make opposition coherent. If there is an antagonist, establish
their motives, means, limitations, and actions.
Do not make them responsible for every misfortune merely to simplify
the ending.


KNOWLEDGE AND PLAUSIBILITY

Respect what characters can know through established experience,
observation, communication, and reasonable inference.

Distinguish suspicion from confirmed knowledge.
Plan how important discoveries become available to the characters.

Ground major events in credible locations, access, timing,
and available resources without writing scene-level staging.

Give important clues, evidence, and devices a plausible origin
and route into the story.

Establish abilities, resources, relationships, and information
before they become essential to the resolution.


SETUPS AND PAYOFFS

Identify the important expectations the story creates and how
they are fulfilled.

Prepare major revelations and decisive solutions with sufficient
prior groundwork. Avoid clues that exist only to deliver
the next instruction to the protagonist.

Resolve the central conflict and the promised emotional trajectory
within this book, in a manner consistent with the requested ending.

Optional series threads may remain open, but must not substitute
for this book’s resolution.

Where the story has an external line beside its personal one — a
case, a threat, a job, a search — that line needs causes of its
own and an end of its own. Schedule it as promises: who wants
what and why, what makes each turn happen, what the opposition
does in answer, and how it finishes. An external line that moves
only when the personal story needs a room to talk in, and stops
being mentioned once it has served, is scenery. A reader asks
what became of the person who drove away, and the book must
have an answer.


PACING AND ORIGINALITY

Give each chapter a specific contribution to the developing story.

Vary objectives, tactics, emotional pressure, and consequences
when the story supports that variation.
Do not introduce arbitrary settings, objects, or subplots for novelty.

Avoid stock openings built around waking up, generic weather,
mirror-based self-description, or travel itinerary.
When such an event matters to the premise, enter through its
specific dramatic problem.

Avoid mechanically repeating chapter openings, endings,
or sequences of actions with different wording.

Recurring motifs and deliberate structural echoes should develop
their meaning or consequence.

Allow quieter chapters or passages for reaction, interpretation,
preparation, and recovery when they affect subsequent behavior.

Use chapter endings appropriate to their function:
consequence, decision, discovery, unresolved pressure, or earned closure.
Do not require a cliffhanger after every chapter.

Give the climax enough space for meaningful resistance,
decisive action, and immediate consequences.
Do not spend the final chapter on approach and then summarize
the resolution.


OUTLINE CONTENT

Within the outline string, include:

1. STORY FOUNDATION
   Central dramatic question, protagonist desire, internal tension,
   opposition, concrete stakes, and intended emotional trajectory.

2. CHARACTER DYNAMICS
   Brief descriptions of consequential characters, their independent
   objectives, relationships, and distinguishing speech tendencies.

3. CHAPTER-BY-CHAPTER OUTLINE
   Exactly ${run.spec.chapterCount} numbered chapters.

   For each chapter, state:
   - Its structural role.
   - The opening situation and causal link.
   - The protagonist’s objective and approach.
   - The specific major events, resistance, and character responses.
   - The resulting external and internal change.
   - Relevant setups or payoffs.
   - The ending situation and its consequences.
   - Which pivotal development deserves the most page space.

4. ENDING AND PAYOFFS
   State what actually happens in the climax, how the central
   dramatic question is answered, what it costs, and the resulting
   external and emotional state.
   Identify how the major setups receive their payoffs.

Keep the outline concrete and proportionate to the book’s length.
Do not include finished scenes, scripted dialogue, or detailed staging.


FINAL CHECK — DO NOT OUTPUT

Check that:
- There are exactly ${run.spec.chapterCount} chapters.
- The story fits the author contract and available length.
- Major events have credible causes and meaningful consequences.
- Character knowledge and resources support their actions.
- Chapters develop the conflict rather than repeat the same pattern.
- The climax follows from prior developments and character agency.
- The actual ending and major payoffs are explicitly described.


RESPONSE FORMAT

Return only a valid JSON object with exactly one key:

{"outline": "The complete outline in English"}

The outline value must be a string.
Escape line breaks and quotation marks correctly for valid JSON.
Do not include Markdown fences or commentary outside the JSON.`;

    run.outline = await structuredResponse(
      outlinePrompt,
      'You are a novel architect developing the author\'s story.',
      this.llm,
      ['outline'],
      raw => {
        if (typeof raw.outline !== 'string' || !raw.outline.trim()) throw new Error('The outline is empty.');
        return raw.outline.trim();
      },
      {
        temperature: SAMPLING.outline,
        maxTokens: 8192,
        route: 'writer',
        schema: {
          type: 'object',
          required: ['outline'],
          properties: { outline: { type: 'string', minLength: 1 } },
          additionalProperties: false,
        },
      }
    );
    await this.checkpoint(run);
  }

  /**
   * The plan read against the two things nothing has ever read it against: the outline it was built
   * from, and itself.
   *
   * Both are one call, once, at planning time, and neither can stop the book. A plan-level finding
   * that throws costs the whole run — the blueprint gets two attempts — and a plan-level finding that
   * triggers a replan is the loop we have spent the day refusing. So what they produce is written
   * where the chapter planners will read it: every chapter is planned with the list of places the
   * plan does not hold in front of it, and the chapter that owns a broken join is told which one.
   */
  private async checkPlanCoherence(run: NovelRun): Promise<void> {
    const blueprint = run.blueprint!;
    const issues: PlanningIssue[] = [];

    // 1. Joins. The deterministic pass picks the pairs; the call decides which of them are real.
    const flagged = looseJoins(blueprint.chapterArcs);
    if (flagged.length) {
      const arcs = (blueprint.chapterArcs || []).map(arc => ({ chapter: arc.chapter, entryState: arc.entryState, exitState: arc.exitState }));
      try {
        const confirmed = await structuredResponse(`${specPrompt(run.spec)}\nCHAPTER JOINS AS PLANNED, each chapter with the state it starts from and the state it leaves:\n${JSON.stringify(arcs)}\nThese joins look wrong and are the only ones you are asked about: ${JSON.stringify(flagged)}.\nFor each, say whether the chapter genuinely starts from the situation the previous chapter left. A chapter may open elsewhere, later, or with other people and still follow from it; what does not follow is a chapter that begins as though the previous one had not happened, or that begins exactly where the previous one began. Report only the joins that do not hold, in the words of the plan itself.\nReturn JSON {"broken":[{"chapter":2,"problem":"what does not follow"}]}, and an empty list if all of them hold.`,
          'You read a novel plan for one thing only: whether each chapter starts from the situation the previous chapter left. You judge the plan and write no story.', this.llm, ['broken'], raw => {
            if (!Array.isArray(raw.broken)) throw new Error('Return a broken array, empty if every join holds.');
            return raw.broken
              .filter((item: any) => item && Number.isInteger(item.chapter) && typeof item.problem === 'string' && item.problem.trim()
                && flagged.some(candidate => candidate.chapter === item.chapter))
              .slice(0, flagged.length)
              .map((item: any) => ({ chapter: item.chapter as number, problem: String(item.problem).trim() }));
          }, { temperature: 0.1, maxTokens: 2048, route: 'validator', schema: {
            type: 'object', required: ['broken'],
            properties: { broken: { type: 'array', items: { type: 'object', required: ['chapter', 'problem'], properties: { chapter: { type: 'integer' }, problem: { type: 'string' } }, additionalProperties: false } } },
            additionalProperties: false,
          } });
        for (const item of confirmed) issues.push({ location: `chapter ${item.chapter}`, problem: item.problem, neededClarification: `Plan chapter ${item.chapter} to start from what chapter ${item.chapter - 1} actually leaves, or dramatize what closed the gap.` });
      } catch { /* A reading that fails leaves the plan as it is; it never costs the book. */ }
    }

    // 2. The outline. A substituted plot arrives with new people, so the names are the cheap half.
    const invented = castNotInOutline(blueprint.characters, run.outline);
    try {
      const departures = await structuredResponse(`${specPrompt(run.spec)}\nAPPROVED OUTLINE — the authorized story:\n${run.outline}\nTHE PLAN BUILT FROM IT:\n${JSON.stringify({ centralConflict: blueprint.centralConflict, protagonistChange: blueprint.protagonistChange, endingPayoff: blueprint.endingPayoff, climax: blueprint.climax, cast: Object.keys(blueprint.characters), promises: blueprint.promises.map(promise => promise.description) })}\n${invented.length ? `These names are in the plan and not in the outline: ${JSON.stringify(invented)}. Say for each whether the outline supports the person under another description, or whether the plan introduced them.\n` : ''}The plan explains the outline; it may make causes explicit, name what the outline left unnamed, and schedule what the outline implies. What it may not do is replace the story: a different central conflict, a different ending, a protagonist who changes in another direction, a payoff the outline does not contain.\nReport only what the plan carries and the outline does not support. Quote the outline for each — the passage that shows what the outline actually says — copied exactly. A finding whose quotation is not in the outline is discarded. Most plans depart nowhere, and an empty list is the expected answer.\nReturn JSON {"departures":[{"what":"what the plan does","outlineQuote":"exact passage from the outline"}]}.`,
        'You compare a novel plan against the outline it was built from and report only where the plan replaces the story. You quote the outline and compose nothing.', this.llm, ['departures'], raw => {
          if (!Array.isArray(raw.departures)) throw new Error('Return a departures array, empty if the plan keeps the outline.');
          return raw.departures
            .filter((item: any) => item && typeof item.what === 'string' && item.what.trim() && typeof item.outlineQuote === 'string' && quotedFrom(item.outlineQuote, run.outline))
            .slice(0, 4)
            .map((item: any) => ({ what: String(item.what).trim(), outlineQuote: String(item.outlineQuote).trim().slice(0, 240) }));
        }, { temperature: 0.1, maxTokens: 2048, route: 'validator', schema: {
          type: 'object', required: ['departures'],
          properties: { departures: { type: 'array', maxItems: 4, items: { type: 'object', required: ['what', 'outlineQuote'], properties: { what: { type: 'string' }, outlineQuote: { type: 'string' } }, additionalProperties: false } } },
          additionalProperties: false,
        } });
      for (const item of departures) issues.push({ location: 'the plan against the approved outline', problem: item.what, neededClarification: `The outline says: "${item.outlineQuote}". Keep the outline's story.` });
    } catch { /* Same: the comparison is worth one call and never the book. */ }

    if (issues.length) blueprint.planningIssues = [...(blueprint.planningIssues || []), ...issues];
    await this.checkpoint(run);
  }

  private async plan(run: NovelRun) {
    run.stage = 'planning';
    await this.checkpoint(run);
    if (!run.blueprint) {
      const { chapterMode: _, skipEditing: __, ...cleanSpec } = run.spec;
      const blueprintSystemPrompt = `You build an explicit, causally coherent novel blueprint from an
author contract and an approved outline.

Define the novel’s dramatic architecture, character trajectories,
and scheduled setups and payoffs so downstream chapter planners
can develop the story without inventing a different plot.

Preserve the approved events, ending, character identities,
and author requirements. Make implicit causal relationships explicit
without adding unsupported major developments.

Respond only with valid JSON matching the requested schema.
Write planning descriptions in English.
Do not include Markdown fences, commentary, or finished story prose.`;

      const blueprintUserPrompt = `AUTHOR CONTRACT

${JSON.stringify(cleanSpec, null, 2)}

The author contract applies to planning, prose, and every revision.

Preserve proper names, requested audience, viewpoint, language,
and ending. Style preferences are contextual, not absolute word bans.

Write blueprint descriptions in English. Future story prose must
follow the language specified in the author contract.


APPROVED OUTLINE

${run.outline}


TASK AND AUTHORITY

Build a book-level blueprint for exactly ${run.spec.chapterCount} chapters.

The author contract defines requirements.
The approved outline defines the authorized story events and ending.
This blueprint explains their structure and causal relationships.

Do not replace the approved plot with a more conventional one.
Do not invent major events merely to fill structural slots.

You may clarify motivations, consequences, and connective details
when they are compatible with the supplied material.

If the contract and outline conflict, or a necessary causal link
cannot be supported without changing the approved plot, record
the issue in planningIssues rather than silently rewriting the story.


DRAMATIC ARCHITECTURE

Organize the approved events into a coherent progression:

- Setup: establish the protagonist’s active situation, desire,
  and relevant vulnerability.
- Disruption: identify what makes the existing situation unstable.
- Commitment: identify what commits the protagonist to pursuing
  the central conflict and makes retreat difficult.
- Development: show attempts, resistance, and accumulating consequences.
- Reorientation: identify a supported discovery, reversal, success,
  or failure that changes the protagonist’s understanding or strategy.
- Crisis: identify the pressure or conflict of priorities that leads
  into the decisive action.
- Climax: resolve the central dramatic question through consequential
  character action.
- Resolution: show the external and emotional consequences.

Use these functions as diagnostic guidance, not mandatory separate events.
One event may serve several functions. Multiple functions may occur
within one chapter, especially in a short book.

Locate turns according to the approved events, not rigid percentages
or chapter-number formulas.

If a conventional structural function is deliberately absent,
preserve that design. Flag an absence only when it creates a concrete
problem with causality, comprehension, or the promised resolution.

Do not mistake a sequence of increasingly dangerous incidents
for a developing plot. Each major development must change the problem,
the protagonist’s strategy, the available options, or the cost.


CAUSALITY AND STAKES

For every major turn, identify:
- The established event, pressure, or action that causes it.
- What the protagonist or another consequential character does.
- What changes as a result.
- How that change shapes subsequent events.

Track the protagonist’s strategy across chapters.
Setbacks and successes must affect later behavior rather than
resetting the protagonist to the same approach without explanation.

Make stakes concrete: what may be lost, for whom, and why it matters.
Escalation may involve relationships, obligations, identity, resources,
knowledge, exposure, or danger.

Do not resolve a central obstacle through an unestablished ability,
resource, coincidence, or sudden change of allegiance.


PROTAGONIST TRAJECTORY

Describe the protagonist’s starting belief or operating assumption,
the strategy it supports, and the evidence that tests it.

Let internal development emerge through choices and consequences.
A later chapter must test, complicate, or apply an earlier realization
rather than announce it again.

Allow growth, deterioration, refusal to change, or a steadfast belief
that changes others when supported by the approved story.

Connect the decisive choice to this trajectory without forcing
a moral lesson or positive transformation.

Make the final emotional state compatible with what the protagonist
has done, gained, lost, and understood.


SUPPORTING CHARACTERS AND OPPOSITION

Give consequential supporting characters:
- An objective of their own.
- Something they risk or stand to lose.
- An independent choice that can support, resist, or complicate
  the protagonist’s pursuit.

Express agency through planned behavior and relationships.
Do not add a subplot for every incidental person.

Keep character knowledge distinct from blueprint knowledge.
Do not give characters premature access to later revelations.

Preserve the antagonist’s established motives, limitations,
and credible alternatives where applicable.

Do not retroactively make one antagonist responsible for every
misfortune merely to simplify the protagonist’s decision.

A revelation of culpability requires prior groundwork.
If the ending depends on a costly choice, the revelation must not
erase that cost merely by making one option obviously correct.

Do not invent a personified antagonist if the approved opposition
is institutional, environmental, interpersonal, or internal.


SETUPS AND PAYOFFS

Schedule specific narrative promises rather than vague intentions
such as “explore trust” or “increase tension.”

For each promise, identify:
- What creates the reader’s expectation.
- Where that expectation is established.
- Any necessary reinforcement or complication.
- What event, decision, discovery, or resulting state fulfills it.
- The chapter where that fulfillment occurs.

Include the central conflict and the protagonist’s emotional trajectory
among the required promises.

Schedule every required payoff inside this book.
Optional series threads may remain open only with required=false.

A setup and payoff may occur within the same chapter if their sequence
is clear and the payoff is adequately prepared.

Do not treat every detail as a promise or force every motif
into a reveal.


WHAT THE ENDING COSTS, AND WHAT WINS IT

Each chapter arc states its cost: what that chapter takes away for good.
A person, a resource, an option, a standing, a belief, a way back.
Gaining less than hoped is not a cost; being unable to return to a
position already held is.

At most one chapter in the book may cost nothing, and a plan in which
two or more cost nothing is rejected. A chapter that only accumulates
advantages leaves the next chapter nothing to work against.

climax states the decisive action that ends the central conflict, and
preparedBy lists the promise ids that establish the means it uses.

Every means the ending relies on — an object, an ally, a piece of
knowledge, a weakness, an access — must be one of those promises and
must be set up in an earlier chapter than the one that uses it. A plan
whose climax is won by something the final chapter introduces is
rejected: that is the book supplying itself with what it needs at the
moment it needs it.


PACING AND ENDINGS

Match the planned scope to ${run.spec.chapterCount} chapters and approximately
the author contract’s targetWordsPerChapter per chapter.

Allocate enough space for decisive developments.
Do not overload a short chapter with several major turns that each
require extensive dramatization.

Give the climax room for the resistance, consequential action,
and immediate effects that the approved confrontation requires.
Do not spend its available space on approach and then summarize
the decisive exchange.

Alternate pressure with reaction, interpretation, preparation,
or recovery when those phases affect what happens next.

Vary chapter endings by dramatic function:
consequence, decision, discovery, unresolved pressure, or earned closure.

Do not require every chapter to end with a cliffhanger.
Do not reuse the same sequence of actions, images, and internal
conclusions to close successive chapters.

Deliberate recurring endings or motifs must develop their meaning
or consequence.

Respect the requested ending. Do not attach a new threat
to an otherwise resolved ending merely to create a sequel hook.

Atmosphere should influence attention, interpretation, risk,
or behavior rather than serve only as decorative description.


OUTPUT SCHEMA

Return one JSON object with exactly these top-level keys:

{
  "centralConflict": "The protagonist’s goal, opposition, developing pressure, concrete stakes, and central dramatic question",
  "protagonistChange": "Starting belief or operating assumption, how it is tested, decisive response, cost, and resulting change or steadfastness",
  "endingPayoff": "How the approved ending resolves the external conflict and emotional trajectory, including meaningful consequences",
  "majorTurns": [
    {
      "id": "turn-1",
      "functions": ["disruption", "commitment"],
      "chapter": 1,
      "event": "A specific approved event",
      "cause": "The established pressure or action producing it",
      "characterAction": "The consequential character response",
      "consequence": "What changes and how it shapes what follows"
    }
  ],
  "chapterArcs": [
    {
      "chapter": 1,
      "structuralRole": "This chapter’s specific contribution to the novel",
      "entryState": "The relevant situation at the opening",
      "causalLink": "What drives this chapter; for chapter one, the existing pressure or initiating circumstance",
      "protagonistStrategy": "The approach pursued during this chapter",
      "development": "The approved events and responses that test or advance that approach",
      "internalDevelopment": "How the chapter tests, complicates, or applies the protagonist’s operating belief",
      "chapterChange": "The meaningful change produced by this chapter",
      "exitState": "The resulting situation inherited by later events",
      "endingFunction": "The dramatic function of the chapter ending",
      "pacingPriority": "Which development needs space and what can be compressed",
      "cost": "What this chapter takes away for good, or an empty string if it takes nothing",
      "setupPromiseIds": [],
      "payoffPromiseIds": []
    }
  ],
  "characters": [
    {
      "name": "Exact established name",
      "description": "Desire, relevant need or tension, contradiction, independent agency, personal stakes, speech habits, and relationships; proportionate to the character’s importance",
      "limits": ["What this person cannot do and what they will not do, one per entry, at most four: the physical ceiling their body or resources impose, and the standing refusal they would have to break themselves to cross. Write what is established for this character in this story, not a general virtue: \"cannot outrun a car\", \"will not kill, and will not let a death buy him an advantage\", \"cannot be hurt by anything a human hand can do\". An empty list where the story establishes none."]
    }
  ],
  "promises": [
    {
      "id": "promise-central-conflict",
      "description": "The specific reader expectation and its earned fulfillment",
      "setup": "The event or situation establishing the expectation",
      "setupChapter": 1,
      "development": "Necessary reinforcement or complication, or an empty string if none is needed",
      "payoff": "The specific event or resulting state fulfilling the promise",
      "payoffChapter": ${run.spec.chapterCount},
      "required": true
    }
  ],
  "climax": {
    "decisiveAction": "The specific act that ends the central conflict, and who performs it",
    "preparedBy": ["promise-central-conflict"]
  },
  "planningIssues": [
    {
      "location": "Affected chapter, turn, promise, or contract requirement",
      "problem": "A concrete conflict, unsupported dependency, or scope problem",
      "neededClarification": "The decision or missing information needed to resolve it"
    }
  ]
}


FIELD RULES

Use actual chapter numbers within 1 through ${run.spec.chapterCount}.
The numbers shown in the example are illustrative.

chapterArcs must contain exactly ${run.spec.chapterCount} entries,
ordered by chapter number.

majorTurns must contain only supported turns.
Do not add one entry per structural function merely to fill a checklist.

Allowed values in majorTurns.functions:
setup, disruption, commitment, development, reorientation,
crisis, climax, resolution.

Each major turn may have more than one function.

Use stable, unique IDs for turns and promises.
All promise IDs referenced in chapterArcs must exist in promises.

setupChapter and payoffChapter must be integers inside the book.
payoffChapter must not precede setupChapter.

For an optional unresolved series thread:
- Set required to false.
- Set payoffChapter to null.
- Describe the intentionally unresolved expectation in payoff.

This book has chapters 1 to ${run.spec.chapterCount} and no others.
Every setupChapter is an integer in that range. For every required
promise, payoffChapter is an integer in that range and not earlier
than its own setupChapter. A promise that cannot be paid off inside
this book is not a required promise: mark it required=false and leave
payoffChapter null, or schedule it where it can actually be paid.
Ensure chapterArcs schedules its setup and payoff consistently.

Use an empty array for planningIssues when no concrete issue exists.
Do not invent issues or generic warnings to populate this field.

Do not add scene-level staging, detailed scene breakdowns,
finished dialogue, or prose instructions to this blueprint.
Those belong to downstream chapter and scene planning.


BEFORE YOU ANSWER

The promise schedule, the means of the climax and the chapter costs are
checked by the application and sent back to you if they are wrong, so
spend nothing on re-reading them. These are yours, and the first is the
one plans actually get wrong:

- Every chapter's entryState is the situation the previous chapter's
  exitState leaves. Not a restatement of that state, and not a fresh
  situation that merely happens afterwards.
- Major turns arise from supported causes and character responses.
- The protagonist’s strategy and internal trajectory develop over time.
- Consequential supporting characters retain independent agency.
- The planned scope fits the available length.

Return only the JSON object.`;

      run.blueprint = await structuredResponse(
        blueprintUserPrompt,
        blueprintSystemPrompt,
        this.llm,
        ['centralConflict', 'protagonistChange', 'endingPayoff', 'characters', 'promises'],
        raw => validateBlueprint(raw, run.spec),
        { temperature: SAMPLING.blueprint, maxTokens: 16384, route: 'writer', schema: blueprintSchema }
      );
      await this.checkpoint(run);
      if (!run.spec.skipEditing) await this.checkPlanCoherence(run);
    }
    for (let number = run.chapters.length + 1; number <= run.spec.chapterCount; number++) {
      const seed = buildIdeaSeed(number);
      const cast = Object.keys(run.blueprint.characters);
      const thisChapterArc = run.blueprint.chapterArcs?.find(arc => arc.chapter === number);
      const thisChapterTurns = run.blueprint.majorTurns?.filter(turn => turn.chapter === number) || [];
      const systemPrompt = `You plan causally connected scenes for a novel.

Follow the approved outline, author requirements, established canon,
and character knowledge. Translate the assigned chapter role into
specific events, motivated character responses, and consequences.

Prioritize causal continuity, character agency, and purposeful pacing.
Use structural guidance to support the story, not to manufacture
twists, dilemmas, or cliffhangers.

Respond only with a valid JSON object matching the requested schema.
Write all JSON string values in English.
Do not include Markdown fences or commentary.`;

      const planPrompt = `AUTHOR REQUIREMENTS

${specPrompt(run.spec)}


NARRATIVE DESIGN

${narrativeDesign}


TASK

Plan chapter ${number} of ${run.spec.chapterCount}.
Assigned chapter role: ${chapterRole(number, run.spec.chapterCount)}.
${thisChapterArc ? `\nASSIGNED CHAPTER ARC\n\n${JSON.stringify(thisChapterArc, null, 2)}\n` : ''}${thisChapterTurns.length ? `\nASSIGNED MAJOR TURNS FOR CHAPTER ${number}\n\n${JSON.stringify(thisChapterTurns, null, 2)}\n` : ''}
Plan 2 to 4 scenes, allocating space according to dramatic importance. ${sceneCountGuidance(run.spec.targetWordsPerChapter)}
Produce a scene plan, not finished story prose.

Continue from the previous chapter’s established outcome.
Honor any time or location transition required by the approved outline.


APPROVED OUTLINE

${run.outline}


COMPACT BLUEPRINT AND PRIOR OUTCOMES

${JSON.stringify(compactPlanningContext(run), null, 2)}


APPROVED CHARACTER NAMES

Participants must be exact entries from this list:

${JSON.stringify(cast)}


AUTHORITY AND CONTINUITY

Treat author requirements, established events, and the approved outline
as constraints.

Use the outline to determine what is scheduled to happen.
Use prior outcomes to determine what has already happened.

Do not reverse or disprove an established event merely to manufacture
a twist unless the approved outline explicitly requires that reversal.

Keep character knowledge separate from planning knowledge.
Characters may act on information only if they already possess it
or acquire it through a planned event.

Preserve relevant injuries, possessions, access restrictions,
relationships, unresolved actions, and physical conditions.

Do not replay completed events, repeat discoveries, or restore
an earlier situation without a credible intervening cause.

Do not introduce a new setting, institution, object, clue, ability,
or subplot merely to create variety or solve a planning difficulty.
Any necessary connective detail must fit established circumstances
and must not alter the approved plot.


NOVEL STRUCTURE ALIGNMENT

Identify this chapter’s specific contribution to the novel’s current
phase: setup, commitment, escalation, midpoint reorientation,
consequences, crisis, climax, or resolution.

Use these phases descriptively. Do not force every novel into identical
chapter proportions or assign a major turn solely by chapter number.

Advance only the portion of the novel arc assigned to this chapter.
Do not introduce, relocate, or resolve a major turning point merely
to make this chapter feel complete.

Develop the protagonist’s current strategy:
- What approach are they pursuing?
- What does the result reveal about that approach?
- How does the result affect their next action?

Connect external developments to the protagonist’s internal conflict
where the story supports that connection.
Do not force a lesson, transformation, or moral dilemma into every chapter.

Prepare scheduled developments through relevant actions, information,
relationships, or resources. Follow scheduled promise setups and payoffs.
Do not reveal or resolve material assigned to later chapters.

If this chapter contains the climax, make the decisive outcome arise
from established causes and consequential character action.

If this chapter contains the resolution, show the resulting state
and fulfill remaining scheduled promises without manufacturing
a new central conflict.


CHAPTER CAUSALITY

Define the meaningful difference between the chapter’s opening
and ending situations.

Build a causal sequence rather than a list of adjacent events.
The outcome of each scene must motivate, enable, constrain,
or complicate what follows.

A change of time, location, or focus is acceptable when its relationship
to the chapter’s developing conflict is clear.

Across the chapter, give the protagonist meaningful agency through
attempts, decisions, refusals, or deliberate restraint.

Place costly choices where the conflict supports them.
Do not manufacture an irreversible decision in every scene.

Escalation may increase cost, narrow options, deepen a relationship
conflict, undermine a strategy, or overturn an assumption.
It need not increase physical danger.

Alternate pressure with room for reaction, interpretation, and decision
when appropriate. Tension does not have to rise in every scene.


SCENE REQUIREMENTS

For each scene, specify:
- The relevant entry state.
- Why this scene follows from established events.
- The viewpoint character’s immediate objective.
- The resistance, uncertainty, or competing demand.
- The character’s motivated response.
- Specific events that dramatize the required development.
- The consequence of the response.
- The resulting changed situation.

Make the immediate situation and the viewpoint character’s reason
for engaging clear early in the scene.

WHAT EACH SCENE MOVES

Every scene declares a shift: the register it changes, the state it
changes from, and the state it changes to.

register must be one of:
${SHIFT_REGISTERS.join(', ')}.

- knowledge: what someone knows, believes, or has been told.
- resource: what is available — an object, money, time, an ally, a way out.
- relationship: what two people are to each other, or what they owe.
- initiative: who is acting and who is answering, who sets the terms.
- position: where someone stands physically or in the order of things.

from and to are concrete states, not descriptions of mood:
"believes the clerk is honest" to "has seen the clerk take the money",
not "uneasy" to "more uneasy".

A shift whose from and to are the same state is rejected: that scene
does not need to exist, and its material belongs to a scene that moves.

A quiet aftermath or reflection scene is valid when it shifts
an interpretation, intention, relationship, or next course of action.
It does not require a fight, argument, or cliffhanger.


HOW EACH SCENE ENDS

Every scene declares an outcomeType:

- costly-success: the attempt works, and it costs something that
  cannot be taken back — time, an ally, cover, a principle, a way out.
- setback: the attempt fails, and the situation is worse afterwards
  than a plain failure would leave it.
- clean: the attempt works at no new cost.

At most one scene in the chapter may be clean, and a plan with two is
rejected. A clean scene hands the next scene nothing to start from.

The scene that follows starts from the cost or the setback the previous
one produced. Write the next scene's entry state as that consequence,
not as a fresh situation that happens to come afterwards.

Write keyMoments as concrete, stageable events in causal order.
Avoid instructions such as “increase tension,” “show growth,”
or “reveal the theme” without specifying what actually happens.

Describe important exchanges through what a character seeks,
what another character does in response, and what changes.
Do not script polished dialogue or final prose.


SCENE SHAPE AND VARIATION

Choose sceneShape to describe the scene’s actual dramatic structure.

Allowed values, and no others:
${SCENE_SHAPES.join(', ')}.
A plan using any other label is rejected and asked for again.

Adjacent scenes may share a shape when causality requires it.
Prefer meaningful variation in objectives, tactics, pacing,
emotional pressure, and outcomes over changing labels.

Prefer ${seed.sceneShape} only if it fits the approved outline
and is one of the allowed values. Otherwise choose the best-fitting value.

${ideaSeedPrompt(seed)}

Do not open with waking up, generic weather description, mirror-based
self-description, or a travel itinerary as a routine introductory device.
If an approved event involves one of these, enter through its specific
dramatic problem rather than a stock introduction.

Do not reproduce the previous chapter’s sequence of actions,
images, and conclusions with cosmetic changes.

Avoid mechanically repeating the previous chapter’s opening
or closing device.

A recurring motif should gain meaning or produce a new consequence.
Do not insert motifs merely to make the chapter appear literary.


SCENE ENDINGS

Choose endings according to scene function:
consequence, decision, discovery, unresolved pressure, or earned closure.

End each scene when its planned change has occurred.
Do not append an explanation of what the scene means.

Do not require every final line to propel directly into the next scene.
Forward movement may come from an unresolved consequence or changed
intention rather than an explicit hook.

Vary chapter endings when appropriate.
Do not manufacture sudden arrivals, unanswered questions,
or withheld information merely to create a cliffhanger.

Departures must follow the setting’s physical rules and established
abilities. Do not use unexplained disappearance into shadow or mist
as a convenient ending.


STAGING AND PHYSICAL PLAUSIBILITY

For each scene, provide one concise staging line describing:
- Where each participant is positioned at the opening.
- Which relevant objects are visible or within reach.
- Which physical conditions constrain action.

Include only conditions that matter, such as injury, restraint,
noise, visibility, a locked door, distance, or a moving vehicle.

Check every keyMoment against this staging.
If an action requires a change of position, access, possession,
or physical conditions, plan that change before the action.
Include its cost or consequence when relevant.

Any clue, evidence, device, or discovery must have a credible origin
and route into the scene.

Do not plant unexplained objects inside secured environments.
Establish or credibly support the relevant access, breach, recovery,
transfer, or interception.

Distinguish a character’s observation from their inference.
Do not treat suspicion as established fact.


OUTPUT SCHEMA

Return one valid JSON object with exactly the following top-level keys.

All narrative descriptions must be strings in English.
Use integers and arrays where specified.
Do not use null.

Top-level fields:

- title:
  An evocative chapter title without a chapter number or "Chapter" prefix.

- summary:
  A concise account of the chapter’s causal progression.

- structuralRole:
  The chapter’s specific contribution to the approved novel arc.

- causalLink:
  The established event or consequence that drives this chapter.

- chapterChange:
  The meaningful difference between the opening and ending situations.

- protagonistStrategy:
  The approach pursued and how its result affects that approach.

- sceneBreakdown:
  A concise overview of the scene sequence, without repeating
  the detailed scene descriptions.

- characterDevelopmentFocus:
  The relevant change, resistance to change, or deepening contradiction.

- plotAdvancement:
  Which approved plot developments and scheduled promises advance.

- timelineIndicators:
  Relevant timing, duration, and transitions.

- emotionalToneTension:
  How emotional pressure develops and varies across the chapter.

- connectionToNextChapter:
  The consequence, intention, or unresolved condition carried forward.
  For the final chapter, describe closure or an intentional series thread.

- openingHook:
  The concrete opening situation that gives the reader a reason to engage.
  Describe the event or pressure, not a polished opening sentence.

- chapterEnding:
  The event, decision, discovery, or settled condition on which
  the chapter stops. Do not write the final prose line.

- moralDilemma:
  A genuine conflict between values or obligations, if present.
  Otherwise use an empty string. Do not invent one to fill this field.

- consequencesOfChoices:
  The important effects of character attempts, decisions, or refusals.

- rhythmPacing:
  Where to expand pivotal moments, compress transitions,
  and allow space for response.

- tensionLevel:
  An integer from 1 to 10 describing the chapter’s overall tension.
  This is descriptive, not a target to maximize.

- detailedScenes:
  An array of 2 to 4 objects with exactly these keys:

  {
    "sceneId": "scene-1",
    "location": "Established or outline-supported location",
    "participants": ["Exact approved character names"],
    "entryState": "Relevant situation before this scene",
    "causalLink": "Why this scene follows from established events",
    "objective": "Immediate viewpoint-character goal",
    "conflict": "Resistance, uncertainty, or competing demand",
    "characterResponse": "Motivated attempt, choice, refusal, or reassessment",
    "keyMoments": [
      "Concrete event",
      "Response or complication caused by that event",
      "Event completing the planned change"
    ],
    "consequence": "What the character response produces",
    "outcome": "Resulting state in which the scene leaves the story",
    "shift": {
      "register": "knowledge",
      "from": "State before this scene, concretely",
      "to": "State after this scene, concretely, and different"
    },
    "outcomeType": "costly-success",
    "narrativeWeight": 3,
    "pov": "The one character whose eyes this scene is seen through",
    "conflictCarriedBy": "speech",
    "sceneShape": "negotiation",
    "freshConstraint": "",
    "staging": "Opening positions, relevant objects, and physical constraints"
  }

Use sequential sceneId values: scene-1, scene-2, and so on.

narrativeWeight must be an integer from 1 to 5.
Allocate it by dramatic importance and required development,
not by action intensity.

pov names one participant of the scene, and the scene stays
inside what that person can see, hear and know. Where the
narrative voice is limited, a change of viewpoint happens at a
scene break and never inside a scene. Prefer to hold one
viewpoint for the whole chapter; change it only where the
chapter has to show something its viewpoint character is not
present for.

conflictCarriedBy must be one of:
speech, action, solitude.
Choose the dominant mode; it does not exclude other modes.

sceneShape must be one of the allowed values listed above.

shift.register must be one of:
${SHIFT_REGISTERS.join(', ')}.
shift.from and shift.to must be different states.

outcomeType must be one of:
${OUTCOME_TYPES.join(', ')}.
At most one scene in this chapter may be clean.

freshConstraint must describe a relevant constraint supported
by the story. Use an empty string if none is needed.
Do not invent an obstacle merely to populate this field.

outcome is the scene’s exit state.
consequence explains the effect that produces or contributes
to that state. Keep these fields complementary rather than repetitive.


FINAL VALIDATION — DO NOT OUTPUT

Before returning the JSON, check:
- The chapter fulfills its assigned role without advancing future turns.
- Each scene has a meaningful change and a clear causal relationship
  to the developing chapter.
- Each scene's shift names a state the scene actually reaches, and each
  scene after the first starts from the previous scene's cost or setback.
- Character responses fit their knowledge, motives, and circumstances.
- Key moments are compatible with staging and established access.
- Setups, discoveries, and solutions have credible sources.
- Pacing and endings serve the story rather than a repeated formula.
- No unsupported twist, dilemma, clue, or subplot was added.
- The JSON is valid and matches the requested fields and types.

Return only the JSON object.`;
      const decode = (raw: any) => validateChapterPlan(raw, run.spec, run.blueprint!.chapters, cast);
      // Raised with the plan itself: a chapter now declares what each scene shifts and what its
      // outcome costs, and a budget that fitted the old plan returns the new one cut off mid-object.
      const settings = { maxTokens: 16384, route: 'writer' as const, schema: chapterPlanSchema };
      let plan: ParsedChapterPlan;
      try {
        plan = await structuredResponse(planPrompt, systemPrompt, this.llm, ['title', 'detailedScenes'], decode, { temperature: SAMPLING.chapterPlan, ...settings });
      } catch (error) {
        // The generic retry answers a validation failure by lowering temperature, which is the wrong
        // medicine for "you repeated yourself": ask again, pointedly, with room to invent instead.
        // Two failures earn a third, pointed attempt rather than the end of the book: a plan that
        // repeated an earlier chapter, and a plan whose scenes all end in gain. Both are refusals the
        // planner can act on when it is told exactly what to change, and both used to arrive as a
        // generic retry that lowered the temperature — the wrong medicine for either.
        if (/clean success/.test(String(error))) {
          plan = await structuredResponse(`${planPrompt}\nYour previous attempt gave more than one scene of this chapter an outcome that costs nothing: ${String(error)}\nDecide which single attempt in this chapter genuinely succeeds at no new cost, and leave that one as "clean". Every other scene ends either in "costly-success" — it works, and it takes something that cannot be taken back — or in "setback" — it fails, and the situation afterwards is worse than a plain failure would leave it. Change only the outcomeType values and whatever in the scene must change with them; keep the chapter's events, scenes and ending.`,
            systemPrompt, this.llm, ['title', 'detailedScenes'], decode, { temperature: SAMPLING.chapterPlan, ...settings });
        } else if (!/repeats chapter/.test(String(error))) throw error;
        else {
          const unfulfilled = (run.blueprint.promises || []).filter(promise => promise.payoffChapter >= number);
          plan = await structuredResponse(`${planPrompt}\nYour previous attempt returned a copy of an earlier chapter of this same book. Plan what happens NEXT instead: the situation this chapter starts from is the one the previous chapter ended in, and it must not end where that chapter ended. These promises are still unpaid and are the material this chapter has to work with:\n${JSON.stringify(unfulfilled)}\nGive the chapter its own title, its own scenes and its own final situation.`,
            systemPrompt, this.llm, ['title', 'detailedScenes'], decode, { temperature: SAMPLING.chapterPlanRetry, ...settings });
        }
      }
      run.blueprint.chapters.push(plan);
      const chapter: ChapterRecord = { number, plan, status: 'pending', versions: [], repairAttempts: 0 };
      if (plan.normalizations?.length) chapter.planningNote = `The plan was put right before it was accepted: ${plan.normalizations.join(' ')}`;
      if (run.importedDrafts?.[number - 1]?.trim()) addCandidate(chapter, run.importedDrafts[number - 1], 'Imported manuscript: requires review before acceptance');
      run.chapters.push(chapter);
      await this.checkpoint(run);
    }
    if (!run.spec.skipEditing) await this.speechSomewhere(run);
    if (!run.spec.skipEditing) await this.setbackSomewhere(run);
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
        }, { temperature: SAMPLING.speechReplan, maxTokens: 8192, route: 'writer', schema: chapterPlanSchema });
      plans[crowded.index] = replanned;
      run.chapters[crowded.index].plan = replanned;
      await this.checkpoint(run);
    } catch (error) {
      // A book that stays mute is the author's call to make, not a reason to lose the planning work.
      run.chapters[crowded.index].planningNote = `No scene in this book is carried by speech, and replanning chapter ${number} did not change that: ${error instanceof Error ? error.message : String(error)}`;
      await this.checkpoint(run);
    }
  }

  /**
   * A book in which nothing ever goes wrong.
   *
   * A reader of a finished book wrote that its emotional line ran from suppressed wanting to an
   * accepted relationship in four chapters with no real complication in between — refusal, avoidance,
   * danger, confession, and a domestic ending — and that what it lacked was one place where the
   * characters' wants collide with their work or their values instead of with each other's reticence.
   * Read against the plan, every scene of that book succeeded: at a cost, but it succeeded. Nothing
   * fails anywhere, and a story whose every attempt works has no reversal for its ending to answer.
   *
   * Checked once over the whole book, like muteness, and repaired the same way: one chapter replanned
   * so its decisive attempt fails, chosen in the middle-to-late stretch where a reversal belongs and
   * never the opening, the climax or the resolution. It never ends the run — a book of successes is
   * the author's to keep, and losing the planning work over it would be the worse outcome.
   *
   * No stored run carries outcomeType yet, so this is a floor on structure and not a fitted
   * threshold: it fires only where a whole book contains no setback at all.
   */
  private async setbackSomewhere(run: NovelRun): Promise<void> {
    const plans = run.blueprint!.chapters;
    const scenesOf = (plan: ParsedChapterPlan) => (plan.detailedScenes || []) as { outcomeType?: string }[];
    if (plans.length < 4) return; // Too short for a reversal to have a place of its own.
    if (plans.some(plan => scenesOf(plan).some(scene => scene.outcomeType === 'setback'))) return;
    if (!plans.some(plan => scenesOf(plan).some(scene => scene.outcomeType !== undefined))) return; // planned before the field existed
    // Where a reversal belongs: past the middle, before the chapter that climbs to the climax.
    const index = Math.min(Math.max(Math.round(plans.length * 0.6) - 1, 1), plans.length - 3);
    const number = index + 1;
    try {
      const replanned = await structuredResponse(`${specPrompt(run.spec)}${narrativeDesign}\nOUTLINE:\n${run.outline}\nBLUEPRINT AND CHAPTER PLANS:\n${JSON.stringify(run.blueprint)}\nIn this whole book, as planned, no attempt ever fails: every scene ends in success, at a cost at worst, and the story runs to its ending without a reversal to answer. Replan chapter ${number} so that its decisive attempt fails and leaves the situation worse than a plain failure would — mark that scene "setback" — and so that the failure comes from what these people want and what they are bound to, not from a new obstacle dropped in from outside. Keep the chapter's place in the book, the promises it sets up or pays off, and everything later chapters depend on; the chapters after it inherit the worse situation rather than being rewritten.`,
        'You plan causally connected scenes for a novel. Respond only with JSON.', this.llm, ['title', 'detailedScenes'],
        raw => {
          const plan = validateChapterPlan(raw, run.spec, plans.filter((_, position) => position !== index));
          if (!(plan.detailedScenes || []).some((scene: { outcomeType?: string }) => scene.outcomeType === 'setback')) throw new Error('The replanned chapter still contains no scene that ends in a setback.');
          return plan;
        }, { temperature: SAMPLING.speechReplan, maxTokens: 8192, route: 'writer', schema: chapterPlanSchema });
      plans[index] = replanned;
      run.chapters[index].plan = replanned;
      await this.checkpoint(run);
    } catch (error) {
      run.chapters[index].planningNote = `No scene in this book ends in a setback, and replanning chapter ${number} did not change that: ${error instanceof Error ? error.message : String(error)}`;
      await this.checkpoint(run);
    }
  }

  private async acceptOrRepair(run: NovelRun, chapter: ChapterRecord, candidate: ChapterVersion): Promise<void> {
    if (run.spec.skipEditing) {
      if (!candidate.content.trim()) throw new Error(`Chapter ${chapter.number} has no prose.`);
      candidate.review = { validationVersion: 2, status: 'not_checked', checkedRevision: candidate.revision, issues: [] };
      candidate.literary = undefined;
      candidate.analysis = await rememberChapter(chapter, candidate, this.llm);
      acceptCandidate(run, chapter.number);
      await this.checkpoint(run);
      return;
    }
    let repairsRetried = 0;
    let reviewsRedrawn = 0;
    let literaryRedrawn = 0;
    for (;;) {
      /**
       * Asked once per revision, not once per round.
       *
       * The condition used to re-read the chapter whenever its report was not a pass — including a
       * report that had already read this very revision. Downstream gates fail a version after the
       * review has passed it: the literary gate merges its findings in and returns to the top, where
       * the prose was read again from scratch, came back clean, was extracted again in four calls,
       * met the same failed gate, and went round once more. Measured on a live run: seven rounds in
       * seven minutes for one chapter, thirteen calls each, ninety-one spent on nothing, and the way
       * out was a sampled review happening to report something. A verdict on this text is a verdict;
       * what follows it is repair, not another reading.
       */
      if (candidate.review?.validationVersion !== 2 || candidate.review.checkedRevision !== candidate.revision) {
        const superseded = candidate.review;
        candidate.review = await reviewChapter(run, chapter, candidate, this.llm, '', this.nli);
        if (candidate.review.status !== 'not_checked') {
          // What the round before this one saw, so a judgement of taste has to be seen twice before it
          // stops a chapter. The previous version's report is the second opinion; there is no need to
          // ask for one.
          // A settled question stays settled for this chapter: the next reader does not get to raise
          // it again from scratch, and a wish set aside is kept for the line edit rather than lost.
          if (candidate.review.settled?.length) {
            const known = new Set((chapter.settled || []).map(item => item.description));
            chapter.settled = [...(chapter.settled || []), ...candidate.review.settled.filter(item => !known.has(item.description))];
          }
          const earlier = chapter.versions.find(item => item.revision === candidate.revision - 1)?.review?.issues || [];
          candidate.review.issues = confirmedFindings(candidate.review.issues, earlier)
            .map(issue => (chapter.unrepairable || []).some(known => sameFinding(known as typeof issue, issue))
              ? { ...issue, severity: 'minor' as const } : issue);
          candidate.review.status = candidate.review.issues.some(issue => issue.severity !== 'minor') ? 'failed' : 'passed';
          // A report that cited only the opening may have read a chapter whose second half is clean,
          // or may have stopped reading. Asked once, with where its citations fell; whatever comes
          // back is the answer, because there is no telling those two apart from here.
          if (candidate.review.status === 'failed' && reviewsRedrawn < MAX_REVIEW_REDRAWS
            && citedOnlyTheOpening(candidate.content, candidate.review.issues.filter(issue => issue.evidence.length && !issue.id.startsWith('foreign-script')))) {
            reviewsRedrawn++;
            const reread = await reviewChapter(run, chapter, candidate, this.llm,
              '\nYOUR PREVIOUS REPORT ON THIS CHAPTER CITED ONLY ITS FIRST HALF. If the rest of the chapter holds, say so by reporting only what is actually wrong; if it was not read, read it now. Either answer is acceptable; a report that covers half a chapter is not.', this.nli);
            if (reread.status !== 'not_checked') candidate.review = reread;
          }
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
        /**
         * Extracted once per revision, not once per round.
         *
         * An analysis describes a revision, and a revision's prose never changes under it: a repair
         * always arrives as a new candidate. Re-extracting text that already has an analysis cost
         * five calls a round and told the round nothing it did not already hold — a live run spent
         * forty minutes on chapter four doing only that, because the beat gap below failed the
         * version, the repair budget conceded it, the concession passed it again, and the loop came
         * back here to extract the same prose from scratch.
         */
        if (!candidate.analysis) {
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
        }
        // A chapter is accepted on what it put on the page, not on what it was asked to put there.
        // Accepting a chapter whose planned scene was never written writes the gap into canon, and
        // every later chapter then builds on an event this book never told.
        const gap = beatCoverageIssue(chapter, candidate.analysis, candidate);
        // Unless the chapter has already conceded it. A finding no local repair could answer is
        // advisory from then on, and this one was the exception that reopened itself: raised major
        // after the concession had demoted every other finding, it failed the version, the budget
        // conceded it a second time, and the round began again on prose nothing had touched.
        const concededGap = !!gap && (chapter.unrepairable || []).some(known => sameFinding(known as ReviewIssue, gap));
        if (gap && !concededGap) {
          candidate.review = { ...candidate.review, status: 'failed', issues: [...candidate.review.issues, gap] };
          await this.checkpoint(run);
        } else {
          // The conceded gap still belongs in the report: the chapter goes on standing, and the
          // reader is told which planned beats never reached its page.
          if (gap && !candidate.review.issues.some(issue => issue.id === gap.id)) {
            candidate.review = { ...candidate.review, issues: [...candidate.review.issues, { ...gap, severity: 'minor' as const }] };
          }
        // The literary gate is the most expensive call in the system, and until this order changed it
        // ran before the cheapest checks that could reject the version anyway: measured over both
        // stored runs, 12 of 34 assessments passed a version that extraction or the beat registry
        // then sent back. It runs last now, on a version everything else has already accepted.
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
            // Every attempt guarded, including the last. The retry used to sit outside the catch, so a
            // second failure escaped as whatever it was — a live run died on `TypeError: Failed to
            // fetch`, a dropped connection, with chapter one accepted behind it and nothing marked
            // needs_revision. A transport hiccup is not a verdict on the chapter, and it must not be
            // able to end a run in a state the resume path never hears about.
            for (;;) {
              try { candidate.literary = await assessLiteraryDevelopment(run, chapter, candidate, this.llm); break; }
              catch (error) {
                if (literaryRedrawn >= MAX_REVIEW_REDRAWS) {
                  chapter.status = 'needs_revision';
                  await this.checkpoint(run);
                  throw new NeedsRevisionError(`Chapter ${chapter.number} needs editorial attention: the literary assessment could not be completed (${error instanceof Error ? error.message : String(error)}).`);
                }
                literaryRedrawn++;
              }
            }
          }
          await this.checkpoint(run);
        }
          // Merged once. Two copies of this block stood here, so every literary finding entered the
          // report twice and the repair was handed the same instruction under two identities.
          // Merged once per round, and only while there is something left to answer. The assessment
          // is kept on the version, so a round that reaches here again re-reads the same verdict: a
          // finding the repair budget has already conceded came back major every time, failed the
          // version the concession had just passed, and sent the loop round with nothing to repair.
          if (candidate.literary.status === 'failed') {
            const unanswered = candidate.literary.issues.filter(issue =>
              !(chapter.unrepairable || []).some(known => sameFinding(known as ReviewIssue, issue)));
            if (unanswered.length) {
              candidate.review = { ...candidate.review, status: 'failed', issues: [...candidate.review.issues, ...unanswered] };
              await this.checkpoint(run);
              continue;
            }
            // All of them conceded: the chapter stands on the version it has, and its report keeps
            // them as the advisory notes they became.
            const absent = candidate.literary.issues.filter(issue => !candidate.review!.issues.some(existing => existing.id === issue.id));
            if (absent.length) candidate.review = { ...candidate.review, issues: [...candidate.review.issues, ...absent.map(issue => ({ ...issue, severity: 'minor' as const }))] };
          }
          acceptCandidate(run, chapter.number);
          if (this.deepCheckTools && !run.spec.skipEditing) {
            const accepted = acceptedVersion(chapter);
            if (accepted) {
              try {
                if (this.deepCheckTools.score || this.deepCheckTools.identify) {
                  chapter.deepCheck = await checkChapter(run, chapter.number, accepted.content, this.deepCheckTools);
                }
                if (this.deepCheckTools.scoreEmotion) {
                  chapter.emotion = await checkEmotions(chapter.number, accepted.content, this.deepCheckTools.scoreEmotion);
                }
                if (this.deepCheckTools.classifyGenre) {
                  chapter.genre = await checkGenre(run, accepted.content, this.deepCheckTools.classifyGenre);
                }
              } catch {
                // Post-acceptance check failure stays quiet: it must never fail a chapter
              }
            }
          }
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
            candidate.review.error ? `\nYOUR PREVIOUS REPORT ON THIS CHAPTER WAS DISCARDED: ${candidate.review.error} Every quotation must be copied character for character out of the prose above — open the passage, copy it, do not retype it from memory and do not tidy its punctuation. A finding whose quotation cannot be found is lost entirely, so quote less and quote exactly: a single accurate sentence is worth more than a paragraph approximately recalled.` : '', this.nli);
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
      const worn = streaks.filter(item => item.streak >= LOCAL_REPAIR_ATTEMPTS + 1 && !this.isUndeconcedable(item));
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
      // In forward-only mode, cap repair rounds to 2. If issues persist after 2 rounds, concede them and accept.
      if (run.spec.forwardOnly && (chapter.repairAttempts >= LOCAL_REPAIR_ATTEMPTS || (chapter.versions.length - (chapter.repairVersionStart || 0)) >= 2)) {
        const stubborn = candidate.review.issues.filter(issue => issue.severity !== 'minor');
        if (stubborn.length) {
          chapter.planningNote = `Forward-only: accepting chapter after ${LOCAL_REPAIR_ATTEMPTS} repair attempts. Advisory notes: ${stubborn.map(issue => issue.description).join('; ')}`;
          chapter.unrepairable = [...(chapter.unrepairable || []), ...stubborn.map(({ id, category, description }) => ({ id, category, description }))];
          const demoted = candidate.review.issues.map(issue => ({ ...issue, severity: 'minor' as const }));
          candidate.review = { ...candidate.review, issues: demoted, status: 'passed' };
          chapter.repairAttempts = 0;
          chapter.lastFindingShapes = undefined;
          await this.checkpoint(run);
          continue;
        }
      }
      if (chapter.repairAttempts >= LOCAL_REPAIR_ATTEMPTS) {
        // A contradiction of canon or a broken format always has a local answer — deleting a repeated
        // passage, removing a wedged character — so those keep their standing however long they take.
        const stubborn = candidate.review.issues.filter(issue => issue.severity !== 'minor' && !this.isUndeconcedable(issue));
        if (stubborn.length) {
          chapter.planningNote = `Findings no local repair could answer after ${chapter.repairAttempts} attempts: ${stubborn.map(issue => issue.description).join('; ')}`;
          chapter.unrepairable = [...(chapter.unrepairable || []), ...stubborn.map(({ id, category, description }) => ({ id, category, description }))];
          const demoted = candidate.review.issues.map(issue => stubborn.includes(issue) ? { ...issue, severity: 'minor' as const } : issue);
          candidate.review = { ...candidate.review, issues: demoted, status: demoted.some(issue => issue.severity !== 'minor') ? 'failed' : 'passed' };
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
      let targetIssues = sweep.issues;
      if (run.spec.forwardOnly) {
        const priorityOrder: Record<string, number> = { critical: 0, major: 1, minor: 2 };
        targetIssues = [...sweep.issues]
          .sort((a, b) => (priorityOrder[a.severity] ?? 1) - (priorityOrder[b.severity] ?? 1))
          .slice(0, 5);
      }
      if (!repetition.length) {
        chapter.distributedServed = sweep.served;
        content = await this.repair(run, chapter, version, targetIssues);
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
      // A repair is a candidate, not a fact. Before it becomes the version the chapter carries forward,
      // it has to be whole: a live chapter was accepted with a paragraph reading `Again."` — the tail
      // of a line whose body a repair had cut away — and no check saw it, because every check we have
      // reads for meaning. A repair that breaks the prose open is refused, the previous text stands,
      // the finding it was answering stands with it, and the next attempt is told what it did.
      const broken = newlyBroken(version.content, content);
      if (broken.length) {
        chapter.rejectedRepairs = [...(chapter.rejectedRepairs || []), { revision: version.revision, reason: `left ${broken.length} paragraph(s) broken open: ${broken[0].slice(0, 80)}`, at: Date.now() }];
        await this.checkpoint(run);
        const retried = await this.repair(run, chapter, version, sweep.issues,
          `${extra}Your previous attempt was refused: it left ${broken.length} paragraph(s) broken open, the first of them reading ${JSON.stringify(broken[0].slice(0, 120))}. That is the remains of a line of dialogue whose body was cut away. Answer the findings without severing a sentence or a spoken line from what closes it: every quotation mark that opens must close, and a paragraph must be a whole paragraph.`, allowShortening);
        // Refused twice on the same ground, the repair is not going to be whole; the chapter keeps the
        // text it has and the round ends rather than accepting damaged prose.
        if (newlyBroken(version.content, retried).length) {
          if (await this.concede(run, chapter, candidate, `two repairs in a row broke the prose open (${broken[0].slice(0, 80)})`)) continue;
          chapter.status = 'needs_revision';
          await this.checkpoint(run);
          throw new NeedsRevisionError(`Chapter ${chapter.number} needs editorial attention: two repairs in a row broke the prose open (${broken[0].slice(0, 80)}).`);
        }
        content = retried;
      }
      // The other way a revision damages prose, and the one every check we had was blind to: a
      // sentence left standing above a hole. The deletion pass cuts by number and glues the rest, so
      // a survivor that opened by pointing at its neighbour now points at nothing. Refused like a
      // broken paragraph, and for the same reason — the grammar is fine and the page is not.
      const orphaned = newlyOrphaned(version.content, content);
      if (orphaned.length) {
        chapter.rejectedRepairs = [...(chapter.rejectedRepairs || []), { revision: version.revision, reason: `left ${orphaned.length} sentence(s) pointing at removed text: ${orphaned[0].slice(0, 80)}`, at: Date.now() }];
        await this.checkpoint(run);
        const rejoined = await this.repair(run, chapter, version, sweep.issues,
          `${extra}Your previous attempt was refused: it left ${orphaned.length} sentence(s) standing above a hole, the first of them reading ${JSON.stringify(orphaned[0].slice(0, 120))}. That sentence opens by pointing back at something the revision removed, so a reader has nothing to attach it to. Whatever you cut, cut what depends on it too, or leave the sentence its ground.`, allowShortening);
        if (!newlyOrphaned(version.content, rejoined).length) content = rejoined;
        else {
          if (await this.concede(run, chapter, candidate, `two repairs in a row left prose pointing at removed text (${orphaned[0].slice(0, 80)})`)) continue;
          chapter.status = 'needs_revision';
          await this.checkpoint(run);
          throw new NeedsRevisionError(`Chapter ${chapter.number} needs editorial attention: two repairs in a row left prose pointing at removed text (${orphaned[0].slice(0, 80)}).`);
        }
      }
      // Cutting is the answer to some findings and to no others. A repair that quietly takes the
      // dialogue out of a scene while answering something else has changed what the chapter is, and
      // the review that reads it next sees a chapter, not a loss.
      const spokenLost = allowShortening ? 0 : spokenLinesLost(version.content, content);
      if (spokenLost) {
        chapter.rejectedRepairs = [...(chapter.rejectedRepairs || []), { revision: version.revision, reason: `removed ${spokenLost} spoken line(s) that no finding asked it to remove`, at: Date.now() }];
        await this.checkpoint(run);
        const kept = await this.repair(run, chapter, version, sweep.issues,
          `${extra}Your previous attempt was refused: it removed ${spokenLost} spoken line(s) from this chapter, and none of the findings asked for dialogue to be cut. Answer them without taking speech off the page — a line may be rewritten, but the exchange stays.`, allowShortening);
        if (!spokenLinesLost(version.content, kept)) content = kept;
        else {
          if (await this.concede(run, chapter, candidate, `two repairs in a row removed ${spokenLost} spoken line(s) nothing asked them to remove`)) continue;
          chapter.status = 'needs_revision';
          await this.checkpoint(run);
          throw new NeedsRevisionError(`Chapter ${chapter.number} needs editorial attention: two repairs in a row removed spoken lines nothing asked them to remove.`);
        }
      }
      if (unchanged(version.content, content)) {
        chapter.distributedServed = sweep.served;
        content = await this.repair(run, chapter, version, sweep.issues,
          `${extra}Your previous attempt returned this chapter unchanged, sentence for sentence. If an issue cannot be answered inside this chapter, answer the ones that can and leave that one; returning the chapter as it stands answers nothing.`, allowShortening);
        // The stuck counter resets whenever the findings are worded differently, which they always
        // are, so a repair that does nothing needs its own count or it spends the whole budget.
        if (unchanged(version.content, content)) {
          // Twice asked, twice nothing changed: the writer has already answered that these findings
          // cannot be met by editing this chapter.
          if (await this.concede(run, chapter, candidate, 'two attempts returned the chapter unchanged')) continue;
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

  /**
   * What the loop does when a repair has answered twice over that it cannot do what was asked.
   *
   * Three places reach that answer: prose returned unchanged, prose returned broken open, and
   * dialogue taken off the page. Only the first of them used to survive it; the other two ended the
   * run, and a live chapter died on the third after twenty-nine revisions of work behind it. Nothing
   * about those two calls for a harder ending — the repair was refused, so the prose the chapter
   * carries is the prose it already had, whole and reviewed. What has failed is the attempt to
   * improve it, and the honest response is the one this loop already had for a stuck finding: record
   * what no local repair could answer, demote it to advisory, and let the chapter go on standing on
   * the version it has.
   *
   * A contradiction of canon or a broken format is never conceded: those have a local answer by
   * construction, and waiving one writes a defect into every chapter after it. When the findings are
   * all of that kind there is nothing to concede, the caller is told so, and the chapter stops for a
   * reader — which is the one case where stopping is the right outcome.
   */
  private isUndeconcedable(issue: { id: string; category?: string }): boolean {
    if (issue.category === 'canon' && !issue.id.startsWith('nli-')) return true;
    if (issue.category === 'format' && issue.id !== 'restated-passage' && issue.id !== 'duplicated-passage') return true;
    return false;
  }

  private async concede(run: NovelRun, chapter: ChapterRecord, candidate: ChapterVersion, reason: string): Promise<boolean> {
    const review = candidate.review;
    if (!review) return false;
    const unanswerable = review.issues.filter(issue => issue.severity !== 'minor' && !this.isUndeconcedable(issue));
    if (!unanswerable.length) return false;
    chapter.planningNote = `Findings no local repair could answer, and ${reason}: ${unanswerable.map(issue => issue.description).join('; ')}`;
    chapter.unrepairable = [...(chapter.unrepairable || []), ...unanswerable.map(({ id, category, description }) => ({ id, category, description }))];
    const issues = review.issues.map(issue => unanswerable.includes(issue) ? { ...issue, severity: 'minor' as const } : issue);
    // The verdict is restated here because nothing reads the chapter again to restate it: a report
    // whose every blocking finding has been conceded is a report the chapter passes.
    candidate.review = { ...review, issues, status: issues.some(issue => issue.severity !== 'minor') ? 'failed' : 'passed' };
    chapter.repairAttempts = 0;
    chapter.lastFindingShapes = undefined;
    await this.checkpoint(run);
    return true;
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
${JSON.stringify(planWithoutRetelling(chapter.plan))}
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
    const raw = await generateProse(this.llm, `${specPrompt(run.spec)}${genreCraft(run.spec)}${proseCraft(run, chapter)}\nLITERARY INTENT FOR THIS CHAPTER:\n${JSON.stringify(chapter.literaryPlan)}\nPLAN:\n${JSON.stringify(planWithoutRetelling(chapter.plan))}\nACCEPTED CANON BEFORE THIS CHAPTER:\n${JSON.stringify(canonForPrompt(canonBefore(run, chapter.number)))}\nREPAIR ONLY THESE ISSUES:\n${JSON.stringify(issues)}\nEach issue carries the exact passages it refers to. Locate those passages in the prose below and rewrite those passages. Reproduce every other sentence unchanged, word for word: a rewrite that regenerates the whole chapter reintroduces the same defect. The cited wording must not survive in the revision.${issues.some(issue => distributed.includes(issue.id)) ? ` One exception, and only for these issues: ${issues.filter(issue => distributed.includes(issue.id)).map(issue => issue.id).join(', ')}. They describe a proportion of the whole chapter, their quotations are examples rather than the full extent of the defect, and editing only the quoted lines cannot change a proportion — a live chapter sat at 92% through six revisions that way. For those issues change every line in the chapter that carries the same defect, and leave everything else exactly as it stands.` : ''}\n${extra}\nFULL CURRENT PROSE:\n${version.content}\nReturn ONLY the complete revised chapter in the story's language. Do not output planning lists, outline scaffolding, working draft variants, or English commentary. Start directly with the story prose. Add no new memory, backstory or explanation of how something came to be: a character may not recall an origin the story has not given, and inventing one is the defect this review keeps finding. Where a finding says a character uses knowledge the story has not given them, repair it by taking the knowledge away — let the character guess, wonder, be wrong or say nothing — whatever the finding's own instruction asks for; a chapter spent fourteen revisions on one such finding because every round was told to supply the missing source and forbidden to invent one. Preserve all unaffected events, clues, names, scene outcomes and intentional voice. Do not add stock gestures, rename characters or impose synonym variation. Do not summarize or omit scenes.${budget}`, 'You perform targeted fiction revision. Return only the final revised story prose without scaffolding.', { temperature: SAMPLING.repair, maxTokens: Math.max(8192, version.content.length) });
    return this.extractProse(raw).trim();
  }

  private async writeRemaining(run: NovelRun) {
    let chapter: ChapterRecord | undefined;
    while ((chapter = nextUnacceptedChapter(run))) {
      if (run.spec.skipEditing) {
        let candidate = chapter.versions.find(v => v.revision === chapter.candidateRevision);
        if (!candidate && chapter.status === 'invalidated' && chapter.versions.length) {
          const old = chapter.versions.find(v => v.revision === chapter.acceptedRevision) || chapter.versions.at(-1)!;
          candidate = addCandidate(chapter, old.content, 'Preserved manuscript');
        }
        if (!candidate) {
          chapter.sceneDrafts ||= [];
          const full = run.spec.chapterMode === 'full';
          if (full && !chapter.sceneDrafts.length) {
            chapter.sceneDrafts.push(await writeDirect(run, chapter, this.llm));
            chapter.status = 'draft';
            await this.checkpoint(run);
          } else if (!full) {
            for (let i = chapter.sceneDrafts.length; i < chapter.plan.detailedScenes.length; i++) {
              chapter.sceneDrafts.push(await writeDirect(run, chapter, this.llm, i));
              chapter.status = 'draft';
              await this.checkpoint(run);
            }
          }
          candidate = addCandidate(chapter, chapter.sceneDrafts.join('\n\n***\n\n'), 'Initial chapter draft');
          await this.checkpoint(run);
        }
        await this.acceptOrRepair(run, chapter, candidate);
        continue;
      }
      if (!chapter.literaryPlan || chapter.literaryPlan.contextKey !== literaryContextKey(run, chapter.number) || chapter.literaryPlan.chapterPlanKey !== JSON.stringify(chapter.plan)) {
        if (run.spec.skipEditing) {
          chapter.literaryPlan = {
            version: 1,
            contextKey: literaryContextKey(run, chapter.number),
            chapterPlanKey: JSON.stringify(chapter.plan),
            endingDevelopment: chapter.plan.chapterEnding || '',
            avoidReplaying: [],
            scenes: (chapter.plan.detailedScenes || []).map(s => ({
              sceneId: s.sceneId,
              development: s.objective || '',
              characterChoice: s.conflict || '',
              dramaticCost: s.outcome || '',
              narrativeWeight: s.narrativeWeight || 3,
            })),
          };
        } else {
          chapter.literaryPlan = await planLiteraryDevelopment(run, chapter, this.llm, this.summarize);
        }
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
        const isFullChapter = run.spec.chapterMode === 'full';

        if (isFullChapter && chapter.sceneDrafts.length === 0) {
          let fullProse = this.extractProse(await writeFullChapter(run, chapter, this.llm));
          const residue = run.spec.skipEditing ? [] : apparatusResidue(fullProse);
          if (residue.length) {
            const rewritten = this.extractProse(await writeFullChapter(run, chapter, this.llm,
              `Your previous attempt left planning apparatus notes on the page: ${JSON.stringify(residue)}. Remove all scene labels, headers, and planning notes. Output pure narrative prose only.`));
            if (rewritten && !apparatusResidue(rewritten).length) fullProse = rewritten;
          }

          const parts = fullProse.split(/\n+\s*\*\*\*\s*\n+/).map(s => s.trim()).filter(Boolean);
          chapter.sceneDrafts = parts.length > 1 ? parts : [fullProse];
          chapter.status = 'draft';
          await this.checkpoint(run);
          candidate = addCandidate(chapter, fullProse, 'Initial chapter draft');
          await this.checkpoint(run);
        } else {
          for (let sceneIndex = chapter.sceneDrafts.length; sceneIndex < chapter.plan.detailedScenes.length; sceneIndex++) {
            let scene = this.extractProse(await writeScene(run, chapter, sceneIndex, this.llm));
          // A live chapter arrived as scene one followed by scene two written four times: the writer,
          // shown the prose already written, returned it again for every remaining scene. Catching the
          // copy here costs one call; letting it through cost that chapter fourteen revisions.
          if (!run.spec.skipEditing && copyOfEarlierScene(scene, chapter.sceneDrafts)) {
            scene = this.extractProse(await writeScene(run, chapter, sceneIndex, this.llm, 'Your previous attempt returned prose already written for an earlier scene of this chapter. That scene is finished. Write the scene requested here: it starts from the situation the earlier prose ended in and must not retell it.'));
            if (copyOfEarlierScene(scene, chapter.sceneDrafts)) throw new Error(`Scene ${sceneIndex + 1} of chapter ${chapter.number} came back as a copy of an earlier scene twice.`);
          }
          // Editorial mode treats an empty answer as a failed draft. Direct mode never stops the
          // writing run to judge or retry a model answer; it records exactly what was generated.
          if (!scene && !run.spec.skipEditing) throw new Error(`Scene ${sceneIndex + 1} of chapter ${chapter.number} is empty.`);
          // Not the whole scene copied, but passages of it told again. Compared now, the answer is to
          // write one scene of eight hundred words; found after the chapter is finished — where twelve
          // of the twenty-five blocking findings on first drafts were found — the answer is to rewrite
          // the chapter around it. One attempt: a second restatement is the chapter review's business.
          const restated = run.spec.skipEditing ? [] : restatedFromEarlierScenes(scene, chapter.sceneDrafts);
          if (restated.length) {
            const retold = restated.slice(0, 4).map(item => `"${item.sentence}" repeats "${item.source}"`).join('; ');
            const rewritten = this.extractProse(await writeScene(run, chapter, sceneIndex, this.llm,
              `Your previous attempt told again what earlier scenes of this chapter have already put on the page: ${retold}. Those events happened; this scene begins after them. Write this scene's own material, and refer to what is already told only as something the characters take for granted.`));
            if (rewritten && restatedFromEarlierScenes(rewritten, chapter.sceneDrafts).length < restated.length) scene = rewritten;
          }
          // The plan, left standing where the prose should be. One attempt, like the restatement check
          // above: a scene that comes back labelled twice is the chapter review's business, and the
          // rewrite is kept only if it is actually clean — a retry that trades one label for another
          // has bought nothing worth losing a written scene for.
          const residue = run.spec.skipEditing ? [] : apparatusResidue(scene);
          if (residue.length) {
            const rewritten = this.extractProse(await writeScene(run, chapter, sceneIndex, this.llm,
              `Your previous attempt left the planning apparatus standing on the page: ${JSON.stringify(residue)}. Those are notes from the plan you were given, not prose, and a reader sees them as an unfinished draft. Write the scene again as finished narration in the ${run.spec.tense} tense: no scene, beat or chapter label, no field name, no bracketed note, no sentence instructing rather than narrating. Whatever those lines were reserving a place for is dramatized instead.`));
            if (rewritten && !apparatusResidue(rewritten).length) scene = rewritten;
          }
          chapter.sceneDrafts.push(scene);
          chapter.status = 'draft';
          // What this scene established, read off the page it was just written on, so the next scene
          // inherits the chapter's actual state rather than the plan's intention for it. An entry is
          // always recorded, empty if the reading failed: a missing continuity note costs the next
          // scene some of its context, and a journal out of step with the drafts would cost it more.
          chapter.sceneJournal ||= [];
          if (!run.spec.skipEditing) {
            try {
              chapter.sceneJournal.push(await readSceneJournal(run, chapter, sceneIndex, scene, this.llm));
            } catch {
              chapter.sceneJournal.push({ sceneId: chapter.plan.detailedScenes[sceneIndex].sceneId, notes: [] });
            }
          } else {
            chapter.sceneJournal.push({ sceneId: chapter.plan.detailedScenes[sceneIndex].sceneId, notes: [] });
          }
          // Three faults the chapter review finds too late, read off the page the scene was just
          // written on: the declared change never happens, a required beat is reported instead of
          // performed, and a beat is played out and then played out again after a break. They are one
          // family — a scene that reads well, contradicts nothing, and leaves the reader where it
          // found them — and they get the treatment the restated and apparatus-laden drafts get: one
          // pointed attempt naming all of them, kept only if the rewrite is actually cleaner. Nothing
          // is discarded otherwise, and the chapter review still has the scene in front of it.
          if (!run.spec.skipEditing) {
            const entry = chapter.sceneJournal.at(-1);
            const faults = sceneFaults(chapter.plan.detailedScenes[sceneIndex], entry);
            if (entry && faults.length) {
              try {
                const rewritten = this.extractProse(await writeScene(run, chapter, sceneIndex, this.llm,
                  `Your previous attempt has to be written again. ${faults.join(' ')} Keep the events, people and outcome already planned; what must change is that these happen in front of the reader, once each.`));
                if (rewritten) {
                  const reread = await readSceneJournal(run, chapter, sceneIndex, rewritten, this.llm);
                  if (sceneFaults(chapter.plan.detailedScenes[sceneIndex], reread).length < faults.length) {
                    chapter.sceneDrafts[chapter.sceneDrafts.length - 1] = rewritten;
                    chapter.sceneJournal[chapter.sceneJournal.length - 1] = reread;
                  }
                }
              } catch {
                // A failed re-ask leaves the written scene standing. A faulty scene is worth one call,
                // never the run.
              }
            }
          }
          await this.checkpoint(run);
        }
        candidate = addCandidate(chapter, chapter.sceneDrafts.join('\n\n***\n\n'), 'Initial chapter draft');
        await this.checkpoint(run);
        }
      }
      await this.acceptOrRepair(run, chapter, candidate);
    }
  }

  private async globalReview(run: NovelRun, phase: 'structure' | 'final') {
    const field = phase === 'structure' ? 'structuralReview' : 'finalReview';
    const attempts = phase === 'structure' ? 'structuralAttempts' : 'finalAttempts';
    let redrawn = 0;
    for (;;) {
      run[field] = await reviewBook(run, this.llm, phase);
      await this.checkpoint(run);
      if (run.spec.forwardOnly || run[field].status === 'passed') return;
      let report = run[field];
      // A book review reads the ledger rather than the prose, so its quotations are the likeliest
      // thing to go wrong: a passage extended by a word cannot be located, and a report whose every
      // finding was discarded is a review that did not happen, not a book that needs attention.
      if (report.status === 'not_checked' && redrawn < MAX_REVIEW_REDRAWS) {
        redrawn++;
        run[field] = await reviewBook(run, this.llm, phase, report.error
          ? `\nYOUR PREVIOUS REPORT ON THIS BOOK WAS DISCARDED: ${report.error} Copy each quotation out of the ledger exactly as it appears there and add nothing to it. Quote less and quote exactly: one accurate quotation carries a finding, an approximate one loses it.` : '');
        await this.checkpoint(run);
        if (run[field].status === 'passed') return;
        report = run[field];
      }
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
        if (!chapter) continue;
        const version = acceptedVersion(chapter);
        if (!version) continue;
        const issues = report.issues.filter(issue => issue.evidence.some(evidence => evidence.chapter === number));
        if (!issues.length) {
          const missingSetups = run.blueprint.promises.filter(p => p.required && p.setupChapter === number && !run.canon.promises.some(item => item.promiseId === p.id && item.kind === 'setup'));
          const missingPayoffs = run.blueprint.promises.filter(p => p.required && p.payoffChapter === number && !run.canon.promises.some(item => item.promiseId === p.id && item.kind === 'payoff'));
          for (const p of missingSetups) {
            issues.push({
              id: `missing-setup-${p.id}`,
              category: 'plot',
              severity: 'major',
              description: `Required story promise "${p.description}" is scheduled to be introduced in this chapter but lacks verified evidence.`,
              instruction: `Dramatize and plant the setup for this narrative promise: ${p.description}. Keep all unaffected prose unchanged.`,
              evidence: [{ chapter: number, revision: version.revision, quote: version.content.slice(0, 200) }],
            });
          }
          for (const p of missingPayoffs) {
            issues.push({
              id: `missing-payoff-${p.id}`,
              category: 'plot',
              severity: 'major',
              description: `Required story promise "${p.description}" is scheduled for payoff in this chapter but lacks verified evidence.`,
              instruction: `Dramatize and resolve the payoff for this narrative promise: ${p.description}. Keep all unaffected prose unchanged.`,
              evidence: [{ chapter: number, revision: version.revision, quote: version.content.slice(0, 200) }],
            });
          }
        }
        if (!issues.length) continue;
        const content = await this.repair(run, chapter, version, issues, `GLOBAL REVIEW: ${report.error || ''}\nRequired promises for this chapter: ${JSON.stringify(run.blueprint.promises.filter(promise => promise.setupChapter === number || promise.payoffChapter === number))}`);
        const candidate = addCandidate(chapter, content, `Address ${phase} review`);
        await this.checkpoint(run);
        await this.acceptOrRepair(run, chapter, candidate);
      }
      await this.writeRemaining(run);
    }
  }

  private async lineEdit(run: NovelRun) {
    if (run.spec.forwardOnly) return;
    for (const chapter of run.chapters) {
      await this.writeRemaining(run);
      const version = acceptedVersion(chapter);
      if (chapter.lineEditedRevision === version.revision) continue;
      // Reuse the evidenced local review. No blanket rewrite for a chapter without actionable issues.
      // The line edit is where wishes belong, so this is where the ones set aside during the chapter's
      // revisions arrive: not blocking anything at the time, not thrown away either. Bounded, because
      // a pass that answers every wish a book ever raised is the improvement loop we just left behind.
      const tasteful = ['dialogue', 'voice', 'pacing', 'hook', 'audience'];
      const current = version.review?.issues.filter(issue => tasteful.includes(issue.category)) || [];
      const deferred = (chapter.settled || [])
        .filter(item => item.reason === 'written as a wish rather than a defect' && tasteful.includes(item.category))
        .filter(item => !current.some(issue => issue.description === item.description))
        .slice(0, 3)
        .map((item): ReviewIssue => ({ id: item.id, category: item.category, severity: 'minor', description: item.description,
          instruction: 'Answer this if the passage it names can be improved without changing what the chapter establishes; leave it as it stands otherwise.',
          evidence: [{ chapter: chapter.number, revision: version.revision, quote: version.content.slice(0, 200) }] }));
      const issues = [...current, ...deferred];
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

  async reviewCompleted(run: NovelRun): Promise<void> {
    if (run.stage !== 'complete') throw new Error('Finish the manuscript before editing.');
    const text = run.chapters.map(c => `CHAPTER ${c.number}: ${c.plan.title}\n${acceptedVersion(c)!.content}`).join('\n\n');
    const result = await structuredResponse(`AUTHOR REQUEST:\n${specPrompt(run.spec)}\nBOOK PLAN:\n${run.outline}\nCOMPLETE MANUSCRIPT:\n${text}\nReview continuity, repetition, scene completeness and the earned ending. Return {"report":"concise specific findings with chapter numbers; distinguish suggestions from contradictions", "proposals":[{"chapter":1,"instruction":"a concrete optional revision"}]}. Do not rewrite the manuscript. No score or invented evidence. Empty proposals are valid.`, 'You review a completed manuscript on the author’s request.', this.llm, ['report', 'proposals'], raw => {
      if (typeof raw.report !== 'string' || !Array.isArray(raw.proposals)) throw new Error('Invalid editorial report');
      return { report: raw.report, proposals: raw.proposals.filter((p: any) => Number.isInteger(p.chapter) && p.chapter >= 1 && p.chapter <= run.chapters.length && typeof p.instruction === 'string' && p.instruction.trim()) as { chapter: number; instruction: string }[] };
    }, { route: 'writer', maxTokens: 4096 });
    run.editorial = { ...result, revisions: run.chapters.map(c => c.acceptedRevision!) };
    await this.checkpoint(run);
  }

  async applyEditorial(run: NovelRun): Promise<void> {
    if (run.stage !== 'complete' || !run.editorial?.proposals?.length) throw new Error('No editorial proposals to apply.');
    if (run.chapters.some((c, i) => c.acceptedRevision !== run.editorial!.revisions[i])) throw new Error('The manuscript changed. Review it again first.');
    // Work on a separate copy. A failed request cannot replace the downloadable manuscript.
    const draft = structuredClone(run);
    const original = `# ${run.title}\n\n` + run.chapters.map(c => `## Chapter ${c.number}: ${c.plan.title}\n\n${acceptedVersion(c)!.content}`).join('\n\n');
    for (const number of [...new Set(run.editorial.proposals.map(p => p.chapter))].sort((a, b) => a - b)) {
      const chapter = draft.chapters[number - 1];
      const previous = acceptedVersion(chapter)!;
      const content = stripThinking(await this.llm(`Revise only the requested passages. Preserve all other events and the author's voice. Return the complete chapter as prose, without JSON or commentary.\nREQUESTS:\n${run.editorial.proposals.filter(p => p.chapter === number).map(p => p.instruction).join('\n')}\nORIGINAL CHAPTER:\n${previous.content}`, 'You edit a chapter on the author’s request.', { route: 'writer', temperature: 0.4, maxTokens: Math.max(8192, previous.content.length) }));
      if (!content.trim()) throw new Error('The editor returned empty prose; original manuscript preserved.');
      const candidate = addCandidate(chapter, content, 'Requested editorial revision');
      candidate.analysis = await rememberChapter(chapter, candidate, this.llm);
      candidate.review = { status: 'not_checked', issues: [], checkedRevision: candidate.revision };
      acceptCandidate(draft, number);
    }
    draft.manuscriptHistory = [...(run.manuscriptHistory || []), { title: run.title || 'Manuscript', content: original, at: Date.now() }];
    draft.editorial = undefined;
    draft.stage = 'complete';
    Object.assign(run, draft);
    await this.checkpoint(run);
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
      if (run.spec.skipEditing) run.stage = 'final_review';
      if (run.stage === 'writing' || run.stage === 'structural_review') {
        run.stage = 'structural_review';
        await this.checkpoint(run);
        // The structural pass exists to send chapters back before the line edit. Forward-only does
        // neither — it cannot revise an accepted chapter and it never reaches the line edit — so the
        // pass was reading the whole book's ledger through a model and writing the answer into a
        // field no code has ever read. The final pass below still runs: its verdict reaches the
        // manuscript metadata, and its findings are what the author is shown at the end.
        if (!run.spec.skipEditing && !run.spec.forwardOnly) {
          await this.globalReview(run, 'structure');
        } else {
          run.structuralReview = { status: 'not_checked', issues: [], checkedRevision: 0 };
        }
        run.stage = 'line_editing';
        await this.checkpoint(run);
      }
      if (run.stage === 'line_editing') {
        if (!run.spec.skipEditing) {
          await this.lineEdit(run);
        }
        run.stage = 'final_review';
        await this.checkpoint(run);
      }
      if (run.stage === 'final_review') {
        if (!run.spec.skipEditing) {
          await this.globalReview(run, 'final');
        } else {
          run.finalReview = { status: 'not_checked', issues: [], checkedRevision: 0 };
        }
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
