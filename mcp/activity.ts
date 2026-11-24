import type { PromptBook } from '../utils/novel/promptBook';
import type { RunLogEntry } from '../utils/novel/v2/store';

/**
 * What the agent sees of the book: the saved project, and the workspace state the app keeps beside it
 * (the editorial chat, unsaved drafts, the editor's undo history). Comparing two views tells the agent
 * what happened in the app since it last looked, and by whom.
 */
/** The app's workspace state (utils/workspaceState in the app): what is typed but not yet saved, the chat, the undo history. */
export interface WorkspaceState { version: 1; savedAt: number; entries: Record<string, { value: unknown; base?: string }> }
/** Where the app keeps it, in the book's plan folder. */
export const WORKSPACE_FILE = 'рабочее состояние.json';

export interface BookView {
  project: { input?: { title?: string; premise?: string; chapter_count?: number } | null; author_draft?: { promptPlanning?: PromptBook } | null; run_log?: RunLogEntry[]; final_report?: unknown } | null;
  workspace: WorkspaceState | null;
}

/** Who did it: the person at the app, the app's own model run, the app's editor in the chat, or this agent. */
export type Who = 'person' | 'app' | 'app-run' | 'app-editor' | 'agent';
export interface Change { who: Who; what: string; detail?: string; at?: string }

interface ChatMessage { role: 'user' | 'assistant'; text: string; timestamp: number; problems?: { title: string }[]; diffCards?: unknown[] }
interface SavedChat { messages?: ChatMessage[]; statuses?: Record<string, string>; applied?: string[]; rejected?: string[] }

const clip = (text: string, most = 1200) => (text.length > most ? `${text.slice(0, most)}… (${text.length} characters; read it whole with get_editorial_chat)` : text);
const words = (text = '') => text.split(/\s+/).filter(Boolean).length;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const bookOf = (v: BookView) => v.project?.author_draft?.promptPlanning;
const chatOf = (v: BookView) => (v.workspace?.entries.chat?.value || null) as SavedChat | null;
const DRAFTS: Record<string, string> = { outline: 'the outline', style: 'the writing style' };
const draftName = (key: string) => DRAFTS[key] || (key.startsWith('prompt:') ? `the prompt of chapter ${key.slice(7)}` : null);

/** A model call the app made itself: the agent's own calls carry "· agent" in their message. */
function appRun(entry: RunLogEntry): string | null {
  if (entry.stage !== 'model_call') return null;
  try {
    const message: string = JSON.parse(entry.detail).entry?.message || '';
    return message.includes('· agent') ? null : message.split(' · ')[0] || 'model';
  } catch { return null; }
}

/** What changed between two views, everything the agent did not do itself. */
export function describeChanges(before: BookView, after: BookView): Change[] {
  const changes: Change[] = [];
  const add = (who: Who, what: string, detail?: string, at?: string) => changes.push({ who, what, ...(detail ? { detail } : {}), ...(at ? { at } : {}) });
  const a = bookOf(before), b = bookOf(after);
  const titleA = before.project?.input?.title || a?.blueprint?.title, titleB = after.project?.input?.title || b?.blueprint?.title;

  if (before.project?.input?.premise !== after.project?.input?.premise || titleA !== titleB) {
    if (after.project?.input) add('person', `Another book is open in the app now: "${titleB || after.project.input.premise?.slice(0, 80)}". What you knew about the previous one no longer applies.`);
    else add('person', 'The book was closed in the app (Clean Slate).');
    return changes;
  }

  // The app's own runs and stops, from its log.
  const seen = before.project?.run_log?.length || 0;
  const fresh = (after.project?.run_log || []).slice(seen);
  const runs = new Map<string, number>();
  for (const entry of fresh) {
    const stage = appRun(entry);
    if (stage) runs.set(stage, (runs.get(stage) || 0) + 1);
    if (entry.stage === 'stopped' && !entry.detail.startsWith('agent ')) add('app-run', 'A run in the app stopped with an error', clip(entry.detail, 600), entry.at);
  }
  if (runs.size) add('app-run', `The app ran model calls: ${[...runs].map(([stage, n]) => `${stage} ×${n}`).join(', ')}`);

  if (a && b) {
    if ((a.workspaceStage || 'prompts') !== (b.workspaceStage || 'prompts')) add('person', `Switched the app to the ${b.workspaceStage} tab`);
    if (!same(a.style?.profile, b.style?.profile)) add(b.style?.edited ? 'person' : 'app-run', b.style ? 'The writing style changed' : 'The writing style was removed', b.style ? clip(b.style.profile, 600) : undefined);
    if (!same(a.blueprint, b.blueprint)) {
      const changed = (b.blueprint?.chapters || []).filter(c => !same(c, a.blueprint?.chapters.find(x => x.chapter === c.chapter))).map(c => c.chapter);
      const who: Who = runs.has('prompt-blueprint') ? 'app-run' : 'person';
      add(who, !a.blueprint ? 'The outline was made' : `The outline changed${changed.length ? ` (chapters ${changed.join(', ')})` : ' (book level: title, characters, facts or ending)'}`);
    }
    for (const p of b.prompts) {
      const old = a.prompts.find(x => x.chapter === p.chapter);
      if (old && old.system === p.system && old.prompt === p.prompt) continue;
      add(p.edited ? 'person' : 'app-run', old ? `The prompt of chapter ${p.chapter} changed${p.edited ? ' by hand' : ''}` : `The prompt of chapter ${p.chapter} was made`);
    }
    for (const r of (b.reviews || []).filter(r => !(a.reviews || []).some(x => x.createdAt === r.createdAt))) {
      const major = r.findings.filter(f => f.severity === 'major').length;
      add('app-run', `A prompt review found ${r.findings.length} issue(s), ${major} major (review ${r.createdAt})`, clip(r.summary, 500));
    }
    for (const f of (b.fixes || []).filter(f => !(a.fixes || []).some(x => x.createdAt === f.createdAt))) add('app-run', `A review finding was fixed in the prompts of chapters ${[...new Set(f.changes.map(c => c.chapter))].join(', ')}`);
    const storyA = a.story?.chapters || [], storyB = b.story?.chapters || [];
    const editedByHand = (b.storyEdits?.length || 0) !== (a.storyEdits?.length || 0) || b.storyEdits?.at(-1)?.at !== a.storyEdits?.at(-1)?.at;
    const written = storyB.filter(c => !storyA.some(x => x.chapter === c.chapter)).map(c => c.chapter);
    const rewritten = storyB.filter(c => { const old = storyA.find(x => x.chapter === c.chapter); return old && old.text !== c.text; });
    if (written.length) add('app-run', `Chapters written: ${written.join(', ')}`);
    if (rewritten.length) add(editedByHand ? 'person' : 'app-run', `${editedByHand ? 'The person edited' : 'The app rewrote'} chapters ${rewritten.map(c => `${c.chapter} (${words(storyA.find(x => x.chapter === c.chapter)?.text)} → ${words(c.text)} words)`).join(', ')}`);
  }
  if (!same(before.project?.final_report, after.project?.final_report) && after.project?.final_report) add('app-run', 'A new editorial report was saved');

  // The workspace: the chat with the app's editor, drafts not yet saved, applied patches.
  const chatA = chatOf(before), chatB = chatOf(after);
  const known = new Set((chatA?.messages || []).map(m => `${m.timestamp}:${m.role}`));
  for (const m of (chatB?.messages || []).filter(m => !known.has(`${m.timestamp}:${m.role}`))) {
    const extra = [m.problems?.length ? `${m.problems.length} problem(s): ${m.problems.map(p => p.title).join('; ')}` : '', m.diffCards?.length ? `${m.diffCards.length} proposed edit(s)` : ''].filter(Boolean).join(' · ');
    add(m.role === 'user' ? 'person' : 'app-editor', m.role === 'user' ? 'Said in the editorial chat' : `The app's editor answered in the chat${extra ? ` (${extra})` : ''}`, clip(m.text), new Date(m.timestamp).toISOString());
  }
  const decided = (list?: string[]) => new Set(list || []);
  const applied = [...decided(chatB?.applied)].filter(id => !decided(chatA?.applied).has(id)).length, rejected = [...decided(chatB?.rejected)].filter(id => !decided(chatA?.rejected).has(id)).length;
  if (applied || rejected) add('person', `In the editorial chat: applied ${applied}, rejected ${rejected} proposed edit(s)`);
  const keys = (v: BookView) => new Set(Object.keys(v.workspace?.entries || {}).filter(draftName));
  const draftsA = keys(before), draftsB = keys(after);
  for (const key of draftsB) if (!draftsA.has(key)) add('person', `Started editing ${draftName(key)} (not saved yet)`);
  for (const key of draftsA) if (!draftsB.has(key)) add('person', `Finished or dropped the unsaved edit of ${draftName(key)}`);
  const undoA = (before.workspace?.entries.undo?.value as unknown[] | undefined)?.length || 0, undoB = (after.workspace?.entries.undo?.value as unknown[] | undefined)?.length || 0;
  if (undoB !== undoA) add('person', undoB > undoA ? `Applied ${undoB - undoA} edit(s) in the manuscript editor` : `Undid ${undoA - undoB} edit(s) in the manuscript editor`);
  return changes;
}

export interface Attention { level: 'wait' | 'warn' | 'suggest'; why: string; suggestion: string }

/**
 * When the agent should speak up, and when it should keep quiet: read from the book as it is now and
 * from what just happened. The agent decides what to say; this only names the moments.
 */
export function attention(view: BookView, recent: Change[], now = Date.now(), screen?: { visible: boolean; focus?: { what: string; value?: string }; ageSeconds: number } | null): Attention[] {
  const out: Attention[] = [];
  for (const c of recent.filter(c => c.who === 'app' && /shown on the app screen/.test(c.what))) out.push({ level: 'warn', why: `The app shows an error: ${c.detail}`, suggestion: 'Say what it means in plain words and what to do about it.' });
  if (screen?.visible && screen.ageSeconds < 30 && screen.focus?.value !== undefined) out.push({ level: 'wait', why: `The person is typing in ${screen.focus.what}.`, suggestion: 'Let them finish; do not change what they are writing.' });
  const book = bookOf(view);
  const drafts = Object.keys(view.workspace?.entries || {}).map(draftName).filter(Boolean);
  const lastPerson = Math.max(0, ...recent.filter(c => c.who === 'person' && c.at).map(c => Date.parse(c.at!)));
  if (drafts.length) out.push({ level: 'wait', why: `The person is editing ${drafts.join(', ')} and has not saved it.`, suggestion: 'Do not change those parts or run a stage that rewrites them; wait, or offer help with that edit.' });
  else if (now - lastPerson < 2 * 60_000) out.push({ level: 'wait', why: 'The person was working in the app in the last two minutes.', suggestion: 'Keep any remark short and do not start a stage unasked.' });
  for (const c of recent.filter(c => c.who === 'app-run' && /stopped with an error/.test(c.what))) out.push({ level: 'warn', why: `${c.what}: ${c.detail}`, suggestion: 'Explain the cause in plain words and offer to continue the stage.' });
  const chat = chatOf(view)?.messages || [];
  const last = chat.at(-1);
  if (last?.role === 'user') out.push({ level: 'suggest', why: 'The person\'s last message in the editorial chat has no answer.', suggestion: 'Offer to answer it yourself, reading the chapters it is about.' });
  if (last?.role === 'assistant' && last.problems?.length && recent.some(c => c.who === 'app-editor')) out.push({ level: 'suggest', why: `The app's editor raised ${last.problems.length} problem(s).`, suggestion: 'Say which you agree with and offer to fix those, quoting the passages.' });
  if (book) {
    const current = (book.reviews || []).at(-1);
    if (current && current.findings.some(f => f.severity === 'major') && !(book.fixes || []).some(f => f.reviewCreatedAt === current.createdAt))
      out.push({ level: 'suggest', why: 'The latest prompt review has major findings that are not fixed.', suggestion: 'Offer fix_prompt_issue for them, or explain why one is not a real problem.' });
    if (book.story?.chapters.length && book.story.revision !== book.revision) out.push({ level: 'suggest', why: 'The outline changed after the story was written.', suggestion: 'Name the chapters that no longer match and offer to rewrite only those.' });
    else {
      const stale = (book.story?.chapters || []).filter(c => { const p = book.prompts.find(x => x.chapter === c.chapter); return p && (p.system !== c.system || p.prompt !== c.prompt); }).map(c => c.chapter);
      if (stale.length) out.push({ level: 'suggest', why: `The prompts of chapters ${stale.join(', ')} changed after they were written.`, suggestion: 'Offer to rewrite those chapters from their new prompts.' });
    }
  }
  return out;
}
