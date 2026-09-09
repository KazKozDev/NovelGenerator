import type { ChapterRecord, ChapterVersion, NovelRun, Evidence, ReviewIssue } from './contracts';
import { specPrompt } from './contracts';
import { structuredResponse, type NovelLLM } from './review';
import { literaryKinds, literaryLedger, literaryContextKey, type LiteraryAssessment, type LiteraryPlan } from './literaryState';

const text = { type: 'string', minLength: 1 };
const list = (items: object, maxItems = 16) => ({ type: 'array', items, maxItems });
const object = (properties: Record<string, object>) => ({ type: 'object', required: Object.keys(properties), properties, additionalProperties: false });
const strings = (value: unknown, max = 16): value is string[] => Array.isArray(value) && value.length <= max && value.every(item => typeof item === 'string' && item.trim());
const fields = (value: any, keys: string[]) => value && keys.every(key => typeof value[key] === 'string' && value[key].trim());

/** Make the already-approved plot executable against the literary history, just before writing. */
export async function planLiteraryDevelopment(run: NovelRun, chapter: ChapterRecord, llm: NovelLLM): Promise<LiteraryPlan> {
  const history = literaryLedger(run, chapter.number);
  const sceneSchema = object({ sceneId: text, development: text, characterChoice: text, dramaticCost: text, narrativeWeight: { type: 'integer', minimum: 1, maximum: 5 } });
  return structuredResponse(`${specPrompt(run.spec)}\nCHAPTER ${chapter.number}\nAPPROVED CHAPTER PLAN:\n${JSON.stringify(chapter.plan)}\nCHARACTER DESIGN:\n${JSON.stringify(run.blueprint?.characters)}\nACCEPTED LITERARY HISTORY WITH TEXT EVIDENCE:\n${JSON.stringify(history)}\nALREADY DRAFTED SCENES (preserve their events):\n${JSON.stringify(chapter.sceneDrafts || [])}\nPlan the next development, not another announcement of a realization already reached. For each existing scene ID specify development of thought or relationship, an independently motivated character choice, its dramatic cost and relative page weight (1–5). Keep the approved events, scene IDs and ending. An unchanged belief can be tested, contradicted or acted on; change is not mandatory in every scene. Preserve the antagonist's established motives and limits. Give supporting characters their own stakes where relevant, without inventing subplots. Decide how this chapter's ending develops the sequence of prior endings. Record concrete already-used moves to avoid replaying, based on the history; no invented examples. If a scene has no internal development, state its actual dramatic function.`,
    'You plan literary development against versioned manuscript state. Return only JSON.', llm, ['endingDevelopment', 'avoidReplaying', 'scenes'], raw => {
      if (!fields(raw, ['endingDevelopment']) || !strings(raw.avoidReplaying) || !Array.isArray(raw.scenes)) throw new Error('Incomplete literary development plan.');
      const expected = new Set((chapter.plan.detailedScenes || []).map(scene => scene.sceneId));
      const seen = new Set<string>();
      for (const scene of raw.scenes) {
        if (!fields(scene, ['sceneId', 'development', 'characterChoice', 'dramaticCost']) || !expected.has(scene.sceneId) || seen.has(scene.sceneId) || !Number.isInteger(scene.narrativeWeight) || scene.narrativeWeight < 1 || scene.narrativeWeight > 5) throw new Error('Invalid literary scene intent.');
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
  // Bounded source units keep huge single-paragraph model output addressable too; never omit text.
  const paragraphs = candidate.content.match(/[\s\S]{1,1800}/g) || [];
  paragraphs.forEach((quote, index) => sourceMap.set(`p${index + 1}`, { chapter: chapter.number, revision: candidate.revision, quote }));
  const sourceIds = list(text, 12);
  const observationSchema = object({ kind: { type: 'string', enum: literaryKinds }, subject: text, before: text, after: text, mechanism: text, sources: sourceIds });
  const issueSchema = object({ kind: { type: 'string', enum: literaryKinds }, severity: { type: 'string', enum: ['major', 'minor'] }, description: text, instruction: text, sources: sourceIds });
  const resolve = (ids: unknown) => {
    if (!strings(ids, 12) || !ids.length || ids.some(id => !sourceMap.has(id))) throw new Error('Unknown or missing literary evidence source.');
    const evidence = [...new Set(ids)].map(id => sourceMap.get(id)!);
    if (!evidence.some(item => item.chapter === chapter.number && item.revision === candidate.revision)) throw new Error('A literary finding must cite the current chapter.');
    return evidence;
  };
  return structuredResponse(`${specPrompt(run.spec)}\nCHAPTER ${chapter.number}, REVISION ${candidate.revision}\nLITERARY HISTORY:\n${JSON.stringify(history)}\nDEVELOPMENT INTENT (not proof):\n${JSON.stringify(chapter.literaryPlan)}\nAPPROVED PLOT AND CHARACTER DESIGN:\n${JSON.stringify({ plan: chapter.plan, characters: run.blueprint?.characters })}\nSOURCE TEXT: historical evidence followed by the COMPLETE current prose in consecutive numbered units:\n${JSON.stringify([...sourceMap].map(([id, evidence]) => ({ id, ...evidence })))}\nExtract what this prose actually establishes into observations: thought progression, ending construction, autonomous character stakes and choices, antagonist motives and limits, recurrent rhetorical moves, and distribution of dramatic attention. Store before/after and mechanism, each with supporting source IDs. At least one ending observation must cite the final source p${paragraphs.length}. No need to invent an observation for an absent feature.\nSeparately judge all six dimensions against the actual current text and historical evidence. Report concrete stagnation, recycled ending constructions, explanation duplicating shown action, unsupported flattening of motivation, loss of character agency, or a decisive exchange summarized after prolonged buildup. Compare meanings and rhetorical functions, not word overlap. A deliberate motif with new consequences and a belief genuinely tested are not defects. Cross-chapter repetition findings must cite both historical and current source IDs; local repetition findings must cite its occurrences. Distinguish omission from a supporting character simply being absent from this chapter. Do not demand a moral recap, action climax or thought change in every chapter. The final ending must honor the author contract.\nReturn observations, issues, and checked containing all six dimension names only after assessing each. Empty issues means every assessed dimension has no actionable defect.`,
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
