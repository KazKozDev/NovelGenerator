import { authorKey } from '../author';
import { runCraftBook, runCraftEditorial, AUDIT_CALLS, AUDIT_STAGES } from '../craft/craftOrchestrator';
import { drainRetryNotices, type NovelLLM } from './llm';
import { MemoryProjectStore, type ProjectStore } from './store';
import type { FinalReport, ProjectInput } from './types';

/** The run's allowance. The desk counts its own steps; this stops a run that has left that count behind. */
export interface CallBudget {
  maxCalls: number;
  maxTimeMs: number;
  maxTokens?: number;
}

export type BookStatus = 'COMPLETE' | 'COMPLETE_WITH_WARNINGS' | 'PARTIAL' | 'FAILED';
export type ProgressStage = 'design' | 'chapter' | 'audit' | 'done';

export interface StageUsage {
  stage: string;
  calls: number;
  sent: number;
  received: number;
}

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
  report: FinalReport | null;
  callsUsed: number;
  tokensUsed: number;
  stoppedReason: string | null;
  usage?: StageUsage[];
}

export function budgetFor(chapters: number): CallBudget {
  const count = Math.max(1, chapters);
  return { maxCalls: Math.max(250, count * 65), maxTimeMs: count * 60 * 60 * 1000 };
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
    private readonly onProgress: (stage: ProgressStage, chapter?: number) => void = () => {},
  ) {}

  private flushRetries(): void {
    for (const notice of drainRetryNotices()) this.store.log('retry', `${notice.keys.join('+')} attempt ${notice.attempt} rejected: ${notice.error}`);
  }

  private counted(llm: NovelLLM): NovelLLM {
    return async (prompt, system, options) => {
      if (!AUDIT_STAGES.has(options?.stage || '') && this.callsUsed >= Math.max(0, this.budget.maxCalls - AUDIT_CALLS)) {
        throw new Error('Writing call budget exhausted; remaining calls are reserved for final book checks.');
      }
      if (this.callsUsed >= this.budget.maxCalls) {
        throw new Error(`Call budget of ${this.budget.maxCalls} calls exhausted with ${this.store.manuscript().length} chapter(s) written. Continuing keeps them and starts the count again.`);
      }
      if (Date.now() - this.startedAt > this.budget.maxTimeMs) {
        throw new Error(`Time budget of ${Math.round(this.budget.maxTimeMs / 60000)} minutes exhausted with ${this.store.manuscript().length} chapter(s) written. Continuing keeps them and starts the clock again.`);
      }
      this.callsUsed++;
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

  async runBook(input: ProjectInput, llm: NovelLLM): Promise<BookResult> {
    const result = await this.run(input, llm);
    const usage = [...this.stages.values()];
    const manuscript = this.store.manuscript().reduce((sum, item) => sum + item.text.length, 0);
    for (const line of describeUsage(usage, manuscript)) this.store.log('usage', line);
    return { ...result, usage };
  }

  async runEditorial(input: ProjectInput, llm: NovelLLM): Promise<BookResult> {
    const result = await this.run(input, llm, true);
    return { ...result, usage: [...this.stages.values()] };
  }

  private async run(input: ProjectInput, llm: NovelLLM, editorial = false): Promise<BookResult> {
    this.callsUsed = 0;
    this.tokensUsed = 0;
    this.stages = new Map();
    this.startedAt = Date.now();
    const authored = this.store.loadAuthor();
    if (authored && authored.input_key !== authorKey(input)) {
      return { status: 'FAILED', report: null, callsUsed: 0, tokensUsed: 0, stoppedReason: 'The saved draft belongs to a different book. Start a fresh project before changing its input.' };
    }
    const existingReport = this.store.loadReport();
    if (!editorial && authored?.completed && !authored.desk?.editorial?.active && existingReport) {
      return { status: existingReport.status, report: existingReport, callsUsed: 0, tokensUsed: 0, stoppedReason: existingReport.status === 'COMPLETE' ? null : existingReport.summary };
    }
    this.store.saveInput({ ...input, generation_mode: 'craft' });
    this.store.log('start', `Premise accepted: ${input.chapter_count} chapters, genre ${input.genre}. 2-layer craft engine active.`);
    try {
      if (editorial || authored?.desk?.editorial?.active) await runCraftEditorial(input, this.store, this.counted(llm), this.onProgress);
      else await runCraftBook(input, this.store, this.counted(llm), this.onProgress);
      this.flushRetries();
      const report = this.store.loadReport()!;
      this.store.log('audit', report.summary);
      return { status: report.status, report, callsUsed: this.callsUsed, tokensUsed: this.tokensUsed, stoppedReason: report.status === 'COMPLETE' ? null : report.summary };
    } catch (error) {
      this.flushRetries();
      const message = error instanceof Error ? error.message : String(error);
      this.store.log('stopped', message);
      return { status: 'FAILED', report: null, callsUsed: this.callsUsed, tokensUsed: this.tokensUsed, stoppedReason: message };
    }
  }
}

