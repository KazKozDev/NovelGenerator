/**
 * What a person has typed or gathered in a book's workspace but not yet saved into the book: an outline, prompt
 * or style edit not yet saved, the editorial chat, the undo history of applied patches. It lives in this browser's
 * localStorage and in the book folder as план/рабочее состояние.json, so a reload or another browser brings it back.
 *
 * An entry may carry a `base`: the saved value it was an edit of. When the saved value has changed since
 * (a regenerated prompt, a new outline), the entry no longer applies and is left out rather than written over it.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { saveToBookFolder } from './saveToBookFolder';

export const WORKSPACE_LABEL = 'рабочее состояние';
export const WORKSPACE_FILE = `${WORKSPACE_LABEL}.json`;

interface Entry { value: unknown; base?: string }
export interface WorkspaceState { version: 1; savedAt: number; entries: Record<string, Entry> }

interface Book { state: WorkspaceState; ready: boolean; loaded: Promise<void>; timer?: ReturnType<typeof setTimeout>; listeners: Set<() => void> }
const books = new Map<string, Book>();
const empty = (): WorkspaceState => ({ version: 1, savedAt: 0, entries: {} });
const localKey = (title: string) => `novel_workspace:${title}`;
const LOCAL_LIMIT = 2_000_000; // Larger states live in the book folder only; localStorage holds a few megabytes in all.

function valid(raw: unknown): raw is WorkspaceState {
  const s = raw as WorkspaceState;
  return !!s && s.version === 1 && typeof s.savedAt === 'number' && !!s.entries && typeof s.entries === 'object';
}

function notify(book: Book) { for (const listener of book.listeners) listener(); }

/** The newer of the browser's and the book folder's copy. */
export function newerWorkspace(local?: WorkspaceState | null, folder?: WorkspaceState | null): WorkspaceState {
  if (!local) return folder || empty();
  if (!folder) return local;
  return folder.savedAt > local.savedAt ? folder : local;
}

function book(title: string): Book {
  let found = books.get(title);
  if (found) return found;
  let local: WorkspaceState | null = null;
  try { const raw = JSON.parse(localStorage.getItem(localKey(title)) || 'null'); if (valid(raw)) local = raw; } catch { /* No browser copy. */ }
  found = { state: local || empty(), ready: false, loaded: Promise.resolve(), listeners: new Set() };
  books.set(title, found);
  const current = found;
  current.loaded = fetch(`/api/book-file?${new URLSearchParams({ title, kind: 'blueprints', name: WORKSPACE_FILE })}`)
    .then(res => res.ok ? res.json() : null)
    .catch(() => null)
    .then(folder => {
      // A change made while the folder copy was on its way wins over it.
      current.state = newerWorkspace(current.state, valid(folder) ? folder : null);
      current.ready = true;
      notify(current);
    });
  return found;
}

function persist(title: string, target: Book) {
  const body = JSON.stringify(target.state);
  try {
    if (body.length < LOCAL_LIMIT) localStorage.setItem(localKey(title), body);
    else localStorage.removeItem(localKey(title));
  } catch { /* The folder copy still goes. */ }
  if (target.timer) clearTimeout(target.timer);
  target.timer = setTimeout(() => {
    target.timer = undefined;
    void saveToBookFolder({ title, kind: 'blueprints', label: WORKSPACE_LABEL, ext: 'json', content: JSON.stringify(target.state, null, 1), stamp: false, replace: true });
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
  const entries = { ...target.state.entries };
  if (value === undefined) {
    if (!(key in entries)) return;
    delete entries[key];
  } else entries[key] = base === undefined ? { value } : { value, base };
  target.state = { version: 1, savedAt: Date.now(), entries };
  notify(target);
  persist(title, target);
}

/** A book's workspace state once its folder copy has been read. */
export async function loadWorkspace(title: string): Promise<WorkspaceState> {
  const target = book(title);
  await target.loaded;
  return target.state;
}

/** For tests: forget what this module has loaded. */
export function resetWorkspaceCache(): void { books.clear(); }

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
