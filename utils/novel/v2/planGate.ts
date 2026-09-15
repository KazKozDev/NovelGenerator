import { contentWords } from '../analytics';
import { matchKey } from './normalize';
import { bandsFor, curveProblems, profileOf, readRung } from './profile';
import { repeatedStaging, sceneShape, type SceneShape } from './shapes';
import type { BookDesign, ChapterPlan, ReaderThread } from './types';

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
  | 'repeated-staging' | 'outcome-monotony' | 'ending-capacity' | 'no-outcome-kind' | 'promise-ageing';
  detail: string;
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
function takenUp(planText: string, subject: string, castNames: Set<string>): boolean {
  const anchors = new Set(contentWords(subject)
    .filter(word => word.length >= 5 && !castNames.has(word))
    .map(stem));
  if (!anchors.size) return true;
  const inPlan = new Set(contentWords(planText).map(stem));
  let present = 0;
  for (const anchor of anchors) if (inPlan.has(anchor)) present++;
  return present >= Math.max(2, Math.ceil(anchors.size / 2));
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
function castWords(design: BookDesign): Set<string> {
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
  const names = castWords(design);
  const stale = input.openThreads
    .filter(item => chapter - item.madeInChapter >= 2)
    .filter(item => !takenUp(planText, item.thread.description, names));
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
