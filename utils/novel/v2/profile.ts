import { matchKey, stringList } from './normalize';
import type { BookDesign, BookProfile, DeclaredMotif, PressureCurve, ProfileRank } from './types';

/**
 * The book profile, and the table that turns its ranks into numbers.
 *
 * The division of labour here is the whole point. The model declares what only
 * an author can know about this premise — the shape of the pressure curve, which
 * repetitions are deliberate refrains, what a cost is made of in this book, how
 * claustrophobic the staging is meant to be. Code owns the numbers those
 * declarations resolve to. A model asked for "dialogue share: 0.35" invents a
 * decimal it has no access to; a model asked for "low / medium / high" answers
 * the question it can actually answer.
 *
 * The consequence worth stating: recalibrating this pipeline after twenty
 * finished books is an edit to BANDS below, not to a prompt. Books already
 * written keep their declared profile and reproduce exactly.
 */

export interface ProfileBands {
  /** Acceptable share of words inside quotation marks, as measured by analytics. */
  dialogueShare: [number, number];
  /** Consecutive scenes allowed in one staging before it is raised. */
  stagingRun: number;
  /** Times one staging may appear inside the recent window before it is raised. */
  stagingWindow: number;
  /** Times one mechanism may be spent across the book. */
  mechanismReuse: number;
  /** Uses of an undeclared phrase before it counts as worn. Not genre-dependent. */
  phraseTolerance: number;
}

/**
 * Rank → band. **Not fitted.** Every number below is a judgement, and saying so
 * is the point: the repetition thresholds elsewhere in this pipeline were
 * measured on real pairs and these were not, and code that presents both with
 * the same confidence teaches its reader to trust the wrong one.
 *
 * They cannot honestly be fitted on this pipeline's own output either — a
 * corpus of books it generated would calibrate the checks to the habits they
 * exist to catch. Fitting them needs either published novels of each kind, or a
 * corpus of generated books a person has marked good and bad. Until then these
 * are starting values, and the findings they produce are worth exactly what a
 * starting value is worth. Where a signal can be had without a threshold at all
 * — a book drifting from its own opening — that signal is preferred, and
 * `textureDrift` reports it beside these.
 */
const BANDS = {
  dialogue_weight: {
    low: [0.0, 0.12] as [number, number],
    medium: [0.08, 0.30] as [number, number],
    high: [0.22, 0.55] as [number, number],
  },
  staging_variety: {
    // A locked-room book legitimately keeps one house and one pair of eyes;
    // flagging it for that would be flagging it for its own form.
    low: { run: 5, window: 6 },
    medium: { run: 2, window: 3 },
    high: { run: 1, window: 2 },
  },
  mechanism_reuse: {
    low: 1,
    medium: 2,
    // A procedural repeats its method on purpose — that is the genre, not a defect.
    high: 4,
  },
} as const;

/**
 * How many times an undeclared phrase may repeat before the writer is told.
 *
 * Also not fitted — four is a judgement. A constant, and deliberately not a rank. It was one: a book declaring three
 * refrains had its threshold raised from 3 to 6 for every phrase, on the theory
 * that such a book repeats on purpose. That theory was already served — the
 * declared motifs are exempt by name — so the rank was a second, blanket
 * exemption on top of the specific one, and it silenced the ban list for the
 * whole of a book that declared three motifs. Whether a repetition is meant is
 * decided by declaring it, once, not by a threshold that drifts.
 */
const PHRASE_TOLERANCE = 4;

const RANKS: ProfileRank[] = ['low', 'medium', 'high'];
const CURVES: PressureCurve[] = ['rising', 'oscillating', 'investigative', 'flat', 'descending'];

/**
 * The base a partial profile is read onto. Every field a design declines to
 * declare lands in the middle of its band with no refrains — a floor for
 * normalizing a model's answer, never a way for a design to skip the profile.
 */
export function defaultProfile(): BookProfile {
  return {
    pressure_curve: 'rising',
    curve_reason: '(not stated)',
    declared_motifs: [],
    cost_kinds: [],
    dialogue_weight: 'medium',
    staging_variety: 'medium',
    mechanism_reuse: 'medium',
    open_ending: false,
    mechanism_ledger: [],
    ending_invariants: [],
  };
}

function rank(value: unknown, fallback: ProfileRank): ProfileRank {
  return typeof value === 'string' && (RANKS as string[]).includes(value.trim().toLowerCase())
    ? value.trim().toLowerCase() as ProfileRank
    : fallback;
}

function motifs(value: unknown): DeclaredMotif[] {
  if (!Array.isArray(value)) return [];
  const out: DeclaredMotif[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const motif = typeof item.motif === 'string' ? item.motif.trim() : '';
    if (!motif) continue;
    // A refrain budget is a budget: an unbounded or absurd one would exempt the
    // motif from every check, which is the one thing a declaration must not buy.
    const declared = Number(item.allowed_uses);
    const allowed = Number.isFinite(declared) ? Math.max(1, Math.min(30, Math.round(declared))) : 6;
    out.push({ motif, allowed_uses: allowed, reason: typeof item.reason === 'string' ? item.reason : '' });
  }
  return out;
}

/**
 * Read whatever the design carries into a profile the rest of the pipeline can
 * rely on. Never throws: a malformed field falls back to the default rather than
 * losing a book, and `profileProblems` below reports what was wrong.
 */
export function readProfile(raw: unknown): BookProfile {
  const base = defaultProfile();
  if (!raw || typeof raw !== 'object') return base;
  const item = raw as Record<string, unknown>;
  const curve = typeof item.pressure_curve === 'string' ? item.pressure_curve.trim().toLowerCase() : '';
  return {
    pressure_curve: (CURVES as string[]).includes(curve) ? curve as PressureCurve : base.pressure_curve,
    curve_reason: typeof item.curve_reason === 'string' ? item.curve_reason : base.curve_reason,
    declared_motifs: motifs(item.declared_motifs),
    cost_kinds: stringList(item.cost_kinds),
    dialogue_weight: rank(item.dialogue_weight, base.dialogue_weight),
    staging_variety: rank(item.staging_variety, base.staging_variety),
    mechanism_reuse: rank(item.mechanism_reuse, base.mechanism_reuse),
    open_ending: item.open_ending === true,
    mechanism_ledger: stringList(item.mechanism_ledger),
    ending_invariants: stringList(item.ending_invariants),
  };
}

export function profileOf(design: BookDesign | null | undefined): BookProfile {
  return readProfile(design?.profile);
}

/**
 * A pressure rung as a number, or null when none was taken.
 *
 * Its own function because `Number(null)` is 0, and a rung of 0 reads as the
 * bottom of the curve — a chapter that declined to place itself would silently
 * become a chapter that placed itself lowest, and every curve check downstream
 * would be measuring a fact nobody stated.
 */
export function readRung(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const rung = Number(value);
  return Number.isFinite(rung) ? rung : null;
}

export function bandsFor(profile: BookProfile): ProfileBands {
  const staging = BANDS.staging_variety[profile.staging_variety];
  return {
    dialogueShare: BANDS.dialogue_weight[profile.dialogue_weight],
    stagingRun: staging.run,
    stagingWindow: staging.window,
    mechanismReuse: BANDS.mechanism_reuse[profile.mechanism_reuse],
    phraseTolerance: PHRASE_TOLERANCE,
  };
}

/**
 * Guard rails on the guard rails.
 *
 * The model writes the profile, so the model could disarm every check by
 * declaring a ledger of one mechanism and thirty refrains. These are the sanity
 * bounds: reported at design time, never silently corrected, because a profile
 * that cannot support the book is a design problem and the designer should see
 * it in the same breath as its other problems.
 */
export interface BudgetGap {
  /** Stable across rounds: what kind of gap this is, never where it sat in a list. */
  code: string;
  detail: string;
}

export function profileProblems(profile: BookProfile, chapterCount: number): BudgetGap[] {
  const problems: BudgetGap[] = [];
  const bands = bandsFor(profile);
  // Enough distinct ways to meet the obstacle to carry the chapters that meet it.
  // The floor is the book's own reuse allowance, not a constant: a procedural is
  // allowed to run four chapters on one method and a thriller is not.
  const needed = Math.max(1, Math.ceil(chapterCount / bands.mechanismReuse));
  const distinct = new Set(profile.mechanism_ledger.map(matchKey));
  if (distinct.size < needed) {
    problems.push({ code: 'ledger-short', detail: `The mechanism ledger holds ${distinct.size} distinct way(s) of meeting the obstacle for ${chapterCount} chapters. At this book's reuse allowance (${bands.mechanismReuse} chapters per mechanism) it needs at least ${needed}, or the middle of the book repeats one solution in different scenery.` });
  }
  if (!profile.cost_kinds.length) {
    problems.push({ code: 'no-cost-kinds', detail: 'The profile names no kind of cost. A book where nothing can be paid has no way to tell development from repetition, and every chapter-level cost check becomes unfalsifiable.' });
  }
  const budget = profile.declared_motifs.reduce((sum, motif) => sum + motif.allowed_uses, 0);
  if (budget > 60) {
    problems.push({ code: 'refrain-budget', detail: `Declared refrains total ${budget} exempt uses. A refrain budget that large exempts the book's phrasing from the worn-phrase check entirely; keep the motifs that are load-bearing and let the rest be counted.` });
  }
  for (const motif of profile.declared_motifs) {
    if (!motif.reason.trim()) {
      problems.push({ code: `refrain-reason:${matchKey(motif.motif)}`, detail: `Motif "${motif.motif}" is declared deliberate without a reason. A refrain that cannot say what it is doing is a tic with a permit.` });
    }
  }
  return problems;
}

/**
 * Does the declared sequence of chapter rungs actually trace the declared curve?
 *
 * Checks conformance to a shape, never monotonicity: "the rung must rise" is a
 * thriller's rule and a mystery's mistake. A book is free to declare a flat or
 * descending curve — it is not free to declare a rising one and then deliver a
 * flat line, because then the declaration bought nothing.
 */
export function curveProblems(curve: PressureCurve, rungs: number[]): string[] {
  const known = rungs.filter(value => Number.isFinite(value));
  if (known.length < 3) return [];
  const steps = known.slice(1).map((value, index) => value - known[index]);
  const drops = steps.filter(step => step < 0).length;
  const climbs = steps.filter(step => step > 0).length;
  const flats = steps.filter(step => step === 0).length;
  const problems: string[] = [];
  switch (curve) {
    case 'rising':
      if (drops > Math.floor(steps.length / 4)) {
        problems.push(`The curve is declared rising and the chapter rungs fall ${drops} time(s) (${known.join(' → ')}). A dip is a breath; this many is a different shape than the one declared.`);
      }
      if (known.at(-1)! <= known[0]) {
        problems.push(`The curve is declared rising and ends at or below where it began (${known[0]} → ${known.at(-1)}).`);
      }
      break;
    case 'oscillating':
      if (drops === 0 || climbs === 0) {
        problems.push(`The curve is declared oscillating and moves in one direction only (${known.join(' → ')}). An oscillation needs both a closing and a breaking.`);
      }
      break;
    case 'investigative':
      // What escalates is what is known, not what threatens: the rung is allowed
      // to sit still, but the book must not un-know things it has established.
      if (drops > Math.floor(steps.length / 3)) {
        problems.push(`The curve is declared investigative and the rungs fall ${drops} time(s) (${known.join(' → ')}). Information accumulates; a falling rung means the book is losing ground it already took.`);
      }
      break;
    case 'flat':
      if (climbs + drops > flats) {
        problems.push(`The curve is declared flat and the rungs move more often than they hold (${known.join(' → ')}).`);
      }
      break;
    case 'descending':
      if (climbs > Math.floor(steps.length / 4)) {
        problems.push(`The curve is declared descending and the rungs climb ${climbs} time(s) (${known.join(' → ')}).`);
      }
      break;
  }
  return problems;
}

/** The profile as the planner and the writer read it: short, in words, no JSON. */
export function describeProfile(profile: BookProfile): string {
  const lines = [
    `Pressure curve: ${profile.pressure_curve} — ${profile.curve_reason}`,
    `Staging variety: ${profile.staging_variety}; dialogue weight: ${profile.dialogue_weight}; mechanism reuse allowed: ${profile.mechanism_reuse}`,
    `A cost in this book is: ${profile.cost_kinds.join('; ') || '(none declared)'}`,
    `Ways of meeting the obstacle: ${profile.mechanism_ledger.join('; ') || '(none declared)'}`,
    `The ending must keep: ${profile.ending_invariants.join('; ') || '(nothing declared)'}`,
    profile.open_ending
      ? 'Threads left standing at the end are the design, not a defect.'
      : 'The ending closes what the book opened.',
  ];
  if (profile.declared_motifs.length) {
    lines.push(`Deliberate refrains (repetition is the point, up to the budget): ${profile.declared_motifs.map(motif => `"${motif.motif}" ×${motif.allowed_uses}`).join(', ')}`);
  }
  return lines.join('\n');
}
