import { authorKey, writeBookOnce } from '../v3/author';
import { writeAtDesk } from '../v3/authorDesk';
import { SCENE_WORD_CAP } from './sceneBudget';
import { writeThesisBook } from './theses';
import type { HabitMemory } from './habits';
import type { SecondWriter } from './duel';
import { developBook, inputKey } from './progressive';
import { drainRetryNotices, type NovelLLM } from './llm';
import { auditBook } from './auditor';
import { designReviewedBook } from './reviewer';
import { validateBookDesign } from './designer';
import { emptyState, MemoryProjectStore, type ProjectStore } from './store';
import type { BookDesign, FinalReport, PlanReview, ProjectInput } from './types';

/**
 * Orchestrator: owns the order of work, the versions, the budgets and the
 * record. Successive design levels with reviews and bounded repairs, then
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

/** What one kind of call cost over a run, in characters: providers report no usage. */
export interface StageUsage {
  stage: string;
  calls: number;
  sent: number;
  received: number;
}

/** The usage table as one line per stage, largest sender first, with the totals and the manuscript beside them. */
export function describeUsage(usage: StageUsage[], manuscriptChars: number): string[] {
  const sent = usage.reduce((sum, item) => sum + item.sent, 0);
  const received = usage.reduce((sum, item) => sum + item.received, 0);
  const calls = usage.reduce((sum, item) => sum + item.calls, 0);
  const ratio = (value: number): string => (manuscriptChars ? `${(value / manuscriptChars).toFixed(1)}x the manuscript` : 'no manuscript');
  return [
    ...usage.slice().sort((first, second) => second.sent - first.sent)
      .map(item => `${item.stage}: ${item.calls} call(s), sent ${item.sent}, received ${item.received}`),
    `total: ${calls} call(s), sent ${sent} (${ratio(sent)}), received ${received} (${ratio(received)}), manuscript ${manuscriptChars}`,
  ];
}

export interface BookResult {
  status: BookStatus;
  design: BookDesign | null;
  review: PlanReview | null;
  report: FinalReport | null;
  callsUsed: number;
  tokensUsed: number;
  stoppedReason: string | null;
  /** Calls and characters by stage. Absent on results built before a run counted anything. */
  usage?: StageUsage[];
}

/**
 * It was a wall-clock hour and two hundred calls, for any book of any length.
 *
 * The hour was set when a chapter was a plan, a scene, and an extraction. A
 * chapter now also carries a cross-encoder over its plan and its prose, an NLI
 * pass over its claims, and up to two replans when the gate refuses it — and a
 * planning call against a long book's accumulated state is minutes on its own.
 * Four chapters no longer fit in an hour, and the run died at the wall with
 * three of them written.
 *
 * So the budget is what a book of this length costs, not a constant. Calls
 * scale with the chapters — a chapter is a plan, a rebase, a scene package and a
 * tracking pass per scene, a repair where one is needed, and a reconciliation,
 * which a live run shows at twenty to twenty-five and forty leaves room for.
 *
 * Both used to be capped, at six hundred calls and four hours, so that a
 * runaway would stop. The caps stopped books instead. Twenty chapters at forty
 * calls is eight hundred, and four hours across twenty chapters is twelve
 * minutes each — a pace a cloud model keeps and a model on the author's own
 * machine does not come near, so every long local run ended at the wall however
 * well it was going, with nobody there to press Continue.
 *
 * What stops a runaway is the count, and the count is proportional: a book
 * cannot spend more than forty calls a chapter whatever it does. The clock
 * measures the hardware rather than the book, so it is set to what a slow
 * machine needs — an hour a chapter — and exists to end a run that has stopped
 * making progress, not to pace one that has not. Each call still has its own
 * deadline in the transport.
 */
export function budgetFor(chapters: number, input?:Pick<ProjectInput,'generation_mode'|'target_total_words'|'planning_version'>): CallBudget {
  const perChapter = Math.max(1, chapters);
  // Progressive passes use tool calls for individual scene reads, patches and reviews.
  // Keep the legacy pipeline budget, but size instrumented runs by the user's scene volume.
  // A new book arrives from the form with no generation_mode yet; planning_version 2 is one.
  const instrumented=input?.generation_mode==='progressive'||input?.generation_mode==='theses'||input?.planning_version===2;
  const words=input?.target_total_words||perChapter*SCENE_WORD_CAP;
  const scenes=perChapter*Math.max(1,Math.ceil(words/perChapter/SCENE_WORD_CAP));
  return {
    maxCalls: instrumented ? Math.max(600,scenes*40+perChapter*20+80) : Math.max(200, perChapter * 40),
    maxTimeMs: Math.max(60, perChapter * 60) * 60 * 1000,
  };
}

export const DEFAULT_BUDGET: CallBudget = budgetFor(3);

export class Orchestrator {
  private callsUsed = 0;
  private tokensUsed = 0;
  private startedAt = 0;
  private stages = new Map<string, StageUsage>();

  constructor(
    private readonly store: ProjectStore = new MemoryProjectStore(),
    private readonly budget: CallBudget = DEFAULT_BUDGET,
    private readonly pipeline: ChapterPipeline | null = null,
    private readonly onProgress: (stage: ProgressStage, chapter?: number) => void = () => {},
    private readonly habitMemory?: HabitMemory,
    private readonly secondWriter?: SecondWriter,
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
        throw new Error(`Call budget of ${this.budget.maxCalls} calls exhausted with ${this.store.manuscript().length} chapter(s) written. Continuing keeps them and starts the count again.`);
      }
      if (Date.now() - this.startedAt > this.budget.maxTimeMs) {
        const finished = this.store.manuscript().length;
        throw new Error(`Time budget of ${Math.round(this.budget.maxTimeMs / 60000)} minutes exhausted with ${finished} chapter(s) written. Continuing keeps them and starts the clock again.`);
      }
      const stage = options?.stage || 'unlabelled';
      const tally = this.stages.get(stage) || { stage, calls: 0, sent: 0, received: 0 };
      tally.calls++;
      tally.sent += prompt.length + system.length;
      this.stages.set(stage, tally);
      const result = await llm(prompt, system, options);
      tally.received += result.length;
      this.tokensUsed += Math.ceil((prompt.length + system.length + result.length) / 4);
      if (this.budget.maxTokens !== undefined && this.tokensUsed > this.budget.maxTokens) {
        throw new Error(`Token budget exhausted after ~${this.tokensUsed} estimated tokens.`);
      }
      return result;
    };
  }

  /**
   * The run, and after it — however it ended — where its calls and its
   * characters went. A pipeline that sends fifty times the book it writes
   * cannot be made cheaper by anyone who cannot see which stage sent it.
   */
  async runBook(input: ProjectInput, llm: NovelLLM): Promise<BookResult> {
    const result = await this.run(input, llm);
    const usage = [...this.stages.values()];
    const manuscript = this.store.manuscript().reduce((sum, item) => sum + item.text.length, 0);
    for (const line of describeUsage(usage, manuscript)) this.store.log('usage', line);
    return { ...result, usage };
  }

  private async run(input: ProjectInput, llm: NovelLLM): Promise<BookResult> {
    this.callsUsed = 0;
    this.tokensUsed = 0;
    this.stages = new Map();
    this.startedAt = Date.now();
    const call = this.counted(llm);
    const storedInput = this.store.loadInput();
    const theses = this.store.loadTheses();
    const progressive = this.store.loadProgressive();
    if ((theses && theses.input_key !== inputKey(input))
      || (storedInput?.generation_mode === 'theses' && inputKey(storedInput) !== inputKey(input))
      || (progressive && progressive.input_key !== inputKey(input))
      || (storedInput?.generation_mode === 'progressive' && inputKey(storedInput) !== inputKey(input))) {
      return { status: 'FAILED', design: null, review: null, report: null, callsUsed: 0, tokensUsed: 0,
        stoppedReason: 'The saved draft belongs to a different book. Start a fresh project before changing its input.' };
    }
    // A new book is written by its author, once. A book begun under the older pipelines is
    // finished by the pipeline that began it.
    const authored = this.store.loadAuthor();
    if (authored ? true : input.generation_mode === 'author' || (!input.generation_mode && !storedInput?.generation_mode && !theses && !progressive && !this.store.loadDesign())) {
      if (authored && authored.input_key !== authorKey(input)) return { status: 'FAILED', design: null, review: null, report: null, callsUsed: 0, tokensUsed: 0,
        stoppedReason: 'The saved draft belongs to a different book. Start a fresh project before changing its input.' };
      this.store.saveInput({ ...input, generation_mode: 'author' });
      this.store.log('start', `Premise accepted: ${input.chapter_count} chapters, genre ${input.genre}. The author is at its desk.`);
      try {
        // The author works at its desk as it sees fit. A book begun by the fixed sequence
        // (clock, plan, each chapter once) is finished by it.
        if (authored && !authored.desk) await writeBookOnce({ ...input, generation_mode: 'author' }, this.store, call, this.onProgress);
        else await writeAtDesk({ ...input, generation_mode: 'author' }, this.store, call, this.onProgress);
        this.flushRetries();
        const report = this.store.loadReport()!;
        this.store.log('audit', report.summary);
        return { status: report.status === 'COMPLETE' ? 'COMPLETE' : 'COMPLETE_WITH_WARNINGS', design: null, review: null, report,
          callsUsed: this.callsUsed, tokensUsed: this.tokensUsed, stoppedReason: report.status === 'COMPLETE' ? null : report.summary };
      } catch (error) {
        this.flushRetries();
        const message = error instanceof Error ? error.message : String(error);
        this.store.log('stopped', message);
        return { status: 'FAILED', design: null, review: null, report: null, callsUsed: this.callsUsed, tokensUsed: this.tokensUsed, stoppedReason: message };
      }
    }
    this.store.saveInput(input);
    this.store.log('start', `Premise accepted: ${input.chapter_count} chapters, genre ${input.genre}.`);
    try {
      const freshThesisBook = !input.generation_mode && !storedInput?.generation_mode && !this.store.loadDesign() && !progressive;
      if ((input.generation_mode === 'progressive' && !progressive) || input.generation_mode === 'theses' || theses || freshThesisBook || (!input.generation_mode && storedInput?.generation_mode === 'theses')) {
        if (progressive || this.store.loadDesign() && this.store.manuscript().length && !theses) throw new Error('Start a fresh project to use thesis writing for an existing book.');
        const thesisInput = { ...input, generation_mode: (freshThesisBook || input.generation_mode === 'progressive' || theses?.manifestation ? 'progressive' : 'theses') as ProjectInput['generation_mode'] };
        this.store.saveInput(thesisInput);
        await writeThesisBook(thesisInput, this.store, call, this.onProgress, this.habitMemory, this.secondWriter);
        this.flushRetries();
        const report = this.store.loadReport()!;
        this.store.log('audit', report.summary);
        return { status: report.status === 'COMPLETE' ? 'COMPLETE' : 'COMPLETE_WITH_WARNINGS', design: null, review: null, report,
          callsUsed: this.callsUsed, tokensUsed: this.tokensUsed, stoppedReason: report.status === 'COMPLETE' ? null : report.summary };
      }
      if (input.generation_mode !== 'chapters'  && (input.generation_mode === 'progressive' || storedInput?.generation_mode === 'progressive' || this.store.loadProgressive() || !this.store.loadDesign())) {
        this.store.saveInput({ ...input, generation_mode: 'progressive' });
        await developBook(input, this.store, call, this.onProgress);
        this.flushRetries();
        const report = this.store.loadReport()!;
        this.store.log('audit', report.summary);
        return { status: report.status === 'COMPLETE' ? 'COMPLETE' : 'COMPLETE_WITH_WARNINGS', design: this.store.loadDesign(), review: null, report,
          callsUsed: this.callsUsed, tokensUsed: this.tokensUsed, stoppedReason: report.status === 'COMPLETE' ? null : report.summary };
      }
      // Resume: a stored design for the same book skips straight to the first
      // unfinished chapter; finished chapters keep their manuscript and memory.
      const storedDesign = this.store.loadDesign();
      // A stored design is resumed only if it still validates. One that does not
      // was written against an older schema, and continuing it would mean
      // planning every remaining chapter against budgets it never declared.
      const resumable = (() => {
        if (!storedDesign) return false;
        if ((!storedDesign.planning_history || !storedDesign.intention_collisions ||
          !storedDesign.intention_collisions.review.ready ||
          !storedDesign.planning_history.rounds.at(-1)?.review.ready) && !this.store.manuscript().length) {
          this.store.log('resume', 'Stored draft predates the current planning passes; generating a reviewed plan before prose.');
          return false;
        }
        try {
          validateBookDesign(storedDesign, input.chapter_count);
          return true;
        } catch {
          this.store.log('resume', 'The stored design does not meet the current schema; designing the book again.');
          return false;
        }
      })();
      const sameBook = !!storedInput && resumable
        && storedInput.premise === input.premise
        && storedInput.chapter_count === input.chapter_count;
      let design: BookDesign;
      let review: PlanReview | null;
      if (sameBook && storedDesign) {
        design = storedDesign;
        review = null;
        this.store.log('resume', `Continuing "${input.premise.slice(0, 60)}" from stored state.`);
      } else {
        this.onProgress('design');
        const fresh = await designReviewedBook(input, call, 2, level => {
          this.store.log('design', `Crystallization approved: ${level}.`);
        }, draft => this.store.saveDesign(draft));
        this.flushRetries();
        design = fresh.design;
        review = fresh.review;
        this.store.saveDesign(design);
        this.store.saveStyleContract(design.style_contract);
        this.store.checkpoint('design');
        this.store.log('design', `Book designed and reviewed: ${design.characters.length} characters, ${design.causal_map.length} causal events.`);

      }

      if (!this.pipeline) {
        return { status: 'PARTIAL', design, review, report: null, callsUsed: this.callsUsed, tokensUsed: this.tokensUsed, stoppedReason: 'Chapter pipeline not attached yet.' };
      }
      const finished = new Set(this.store.manuscript().map(item => item.chapter));
      const warnings: string[] = [];
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
      // The audit reports on a book that is already written. Losing the report
      // is not losing the book: a run that wrote every chapter and then had its
      // audit cut off mid-answer used to end FAILED with a complete manuscript
      // in the store. It ends with warnings and says the audit is missing.
      let report: FinalReport;
      try {
        report = await auditBook({
          design: this.store.loadDesign() || design,
          manuscript: this.store.manuscript(),
          finalState: this.store.loadState(),
          threads: this.store.loadThreads(),
          coverage: `Full manuscript, ${this.store.manuscript().length} chapters.`,
        }, true, call);
      } catch (error) {
        const reason = (error instanceof Error ? error.message : String(error)).split('\n')[0];
        this.flushRetries();
        this.store.log('audit', `The final audit could not be completed: ${reason}`);
        warnings.push(`The book is written, and its final audit could not be completed (${reason}). The manuscript is unchecked as a whole.`);
        this.onProgress('done');
        return { status: 'COMPLETE_WITH_WARNINGS', design, review, report: null, callsUsed: this.callsUsed, tokensUsed: this.tokensUsed, stoppedReason: warnings.join('; ') };
      }
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
