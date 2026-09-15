/**
 * Semantic pre-write gate: local models check the chapter plan BEFORE a
 * prose token exists, where a fix costs seconds.
 *
 * - Full mode: the cross-encoder (bge-reranker-v2-m3) scores each planned
 *   scene against paragraphs of finished chapters (paraphrase restaging),
 *   and NLI (deberta) scores the scene's claims against confirmed state
 *   (plan-vs-memory clashes).
 * - Light mode (the default): a small embedder (~90MB) scores the same
 *   candidate pairs by cosine similarity — restaging only, no NLI leg.
 *   Weaker recall than the cross-encoder, but on by default instead of
 *   absent: an advisory suspicion the P02 review disposes beats silence.
 *
 * Findings only bring evidence and become ReadinessProblems; the P02 review
 * disposes them like every other doubt. Nothing here blocks, replans, or
 * rewrites on its own. Browser-only: weights download on first use and are
 * cached by the runtime. Unavailable (no worker, failed download) or
 * failed — the gate returns empty and the book continues on the verbatim
 * check alone. Never throws into the run.
 */
import { contentWords, paragraphsOf, splitSentences } from '../analytics';
import { contradictionFindings, naturalizeClaim, sharedNLIScorer, type NLIScorer } from '../nli';
import { rerankRepetitionScore, sharedReranker, type Reranker } from '../reranker';
import type { ChapterPlan, StoryState } from './types';
import type { PriorChapter, ReadinessProblem } from './planner';

/**
 * Two modes, not three, and only one of them is a choice anybody makes.
 *
 * A light mode existed — a small embedder scoring the same pairs by cosine,
 * restaging only — and it was worse than nothing: it ran, it logged that it had
 * checked for paraphrase restaging, and it let a scene be retold almost beat for
 * beat from one chapter to the next. A check that reports coverage it does not
 * have is a check that stops anyone looking.
 *
 * 'off' survives it, but not as a setting. There is no switch in the
 * application and no flag on the runner: a book is written with the models or
 * it is not written by this pipeline. What 'off' is for is the runtime that has
 * nowhere to record a choice and nobody to consent to 780MB — a test suite,
 * which must never reach for the network, and any script that has not said
 * otherwise. Runners say otherwise with `setGateModeOverride`.
 */
export type GateMode = 'off' | 'full';

let modeOverride: GateMode | null = null;

export function setGateModeOverride(mode: GateMode | null): void {
  modeOverride = mode;
}

export function currentGateMode(): GateMode {
  if (modeOverride) return modeOverride;
  // A browser is a reader's machine: it gets the whole check, always.
  return typeof localStorage === 'undefined' ? 'off' : 'full';
}

export interface GateScorers {
  rerank: Reranker;
  scoreNLI: NLIScorer;
}

export interface PrewriteGateResult {
  /** Scene id → suspicions for the P02 review. */
  problems: Map<string, ReadinessProblem[]>;
  warnings: string[];
  mode: GateMode;
}

const MAX_PAIRS_PER_CHAPTER = 40;
const MIN_SHARED_WORDS = 3;
const MAX_STATE_CLAIMS = 12;
const MAX_SCENE_SENTENCES = 12;

function sceneText(scene: ChapterPlan['scenes'][number]): string {
  return [
    scene.location,
    scene.function,
    scene.development,
    scene.required_outcome,
    ...(scene.initial_conditions || []),
    ...(scene.participant_intentions || []).map(item => `${item.intention} ${item.reason_now}`),
  ].filter(Boolean).join('\n');
}

function overlapSize(a: Set<string>, b: string[]): number {
  let shared = 0;
  for (const word of b) if (a.has(word)) shared++;
  return shared;
}

export async function runPrewriteGate(
  plan: ChapterPlan,
  priorChapters: PriorChapter[],
  state: StoryState,
  scorers?: GateScorers,
  mode: GateMode | boolean = currentGateMode(),
): Promise<PrewriteGateResult> {
  const resolved: GateMode = typeof mode === 'boolean' ? (mode ? 'full' : 'off') : mode;
  const problems = new Map<string, ReadinessProblem[]>();
  if (resolved === 'off' || plan.status !== 'ready' || !priorChapters.length) return { problems, warnings: [], mode: resolved };
  const push = (sceneId: string, problem: ReadinessProblem) => {
    problems.set(sceneId, [...(problems.get(sceneId) || []), problem]);
  };
  let rerank: Reranker | undefined;
  let scoreNLI: NLIScorer | undefined;
  try {
    rerank = scorers?.rerank || sharedReranker();
    scoreNLI = scorers?.scoreNLI || sharedNLIScorer();

    // Restaging: scene plan against finished paragraphs, cheapest prefilter
    // first (shared content words), cross-encoder verdict only on survivors.
    const pairs: { sceneId: string; scene: string; ref: string; paragraph: string }[] = [];
    for (const scene of plan.scenes) {
      const text = sceneText(scene);
      const sceneWords = new Set(contentWords(text));
      if (!sceneWords.size) continue;
      const candidates: { ref: string; paragraph: string; overlap: number }[] = [];
      for (const prior of priorChapters) {
        for (const paragraph of paragraphsOf(prior.text)) {
          const words = contentWords(paragraph);
          if (words.length < 8) continue;
          const overlap = overlapSize(sceneWords, words);
          if (overlap >= MIN_SHARED_WORDS) candidates.push({ ref: prior.ref, paragraph, overlap });
        }
      }
      candidates.sort((a, b) => b.overlap - a.overlap);
      const budget = Math.max(1, Math.floor(MAX_PAIRS_PER_CHAPTER / plan.scenes.length));
      for (const candidate of candidates.slice(0, budget)) {
        pairs.push({ sceneId: scene.id, scene: text.slice(0, 1200), ref: candidate.ref, paragraph: candidate.paragraph.slice(0, 1200) });
      }
    }
    if (pairs.length && rerank) {
      const scores = await rerank(pairs.map(item => [item.scene, item.paragraph] as [string, string]));
      pairs.forEach((item, index) => {
        if ((scores[index] ?? 0) >= rerankRepetitionScore) {
          push(item.sceneId, {
            code: 'restaging-suspect',
            detail: `Scene ${item.sceneId} reads as a retelling of ${item.ref} (paraphrase score ${(scores[index] ?? 0).toFixed(1)}): "${item.paragraph.slice(0, 200)}". If the staging repeats, differentiate it on the page or replan the scene.`,
          });
        }
      });
    }

    if (!scoreNLI) return { problems, warnings: [], mode: resolved };

    // Plan-vs-memory: the scene's own claims against confirmed state.
    const stateClaims = [
      ...state.facts.map(fact => fact.statement),
      ...Object.entries(state.conditions).map(([key, value]) => `${key}: ${value}`),
      ...Object.entries(state.knowledge).flatMap(([character, items]) => items.map(item => `${character} knows: ${item}`)),
    ].filter(claim => claim.trim());
    for (const scene of plan.scenes) {
      const sentences = splitSentences(sceneText(scene)).slice(0, MAX_SCENE_SENTENCES);
      if (!sentences.length || !stateClaims.length) continue;
      const sceneWords = new Set(contentWords(sentences.join(' ')));
      const relevant = stateClaims
        .map(claim => ({ claim, overlap: overlapSize(new Set(contentWords(claim)), [...sceneWords]) }))
        .filter(item => item.overlap >= 1)
        .sort((a, b) => b.overlap - a.overlap)
        .slice(0, MAX_STATE_CLAIMS)
        .map(item => item.claim);
      if (!relevant.length) continue;
      const findings = await contradictionFindings(relevant, sentences, scoreNLI);
      for (const finding of findings) {
        push(scene.id, {
          code: 'clash-suspect',
          detail: `Plan states "${finding.sentence}" but confirmed state holds "${naturalizeClaim(finding.claim)}" (contradiction ${finding.contradiction.toFixed(2)}). Reconcile before writing.`,
        });
      }
    }
  } catch (error) {
    // A dead worker, a refused download, a failed model: the gate degrades
    // to the verbatim check, and the run continues. Local models advise.
    return {
      problems,
      warnings: [`Semantic pre-write check unavailable (${error instanceof Error ? error.message : error}); continuing on the verbatim check.`],
      mode: resolved,
    };
  }
  return { problems, warnings: [], mode: resolved };
}
