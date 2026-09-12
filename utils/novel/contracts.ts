import type { Character, ParsedChapterPlan, StorySettings, LLMProviderConfig } from '../../types';
import { getGenreGuidelines } from '../genrePrompts';

export interface BookSpec extends StorySettings {
  version: 1;
  premise: string;
  chapterCount: number;
  language: string;
  tense: 'past' | 'present';
  ending: 'closed' | 'open' | 'series';
  targetWordsPerChapter: number;
  chapterMode?: 'full' | 'scene';
  skipEditing?: boolean;
  forwardOnly?: boolean;
}

export function createBookSpec(premise: string, chapterCount: number, settings: StorySettings = {}): BookSpec {
  if (!Number.isInteger(chapterCount) || chapterCount < 3 || chapterCount > 100) {
    throw new Error('Chapter count must be an integer between 3 and 100.');
  }
  if (!premise.trim()) throw new Error('A story premise is required.');
  if (settings.targetWordsPerChapter !== undefined && (!Number.isInteger(settings.targetWordsPerChapter) || settings.targetWordsPerChapter < 300 || settings.targetWordsPerChapter > 10000)) {
    throw new Error('Target chapter length must be 300–10000 words.');
  }
  return {
    genre: 'fantasy', narrativeVoice: 'third-limited', tone: 'serious',
    targetAudience: 'adult', writingStyle: 'descriptive',
    ...settings, generationSpeedMode: undefined, version: 1, premise: premise.trim(), chapterCount,
    language: settings.language || 'English', tense: settings.tense || 'past',
    ending: settings.ending || 'closed',
    targetWordsPerChapter: settings.targetWordsPerChapter || 4000,
    chapterMode: settings.chapterMode,
    skipEditing: settings.skipEditing,
    forwardOnly: settings.forwardOnly,
  };
}

/**
 * Genre craft for the steps that actually write prose. It stays out of review and extraction:
 * a reviewer handed a list of genre pitfalls starts reporting stylistic preference as defect.
 */
export function genreCraft(spec: BookSpec): string {
  const guidelines = getGenreGuidelines(spec.genre || '');
  return guidelines ? `\nGENRE CRAFT (guidance for the prose, not a checklist to recite):\n${guidelines}` : '';
}

export function specPrompt(spec: BookSpec): string {
  const { chapterMode: _, skipEditing: __, forwardOnly: ___, ...cleanSpec } = spec;
  return `AUTHOR CONTRACT (applies to planning, prose and every revision):\n${JSON.stringify(cleanSpec, null, 2)}\nPreserve proper names. Style preferences are contextual, not absolute word bans. Respect the requested audience, viewpoint, language and ending. Do not impose a cliffhanger on a resolved ending.`;
}

export type ReviewStatus = 'passed' | 'failed' | 'not_checked';
export interface Evidence { chapter: number; revision: number; quote: string }
export interface ReviewIssue {
  id: string;
  category: 'canon' | 'knowledge' | 'plot' | 'character' | 'dialogue' | 'voice' | 'pacing' | 'hook' | 'ending' | 'audience' | 'format';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  instruction: string;
  evidence: Evidence[];
}
export interface ReviewReport {
  validationVersion?: 2;
  status: ReviewStatus;
  issues: ReviewIssue[];
  checkedRevision: number;
  error?: string;
  /** Findings this pass settled rather than raised: what was demoted, and on what ground. */
  settled?: { id: string; category: ReviewIssue['category']; description: string; reason: string }[];
}
export interface CanonFact {
  id: string;
  subject: string;
  predicate: string;
  value: string;
  knownBy: string[];
  evidence: Evidence;
}
export interface StoryEvent {
  id: string;
  description: string;
  consequences: string[];
  evidence: Evidence;
}
export interface PromisePlan {
  id: string;
  description: string;
  setupChapter: number;
  payoffChapter: number | null;
  required: boolean;
  setup?: string;
  development?: string;
  payoff?: string;
}
export interface MajorTurn {
  id: string;
  functions: string[];
  chapter: number;
  event: string;
  cause: string;
  characterAction: string;
  consequence: string;
}
export interface ChapterArc {
  chapter: number;
  /**
   * What this chapter takes away for good — a person, a resource, an option, a belief, a way back.
   * An empty string says the chapter costs nothing, and a book is allowed one of those.
   */
  cost?: string;
  structuralRole: string;
  entryState: string;
  causalLink: string;
  protagonistStrategy: string;
  development: string;
  internalDevelopment: string;
  chapterChange: string;
  exitState: string;
  endingFunction: string;
  pacingPriority: string;
  setupPromiseIds: string[];
  payoffPromiseIds: string[];
}
export interface PlanningIssue {
  location: string;
  problem: string;
  neededClarification: string;
}
export interface PromiseEvidence { promiseId: string; kind: 'setup' | 'payoff'; evidence: Evidence }
/** A planned beat found on the page, quoted from the prose that dramatizes it. */
export interface BeatEvidence { sceneId: string; beat: string; evidence: Evidence }
/**
 * A constraint a chapter put on the book: something later chapters must work around until the prose
 * takes it away. "The bridge is out." "Nobody gets into the archive without the clerk's key." It is
 * the promise ledger's mirror image — a promise is owed forward, a condition is binding forward —
 * and it exists because a chapter that quietly drops one reads perfectly well on its own page.
 */
export interface ConditionEvidence {
  id: string;
  statement: string;
  evidence: Evidence;
  /** The chapter whose prose took the condition away, and the passage that did it. */
  liftedIn?: number;
  liftedBy?: Evidence;
}
export interface ChapterAnalysis {
  summary: string;
  facts: CanonFact[];
  events: StoryEvent[];
  promises: PromiseEvidence[];
  /** Absent in analyses recorded before the beat registry existed; never a reason to lose a run. */
  beats?: BeatEvidence[];
  /**
   * Conditions this chapter set, and conditions already standing that it lifted. Absent in analyses
   * recorded before the ledger existed; a book without them is simply a book with none standing.
   */
  conditions?: { id: string; statement: string; evidence: Evidence; lifts?: string }[];
}
export interface StoryState {
  facts: CanonFact[];
  events: StoryEvent[];
  promises: PromiseEvidence[];
  /** Which planned beats the accepted chapters have already played, and where. */
  beats: BeatEvidence[];
  /** Constraints the accepted chapters put on the book, with the ones already lifted marked. */
  conditions: ConditionEvidence[];
  summaries: Record<number, string>;
}

export interface ChapterVersion {
  revision: number;
  content: string;
  reason: string;
  createdAt: number;
  review?: ReviewReport;
  analysis?: ChapterAnalysis;
  literary?: import('./literaryState').LiteraryAssessment;
  /** Measured prose texture. Advisory in report mode: it never blocks acceptance on its own. */
  prosody?: import('./prosody').ProsodyReport;
}
/**
 * What a finished scene actually put on the page, taken from the prose rather than from the plan.
 *
 * The next scene of a chapter used to be told what the earlier ones were *for* — their planned
 * objective and outcome, declared to have happened — plus the last 1200 characters of prose. Between
 * those two lies the whole scene: who ended up in which room, who is carrying the letter, what was
 * said aloud and by whom, and what the scene left unanswered. A plan is not evidence that any of it
 * reached the page, and the accepted canon starts only at the previous chapter.
 *
 * Each note carries a short quotation from the scene that establishes it, and a note whose quotation
 * cannot be found in that scene is dropped: this is a record of the page, not a second plan.
 */
/**
 * What a written scene leaves for the next one.
 *
 * The first five record what is now TRUE. They were not enough, and the measurement says why: across
 * 141 scenes of stored first drafts, 83% of the sentences a scene repeated matched earlier prose the
 * writer had never been shown. It was not copying — it was deriving the same material twice from the
 * same plan, because each scene is handed the chapter's frame, canon and people and asked for a
 * thousand words without knowing what the page already says. So the same room is described three
 * times and the same grief explained three times, and every one of them is written as if first.
 *
 * 'told' is the record of what has been SAID rather than what is true: a place already described, a
 * motive already explained, an atmosphere already established, an emotional beat already played. It
 * is the one thing the next scene needs in order not to perform it again.
 */
export const journalKinds = ['position', 'possession', 'condition', 'event', 'knowledge', 'openQuestion', 'told'] as const;
export type JournalKind = typeof journalKinds[number];
export interface JournalNote { kind: JournalKind; note: string; quote: string }
export interface SceneJournal {
  sceneId: string;
  notes: JournalNote[];
  /**
   * The passage in which the scene's declared shift actually happens, copied from the scene. Absent
   * when the scene declared no shift, when the reading failed, or when the shift is not on the page —
   * the last of which is the case the writer is asked to answer for.
   */
  shiftQuote?: string;
  /** Planned beats the scene reports as having happened instead of putting them on the page. */
  reported?: { beat: string; quote: string }[];
  /** A beat this scene plays, finishes, and then plays again — the same conflict after a break. */
  secondTake?: { beat: string; first: string; second: string }[];
}

export interface ChapterRecord {
  number: number;
  plan: ParsedChapterPlan;
  status: 'pending' | 'draft' | 'accepted' | 'needs_revision' | 'invalidated';
  versions: ChapterVersion[];
  acceptedRevision?: number;
  candidateRevision?: number;
  repairAttempts: number;
  /** Version count at the start of the latest explicitly requested repair cycle. */
  repairVersionStart?: number;
  /** The findings the last round faced, so a round that fixed something is not counted against it. */
  lastFindings?: string;
  /** Those findings in the shape the stuck counter compares: what they are about, not their wording. */
  lastFindingShapes?: { id: string; category: ReviewIssue['category']; description: string; streak?: number }[];
  /** Findings local revision tried and failed to answer; advisory for the rest of this chapter's life. */
  unrepairable?: { id: string; category: ReviewIssue['category']; description: string }[];
  /** Repairs refused because they damaged the prose, kept for diagnosis rather than for the manuscript. */
  rejectedRepairs?: { revision: number; reason: string; at: number }[];
  /** Questions this chapter has already answered: a settled finding is not raised against it again. */
  settled?: { id: string; category: ReviewIssue['category']; description: string; reason: string }[];
  /** Chapter-wide sweeps that have already had a repair round, so the next one goes to a sweep that has not. */
  distributedServed?: string[];
  literaryPlan?: import('./literaryState').LiteraryPlan;
  /** Recorded when a planning rule could not be satisfied; never a reason to lose the run. */
  planningNote?: string;
  sceneDrafts?: string[];
  /**
   * The running record of what those drafts established, one entry per written scene. Draft until the
   * chapter is accepted, and dropped then: from that point the chapter speaks through the canon
   * extracted from its accepted prose, and a note taken from a scene a repair may still remove is a
   * message to the next scene of this chapter, never a fact about the book.
   */
  sceneJournal?: SceneJournal[];
  /**
   * What this chapter has already put on the page, in a few words each — a place described, a motive
   * explained, an emotional beat played out, an image spent. The journal that produced these is
   * deleted when the chapter is accepted, and the canon that replaces it records what is now true,
   * never what has already been said. So this is kept: the chapter after this one has no other way to
   * know the archive has been described, and describes it again.
   */
  alreadyTold?: string[];
  lineEditedRevision?: number;
  /**
   * The revision this chapter was read against the chapter before it, in full. Once per chapter: the
   * comparison is expensive, and running it every repair round is how a review becomes a loop.
   */
  neighbourReviewedRevision?: number;
  deepCheck?: import('./deepCheck').DeepCheckReport;
  emotion?: import('./deepCheck').EmotionVerdict;
  genre?: import('./deepCheck').GenreVerdict;
}
export interface BookBlueprint {
  centralConflict: string;
  protagonistChange: string;
  endingPayoff: string;
  characters: Record<string, Character>;
  promises: PromisePlan[];
  chapters: ParsedChapterPlan[];
  /**
   * How the ending is actually won, and what prepared it.
   *
   * preparedBy names promises from this book's own schedule, each set up before the final chapter, so
   * the means of the climax cannot be a resource the book produces at the moment it is needed.
   */
  climax?: { decisiveAction: string; preparedBy: string[] };
  majorTurns?: MajorTurn[];
  chapterArcs?: ChapterArc[];
  planningIssues?: PlanningIssue[];
}
export interface NovelRun {
  editorial?: { report: string; revisions: number[]; proposals?: { chapter: number; instruction: string }[] };
  manuscriptHistory?: { title: string; content: string; at: number }[];
  literaryValidationVersion?: 1;
  schemaVersion: 1;
  validationVersion?: 2;
  id: string;
  spec: BookSpec;
  provider: LLMProviderConfig;
  /** Optional model proven to obey structured-output contracts with thinking disabled. */
  validationProvider?: LLMProviderConfig;
  outline: string;
  blueprint?: BookBlueprint;
  chapters: ChapterRecord[];
  canon: StoryState;
  stage: 'outline' | 'planning' | 'writing' | 'structural_review' | 'line_editing' | 'final_review' | 'complete' | 'needs_revision';
  resumeStage?: NovelRun['stage'];
  structuralReview?: ReviewReport;
  finalReview?: ReviewReport;
  title?: string;
  error?: string;
  structuralAttempts?: number;
  finalAttempts?: number;
  importedDrafts?: string[];
  calls?: { purpose: string; durationMs: number; inputCharacters: number; outputCharacters: number; success: boolean }[];
  updatedAt: number;
}

export function chapterRole(number: number, total: number): string {
  if (number === 1) return 'setup';
  if (number === total) return 'resolution';
  if (number === total - 1) return 'climax';
  const progress = number / total;
  if (progress <= 0.25) return 'setup';
  if (progress <= 0.55) return 'development';
  return 'complication';
}
