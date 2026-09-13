import { validateBookDesign } from './designer';
import type { ProjectStore } from './store';

/**
 * The §10 project as portable files: one versioned snapshot holding every
 * artifact (input, design, chapter map, style, plans, scenes, state, threads,
 * manuscript, report, log, checkpoints, snapshots). The snapshot is the backup
 * and transfer format; restore validates before touching the live slot.
 */
export interface ProjectSnapshot {
  version: 1;
  exportedAt: string;
  files: {
    input: unknown;
    book_design: unknown;
    chapter_map: unknown;
    style_contract: unknown;
    scene_plans: unknown;
    scenes: unknown;
    state: unknown;
    threads: unknown;
    manuscript: unknown;
    final_report: unknown;
    run_log: unknown;
    checkpoints: unknown;
    state_snapshots: unknown;
  };
}

export function snapshotProject(store: ProjectStore): ProjectSnapshot {
  const design = store.loadDesign();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    files: {
      input: store.loadInput(),
      book_design: design,
      chapter_map: store.loadChapterMap(),
      style_contract: design?.style_contract || null,
      scene_plans: collectPlans(store),
      scenes: collectScenes(store),
      state: store.loadState(),
      threads: store.loadThreads(),
      manuscript: store.manuscript(),
      final_report: store.loadReport(),
      run_log: store.runLog(),
      checkpoints: store.checkpoints(),
      state_snapshots: collectSnapshots(store),
    },
  };
}

function collectPlans(store: ProjectStore): unknown[] {
  const plans: unknown[] = [];
  const design = store.loadDesign();
  const count = design?.chapter_map.length || 0;
  for (let chapter = 1; chapter <= count; chapter++) {
    const plan = store.loadChapterPlan(chapter);
    if (plan) plans.push(plan);
  }
  return plans;
}

function collectScenes(store: ProjectStore): unknown[] {
  const design = store.loadDesign();
  const count = design?.chapter_map.length || 0;
  const scenes: unknown[] = [];
  for (let chapter = 1; chapter <= count; chapter++) scenes.push(...store.chapterScenes(chapter));
  return scenes;
}

function collectSnapshots(store: ProjectStore): Record<string, unknown> {
  const snaps: Record<string, unknown> = {};
  const design = store.loadDesign();
  const count = design?.chapter_map.length || 0;
  for (let chapter = 1; chapter <= count; chapter++) {
    const snap = store.loadStateSnapshot(chapter);
    if (snap) snaps[String(chapter)] = snap;
  }
  return snaps;
}

/** Validate and load a snapshot into the store, replacing the live slot. */
export function restoreSnapshot(store: ProjectStore, snap: unknown): void {
  if (!snap || typeof snap !== 'object') throw new Error('Not a project snapshot.');
  const root = snap as Partial<ProjectSnapshot>;
  if (root.version !== 1 || !root.files || typeof root.files !== 'object') {
    throw new Error('Unsupported snapshot version.');
  }
  const files = root.files as Record<string, unknown>;
  if (!files.input || typeof files.input !== 'object') throw new Error('Snapshot has no input.');
  const input = files.input as { premise?: unknown; chapter_count?: unknown };
  if (typeof input.premise !== 'string' || typeof input.chapter_count !== 'number') {
    throw new Error('Snapshot input is malformed.');
  }
  if (files.book_design) validateBookDesign(files.book_design, input.chapter_count);
  store.clearAll();
  store.saveInput(files.input as Parameters<ProjectStore['saveInput']>[0]);
  if (files.book_design) store.saveDesign(files.book_design as Parameters<ProjectStore['saveDesign']>[0]);
  if (files.style_contract && typeof files.style_contract === 'object') {
    store.saveStyleContract(files.style_contract as Parameters<ProjectStore['saveStyleContract']>[0]);
  }
  for (const plan of (Array.isArray(files.scene_plans) ? files.scene_plans : []) as Parameters<ProjectStore['saveChapterPlan']>[0][]) {
    if (plan && typeof plan.chapter === 'number') store.saveChapterPlan(plan);
  }
  for (const scene of (Array.isArray(files.scenes) ? files.scenes : []) as Parameters<ProjectStore['saveScene']>[0][]) {
    if (scene && typeof scene.id === 'string' && typeof scene.chapter === 'number') store.saveScene(scene);
  }
  if (files.state && typeof files.state === 'object') store.saveState(files.state as Parameters<ProjectStore['saveState']>[0]);
  if (Array.isArray(files.threads)) store.saveThreads(files.threads as Parameters<ProjectStore['saveThreads']>[0]);
  for (const item of (Array.isArray(files.manuscript) ? files.manuscript : []) as { chapter?: unknown; text?: unknown }[]) {
    if (typeof item?.chapter === 'number' && typeof item?.text === 'string') store.saveManuscript(item.chapter, item.text);
  }
  if (files.final_report && typeof files.final_report === 'object') {
    store.saveReport(files.final_report as Parameters<ProjectStore['saveReport']>[0]);
  }
  for (const entry of (Array.isArray(files.run_log) ? files.run_log : []) as { stage?: unknown; detail?: unknown }[]) {
    if (typeof entry?.stage === 'string') store.log(entry.stage, typeof entry.detail === 'string' ? entry.detail : '');
  }
  for (const mark of (Array.isArray(files.checkpoints) ? files.checkpoints : []) as unknown[]) {
    if (typeof mark === 'string') store.checkpoint(mark);
  }
  const snaps = (files.state_snapshots && typeof files.state_snapshots === 'object' ? files.state_snapshots : {}) as Record<string, unknown>;
  for (const [chapter, state] of Object.entries(snaps)) {
    if (state && typeof state === 'object') store.saveStateSnapshot(Number(chapter), state as Parameters<ProjectStore['saveStateSnapshot']>[1]);
  }
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
