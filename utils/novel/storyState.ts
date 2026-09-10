import { literaryCurrent } from './literaryState';
import type { BeatEvidence, CanonFact, ChapterAnalysis, ChapterRecord, ChapterVersion, Evidence, NovelRun, StoryState } from './contracts';

export const emptyStoryState = (): StoryState => ({ facts: [], events: [], promises: [], beats: [], summaries: {} });

/** The beats the chapter plan asks this chapter to dramatize, in plan order. */
export function plannedBeats(chapter: ChapterRecord): { sceneId: string; beat: string }[] {
  return (chapter.plan.detailedScenes || []).flatMap(scene =>
    (scene.keyMoments || []).filter(beat => typeof beat === 'string' && beat.trim())
      .map(beat => ({ sceneId: scene.sceneId, beat: beat.trim() })));
}

/** One beat is one beat however its wording was reflowed; the registry keys on the planned string. */
export const beatKey = (sceneId: string, beat: string) => `${sceneId}\u0001${beat.replace(/\s+/g, ' ').trim().toLowerCase()}`;

/** Planned beats the chapter's own analysis could not find on the page. */
export function unplayedBeats(chapter: ChapterRecord, analysis: ChapterAnalysis): { sceneId: string; beat: string }[] {
  const played = new Set((analysis.beats || []).map(item => beatKey(item.sceneId, item.beat)));
  return plannedBeats(chapter).filter(item => !played.has(beatKey(item.sceneId, item.beat)));
}

export function acceptedVersion(chapter: ChapterRecord): ChapterVersion | undefined {
  if (chapter.status !== 'accepted') return undefined;
  return chapter.versions.find(version => version.revision === chapter.acceptedRevision);
}

/** Reflowed whitespace and an elision marker are formatting, not a different passage. */
function normalizeQuote(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * A quotation may elide text with "..." or "…". Every remaining fragment must still appear verbatim,
 * in order, in the cited prose version, so an elision can never stand in for invented wording.
 */
export function evidenceExists(evidence: Evidence, chapter: number, version: ChapterVersion): boolean {
  if (!evidence || evidence.chapter !== chapter || evidence.revision !== version.revision || typeof evidence.quote !== 'string') return false;
  const content = normalizeQuote(version.content);
  const fragments = normalizeQuote(evidence.quote).split(/\s*(?:\.{3}|…)\s*/).map(normalizeQuote).filter(Boolean);
  // A fragment too short to identify a passage is not evidence, however it is punctuated.
  if (!fragments.length || !fragments.some(fragment => fragment.length >= 12)) return false;
  let cursor = 0;
  for (const fragment of fragments) {
    const found = content.indexOf(fragment, cursor);
    if (found === -1) return false;
    cursor = found + fragment.length;
  }
  return true;
}

/** Plan fields are never copied into canon. Only verified extractions from accepted prose enter it. */
export function validateAnalysis(analysis: ChapterAnalysis, chapter: number, version: ChapterVersion): void {
  if (!analysis || typeof analysis.summary !== 'string' || !analysis.summary.trim() ||
      !Array.isArray(analysis.facts) || !Array.isArray(analysis.events) || !Array.isArray(analysis.promises)) {
    throw new Error('Chapter analysis is incomplete.');
  }
  for (const fact of analysis.facts) {
    if (!fact.id || !fact.subject || !fact.predicate || !fact.value || !Array.isArray(fact.knownBy) ||
        !fact.knownBy.every(name => typeof name === 'string') || !evidenceExists(fact.evidence, chapter, version)) {
      throw new Error(`Canonical fact ${fact.id || '(missing id)'} has missing or ungrounded evidence: ${JSON.stringify(fact.evidence)}. Required chapter=${chapter}, revision=${version.revision}; quote must be a short verbatim substring, without paraphrase or ellipsis.`);
    }
  }
  for (const event of analysis.events) {
    if (!event.id || !event.description || !Array.isArray(event.consequences) || !evidenceExists(event.evidence, chapter, version)) {
      throw new Error(`Story event ${event.id || '(missing id)'} has missing or ungrounded evidence: ${JSON.stringify(event.evidence)}. Required chapter=${chapter}, revision=${version.revision}; quote must be a short verbatim substring, without paraphrase or ellipsis.`);
    }
  }
  for (const promise of analysis.promises) {
    if (!promise.promiseId || !['setup', 'payoff'].includes(promise.kind) || !evidenceExists(promise.evidence, chapter, version)) {
      throw new Error(`Promise ${promise.promiseId || '(missing id)'} has missing or ungrounded evidence: ${JSON.stringify(promise.evidence)}. Required chapter=${chapter}, revision=${version.revision}; quote must be a short verbatim substring, without paraphrase or ellipsis.`);
    }
  }
  // A registry entry claims a planned beat reached the page, so it is held to the same proof as canon.
  // Its absence is not: analyses recorded before the registry existed carry no beats, and a finished
  // run is not reopened for a field it never had.
  for (const beat of analysis.beats || []) {
    if (!beat.sceneId || typeof beat.beat !== 'string' || !beat.beat.trim() || !evidenceExists(beat.evidence, chapter, version)) {
      throw new Error(`Beat ${beat.beat || '(missing beat)'} has missing or ungrounded evidence: ${JSON.stringify(beat.evidence)}. Required chapter=${chapter}, revision=${version.revision}; quote must be a short verbatim substring, without paraphrase or ellipsis.`);
    }
  }
}

export function rebuildCanon(chapters: ChapterRecord[]): StoryState {
  const state = emptyStoryState();
  for (const chapter of [...chapters].sort((a, b) => a.number - b.number)) {
    const version = acceptedVersion(chapter);
    // A gap invalidates all later context. Never skip ahead to a future accepted chapter.
    if (!version) break;
    if (!version.analysis) throw new Error(`Accepted chapter ${chapter.number} has no analysis.`);
    validateAnalysis(version.analysis, chapter.number, version);
    state.facts.push(...version.analysis.facts);
    state.events.push(...version.analysis.events);
    state.promises.push(...version.analysis.promises);
    state.beats.push(...(version.analysis.beats || []));
    state.summaries[chapter.number] = version.analysis.summary;
  }
  return state;
}

export function addCandidate(chapter: ChapterRecord, content: string, reason: string): ChapterVersion {
  const version: ChapterVersion = {
    revision: Math.max(0, ...chapter.versions.map(item => item.revision)) + 1,
    content, reason, createdAt: Date.now(),
  };
  chapter.versions.push(version);
  chapter.candidateRevision = version.revision;
  if (chapter.status !== 'accepted') chapter.status = 'draft';
  return version;
}

/**
 * What a chapter contributes to canon, independent of the prose that proves it. Downstream chapters
 * read canon, not wording, so a revision that leaves this identical changes nothing for them.
 */
function canonContribution(analysis: ChapterAnalysis): string {
  const strip = <T extends { evidence: Evidence }>(items: T[]) => items.map(({ evidence, ...rest }) => rest);
  return JSON.stringify({ summary: analysis.summary, facts: strip(analysis.facts), events: strip(analysis.events), promises: strip(analysis.promises), beats: strip(analysis.beats || []) });
}

/**
 * Which subjects a revision moved, and whether it moved anything a subject cannot localise.
 * Canon is compared against canon: the extractor names subjects in one vocabulary, while the prose
 * may be in another language entirely, so matching a subject against the text would find nothing.
 */
function canonDelta(previous: ChapterAnalysis, next: ChapterAnalysis): { subjects: Set<string>; structural: boolean } {
  const strip = <T extends { evidence: Evidence }>({ evidence, ...rest }: T) => JSON.stringify(rest);
  const byId = (items: CanonFact[]) => new Map(items.map(item => [item.id, item]));
  const before = byId(previous.facts), after = byId(next.facts);
  const subjects = new Set<string>();
  for (const [id, fact] of after) {
    const older = before.get(id);
    if (!older || strip(older) !== strip(fact)) subjects.add(fact.subject.toLowerCase());
  }
  for (const [id, fact] of before) if (!after.has(id)) subjects.add(fact.subject.toLowerCase());
  // Events, promise ledger entries and the chapter synopsis carry no single subject to trace.
  const structural = previous.summary !== next.summary ||
    JSON.stringify(previous.events.map(strip)) !== JSON.stringify(next.events.map(strip)) ||
    JSON.stringify(previous.promises.map(strip)) !== JSON.stringify(next.promises.map(strip)) ||
    JSON.stringify((previous.beats || []).map(strip)) !== JSON.stringify((next.beats || []).map(strip));
  return { subjects, structural };
}

/** Everything a chapter's own analysis says, as one searchable blob in the extractor's vocabulary. */
function analysisMentions(analysis: ChapterAnalysis): string {
  return [
    analysis.summary,
    ...analysis.facts.flatMap(fact => [fact.subject, fact.predicate, fact.value, ...fact.knownBy]),
    ...analysis.events.flatMap(event => [event.description, ...event.consequences]),
  ].join(' \u0001 ').toLowerCase();
}

/** Commit only a fully reviewed version, then invalidate the dependants whose premises actually moved. */
export function acceptCandidate(run: NovelRun, number: number): void {
  const chapter = run.chapters.find(item => item.number === number);
  if (!chapter) throw new Error(`Unknown chapter ${number}.`);
  const version = chapter.versions.find(item => item.revision === chapter.candidateRevision);
  if (!version || version.review?.status !== 'passed' || version.review.checkedRevision !== version.revision || !version.analysis || version.review.issues.some(issue => issue.severity !== 'minor')) {
    throw new Error('Only a reviewed, analysed candidate can be accepted.');
  }
  if (run.chapters.some(item => item.number < number && !acceptedVersion(item))) {
    throw new Error('Earlier chapters must be accepted before this chapter.');
  }
  validateAnalysis(version.analysis, number, version);
  if (run.literaryValidationVersion === 1 && (!literaryCurrent(run, number, version) || version.literary?.status !== 'passed')) {
    throw new Error('Only a chapter with current passed literary review can be accepted.');
  }

  const knownPromises = new Set(run.blueprint?.promises.map(item => item.id) || []);
  if (version.analysis.promises.some(item => !knownPromises.has(item.promiseId))) {
    throw new Error('Analysis references an unknown planned promise.');
  }
  const superseded = chapter.versions.find(item => item.revision === chapter.acceptedRevision)?.analysis;
  const delta = superseded ? canonDelta(superseded, version.analysis) : undefined;
  const canonMoved = !superseded || canonContribution(superseded) !== canonContribution(version.analysis);
  const previousLiterary = chapter.versions.find(item => item.revision === chapter.acceptedRevision)?.literary;
  // What a chapter contributes to the book's literary state is what it establishes, not the sentences
  // that prove it. Counting the quotations made every repair a change of contribution — a repair
  // always disturbs some quoted line — so every chapter after it was invalidated on every accepted
  // revision, and the subject-level narrowing below could never apply. A live run revalidated its
  // whole tail after each structural fix for that reason alone.
  // What a chapter contributes to the book's literary state is what it establishes, not the sentences
  // that prove it — with one exception: how a chapter ends is its last words, and every chapter after
  // it is written against them. Counting every quotation made each repair a change of contribution,
  // since a repair always disturbs some quoted line, so the whole tail of the book was invalidated on
  // every accepted revision and the subject-level narrowing below could never apply.
  const contribution = (assessment: typeof previousLiterary) => JSON.stringify(assessment?.observations
    .map(({ evidence, ...rest }) => rest.kind === 'ending' ? { ...rest, ending: evidence.map(item => item.quote) } : rest));
  const literaryMoved = run.literaryValidationVersion === 1 && contribution(previousLiterary) !== contribution(version.literary);
  chapter.acceptedRevision = version.revision;
  chapter.candidateRevision = undefined;
  chapter.status = 'accepted';
  chapter.repairAttempts = 0;
  chapter.lastFindings = undefined;
  chapter.lastFindingShapes = undefined;
  // Re-reviewing a chapter whose premises did not move only invites a fresh sampled verdict on prose
  // nobody changed, and every such round can restart the cascade.
  if (canonMoved || literaryMoved) {
    for (const dependent of run.chapters.filter(item => item.number > number)) {
      if (!dependent.versions.length) continue;
      // When the move is confined to named subjects, only the chapters that speak about those
      // subjects can now contradict canon; the rest were judged on prose nobody has touched.
      if (!literaryMoved && delta && !delta.structural && delta.subjects.size) {
        const analysis = dependent.versions.find(item => item.revision === dependent.acceptedRevision)?.analysis;
        if (analysis && ![...delta.subjects].some(subject => analysisMentions(analysis).includes(subject))) continue;
      }
      dependent.status = 'invalidated';
      dependent.candidateRevision = undefined;
      dependent.repairAttempts = 0;
      dependent.lastFindings = undefined;
      dependent.lastFindingShapes = undefined;
    }
  }
  run.structuralReview = undefined;
  run.finalReview = undefined;
  run.canon = rebuildCanon(run.chapters);
  run.updatedAt = Date.now();
}

export function nextUnacceptedChapter(run: NovelRun): ChapterRecord | undefined {
  return run.chapters.find(chapter => chapter.candidateRevision !== undefined || !acceptedVersion(chapter));
}

/**
 * Older checkpoints used permissive review parsing. Preserve every draft but revalidate claims.
 *
 * A chapter goes back for revalidation when its own literary record no longer holds — and so does
 * every chapter after it, because their records were written against a ledger that has moved. Not the
 * ones before it: chapter one's record is built from the chapters before chapter one, and nothing
 * that happens later in the book can make it stale.
 *
 * This used to invalidate the whole book on any staleness at all, and staleness is ordinary: repairing
 * chapter four and accepting it again moves the ledger chapter five was judged against. A live run
 * lost all five accepted chapters and its whole canon that way, on every resume, and the loss looked
 * like the structural pass cascading rather than the checkpoint being thrown away.
 *
 * A version migration is different: nothing recorded under the old rules can be trusted, so that case
 * still revalidates the book from its first chapter.
 */
export function reconcileCheckpoint(run: NovelRun): boolean {
  const migrating = run.validationVersion !== 2 || run.literaryValidationVersion !== 1;
  const stale = run.chapters.filter(chapter => chapter.status === 'accepted'
    && (!acceptedVersion(chapter) || !literaryCurrent(run, chapter.number, acceptedVersion(chapter)!) || acceptedVersion(chapter)!.literary?.status !== 'passed'));
  if (!migrating && !stale.length) return false;
  const from = migrating ? 0 : Math.min(...stale.map(chapter => chapter.number));
  for (const chapter of run.chapters) {
    if (chapter.versions.length && chapter.number >= from) chapter.status = 'invalidated';
  }
  // The chapters before the first stale one keep their canon; rebuildCanon stops at the first gap.
  run.canon = rebuildCanon(run.chapters);
  run.structuralReview = undefined;
  run.finalReview = undefined;
  run.structuralAttempts = 0;
  run.finalAttempts = 0;
  run.validationVersion = 2;
  run.literaryValidationVersion = 1;
  if (run.chapters.length === run.spec.chapterCount) run.stage = 'writing';
  else if (run.blueprint || run.chapters.length) run.stage = 'planning';
  run.resumeStage = undefined;
  run.error = undefined;
  return true;
}

/**
 * Canon for a prompt: the established facts without the paragraph-long quotations that prove them.
 * Verification reads the stored evidence, so a reader of the story does not need to carry the proof —
 * keeping it would grow every later prompt by the length of the whole book.
 */
export function canonForPrompt(state: StoryState): object {
  const strip = <T extends { evidence: Evidence }>(items: T[]) => items.map(({ evidence, ...rest }) => rest);
  return { facts: strip(state.facts), events: strip(state.events), promises: strip(state.promises), beats: strip(state.beats || []), summaries: state.summaries };
}

/**
 * Where a scene stops being given the whole book. Six accepted chapters of a live run carry 63 facts
 * and 48 events, about 22000 characters, and the canon grows by roughly that much every six chapters:
 * a thirty-chapter book would hand every scene a hundred thousand characters of ledger. Under this
 * size the whole canon is cheaper to pass than to choose from, and choosing can only lose something.
 */
export const canonPromptBudget = 12000;

/**
 * The canon a scene actually needs: everything, until the ledger outgrows a prompt, and then the part
 * that names the people in this scene, plus everything the chapter just before established.
 *
 * The recent chapter is kept whatever it is about, because a scene follows from what just happened
 * more often than from who is standing in it, and the summaries and the promise ledger are kept whole
 * — they are short, and they are the thread the book is held together by.
 */
export function canonForScene(state: StoryState, participants: string[], chapterNumber: number): object {
  const whole = canonForPrompt(state);
  if (JSON.stringify(whole).length <= canonPromptBudget) return whole;
  const names = participants.map(name => name.toLowerCase().trim()).filter(Boolean);
  const mentions = (text: string) => names.some(name => text.toLowerCase().includes(name));
  const recent = (evidence: Evidence) => evidence.chapter >= chapterNumber - 1;
  const strip = <T extends { evidence: Evidence }>(items: T[]) => items.map(({ evidence, ...rest }) => rest);
  return {
    facts: strip(state.facts.filter(fact => recent(fact.evidence)
      || mentions(`${fact.subject} ${fact.predicate} ${fact.value} ${fact.knownBy.join(' ')}`))),
    events: strip(state.events.filter(event => recent(event.evidence)
      || mentions(`${event.description} ${event.consequences.join(' ')}`))),
    promises: strip(state.promises),
    beats: strip(state.beats || []),
    summaries: state.summaries,
  };
}

export function canonBefore(run: NovelRun, chapterNumber: number): StoryState {
  return rebuildCanon(run.chapters.filter(chapter => chapter.number < chapterNumber));
}

export function endingIssues(run: NovelRun): string[] {
  const issues: string[] = [];
  for (const promise of run.blueprint?.promises || []) {
    const setup = run.canon.promises.find(item => item.promiseId === promise.id && item.kind === 'setup');
    const payoff = run.canon.promises.find(item => item.promiseId === promise.id && item.kind === 'payoff');
    if (promise.required && !setup) issues.push(`Missing setup: ${promise.id} (${promise.description})`);
    if (promise.required && !payoff) issues.push(`Missing payoff: ${promise.id} (${promise.description})`);
    if (setup && payoff && payoff.evidence.chapter < setup.evidence.chapter) issues.push(`Payoff precedes setup: ${promise.id}`);
  }
  return issues;
}
