import { contentWords } from '../analytics';
import { matchKey } from './normalize';
import { bandsFor, curveProblems, profileOf, readRung } from './profile';
import { repeatedStaging, sceneShape, type SceneShape } from './shapes';
import type { BookDesign, ChapterPlan, ReaderThread, ScenePlan } from './types';

/**
 * The plan-time gate: everything about a chapter that can be known before a
 * prose token exists.
 *
 * This is the cheapest checkpoint in the pipeline and the one that does the
 * most work. A chapter plan is one or two percent of the tokens of the chapter
 * it describes, so five rounds here cost less than one prose rewrite — and a
 * prose rewrite cannot fix what is wrong at this altitude anyway. A middle act
 * that iterates instead of escalating is decided in the plan; no amount of
 * re-writing scene four turns four identical chapters into a rising book.
 *
 * Every check here is arithmetic over the plan, the design's allocation and
 * what the book has already spent. No model calls, no prose, no guessing at
 * meaning: the findings say what repeats, what costs nothing, and what the
 * ending will not have time to pay for.
 */

export interface PlanFinding {
  /** A blocking finding sends the plan back to the planner; an advisory rides along as a warning. */
  severity: 'blocking' | 'advisory';
  code: 'mechanism-unknown' | 'mechanism-exhausted' | 'no-cost' | 'no-rung' | 'curve-break'
  | 'repeated-staging' | 'outcome-monotony' | 'ending-capacity' | 'no-outcome-kind' | 'promise-ageing' | 'thin-scene'
  | 'solitary-chapter' | 'scene-seam' | 'fact-clash' | 'too-many-scenes';
  detail: string;
}

/**
 * A scene planned with almost nothing in it: fewer than five content words
 * across function, development, outcome and pressure. Advisory only — a
 * deliberately spare scene is a style, and the bar sits far below any
 * normally planned scene, so clean plans never trip it. Code counts; P02
 * judges whether the sparseness earns its place.
 */
export function thinScenePlan(scene: { id: string; function?: string; development?: string; required_outcome?: string; pressure_or_uncertainty?: string }): string {
  const text = [scene.function, scene.development, scene.required_outcome, scene.pressure_or_uncertainty]
    .filter(Boolean).join(' ');
  if (contentWords(text).length < 5) {
    return `Scene ${scene.id} is planned with almost nothing in it — barely a setup, an outcome, or a pressure to write from. Resolve its outcome through action, discovery, loss, or commitment on the page, or say what the sparseness is for.`;
  }
  return '';
}

export interface PlanGateInput {
  design: BookDesign;
  chapter: number;
  plan: ChapterPlan;
  /** Mechanisms already spent by finished chapters, with the chapters that spent them. */
  spentMechanisms: { mechanism: string; chapters: number[] }[];
  /** Rungs taken by finished chapters, oldest first. */
  priorRungs: number[];
  /** Stagings of the accepted scenes, for the repetition window. */
  recentShapes: SceneShape[];
  /** Outcome classes of the accepted scenes, oldest first. */
  priorOutcomeKinds: string[];
  /** What the ending still needs, as of the last finished chapter. */
  endingRequirements: string[];
  /** Promises the book has made and not kept, with the chapter each was made in. */
  openThreads: { thread: ReaderThread; madeInChapter: number }[];
  /** Chapters left in the book, this one included. */
  remainingChapters: number;
  /** Where the last accepted scene left things, when its plan said: the first scene of this chapter opens from it. */
  previousEnd?: { scene: string; state: Record<string, string> };
  /** What the local model made of the plan's seams, when it read them. */
  seamVerdicts?: SeamVerdicts;
  /** The particulars on record, so a plan cannot fix one differently. */
  facts?: { id: string; statement: string }[];
  /** The most scenes this chapter's length holds; 0 or absent when no length is set. */
  maxScenes?: number;
}

const NUMBER_WORDS = new Set(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty',
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']);

function tokens(text: string): string[] {
  return (text || '').toLowerCase().match(/[\p{L}]+|\d+/gu) || [];
}

function numbersIn(text: string): string[] {
  return [...new Set(tokens(text).filter(word => /^\d+$/.test(word) || NUMBER_WORDS.has(word)))].sort();
}

/** The words of a statement that say what it is about, numbers aside. */
function subjectWords(text: string): Set<string> {
  return new Set(contentWords(text).filter(word => !/^\d+$/.test(word) && !NUMBER_WORDS.has(word)));
}

/**
 * Do two states of the same thing agree?
 *
 * Words in common over words in all. "Closed, set on the corner of the desk"
 * and "open on the desk" share the desk and nothing else, and that is the case
 * this exists for; the same place said twice in slightly different words shares
 * most of what it has. Crude, and cheap to be wrong about: a seam flagged in
 * error costs the planner one sentence, and one missed costs a scene written
 * from a start the scene before it did not leave.
 */
export function statesAgree(first: string, second: string): boolean {
  const left = new Set(contentWords(first).map(stem));
  const right = new Set(contentWords(second).map(stem));
  if (!left.size || !right.size) return true;
  // Measured against the shorter side: an entry that says the same thing in
  // fewer words, or adds a detail to it, still says the same thing.
  const shared = [...left].filter(word => right.has(word)).length;
  return shared / Math.min(left.size, right.size) >= 0.5;
}

/**
 * An opening that says what changed since the scene before. The planner is
 * told it may do this instead of repeating the entry, so an entry that reports
 * a movement or a lapse of time is an answer, not a mismatch. Code cannot tell
 * whether the change is plausible; it can tell that one was stated.
 */
const CHANGE_STATED = /\b(?:has|have|had|having|after|since|later|no longer|left|returned|walked|moved|went|gone|arrived|exited|entered|carried|brought)\b/i;
export function statesChange(text: string): boolean {
  return CHANGE_STATED.test(text);
}

/**
 * Whether two entries for the same key contradict, when something better than
 * shared words has read them: `${key}\n${before}\n${after}` → verdict. A pair
 * it does not hold falls back to the words.
 */
export type SeamVerdicts = Map<string, boolean>;

export function seamKey(key: string, before: string, after: string): string {
  return `${matchKey(key)}\n${before}\n${after}`;
}

export interface Seam {
  scene: string;
  key: string;
  before: string;
  after: string;
  /** The opening says something changed between the scenes. */
  changeStated: boolean;
  text: string;
}

/** Every key a scene opens with that contradicts how the scene before it ended. */
export function seamBreaks(previous: { scene: string; state: Record<string, string> } | undefined, next: ScenePlan, verdicts?: SeamVerdicts): Seam[] {
  if (!previous) return [];
  const ended = new Map(Object.entries(previous.state || {}).map(([key, value]) => [matchKey(key), { key, value: String(value) }]));
  const breaks: Seam[] = [];
  for (const [key, raw] of Object.entries(next.state_at_start || {})) {
    const after = String(raw);
    const before = ended.get(matchKey(key));
    if (!before) continue;
    const read = verdicts?.get(seamKey(key, before.value, after));
    // Read by the model, a stated change still contradicts and is still a
    // break — one for a reader. By words alone a stated change cannot be told
    // from a different sentence, so it passes.
    const broken = read ?? (!statesAgree(before.value, after) && !statesChange(after));
    if (!broken) continue;
    breaks.push({
      scene: next.id, key, before: before.value, after, changeStated: statesChange(after),
      text: `${previous.scene} ends with ${before.key}: "${before.value}", and ${next.id} opens with ${key}: "${after}"`,
    });
  }
  return breaks;
}

/** Where a scene's opening state disagrees with how the scene before it ended and says nothing of a change, key by key. */
export function seamProblems(previous: { scene: string; state: Record<string, string> } | undefined, next: ScenePlan, verdicts?: SeamVerdicts): string[] {
  return seamBreaks(previous, next, verdicts).filter(seam => !seam.changeStated).map(seam => seam.text);
}

/**
 * The seams of a chapter plan, each scene against the one before it, starting
 * from where the last accepted scene left things.
 */
export function chapterSeams(plan: ChapterPlan, previousEnd: { scene: string; state: Record<string, string> } | undefined, verdicts?: SeamVerdicts): Seam[] {
  const seams: Seam[] = [];
  let ending = previousEnd;
  for (const scene of plan.scenes) {
    seams.push(...seamBreaks(ending, scene, verdicts));
    if (scene.state_at_end && Object.keys(scene.state_at_end).length) ending = { scene: scene.id, state: scene.state_at_end };
  }
  return seams;
}

/** Every pair of entries a chapter plan's seams put side by side, for whatever reads them. */
export function seamPairs(plan: ChapterPlan, previousEnd: { scene: string; state: Record<string, string> } | undefined): { key: string; before: string; after: string }[] {
  const pairs: { key: string; before: string; after: string }[] = [];
  let ending = previousEnd;
  for (const scene of plan.scenes) {
    const ended = new Map(Object.entries(ending?.state || {}).map(([key, value]) => [matchKey(key), String(value)]));
    for (const [key, value] of Object.entries(scene.state_at_start || {})) {
      const before = ended.get(matchKey(key));
      if (before !== undefined && before.trim() !== String(value).trim()) pairs.push({ key, before, after: String(value) });
    }
    if (scene.state_at_end && Object.keys(scene.state_at_end).length) ending = { scene: scene.id, state: scene.state_at_end };
  }
  return pairs;
}

/**
 * Particulars the plan fixes differently from the record: the same statement
 * about the same thing, with other numbers in it.
 *
 * Deliberately narrow. Two statements have to be about the same subject — most
 * of their words in common, numbers aside — before their numbers are compared,
 * so one guest's room is never held against another's. What it catches is the
 * exact case that reached print: a count, a date or a room stated one way in an
 * early scene and another way later, by a writer who was never told the first.
 */
export function factClashes(establishes: string[], facts: { id: string; statement: string }[]): { planned: string; recorded: string; id: string }[] {
  const clashes: { planned: string; recorded: string; id: string }[] = [];
  for (const planned of establishes) {
    const numbers = numbersIn(planned);
    const subject = subjectWords(planned);
    if (!numbers.length || subject.size < 3) continue;
    for (const fact of facts) {
      const recorded = numbersIn(fact.statement);
      if (!recorded.length || recorded.join() === numbers.join()) continue;
      const other = subjectWords(fact.statement);
      const shared = [...subject].filter(word => other.has(word)).length;
      if (shared / new Set([...subject, ...other]).size >= 0.6) clashes.push({ planned, recorded: fact.statement, id: fact.id });
    }
  }
  return clashes;
}

/**
 * Does this plan's text take up a requirement or a promise at all?
 *
 * Content-word overlap, not meaning: something whose distinctive words appear
 * nowhere in the chapter is certainly not being prepared here, which is all
 * these checks need to know. Whether an overlap really prepares it stays P02's
 * judgement.
 *
 * Two things make the difference between a usable signal and a dead one. Cast
 * names are dropped, because the protagonist appears in every plan of every
 * chapter and a promise phrased as a question about her would otherwise count
 * as addressed by any plan at all — which is exactly how a first attempt at
 * this let seven standing promises through untouched. And half the remaining
 * anchors must appear, not one: a single shared noun is a coincidence, and the
 * whole point is to tell a chapter that picks a promise up from one that
 * happens to mention a word from it.
 */
export function takenUp(planText: string, subject: string, castNames: Set<string>): boolean {
  const anchors = new Set(contentWords(subject)
    .filter(word => word.length >= 5 && !castNames.has(word))
    .map(stem));
  if (!anchors.size) return true;
  const inPlan = new Set(contentWords(planText).map(stem));
  let present = 0;
  for (const anchor of anchors) if (inPlan.has(anchor)) present++;
  // Two anchors, or half of them — and never more than there are: a subject
  // that leaves one word to look for is taken up when that word is there.
  return present >= Math.min(anchors.size, Math.max(2, Math.ceil(anchors.size / 2)));
}

/**
 * Enough of a stem to survive an inflection. A plan that says "burns the
 * logbook" is taking up a requirement that says "the logbook is burned", and a
 * comparison that cannot see that is a comparison that fires on kept promises.
 * Crude on purpose: a real stemmer is a dictionary, and this only has to make
 * two spellings of the same word meet.
 */
function stem(word: string): string {
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) return word.slice(0, -suffix.length);
  }
  return word;
}

/** Lowercased words of every cast name, which appear in every plan and prove nothing. */
export function castWords(design: BookDesign): Set<string> {
  return new Set((design.characters || []).flatMap(character => contentWords(character.name || '')));
}

/** How many scenes in a row, ending at this plan's last scene, share one outcome class. */
export function outcomeRun(priorKinds: string[], planKinds: string[]): { kind: string; run: number } {
  const all = [...priorKinds, ...planKinds].map(matchKey).filter(Boolean);
  if (!all.length) return { kind: '', run: 0 };
  const kind = all.at(-1)!;
  let run = 0;
  for (let index = all.length - 1; index >= 0 && all[index] === kind; index--) run++;
  return { kind, run };
}

/**
 * Which ledger entry a chapter's mechanism draws on, or null when none.
 *
 * Not exact equality. A planner writes the ledger entry back in its own words,
 * or combines two — "confronting a caller with what a previous call gave her,
 * and tracing the number despite the risk" — and an equality test calls that an
 * invention, rejects the plan three times, and then writes the chapter anyway
 * over a defect that was never real. Matching is by the entry's own content
 * words: the entry whose words the chapter's mechanism actually carries.
 *
 * A mechanism that draws on two entries resolves to the one it carries most, so
 * the allowance is still spent against something. The bar is deliberately low:
 * this gate exists to spend the ledger, not to police vocabulary, and the two
 * errors are not symmetric. A false "unknown" burns three planning rounds and
 * then writes the chapter anyway under a warning that was never true; a false
 * match lets a rephrased chapter through, where the design review and the scene
 * review still read the plan. Two shared content words are required as well as
 * the share, so half-recalling an entry does not count as drawing on it.
 */
export function matchLedgerEntry(mechanism: string, ledger: string[]): string | null {
  const key = matchKey(mechanism);
  const exact = ledger.find(entry => matchKey(entry) === key);
  if (exact) return matchKey(exact);
  const used = new Set(contentWords(mechanism));
  let best: { key: string; share: number } | null = null;
  for (const entry of ledger) {
    const words = contentWords(entry);
    if (!words.length) continue;
    const shared = words.filter(word => used.has(word)).length;
    const share = shared / words.length;
    if (shared >= 2 && share >= 0.4 && (!best || share > best.share)) best = { key: matchKey(entry), share };
  }
  return best ? best.key : null;
}

export function checkChapterPlan(input: PlanGateInput): PlanFinding[] {
  const { design, chapter, plan } = input;
  const profile = profileOf(design);
  const bands = bandsFor(profile);
  const findings: PlanFinding[] = [];
  const allocated = design.chapter_map.find(entry => entry.chapter === chapter);

  // — The mechanism, drawn from a ledger that can run out.
  const mechanism = (plan.mechanism || '').trim();
  if (mechanism && profile.mechanism_ledger.length) {
    const ledger = new Map(profile.mechanism_ledger.map(item => [matchKey(item), item]));
    const key = matchLedgerEntry(mechanism, profile.mechanism_ledger);
    if (key === null) {
      findings.push({
        severity: 'blocking',
        code: 'mechanism-unknown',
        detail: `Chapter ${chapter} meets the obstacle by "${mechanism}", which is not in this book's ledger (${profile.mechanism_ledger.join('; ')}). Draw the chapter's mechanism from the ledger, or say plainly that the book needs a way of meeting the obstacle it never planned for.`,
      });
    } else {
      const already = input.spentMechanisms.find(item => matchKey(item.mechanism) === key)?.chapters || [];
      if (already.length >= bands.mechanismReuse) {
        findings.push({
          severity: 'blocking',
          code: 'mechanism-exhausted',
          detail: `"${ledger.get(key)}" has already carried chapter(s) ${already.join(', ')} — its whole allowance of ${bands.mechanismReuse}. The same solution working again is the reader watching a procedure, not a story. Plan this chapter around a mechanism the ledger still holds.`,
        });
      }
    }
  }

  // — The cost. A chapter that takes nothing repeats the one before it.
  const cost = (plan.cost || '').trim();
  if (!cost) {
    findings.push({
      severity: 'blocking',
      code: 'no-cost',
      detail: `Chapter ${chapter} states no cost${allocated?.cost ? ` (the design allocated it "${allocated.cost}")` : ''}. Say what this chapter takes from someone, in the terms this book declared: ${profile.cost_kinds.join('; ') || 'no cost kinds declared'}. A chapter where nobody pays anything is a chapter that has not moved.`,
    });
  }

  // — The rung, checked against the declared shape rather than against monotonicity.
  const rung = readRung(plan.pressure_rung);
  if (rung === null) {
    findings.push({
      severity: 'blocking',
      code: 'no-rung',
      detail: `Chapter ${chapter} takes no rung on the ${profile.pressure_curve} curve this book declared${readRung(allocated?.pressure_rung) !== null ? ` (the design allocated rung ${allocated!.pressure_rung})` : ''}. Without it nothing can tell a chapter that builds from a chapter that holds.`,
    });
  } else {
    for (const problem of curveProblems(profile.pressure_curve, [...input.priorRungs, rung])) {
      findings.push({ severity: 'blocking', code: 'curve-break', detail: `Chapter ${chapter}: ${problem}` });
    }
  }

  // — Staging. Blocking here, not advisory: this is the check that was
  //   available all along and got ignored because it only ever whispered.
  //   The threshold is the book's own, so a claustrophobic book does not trip.
  const shapes = [...input.recentShapes];
  for (const scene of plan.scenes) {
    const shape = sceneShape(scene);
    const repetition = repeatedStaging(shape, shapes, bands);
    if (repetition) findings.push({ severity: 'blocking', code: 'repeated-staging', detail: repetition });
    shapes.push(shape);
  }

  // — Outcome monotony: the same class of change, scene after scene. What
  //   iteration looks like from above, invisible from inside any one scene.
  const planKinds = plan.scenes.map(scene => (scene.outcome_kind || '').trim());
  if (planKinds.some(kind => !kind)) {
    findings.push({
      severity: 'advisory',
      code: 'no-outcome-kind',
      detail: `Scene(s) ${plan.scenes.filter(scene => !(scene.outcome_kind || '').trim()).map(scene => scene.id).join(', ')} name no outcome class, so the monotony check cannot see them.`,
    });
  }
  const { kind, run } = outcomeRun(input.priorOutcomeKinds, planKinds);
  if (kind && run >= 4) {
    findings.push({
      severity: 'blocking',
      code: 'outcome-monotony',
      detail: `${run} scenes in a row end on the same class of change ("${kind}"). Every one of them may be well made and the sequence still reads as one scene told repeatedly. Let this chapter end at least one scene on a different kind of change — something lost, a commitment made, a relation altered — or say why the sameness is the point.`,
    });
  }

  // — Seams. Each scene's opening state against the end of the one before it,
  //   starting from where the last accepted scene left things.
  let ending = input.previousEnd;
  for (const scene of plan.scenes) {
    for (const problem of seamProblems(ending, scene, input.seamVerdicts)) {
      findings.push({
        severity: 'blocking',
        code: 'scene-seam',
        detail: `${problem}. A scene opens where the one before it ended. Make the two agree, or say in ${scene.id}'s state_at_start what changed between the scenes and how.`,
      });
    }
    if (scene.state_at_end && Object.keys(scene.state_at_end).length) ending = { scene: scene.id, state: scene.state_at_end };
  }

  // — Particulars. What the plan fixes, against what the record already fixed
  //   and against what the chapter's own earlier scenes fix.
  const fixed = [...(input.facts || [])];
  for (const scene of plan.scenes) {
    for (const clash of factClashes(scene.establishes || [], fixed)) {
      findings.push({
        severity: 'blocking',
        code: 'fact-clash',
        detail: `${scene.id} plans to establish "${clash.planned}", and the record already holds "${clash.recorded}" (${clash.id}). One of them is wrong. The record is what the reader has read: plan the scene to agree with it, or plan the scene in which the record is shown to have been false.`,
      });
    }
    (scene.establishes || []).forEach((statement, index) => fixed.push({ id: `${scene.id} plan, item ${index + 1}`, statement }));
  }

  // — Scenes against room. How long a book is comes down to how many scenes
  //   it has, and a planner does not count them against the chapter's length.
  if (input.maxScenes && plan.scenes.length > input.maxScenes) {
    findings.push({
      severity: 'blocking',
      code: 'too-many-scenes',
      detail: `Chapter ${chapter} plans ${plan.scenes.length} scenes and its length holds ${input.maxScenes}. A scene in this book runs to about the same length whatever is asked of it, so a chapter with more scenes is a longer chapter. Merge the scenes that share a place and a purpose, or leave one to the next chapter.`,
    });
  }

  // — Someone to speak to. The book declared how much of it is spoken, and a
  //   scene holding one person cannot contribute to that however it is written.
  //   A single-scene chapter is left alone: one unbroken solitary situation is
  //   a chapter a book is allowed to have.
  const peopled = plan.scenes.filter(scene => new Set(scene.participants || []).size >= 2).length;
  const needed = plan.scenes.length >= 2 ? Math.ceil(plan.scenes.length * bands.spokenScenes) : 0;
  if (peopled < needed) {
    findings.push({
      severity: 'blocking',
      code: 'solitary-chapter',
      detail: `This book declared dialogue weight "${profile.dialogue_weight}", and ${plan.scenes.length - peopled} of this chapter's ${plan.scenes.length} scenes hold one person alone — there is nobody in them to speak to, so they will be narrated whatever the writer is asked for. At least ${needed} scene(s) need two or more participants. Bring someone into a scene that is solitary only by habit — the discovery made in front of a person, the search done with one — rather than adding a scene to talk in.`,
    });
  }

  // — Thin scenes. Advisory: a plan with almost nothing in a scene still
  //   reaches the writer, but the reader is told it travelled light.
  for (const scene of plan.scenes) {
    const thin = thinScenePlan(scene);
    if (thin) findings.push({ severity: 'advisory', code: 'thin-scene', detail: thin });
  }

  // — Promises left standing too long. The thread ledger records what the book
  //   has promised and, since a payoff can be cited by id, what it has kept.
  //   Recording was never the problem: the planner is shown the open list and
  //   nothing obliges it to act, so a promise a character makes out loud, with
  //   a deadline attached, can be recorded, displayed, ignored, and recorded
  //   again as still open, for the whole length of a book. A promise that no chapter has to discharge is a
  //   note, not a promise.
  //
  //   Age, not count, is the signal. A thread opened in the last chapter is
  //   working; one that has stood through two more chapters without being
  //   touched is being dropped, and the fewer chapters remain the less room
  //   there is to be wrong about it.
  const planText = JSON.stringify(plan).toLowerCase();
  const assigned = new Set(plan.scenes.flatMap(scene => (scene.pays_premise || []).map(item => matchKey(String(item?.id || '')))));
  const names = castWords(design);
  const stale = input.openThreads
    .filter(item => chapter - item.madeInChapter >= 2)
    // A premise given the plan has assigned to a scene by id is taken up,
    // whatever words the plan uses for it.
    .filter(item => !assigned.has(matchKey(item.thread.id)) && !takenUp(planText, item.thread.description, names));
  if (stale.length) {
    const room = input.remainingChapters;
    const severity: PlanFinding['severity'] = room <= 2 ? 'blocking' : 'advisory';
    findings.push({
      severity,
      code: 'promise-ageing',
      detail: `${stale.length} promise(s) made ${chapter - Math.max(...stale.map(item => item.madeInChapter))} or more chapters ago are still open and this plan does not touch them: ${stale.slice(0, 3).map(item => `"${item.thread.description}"`).join('; ')}${stale.length > 3 ? `; and ${stale.length - 3} more` : ''}. ${room <= 2 ? `${room} chapter(s) remain — keep one of these here or drop it openly, because after this there is no room to.` : 'Carry one forward, or let the book say plainly that it is not going to.'}`,
    });
  }

  // — The horizon. The ending's capacity is checked while chapters remain to
  //   spend on it, not after the last one, when saying so changes nothing.
  const standing = input.endingRequirements.filter(Boolean);
  if (standing.length && input.remainingChapters > 0 && standing.length > input.remainingChapters) {
    const untouched = standing.filter(requirement => !takenUp(planText, requirement, names));
    if (untouched.length > input.remainingChapters) {
      findings.push({
        severity: 'blocking',
        code: 'ending-capacity',
        detail: `The ending still needs ${standing.length} thing(s) established and ${input.remainingChapters} chapter(s) remain, and this plan prepares none of: ${untouched.slice(0, 4).join('; ')}${untouched.length > 4 ? `; and ${untouched.length - 4} more` : ''}. At this rate the book arrives at its ending with the ending unpaid for. Carry at least one of these into this chapter.`,
      });
    }
  }

  return findings;
}

export function describeFindings(findings: PlanFinding[]): string {
  return findings.map(item => `- [${item.severity}] ${item.code}: ${item.detail}`).join('\n');
}
