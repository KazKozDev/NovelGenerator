import type { ChapterRecord, ChapterVersion, NovelRun, Evidence, ReviewIssue } from './contracts';
import { specPrompt } from './contracts';
import { structuredResponse, type NovelLLM } from './review';
import { asInteger } from './engine';
import { literaryKinds, literaryLedger, literaryContextKey, type LiteraryAssessment, type LiteraryPlan } from './literaryState';
import type { Summarizer } from './summarizer';

const text = { type: 'string', minLength: 1 };
const list = (items: object, maxItems = 16) => ({ type: 'array', items, maxItems });
const object = (properties: Record<string, object>) => ({ type: 'object', required: Object.keys(properties), properties, additionalProperties: false });
const strings = (value: unknown, max = 16): value is string[] => Array.isArray(value) && value.length <= max && value.every(item => typeof item === 'string' && item.trim());
const fields = (value: any, keys: string[]) => value && keys.every(key => typeof value[key] === 'string' && value[key].trim());

/** Make the already-approved plot executable against the literary history, just before writing. */
/**
 * The ledger as a planner needs it: what earlier chapters established, quoted at its opening only.
 *
 * Planning reads history to avoid replaying a move the book has already made, and a move is
 * recognised by what it was, not by the eighteen hundred characters that prove it. Measured on the
 * English run, this prompt reached 194,000 characters with 210,000 of the ledger being quotations —
 * the same shape already cut from the assessment beside it, left standing here because nobody had
 * measured this call.
 */
export function ledgerForPlanning(history: ReturnType<typeof literaryLedger>, excerpt = 300): object {
  return history.map(item => ({
    chapter: item.chapter,
    observations: item.observations.map(observation => ({
      ...observation,
      evidence: observation.evidence.map(evidence => evidence.quote.length > excerpt ? `${evidence.quote.slice(0, excerpt)}…` : evidence.quote),
    })),
  }));
}

/** Serialized planning history above this stays verbatim; past it each observation compresses to one line. */
export const PLANNING_LEDGER_BUDGET = 8000;

export async function compressPlanningLedger(
  history: ReturnType<typeof literaryLedger>,
  summarize?: Summarizer,
  budget = PLANNING_LEDGER_BUDGET,
): Promise<object> {
  const full = ledgerForPlanning(history);
  if (!summarize || JSON.stringify(full).length <= budget) return full;
  // Compression is best-effort: a summarizer that fails (a broken download,
  // an offline runtime) falls back to the truncated quotes, observation by
  // observation, and planning continues on the full ledger. A compression
  // helper must never be what loses a chapter.
  const compressed = [];
  for (const item of history) {
    const observations = [];
    for (const observation of item.observations) {
      const { evidence, ...rest } = observation;
      const quotes = evidence.map(item => item.quote).join('\n');
      let line = '';
      try {
        line = await summarize(
          `Established in chapter ${item.chapter}: ${observation.kind} — ${observation.subject}. Before: ${observation.before}. After: ${observation.after}. Mechanism: ${observation.mechanism}. Passages:\n${quotes}`,
          128,
        );
      } catch { /* fall through to the truncated quote below */ }
      observations.push({ ...rest, evidence: [line.trim() || quotes.slice(0, 300)] });
    }
    compressed.push({ chapter: item.chapter, observations });
  }
  return compressed;
}

export async function planLiteraryDevelopment(run: NovelRun, chapter: ChapterRecord, llm: NovelLLM, summarize?: Summarizer): Promise<LiteraryPlan> {
  const history = literaryLedger(run, chapter.number);
  const planningHistory = await compressPlanningLedger(history, summarize);
  const sceneSchema = object({ sceneId: text, development: text, characterChoice: text, dramaticCost: text, narrativeWeight: { type: 'integer', minimum: 1, maximum: 5 } });
  return structuredResponse(`${specPrompt(run.spec)}\nCHAPTER ${chapter.number}\nAPPROVED CHAPTER PLAN:\n${JSON.stringify(chapter.plan)}\nCHARACTER DESIGN:\n${JSON.stringify(run.blueprint?.characters)}\nACCEPTED LITERARY HISTORY (each observation with the opening of the passage that established it):\n${JSON.stringify(planningHistory)}\nALREADY DRAFTED SCENES (preserve their events):\n${JSON.stringify(chapter.sceneDrafts || [])}\nPlan the next development, not another announcement of a realization already reached. For each existing scene ID specify development of thought or relationship, an independently motivated character choice, its dramatic cost and relative page weight (1–5). Keep the approved events, scene IDs and ending. An unchanged belief can be tested, contradicted or acted on; change is not mandatory in every scene. Preserve the antagonist's established motives and limits. Give supporting characters their own stakes where relevant, without inventing subplots. Decide how this chapter's ending develops the sequence of prior endings. Record concrete already-used moves to avoid replaying, based on the history; no invented examples. If a scene has no internal development, state its actual dramatic function.`,
    'You plan literary development against versioned manuscript state. Return only JSON.', llm, ['endingDevelopment', 'avoidReplaying', 'scenes'], raw => {
      if (!fields(raw, ['endingDevelopment']) || !strings(raw.avoidReplaying) || !Array.isArray(raw.scenes)) throw new Error('Incomplete literary development plan.');
      const expected = new Set((chapter.plan.detailedScenes || []).map(scene => scene.sceneId));
      const seen = new Set<string>();
      for (const scene of raw.scenes) {
        // The same leniency the chapter plan gets: a weight spelled "3" is the weight the model meant,
        // read once and written back as a number. And each rule says which scene failed and why —
        // "Invalid literary scene intent" told the retry nothing it could act on.
        const weight = asInteger(scene?.narrativeWeight);
        if (weight !== undefined) scene.narrativeWeight = weight;
        const named = `Scene ${JSON.stringify(scene?.sceneId ?? null)}`;
        if (!fields(scene, ['sceneId', 'development', 'characterChoice', 'dramaticCost'])) throw new Error(`${named} needs sceneId, development, characterChoice and dramaticCost, each a non-empty string.`);
        if (!expected.has(scene.sceneId)) throw new Error(`${named} is not one of this chapter's scenes: ${[...expected].join(', ')}.`);
        if (seen.has(scene.sceneId)) throw new Error(`${named} appears twice; plan each scene once.`);
        if (!Number.isInteger(scene.narrativeWeight) || scene.narrativeWeight < 1 || scene.narrativeWeight > 5) throw new Error(`${named} needs narrativeWeight as an integer from 1 to 5, not ${JSON.stringify(scene.narrativeWeight)}.`);
        seen.add(scene.sceneId);
      }
      if (seen.size !== expected.size) throw new Error('Literary plan omitted a scene.');
      return { version: 1, contextKey: literaryContextKey(run, chapter.number), chapterPlanKey: JSON.stringify(chapter.plan), endingDevelopment: raw.endingDevelopment, avoidReplaying: raw.avoidReplaying, scenes: raw.scenes };
    }, { route: 'writer', maxTokens: 8192, schema: object({ endingDevelopment: text, avoidReplaying: list(text), scenes: list(sceneSchema, 8) }) });
}

/** IDs resolve to actual source text; fabricated references fail the entire gate, not just a finding. */
export async function assessLiteraryDevelopment(run: NovelRun, chapter: ChapterRecord, candidate: ChapterVersion, llm: NovelLLM): Promise<LiteraryAssessment> {
  const history = literaryLedger(run, chapter.number);
  const sourceMap = new Map<string, Evidence>();
  history.forEach(item => item.observations.forEach((observation, index) => observation.evidence.forEach((evidence, e) => sourceMap.set(`h${item.chapter}.${index}.${e}`, evidence))));

  /**
   * What the ledger looks like on the way into the prompt. Measured on a live run of five chapters:
   * the prompt was 498000 characters, of which 423000 were quotations of earlier chapters — sent
   * twice, once inside the ledger and again in the source list — while the chapter actually being
   * assessed was 6% of it. The model then spent four attempts citing history instead of the chapter
   * and the run stopped: a prompt that large is not only expensive, it is what got read.
   *
   * The ledger now carries source ids where its quotations were, and a historical source is quoted at
   * its opening only. History is there to be referred to, not reread; the chapter under assessment is
   * the only text that arrives whole. Nothing stored changes — resolve() still reads the full
   * evidence, so a finding's saved quotation is the real passage.
   */
  const historyExcerpt = 300;
  const ledgerForPrompt = history.map(item => ({
    chapter: item.chapter,
    observations: item.observations.map((observation, index) => {
      const { evidence, ...rest } = observation;
      return { ...rest, sources: evidence.map((_, e) => `h${item.chapter}.${index}.${e}`) };
    }),
  }));
  // Bounded source units keep huge single-paragraph model output addressable too; never omit text.
  const paragraphs = candidate.content.match(/[\s\S]{1,1800}/g) || [];
  paragraphs.forEach((quote, index) => sourceMap.set(`p${index + 1}`, { chapter: chapter.number, revision: candidate.revision, quote }));
  const sourcesForPrompt = [...sourceMap].map(([id, evidence]) => ({
    id, chapter: evidence.chapter, revision: evidence.revision,
    quote: id.startsWith('h') && evidence.quote.length > historyExcerpt ? `${evidence.quote.slice(0, historyExcerpt)}…` : evidence.quote,
  }));
  /** What a finding may carry into the ledger. The model is asked for this many; more are trimmed. */
  const maxSources = 12;
  const sourceIds = list(text, maxSources);
  const observationSchema = object({ kind: { type: 'string', enum: literaryKinds }, subject: text, before: text, after: text, mechanism: text, sources: sourceIds });
  const issueSchema = object({ kind: { type: 'string', enum: literaryKinds }, severity: { type: 'string', enum: ['major', 'minor'] }, description: text, instruction: text, sources: sourceIds });
  const resolve = (ids: unknown) => {
    // These messages return to the model inside the automatic retry, so each one has to name the
    // defect it actually found. A chapter died here on a report whose IDs were all real: the list
    // was thirteen long, the cap was twelve, and the failure came back as "unknown or missing
    // source" listing twelve valid IDs with the instruction to copy them exactly — which the model
    // had done. Told to fix what was not broken, it returned the same answer and the run stopped.
    if (!Array.isArray(ids) || !ids.length || !ids.every(item => typeof item === 'string' && item.trim())) {
      throw new Error(`A literary finding must cite its sources (got: ${JSON.stringify(ids)}): give a non-empty array of source IDs copied from the SOURCE TEXT list — p1..p${paragraphs.length} for the current prose, hC.I.E for history.`);
    }
    const cited = [...new Set(ids.map(id => id.trim()))];
    const unknown = cited.filter(id => !sourceMap.has(id));
    if (unknown.length) throw new Error(`Unknown literary evidence source (${unknown.slice(0, 12).join(', ')}): copy source IDs exactly from the SOURCE TEXT list — p1..p${paragraphs.length} for the current prose, hC.I.E for history. Do not invent IDs.`);
    const current = cited.filter(id => {
      const evidence = sourceMap.get(id)!;
      return evidence.chapter === chapter.number && evidence.revision === candidate.revision;
    });
    if (!current.length) throw new Error(`A literary finding must cite the current chapter (got only history: ${cited.slice(0, 12).join(', ')}): include at least one p-unit ID from the current prose alongside any history IDs.`);
    // Over-citing is not fabricating. A finding grounded in more real passages than the cap allows is
    // still grounded, so the extras are dropped rather than the assessment, and the passage that ties
    // the finding to this chapter is kept whatever else goes.
    const kept = cited.length <= maxSources
      ? cited
      : [current[0], ...cited.filter(id => id !== current[0]).slice(0, maxSources - 1)];
    return kept.map(id => sourceMap.get(id)!);
  };
  return structuredResponse(`${specPrompt(run.spec)}\nCHAPTER ${chapter.number}, REVISION ${candidate.revision}\nLITERARY HISTORY (referred to by source id; the quotations live in the source list below):\n${JSON.stringify(ledgerForPrompt)}\nDEVELOPMENT INTENT (not proof):\n${JSON.stringify(chapter.literaryPlan)}\nAPPROVED PLOT AND CHARACTER DESIGN:\n${JSON.stringify({ plan: chapter.plan, characters: run.blueprint?.characters })}\nSOURCE TEXT: historical evidence followed by the COMPLETE current prose in consecutive numbered units:\n${JSON.stringify(sourcesForPrompt)}\nRecord what this prose actually establishes, and only that. These observations become the book's literary history, read by every later chapter as evidence of what has already happened, so a chapter that establishes two things must produce two observations and a chapter that establishes eight must produce eight. Do not write one observation per dimension: a ledger padded to cover the list describes a book that was not written and misleads every chapter after this one. Store before/after and mechanism, each with supporting source IDs. "Before" is where this thread stood when this chapter opened, which for a thread the history above already tracks is that history's most recent "after" — not a restatement of where the thread began earlier in the book. Copying a previous "before" forward says the chapter changed nothing, and a ledger that says so about a chapter that did change misleads every chapter after it. At least one ending observation must cite the final source p${paragraphs.length}, because a chapter's ending is always established by its ending.\nSeparately judge all six dimensions against the actual current text and historical evidence, and say plainly where a dimension fails. Six clean dimensions and six defects are both possible results, and neither is the expected one: judge what is on the page. A defect is something the text does — a realization the book already reached announced again as if new, an ending built out of the same moves as the previous chapter's, an explanation restating an action the prose has just shown, a motive flattened without groundwork, a character carried through the scene without a choice of their own, a decisive exchange summarized after a long approach. A passage that could go deeper, land harder or be more fully developed is not a defect, and this review does not collect suggestions. Compare meanings and rhetorical functions, not word overlap. A deliberate motif with new consequences and a belief genuinely tested are not defects. Cross-chapter repetition findings must cite both historical and current source IDs; local repetition findings must cite its occurrences. Distinguish omission from a supporting character simply being absent from this chapter. Do not demand a moral recap, action climax or thought change in every chapter. The final ending must honor the author contract.\nReturn observations, issues, and checked containing all six dimension names only after assessing each. Empty issues means every assessed dimension holds; an issues list is not required to be non-empty and is not required to be empty.`,
    'You assess literary development from source text, independently of continuity review. Return only JSON.', llm, ['observations', 'issues', 'checked'], raw => {
      if (!strings(raw.checked, 6) || new Set(raw.checked).size !== 6 || literaryKinds.some(kind => !raw.checked.includes(kind))) throw new Error('Literary review did not cover all dimensions.');
      if (!Array.isArray(raw.observations) || !raw.observations.length || raw.observations.length > 16 || !Array.isArray(raw.issues) || raw.issues.length > 16) throw new Error('Incomplete literary assessment.');
      const observations = raw.observations.map((item: any) => {
        if (!fields(item, ['subject', 'before', 'after', 'mechanism']) || !literaryKinds.includes(item.kind)) throw new Error('Malformed literary observation.');
        return { kind: item.kind, subject: item.subject, before: item.before, after: item.after, mechanism: item.mechanism, evidence: resolve(item.sources) };
      });
      if (!raw.observations.some((item: any) => item.kind === 'ending' && item.sources.includes(`p${paragraphs.length}`))) throw new Error('Literary state omitted the actual chapter ending.');
      const issues: ReviewIssue[] = raw.issues.map((item: any, index: number) => {
        if (!fields(item, ['description', 'instruction']) || !literaryKinds.includes(item.kind) || !['major', 'minor'].includes(item.severity)) throw new Error('Malformed literary issue.');
        return { id: `literary-${item.kind}-${index}`, category: item.kind === 'pacing' || item.kind === 'ending' ? 'pacing' : 'character', severity: item.severity, description: item.description, instruction: item.instruction, evidence: resolve(item.sources) };
      });
      return { version: 1, checkedRevision: candidate.revision, contextKey: literaryContextKey(run, chapter.number), status: issues.some(item => item.severity === 'major') ? 'failed' : 'passed', observations, issues };
    }, { maxTokens: 8192, schema: object({ observations: { ...list(observationSchema), minItems: 1 }, issues: list(issueSchema), checked: { ...list({ type: 'string', enum: literaryKinds }, 6), minItems: 6, uniqueItems: true } }) });
}
