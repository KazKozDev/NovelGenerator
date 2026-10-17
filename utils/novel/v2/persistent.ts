import { restoreSnapshot, snapshotProject } from './export';
import { idbGet, idbSet } from './idb';
import { BrowserProjectStore, MemoryProjectStore } from './store';
import type { AuthorDraft } from '../author';
import type { FinalReport, ProjectInput } from './types';

/**
 * The durable project slot: memory stays the synchronous source of truth for
 * the orchestrator, and every mutation schedules a debounced snapshot write
 * to the repository and a secondary IndexedDB slot. On open, the newest snapshot returns; a localStorage-only book from
 * the previous version migrates forward once and the old keys go away.
 */
export class PersistentProjectStore extends MemoryProjectStore {
  private static readonly KEY = 'project';
  saveStatus: { state: 'saving' | 'saved' | 'error'; savedAt?: number; error?: string } = { state: 'saving' };
  onSaveStatus?: (status: PersistentProjectStore['saveStatus']) => void;
  private queue: Promise<void> = Promise.resolve();
  private revision = 0;
  private status(status: PersistentProjectStore['saveStatus']): void { this.saveStatus = status; this.onSaveStatus?.(status); }
  private timer: ReturnType<typeof setTimeout> | null = null;

  commitRevision(chapters: { chapter: number; text: string }[], draft: Parameters<MemoryProjectStore['saveAuthor']>[0]): void {
    super.commitRevision(chapters, draft);
    this.persistSoon();
  }

  static async open(): Promise<PersistentProjectStore> {
    const store = new PersistentProjectStore();
    let disk: any = null;
    let recoveries: any[] = [];
    const errors: string[] = [];
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch('/api/project-autosave');
        if (!response.ok) throw Error('Repository autosave is unavailable');
        const result = await response.json();
        disk = result.snapshot;
        recoveries = Array.isArray(result.recoveries) ? result.recoveries : [];
        if (result.error) errors.push(result.error);
      } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    }
    let browser: unknown;
    try { browser = await idbGet(PersistentProjectStore.KEY); }
    catch (error) { errors.push(`Browser backup cannot be read: ${String(error)}`); }
    const candidates = [disk, browser, ...recoveries].filter(Boolean).sort((a: any,b: any)=>
      (Date.parse(b.exportedAt)||0) - (Date.parse(a.exportedAt)||0));
    for (const snap of candidates as any[]) {
      try {
        if (snap.version === 1 && snap.files?.input === null && Array.isArray(snap.files.manuscript) && !snap.files.manuscript.length) {
          store.status({state:'saved',savedAt:Date.parse(snap.exportedAt)});
          return store; // A valid reset, never a malformed file, can clear the slot.
        }
        restoreSnapshot(new MemoryProjectStore(), snap); // Validate before touching the live slot.
        restoreSnapshot(store, snap);
        if (errors.length) store.log('recovery', `Recovered a valid backup after: ${errors.join('; ')}`);
        await store.flush().catch(() => undefined);
        return store;
      } catch (error) { errors.push(`Saved project rejected: ${error instanceof Error ? error.message : String(error)}`); }
    }
    const legacy = new BrowserProjectStore();
    if (legacy.restore()) {
      const migrated = snapshotProject(legacy);
      try {
        restoreSnapshot(store, migrated);
      } catch (error) {
        store.status({state:'error',error:`Legacy project recovery failed: ${String(error)}`});
        return store;
      }
      const saved = await store.flush().then(()=>true,()=>false);
      if (saved) legacy.clearAll();
      return store;
    }
    if (errors.length) store.status({state:'error',error:`Project recovery failed: ${errors.join('; ')}`});
    return store;
  }

  private persistSoon(): void {
    this.revision++;
    this.status({state: 'saving', savedAt: this.saveStatus.savedAt});
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
    const snapshot = snapshotProject(this);
    const body = JSON.stringify(snapshot);
    const revision = this.revision;
    const write = this.queue.catch(() => undefined).then(async () => {
      try {
        if (typeof window !== 'undefined') {
          const response = await fetch('/api/project-autosave', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body,
          });
          if (!response.ok) throw Error('Cannot save the project to its book folder in Documents/NovelGenerator');
          const result = await response.json();
          if (revision === this.revision) this.status({state: 'saved', savedAt: result.savedAt});
          // Browser copy is secondary; a successful disk save remains durable.
          await idbSet(PersistentProjectStore.KEY, JSON.parse(body)).catch(() => undefined);
        } else { await idbSet(PersistentProjectStore.KEY, snapshot); }
      } catch (error) {
        if (revision === this.revision) {
          this.status({state: 'error', savedAt: this.saveStatus.savedAt, error: error instanceof Error ? error.message : String(error)});
          if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.flush().catch(() => undefined); }, 5000);
        }
        throw error;
      }
    });
    this.queue = write;
    await write;
  }

  saveAuthor(draft: AuthorDraft): void { super.saveAuthor(draft); this.persistSoon(); }
  saveInput(input: ProjectInput): void { super.saveInput(input); this.persistSoon(); }
  saveManuscript(chapter: number, text: string): void { super.saveManuscript(chapter, text); this.persistSoon(); }
  removeManuscript(chapter: number): void { super.removeManuscript(chapter); this.persistSoon(); }
  saveReport(report: FinalReport): void { super.saveReport(report); this.persistSoon(); }
  clearReport(): void { super.clearReport(); this.persistSoon(); }
  log(stage: string, detail: string): void { super.log(stage, detail); this.persistSoon(); }
  checkpoint(label: string): void { super.checkpoint(label); this.persistSoon(); }
  clearAll(): void {
    super.clearAll();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.persistSoon();
  }
}
