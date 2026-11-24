import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import { projectAutosavePlugin } from '../services/projectAutosavePlugin';
import { loadWorkspace, mergeWorkspaces, readEntry, resetWorkspaceCache, writeEntry, WORKSPACE_FILE, type WorkspaceState } from '../utils/workspaceState';

const TITLE = 'Пикник на обочине';

describe('workspace state: what is typed but not yet saved into the book', () => {
  let root = '';
  let server: Server | null = null;
  let local: Map<string, string>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'novel-workspace-'));
    const routes = new Map<string, Function>();
    (projectAutosavePlugin(root).configureServer as Function)({ middlewares: { use: (route: string, fn: Function) => routes.set(route, fn) } });
    server = createServer((req, res) => {
      const [pathname, query = ''] = (req.url || '').split('?');
      const handler = routes.get(pathname);
      if (!handler) { res.statusCode = 404; res.end(); return; }
      req.url = `/${query ? `?${query}` : ''}`;
      handler(req, res);
    });
    // A save reads the folder copy again after a pause; an idle connection must still be open for it.
    server.keepAliveTimeout = 60_000;
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as any).port}`;
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (input: string, init?: RequestInit) => realFetch(input.startsWith('/') ? `${url}${input}` : input, init));
    local = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => local.set(k, v), removeItem: (k: string) => local.delete(k) });
    resetWorkspaceCache();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    resetWorkspaceCache();
    server?.closeAllConnections?.();
    await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve());
    server = null;
    await rm(root, { recursive: true, force: true });
  });

  it('keeps an entry in the browser at once and in the book folder a moment later, and brings it back from either', async () => {
    await loadWorkspace(TITLE);
    writeEntry(TITLE, 'prompt:2', { system: 'Write tight.', prompt: 'Chapter 2, edited' }, 'saved-v1');
    writeEntry(TITLE, 'chat', { messages: [{ id: 'm1', role: 'user', text: 'Где провисает темп?' }] });
    expect(JSON.parse(local.get(`novel_workspace:${TITLE}`)!).entries['prompt:2'].base).toBe('saved-v1');

    const file = path.join(root, 'Documents', 'NovelGenerator', TITLE, 'план', WORKSPACE_FILE);
    await vi.waitFor(async () => expect(JSON.parse(await readFile(file, 'utf8')).entries.chat).toBeTruthy(), { timeout: 3000 });

    // Another browser: nothing local, the folder copy comes back.
    local.clear();
    resetWorkspaceCache();
    const restored = await loadWorkspace(TITLE);
    expect(readEntry(restored, 'prompt:2', 'saved-v1')).toEqual({ system: 'Write tight.', prompt: 'Chapter 2, edited' });
    expect(readEntry<any>(restored, 'chat')?.messages[0].text).toBe('Где провисает темп?');
  });

  it('leaves out an edit of a saved value that has changed since, and removes entries set to undefined', async () => {
    await loadWorkspace(TITLE);
    writeEntry(TITLE, 'outline', { title: 'Draft' }, 'outline-v1');
    const state = await loadWorkspace(TITLE);
    expect(readEntry(state, 'outline', 'outline-v1')).toEqual({ title: 'Draft' });
    expect(readEntry(state, 'outline', 'outline-v2')).toBeUndefined();
    writeEntry(TITLE, 'outline', undefined);
    expect((await loadWorkspace(TITLE)).entries).toEqual({});
  });

  it('merges two copies entry by entry: the later entry wins, and a removal is not brought back by an older copy', () => {
    const copy = (savedAt: number, entries: WorkspaceState['entries'], removed?: Record<string, number>): WorkspaceState => ({ version: 1, savedAt, entries, removed });
    const a = copy(5, { 'publish.build:kdp': { value: 'A', at: 5 }, shared: { value: 'old', at: 1 } });
    const b = copy(4, { 'publish.live:kdp': { value: 'B', at: 4 }, shared: { value: 'new', at: 3 } });
    const merged = mergeWorkspaces(a, b);
    expect(Object.fromEntries(Object.entries(merged.entries).map(([k, e]) => [k, e.value]))).toEqual({ 'publish.build:kdp': 'A', 'publish.live:kdp': 'B', shared: 'new' });
    expect(merged.savedAt).toBe(5);

    const removedLater = copy(6, {}, { shared: 6 });
    expect(mergeWorkspaces(removedLater, b).entries.shared).toBeUndefined();
    expect(mergeWorkspaces(b, removedLater).entries.shared).toBeUndefined();
    expect(mergeWorkspaces(b, removedLater).removed).toEqual({ shared: 6 });
    // Set again after the removal: the entry is back.
    expect(mergeWorkspaces(removedLater, copy(7, { shared: { value: 'again', at: 7 } })).entries.shared.value).toBe('again');

    // An old file without per-entry times: its entries count as set at its savedAt.
    expect(mergeWorkspaces(copy(2, { shared: { value: 'legacy' } }), copy(9, { other: { value: 1, at: 9 } })).entries.shared).toEqual({ value: 'legacy', at: 2 });
    expect(mergeWorkspaces(copy(2, { shared: { value: 'legacy' } }), removedLater).entries.shared).toBeUndefined();
    expect(mergeWorkspaces(null, copy(3, {})).savedAt).toBe(3);
    expect(mergeWorkspaces(null, null).savedAt).toBe(0);
  });

  it('keeps the entries another window wrote into the book folder when this window saves', async () => {
    const file = path.join(root, 'Documents', 'NovelGenerator', TITLE, 'план', WORKSPACE_FILE);
    // Window one (its own localStorage) writes a Publish build record.
    await loadWorkspace(TITLE);
    writeEntry(TITLE, 'publish.build:kdp', { file: 'book.epub' });
    writeEntry(TITLE, 'gone', 'soon removed');
    await vi.waitFor(async () => expect(JSON.parse(await readFile(file, 'utf8')).entries['publish.build:kdp']).toBeTruthy(), { timeout: 3000 });
    const windowOne = new Map(local);

    // Window two, another origin: it loaded the book before window one's record, then saves its own entry.
    local = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => local.set(k, v), removeItem: (k: string) => local.delete(k) });
    resetWorkspaceCache();
    await loadWorkspace(TITLE);
    writeEntry(TITLE, 'gone', undefined);
    writeEntry(TITLE, 'publish.live:kdp', { url: 'https://example.test/book' });
    await vi.waitFor(async () => expect(JSON.parse(await readFile(file, 'utf8')).entries['publish.live:kdp']).toBeTruthy(), { timeout: 3000 });
    const saved = JSON.parse(await readFile(file, 'utf8')) as WorkspaceState;
    expect(saved.entries['publish.build:kdp'].value).toEqual({ file: 'book.epub' });
    expect(saved.entries.gone).toBeUndefined();

    // Window one comes back with its older browser copy, which still has the removed entry.
    local = windowOne;
    vi.stubGlobal('localStorage', { getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => local.set(k, v), removeItem: (k: string) => local.delete(k) });
    resetWorkspaceCache();
    const back = await loadWorkspace(TITLE);
    expect(Object.keys(back.entries).sort()).toEqual(['publish.build:kdp', 'publish.live:kdp']);
  });
});
