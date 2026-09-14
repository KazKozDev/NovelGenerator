import type { BookDesign, ChapterMapEntry, ChapterPlan, EndingReadiness, FinalReport, ProjectInput, ReaderThread, SceneHandoff, StateDelta, StoryState, StyleContract } from './types';
import type { QuestionResolution } from './tracker';

/**
 * The project layout from the architecture (§10), behind an interface so the
 * orchestrator never touches storage directly:
 *
 *   input.json / book_design.json / chapter_map.json / style_contract.json
 *   state.json / threads.json / manuscript/ / scene_plans/ / evidence/
 *   checkpoints/ / run_log.jsonl / final_report.json
 *
 * One accepted scene and its state update are stored as a single agreed version;
 * attempt counters live outside the text and are never rolled back with it.
 */
export interface SceneRecord {
  id: string;
  chapter: number;
  prose: string;
  paragraph_ids: string[];
  plan: ChapterPlan['scenes'][number] | null;
  delta: StateDelta | null;
  /** Explicit semantic state passed to the next scene, persisted with the evidence that produced it. */
  handoff?: SceneHandoff;
  /** Answers folded with the delta, so a resume replays instead of re-asking. */
  resolutions?: QuestionResolution[];
}

export interface RunLogEntry {
  at: string;
  stage: string;
  detail: string;
}

export interface ProjectStore {
  saveInput(input: ProjectInput): void;
  loadInput(): ProjectInput | null;
  saveDesign(design: BookDesign): void;
  loadDesign(): BookDesign | null;
  /** The chapter map as its own artifact (§10), kept in sync with the design. */
  loadChapterMap(): ChapterMapEntry[] | null;
  saveStyleContract(style: StyleContract): void;
  saveChapterPlan(plan: ChapterPlan): void;
  loadChapterPlan(chapter: number): ChapterPlan | null;
  saveScene(record: SceneRecord): void;
  chapterScenes(chapter: number): SceneRecord[];
  saveState(state: StoryState): void;
  loadState(): StoryState;
  saveThreads(threads: ReaderThread[]): void;
  loadThreads(): ReaderThread[];
  /** What the ending still needs, as of the last finished chapter. */
  saveEndingReadiness(readiness: EndingReadiness): void;
  loadEndingReadiness(): EndingReadiness | null;
  saveManuscript(chapter: number, text: string): void;
  manuscript(): { chapter: number; text: string }[];
  saveReport(report: FinalReport): void;
  loadReport(): FinalReport | null;
  log(stage: string, detail: string): void;
  runLog(): RunLogEntry[];
  checkpoint(label: string): void;
  checkpoints(): string[];
  /** State as of a finished chapter, so a resume never re-applies deltas. */
  saveStateSnapshot(chapter: number, state: StoryState): void;
  loadStateSnapshot(chapter: number): StoryState | null;
  /** Drop a chapter's unfinished scenes (its deltas go with them). */
  clearChapterScenes(chapter: number): void;
  /** Wipe the whole project slot for a fresh book. */
  clearAll(): void;
}

export function emptyState(): StoryState {
  return { facts: [], events: [], conditions: {}, knowledge: {}, beliefs: {}, reader_disclosures: [], names: [] };
}

export class MemoryProjectStore implements ProjectStore {
  private input: ProjectInput | null = null;
  private design: BookDesign | null = null;
  private style: StyleContract | null = null;
  private plans = new Map<number, ChapterPlan>();
  private scenes: SceneRecord[] = [];
  private state: StoryState = emptyState();
  private threads: ReaderThread[] = [];
  private readiness: EndingReadiness | null = null;
  private chapters = new Map<number, string>();
  private report: FinalReport | null = null;
  private entries: RunLogEntry[] = [];
  private marks: string[] = [];

  saveInput(input: ProjectInput): void { this.input = input; }
  loadInput(): ProjectInput | null { return this.input; }
  saveDesign(design: BookDesign): void { this.design = design; }
  loadDesign(): BookDesign | null { return this.design; }
  loadChapterMap(): ChapterMapEntry[] | null { return this.design?.chapter_map || null; }
  saveStyleContract(style: StyleContract): void { this.style = style; }
  saveChapterPlan(plan: ChapterPlan): void { this.plans.set(plan.chapter, plan); }
  loadChapterPlan(chapter: number): ChapterPlan | null { return this.plans.get(chapter) || null; }
  saveScene(record: SceneRecord): void {
    this.scenes = this.scenes.filter(item => item.id !== record.id);
    this.scenes.push(record);
  }
  chapterScenes(chapter: number): SceneRecord[] {
    return this.scenes.filter(item => item.chapter === chapter);
  }
  saveState(state: StoryState): void { this.state = state; }
  loadState(): StoryState { return this.state; }
  saveThreads(threads: ReaderThread[]): void { this.threads = threads; }
  loadThreads(): ReaderThread[] { return this.threads; }
  saveEndingReadiness(readiness: EndingReadiness): void { this.readiness = readiness; }
  loadEndingReadiness(): EndingReadiness | null { return this.readiness; }
  saveManuscript(chapter: number, text: string): void { this.chapters.set(chapter, text); }
  manuscript(): { chapter: number; text: string }[] {
    return [...this.chapters.entries()].map(([chapter, text]) => ({ chapter, text }));
  }
  saveReport(report: FinalReport): void { this.report = report; }
  loadReport(): FinalReport | null { return this.report; }
  log(stage: string, detail: string): void {
    this.entries.push({ at: new Date().toISOString(), stage, detail });
  }
  runLog(): RunLogEntry[] { return this.entries; }
  checkpoint(label: string): void { this.marks.push(label); }
  checkpoints(): string[] { return this.marks; }
  private snaps = new Map<number, StoryState>();
  saveStateSnapshot(chapter: number, state: StoryState): void {
    this.snaps.set(chapter, structuredClone(state));
  }
  loadStateSnapshot(chapter: number): StoryState | null {
    const snap = this.snaps.get(chapter);
    return snap ? structuredClone(snap) : null;
  }
  clearChapterScenes(chapter: number): void {
    this.scenes = this.scenes.filter(item => item.chapter !== chapter);
  }
  clearAll(): void {
    this.input = null;
    this.design = null;
    this.style = null;
    this.plans = new Map();
    this.scenes = [];
    this.state = emptyState();
    this.threads = [];
    this.readiness = null;
    this.chapters = new Map();
    this.report = null;
    this.entries = [];
    this.marks = [];
    this.snaps = new Map();
  }
}

const SLOT = 'ngv2.';
const LOG_CAP = 300;

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * The §10 project slot in the browser: one active book, every artifact under
 * its own key, writes quota-guarded so a full localStorage degrades to
 * memory instead of killing the run.
 */
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
    try {
      this.backend.setItem(SLOT + key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Project slot write failed for ${key}; continuing in memory:`, error);
    }
  }

  private remove(key: string): void {
    try { this.backend?.removeItem(SLOT + key); } catch { /* memory still holds it */ }
  }

  /** Load the persisted slot into this store's memory. Returns true when a book was found. */
  restore(): boolean {
    const input = this.read<ProjectInput>('input');
    if (!input) return false;
    super.saveInput(input);
    const design = this.read<BookDesign>('design');
    if (design) super.saveDesign(design);
    const style = this.read<StyleContract>('style');
    if (style) super.saveStyleContract(style);
    for (const plan of this.read<ChapterPlan[]>('plans') || []) super.saveChapterPlan(plan);
    // Scenes carry their deltas; restoring them restores the in-memory trail.
    for (const scene of this.read<SceneRecord[]>('scenes') || []) super.saveScene(scene);
    const state = this.read<StoryState>('state');
    if (state) super.saveState(state);
    super.saveThreads(this.read<ReaderThread[]>('threads') || []);
    const readiness = this.read<EndingReadiness>('ending_readiness');
    if (readiness) super.saveEndingReadiness(readiness);
    for (const { chapter, text } of this.read<{ chapter: number; text: string }[]>('manuscript') || []) {
      super.saveManuscript(chapter, text);
    }
    const report = this.read<FinalReport>('report');
    if (report) super.saveReport(report);
    for (const entry of this.read<RunLogEntry[]>('log') || []) super.log(entry.stage, entry.detail);
    for (const mark of this.read<string[]>('checkpoints') || []) super.checkpoint(mark);
    for (const [chapter, snap] of Object.entries(this.read<Record<string, StoryState>>('snaps') || {})) {
      super.saveStateSnapshot(Number(chapter), snap);
    }
    return true;
  }

  saveInput(input: ProjectInput): void { super.saveInput(input); this.write('input', input); }
  saveDesign(design: BookDesign): void {
    super.saveDesign(design);
    this.write('design', design);
    this.write('chapter_map', design.chapter_map);
  }
  loadChapterMap(): ChapterMapEntry[] | null {
    return this.read<ChapterMapEntry[]>('chapter_map') || super.loadChapterMap();
  }
  saveStyleContract(style: StyleContract): void { super.saveStyleContract(style); this.write('style', style); }
  saveChapterPlan(plan: ChapterPlan): void {
    super.saveChapterPlan(plan);
    const plans = (this.read<ChapterPlan[]>('plans') || []).filter(p => p.chapter !== plan.chapter);
    plans.push(plan);
    this.write('plans', plans);
  }
  saveScene(record: SceneRecord): void {
    super.saveScene(record);
    const scenes = (this.read<SceneRecord[]>('scenes') || []).filter(s => s.id !== record.id);
    scenes.push(record);
    this.write('scenes', scenes);
  }
  saveState(state: StoryState): void { super.saveState(state); this.write('state', state); }
  saveThreads(threads: ReaderThread[]): void { super.saveThreads(threads); this.write('threads', threads); }
  saveEndingReadiness(readiness: EndingReadiness): void {
    super.saveEndingReadiness(readiness);
    this.write('ending_readiness', readiness);
  }
  saveManuscript(chapter: number, text: string): void {
    super.saveManuscript(chapter, text);
    const all = (this.read<{ chapter: number; text: string }[]>('manuscript') || []).filter(m => m.chapter !== chapter);
    all.push({ chapter, text });
    this.write('manuscript', all);
  }
  saveReport(report: FinalReport): void { super.saveReport(report); this.write('report', report); }
  log(stage: string, detail: string): void {
    super.log(stage, detail);
    const entries = [...(this.read<RunLogEntry[]>('log') || []), { at: new Date().toISOString(), stage, detail }];
    this.write('log', entries.slice(-LOG_CAP));
  }
  checkpoint(label: string): void {
    super.checkpoint(label);
    this.write('checkpoints', [...(this.read<string[]>('checkpoints') || []), label]);
  }
  saveStateSnapshot(chapter: number, state: StoryState): void {
    super.saveStateSnapshot(chapter, state);
    const snaps = this.read<Record<string, StoryState>>('snaps') || {};
    snaps[String(chapter)] = state;
    this.write('snaps', snaps);
  }
  clearChapterScenes(chapter: number): void {
    super.clearChapterScenes(chapter);
    this.write('scenes', (this.read<SceneRecord[]>('scenes') || []).filter(s => s.chapter !== chapter));
  }
  clearAll(): void {
    super.clearAll();
    if (!this.backend) return;
    for (const key of ['input', 'design', 'chapter_map', 'style', 'plans', 'scenes', 'state', 'threads', 'ending_readiness', 'manuscript', 'report', 'log', 'checkpoints', 'snaps']) {
      this.remove(key);
    }
  }
}
