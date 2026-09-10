import type { NovelRun, ChapterVersion, Evidence } from './contracts';

export const literaryKinds = ['thought', 'ending', 'agency', 'opposition', 'rhetoric', 'pacing'] as const;
export type LiteraryKind = typeof literaryKinds[number];
export interface LiteraryObservation {
  kind: LiteraryKind;
  subject: string;
  before: string;
  after: string;
  mechanism: string;
  evidence: Evidence[];
}
export interface LiteraryAssessment {
  version: 1;
  checkedRevision: number;
  contextKey: string;
  status: 'passed' | 'failed';
  observations: LiteraryObservation[];
  issues: import('./contracts').ReviewIssue[];
}
export interface LiterarySceneIntent {
  sceneId: string;
  development: string;
  characterChoice: string;
  dramaticCost: string;
  narrativeWeight: number;
}
export interface LiteraryPlan {
  version: 1;
  contextKey: string;
  chapterPlanKey: string;
  endingDevelopment: string;
  avoidReplaying: string[];
  scenes: LiterarySceneIntent[];
}

// Read accepted revisions only. A pending candidate never replaces accepted literary history.
export function literaryHistory(run: NovelRun, before: number) {
  return run.chapters.filter(chapter => chapter.number < before && chapter.status === 'accepted' && chapter.candidateRevision === undefined)
    .sort((a, b) => a.number - b.number)
    .map(chapter => ({ chapter: chapter.number, version: chapter.versions.find(version => version.revision === chapter.acceptedRevision)! }))
    .filter(item => item.version);
}
export function literaryContribution(version: ChapterVersion): string {
  return JSON.stringify(version.literary?.observations.map(({ evidence, ...rest }) => ({ ...rest, evidence: evidence.map(({ revision, ...source }) => source) })));
}
// Content-based dependency key: a byte-identical revalidation does not invalidate the whole book.
// This is a cache key, not a security signature; evidence is validated independently below.
function fingerprint(text: string): string {
  let hash = 14695981039346656037n;
  for (let i = 0; i < text.length; i++) hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(i))) * 1099511628211n);
  return `${text.length}:${hash.toString(16)}`;
}
export function literaryContextKey(run: NovelRun, before: number): string {
  return fingerprint(JSON.stringify(literaryHistory(run, before).map(item => [item.chapter, literaryContribution(item.version)])));
}
/**
 * Whether an assessment made of one revision still stands for the next one.
 *
 * Measured over a live run: a repair replaces 1% of a chapter's sentences at the median and never
 * more than 15%, and the literary gate — the most expensive call in the system — was rerun in full
 * every time. It reads the chapter through the passages it cites, so when every passage it cited is
 * still there word for word and the revision barely moved, the reading it produced has not changed.
 *
 * The size limit is what keeps this honest: a small edit cannot have introduced a chapter's worth of
 * new material for the gate to miss. A larger one is assessed again however intact its quotations are.
 */
export const literaryReuseCeiling = 0.05;

export function literaryStillHolds(previous: ChapterVersion, candidate: ChapterVersion, chapter: number): boolean {
  if (!previous.literary || previous.literary.version !== 1) return false;
  const sentences = (text: string) => new Set(text.split(/(?<=[.!?…])\s+/).map(item => item.trim()).filter(Boolean));
  const before = sentences(previous.content), after = sentences(candidate.content);
  if (!after.size) return false;
  let fresh = 0;
  for (const sentence of after) if (!before.has(sentence)) fresh++;
  if (fresh / after.size > literaryReuseCeiling) return false;
  const cited = [...previous.literary.observations, ...previous.literary.issues]
    .flatMap(item => item.evidence).filter(evidence => evidence.chapter === chapter);
  return cited.length > 0 && cited.every(evidence => candidate.content.includes(evidence.quote));
}

/**
 * Threads that open a chapter where the chapter before them opened, instead of where it ended.
 *
 * Measured across four finished books: 9 of 12 tracked threads in one, 10 of 16 in another, and the
 * matches are literal — the "before" of chapter three repeating the "before" of chapter two word for
 * word. Read as prose, the same books argue the same argument three times with the same positions.
 *
 * What it cannot tell on its own is which of the two is true: a ledger that copies itself forward
 * while the book moves, or a book that does not move. Both were happening in the run this came from.
 * So this reports the threads, and reports them as something to look at.
 */
export function stalledThreads(history: { chapter: number; observations: LiteraryObservation[] }[]): { chapter: number; kind: LiteraryKind; subject: string }[] {
  const stems = (text: string) => new Set(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(word => word.length > 3).map(word => word.slice(0, 6)));
  const near = (first: string, second: string) => {
    const a = stems(first), b = stems(second);
    const smaller = Math.min(a.size, b.size);
    if (!smaller) return 0;
    let shared = 0;
    for (const word of b) if (a.has(word)) shared++;
    return shared / smaller;
  };
  const stalled: { chapter: number; kind: LiteraryKind; subject: string }[] = [];
  for (let index = 1; index < history.length; index++) {
    const previous = history[index - 1], current = history[index];
    for (const observation of current.observations) {
      const sameThread = previous.observations
        .filter(item => item.kind === observation.kind)
        .sort((first, second) => near(second.subject, observation.subject) - near(first.subject, observation.subject))[0];
      if (!sameThread || near(sameThread.subject, observation.subject) < 0.4) continue;
      // Not "similar to where it was", but "closer to where it started than to where it got to", and
      // close enough to be the same sentence: a thread carried forward rather than moved.
      const toStart = near(observation.before, sameThread.before);
      if (toStart >= 0.9 && toStart > near(observation.before, sameThread.after)) {
        stalled.push({ chapter: current.chapter, kind: observation.kind, subject: observation.subject });
      }
    }
  }
  return stalled;
}

export function literaryCurrent(run: NovelRun, chapter: number, version: ChapterVersion): boolean {
  return version.literary?.version === 1 && version.literary.checkedRevision === version.revision &&
    version.literary.contextKey === literaryContextKey(run, chapter) && version.literary.observations.length > 0 &&
    version.literary.observations.every(item => item.evidence.length > 0 && item.evidence.every(evidence => {
      const source = evidence.chapter === chapter && evidence.revision === version.revision ? version : run.chapters.find(item => item.number === evidence.chapter)?.versions.find(item => item.revision === evidence.revision);
      return evidence.quote.length > 0 && Boolean(source?.content.includes(evidence.quote));
    }));
}
export function literaryLedger(run: NovelRun, before: number) {
  return literaryHistory(run, before).map(({ chapter, version }) => {
    if (!literaryCurrent(run, chapter, version) || version.literary?.status !== 'passed') throw new Error(`Chapter ${chapter} has no current literary state.`);
    return { chapter, revision: version.revision, observations: version.literary.observations };
  });
}
