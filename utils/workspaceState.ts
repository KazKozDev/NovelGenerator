/**
 * What a person has typed or gathered in a book's workspace but not yet saved into the book: an outline, prompt
 * or style edit not yet saved, the editorial chat, the undo history of applied patches. It lives in this browser's
 * localStorage and in the book folder as план/рабочее состояние.json, so a reload or another browser brings it back.
 *
 * An entry may carry a `base`: the saved value it was an edit of. When the saved value has changed since
 * (a regenerated prompt, a new outline), the entry no longer applies and is left out rather than written over it.
 *
 * Two windows may work on one book at once, so copies merge entry by entry: each entry carries when it was set
 * (`at`), a removal leaves its time under `removed`, and the later of the two wins. Before the folder copy is written
 * it is read again and merged, so another window's entries are kept. Files written before entries had times load
 * with the file's own savedAt as every entry's time.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { saveToBookFolder } from './saveToBookFolder';

export const WORKSPACE_LABEL = 'рабочее состояние';
export const WORKSPACE_FILE = `${WORKSPACE_LABEL}.json`;

interface Entry { value: unknown; base?: string; at?: number }
export interface WorkspaceState { version: 1; savedAt: number; entries: Record<string, Entry>; removed?: Record<string, number> }

interface Book { state: WorkspaceState; ready: boolean; loaded: Promise<void>; timer?: ReturnType<typeof setTimeout>; listeners: Set<() => void> }
const books = new Map<string, Book>();
const empty = (): WorkspaceState => ({ version: 1, savedAt: 0, entries: {} });
const localKey = (title: string) => `novel_workspace:${title}`;
const LOCAL_LIMIT = 2_000_000; // Larger states live in the book folder only; localStorage holds a few megabytes in all.
const REMOVED_KEPT = 90 * 24 * 3600_000; // A removal is remembered this long, so an older copy cannot bring the entry back.

function valid(raw: unknown): raw is WorkspaceState {
  const s = raw as WorkspaceState;
  return !!s && s.version === 1 && typeof s.savedAt === 'number' && !!s.entries && typeof s.entries === 'object';
}

function notify(book: Book) { for (const listener of book.listeners) listener(); }

/** Both copies entry by entry: for each key the later of an entry and a removal wins; on a tie, the first copy's. */
export function mergeWorkspaces(first?: WorkspaceState | null, second?: WorkspaceState | null): WorkspaceState {
  if (!first) return second || empty();
  if (!second) return first;
  const entries: Record<string, Entry> = {};
  const removed: Record<string, number> = {};
  const keys = new Set([first, second].flatMap(s => [...Object.keys(s.entries), ...Object.keys(s.removed || {})]));
  const oldest = Math.max(first.savedAt, second.savedAt) - REMOVED_KEPT;
  for (const key of keys) {
    let best: { entry?: Entry; at: number } | null = null;
    for (const s of [first, second]) {
      const entry = s.entries[key];
      const gone = s.removed?.[key];
      const candidate = entry && (gone === undefined || (entry.at ?? s.savedAt) > gone)
        ? { entry, at: entry.at ?? s.savedAt }
        : gone !== undefined ? { at: gone } : null;
      if (candidate && (!best || candidate.at > best.at)) best = candidate;
    }
    if (!best) continue;
    if (best.entry) entries[key] = best.entry.at === undefined ? { ...best.entry, at: best.at } : best.entry;
    else if (best.at >= oldest) removed[key] = best.at;
  }
  return { version: 1, savedAt: Math.max(first.savedAt, second.savedAt), entries, removed };
}

function readLocal(title: string): WorkspaceState | null {
  try { const raw = JSON.parse(localStorage.getItem(localKey(title)) || 'null'); return valid(raw) ? raw : null; } catch { return null; }
}

function readFolder(title: string): Promise<WorkspaceState | null> {
  return fetch(`/api/book-file?${new URLSearchParams({ title, kind: 'blueprints', name: WORKSPACE_FILE })}`)
    .then(res => res.ok ? res.json() : null)
    .catch(() => null)
    .then(folder => valid(folder) ? folder : null);
}

/** Takes in another copy; tells the listeners only when something came of it. */
function absorb(target: Book, other: WorkspaceState | null) {
  const before = JSON.stringify(target.state.entries);
  const merged = mergeWorkspaces(target.state, other);
  // Removals alone change nothing anyone sees; the state stays the same object.
  if (JSON.stringify(merged.entries) === before) { target.state.removed = merged.removed; return; }
  target.state = merged;
  notify(target);
}

function book(title: string): Book {
  let found = books.get(title);
  if (found) return found;
  found = { state: readLocal(title) || empty(), ready: false, loaded: Promise.resolve(), listeners: new Set() };
  books.set(title, found);
  const current = found;
  current.loaded = readFolder(title).then(folder => {
    // A change made while the folder copy was on its way is merged with it, entry by entry.
    absorb(current, folder);
    current.ready = true;
    notify(current);
  });
  return found;
}

function persist(title: string, target: Book) {
  // Another window of this browser may have saved since; its entries are kept.
  absorb(target, readLocal(title));
  const body = JSON.stringify(target.state);
  try {
    if (body.length < LOCAL_LIMIT) localStorage.setItem(localKey(title), body);
    else localStorage.removeItem(localKey(title));
  } catch { /* The folder copy still goes. */ }
  if (target.timer) clearTimeout(target.timer);
  target.timer = setTimeout(() => {
    target.timer = undefined;
    // The folder copy is read again just before it is written, so another window's entries survive this one.
    void target.loaded.then(() => readFolder(title)).then(folder => {
      absorb(target, folder);
      return saveToBookFolder({ title, kind: 'blueprints', label: WORKSPACE_LABEL, ext: 'json', content: JSON.stringify(target.state, null, 1), stamp: false, replace: true });
    });
  }, 800);
}

/** An entry's value, or undefined when there is none or its base no longer matches. */
export function readEntry<T>(state: WorkspaceState, key: string, base?: string): T | undefined {
  const entry = state.entries[key];
  if (!entry || entry.base !== base) return undefined;
  return entry.value as T;
}

/** Sets an entry (undefined removes it) and saves the book's workspace state. */
export function writeEntry(title: string, key: string, value: unknown, base?: string): void {
  const target = book(title);
  const at = Date.now();
  const entries = { ...target.state.entries };
  const removed = { ...target.state.removed };
  if (value === undefined) {
    if (!(key in entries)) return;
    delete entries[key];
    removed[key] = at;
  } else {
    entries[key] = base === undefined ? { value, at } : { value, base, at };
    delete removed[key];
  }
  target.state = { version: 1, savedAt: at, entries, removed };
  notify(target);
  persist(title, target);
}

/** A book's workspace state once its folder copy has been read. */
export async function loadWorkspace(title: string): Promise<WorkspaceState> {
  const target = book(title);
  await target.loaded;
  return target.state;
}

/** For tests: forget what this module has loaded, and drop the saves still waiting. */
export function resetWorkspaceCache(): void {
  for (const target of books.values()) if (target.timer) clearTimeout(target.timer);
  books.clear();
}

/**
 * One entry of a book's workspace state: its value (undefined when there is none), a setter that saves it
 * (undefined removes it), and whether the book folder's copy has been read yet.
 */
export function useWorkspaceEntry<T>(title: string, key: string, base?: string): [T | undefined, (value: T | undefined) => void, boolean] {
  const target = book(title);
  const subscribe = useCallback((listener: () => void) => { target.listeners.add(listener); return () => { target.listeners.delete(listener); }; }, [target]);
  const state = useSyncExternalStore(subscribe, () => target.state, () => target.state);
  const ready = useSyncExternalStore(subscribe, () => target.ready, () => target.ready);
  // An entry whose saved value moved on is dropped once the folder copy is in, so it does not linger.
  const stale = ready && !!state.entries[key] && state.entries[key].base !== base;
  useEffect(() => { if (stale) writeEntry(title, key, undefined); }, [stale, title, key]);
  const set = useCallback((value: T | undefined) => writeEntry(title, key, value, base), [title, key, base]);
  return [readEntry<T>(state, key, base), set, ready];
}
