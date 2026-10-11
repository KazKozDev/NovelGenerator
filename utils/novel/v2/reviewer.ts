import { simulateIntentions } from './intentions';
import { renderPrompt, systemContract } from '../prompts';
import { structuredResponse, type NovelLLM } from './llm';
import { conceptCandidates, selectConcept, designLayer, DESIGN_LEVELS, LEVEL_KEYS, designBudgetGaps, designStructureGaps, premiseGivenGaps, premiseNameGaps, validateBookDesign, type DesignDraft, type DesignLevel } from './designer';
import type { BookDesign, IntentionSimulation, PlanIssue, PlanReview, ProjectInput } from './types';

/**
 * A premise name with nobody answering to it is a blocking grounding issue,
 * no matter how coherent the rest is: the model review cannot be trusted
 * with cast fidelity, so code appends the charge itself every round.
 */
function groundingIssues(design: BookDesign, premise: string, round: number): PlanIssue[] {
  return premiseNameGaps(design, premise).map((name, index) => ({
    id: `G${round + 1}${index + 1}`,
    severity: 'blocking' as const,
    target_ref: `characters:${name}`,
    category: 'grounding',
    problem: `The premise names "${name}" but nobody in the cast answers to it.`,
    evidence_refs: [],
    consequence_for_writing: 'The book opens with a different cast than promised.',
    required_decision: `Cast ${name} under that premise-given name, with diminutives linked beside it rather than replacing it.`,
    suggested_adjustment: `Add a character named ${name}.`,
  }));
}

/**
 * A premise given with no home in the construction: listed (or listable)
 * but never placed in the cast, rules, causal map, ending, or chapter map.
 * A plan can be coherent by simply declining to tell the promised story —
 * these charges catch that.
 */
function givenCharges(design: BookDesign, round: number): PlanIssue[] {
  return premiseGivenGaps(design).map((given, index) => ({
    id: `V${round + 1}${index + 1}`,
    severity: 'blocking' as const,
    target_ref: `causal_map:${given}`,
    category: 'grounding',
    problem: `The premise gives "${given}" but the construction never places it.`,
    evidence_refs: [],
    consequence_for_writing: 'A promised element never reaches the page.',
    required_decision: `Give "${given}" a home — an event, a rule, a chapter beat — or cut it from the contract openly.`,
    suggested_adjustment: `Place "${given}" in the causal map or chapter map.`,
  }));
}

/** Deterministic findings keep their responsible section, so escalation repairs its cause. */
function budgetCharges(design: BookDesign, chapterCount: number, round: number): PlanIssue[] {
  return designBudgetGaps(design, chapterCount).map((gap, index) => ({
    id: `B${round + 1}${index + 1}`,
    severity: 'major' as const,
    // Keyed by what the gap is, never by where it sat in the list: a fix that
    // resolves one gap shifts every later index, and the convergence logic then
    // reads an old target as new — downgrading a real objection, or re-raising a
    // settled one, purely because the list got shorter.
    target_ref: `${gap.code === 'particulars-unfixed' ? 'world_rules' : gap.code === 'past-undecided' ? 'causal_map' : 'profile'}:budget:${gap.code}`,
    category: 'budget',
    problem: gap.detail,
    evidence_refs: [],
    consequence_for_writing: 'The middle of the book repeats itself instead of developing, and nothing downstream can tell the difference.',
    required_decision: 'Fix the allocation in profile or chapter_map so the budget covers the book.',
    suggested_adjustment: 'Extend the mechanism ledger, state the missing costs, or place the chapter rungs on the declared curve.',
  }));
}

/**
 * PlanReviewer: finds construction problems before a word of prose exists.
 * `ready` is computed here, not trusted from the model: only an empty blocking/
 * major list passes. A design that cannot be executed coherently goes back to
 * its creator with the findings attached — bounded, then it fails loudly instead
 * of producing a book on a broken plan.
 */
export function settleReview(raw: unknown): PlanReview {
  if (!raw || typeof raw !== 'object') throw new Error('Plan review is not an object.');
  const review = raw as { ready?: unknown; issues?: unknown };
  if (!Array.isArray(review.issues)) throw new Error('Plan review has no issues array.');
  const issues = review.issues as PlanIssue[];
  if (issues.some(item => !item || !['blocking', 'major', 'optional'].includes(item.severity) ||
      typeof item.target_ref !== 'string' || !item.target_ref.trim())) {
    throw new Error('Plan review contains an invalid issue severity or target.');
  }
  const blocking = issues.some(item => item?.severity === 'blocking' || item?.severity === 'major');
  return { ready: !blocking, issues };
}

export interface ReviewContext {
  story_contract: string;
}

export async function reviewPlan(
  ctx: ReviewContext,
  scope: string,
  plan: unknown,
  relevantState: string,
  sourceExcerpts: string,
  llm: NovelLLM,
  stage = 'design-review',
): Promise<PlanReview> {
  const system = systemContract();
  const prompt = renderPrompt('P02_PLAN_REVIEW', {
    review_scope: scope,
    story_contract: ctx.story_contract,
    plan: typeof plan === 'string' ? plan : JSON.stringify(plan),
    relevant_state: relevantState || '(nothing written yet)',
    source_excerpts: sourceExcerpts || '(none)',
    previous_plan: '(none — first review)',
    review_issues: '(none)',
  });
  const raw = await structuredResponse(prompt, system, llm, ['ready', 'issues'], settleReview,
    { temperature: 0.1, maxTokens: 8192, route: 'validator', stage, deliberate: true });
  return settleReview(raw);
}

function issueSummary(issues: PlanIssue[]): string {
  return issues.map(item => `[${item.severity}] ${item.target_ref}: ${item.problem} Required decision: ${item.required_decision}`).join('\n');
}

/** Compatibility helper: new major findings keep their full severity. */
export function calibrateReview(review: PlanReview, _seenTargets: Set<string>): PlanReview {
  return settleReview(review);
}

/**
 * Design, review, and refine until the plan is executable or the budget is spent.
 * Returns the design together with the review that passed it.
 */
/** An issue must name a top-level section to request reopening a frozen level. */
export function issueOwner(issue: PlanIssue): DesignLevel | undefined {
  const root = String(issue.target_ref || '').split(/[:.\[]/)[0];
  return DESIGN_LEVELS.find(level => (LEVEL_KEYS[level] as readonly string[]).includes(root));
}

export async function designReviewedBook(
  input: ProjectInput,
  llm: NovelLLM,
  maxFixes = 2,
  onLevel: (level: DesignLevel, review: PlanReview) => void = () => {},
  onDraft: (design: BookDesign) => void = () => {},
): Promise<{ design: BookDesign; review: PlanReview }> {
  const candidates = await conceptCandidates(input, llm);
  const selection = await selectConcept(input, candidates, llm);
  const layers: DesignDraft[] = [candidates[selection.candidate_index]];
  const reviews: PlanReview[] = [];
  const history: { level: DesignLevel; plan: DesignDraft; review: PlanReview; intention_collisions?: IntentionSimulation }[] = [];
  const fixes = [0, 0, 0];
  const reopened = new Set<number>();
  let pendingFindings = '';
  let index = 0;
  while (index < DESIGN_LEVELS.length) {
    const level = DESIGN_LEVELS[index];
    const approved = Object.assign({}, ...layers.slice(0, index)) as DesignDraft;
    if (!layers[index] || pendingFindings) {
      layers[index] = await designLayer(input, level, approved, layers[index] || {}, pendingFindings, llm);
      pendingFindings = '';
    }
    const draft = { ...approved, ...layers[index] };
    // Full schema validation is due only once all sections exist.
    const complete = index === DESIGN_LEVELS.length - 1 ? validateBookDesign(draft, input.chapter_count) : null;
    const scope = `Book crystallization level ${level}. Only sections ${LEVEL_KEYS[level].join(', ')} are editable.
Approved upper levels: ${JSON.stringify(approved)}.
Later sections are intentionally absent and are NOT defects. Review only decisions due at this level.
Check fidelity, causality and coherence against the approved upper levels.
Also assess reader interest: meaningful stakes or uncertainty, changing choices, developing questions,
and a payoff that earns its setup. Assess whether the distinctive causal invention survives expansion,
not merely whether there are many twists. Cite concrete plan evidence; optional taste is not a defect.
For every issue target_ref must begin with the responsible top-level section name followed by a colon.
If a defect requires changing an approved upper level, target that upper section explicitly.
The review must return issues for unresolved major or blocking defects, even on a later round.`;
    const raw = await reviewPlan({ story_contract: JSON.stringify(draft.contract) }, scope, draft, '', '', llm, 'design-review');
    const charges = complete ? [
      ...groundingIssues(complete, input.premise, fixes[index]),
      ...givenCharges(complete, fixes[index]),
      ...budgetCharges(complete, input.chapter_count, fixes[index]),
    ] : level === 'structure' ? [
      ...groundingIssues(draft as BookDesign, input.premise, fixes[index]),
      ...givenCharges(draft as BookDesign, fixes[index]),
      ...designStructureGaps(draft as Pick<BookDesign, 'world_rules' | 'causal_map'>).map((gap, ordinal) => ({
      id: `S${ordinal}`, severity: 'major' as const,
      target_ref: `${gap.code === 'past-undecided' ? 'causal_map' : 'world_rules'}:${gap.code}`,
      category: 'coherence', problem: gap.detail, evidence_refs: [],
      consequence_for_writing: 'Scenes would invent incompatible particulars.',
      required_decision: gap.detail, suggested_adjustment: gap.detail,
    })),
    ] : [];
    let review = settleReview({ issues: [...raw.issues, ...charges] });
    let simulation: IntentionSimulation | undefined;
    if (level === 'structure' && review.ready) {
      simulation = await simulateIntentions(draft as BookDesign, llm);
      review = settleReview({ issues: [...review.issues, ...simulation.review.issues] });
      if (review.ready) layers[index] = { ...layers[index], intention_collisions: simulation };
    }
    history.push({ level, plan: structuredClone(draft), review: structuredClone(review),
      ...(simulation ? { intention_collisions: structuredClone(simulation) } : {}) });
    if (complete) onDraft({ ...complete,
      planning_history: { candidates, selection, rounds: structuredClone(history) },
    });
    const unresolved = review.issues.filter(item => item.severity === 'blocking' || item.severity === 'major');
    if (review.ready) {
      reviews[index] = review;
      onLevel(level, review);
      index++;
      continue;
    }
    const upper = unresolved.map(issue => issueOwner(issue))
      .filter((owner): owner is DesignLevel => !!owner)
      .map(owner => DESIGN_LEVELS.indexOf(owner))
      .filter(owner => owner < index);
    if (upper.length) {
      const target = Math.min(...upper);
      if (reopened.has(target)) throw new Error(`Book design not executable: ${DESIGN_LEVELS[target]} already reopened once.\n${issueSummary(unresolved)}`);
      reopened.add(target);
      layers.length = target + 1;
      reviews.length = target;
      index = target;
      pendingFindings = issueSummary(unresolved);
      continue;
    }
    if (fixes[index] >= maxFixes) {
      throw new Error(`Book design not executable: ${level} failed after ${fixes[index] + 1} attempts.\n${issueSummary(unresolved)}`);
    }
    fixes[index]++;
    pendingFindings = issueSummary(unresolved);
  }
  const design = validateBookDesign(Object.assign({}, ...layers), input.chapter_count);
  // Persist alternatives, the selection rationale and all level verdicts with the design.
  design.planning_history = { candidates, selection, rounds: history };
  return { design, review: settleReview({ issues: reviews.flatMap(item => item.issues) }) };
}
