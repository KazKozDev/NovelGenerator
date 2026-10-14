import type { ProjectStore } from '../v2/store';
import type { ProjectInput } from '../v2/types';
import { authorKey } from './author';
import { chapterFile, deskBudget } from './authorDesk';

/** Explicit invocation only. Keep the source manuscript/report in the exported project. */
export function prepareEditorialPass(input: ProjectInput, store: ProjectStore): void {
  const draft = store.loadAuthor();
  if (!draft?.desk || draft.input_key !== authorKey(input)) throw new Error('Open the saved book with its original premise and settings before editing.');
  const desk = draft.desk;
  if (desk.editorial?.active && !desk.finished) return; // Resume an interrupted pass.
  const report = store.loadReport();
  if (!draft.completed || !report || Array.from({ length: input.chapter_count }, (_, index) => desk.files[chapterFile(index + 1)]).some(text => !text?.trim())) {
    throw new Error('Finish the complete draft and its report before starting an editorial pass.');
  }
  if (desk.editorial) desk.editorial_history = [...(desk.editorial_history || []), structuredClone(desk.editorial)];
  desk.editorial = { active: true, sourceFiles: { ...desk.files }, sourceReport: structuredClone(report), startedAt: new Date().toISOString() };
  desk.finished = false;
  desk.spent = 0;
  desk.budget = deskBudget(input.chapter_count);
  desk.bonus = undefined;
  desk.offered = false;
  desk.look_streak = 0;
  desk.free_looks = 0;
  desk.told_promises = true;
  desk.failed_edits = [];
  desk.audit = undefined;
  desk.plan_review = undefined;
  desk.answers.forEach(answer => { answer.stale = true; });
  desk.journal.push(`${desk.step}. separate editorial pass started; source manuscript and report preserved`);
  draft.completed = false;
  store.saveAuthor(draft);
  store.clearReport();
  store.log('editorial', 'Separate editorial pass started. All chapters may be revised together; the source manuscript and report are preserved in the project.');
  store.checkpoint('editorial-source');
}
