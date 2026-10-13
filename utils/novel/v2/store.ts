import type { AuthorDraft } from '../v3/author';
import type { FinalReport, ProjectInput } from './types';

/** One book: the author's draft, the manuscript, the report and the run log. */
export interface RunLogEntry {
  at: string;
  stage: string;
  detail: string;
}

export interface ProjectStore {
  saveAuthor(draft: AuthorDraft): void;
  loadAuthor(): AuthorDraft | null;
  saveInput(input: ProjectInput): void;
  loadInput(): ProjectInput | null;
  saveManuscript(chapter: number, text: string): void;
  manuscript(): { chapter: number; text: string }[];
  saveReport(report: FinalReport): void;
  loadReport(): FinalReport | null;
  clearReport(): void;
  log(stage: string, detail: string): void;
  runLog(): RunLogEntry[];
  checkpoint(label: string): void;
  checkpoints(): string[];
  clearAll(): void;
}

export class MemoryProjectStore implements ProjectStore {
  private author: AuthorDraft | null = null;
  private input: ProjectInput | null = null;
  private chapters = new Map<number, string>();
  private report: FinalReport | null = null;
  private entries: RunLogEntry[] = [];
  private marks: string[] = [];

  saveAuthor(draft: AuthorDraft): void { this.author = structuredClone(draft); }
  loadAuthor(): AuthorDraft | null { return this.author ? structuredClone(this.author) : null; }
  saveInput(input: ProjectInput): void { this.input = input; }
  loadInput(): ProjectInput | null { return this.input; }
  saveManuscript(chapter: number, text: string): void { this.chapters.set(chapter, text); }
  manuscript(): { chapter: number; text: string }[] {
    return [...this.chapters.entries()].map(([chapter, text]) => ({ chapter, text })).sort((a, b) => a.chapter - b.chapter);
  }
  saveReport(report: FinalReport): void { this.report = report; }
  loadReport(): FinalReport | null { return this.report; }
  clearReport(): void { this.report = null; }
  log(stage: string, detail: string): void { this.entries.push({ at: new Date().toISOString(), stage, detail }); }
  runLog(): RunLogEntry[] { return this.entries; }
  checkpoint(label: string): void { this.marks.push(label); }
  checkpoints(): string[] { return this.marks; }
  clearAll(): void {
    this.author = null;
    this.input = null;
    this.chapters.clear();
    this.report = null;
    this.entries = [];
    this.marks = [];
  }
}

const SLOT = 'novel-project:';
const LOG_CAP = 400;

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** One book in the browser, under its own keys. A full localStorage degrades to memory. */
export class BrowserProjectStore extends MemoryProjectStore {
  private backend = storage();

  private read<T>(key: string): T | null {
    if (!this.backend) return null;
    try {
      const raw = this.backend.getItem(SLOT + key);
      return raw ? JSON.parse(raw) as T : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    if (!this.backend) return;
    try { this.backend.setItem(SLOT + key, JSON.stringify(value)); }
    catch (error) { console.warn(`Project slot write failed for ${key}; continuing in memory:`, error); }
  }

  private remove(key: string): void {
    try { this.backend?.removeItem(SLOT + key); } catch { /* memory still holds it */ }
  }

  restore(): boolean {
    const input = this.read<ProjectInput>('input');
    if (!input) return false;
    super.saveInput(input);
    const author = this.read<AuthorDraft>('author');
    if (author) super.saveAuthor(author);
    for (const { chapter, text } of this.read<{ chapter: number; text: string }[]>('manuscript') || []) super.saveManuscript(chapter, text);
    const report = this.read<FinalReport>('report');
    if (report) super.saveReport(report);
    for (const entry of this.read<RunLogEntry[]>('log') || []) super.log(entry.stage, entry.detail);
    for (const mark of this.read<string[]>('checkpoints') || []) super.checkpoint(mark);
    return true;
  }

  saveAuthor(draft: AuthorDraft): void { super.saveAuthor(draft); this.write('author', draft); }
  saveInput(input: ProjectInput): void { super.saveInput(input); this.write('input', input); }
  saveManuscript(chapter: number, text: string): void {
    super.saveManuscript(chapter, text);
    const all = (this.read<{ chapter: number; text: string }[]>('manuscript') || []).filter(item => item.chapter !== chapter);
    all.push({ chapter, text });
    this.write('manuscript', all);
  }
  saveReport(report: FinalReport): void { super.saveReport(report); this.write('report', report); }
  clearReport(): void { super.clearReport(); this.remove('report'); }
  log(stage: string, detail: string): void {
    super.log(stage, detail);
    const entries = [...(this.read<RunLogEntry[]>('log') || []), { at: new Date().toISOString(), stage, detail }];
    this.write('log', entries.slice(-LOG_CAP));
  }
  checkpoint(label: string): void {
    super.checkpoint(label);
    this.write('checkpoints', [...(this.read<string[]>('checkpoints') || []), label]);
  }
  clearAll(): void {
    super.clearAll();
    if (!this.backend) return;
    for (const key of ['author', 'input', 'manuscript', 'report', 'log', 'checkpoints', 'theses', 'progressive', 'design', 'chapter_map', 'style', 'plans', 'scenes', 'state', 'threads', 'ending_readiness', 'snaps']) this.remove(key);
  }
}
