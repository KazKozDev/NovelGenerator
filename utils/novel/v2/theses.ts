import {repairReport, repairRevision, commitRepairPackage, packageDiff, issueIdentity, type RepairReport} from './repairPackage';
import { planEvidenceSource, scenePlanContext, sceneContractContext, findingsContext } from './context';
import { manuscriptAgent as runManuscriptAgent, searchManuscript, type TextEdit, type ManuscriptSession } from './manuscriptTools';
import { fillTemplate } from '../prompts';
import systemRaw from '../../../prompts/THESIS_SYSTEM.md?raw';
import planRaw from '../../../prompts/THESIS_PLAN.md?raw';
import reviewRaw from '../../../prompts/THESIS_REVIEW.md?raw';
import repairRaw from '../../../prompts/THESIS_REPAIR.md?raw';
import writeRaw from '../../../prompts/THESIS_WRITE.md?raw';
import auditRaw from '../../../prompts/DEVELOP_AUDIT.md?raw';
import { TRANSITION_INSTRUCTIONS, transitionReviewSchema, readStateTrace, sceneRevision, type StateTrace } from './stateTransitions';
import { planAgent, readPlan, searchPlan, linkedPlan, factDependencies, planDirectory, type PlanSession } from './planTools';
import { repairReviewEvidence } from './reviewEvidenceRepair';
import { structuredResponse, stripThinking, isResponseContractError, type NovelLLM } from './llm';
import { inputKey } from './progressive';
import type { ProjectStore } from './store';
import type { ProjectInput } from './types';
import { thesisPlanSchema } from './thesisSchema';
import { causalRepairSchema, canonicalRepairSchema, accountFromPlan, readCausalAccount } from './causalAccount';
import { stableJson } from './contracts';
import { proseEvidence, resolveProseEvidence, EVIDENCE_INSTRUCTIONS } from './proseEvidence';
import { planReviewSchema, proseReviewSchema, repairVerificationSchema } from './proseReviewSchema';
import { affectedByEdits } from './editImpact';
import { blockContract } from './blockContract';
import { causalRepairOrder } from './causalRepairOrder';
import { wordBudget } from './wordBudget';
import {chapterBudget,sceneCoverage,sceneRequirements,repartitionProse,SCENE_WORD_CAP} from './sceneBudget';
import {validateCanon,canonContext,type StoryCanon} from './storyCanon';
import { QUALITY_KEYS, qualityInstructions, duplicateParagraphs, textFindings, validateQualityChecks } from './storyQuality';
import { premiseChecks, deedGaps } from './premiseChecks';
import { trackedItems, statesBefore, stateIssues, stateBrief, askStates, type StateLedger } from './stateLedger';
import { nameHabits, mergeHabits, habitBrief, confirmedHabits, type Habit, type HabitMemory } from './habits';
import {developChapters,developmentContext,readChapterDevelopment,type ChapterDevelopmentState} from './chapterDevelopment';

export interface Thesis {
  id: string; chapter: number; pov_id: string; fact_ids?: string[];
  participants: { character_id: string; intention: string; knows: string[]; does?: string }[];
  when: string; where: string; state_before: string; action: string; why: string;
  resistance: string; outcome: string; establishes: string[]; reader_learns: string[];
  requires: string[]; writer_task: string; target_words: number;
}
export interface ThesisPlan {
  title: string; premise_givens: string[]; canon?:StoryCanon;
  /** The few things the plot turns on, whose whereabouts are accounted for scene by scene. */
  tracked?: { id: string; name: string; start: string }[];
  characters: { id: string; name: string; goal: string; initial_knowledge: string[]; capabilities: string[]; limitations: string[] }[];
  theses: Thesis[]; ending: string;
}
export interface ThesisReview {
  ready: boolean;
  state_trace?:StateTrace;
  status?: 'unavailable';
  error?: string;
  issues: { severity: 'major' | 'minor'; thesis_ids: string[]; problem: string; required_change: string; kind?: string; evidence?: string; consequence?: string }[];
}
export interface ThesisDraft {
  version: 1; input_key: string; budget_replan?:boolean; plan: ThesisPlan | null; plan_ready: boolean;
  rounds: { plan: ThesisPlan; review: ThesisReview | null; repair_check?:{resolved:number;total:number} }[];
  planning_progress?:{stalled:number;last_round:number};
  plan_tools?:PlanSession;
  blocks: { thesis_id: string; text: string; review: ThesisReview }[];
  pending: { thesis_id: string; text: string; attempt: number; review: ThesisReview | null } | null;
  manifestation?: { phase: 'rough' | 'expand' | 'polish' | 'done'; next: number; recheck_from?: number; causal_restarts?: number; versions: { phase: string; plan?:ThesisPlan; blocks: { thesis_id: string; text: string; review: ThesisReview }[] }[] };
  synopsis?: string;
  habits?: Habit[];
  state_ledger?: StateLedger;
  /** Whole-book findings whose repair did not converge; reported with the finished book. */
  carried_findings?: ThesisReview['issues'];
  chapter_development?:ChapterDevelopmentState;
  repair_reports?:RepairReport[];
  response_candidate?: {stage:string;raw:string;error?:string};
  review_candidate?:{thesis_id:string;phase:string;source_revision:string;raw:string;error?:string};
  scene_design?: {plan:ThesisPlan;review?:ThesisReview;attempts?:number;stalled?:number;previous_count?:number};
  edits?: { at: string; phase: string; edits: TextEdit[] }[];
  completed: boolean;
  deferred?: { thesis_id: string; phase: string; review: ThesisReview }[];
  review_failures?: { thesis_id: string; phase: string; error: string }[];
  seams?: { next: number; reviews: { left: string; right: string; review: ThesisReview }[] };
  final_checks?: Record<string, { passed: boolean; evidence: string }>;
  tool_session?: { scope: string; state: ManuscriptSession };
  affected_blocks?: string[];
  revision_before?: Record<string, string>;
  rough_gate?: { causal_candidate?: {plan:ThesisPlan;account:Record<string,string>}; reconciliation_feedback?: ThesisReview['issues']; attempts: number; review: ThesisReview | null; last_candidate?: { blocks: {id: string; text: string}[]; edits: TextEdit[]; verification?: RepairVerification }; progress?: { best: number; stalled: number; counts: number[]; last_revision?: string }; repair?: { issues: ThesisReview['issues']; next: number; plan_progress?: {resolved:number[];stalled:number;revision?:string}; prepared?: { base_revision?:string; verified_revision?:string; next: number; account: Record<string, string>; plan?: ThesisPlan; planReview?: ThesisReview; candidate?: { blocks: {id: string; text: string}[]; edits: TextEdit[] }; verification?: RepairVerification; order?: {ids:string[];next:number;stalled?:number}; progress?: {best:number;stalled:number;counts:number[];last_revision?:string;resolved?:number[]} } } };
  final_repair?: { attempts: number; phase: 'write' | 'recheck' | 'idle'; findings: { severity: string; description: string }[]; changed: string[]; stalled?:number; previous_count?:number; previous_revision?:string };
}
export interface RepairVerification {
  accepted: boolean;
  checks: { issue: number; status: 'repaired' | 'not_a_defect' | 'unresolved'; evidence: string; explanation: string }[];
  issues: ThesisReview['issues'];
}
export function readRepairVerification(raw: any, plan: ThesisPlan, prose: string, count: number): RepairVerification {
  if (!Array.isArray(raw?.checks) || raw.checks.length !== count) throw new Error('Repair verification must cover every original defect exactly once');
  const seen = new Set<number>();
  const checks = raw.checks.map((check: any) => {
    if (!check || !Number.isInteger(check.issue) || check.issue < 0 || check.issue >= count || seen.has(check.issue)
      || !['repaired', 'not_a_defect', 'unresolved'].includes(check.status) || !text(check.explanation)) throw new Error('Invalid repair verification item');
    seen.add(check.issue);
    const evidence = resolveProseEvidence(check.evidence, prose);
    if (!evidence || !prose.includes(evidence)) throw new Error(`Repair verdict ${check.issue}: needs exact evidence; invalid source citation ${JSON.stringify(check.evidence)}. Return ONE current source address: ${[...proseEvidence(prose).references.keys()].join(', ')}. Do not reconstruct a quotation.`);
    return {issue: check.issue, status: check.status, evidence, explanation: check.explanation};
  });
  const review = readProseReview({ready: raw.ready, issues: raw.issues}, plan, prose);
  const accepted = checks.every((check: RepairVerification['checks'][number]) => check.status !== 'unresolved') && review.ready;
  // The verdict follows verified findings, not a redundant model-written ready flag.
  return {accepted, checks, issues: review.issues};
}
/** A whole-book repair that stopped making verified progress; the accepted text is unchanged. */
export class RepairStalled extends Error {}
const system = systemRaw.trim();
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);

/** Model word counts are relative weights; the requested total is assigned by code. */
export function allocateThesisWords(raw: any, input: ProjectInput): ThesisPlan {
  // Model outputs specify the ending once. The persisted mirror is code-owned.
  if(raw?.canon && typeof raw.canon==='object' && !Array.isArray(raw.canon)) raw={...raw,canon:{...raw.canon,resolution:raw.ending}};
  if (!Array.isArray(raw?.theses) || !raw.theses.length
    || raw.theses.some((t: any) => !Number.isSafeInteger(t?.target_words) || t.target_words < 1)) return readThesisPlan(raw, input);
  const theses=raw.theses.map((thesis:Thesis)=>({...thesis,
    ...(raw.canon && (thesis.fact_ids === undefined || Array.isArray(thesis.fact_ids)) ? {fact_ids:[...new Set([...(thesis.fact_ids || []),...(Array.isArray(raw.canon?.facts)?raw.canon.facts.filter((fact:any)=>fact?.established_in===thesis.id).map((fact:any)=>fact.id):[])])]}:{})}));
  for(let chapter=1;chapter<=input.chapter_count;chapter++) {
    const scenes=theses.filter((thesis:Thesis)=>thesis.chapter===chapter);
    const total=chapterBudget(input,chapter), count=scenes.length;
    if(!count) continue; // readThesisPlan supplies the descriptive missing-chapter error.
    if(!Number.isSafeInteger(total)||total<count) throw new Error('Requested word budget must allow at least one word per thesis.');
    const sum=scenes.reduce((n:number,t:Thesis)=>n+t.target_words,0);
    if(!Number.isSafeInteger(sum)) throw new Error('Invalid thesis word weights.');
    const canCap=count*SCENE_WORD_CAP>=total;
    if(sum===total && (!canCap || scenes.every((t:Thesis)=>t.target_words<=SCENE_WORD_CAP))) continue;
    const shares=scenes.map((t:Thesis,index:number)=>{
      const share=(total-count)*(t.target_words/sum);
      return {index,words:1+Math.floor(share),fraction:share-Math.floor(share)};
    });
    const remaining=total-shares.reduce((n:number,share:{words:number})=>n+share.words,0);
    const ranked=[...shares].sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
    for(let i=0;i<remaining;i++) ranked[i].words++;
    if(canCap) {
      let excess=0;
      for(const share of shares) if(share.words>SCENE_WORD_CAP) {excess+=share.words-SCENE_WORD_CAP;share.words=SCENE_WORD_CAP;}
      while(excess>0) for(const share of ranked) if(excess>0&&share.words<SCENE_WORD_CAP) {share.words++;excess--;}
    }
    scenes.forEach((t:Thesis,index:number)=>{t.target_words=shares[index].words;});
  }
  return readThesisPlan({...raw,theses},input);
}

export function readThesisPlan(raw: any, input: ProjectInput): ThesisPlan {
  if (!raw || !text(raw.title) || !text(raw.ending) || !strings(raw.premise_givens)
    || !Array.isArray(raw.characters) || !raw.characters.length || !Array.isArray(raw.theses) || !raw.theses.length) {
    throw new Error('Thesis plan requires a title, givens, characters, complete thesis outline and ending.');
  }
  const characters = new Set<string>();
  for (const c of raw.characters) {
    if (!c || !text(c.id) || characters.has(c.id) || !text(c.name) || !text(c.goal)
      || !strings(c.initial_knowledge) || !strings(c.capabilities) || !strings(c.limitations)) throw new Error('Invalid or duplicate thesis-plan character.');
    characters.add(c.id);
  }
  const seen = new Set<string>();
  let chapter = 1;
  let budget = 0;
  const invalid: string[] = [];
  for (const t of raw.theses) {
    const required = ['id', 'chapter', 'pov_id', 'participants', 'when', 'where', 'state_before', 'action', 'why', 'resistance', 'outcome', 'establishes', 'reader_learns', 'requires', 'writer_task', 'target_words'];
    const missing = required.filter(key => !t || !Object.hasOwn(t, key));
    if (missing.length) throw new Error(`Invalid thesis ${t?.id || '(missing id)'}: missing required fields: ${missing.join(', ')}. Return every required field, including these, with concrete story data.`);
    const empty = ['id', 'pov_id', 'when', 'where', 'state_before', 'action', 'why', 'resistance', 'outcome', 'writer_task'].filter(key => !text(t[key]));
    if (empty.length) throw new Error(`Invalid thesis ${t.id}: nonempty strings required for fields: ${empty.join(', ')}.`);
    // Each failed condition is named with its values: "invalid thesis" tells a planner
    // nothing it can repair, and it then rewrites the whole outline to no effect.
    const reasons: string[] = [];
    if (seen.has(t.id)) reasons.push(`id ${t.id} is used twice`);
    if (!Number.isInteger(t.chapter)) reasons.push(`chapter must be an integer, got ${JSON.stringify(t.chapter)}`);
    else if (!seen.size && t.chapter !== 1) reasons.push(`the first thesis must be in chapter 1, got ${t.chapter}`);
    else if (t.chapter < chapter || t.chapter > chapter + 1) reasons.push(`chapter ${t.chapter} follows chapter ${chapter}; theses stay in writing order, each in the same chapter as the one before or the next`);
    else if (t.chapter > input.chapter_count) reasons.push(`chapter ${t.chapter} exceeds the requested ${input.chapter_count}`);
    if (!characters.has(t.pov_id)) reasons.push(`pov_id ${JSON.stringify(t.pov_id)} is not a character id (${[...characters].join(', ')})`);
    if (!Array.isArray(t.participants) || !t.participants.length) reasons.push('participants must be a nonempty array');
    else {
      if (!t.participants.some((p: any) => p?.character_id === t.pov_id)) reasons.push(`participants must include the pov character ${t.pov_id}`);
      if (new Set(t.participants.map((p: any) => p?.character_id)).size !== t.participants.length) reasons.push('a character is listed twice in participants');
      for (const p of t.participants) {
        if (!p || !characters.has(p.character_id)) reasons.push(`participant ${JSON.stringify(p?.character_id)} is not a character id (${[...characters].join(', ')}); add the person to characters or remove them here`);
        else if (!text(p.intention) || !strings(p.knows)) reasons.push(`participant ${p.character_id} needs a nonempty intention and knows as an array of nonempty strings`);
      }
    }
    for (const key of ['establishes', 'reader_learns', 'requires']) if (!strings(t[key])) reasons.push(`${key} must be an array of nonempty strings (an empty array is allowed, an empty string is not)`);
    if (strings(t.requires)) {
      const unknown = t.requires.filter((id: string) => !seen.has(id));
      if (unknown.length) reasons.push(`requires names ${unknown.join(', ')}, which ${unknown.length > 1 ? 'are' : 'is'} not an earlier thesis; requires may hold only IDs of theses placed before ${t.id}: ${[...seen].join(', ') || 'none'}`);
      if (new Set(t.requires).size !== t.requires.length) reasons.push('requires lists an ID twice');
    }
    if (!Number.isInteger(t.target_words) || t.target_words < 1) reasons.push(`target_words must be a positive integer, got ${JSON.stringify(t.target_words)}`);
    if (reasons.length) invalid.push(`${t.id}: ${reasons.join('; ')}`);
    if (Number.isInteger(t.chapter) && t.chapter >= chapter && t.chapter <= chapter + 1) chapter = t.chapter;
    seen.add(t.id);
    budget += Number.isInteger(t.target_words) ? t.target_words : 0;
  }
  if (invalid.length) throw new Error(`Invalid ${invalid.length > 1 ? `theses (${invalid.length}); repair all of them in one answer` : 'thesis'}. ${invalid.join('\n')}`);
  if (chapter !== input.chapter_count) throw new Error('Every requested chapter must be represented by theses.');
  if (Math.abs(budget - input.target_total_words) > Math.max(10, input.target_total_words * 0.15)) {
    throw new Error(`Thesis word budgets total ${budget}; they must fit the requested ${input.target_total_words} words within 15%.`);
  }
  validateCanon(raw as ThesisPlan);
  return raw as ThesisPlan;
}
export function readThesisReview(raw: any, plan: ThesisPlan): ThesisReview {
  const ids = new Set(plan.theses.map(t => t.id));
  if (raw?.status === 'unavailable') {
    if (raw.ready !== false || !text(raw.error) || !Array.isArray(raw.issues) || raw.issues.length) throw new Error('Invalid unavailable review');
    return { ready: false, status: 'unavailable', error: raw.error, issues: [] };
  }
  if (!raw || !Array.isArray(raw.issues)) throw new Error('Review issues must be an array; return issues: [] only when there are no findings.');
  for(const [index,issue] of raw.issues.entries()) {
    const defects=[
      !issue||!['major','minor'].includes(issue.severity)?'severity must be major or minor':'',
      !text(issue?.problem)?'problem must describe the concrete defect':'',
      !text(issue?.required_change)?'required_change must state the correction':'',
      !Array.isArray(issue?.thesis_ids)||!issue.thesis_ids.length?'thesis_ids must be a nonempty array of existing scene IDs':
        issue.thesis_ids.some((id:any)=>!ids.has(id))?`unknown thesis_ids: ${issue.thesis_ids.filter((id:any)=>!ids.has(id)).join(', ')}`:'',
    ].filter(Boolean);
    if(defects.length) throw new Error(`Invalid review issue ${index+1}: ${defects.join('; ')}. Valid thesis IDs: ${[...ids].join(', ')}. Return the corrected review; do not drop substantive findings to make it pass.`);
  }
  return { ready: !raw.issues.some((i: any) => i.severity === 'major'), issues: raw.issues };
}
export function readProseReview(raw: any, plan: ThesisPlan, prose: string): ThesisReview {
  if (raw?.status !== undefined) throw new Error('A thesis review must be a real assessment, not a model-reported unavailable status.');
  const review = readThesisReview(raw, plan);
  const kinds = ['contradiction', 'impossible_action', 'unsupported_knowledge', 'missing_event', 'continuity', 'premature_disclosure', 'author_requirement', 'narrative_failure'];
  const issues = review.issues.map(original => {
    const issue = { ...original, evidence: resolveProseEvidence(original.evidence, prose) };
    if (issue.kind === 'style') return { ...issue, severity: 'minor' as const };
    if (issue.severity === 'major' && (!kinds.includes(issue.kind || '') || !text(issue.evidence)
      || !prose.includes(issue.evidence) || !text(issue.consequence))) {
      const missing = [!kinds.includes(issue.kind || '') ? 'kind must be an allowed logical-defect category' : '', !text(issue.evidence) ? 'evidence must use an existing @P paragraph address or quote supplied prose' : !prose.includes(issue.evidence!) ? 'evidence is not a verbatim substring of supplied prose; use one existing @P paragraph address from this review, or copy the quote exactly' : '', !text(issue.consequence) ? 'consequence must explain the concrete failure' : ''].filter(Boolean);
      throw new Error('A blocking prose issue must identify a logical defect, an exact quote from supplied prose and its concrete consequence. Invalid issue: ' + issue.problem + '. Repair fields: ' + missing.join('; '));
    }
    return issue;
  });
  return { ready: !issues.some(i => i.severity === 'major'), issues };
}
export function validateThesisDraft(raw: unknown, input: ProjectInput): ThesisDraft {
  const d = raw as ThesisDraft;
  if (!d || d.version !== 1 || d.input_key !== inputKey(input) || typeof d.plan_ready !== 'boolean'
    || typeof d.completed !== 'boolean' || !Array.isArray(d.rounds) || !Array.isArray(d.blocks)) throw new Error('Invalid thesis draft or input mismatch.');
  if(d.repair_reports && (!Array.isArray(d.repair_reports)||d.repair_reports.some(r=>!r || !text(r.package_id) || !text(r.revision) || !['verified','rejected','committed'].includes(r.status)||!Array.isArray(r.resolved)||!Array.isArray(r.remaining)||!Array.isArray(r.introduced))))throw new Error('Invalid repair progress reports');
  if(d.carried_findings) readThesisReview({issues:d.carried_findings},d.plan!);
  if(d.state_ledger && (typeof d.state_ledger!=='object'||Object.values(d.state_ledger).some(entry=>!entry||!text(entry.revision)||!Array.isArray(entry.states))))throw new Error('Invalid state ledger');
  if(d.habits && (!Array.isArray(d.habits)||d.habits.some(h=>!h||!text(h.device)||!strings(h.markers)||typeof h.example!=='string')))throw new Error('Invalid habit ledger');
  if(d.response_candidate && (!text(d.response_candidate.stage) || typeof d.response_candidate.raw !== 'string' || (d.response_candidate.error !== undefined && !text(d.response_candidate.error)))) throw new Error('Invalid response-repair checkpoint');
  if(d.review_candidate && (!text(d.review_candidate.thesis_id)||!text(d.review_candidate.phase)||!text(d.review_candidate.source_revision)||typeof d.review_candidate.raw!=='string'))throw new Error('Invalid review response checkpoint');
  if (d.manifestation && (!['rough', 'expand', 'polish', 'done'].includes(d.manifestation.phase)
    || !Number.isInteger(d.manifestation.next) || d.manifestation.next < 0 || d.manifestation.next > d.blocks.length
    || !Array.isArray(d.manifestation.versions))) throw new Error('Invalid manifestation progress');
  if (d.edits && (!Array.isArray(d.edits) || d.edits.some(h => !h || !text(h.at) || !text(h.phase) || !Array.isArray(h.edits)
    || h.edits.some(e => !e || !text(e.block_id) || !text(e.before) || typeof e.after !== 'string')))) throw new Error('Invalid edit history');
  const plan = d.plan ? readThesisPlan(d.plan, input) : null;
  if(d.chapter_development) {
    if(!Array.isArray(d.chapter_development.chapters))throw Error('Invalid chapter development checkpoint');
    if(d.chapter_development.chapters.length)readChapterDevelopment(d.chapter_development,input);
    if(d.chapter_development.review&&(!Array.isArray(d.chapter_development.review.issues)||d.chapter_development.review.ready!==!d.chapter_development.review.issues.length))throw Error('Invalid chapter development review');
  }
  if(d.planning_progress&&(!Number.isInteger(d.planning_progress.stalled)||d.planning_progress.stalled<0||!Number.isInteger(d.planning_progress.last_round)||d.planning_progress.last_round<0||d.planning_progress.last_round>d.rounds.length)) throw new Error('Invalid automatic planning progress');
  if(d.plan_tools && (!text(d.plan_tools.key)||!Array.isArray(d.plan_tools.history)||!Array.isArray(d.plan_tools.edits)))throw new Error('Invalid plan tool session');
  if(d.plan_tools)readThesisPlan(d.plan_tools.candidate,input);
  if(d.scene_design) {const candidate=readThesisPlan(d.scene_design.plan,input);if(d.scene_design.review) readThesisReview(d.scene_design.review,candidate);}
  if (d.final_repair && (!Number.isInteger(d.final_repair.attempts) || d.final_repair.attempts < 0
    || !['write', 'recheck', 'idle'].includes(d.final_repair.phase) || !Array.isArray(d.final_repair.findings)
    || d.final_repair.findings.some(f => !['major', 'minor'].includes(f.severity) || !text(f.description))
    || !Array.isArray(d.final_repair.changed) || d.final_repair.changed.some(id => !plan?.theses.some(t => t.id === id)))) throw new Error('Invalid final repair progress');
  if (d.tool_session && (!text(d.tool_session.scope) || !d.tool_session.state || typeof d.tool_session.state.searched !== 'boolean'
    || !Array.isArray(d.tool_session.state.history) || d.tool_session.state.history.length > 16
    || d.tool_session.state.history.some(h => !h || !('command' in h) || !('result' in h)))) throw new Error('Invalid manuscript tool session');
  if (d.affected_blocks && (!Array.isArray(d.affected_blocks) || d.affected_blocks.some(id => !plan?.theses.some(t => t.id === id)))) throw new Error('Invalid affected block queue');
  if (d.rough_gate && (!Number.isInteger(d.rough_gate.attempts) || d.rough_gate.attempts < 0
    || d.rough_gate.review && !readThesisReview(d.rough_gate.review, plan!))) throw new Error('Invalid short-book gate');
  for (const repairProgress of [d.rough_gate?.progress, d.rough_gate?.repair?.prepared?.progress]) {
  if (repairProgress && (!Number.isInteger(repairProgress.best) || repairProgress.best < 0
    || !Number.isInteger(repairProgress.stalled) || repairProgress.stalled < 0
    || !Array.isArray(repairProgress.counts) || repairProgress.counts.some(n => !Number.isInteger(n) || n < 0))) {
    throw new Error('Invalid short-book repair progress');
  }
  }
  if (d.rough_gate?.repair && (!plan || !Number.isInteger(d.rough_gate.repair.next) || d.rough_gate.repair.next < 0
    || d.rough_gate.repair.next > d.rough_gate.repair.issues.length
    || !readThesisReview({ ready: false, issues: d.rough_gate.repair.issues }, plan))) throw new Error('Invalid short-book repair queue');
  const proposalProgress=d.rough_gate?.repair?.plan_progress;
  if(proposalProgress&&(!Number.isInteger(proposalProgress.stalled)||proposalProgress.stalled<0||!Array.isArray(proposalProgress.resolved)||proposalProgress.resolved.some(index=>!Number.isInteger(index)||index<0||index>=d.rough_gate!.repair!.issues.length))) throw new Error('Invalid per-defect causal planning progress');
  const preparedRepair = d.rough_gate?.repair?.prepared;
  if (preparedRepair && (preparedRepair.next !== d.rough_gate!.repair!.next
    || !preparedRepair.account || ['timeline', 'evidence', 'knowledge', 'framing', 'protagonist_choice'].some(key => !text(preparedRepair.account[key])))) {
    throw new Error('Invalid approved causal repair account');
  }
  const order = preparedRepair?.order;
  if(order && (!Array.isArray(order.ids)||!order.ids.length||new Set(order.ids).size!==order.ids.length
    ||order.ids.some(id=>!plan?.theses.some(thesis=>thesis.id===id))||!Number.isInteger(order.next)||order.next<0||order.next>order.ids.length)) throw new Error('Invalid causal repair scene order');
  if (d.final_checks && Object.keys(d.final_checks).some(key => {
    const check = d.final_checks![key as keyof NonNullable<ThesisDraft['final_checks']>];
    return !check || typeof check.passed !== 'boolean' || !text(check.evidence);
  })) throw new Error('Invalid final continuity checks');
  if (d.seams && (!plan || !Number.isInteger(d.seams.next) || d.seams.next < 0 || d.seams.next > Math.max(0, plan.theses.length - 1)
    || !Array.isArray(d.seams.reviews) || d.seams.reviews.length !== d.seams.next
    || d.seams.reviews.some((r, i) => r.left !== plan.theses[i].id || r.right !== plan.theses[i + 1].id || !readThesisReview(r.review, plan)))) throw new Error('Invalid seam review progress');
  if (d.review_failures && (!Array.isArray(d.review_failures) || d.review_failures.some(f => !plan?.theses.some(t => t.id === f.thesis_id) || !text(f.phase) || !text(f.error)))) throw new Error('Invalid review failure history');
  if (d.deferred && (!Array.isArray(d.deferred) || d.deferred.some(item => !plan || !plan.theses.some(t => t.id === item.thesis_id)
    || !['rough', 'expand', 'polish', 'block'].includes(item.phase) || readThesisReview(item.review, plan).ready))) throw new Error('Invalid deferred thesis issues');
  const deferred = (id: string, phase?: string) => d.deferred?.some(item => item.thesis_id === id && (!phase || item.phase === phase));
  for (const version of d.manifestation?.versions || []) {
    const archived=!!version.plan;
    const sourcePlan=version.plan ? readThesisPlan(version.plan,{...input,target_total_words:version.plan.theses.reduce((sum,t)=>sum+t.target_words,0)}) : plan;
    if(!sourcePlan||!['rough','expand','polish','before-scene-design'].includes(version.phase)||!Array.isArray(version.blocks)
      ||(version.phase==='before-scene-design'?version.blocks.length>sourcePlan.theses.length:version.blocks.length!==sourcePlan.theses.length)
      ||version.blocks.some((block,index)=>block.thesis_id!==sourcePlan.theses[index]?.id||!text(block.text)||(!readThesisReview(block.review,sourcePlan).ready&&!archived&&!deferred(block.thesis_id,version.phase)))) throw new Error('Invalid manifestation version');
  }
  for (const round of d.rounds) {
    const p = readThesisPlan(round.plan, input);
    if (round.review) readThesisReview(round.review, p);
    if(round.repair_check&&(!Number.isInteger(round.repair_check.total)||round.repair_check.total<1||!Number.isInteger(round.repair_check.resolved)||round.repair_check.resolved<0||round.repair_check.resolved>round.repair_check.total)) throw new Error('Invalid plan-repair verification progress');
  }
  if (d.plan_ready && (!plan || !d.rounds.length || !d.rounds.at(-1)?.review
    || !readThesisReview(d.rounds.at(-1)!.review, plan).ready
    || stableJson(d.rounds.at(-1)!.plan) !== stableJson(plan))) throw new Error('The thesis plan has not passed its review.');
  if (d.blocks.length && !d.plan_ready && !d.budget_replan) throw new Error('Prose cannot precede approval of the whole thesis plan.');
  for (const [i, block] of d.blocks.entries()) {
    if (!plan || block.thesis_id !== plan.theses[i]?.id || !text(block.text) || (!readThesisReview(block.review, plan).ready && !deferred(block.thesis_id))) throw new Error('Invalid, unordered or unreviewed thesis block.');
  }
  if (d.pending !== null && (!d.pending || !plan || !d.plan_ready || d.pending.thesis_id !== plan.theses[d.blocks.length]?.id
    || !text(d.pending.text) || !Number.isInteger(d.pending.attempt) || d.pending.attempt < 0 || d.pending.attempt > 2)) throw new Error('Invalid pending thesis block.');
  if (d.pending?.review) readThesisReview(d.pending.review, plan!);
  if (d.completed !== (!!plan && d.blocks.length === plan.theses.length && (!d.manifestation || d.manifestation.phase === 'done')) || (d.completed && d.pending)) throw new Error('Thesis completion does not match accepted blocks.');
  return d;
}
/** A causal-plan refusal must be grounded in the new candidate, not old prose. */
export function readCausalPlanReview(raw:unknown,plan:ThesisPlan,source:string):ThesisReview {
  try {return readProseReview(raw,plan,source);}
  catch(error) {throw new Error('Invalid causal-plan review: cite only the supplied candidate plan/account, never the old manuscript. ' + String(error));}
}
export function thesisManuscript(draft: ThesisDraft): { chapter: number; text: string }[] {
  if (!draft.plan) return [];
  const chapters = new Map<number, string[]>();
  for (const block of draft.blocks) {
    const thesis = draft.plan.theses.find(t => t.id === block.thesis_id)!;
    const pieces = chapters.get(thesis.chapter) || [];
    pieces.push(block.text); chapters.set(thesis.chapter, pieces);
  }
  return [...chapters].map(([chapter, pieces]) => ({ chapter, text: pieces.join('\n\n') }));
}
export function previousThesisChapter(draft: ThesisDraft, chapter: number): string | undefined {
  if (draft.revision_before?.[String(chapter)] !== undefined) return draft.revision_before[String(chapter)];
  const ids = new Set(draft.plan?.theses.filter(thesis => thesis.chapter === chapter).map(thesis => thesis.id));
  const latest = [...(draft.edits || [])].reverse().find(history => history.edits.some(edit => ids.has(edit.block_id)));
  if (!latest) return undefined;
  const blocks = draft.blocks.filter(block => ids.has(block.thesis_id)).map(block => ({...block}));
  for (const edit of [...latest.edits].reverse()) {
    if (!ids.has(edit.block_id)) continue;
    const block = blocks.find(block => block.thesis_id === edit.block_id);
    if (!block || !edit.after || block.text.indexOf(edit.after) < 0 || block.text.indexOf(edit.after) !== block.text.lastIndexOf(edit.after)) return undefined;
    block.text = block.text.replace(edit.after, () => edit.before);
  }
  return blocks.map(block => block.text).join('\n\n');
}
/** The editable outline and its prose remain paired in the reviewable artifact. */
export function renderThesisBook(draft: ThesisDraft, chapter?: number, includeProse = true): string {
  if (!draft.plan) return draft.chapter_development?.chapters.length ?
    (draft.synopsis||'')+'\n\n'+draft.chapter_development.chapters.filter(ch=>chapter===undefined||ch.chapter===chapter).map(ch=>
      `## Chapter ${ch.chapter} · Development\n\n**Goal:** ${ch.goal}\n\n**Start:** ${ch.start}\n\n`+ch.steps.map(step=>`### ${step.id}\n\n${step.action}\n\n**Resistance:** ${step.resistance}\n\n**Consequence:** ${step.consequence}\n\n**Why needed:** ${step.necessity}`).join('\n\n')+`\n\n**Result:** ${ch.result}\n\n**Next:** ${ch.handoff}\n\n**Volume rationale:** ${ch.budget_rationale}`).join('\n\n---\n\n') : draft.synopsis || 'The thesis outline is being prepared.';
  const canonical = chapter === undefined && draft.plan.canon ? `## Canonical story truth\n\n${draft.plan.canon.resolution}\n\n` + draft.plan.canon.facts.map(fact=>`- **${fact.id} · ${fact.established_in}:** ${fact.truth} Knowledge: ${fact.knowledge.map(k=>`${k.character_id} in ${k.learned_in}`).join('; ') || 'not yet known to characters'}`).join('\n')+'\n\n' : '';
  return `# ${draft.plan.title}\n\n` + canonical + draft.plan.theses.filter(t => chapter === undefined || t.chapter === chapter).map(t => {
    const block = draft.blocks.find(b => b.thesis_id === t.id);
    const contract = blockContract(draft.plan!, t.id, draft.blocks);
    const pending = draft.pending?.thesis_id === t.id ? draft.pending : null;
    return `## Chapter ${t.chapter} · ${t.id}\n\n` +
      (draft.plan!.canon ? `**Canonical facts:** ${(t.fact_ids||[]).map(id=>{const fact=draft.plan!.canon!.facts.find(f=>f.id===id)!;return `${id}: ${fact.truth} (source ${fact.established_in})`;}).join('; ')}\n\n` : '') +
      `**Who:** ${t.participants.map(p => `${draft.plan!.characters.find(c => c.id === p.character_id)!.name}: ${p.intention}${p.does ? `; does: ${p.does}` : ''}; knows: ${p.knows.join('; ') || 'nothing relevant yet'}`).join(' | ')}\n\n` +
      `**Event owner:** ${contract.owner}; first here: ${contract.happens_here_first.action}\n\n**Earlier blocks already written:** ${contract.already_written.map(e => e.owner).join(', ') || 'none'}\n\n**Next block owns:** ${contract.handoff.next_owner || 'book ending'} — ${contract.handoff.reserved_action || 'no further event'}\n\n**When / where:** ${t.when} / ${t.where}\n\n**Before:** ${t.state_before}\n\n**Action:** ${t.action}\n\n**Why:** ${t.why}\n\n**Resistance:** ${t.resistance}\n\n**Outcome:** ${t.outcome}\n\n**Establishes:** ${t.establishes.join('; ')}\n\n**Reader learns:** ${t.reader_learns.join('; ')}\n\n**Depends on:** ${t.requires.join(', ') || 'Opening thesis'}\n\n**Target words:** ${t.target_words}\n\n**Writer task:** ${t.writer_task}\n\n` +
      (!includeProse ? '' : block ? `**${block.review.ready ? 'Accepted prose' : 'Draft with unresolved logic findings'}**\n\n${block.text}` : pending ? `**Draft awaiting acceptance**\n\n${pending.text}` : '*Not written yet.*');
  }).join('\n\n---\n\n');
}

export async function writeThesisBook(input: ProjectInput, store: ProjectStore, llm: NovelLLM,
  progress: (stage: 'design' | 'chapter' | 'audit' | 'done', chapter?: number) => void, habitMemory?: HabitMemory): Promise<void> {
  let draft = store.loadTheses() || { version: 1 as const, input_key: inputKey(input), plan: null, plan_ready: false, rounds: [], blocks: [], pending: null, completed: false };
  validateThesisDraft(draft, input);
  if (!store.loadTheses() && input.generation_mode === 'progressive') draft.manifestation = { phase: 'rough', next: 0, versions: [] };
  let trackedEdits = draft.edits?.length || 0;
  const save = (): void => {
    const newEdits = (draft.edits || []).slice(trackedEdits).flatMap(h => h.edits);
    if (newEdits.length && draft.plan) {
      draft.affected_blocks = [...new Set([...(draft.affected_blocks || []), ...affectedByEdits(draft.plan, draft.blocks, newEdits)])];
      const previous = store.loadTheses();
      if (previous?.plan) {
        const changedChapters = new Set(newEdits.map(edit => draft.plan!.theses.find(thesis => thesis.id === edit.block_id)?.chapter));
        for (const chapter of thesisManuscript(previous)) if (changedChapters.has(chapter.chapter)) {
          (draft.revision_before ||= {})[String(chapter.chapter)] = chapter.text;
        }
      }
    }
    trackedEdits = draft.edits?.length || 0;
    store.saveTheses(draft);
  };
  const repairPlanWithTools=async(base:ThesisPlan,task:string,stage:string,route:'writer'|'validator',focus:string[]=[])=>{
    const validate=(raw:unknown)=>{
      const candidate=allocateThesisWords(raw,input);
      if(!candidate.canon)throw new Error('Plan tools must retain the canonical fact ledger');
      if(stableJson(candidate.theses.map(t=>[t.id,t.chapter]))!==stableJson(base.theses.map(t=>[t.id,t.chapter])))throw new Error('Plan edits must preserve ordered scene IDs and chapter ownership');
      if(stableJson(candidate.characters.map(c=>c.id).sort())!==stableJson(base.characters.map(c=>c.id).sort()))throw new Error('Plan edits must preserve character IDs');
      return candidate;
    };
    const key=stage+':'+stableJson({base,task});
    const candidate=await planAgent(llm,base,task,system,{stage,route,key,validate,focus,session:draft.plan_tools,onRepairRead:()=>({report:draft.repair_reports?.at(-1)||null,verification_pending:true}),
      onCheckpoint:state=>{draft.plan_tools=state;save();},
      onTool:(command,result)=>store.log('thesis',`Plan tool: ${JSON.stringify(command)} → ${JSON.stringify(result).slice(0,1500)}`),
    });
    save();return candidate;
  };
  if (draft.manifestation?.phase === 'rough' && draft.rough_gate && !draft.rough_gate.repair) {
    // A user-requested resume gets a fresh progress window, retaining all work.
    delete draft.rough_gate.progress;
    draft.rough_gate.review = null;
  }
  if (draft.rough_gate?.repair?.prepared) delete draft.rough_gate.repair.prepared.progress;
  if(draft.rough_gate?.repair?.plan_progress) draft.rough_gate.repair.plan_progress.stalled=0;
  save();
  const manuscriptAgent = async (...args: Parameters<typeof runManuscriptAgent>): Promise<string> => {
    const [model, blocks, task, instructions, options] = args;
    const scope = options.stage + ':' + (options.sessionKey || '') + ':' + (options.writable?.join(',') || 'write-' + draft.blocks.length);
    const previous = draft.tool_session?.scope === scope ? draft.tool_session.state : undefined;
    if (previous) store.log('thesis', `Resuming ${options.stage} with saved tool history (${previous.history.length} entries).`);
    const result = await runManuscriptAgent(model, blocks, task, instructions, { onRepairRead:command=>{
      const staged=draft.rough_gate?.repair?.prepared;
      if(command.tool==='repair_status')return {report:draft.repair_reports?.at(-1)||null,staged:!!staged,verification_pending:!!staged&&!staged.verified_revision};
      if(!draft.plan || !staged?.candidate) return {staged:false};
      return packageDiff(draft.plan,staged.plan||draft.plan,draft.blocks,staged.candidate.blocks);
    }, onPlanRead:(command,current)=>{
      if(!draft.plan)throw new Error('No plan available yet');
      return command.tool==='read_plan'?readPlan(draft.plan,command.section,command.id,command.field):command.tool==='search_plan'?searchPlan(draft.plan,command.query,command.limit):command.tool==='fact_dependencies'?factDependencies(draft.plan,command.id,current,command.query):linkedPlan(draft.plan,command.id);
    }, ...options, session: previous,
      onCheckpoint: state => { draft.tool_session = { scope, state }; save(); options.onCheckpoint?.(state); },
      onTool: (command, result) => {
        if ((command as { tool?: string })?.tool === 'yield') store.log('thesis', `${options.stage}: tool budget reached; saved changes sent to independent review.`);
        options.onTool?.(command, result);
      },
    });
    if (!draft.tool_session?.state.exhausted) { delete draft.tool_session; save(); }
    return result;
  };
  const request = JSON.stringify(input);
  // The writer is told what it has already done before it writes, in this book and in
  // earlier ones by the same model: a move repaired afterwards comes back as its neighbour.
  const tracksHabits = input.planning_version === 2;
  if (tracksHabits && !draft.habits) { draft.habits = (habitMemory?.load() || []).map(habit => ({ ...habit, known: true })); save(); }
  const spentMoves = (): string => tracksHabits ? habitBrief(draft.blocks, draft.habits || []) : '';
  const standsAt = (id: string): string => trackedItems(draft.plan).length ? stateBrief(statesBefore(draft.plan!, draft.state_ledger || {}, id)) : '';
  // One short closed question per scene, asked again only when its text has changed.
  const withStates = async (thesis: Thesis, prose: string, review: ThesisReview): Promise<ThesisReview> => {
    if (!trackedItems(draft.plan).length) return review;
    const before = statesBefore(draft.plan!, draft.state_ledger || {}, thesis.id);
    const revision = sceneRevision(prose);
    let states = draft.state_ledger?.[thesis.id]?.revision === revision ? draft.state_ledger[thesis.id].states : undefined;
    if (!states) {
      try { states = await askStates(prose, thesis.id, before, system, llm); }
      catch (error) { if (!isResponseContractError(error)) throw error; store.log('thesis', `States not read for ${thesis.id}: ${error.message}`); return review; }
      draft.state_ledger = { ...(draft.state_ledger || {}), [thesis.id]: { revision, states } }; save();
    }
    const issues = stateIssues(before, states, thesis.id);
    return issues.length ? { ready: false, issues: [...review.issues, ...issues] } : review;
  };
  const noteHabits = async (scene: string): Promise<void> => {
    if (!tracksHabits) return;
    try { draft.habits = mergeHabits(draft.habits || [], await nameHabits(scene, draft.habits || [], system, llm)); }
    catch (error) { if (!isResponseContractError(error)) throw error; store.log('thesis', `Habits not named for this scene: ${error.message}`); }
    const confirmed = confirmedHabits(draft.blocks, draft.habits || []);
    if (habitMemory && confirmed.length) habitMemory.save(mergeHabits(habitMemory.load(), confirmed).slice(-40));
    save();
  };
  const checkProse = async (thesis: Thesis, prose: string, previous: string, phase: string): Promise<ThesisReview> => {
    const evidenceSource = prose + '\n\n' + previous;
    // A book whose plan names what to account for keeps the state ledger instead of the trace.
    const transitions=!!draft.plan!.canon&&!trackedItems(draft.plan).length;
    const sourceRevision=sceneRevision(evidenceSource+JSON.stringify(scenePlanContext(draft.plan!,thesis.id)));
    const saved=draft.review_candidate;
    try {
      const result=await structuredResponse(fillTemplate('THESIS_REVIEW', reviewRaw + '\nCheck relevant story quality obligations; in PLAN mode inspect their setup and payoff across theses:\n' + qualityInstructions(), {
        input: request, mode: phase === 'rough' ? 'ROUGH' : phase === 'seam' || phase === 'seam-final' ? 'SEAM' : 'BLOCK', plan: JSON.stringify(scenePlanContext(draft.plan!,thesis.id)),
        material: JSON.stringify({ thesis: thesis.id + ' (whole in the outline above)', event_contract: sceneContractContext(draft.plan!, thesis.id, draft.blocks, true), current_scene_addresses:[...proseEvidence(prose).references.keys()], supplied_prose: proseEvidence(evidenceSource).annotated }),
      }) + EVIDENCE_INSTRUCTIONS + (transitions?TRANSITION_INSTRUCTIONS:''), system, llm, ['ready', 'issues',...(transitions?['state_trace']:[])], async raw => {
        // The trace is a second instrument on the same call. When it cannot be read the
        // reviewer's own findings still stand: the scene is reviewed, without a trace.
        let located:any, checked:ReturnType<typeof readStateTrace>|undefined, traceError='';
        // No citation-locator call is spent on the trace: measured, it could not be grounded
        // for most scenes even then, and each attempt cost a call the size of the scene.
        const {state_trace:trace,...findings}=raw;
        located=await repairReviewEvidence(findings,evidenceSource,llm,system,`thesis-${phase}-review`,prose);
        const review=readProseReview(located,draft.plan!,evidenceSource);
        if(!transitions)return review;
        try {checked=readStateTrace({state_trace:trace},draft.plan!,evidenceSource,thesis.id,prose);}
          catch(error) {traceError=error instanceof Error?error.message:String(error);}
        if(!checked) {
          draft.review_failures=[...(draft.review_failures||[]),{thesis_id:thesis.id,phase:`${phase}-trace`,error:traceError}];
          store.log('thesis',`State trace unreadable for ${thesis.id} (${phase}); review kept without it: ${traceError}`);
          return review;
        }
        const issues=[...review.issues,...checked.issues];
        return {...review,ready:!issues.some(issue=>issue.severity==='major'),issues,state_trace:checked.trace};
      }, { stage: phase === 'rough' || phase === 'block' ? 'thesis-block-review' : `thesis-${phase}-review`, maxAttempts:4,
        initialResponse:saved?.thesis_id===thesis.id && saved.phase===phase && saved.source_revision===sourceRevision?saved.raw:undefined,
        onCandidate:(raw,error)=>{draft.review_candidate={thesis_id:thesis.id,phase,source_revision:sourceRevision,raw,error};save();},
        maxTokens: transitions?12288:8192, schema: transitions?transitionReviewSchema(draft.plan!.characters.map(c=>c.id),[...proseEvidence(evidenceSource).references.keys()]):proseReviewSchema });
      delete draft.review_candidate;save();return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isResponseContractError(error) && !/blocking prose issue|A thesis review must|Expected a complete JSON object|Ambiguous response: multiple JSON|cut off before its JSON|Invalid unavailable review|State transition|Invalid state transition|Posture transitions|Unverified review evidence/.test(message)) throw error;
      draft.review_failures = [...(draft.review_failures || []), { thesis_id: thesis.id, phase, error: message }];
      store.log('thesis', `Review unavailable for ${thesis.id} (${phase}): ${message}. Retrying against final prose before delivery.`);
      save();
      return { ready: false, status: 'unavailable', error: message, issues: [] };
    }
  };
  const recheckAffected = async (reviewedSeparately:string[]=[]): Promise<void> => {
    while (draft.affected_blocks?.length) {
      const id = draft.affected_blocks[0];
      const index = draft.blocks.findIndex(b => b.thesis_id === id);
      if (index >= 0 && !reviewedSeparately.includes(id)) {
        const t = draft.plan!.theses[index];
        const context = searchManuscript(draft.blocks.map(b => ({ id: b.thesis_id, text: b.text })), t.action + ' ' + t.state_before, 5);
        draft.blocks[index].review = await checkProse(t, draft.blocks[index].text,
          [...draft.blocks.slice(Math.max(0,index-1),index+2).filter(b=>b.thesis_id!==id).map(b=>`${b.thesis_id}:\n${b.text}`),...context.filter(r=>r.block_id!==id).map(r=>`${r.block_id}:\n${r.text}`)].join('\n\n'), 'impact');
        if (!draft.blocks[index].review.ready) draft.deferred = [...(draft.deferred || []), { thesis_id: id, phase: 'block', review: draft.blocks[index].review }];
      }
      draft.affected_blocks.shift(); save();
    }
  };
  const checkSeam = async (index: number, phase = 'seam'): Promise<ThesisReview> => {
    const left = draft.blocks[index], right = draft.blocks[index + 1];
    const boundary = `END OF ${left.thesis_id}:\n${left.text.slice(-4000)}\nSTART OF ${right.thesis_id}:\n${right.text.slice(0, 4000)}`;
    const earlier = searchManuscript(draft.blocks.slice(0, index + 1).map(b => ({ id: b.thesis_id, text: b.text })), draft.plan!.theses[index + 1].action + ' ' + draft.plan!.theses[index + 1].reader_learns.join(' '), 3);
    const context = earlier.map(r => r.block_id + ':\n' + r.text).join('\n\n');
    return checkProse(draft.plan!.theses[index + 1], boundary, context, phase);
  };
  const reviewSeams = async (): Promise<void> => {
    draft.seams ||= { next: 0, reviews: [] }; save();
    while (draft.seams.next < draft.blocks.length - 1) {
      const index = draft.seams.next;
      const left = draft.blocks[index].thesis_id, right = draft.blocks[index + 1].thesis_id;
      progress('chapter', draft.plan!.theses[index + 1].chapter);
      let review = await checkSeam(index);
      for (let repair = 0; !review.ready && review.status !== 'unavailable' && repair < 2; repair++) {
        await manuscriptAgent(llm, draft.blocks.map(b => ({ id: b.thesis_id, text: b.text })),
          `Author request: ${request}\nRepair the boundary between ${left} and ${right}. Adjacent theses: ${JSON.stringify(draft.plan!.theses.slice(index, index + 2))}\nEvent contracts: ${JSON.stringify(draft.plan!.theses.slice(index, index + 2).map(t => sceneContractContext(draft.plan!, t.id, draft.blocks)))}\nVerified boundary defects: ${findingsContext(review.issues)}\nRead the end of the left scene and beginning of the right scene. Use search to verify prior events and disclosures. Patch only the paragraphs needed to connect location, elapsed time, physical state, actions and already-disclosed information. Do not regenerate scenes, add new plot or restyle good prose. At most three patch batches, then finish.`, system,
          { stage: 'thesis-seam-repair', maxSteps: 12, writable: [left, right], onEdit: async (blocks, edits) => {
            draft.blocks = draft.blocks.map(b => ({ ...b, text: blocks.find(t => t.id === b.thesis_id)!.text }));
            draft.edits = [...(draft.edits || []), { at: new Date().toISOString(), phase: 'seam', edits }]; save();
          } });
        await recheckAffected();
        review = await checkSeam(index);
      }
      draft.seams.reviews.push({ left, right, review }); draft.seams.next++; save();
      store.log('thesis', `Boundary ${left} → ${right}: ${review.ready ? 'checked' : review.status === 'unavailable' ? 'review unavailable' : 'unresolved findings retained'}.`);
    }
  };
  // Asked once per outline: a reviewer told to break a plan always finds something, and
  // each finding it raises is then verified defect by defect like any other.
  const withPremiseChecks = async (plan: ThesisPlan, review: ThesisReview, first: boolean): Promise<ThesisReview> => {
    if (input.planning_version !== 2 || !first) return review;
    const issues = [...review.issues, ...deedGaps(plan), ...await premiseChecks(plan, request, system, llm)];
    store.log('thesis', `Premise checks: ${issues.length - review.issues.length} finding(s) on mechanism and premise coverage.`);
    return { ...review, ready: !issues.some(issue => issue.severity === 'major'), issues };
  };
  // A plan whose repair stopped converging is written anyway: no book is the worse outcome.
  // What stayed open is kept by name, shown to the final audit and listed in the report.
  const settlePlan = (review: ThesisReview, where: string): ThesisReview => {
    const open = review.issues.filter(issue => issue.severity === 'major');
    draft.carried_findings = [...(draft.carried_findings || []), ...open];
    store.log('thesis', `${where} did not converge; writing proceeds with ${open.length} plan finding(s) carried to the final report: ${open.map(issue => issue.problem).join(' | ').slice(0, 1500)}`);
    return { ready: true, issues: review.issues.map(issue => ({ ...issue, severity: 'minor' as const })) };
  };
  const planKeys = ['title', 'premise_givens', ...(input.planning_version===2?['canon']:[]), 'characters', 'theses', 'ending'];
  if (draft.manifestation && !draft.synopsis && !draft.plan) {
    progress('design');
    draft.synopsis = stripThinking(await llm(`Author request: ${request}\nWrite a very short synopsis including the ending and one skeletal event per chapter. This is the first coarse manifestation; no prose scenes yet.`, system, { route: 'validator', stage: 'thesis-synopsis', maxTokens: 4096 }));
    if (!draft.synopsis.trim()) throw new Error('Empty synopsis'); save();
  }
  if (!draft.plan) {
    progress('design');
    if(draft.manifestation) {
      draft.chapter_development ||= {chapters:[]};save();
      await developChapters(input,draft.synopsis||'',system,llm,draft.chapter_development,state=>{draft.chapter_development=state;save();});
      if(draft.chapter_development.unresolved)store.log('thesis',`Chapter development left ${draft.chapter_development.review?.issues.length||0} weakness(es) unrepaired; they go to the scene planner by name.`);
    }
    const plan = await structuredResponse(fillTemplate('THESIS_PLAN', planRaw + '\nStory quality obligations to embody in the existing thesis fields:\n' + qualityInstructions(), { input: request + '\nPer-chapter scene requirements: '+JSON.stringify(sceneRequirements(input)) + (draft.synopsis ? '\nCoarse synopsis to crystallize:\n' + draft.synopsis : '') + (draft.chapter_development ? '\nReviewed chapter development to divide into scenes:\n'+developmentContext(draft.chapter_development,input)+(draft.chapter_development.unresolved?'\nWeaknesses its review could not get repaired; resolve each in the scene outline instead of carrying it over: '+JSON.stringify(draft.chapter_development.review?.issues||[]):'')+'\nPreserve this consequential chain when assigning scene boundaries. The minimum scene count is a capacity floor, NOT the desired scene count. One scene may carry several connected steps; split when a new goal, confrontation, time or place requires it. Allocate the chapter target across the resulting scenes, not across invented padding.' : ''), chapters: String(input.chapter_count) }), system, llm, planKeys,
      raw => {const plan=allocateThesisWords(raw,input);if(input.planning_version===2&&!plan.canon) throw new Error('New plans require canon and scene fact_ids; return the canonical ledger, not a separate explanation.');return plan;}, { stage: 'thesis-plan', route: 'validator', schema: thesisPlanSchema, maxTokens: Math.max(12288, input.chapter_count * 1500), deliberate: true, temperature: 0.7, initialResponse:draft.response_candidate?.stage==='thesis-plan'?draft.response_candidate.raw:undefined, onCandidate:(raw,error)=>{draft.response_candidate={stage:'thesis-plan',raw,error};save();} });
    delete draft.response_candidate;
    draft = { ...draft, plan, rounds: [{ plan, review: null }] }; save();
  }
  // A long chapter needs multiple owned events before writing or expansion.
  // Legacy manuscripts are retained verbatim and rechecked against the new contracts.
  while(draft.manifestation && (sceneCoverage(draft.plan!,input).length || input.planning_version===2 && !draft.plan!.canon || draft.scene_design)) {
    const previousPlan=draft.plan!;
    // An outline with no prose under it that is only short of scenes is not written again
    // from nothing: the chapters that are short get their scenes, and what a review finds
    // is patched field by field in the planning loop below. Rewriting eighteen scenes to
    // add two cost a full outline of output on every attempt and on every refusal.
    const patchable=!draft.blocks.length && !!(draft.scene_design?.plan||previousPlan).canon;
    if(patchable) {
      draft.scene_design ||= {plan:previousPlan,attempts:1};
      if(draft.response_candidate?.stage==='thesis-scene-design') delete draft.response_candidate;
      save();
    } else if(!draft.scene_design || draft.scene_design.review && !draft.scene_design.review.ready) {
      progress('design');
      const plan=await structuredResponse(
        `Author request: ${request}\nExisting plan: ${JSON.stringify(previousPlan)}\nPrevious scene candidate and concrete rejection to repair: ${JSON.stringify(draft.scene_design||null)}\nExisting prose is retained, not regenerated: ${JSON.stringify(thesisManuscript(draft))}\nChapter scene requirements: ${JSON.stringify(sceneRequirements(input))}\nRedesign the scene outline to meet every chapter budget through enough distinct consequential events. Preserve the author premise and existing sound events; split overlarge theses into setup, choice, resistance and consequences with separate event ownership. Add necessary failed attempts or decisions rather than decorative padding. Canon is the sole true chronology, fact provenance, character knowledge and resolution; each fact needs a source thesis and each scene uses fact_ids. Hypotheses and deliberate lies must be distinguished from truth. Write the resolution only in ending; return canon with facts only, its stored resolution is derived by code. Return the complete plan with all requested chapters. Each scene budget must be at most 1100 words after chapter allocation.\n${planRaw}`,
        system,llm,planKeys,raw=>{
          const candidate=allocateThesisWords(raw,input);
          if(!candidate.canon) throw new Error('Scene redesign requires the canonical fact ledger and fact_ids, not an account beside the plan.');
          if(JSON.stringify(candidate.characters.map(c=>c.id).sort())!==JSON.stringify(previousPlan.characters.map(c=>c.id).sort())) throw new Error('Scene redesign must retain character IDs.');
          return candidate;
        },{stage:'thesis-scene-design',route:'validator',schema:thesisPlanSchema,maxTokens:Math.max(16384,input.chapter_count*4000),deliberate:true,initialResponse:draft.response_candidate?.stage==='thesis-scene-design'?draft.response_candidate.raw:undefined,onCandidate:(raw,error)=>{draft.response_candidate={stage:'thesis-scene-design',raw,error};save();}});
      delete draft.response_candidate;
      draft.scene_design={...draft.scene_design,plan,review:undefined,attempts:(draft.scene_design?.attempts||0)+1};save();
    }
    for(const requirement of sceneCoverage(draft.scene_design.plan,input)) {
      const previous=draft.scene_design.plan;
      const chapterScenes=previous.theses.filter(thesis=>thesis.chapter===requirement.chapter);
      const sceneSchema=structuredClone(thesisPlanSchema.properties.theses) as {minItems:number;[key:string]:unknown};
      sceneSchema.minItems=requirement.minimum_scenes;
      const updated=await structuredResponse(
        `Author request: ${request}\nCanonical plan: ${JSON.stringify(previous)}\nONLY chapter ${requirement.chapter} is underplanned: ${JSON.stringify(requirement)}\nReturn {theses:replacement scenes for this chapter only,canon:updated canonical ledger}. Retain every existing chapter scene ID in the same relative order, inserting new globally unique IDs for additional events. Keep all other chapter scenes and character IDs unchanged. Create at least ${requirement.minimum_scenes} independently actionable events: distinct attempts, choices, obstacles and consequences; no replay or padding. Update canonical source and knowledge references when redistributing events, retaining the same factual truth and resolution. Each new scene has all thesis fields and fact_ids. requires names only earlier globally ordered scenes. Budgets are relative weights; code assigns exactly ${requirement.target_words} words to this chapter.`,
        system,llm,['theses','canon'],raw=>{
          if(!Array.isArray(raw.theses)||raw.theses.some((t:Thesis)=>t.chapter!==requirement.chapter)) throw new Error('Return scenes for only the requested chapter.');
          const retained=raw.theses.filter((t:Thesis)=>chapterScenes.some(old=>old.id===t.id)).map((t:Thesis)=>t.id);
          if(JSON.stringify(retained)!==JSON.stringify(chapterScenes.map(t=>t.id))) throw new Error('Retain existing chapter scene IDs in relative order.');
          const first=previous.theses.findIndex(t=>t.chapter===requirement.chapter);
          const candidate=allocateThesisWords({...previous,canon:raw.canon,theses:[...previous.theses.slice(0,first),...raw.theses,...previous.theses.slice(first+chapterScenes.length)]},input);
          if(sceneCoverage(candidate,input).some(chapter=>chapter.chapter===requirement.chapter)) throw new Error('This chapter still lacks its required distinct events: '+JSON.stringify(requirement));
          return candidate;
        },{stage:'thesis-scene-coverage',route:'validator',schema:{type:'object',required:['theses','canon'],additionalProperties:false,properties:{theses:sceneSchema,canon:thesisPlanSchema.properties.canon}},maxTokens:Math.max(8192,requirement.minimum_scenes*2000),deliberate:true});
      draft.scene_design.plan=updated;delete draft.scene_design.review;save();
    }
    if(patchable) {
      const adopted=draft.scene_design.plan, open=draft.scene_design.review;
      draft.plan=adopted;draft.plan_ready=false;draft.rounds=[{plan:adopted,review:open&&!open.ready?open:null}];
      delete draft.scene_design;delete draft.planning_progress;save();
      store.log('thesis',`Outline has its scenes: ${adopted.theses.length}. Remaining findings are repaired by field edits, not by rewriting the outline.`);
      break;
    }
    const candidate=draft.scene_design.plan;
    const source=planEvidenceSource(candidate);
    let review=await withPremiseChecks(candidate,await structuredResponse(fillTemplate('THESIS_REVIEW',reviewRaw,{input:request,mode:'PLAN',plan:'Complete candidate supplied once in material with field-level evidence addresses.',material:proseEvidence(source).annotated})+
      '\nReview ONLY the new scene contracts and canonical truth. Verify all facts are executable in their source scenes and later consequences follow. Old prose awaits alignment. Every blocking finding needs an exact candidate quote or a supplied @P reference and consequence. The chapter targets are satisfied by substantive events, not multiple versions of the same event.',system,llm,['ready','issues'],raw=>readCausalPlanReview(raw,candidate,source),{stage:'thesis-scene-review',schema:proseReviewSchema,maxTokens:8192,deliberate:true}),draft.scene_design.attempts===1);
    const count=review.issues.filter(issue=>issue.severity==='major').length;
    if(draft.scene_design.previous_count!==undefined) draft.scene_design.stalled=count<draft.scene_design.previous_count?0:(draft.scene_design.stalled||0)+1;
    draft.scene_design.previous_count=count;draft.scene_design.review=review;save();
    if(!review.ready) {
      if((draft.scene_design.stalled||0)<2) continue;
      review=settlePlan(review,'Scene redesign');
    }
    const preserved=repartitionProse(previousPlan,candidate,draft.blocks);
    if(draft.blocks.length) {
      for(const chapter of thesisManuscript(draft)) (draft.revision_before||={})[String(chapter.chapter)]=chapter.text;
      draft.manifestation.versions=draft.manifestation.versions.map(version=>({...version,plan:structuredClone(previousPlan)}));
      draft.manifestation.versions.push({phase:'before-scene-design',plan:structuredClone(previousPlan),blocks:structuredClone(draft.blocks)});
    }
    draft.plan=candidate;draft.plan_ready=true;delete draft.budget_replan;draft.rounds.push({plan:candidate,review});
    draft.blocks=preserved;draft.pending=null;draft.completed=false;
    draft.deferred=preserved.map(block=>({thesis_id:block.thesis_id,phase:'rough',review:block.review}));
    draft.manifestation.phase='rough';draft.manifestation.next=0;
    delete draft.rough_gate;delete draft.tool_session;delete draft.review_failures;delete draft.seams;delete draft.final_checks;delete draft.final_repair;delete draft.affected_blocks;delete draft.scene_design;store.clearReport?.();save();
    store.log('thesis',`Scene plan accepted: ${candidate.theses.length} distinct events; existing prose preserved for causal alignment before expansion.`);
  }
  while (!draft.plan_ready) {
    progress('design');
    const last = draft.rounds.at(-1)!;
    let review = last.review;
    const previous=draft.rounds.at(-2);
    const originals=previous?.review?.issues.filter(issue=>issue.severity==='major')||[];
    if (!review) {
      let repairCheck: {resolved:number;total:number}|undefined;
      if(draft.plan!.canon && originals.length) {
        const source=planEvidenceSource(draft.plan!);
        const verdict=await structuredResponse(
          `Author request: ${request}\nCheck the repaired PLAN, not manuscript prose.\nCandidate plan:\n${proseEvidence(source).annotated}\nOriginal blocking defects: ${JSON.stringify(originals.map((issue,index)=>({issue:index,problem:issue.problem,thesis_ids:issue.thesis_ids,required_change:issue.required_change})))}\nVerify every original defect separately, and report any remaining or newly introduced major issue. checks must cover every zero-based issue index with status repaired, not_a_defect or unresolved, evidence from this candidate (@P0001 or exact quote), and explanation. Do not erase a defect to make the plan pass. No prose exists yet; judge scene contracts and canon. Return ready, checks, issues.`,
          system,llm,['ready','checks','issues'],async raw=>readRepairVerification(await repairReviewEvidence(raw,source,llm,system,'thesis-plan-review'),draft.plan!,source,originals.length),
          {stage:'thesis-plan-review',schema:repairVerificationSchema(originals.length,[...proseEvidence(source).references.keys()]),maxTokens:8192,deliberate:true});
        const unresolved=verdict.checks.filter(check=>check.status==='unresolved').map(check=>originals[check.issue]);
        const issues=[...verdict.issues];
        for(const issue of unresolved) if(!issues.some(existing=>existing.problem===issue.problem&&stableJson(existing.thesis_ids)===stableJson(issue.thesis_ids))) issues.push(issue);
        review={ready:verdict.accepted,issues};
        repairCheck={resolved:verdict.checks.filter(check=>check.status!=='unresolved').length,total:originals.length};
        store.log('thesis',`Automatic plan repair verified: ${repairCheck.resolved}/${repairCheck.total} original defects resolved.`);
      } else {
      review = await structuredResponse(fillTemplate('THESIS_REVIEW', reviewRaw + '\nCheck relevant story quality obligations; in PLAN mode inspect their setup and payoff across theses:\n' + qualityInstructions(), { input: request, mode: 'PLAN', plan: JSON.stringify(draft.plan), material: JSON.stringify({ note: 'All theses in the outline; no prose written yet. Check that adjacent actions and outcomes do not assign the same revelation/event twice. A later scene continues consequences, not the first occurrence. If reviewed chapter development is supplied, verify that its essential actions and consequences survive the scene outline; missing or replayed steps and insufficient material for the chapter volume require concrete corrections. Step count alone is not proof.', chapter_development:draft.chapter_development?.chapters, event_contracts: draft.plan!.theses.map(t => { const c=blockContract(draft.plan!,t.id,[]); return {owner:c.owner,happens_here_first:c.happens_here_first,continuing_disclosures:c.continuing_disclosures,handoff:c.handoff}; }) }) }), system, llm, ['ready', 'issues'], raw => readThesisReview(raw, draft.plan!),
        { stage: 'thesis-plan-review', schema: planReviewSchema(draft.plan!.theses.map(t=>t.id)), maxTokens: 8192, deliberate: true });
      review = await withPremiseChecks(draft.plan!, review, draft.rounds.length === 1);
      }
      draft = { ...draft, rounds: [...draft.rounds.slice(0, -1), { plan: draft.plan!, review, ...(repairCheck?{repair_check:repairCheck}:{}) }], plan_ready: review.ready }; save();
    }
    if (review.ready) { draft = { ...draft, plan_ready: true }; delete draft.budget_replan;delete draft.planning_progress;save();break; }
    const checked=draft.rounds.at(-1)!;
    if(previous?.review && draft.planning_progress?.last_round!==draft.rounds.length) {
      const changed=stableJson(checked.plan)!==stableJson(previous.plan);
      const improved=changed && (checked.repair_check?checked.repair_check.resolved>0:review.issues.filter(issue=>issue.severity==='major').length<originals.length);
      draft.planning_progress={stalled:improved?0:(draft.planning_progress?.stalled||0)+1,last_round:draft.rounds.length};save();
    }
    if((draft.planning_progress?.stalled||0)>=2) {
      const settled=settlePlan(review,'Plan repair');
      draft = { ...draft, rounds: [...draft.rounds.slice(0, -1), { ...draft.rounds.at(-1)!, review: settled }], plan_ready: true };
      delete draft.budget_replan;delete draft.planning_progress;save();break;
    }
    store.log('thesis','Automatically repairing the plan before writing. No user action is required.');
    const plan = draft.plan!.canon ? await repairPlanWithTools(draft.plan!,`Author request: ${request}\nBlocking defects to repair: ${findingsContext(review.issues)}\nFix these together through exact field transactions. Read the affected theses and linked canonical facts before patching. Preserve sound unrelated events and the requested ending.`, 'thesis-plan-repair','validator',review.issues.filter(issue=>issue.severity==='major').flatMap(issue=>issue.thesis_ids)) : await structuredResponse(fillTemplate('THESIS_REPAIR', repairRaw, { input: request, plan: JSON.stringify(draft.plan), issues: findingsContext(review.issues) }), system, llm, planKeys, raw => {
      const p = allocateThesisWords(raw, input);
      if(draft.plan!.canon&&!p.canon) throw new Error('Plan repair must retain and update canon.');
      if (JSON.stringify(p.theses.map(t => t.id)) !== JSON.stringify(draft.plan!.theses.map(t => t.id))) throw new Error('Plan repairs must retain ordered thesis IDs.');
      return p;
    }, { stage: 'thesis-plan-repair', schema: thesisPlanSchema, maxTokens: Math.max(12288, input.chapter_count * 1500), deliberate: true });
    delete draft.response_candidate;
    draft = { ...draft, plan, rounds: [...draft.rounds, { plan, review: null }] }; delete draft.plan_tools;save();
  }
  store.log('thesis', `Whole thesis plan accepted: ${draft.plan!.theses.length} blocks. Writing begins beneath the theses.`);
  while (draft.blocks.length < draft.plan!.theses.length) {
    const index = draft.blocks.length;
    const thesis = draft.plan!.theses[index];
    progress('chapter', thesis.chapter);
    const directory = draft.blocks.map(b => ({ id: b.thesis_id, text: b.text }));
    const previous = [draft.blocks.at(-1)?.text || '',...searchManuscript(directory, `${thesis.action} ${thesis.requires.join(' ')} ${thesis.participants.map(p => draft.plan!.characters.find(c => c.id === p.character_id)!.name).join(' ')}`).map(r=>`${r.block_id}:\n${r.text}`)].filter(Boolean).join('\n\n');
    if (!draft.pending || draft.pending.review && !draft.pending.review.ready && draft.pending.review.status !== 'unavailable' && draft.pending.attempt < 2) {
      const pending = draft.pending;
      const context = fillTemplate('THESIS_WRITE', writeRaw, { input: request,
        plan: JSON.stringify(scenePlanContext(draft.plan!,thesis.id)),
        thesis: JSON.stringify({ ...thesis, event_contract: sceneContractContext(draft.plan!, thesis.id, draft.blocks, true) }), neighbors: 'In the outline above: ' + draft.plan!.theses.slice(Math.max(0, index - 1), index + 2).filter(t => t.id !== thesis.id).map(t => t.id).join(', '), previous,
        repair: pending ? JSON.stringify(pending.review!.issues) : 'First attempt.' }) + spentMoves() + standsAt(thesis.id);
      let prose: string;
      if (pending) {
        await manuscriptAgent(llm, [...directory, { id: thesis.id, text: pending.text }], context + '\nRepair the current block using replace; finish with a brief completion note.', system,
          { stage: 'thesis-block-repair', writable: [thesis.id], onEdit: async (blocks, edits) => {
            draft = { ...draft, pending: { ...draft.pending!, text: blocks.find(b => b.id === thesis.id)!.text }, edits: [...(draft.edits || []), { at: new Date().toISOString(), phase: 'repair', edits }] }; save();
          } });
        prose = draft.pending!.text;
      } else if (draft.manifestation) {
        prose = await manuscriptAgent(llm, directory, context + (input.planning_version === 2 ? '\nWrite the scene in full, about ' + thesis.target_words + ' words: its action, resistance and outcome played out in the room, not summarized.' : '\nFirst manifestation: write a short scene of about ' + Math.max(60, Math.round(thesis.target_words * 0.25)) + ' words, covering the action and outcome.') + ' Return the scene in finish.text. Search or read earlier blocks when needed.', system, { stage: 'thesis-block-write' });
      } else {
        prose = stripThinking(await llm(context, system, { stage: 'thesis-block-write', route: 'writer', temperature: 0.8, maxTokens: Math.max(8192, Math.ceil(thesis.target_words * 2.8)) }));
      }
      if (!text(prose)) throw new Error(`Empty prose for thesis ${thesis.id}.`);
      draft = { ...draft, pending: { thesis_id: thesis.id, text: prose, attempt: pending ? pending.attempt + 1 : 0, review: null } }; save();
    }
    let review = draft.pending!.review;
    if (!review) {
      review = await withStates(thesis, draft.pending!.text, await checkProse(thesis, draft.pending!.text, previous, draft.manifestation?.phase === 'rough' ? 'rough' : 'block'));
      draft = { ...draft, pending: { ...draft.pending!, review } }; save();
    }
    if (!review.ready && review.status !== 'unavailable' && draft.pending!.attempt < 2) continue;
    if (!review.ready) {
      draft.deferred = [...(draft.deferred || []), { thesis_id: thesis.id, phase: draft.manifestation ? 'rough' : 'block', review }];
      store.log('thesis', `Deferred unresolved logic in ${thesis.id} after two repairs; retained for final assessment.`);
    }
    draft = { ...draft, blocks: [...draft.blocks, { thesis_id: thesis.id, text: draft.pending!.text, review }], pending: null, completed: !draft.manifestation && index + 1 === draft.plan!.theses.length }; save();
    await noteHabits(draft.blocks.at(-1)!.text);
    store.checkpoint(`thesis-${thesis.id}`);
    store.log('thesis', `Accepted ${thesis.id}, chapter ${thesis.chapter}: ${draft.blocks.at(-1)!.text.split(/\s+/).length} words.`);
  }
  const approveRoughPlan = async (raw: unknown, reason: string, commit = true, defects:ThesisReview['issues']=[]) => {
    const plan = allocateThesisWords(raw, input);
    if (JSON.stringify(plan.theses.map(t => [t.id, t.chapter])) !== JSON.stringify(draft.plan!.theses.map(t => [t.id, t.chapter]))) throw new Error('Plan correction must retain ordered thesis IDs and chapters');
    if (JSON.stringify(plan.characters.map(c => c.id).sort()) !== JSON.stringify(draft.plan!.characters.map(c => c.id).sort())) throw new Error('Plan correction must retain character IDs');
    if(draft.plan!.canon && !plan.canon) throw new Error('Causal correction must update the canonical fact ledger in the plan.');
    // Canonical explanatory accounts are derived copies of these same fields;
    // do not send a second full plan as prose evidence or expand its citations.
    const candidateSource = planEvidenceSource(plan) + (plan.canon ? '' : '\n\n' + (commit ? reason : JSON.stringify(JSON.parse(reason).account)));
    const perDefect = !commit && !!plan.canon && defects.length>0;
    const review = await structuredResponse(fillTemplate('THESIS_REVIEW', reviewRaw, {
      input:request,mode:'PLAN',plan:commit ? JSON.stringify(plan) : 'Complete candidate supplied once in material with field-level evidence addresses.',
      material:commit ? JSON.stringify({reason,actual_short_book:draft.blocks}) : proseEvidence(candidateSource).annotated,
    }) + (perDefect ? '\nOriginal defect decisions (not old-prose evidence): '+JSON.stringify(defects.map((issue,index)=>({issue:index,problem:issue.problem,required_change:issue.required_change})))+'\nAlso return checks covering every zero-based original defect: {issue,status:repaired|not_a_defect|unresolved,evidence:exact candidate quote or current @P,explanation}. Judge whether the new canonical plan resolves each defect. Do not quote the old defect as candidate evidence. ready requires all checks resolved and no major issue.' : '') + (commit ? '' : '\nYou are reviewing ONLY the candidate plan and causal account supplied here. No existing manuscript is supplied. Do not cite or infer its paragraphs. Check that every causal decision in the account is implemented in the actual thesis fields: setup, action, knowledge, observations, outcome and ending. An account-only explanation absent from the scene contracts is not a repair. Distinguish explicit author requirements from optional mechanisms invented in the old outline: those mechanisms can be changed or removed. For each major issue, quote exactly from the supplied candidate or use an existing @P address from THIS review, with kind and concrete consequence. Never quote a past manuscript or old review. Existing prose will be patched only after plan approval.'), system,llm,
      ['ready','issues',...(perDefect?['checks']:[])],async raw=>{
        if(!perDefect) return commit ? readThesisReview(raw,plan) : readCausalPlanReview(raw,plan,candidateSource);
        const verification=readRepairVerification(await repairReviewEvidence(raw,candidateSource,llm,system,'thesis-causal-review'),plan,candidateSource,defects.length);
        const unresolved=verification.checks.filter(check=>check.status==='unresolved').map(check=>({...defects[check.issue],evidence:check.evidence,problem:check.explanation}));
        return {ready:verification.accepted,issues:[...verification.issues,...unresolved],verification};
      },
      {stage:'thesis-causal-review',maxTokens:8192,deliberate:true,schema:commit?planReviewSchema(plan.theses.map(t=>t.id)):perDefect?repairVerificationSchema(defects.length,[...proseEvidence(candidateSource).references.keys()]):proseReviewSchema});
    if (!review.ready) return { accepted: false, issues: review.issues, plan, verification:('verification' in review ? review.verification as RepairVerification:undefined) };
    if (!commit) return {accepted:true, plan, review};
    draft.plan = plan; draft.rounds.push({ plan, review }); draft.affected_blocks = draft.blocks.map(b => b.thesis_id); save();
    if (!draft.rough_gate?.repair) await recheckAffected();
    return { accepted: true, plan };
  };
      const runRoughRepairs = async (): Promise<void> => {
        const queue = draft.rough_gate!.repair;
        if (!queue) return;
        while (queue.next < queue.issues.length) {
          const focus = queue.issues[queue.next];
          const related = queue.issues.slice(queue.next).filter(issue => issue.thesis_ids.some(id => focus.thesis_ids.includes(id)));
          // Repair the connected component together, including transitive links.
          const connected = new Set(related);
          let changed = true;
          while (changed) {
            changed = false;
            const ids = new Set([...connected].flatMap(issue => issue.thesis_ids));
            for (const issue of queue.issues.slice(queue.next)) if (!connected.has(issue) && issue.thesis_ids.some(id => ids.has(id))) {
              connected.add(issue); changed = true;
            }
          }
          const group = [...connected];
          if (queue.prepared?.next !== queue.next) {
            store.log('thesis', 'Reconciling the causal account before editing connected scenes.');
            const proposal = draft.plan!.canon ? await (async()=>{
              const base=draft.rough_gate!.causal_candidate?.plan||draft.plan!;
              const plan=await repairPlanWithTools(base,`Author request: ${request}\nConnected manuscript defects: ${findingsContext(group)}\nPrevious proposal rejection: ${findingsContext(draft.rough_gate!.reconciliation_feedback||[])}\nRepair the canonical plan before editing prose. Read source facts and connected theses. Choose one true chronology; distinguish observations, hypotheses and deliberate lies. Set up private knowledge and decisive access before use. Author requirements are binding; unsupported invented mechanisms and outcomes can be changed or removed. Implement setup, decisive choices and consequences in their owning scenes.`, 'thesis-rough-reconcile','writer',group.flatMap(issue=>issue.thesis_ids));
              return {plan,account:accountFromPlan(plan)};
            })() : await structuredResponse(
              `Author request: ${request}\nCurrent plan: ${JSON.stringify(draft.plan)}\nCurrent short book: ${JSON.stringify(draft.blocks)}\nLast proposed causal plan to refine (not yet committed): ${JSON.stringify(draft.rough_gate!.causal_candidate || null)}\nConnected defects: ${findingsContext(group)}\nPrevious causal proposal was rejected for: ${JSON.stringify(draft.rough_gate!.reconciliation_feedback || [])}\nCorrect those specific rejection reasons. Choose one true chronology, character intentions and causal account; distinguish observations, interpretations and character lies from narrative facts. For a mystery, settle what really happened; for other genres, resolve their own central conflict. Do not introduce crimes, accusations or investigative machinery absent from this story. Establish sources of private knowledge before use, set up any decisive access mechanism, and resolve the central conflict consistently with the author's requested ending.\nResolve these together BEFORE prose editing. The corrected plan must include canon {facts:[{id,truth,established_in,knowledge:[{character_id,learned_in}]}]} and each thesis fact_ids. Write the resolution only in ending; its stored canonical mirror is derived by code. This ledger is the sole story truth; account is explanatory notes derived from it. ${draft.plan!.canon ? 'Return {plan: complete corrected plan} only. Do not generate account; code derives the chronology, fact provenance, knowledge, stakes and choices from the canonical plan.' : 'Return {plan: complete corrected plan, account: {timeline, evidence, knowledge, framing, protagonist_choice}}. Each account field must be a concrete nonempty explanation of chronology, fact provenance, knowledge, stakes and consequential choices.'} Preserve ordered thesis IDs and chapters and character IDs. Update actions, state, revelations and ending consistently. Implement every causal decision in the actual scene contracts: put prerequisite observations and knowledge sources in earlier theses, decisive choices in their owning thesis, and the supported outcome in the final thesis. Before returning, ensure every causal decision is implemented in the scene fields; explanatory notes cannot replace scene actions. Explicit author requirements are binding; outcomes or mechanisms invented by the old plan can be replaced, including an unsupported punishment or accusation. Remove unsupported mechanisms rather than adding convenient explanations. Preserve the author premise. Professional help is allowed: the protagonist need not personally obtain every record.`,
              system, llm, draft.plan!.canon ? ['plan'] : ['plan', 'account'], raw => {
                if(draft.plan!.canon) {
                  const plan=allocateThesisWords(raw.plan,input);
                  if(!plan.canon) throw new Error('Canonical repair must retain the fact ledger.');
                  return {plan,account:accountFromPlan(plan)};
                }
                return { plan: raw.plan, account: readCausalAccount(raw.account) };
              }, {stage: 'thesis-rough-reconcile', route: 'writer', maxTokens: 16384, schema: draft.plan!.canon ? canonicalRepairSchema : causalRepairSchema});
            draft.rough_gate!.causal_candidate={plan:proposal.plan as ThesisPlan,account:proposal.account};delete draft.plan_tools;save();
            const decision = await approveRoughPlan(proposal.plan, JSON.stringify({account: proposal.account, 
              instruction: 'Evaluate the proposed causal account and revised plan together. Old prose is awaiting patches and conflicts with it are repair targets, not reasons to reject a coherent plan. Reject unresolved contradictions within the candidate or violations of the author premise. Professional assistance does not invalidate protagonist agency.'}), false, group);
            if (!decision.accepted) {
              draft.rough_gate!.reconciliation_feedback = decision.issues; draft.rough_gate!.causal_candidate = {plan:decision.plan,account:proposal.account}; save();
              store.log('thesis', 'Causal account rejected; no prose edits applied. Reasons retained for the next proposal: ' + JSON.stringify(decision.issues));
              if(decision.plan.canon && decision.verification) {
                const tracker=queue.plan_progress||={resolved:[],stalled:0};
                const resolved=decision.verification.checks.filter(check=>check.status!=='unresolved').map(check=>check.issue);
                const revision=JSON.stringify(decision.plan);
                const improved=resolved.some(id=>!tracker.resolved.includes(id)) && revision!==tracker.revision;
                tracker.stalled=improved?0:tracker.stalled+1;tracker.resolved=resolved;tracker.revision=revision;save();
                if(tracker.stalled>=2) throw new RepairStalled('Causal planning stopped: the same original defects remain unresolved after two proposals. No prose edits were applied; the canonical candidate and per-defect decisions are saved. '+JSON.stringify(decision.verification));
                continue; // Refine the same defects; do not rejudge unchanged prose.
              }
              break; // Legacy proposals without canonical verdicts retain their old progress window.
            }
            delete draft.rough_gate!.reconciliation_feedback; delete draft.rough_gate!.causal_candidate; delete queue.plan_progress;
            queue.prepared = {next: queue.next, account: proposal.account, plan: decision.plan, planReview: decision.review, base_revision:repairRevision(draft.plan!,draft.blocks.map(block=>({id:block.thesis_id,text:block.text}))), candidate: {blocks: draft.blocks.map(block => ({id:block.thesis_id,text:block.text})), edits:[]}}; save();
          }

          const verifyRepair = async (blocks: {id: string; text: string}[]) => {
            const prose = blocks.map(block => `${block.id}:\n${block.text}`).join('\n\n');
            const verification = await structuredResponse(
              `Approved plan: ${JSON.stringify(queue.prepared!.plan || draft.plan)}\nOriginal defects (zero-based issue indices): ${findingsContext(group)}\nCURRENT MANUSCRIPT:\n${proseEvidence(prose).annotated}\nVerify implementation, not the writer's completion claim. Search the supplied whole manuscript for ALL related assertions and contradictions, including other scenes. Return {ready, checks:[{issue,status,evidence,explanation}], issues:[standard prose review issues]}. Cover every original defect exactly once; status is repaired, not_a_defect or unresolved. Each verdict needs a paragraph reference and a concrete explanation of setup, consequence and why contradictory passages are gone or remain. not_a_defect requires demonstrated support, not dismissal. A character may deliberately lie as a trap: distinguish their claim from established scene facts and check whether the correction proves otherwise unavailable knowledge. Police help is allowed if the protagonist's choice materially changes the outcome. Do not impose stylistic or length preferences. List remaining/new concrete logical defects with exact evidence and consequence. ready is true only when no unresolved verdict or major defect remains.` + EVIDENCE_INSTRUCTIONS,
              system, llm, ['ready','checks','issues'], async raw => readRepairVerification(await repairReviewEvidence(raw,prose,llm,system,'thesis-rough-verify'), queue.prepared!.plan || draft.plan!, prose, group.length),
              {stage:'thesis-rough-verify', maxTokens:8192, deliberate:true, schema:repairVerificationSchema(group.length,[...proseEvidence(prose).references.keys()])});
            // A package is judged on two things: the defects it was sent to repair, and hard
            // contradictions in text it wrote. A reviewer rereading the book finds something
            // else every time; a finding quoted from text that stood before the repair is
            // older than the repair, and a doubt about how a demanded change reads is not a
            // contradiction. Neither returns a package that did its job.
            const standing = draft.blocks.map(block => block.text).join('\n\n');
            const HARD = ['contradiction', 'impossible_action', 'continuity', 'unsupported_knowledge', 'premature_disclosure', 'author_requirement'];
            const broughtIn = (issue: ThesisReview['issues'][number]) => issue.severity === 'major' && HARD.includes(issue.kind || '') && !!issue.evidence && !standing.includes(issue.evidence);
            const aside = verification.issues.filter(issue => issue.severity === 'major' && !broughtIn(issue));
            if (aside.length) {
              verification.issues = verification.issues.filter(issue => !aside.includes(issue));
              verification.accepted = verification.checks.every(check => check.status !== 'unresolved') && !verification.issues.some(issue => issue.severity === 'major');
              store.log('thesis', `Package review: ${aside.length} finding(s) older than this repair or not a contradiction; left for the next whole-book review.`);
            }
            if (verification.accepted) {
              const candidatePlan = queue.prepared!.plan || draft.plan!;
              const wholeReview = await structuredResponse(fillTemplate('THESIS_REVIEW', reviewRaw, {
                input:request,mode:'WHOLE_ROUGH',plan:JSON.stringify(candidatePlan),material:proseEvidence(prose).annotated,
              }) + '\nJudge the actual candidate book independently of the repair completion claim. Verify the true timeline, resource and access provenance, source of private knowledge, grounds for consequential character claims, timing of disclosures and the required ending. For a closed mystery, establish who performed the killing and how the evidence proves it. A deliberate false claim in a trap is not itself a contradiction: test whether the response demonstrates guilty knowledge rather than information available to an innocent person. Do not require final length or elaborate exposition. Require a concrete causal basis for consequential outcomes. Assistance from other characters is allowed when appropriate to this story.\n' + qualityInstructions() + EVIDENCE_INSTRUCTIONS,
                system,llm,['ready','issues'],raw=>readProseReview(raw,candidatePlan,prose),
                {stage:'thesis-rough-candidate-review',maxTokens:8192,deliberate:true,schema:proseReviewSchema});
              const affected = new Set(queue.prepared!.order?.ids || group.flatMap(issue=>issue.thesis_ids));
              const known=new Set(queue.issues.filter(issue=>issue.severity==='major').map(issueIdentity));
              const unresolved = wholeReview.issues.filter(issue=>broughtIn(issue) && (issue.thesis_ids.some(id=>affected.has(id)) || !known.has(issueIdentity(issue))));
              const duplicateIssues = duplicateParagraphs(blocks.map(block=>({thesis_id:block.id,text:block.text}))).map(duplicate=>({severity:'major' as const,thesis_ids:[...affected],problem:duplicate.description,required_change:'Remove repeated prose without replaying the event.'}));
              if (unresolved.length || duplicateIssues.length) {
                verification.accepted = false;
                verification.issues.push(...unresolved,...duplicateIssues);
              }
            }
            queue.prepared!.verification = verification;
            const candidatePlan=queue.prepared!.plan||draft.plan!;
            const report=repairReport(`rough-${draft.rough_gate!.attempts}-${queue.next}`,candidatePlan,blocks,group,verification,queue.issues);
            draft.repair_reports=[...(draft.repair_reports||[]),report].slice(-30);
            if(verification.accepted)queue.prepared!.verified_revision=report.revision;else delete queue.prepared!.verified_revision;
            store.log('repair_progress',JSON.stringify({package_id:report.package_id,status:report.status,resolved:report.resolved.length,remaining:report.remaining.length,introduced:report.introduced.length}));save();
            store.log('thesis', `Repair implementation check: ${verification.checks.filter(check => check.status !== 'unresolved').length}/${group.length} defects resolved; ${verification.accepted ? 'accepted' : 'returned to writer'}.`);
            return {accepted:verification.accepted, feedback:verification};
          };
          const prepared = queue.prepared!;
          prepared.base_revision ||= repairRevision(draft.plan!,draft.blocks.map(block=>({id:block.thesis_id,text:block.text})));
          const plan = prepared.plan || draft.plan!;
          prepared.candidate ||= {blocks:draft.blocks.map(block=>({id:block.thesis_id,text:block.text})),edits:[]};
          prepared.order ||= {ids:causalRepairOrder(draft.plan!,plan,group,draft.blocks),next:0}; save();
          while(prepared.order.next < prepared.order.ids.length) {
            const currentId = prepared.order.ids[prepared.order.next];
            const thesis = plan.theses.find(thesis=>thesis.id===currentId)!;
            progress('chapter',thesis.chapter);
            store.log('thesis', `Repairing setup → consequences: ${currentId}, scene ${prepared.order.next+1}/${prepared.order.ids.length}. Candidate edits await package verification.`);
            let finished=false;
            const beforeStep=JSON.stringify(prepared.candidate?.blocks);
            await manuscriptAgent(llm, prepared.candidate!.blocks,
              `Author request: ${request}\nApproved local plan and canon: ${JSON.stringify(scenePlanContext(plan,currentId))}\nConnected defects: ${findingsContext(group)}\nLatest package verification: ${findingsContext(prepared.verification || null)}\nRepair sequence (setup before actions, revelations and consequences): ${JSON.stringify(prepared.order.ids)}\nCURRENT SCENE ONLY: ${JSON.stringify(thesis)}\nEarlier repaired scenes: ${JSON.stringify(prepared.order.ids.slice(0,prepared.order.next))}\nRemaining scenes: ${JSON.stringify(prepared.order.ids.slice(prepared.order.next+1))}\nSearch and read the staged manuscript. Repair this scene to implement the approved causal account and thesis, using exact replacements only in ${currentId}. The plan canon is authoritative; the reconciliation account is explanatory notes, never a competing truth. Establish this scene's sources of knowledge, available objects, timing, motives and outcomes. Do not execute events owned by later scenes. Later steps will repair their consequences; do not force this scene to solve the whole book. Preserve unrelated good prose. Do not invent a new causal explanation, regenerate a chapter, expand for length or polish. Finish after this scene matches its revised thesis. Completion here only advances the patch cursor: the entire package is independently reviewed before any plan or prose is committed.`, system,
              {stage:'thesis-rough-repair',onPlanRead:command=>command.tool==='read_plan'?readPlan(plan,command.section,command.id,command.field):command.tool==='search_plan'?searchPlan(plan,command.query,command.limit):command.tool==='fact_dependencies'?factDependencies(plan,command.id,prepared.candidate!.blocks,command.query):linkedPlan(plan,command.id),sessionKey:`rough-${draft.rough_gate!.attempts}-${queue.next}-${currentId}`,maxSteps:12,writable:[currentId],
                onFinish:async()=>{finished=true;return {accepted:true};},
                onEdit:async(blocks,edits)=>{prepared.candidate!.blocks=blocks;prepared.candidate!.edits.push(...edits);delete prepared.verification;delete prepared.verified_revision;save();}});
            if(!finished) {
              prepared.order.stalled=beforeStep===JSON.stringify(prepared.candidate?.blocks)?(prepared.order.stalled||0)+1:0; save();
              if(prepared.order.stalled>=2) throw new RepairStalled(`Ordered repair stopped: ${currentId} made no text changes for two tool batches. The candidate and scene cursor are retained for resume.`);
              continue;
            }
            prepared.order.next++;prepared.order.stalled=0;save();
          }
          // All setup and payoff edits now exist together; review the package,
          // never require an unfinished earlier scene to resolve later defects.
          await verifyRepair(prepared.candidate!.blocks);
          if (!queue.prepared.verification?.accepted) {
            const prepared = queue.prepared;
            const verification = prepared.verification;
            if (prepared.candidate) draft.rough_gate!.last_candidate = {...prepared.candidate, verification};
            const report=draft.repair_reports!.at(-1)!;
            const remaining = Math.max(1,report.remaining.length+report.introduced.length);
            const tracker = prepared.progress ||= {best:group.length,stalled:0,counts:[group.length],last_revision:JSON.stringify(draft.blocks.map(block=>[block.thesis_id,block.text]))};
            const revision = JSON.stringify(prepared.candidate?.blocks.map(block=>[block.id,block.text]));
            const resolved=verification?.checks.filter(check=>check.status!=='unresolved').map(check=>check.issue)||[];
            const improved = revision !== tracker.last_revision && remaining < tracker.best;
            tracker.resolved=[...new Set([...(tracker.resolved||[]),...resolved])];
            tracker.stalled = improved ? 0 : tracker.stalled + 1;
            if (improved) tracker.best = remaining;
            tracker.last_revision = revision; tracker.counts.push(remaining); save();
            store.log('thesis', `Candidate repair progress: ${tracker.counts.join(' → ')}; continuing saved candidate with the approved causal account.`);
            if (tracker.stalled >= 2) throw new RepairStalled('Automatic repair stopped: saved candidate made no verified progress for two consecutive patch batches (' + tracker.counts.join(' → ') + '). Candidate plan, edits and verification are retained for resume. Remaining defects: ' + JSON.stringify(verification));
            prepared.order!.ids=causalRepairOrder(draft.plan!,plan,[...group,...(verification?.issues||[])],draft.blocks);
            prepared.order!.next=0; save();
            continue;
          }
          const candidate = queue.prepared!.candidate!;
          const committed=commitRepairPackage(draft,queue.prepared!.plan||draft.plan!,candidate.blocks,candidate.edits,queue.prepared!.verification!,
            queue.prepared!.base_revision!,queue.prepared!.verified_revision!,raw=>allocateThesisWords(raw,input));
          // Keep the active queue reference: it owns the cursor advanced below.
          committed.rough_gate!.repair=queue;
          committed.rounds.push({plan:committed.plan!,review:queue.prepared!.planReview||null});
          // The package was just verified against the whole manuscript. Only the scenes it
          // edited carry a review of text that no longer exists.
          committed.affected_blocks=[...new Set(candidate.edits.map(edit=>edit.block_id))].filter(id=>committed.blocks.some(block=>block.thesis_id===id));
          if(committed.repair_reports?.length)committed.repair_reports.at(-1)!.status='committed';
          delete committed.rough_gate!.last_candidate;
          draft=committed;save();
          // Move processed connected findings out of the remaining queue.
          queue.issues = [...queue.issues.slice(0, queue.next), ...group,
            ...queue.issues.slice(queue.next).filter(issue => !connected.has(issue))];
          queue.next += group.length; delete queue.prepared; save();
        }
        delete draft.rough_gate!.repair; draft.rough_gate!.review = null; save();
      };
  // A repair that does not converge does not end the book. Its uncommitted candidate is
  // dropped, the accepted plan and prose stand, and the findings travel with their scenes:
  // the next pass is handed them as corrections and the final audit still reports them.
  const carryForward = (error: RepairStalled, phase: 'rough' | 'expand' | 'polish'): void => {
    const gate = draft.rough_gate;
    const issues = (gate?.repair ? gate.repair.issues.slice(gate.repair.next) : gate?.review?.issues || []).filter(issue => issue.severity === 'major');
    draft.deferred = [...(draft.deferred || []), ...issues.flatMap(issue => issue.thesis_ids.map(id => ({ thesis_id: id, phase, review: { ready: false, issues: [issue] } })))];
    draft.carried_findings = [...(draft.carried_findings || []), ...issues];
    if (gate) { delete gate.repair; delete gate.causal_candidate; }
    delete draft.plan_tools; delete draft.tool_session;
    store.log('thesis', `Whole-book repair did not converge (${phase}); continuing with ${issues.length} finding(s) carried to their scenes. ${error.message.slice(0, 600)}`);
    save();
  };
  if (draft.manifestation) {
    if (draft.manifestation.phase === 'rough') {
      draft.rough_gate ||= { attempts: 0, review: null }; save();
      try { while (!draft.rough_gate.review?.ready) {
        await runRoughRepairs();
        await recheckAffected();
        const prose = draft.blocks.map(b => `${b.thesis_id}:\n${b.text}`).join('\n\n');
        const review = await structuredResponse(fillTemplate('THESIS_REVIEW', reviewRaw, {
          input: request, mode: 'WHOLE_ROUGH', plan: JSON.stringify(draft.plan), material: proseEvidence(prose).annotated,
        }) + '\nFor each consequential transition compare the actual before state, action, after state and downstream consequence. Identify who learned what from which scene before acting. Compare concrete times and locations; an intended plan outcome is not evidence it happened. Inspect the complete short book: evidence chain and actual resolution, protagonist choices, setup/payoff, character consistency, consequences and scene continuity. Terseness is expected: do not require final length, polished dialogue or descriptions. Each major issue needs an exact prose quote and consequence.\n' + qualityInstructions() + EVIDENCE_INSTRUCTIONS, system, llm,
          ['ready', 'issues'], raw => readProseReview(raw, draft.plan!, prose), { stage: 'thesis-rough-review', maxTokens: 8192, deliberate: true, schema: proseReviewSchema });
        const duplicates = duplicateParagraphs(draft.blocks);
        if (duplicates.length) {
          review.ready = false;
          review.issues.push(...duplicates.map(d => ({ severity: 'major' as const, thesis_ids: draft.blocks.map(b => b.thesis_id), problem: d.description, required_change: 'Remove the replay while preserving the first event and its consequences.' })));
        }
        draft.rough_gate.review = review; save();
        if (review.ready) break;
        const count = review.issues.filter(i => i.severity === 'major').length;
        const tracker = draft.rough_gate.progress ||= { best: count, stalled: 0, counts: [] };
        let fingerprint = 2166136261;
        const currentVersion = JSON.stringify({plan:draft.plan,blocks:draft.blocks.map(block=>[block.thesis_id,block.text])});
        for (let index=0;index<currentVersion.length;index++) fingerprint = Math.imul(fingerprint ^ currentVersion.charCodeAt(index),16777619);
        const revision = (fingerprint >>> 0).toString(16);
        if (tracker.counts.length) {
          // Progress is fewer blocking findings on changed text. For a canonical book any changed
          // text used to count, which left the gate no end but the call budget.
          const improved = tracker.last_revision !== revision && count < tracker.best;
          tracker.stalled = improved ? 0 : tracker.stalled + 1;
          if (improved) tracker.best = count;
        }
        tracker.last_revision = revision;
        tracker.counts.push(count); save();
        store.log('thesis', `Short-book repair progress: ${tracker.counts.join(' → ')} blocking findings; ${tracker.stalled} round(s) without verified progress.`);
        if (tracker.stalled >= 2) throw new RepairStalled('Automatic repair stopped: no reduction from verified changes to the accepted manuscript for two consecutive repair rounds (' + tracker.counts.join(' → ') + '). Saved plan and edits are retained. ' + (draft.rough_gate.reconciliation_feedback?.length ? 'Causal plan approval failed before prose editing. Rejection reasons: ' + draft.rough_gate.reconciliation_feedback.map(issue => issue.problem + ' Required correction: ' + issue.required_change).join('; ') : 'Remaining defects: ' + review.issues.filter(i => i.severity === 'major').map(i => i.problem).join('; ')));
        draft.rough_gate.attempts++; save();
        draft.rough_gate.repair = { issues: review.issues.filter(i => i.severity === 'major'), next: 0 }; save();
        await runRoughRepairs();
        draft.rough_gate.review = null; save();
      } } catch (error) { if (!(error instanceof RepairStalled)) throw error; carryForward(error, 'rough'); }
      draft.manifestation = { phase: 'expand', next: 0, versions: [...draft.manifestation.versions,{ phase: 'rough', blocks: structuredClone(draft.blocks) }] }; save();
    }
    // Counted by code over the whole manuscript, handed to the polisher as exact strings.
    const measuredText = (id: string): string => {
      const measured = textFindings(draft.blocks, draft.habits).filter(finding => finding.thesis_ids.includes(id));
      return measured.length ? '\nMeasured by code across the whole manuscript, concerning this block: ' + JSON.stringify(measured.map(finding => finding.description)) : '';
    };
    while (draft.manifestation.phase !== 'done') {
      const phase = draft.manifestation.phase;
      for (let i = draft.manifestation.next; i < draft.blocks.length; i++) {
        let thesis = draft.plan!.theses[i]; progress('chapter', thesis.chapter);
        // The same finding is deferred again by each later review of the scene; it is one correction.
        let review: ThesisReview = { ready: false, issues: [...new Map((draft.deferred?.filter(d => d.thesis_id === thesis.id).flatMap(d => d.review.issues) || []).map(issue => [issue.problem, issue])).values()] };
        let stalled=0;
        // A scene already written to length with nothing to correct is not expanded: the
        // first writing is the full scene, and a second pass over it is a second payment.
        if (input.planning_version === 2 && phase === 'expand' && !review.issues.length && draft.blocks[i].review.status !== 'unavailable' && wordBudget(draft.blocks[i].text, thesis.target_words).ready) {
          draft.manifestation.next = i + 1; save(); continue;
        }
        for (let repair = 0; ; repair++) {
        const beforeWords=wordBudget(draft.blocks[i].text,thesis.target_words).words;
        await manuscriptAgent(llm, draft.blocks.map(b => ({ id: b.thesis_id, text: b.text })),
          `Author request: ${request}\nPhase: ${phase}. Current thesis: ${JSON.stringify(thesis)}\nEvent ownership and handoff: ${JSON.stringify(sceneContractContext(draft.plan!, thesis.id, draft.blocks))}\nCharacters: ${JSON.stringify(scenePlanContext(draft.plan!,thesis.id).characters)}\nNeighboring theses: ${JSON.stringify(draft.plan!.theses.slice(Math.max(0, i - 1), i + 2))}\n${phase === 'expand' ? 'Expand this short scene with concrete action, dialogue and necessary description toward its target_words.' : 'Repair verifiable contradictions, missing essential causal steps and repetitive imagery or repeated explanations of feelings. Before editing, use search for distinctive phrases and images from the current scene across the whole manuscript; read the matches. Keep the strongest purposeful occurrence; shorten or remove redundant instances in the current block. Do not remove deliberate motifs, necessary reminders or a new emotional development. Do not add atmosphere or restyle sound sentences. At most three patch batches, then finish.' + measuredText(thesis.id)}\nRequired corrections from the previous check: ${findingsContext(review.issues)}. Use search and read to inspect related text. Make exact replacements only in the current block. If a causal defect is in the thesis itself, propose a complete corrected thesis with revise_thesis before editing the prose; otherwise respect the required outcome. Measured length: ${JSON.stringify(wordBudget(draft.blocks[i].text, thesis.target_words))}. Aim for target_words; completion requires at least 90% of that target, measured by code. Expand through substantive action and dialogue, never filler. Finish when the task and word budget are satisfied.${spentMoves()}${standsAt(thesis.id)}`, system,
          { stage: `thesis-${phase}`, maxSteps: phase === 'polish' ? 12 : 24, requireSearch: phase === 'polish', writable: [thesis.id], onFinish: async blocks => {
            const budget = wordBudget(blocks.find(block => block.id === thesis.id)!.text, thesis.target_words);
            return { accepted: budget.ready, feedback: { ...budget, instruction: 'The scene is below its word budget. Add substantive action, investigation steps, dialogue and consequences belonging to this thesis through exact insertions. Preserve later events; do not add repetitive padding. Do not finish yet.' } };
          }, onThesis: async (raw, reason) => {
            const candidate = raw as Thesis;
            if (candidate?.id !== thesis.id || candidate.chapter !== thesis.chapter) throw new Error('A causal correction must retain the current thesis ID and chapter');
            const plan = allocateThesisWords({ ...draft.plan!, theses: draft.plan!.theses.map(t => t.id === thesis.id ? candidate : t) }, input);
            const linked = draft.plan!.theses.filter(t => t.id === thesis.id || t.requires.includes(thesis.id) || thesis.requires.includes(t.id) || candidate.requires.includes(t.id)).map(t => t.id);
            const review = await structuredResponse(fillTemplate('THESIS_REVIEW', reviewRaw + '\nCheck relevant story quality obligations; in PLAN mode inspect their setup and payoff across theses:\n' + qualityInstructions(), { input: request, mode: 'PLAN', plan: JSON.stringify(plan), material: JSON.stringify({ reason, changed_thesis: thesis.id, affected_prose: searchManuscript(draft.blocks.filter(b => linked.includes(b.thesis_id)).map(b => ({ id: b.thesis_id, text: b.text })), candidate.action + ' ' + candidate.why + ' ' + candidate.outcome), note: 'Check the proposed causal correction and identify consequences in linked existing prose. Those blocks will also be reviewed in the polishing pass.' }) }), system, llm, ['ready', 'issues'], value => readThesisReview(value, plan), { stage: 'thesis-causal-review', schema: planReviewSchema(plan.theses.map(t=>t.id)), deliberate: true });
            if (!review.ready) throw new Error(`Causal proposal rejected: ${findingsContext(review.issues)}`);
            const earliest = draft.plan!.theses.findIndex(t => linked.includes(t.id));
            if (phase === 'polish' && earliest < i) {
              draft.manifestation!.recheck_from = Math.min(draft.manifestation!.recheck_from ?? i, earliest);
            }
            draft.plan = plan; draft.rounds.push({ plan: structuredClone(plan), review }); thesis = plan.theses.find(t => t.id === candidate.id)!; save();
            return { accepted: true, thesis, affected_blocks: linked };
          }, onEdit: async (blocks, edits) => {
            draft.blocks = draft.blocks.map(b => ({ ...b, text: blocks.find(t => t.id === b.thesis_id)!.text }));
            draft.edits = [...(draft.edits || []), { at: new Date().toISOString(), phase, edits }]; save();
          } });
        await recheckAffected([thesis.id]);
        const related = searchManuscript(draft.blocks.map(b => ({ id: b.thesis_id, text: b.text })), thesis.action + ' ' + thesis.outcome);
        review = await withStates(thesis, draft.blocks[i].text, await checkProse(thesis, draft.blocks[i].text, related.map(r => r.text).join('\n'), phase));
        const actual = wordBudget(draft.blocks[i].text, thesis.target_words);
        store.log('thesis', `${thesis.id} ${phase}: ${actual.words}/${actual.target} words (minimum ${actual.minimum}).`);
        if ((review.ready || review.status === 'unavailable') && actual.ready) break;
        // Local logic is reconciled across the whole book; length progress is measurable here.
        if(actual.ready) break;
        stalled=actual.words>beforeWords?0:stalled+1;
        if(stalled>=2) break;
        }
        const actual = wordBudget(draft.blocks[i].text, thesis.target_words);
        if (!actual.ready) {
          save();
          throw new Error(`Chapter ${thesis.chapter}, ${thesis.id}: ${actual.words}/${actual.target} words; minimum ${actual.minimum}. Automatic expansion did not reach the requested length after two consecutive passes without measured length progress. Saved edits are retained.`);
        }
        if (!review.ready) {
          draft.deferred = [...(draft.deferred || []), { thesis_id: thesis.id, phase, review }];
          store.log('thesis', `Deferred unresolved ${phase} logic in ${thesis.id} for whole-book causal repair; continuing other blocks.`);
        }
        draft.blocks[i].review = review;
        if (phase === 'expand') await noteHabits(draft.blocks[i].text);
        if (draft.manifestation.recheck_from !== undefined) {
          const restart = draft.manifestation.recheck_from;
          delete draft.manifestation.recheck_from; draft.manifestation.causal_restarts = (draft.manifestation.causal_restarts || 0) + 1;
          draft.manifestation.next = restart; i = restart - 1;
        } else draft.manifestation.next = i + 1;
        save();
      }
      await recheckAffected();
      if (phase === 'expand') await reviewSeams();
      if(draft.plan!.canon) {
        const prose=draft.blocks.map(block=>`${block.thesis_id}:\n${block.text}`).join('\n\n');
        const review=await structuredResponse(fillTemplate('THESIS_REVIEW',reviewRaw,{input:request,mode:'WHOLE_ROUGH',plan:JSON.stringify(draft.plan),material:proseEvidence(prose).annotated})+EVIDENCE_INSTRUCTIONS,system,llm,['ready','issues'],raw=>readProseReview(raw,draft.plan!,prose),{stage:'thesis-expanded-causal-review',schema:proseReviewSchema,maxTokens:8192,deliberate:true});
        const defects=review.issues.filter(issue=>issue.severity==='major');
        if(defects.length) {
          draft.rough_gate={attempts:0,review,repair:{issues:defects,next:0}};save();
          try {await runRoughRepairs();} catch(error) {if(!(error instanceof RepairStalled))throw error;carryForward(error,phase==='expand'?'expand':'polish');}
          await recheckAffected();
        }
      }
      draft.manifestation.versions.push({ phase, blocks: structuredClone(draft.blocks) });
      draft.manifestation.phase = phase === 'expand' ? 'polish' : 'done'; draft.manifestation.next = 0;
      draft.completed = draft.manifestation.phase === 'done'; save(); store.checkpoint(`thesis-${phase}`);
    }
  }
  while (!store.loadReport()) {
    progress('audit');
    await recheckAffected();
    if (draft.final_repair?.phase === 'write' && draft.plan!.canon) {
      const prose=draft.blocks.map(block=>`${block.thesis_id}:\n${block.text}`).join('\n\n');
      const review=await structuredResponse(fillTemplate('THESIS_REVIEW',reviewRaw,{input:request,mode:'WHOLE_ROUGH',plan:JSON.stringify(draft.plan),material:proseEvidence(prose).annotated})+'\nLocate the logical defects raised by the audit: '+JSON.stringify(draft.final_repair.findings)+EVIDENCE_INSTRUCTIONS,system,llm,['ready','issues'],raw=>readProseReview(raw,draft.plan!,prose),{stage:'thesis-audit-causal-review',schema:proseReviewSchema,maxTokens:8192,deliberate:true});
      const defects=review.issues.filter(issue=>issue.severity==='major');
      if(defects.length) {
        draft.rough_gate={attempts:0,review,repair:{issues:defects,next:0}};save();
        try {await runRoughRepairs();} catch(error) {if(!(error instanceof RepairStalled))throw error;carryForward(error,'polish');}
        draft.final_repair.changed=draft.blocks.map(block=>block.thesis_id);
        draft.final_repair.phase='recheck';save();
      }
    }
    if (draft.final_repair?.phase === 'write') {
      await manuscriptAgent(llm, draft.blocks.map(b => ({ id: b.thesis_id, text: b.text })),
        `Author request: ${request}\nCanonical plan directory (read_plan retrieves the sole truth; do not invent new mechanisms): ${JSON.stringify(planDirectory(draft.plan!))}\nFinal audit corrections: ${JSON.stringify(draft.final_repair.findings)}\nEvent ownership directory: ${JSON.stringify(draft.plan!.theses.map(t => { const c = blockContract(draft.plan!, t.id, draft.blocks); return { owner: c.owner, happens_here_first: c.happens_here_first, continuing_disclosures: c.continuing_disclosures, handoff: c.handoff }; }))}\nFind the affected passages with search and read, then make exact local replacements. Resolve every evidenced major defect identified in the audit, including missing investigation steps, unsupported resolution, character drift, passive choices and unearned reversals. Use the affected theses as the intended events; introduce only actions needed to make those events convincing. Repair local language and exposition by replacement or deletion. Preserve an honest moral conflict and the consequences of injuries. Preserve the intended events and good prose; do not regenerate scenes or add padding. A checker failure is not a manuscript defect: do not invent edits just to eliminate an unavailable-review warning. At most three patch batches, then finish.`, system,
        { stage: 'thesis-audit-repair', requireSearch: true, maxSteps: 24, writable: draft.blocks.map(b => b.thesis_id), onEdit: async (blocks, edits) => {
          draft.blocks = draft.blocks.map(b => ({ ...b, text: blocks.find(t => t.id === b.thesis_id)!.text }));
          draft.final_repair!.changed = [...new Set([...draft.final_repair!.changed, ...edits.map(e => e.block_id)])];
          draft.edits = [...(draft.edits || []), { at: new Date().toISOString(), phase: 'audit-repair', edits }]; save();
        } });
      await recheckAffected();
      draft.final_repair.phase = 'recheck'; save();
    }
    if (draft.final_repair?.phase === 'recheck') {
      for (let i = 0; i < draft.blocks.length; i++) {
        if (!draft.final_repair.changed.includes(draft.blocks[i].thesis_id)) continue;
        const thesis = draft.plan!.theses[i];
        await recheckAffected([thesis.id]);
        const related = searchManuscript(draft.blocks.map(b => ({ id: b.thesis_id, text: b.text })), thesis.action + ' ' + thesis.outcome);
        draft.blocks[i].review = await checkProse(thesis, draft.blocks[i].text, related.map(r => r.text).join('\n'), 'final-recheck');
        if (!draft.blocks[i].review.ready) draft.deferred = [...(draft.deferred || []), { thesis_id: thesis.id, phase: 'polish', review: draft.blocks[i].review }];
        save();
      }
      for (let i = 0; i < (draft.seams?.reviews.length || 0); i++) {
        const seam = draft.seams!.reviews[i];
        if (!draft.final_repair.changed.some(id => id === seam.left || id === seam.right)) continue;
        seam.review = await checkSeam(i, 'seam-final'); save();
      }
      draft.final_repair.phase = 'idle'; save();
    }
    if (draft.manifestation && !draft.seams) await reviewSeams();
    for (let i = 0; i < (draft.seams?.reviews.length || 0); i++) {
      if (draft.seams!.reviews[i].review.ready) continue;
      draft.seams!.reviews[i].review = await checkSeam(i, 'seam-final'); save();
    }
    for (let i = 0; i < draft.blocks.length; i++) {
      if (draft.blocks[i].review.status !== 'unavailable') continue;
      const thesis = draft.plan!.theses[i];
      const related = searchManuscript(draft.blocks.map(b => ({ id: b.thesis_id, text: b.text })), thesis.action + ' ' + thesis.outcome);
      draft.blocks[i].review = await checkProse(thesis, draft.blocks[i].text, related.map(r => r.text).join('\n'), 'final-recheck');
      if (!draft.blocks[i].review.ready) draft.deferred = [...(draft.deferred || []), { thesis_id: thesis.id, phase: 'polish', review: draft.blocks[i].review }];
      save();
    }
    const manuscript = thesisManuscript(draft).map(c => `CHAPTER ${c.chapter}\n${c.text}`).join('\n\n');
    const seamFindings = (draft.seams?.reviews || []).flatMap(r => r.review.status === 'unavailable'
      ? [{ severity: 'major', description: `${r.left} → ${r.right}: Boundary review not completed: ${r.review.error}` }]
      : r.review.issues.map(i => ({ severity: i.severity, description: `${r.left} → ${r.right}: ${i.problem}` })));
    const unavailable = draft.blocks.filter(b => b.review.status === 'unavailable').map(b => ({ severity: 'major', description: `${b.thesis_id}: Review not completed: ${b.review.error}` }));
    const measured = textFindings(draft.blocks, draft.habits);
    const deterministic = [...duplicateParagraphs(draft.blocks), ...measured.filter(finding => finding.severity === 'major').map(finding => ({ severity: 'major' as const, description: finding.description }))];
    const carried = (draft.carried_findings || []).map(issue => ({ severity: 'minor', description: `Repair did not converge earlier (${issue.thesis_ids.join(', ')}); check against the final text: ${issue.problem}` }));
    const unresolved = [...deterministic, ...carried, ...unavailable, ...seamFindings.filter(f => f.severity === 'major'), ...draft.blocks.flatMap(b => b.review.issues.filter(i => i.severity === 'major').map(i => ({ severity: i.severity, description: `${b.thesis_id}: ${i.problem}` })))];
    const audit = await structuredResponse(fillTemplate('DEVELOP_AUDIT', auditRaw, { author_request: request, final_book: manuscript + '\n\nUnresolved local logic findings (assess against final prose):\n' + JSON.stringify(unresolved) }) + '\nPlan to compare against the actual prose: ' + JSON.stringify(draft.plan) + '\nRequested total words: ' + input.target_total_words + '\nActual chapter word counts: ' + JSON.stringify(thesisManuscript(draft).map(c => ({ chapter: c.chapter, words: c.text.trim().split(/\s+/).length }))) + '\nEvaluate every quality criterion separately:\n' + qualityInstructions() + '\nReturn a checks entry {passed:boolean,evidence:string} for EVERY key: ' + QUALITY_KEYS.join(', ') + '. Failed criteria require matching findings. Evidence must identify actual passages; plan intentions are not proof of execution.\nAdditionally return checks: {"transitions":{"passed":true,"evidence":"Specific chapter transitions inspected"},"causality":{"passed":true,"evidence":"Specific causal chain inspected"},"repeated_events":{"passed":true,"evidence":"Specific disclosures and actions compared across chapters"}}. Inspect the actual complete prose independently. Transitions include location, time, objects and ongoing actions. Causality includes earned choices and consequences. Repeated events include revelations reset as new and duplicate entrances or exits, not merely repeated words. Each evidence field must name concrete passages or events; do not assert success without inspection. Set passed false when unresolved; include a matching finding.', system, llm, ['summary', 'supported', 'findings', 'checks'], raw => {
      if (!text(raw.summary) || typeof raw.supported !== 'boolean' || !Array.isArray(raw.findings)
        || raw.findings.some((f: any) => !f || !['major', 'minor'].includes(f.severity) || !text(f.description))) throw new Error('Invalid final thesis-book audit.');
      validateQualityChecks(raw.checks);
      return raw as { summary: string; supported: boolean; findings: { severity: string; description: string }[]; checks: NonNullable<ThesisDraft['final_checks']> };
    }, { stage: 'thesis-final-audit', maxTokens: 8192, deliberate: true });
    const minor = draft.blocks.flatMap(b => b.review.issues.map(i => ({ severity: i.severity, description: `${b.thesis_id}: ${i.problem}` })));
    const planningMinor = draft.rounds.at(-1)!.review!.issues.map(i => ({ severity: i.severity, description: `Plan ${i.thesis_ids.join(', ')}: ${i.problem}` }));
    draft.final_checks = audit.checks; save();
    const failedChecks = Object.entries(audit.checks).filter(([, check]) => !check.passed).map(([name, check]) => ({ severity: 'major', description: `${name}: ${check.evidence}` }));
    const findings = [...deterministic, ...carried, ...measured.filter(finding => finding.severity === 'minor').map(finding => ({ severity: 'minor', description: finding.description })), ...audit.findings, ...minor, ...planningMinor, ...unavailable, ...seamFindings, ...failedChecks];
    const shortChapters = draft.manifestation ? thesisManuscript(draft).map(chapter => ({chapter:chapter.chapter, ...wordBudget(chapter.text, chapterBudget(input,chapter.chapter))})).filter(chapter => !chapter.ready) : [];
    findings.push(...shortChapters.map(chapter => ({severity:'major', description:`Chapter ${chapter.chapter} has ${chapter.words} words; target ${chapter.target}, minimum ${chapter.minimum}. Expand substantive actions and consequences in existing scenes; do not add padding.`})));
    if (!audit.supported || findings.some(f => f.severity === 'major')) {
      const count=findings.filter(f=>f.severity==='major').length;
      const previous=draft.final_repair;
      const revision=stableJson({plan:draft.plan,blocks:draft.blocks.map(b=>b.text)});
      const improved=previous?.previous_count!==undefined && count<previous.previous_count && revision!==previous.previous_revision;
      const stalled=previous?.previous_count===undefined?0:improved?0:(previous.stalled||0)+1;
      draft.final_repair = { attempts: (previous?.attempts || 0) + 1, stalled, previous_count:count, previous_revision:revision, phase: 'write',
        findings: findings.filter(f => f.severity === 'major').length ? findings.filter(f => f.severity === 'major') : [{ severity: 'major', description: audit.summary }], changed: [] };
      store.log('thesis', `Final audit returned automatically to writer: correction ${draft.final_repair.attempts}; ${stalled} rounds without reviewed progress.`); save();
      if(stalled>=2) { draft.final_repair.phase='idle';save();throw new Error('Automatic final repair stopped: two consecutive rounds made no reviewed progress. Saved manuscript and findings are retained; the book is not marked complete. '+draft.final_repair.findings.map(f=>f.description).join('; ')); }
      continue;
    }
    if (shortChapters.length) throw new Error('Requested chapter length not reached: ' + shortChapters.map(chapter => `chapter ${chapter.chapter}: ${chapter.words}/${chapter.target} words (minimum ${chapter.minimum})`).join('; ') + '. Saved manuscript retained.');
    store.saveReport({ coverage: { material_examined: 'Complete prose assembled from accepted thesis blocks', limitations: ['Model assessment; no external fact verification.'] },
      findings: findings.map(f => ({ ...f, category: 'thesis-book', evidence_refs: [], reader_impact: f.description, certainty: 'model assessment' })),
      central_resolution: { supported: audit.supported && !unresolved.length && !failedChecks.length, evidence_refs: [], comment: audit.summary }, unresolved_major_promises: [], need_more_evidence: [], summary: audit.summary,
      status: audit.supported && !findings.length ? 'COMPLETE' : 'COMPLETE_WITH_WARNINGS' });
  }
  progress('done');
}
