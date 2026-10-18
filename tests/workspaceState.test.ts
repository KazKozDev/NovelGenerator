import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import { projectAutosavePlugin } from '../services/projectAutosavePlugin';
import { loadWorkspace, newerWorkspace, readEntry, resetWorkspaceCache, writeEntry, WORKSPACE_FILE, type WorkspaceState } from '../utils/workspaceState';

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

  it('prefers whichever copy was saved last', () => {
    const at = (savedAt: number): WorkspaceState => ({ version: 1, savedAt, entries: {} });
    expect(newerWorkspace(at(2), at(1)).savedAt).toBe(2);
    expect(newerWorkspace(at(1), at(2)).savedAt).toBe(2);
    expect(newerWorkspace(null, at(3)).savedAt).toBe(3);
    expect(newerWorkspace(null, null).savedAt).toBe(0);
  });
});
