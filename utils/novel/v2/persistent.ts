import { restoreSnapshot, snapshotProject } from './export';
import { idbDel, idbGet, idbSet } from './idb';
import { BrowserProjectStore, MemoryProjectStore, type SceneRecord } from './store';
import type {
  BookDesign,
  ChapterPlan,
  FinalReport,
  ProjectInput,
  ReaderThread,
  StoryState,
  StyleContract,
} from './types';

/**
 * The durable project slot: memory stays the synchronous source of truth for
 * the orchestrator, and every mutation schedules a debounced snapshot write
 * to IndexedDB. On open, the snapshot returns; a localStorage-only book from
 * the previous version migrates forward once and the old keys go away.
 */
export class PersistentProjectStore extends MemoryProjectStore {
  private static readonly KEY = 'project';
  private timer: ReturnType<typeof setTimeout> | null = null;

  static async open(): Promise<PersistentProjectStore> {
    const store = new PersistentProjectStore();
    const snap = await idbGet(PersistentProjectStore.KEY);
    if (snap && typeof snap === 'object') {
      try {
        restoreSnapshot(store, snap);
        return store;
      } catch {
        // A corrupt snapshot is not a book: fall through to the legacy slot.
      }
    }
    const legacy = new BrowserProjectStore();
    if (legacy.restore()) {
      const migrated = snapshotProject(legacy);
      try {
        restoreSnapshot(store, migrated);
      } catch {
        return store;
      }
      await store.flush();
      legacy.clearAll();
    }
    return store;
  }

  private persistSoon(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch(() => undefined);
    }, 400);
  }

  /** Write the snapshot now instead of at the next debounce tick. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      await idbSet(PersistentProjectStore.KEY, snapshotProject(this));
    } catch {
      // The run continues in memory; the next mutation retries the write.
    }
  }

  saveInput(input: ProjectInput): void { super.saveInput(input); this.persistSoon(); }
  saveDesign(design: BookDesign): void { super.saveDesign(design); this.persistSoon(); }
  saveStyleContract(style: StyleContract): void { super.saveStyleContract(style); this.persistSoon(); }
  saveChapterPlan(plan: ChapterPlan): void { super.saveChapterPlan(plan); this.persistSoon(); }
  saveScene(record: SceneRecord): void { super.saveScene(record); this.persistSoon(); }
  saveState(state: StoryState): void { super.saveState(state); this.persistSoon(); }
  saveThreads(threads: ReaderThread[]): void { super.saveThreads(threads); this.persistSoon(); }
  saveManuscript(chapter: number, text: string): void { super.saveManuscript(chapter, text); this.persistSoon(); }
  saveReport(report: FinalReport): void { super.saveReport(report); this.persistSoon(); }
  log(stage: string, detail: string): void { super.log(stage, detail); this.persistSoon(); }
  checkpoint(label: string): void { super.checkpoint(label); this.persistSoon(); }
  saveStateSnapshot(chapter: number, state: StoryState): void { super.saveStateSnapshot(chapter, state); this.persistSoon(); }
  clearChapterScenes(chapter: number): void { super.clearChapterScenes(chapter); this.persistSoon(); }
  clearAll(): void {
    super.clearAll();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    idbDel(PersistentProjectStore.KEY).catch(() => undefined);
  }
}
