import { readFile } from 'node:fs/promises';
import { findLatestProjectSnapshot, saveProjectSnapshotToStorage } from '../services/bookStorageService';
import { restoreSnapshot, snapshotProject } from '../utils/novel/v2/export';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import type { AuthorDraft } from '../utils/novel/author';
import type { FinalReport, ProjectInput } from '../utils/novel/v2/types';

/**
 * The book the app has open, read and written where the app keeps it: the autosave in the book's
 * folder in Documents/NovelGenerator. The app reads the newest autosave when it loads, so a page
 * reload shows what an agent did, and an agent that reopens the book sees what the person did.
 */
export class FolderProjectStore extends MemoryProjectStore {
  path: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** True while a saved book is read in: reading is not a change to save back. */
  private loading = false;

  constructor(readonly customBase?: string) { super(); }

  /** The newest book, or the one whose autosave is at `file`. */
  async open(file?: string): Promise<void> {
    // Only a change of ours still waiting is written first; otherwise the copy here is older than the folder's.
    if (this.timer) await this.flush(); else await this.queue.catch(() => undefined);
    const found = file ? { snapshot: JSON.parse(await readFile(file, 'utf8')), path: file } : await findLatestProjectSnapshot(this.customBase);
    if (!found || !found.snapshot?.files?.input) { super.clearAll(); this.path = found?.path || null; return; }
    restoreSnapshot(new MemoryProjectStore(), found.snapshot); // Validate before touching the live slot.
    this.loading = true;
    try { restoreSnapshot(this, found.snapshot); } finally { this.loading = false; }
    this.path = found.path;
  }

  private persistSoon(): void {
    if (this.loading) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.flush().catch(error => console.error('Book folder save failed:', error)); }, 300);
  }

  /** Write the snapshot now. A store without a book writes nothing: an empty slot is not a book. */
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.loadInput()) return this.queue.then(() => undefined, () => undefined);
    const snapshot = snapshotProject(this);
    const write = this.queue.catch(() => undefined).then(() => saveProjectSnapshotToStorage(snapshot, { customBase: this.customBase }));
    this.queue = write;
    this.path = (await write).mainBackupPath;
  }

  saveAuthor(draft: AuthorDraft): void { super.saveAuthor(draft); this.persistSoon(); }
  saveInput(input: ProjectInput): void { super.saveInput(input); this.persistSoon(); }
  saveManuscript(chapter: number, text: string): void { super.saveManuscript(chapter, text); this.persistSoon(); }
  removeManuscript(chapter: number): void { super.removeManuscript(chapter); this.persistSoon(); }
  commitRevision(chapters: { chapter: number; text: string }[], draft: AuthorDraft): void { super.commitRevision(chapters, draft); this.persistSoon(); }
  saveReport(report: FinalReport): void { super.saveReport(report); this.persistSoon(); }
  clearReport(): void { super.clearReport(); this.persistSoon(); }
  log(stage: string, detail: string): void { super.log(stage, detail); this.persistSoon(); }
  checkpoint(label: string): void { super.checkpoint(label); this.persistSoon(); }
  clearAll(): void { super.clearAll(); this.path = null; }
}
