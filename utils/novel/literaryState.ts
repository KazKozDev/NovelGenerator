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
