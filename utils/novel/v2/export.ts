import type { ProjectStore } from './store';
import type { ProjectInput } from './types';
import { repairStoredFormatting } from '../manuscript';

/** A portable copy of the book at the desk: input, the author's draft, the manuscript, the report and the log. */
export interface ProjectSnapshot {
  version: 1;
  exportedAt: string;
  files: {
    author_draft?: unknown;
    input: unknown;
    manuscript: unknown;
    final_report: unknown;
    run_log: unknown;
    checkpoints: unknown;
  };
}

export function snapshotProject(store: ProjectStore): ProjectSnapshot {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    files: {
      author_draft: store.loadAuthor(),
      input: store.loadInput(),
      manuscript: store.manuscript(),
      final_report: store.loadReport(),
      run_log: store.runLog(),
      checkpoints: store.checkpoints(),
    },
  };
}

/** Load a snapshot into the store, replacing the live slot. Older pipeline files in the snapshot are left behind. */
export function restoreSnapshot(store: ProjectStore, snap: unknown): void {
  if (!snap || typeof snap !== 'object') throw new Error('Not a project snapshot.');
  const root = snap as Partial<ProjectSnapshot>;
  if (root.version !== 1 || !root.files || typeof root.files !== 'object') throw new Error('Unsupported snapshot version.');
  const files = root.files as Record<string, unknown>;
  if (!files.input || typeof files.input !== 'object') throw new Error('Snapshot has no input.');
  const input = files.input as { premise?: unknown; chapter_count?: unknown };
  if (typeof input.premise !== 'string' || typeof input.chapter_count !== 'number') throw new Error('Snapshot input is malformed.');
  store.clearAll();
  store.saveInput(files.input as ProjectInput);
  const author = files.author_draft;
  if (author && typeof author === 'object' && Array.isArray((author as { chapters?: unknown }).chapters)) store.saveAuthor(author as Parameters<ProjectStore['saveAuthor']>[0]);
  for (const item of (Array.isArray(files.manuscript) ? files.manuscript : []) as { chapter?: unknown; text?: unknown }[]) {
    if (typeof item?.chapter === 'number' && typeof item?.text === 'string') store.saveManuscript(item.chapter, item.text);
  }
  if (files.final_report && typeof files.final_report === 'object') store.saveReport(files.final_report as Parameters<ProjectStore['saveReport']>[0]);
  for (const entry of (Array.isArray(files.run_log) ? files.run_log : []) as { at?: unknown; stage?: unknown; detail?: unknown }[]) {
    const at = typeof entry?.at === 'string' && Number.isFinite(Date.parse(entry.at)) ? entry.at : undefined;
    if (typeof entry?.stage === 'string') store.log(entry.stage, typeof entry.detail === 'string' ? entry.detail : '', at);
  }
  for (const mark of (Array.isArray(files.checkpoints) ? files.checkpoints : []) as unknown[]) {
    if (typeof mark === 'string') store.checkpoint(mark);
  }
  repairStoredFormatting(store);
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
