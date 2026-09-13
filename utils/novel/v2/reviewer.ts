import { renderPrompt, systemContract } from '../prompts';
import { structuredResponse, type NovelLLM } from './llm';
import { designBook, premiseGivenGaps, premiseNameGaps, validateBookDesign } from './designer';
import type { BookDesign, PlanIssue, PlanReview, ProjectInput } from './types';

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
  const issues = Array.isArray(review.issues) ? review.issues as PlanIssue[] : [];
  const blocking = issues.some(item => item?.severity === 'blocking' || item?.severity === 'major');
  return { ready: !blocking, issues };
}

export interface ReviewContext {
  story_language: string;
  planning_language: string;
  story_contract: string;
}

export async function reviewPlan(
  ctx: ReviewContext,
  scope: string,
  plan: unknown,
  relevantState: string,
  sourceExcerpts: string,
  llm: NovelLLM,
): Promise<PlanReview> {
  const system = systemContract({ story_language: ctx.story_language, planning_language: ctx.planning_language });
  const prompt = renderPrompt('P02_PLAN_REVIEW', {
    review_scope: scope,
    story_contract: ctx.story_contract,
    plan: typeof plan === 'string' ? plan : JSON.stringify(plan),
    relevant_state: relevantState || '(nothing written yet)',
    source_excerpts: sourceExcerpts || '(none)',
    previous_plan: '(none — first review)',
    review_issues: '(none)',
  });
  const raw = await structuredResponse(prompt, system, llm, ['ready', 'issues'], parsed => parsed,
    { temperature: 0.1, maxTokens: 8192, route: 'validator' });
  return settleReview(raw);
}

function issueSummary(issues: PlanIssue[]): string {
  return issues.map(item => `[${item.severity}] ${item.target_ref}: ${item.problem} Required decision: ${item.required_decision}`).join('\n');
}

/**
 * Re-review convergence: every fix round is judged de novo by the model, so a
 * strict reviewer can raise a fresh set of majors forever — each fix adds new
 * surface for new findings and the loop never converges. A major flagged for
 * the first time on a later round is therefore treated as prose-carriable
 * (optional): if the reviewer insists on the same target twice, or calls it
 * blocking, it keeps its severity. Only genuinely load-bearing incoherence can
 * still kill the book after round zero.
 */
export function calibrateReview(review: PlanReview, seenTargets: Set<string>): PlanReview {
  const issues = review.issues.map(item => {
    if (item?.severity === 'major' && item.target_ref && !seenTargets.has(item.target_ref)) {
      return { ...item, severity: 'optional' as const };
    }
    return item;
  });
  const blocking = issues.some(item => item?.severity === 'blocking' || item?.severity === 'major');
  return { ready: !blocking, issues };
}

/**
 * Design, review, and refine until the plan is executable or the budget is spent.
 * Returns the design together with the review that passed it.
 */
export async function designReviewedBook(
  input: ProjectInput,
  llm: NovelLLM,
  maxFixes = 2,
): Promise<{ design: BookDesign; review: PlanReview }> {
  let design = await designBook(input, llm);
  const ctx: ReviewContext = {
    story_language: input.story_language,
    planning_language: input.planning_language,
    story_contract: JSON.stringify(design.contract),
  };
  // Targets already litigated in earlier rounds: re-flagging them keeps severity.
  const seenTargets = new Set<string>();
  let priorSummary = '';
  for (let round = 0; ; round++) {
    const scope = round === 0
      ? 'Whole book design before any prose is written.'
      : `Re-verify after fixes. Previously raised:\n${priorSummary}\nJudge only whether those fixes worked and whether the fixes broke coherence; settled points stay settled.`;
    const raw = await reviewPlan(ctx, scope, design, '', '', llm);
    const charges = [...groundingIssues(design, input.premise, round), ...givenCharges(design, round)];
    const merged: PlanReview = charges.length ? { ready: false, issues: [...raw.issues, ...charges] } : raw;
    const review = round === 0 ? merged : calibrateReview(merged, seenTargets);
    for (const item of review.issues) {
      if (item?.target_ref && (item.severity === 'blocking' || item.severity === 'major')) seenTargets.add(item.target_ref);
    }
    priorSummary = issueSummary(review.issues);
    if (review.ready) return { design, review };
    if (round >= maxFixes) {
      // What code charges is objective and fatal: a premise name nobody answers
      // to, a premise given the construction never places. The book cannot be
      // written because it would not be the book that was asked for.
      const codeCharges = [...groundingIssues(design, input.premise, round), ...givenCharges(design, round)];
      if (codeCharges.length) {
        throw new Error(`Book design not executable after ${maxFixes + 1} attempts. Unresolved:\n${issueSummary(codeCharges)}`);
      }
      // What the model still objects to is a judgement, and after three rounds
      // of the same objection it is usually a demand the prose can satisfy —
      // "say how they both got to the clearing" is a sentence, not a redesign.
      // It travels as a requirement the chapters must meet, the way a blocking
      // scene verdict already does, instead of ending a book nobody has read.
      const unresolved = review.issues.filter(item => item?.severity === 'blocking' || item?.severity === 'major');
      design.contract.explicit_requirements = [
        ...(Array.isArray(design.contract.explicit_requirements) ? design.contract.explicit_requirements : []),
        ...unresolved.map(item => `${item.target_ref}: ${item.required_decision || item.problem}`),
      ];
      return { design, review };
    }
    const system = systemContract({ story_language: input.story_language, planning_language: input.planning_language });
    const prompt = renderPrompt('P02_PLAN_REVIEW', {
      review_scope: `Refine the previous plan against these findings, then re-verify it:\n${issueSummary(review.issues)}`,
      story_contract: ctx.story_contract,
      plan: JSON.stringify(design),
      relevant_state: '(nothing written yet)',
      source_excerpts: '(none)',
      previous_plan: JSON.stringify(design),
      review_issues: JSON.stringify(review.issues),
    });
    const rawDesign = await structuredResponse(prompt, system, llm,
      ['contract', 'dramatic_core', 'style_contract', 'characters', 'world_rules', 'causal_map', 'ending', 'chapter_map'],
      parsed => parsed, { temperature: 0.4, maxTokens: 16384, route: 'writer' });
    design = validateBookDesign(rawDesign, input.chapter_count);
  }
}
