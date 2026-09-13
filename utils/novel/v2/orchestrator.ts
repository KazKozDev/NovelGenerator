import { drainRetryNotices, type NovelLLM } from './llm';
import { auditBook } from './auditor';
import { designReviewedBook } from './reviewer';
import { emptyState, MemoryProjectStore, type ProjectStore } from './store';
import type { BookDesign, FinalReport, PlanReview, ProjectInput } from './types';

/**
 * Orchestrator: owns the order of work, the versions, the budgets and the
 * record. One design call, one construction review (plus bounded fixes), then
 * chapters in order through the injected chapter pipeline, then the audit.
 *
 * The chapter pipeline (planner, writer, tracker, forward update) and the final
 * auditor arrive as the next modules; the orchestrator defines their shape so
 * the order of work is fixed before they exist.
 */
export interface CallBudget {
  maxCalls: number;
  maxTimeMs: number;
  /** Estimated-token ceiling; measured as characters/4 since providers report no usage. */
  maxTokens?: number;
}

export interface ChapterOutcome {
  warnings: string[];
}

export interface ChapterPipeline {
  writeChapter(design: BookDesign, chapter: number, store: ProjectStore, llm: NovelLLM): Promise<ChapterOutcome>;
}

export type BookStatus = 'COMPLETE' | 'COMPLETE_WITH_WARNINGS' | 'PARTIAL' | 'FAILED';

export type ProgressStage = 'design' | 'chapter' | 'audit' | 'done';

export interface BookResult {
  status: BookStatus;
  design: BookDesign | null;
  review: PlanReview | null;
  report: FinalReport | null;
  callsUsed: number;
  tokensUsed: number;
  stoppedReason: string | null;
}

export const DEFAULT_BUDGET: CallBudget = { maxCalls: 200, maxTimeMs: 60 * 60 * 1000 };

export class Orchestrator {
  private callsUsed = 0;
  private tokensUsed = 0;
  private startedAt = 0;

  constructor(
    private readonly store: ProjectStore = new MemoryProjectStore(),
    private readonly budget: CallBudget = DEFAULT_BUDGET,
    private readonly pipeline: ChapterPipeline | null = null,
    private readonly onProgress: (stage: ProgressStage, chapter?: number) => void = () => {},
  ) {}

  /** First-attempt failures go to the run log with their reasons. */
  private flushRetries(): void {
    for (const notice of drainRetryNotices()) {
      this.store.log('retry', `${notice.keys.join('+')} attempt ${notice.attempt} rejected: ${notice.error}`);
    }
  }

  /** Every model call passes through here: counted, capped, and logged. */
  private counted(llm: NovelLLM): NovelLLM {
    return async (prompt, system, options) => {
      this.callsUsed++;
      if (this.callsUsed > this.budget.maxCalls) {
        throw new Error(`Call budget exhausted after ${this.budget.maxCalls} calls.`);
      }
      if (Date.now() - this.startedAt > this.budget.maxTimeMs) {
        throw new Error('Time budget exhausted.');
      }
      const result = await llm(prompt, system, options);
      this.tokensUsed += Math.ceil((prompt.length + system.length + result.length) / 4);
      if (this.budget.maxTokens !== undefined && this.tokensUsed > this.budget.maxTokens) {
        throw new Error(`Token budget exhausted after ~${this.tokensUsed} estimated tokens.`);
      }
      return result;
    };
  }

  async runBook(input: ProjectInput, llm: NovelLLM): Promise<BookResult> {
    this.callsUsed = 0;
    this.tokensUsed = 0;
    this.startedAt = Date.now();
    const call = this.counted(llm);
    this.store.saveInput(input);
    this.store.log('start', `Premise accepted: ${input.chapter_count} chapters, genre ${input.genre}.`);
    try {
      // Resume: a stored design for the same book skips straight to the first
      // unfinished chapter; finished chapters keep their manuscript and memory.
      const storedInput = this.store.loadInput();
      const storedDesign = this.store.loadDesign();
      const sameBook = !!storedInput && !!storedDesign
        && storedInput.premise === input.premise
        && storedInput.chapter_count === input.chapter_count;
      let design: BookDesign;
      let review: PlanReview | null;
      // A design the review never fully cleared still writes, with the
      // objections carried into the contract — the reader is told which ones.
      const designWarnings: string[] = [];
      if (sameBook && storedDesign) {
        design = storedDesign;
        review = null;
        this.store.log('resume', `Continuing "${input.premise.slice(0, 60)}" from stored state.`);
      } else {
        this.onProgress('design');
        const fresh = await designReviewedBook(input, call);
        this.flushRetries();
        design = fresh.design;
        review = fresh.review;
        this.store.saveDesign(design);
        this.store.saveStyleContract(design.style_contract);
        this.store.checkpoint('design');
        this.store.log('design', `Book designed and reviewed: ${design.characters.length} characters, ${design.causal_map.length} causal events.`);
        if (!review.ready) {
          const unresolved = review.issues.filter(item => item?.severity === 'blocking' || item?.severity === 'major');
          for (const item of unresolved) {
            designWarnings.push(`The design review still objects to ${item.target_ref}: ${item.problem} It travels as a requirement the chapters must meet.`);
          }
          this.store.log('design', `Review unresolved on ${unresolved.length} point(s); carried into the contract.`);
        }
      }

      if (!this.pipeline) {
        return { status: 'PARTIAL', design, review, report: null, callsUsed: this.callsUsed, tokensUsed: this.tokensUsed, stoppedReason: 'Chapter pipeline not attached yet.' };
      }
      const finished = new Set(this.store.manuscript().map(item => item.chapter));
      const warnings: string[] = [...designWarnings];
      for (let chapter = 1; chapter <= input.chapter_count; chapter++) {
        this.onProgress('chapter', chapter);
        if (finished.has(chapter)) {
          this.store.log('skip', `Chapter ${chapter} already finished; manuscript and memory kept.`);
          continue;
        }
        // An interrupted chapter restarts from the previous chapter's snapshot,
        // so no delta is ever applied twice. Scenes with a folded delta stay:
        // the pipeline replays them without model calls. Only a partial scene
        // (the run died before its delta) is dropped and regenerated.
        const kept = this.store.chapterScenes(chapter).filter(scene => scene.delta);
        this.store.clearChapterScenes(chapter);
        for (const scene of kept) this.store.saveScene(scene);
        if (chapter === 1) {
          this.store.saveState(emptyState());
          this.store.saveThreads([]);
        } else {
          const snapshot = this.store.loadStateSnapshot(chapter - 1);
          if (snapshot) this.store.saveState(snapshot);
        }
        const outcome = await this.pipeline.writeChapter(design, chapter, this.store, call);
        warnings.push(...outcome.warnings);
        this.store.checkpoint(`chapter-${chapter}`);
      }
      this.onProgress('audit');
      this.flushRetries();
      const report = await auditBook({
        story_language: input.story_language,
        planning_language: input.planning_language,
        design: this.store.loadDesign() || design,
        manuscript: this.store.manuscript(),
        finalState: this.store.loadState(),
        threads: this.store.loadThreads(),
        coverage: `Full manuscript, ${this.store.manuscript().length} chapters.`,
      }, true, call);
      this.flushRetries();
      this.store.saveReport(report);
      this.store.log('audit', `Final audit: ${report.status}. ${report.summary}`);
      const status: BookStatus = report.status === 'COMPLETE' && !warnings.length ? 'COMPLETE' : 'COMPLETE_WITH_WARNINGS';
      const stoppedReason = [...warnings, ...(report.status !== 'COMPLETE' ? [report.summary] : [])].join('; ') || null;
      this.onProgress('done');
      return { status, design, review, report, callsUsed: this.callsUsed, tokensUsed: this.tokensUsed, stoppedReason };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.store.log('failed', reason);
      return { status: 'FAILED', design: this.store.loadDesign(), review: null, report: null, callsUsed: this.callsUsed, tokensUsed: this.tokensUsed, stoppedReason: reason };
    }
  }
}
