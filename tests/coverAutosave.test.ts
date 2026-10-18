import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import { projectAutosavePlugin } from '../services/projectAutosavePlugin';
import { readBookFile } from '../services/bookStorageService';
import { loadStudioFromFolder, masterLabels, newerStudio, saveStudioManifest, studioManifest, STUDIO_FILE } from '../utils/cover/coverFolder';
import { saveToBookFolder } from '../utils/saveToBookFolder';
import { restoreEdition } from '../utils/bookEdition';
import { DEFAULT_STYLE } from '../utils/cover/formats';
import type { CoverStudioState } from '../utils/cover/coverStore';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const TITLE = 'Пикник на обочине';

describe('cover studio autosave in the book folder', () => {
  let root = '';
  let server: Server | null = null;
  let url = '';

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'novel-cover-autosave-'));
    const routes = new Map<string, Function>();
    (projectAutosavePlugin(root).configureServer as Function)({
      middlewares: { use: (route: string, fn: Function) => routes.set(route, fn) },
    });
    server = createServer((req, res) => {
      const [pathname, query = ''] = (req.url || '').split('?');
      const handler = routes.get(pathname);
      if (!handler) { res.statusCode = 404; res.end(); return; }
      req.url = `/${query ? `?${query}` : ''}`; // As connect hands a mounted middleware its request.
      handler(req, res);
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as any).port}`;
    // The app's relative requests go to this server, as from the page it serves.
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (input: string, init?: RequestInit) => realFetch(input.startsWith('/') ? `${url}${input}` : input, init));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    server?.closeAllConnections?.();
    await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve());
    server = null;
    await rm(root, { recursive: true, force: true });
  });

  const coversDir = () => path.join(root, 'Documents', 'NovelGenerator', TITLE, 'обложки');

  it('writes the studio state beside its pictures and brings all of it back', async () => {
    const createdAt = new Date(2026, 9, 17, 15, 40, 7).getTime();
    const master = { id: 'master_1', blob: new Blob([PNG], { type: 'image/png' }), original: new Blob([PNG, PNG], { type: 'image/png' }), depth: new Blob([PNG], { type: 'image/png' }), prompt: 'A window in a hotel room.', model: 'gemini-3-pro-image', createdAt };
    const state: CoverStudioState = {
      description: 'A window', model: 'gemini-3-pro-image', masters: [master], selected: 'master_1', focus: { x: 0.3, y: 0.7 },
      text: { title: TITLE, author: 'Стругацкие', tagline: 'Счастье для всех' },
      style: { ...DEFAULT_STYLE, youtubeLayout: 'classic', color: '#ef4444' },
      heroFormat: 'yt_thumb', savedAt: 1_700_000_000_000,
    };

    // What CoverStudio's autosave sends: each picture once, then the state file.
    const labels = masterLabels(master);
    for (const [label, blob] of [[labels.picture, master.blob], [labels.original, master.original], [labels.depth, master.depth]] as const) {
      expect(await saveToBookFolder({ title: TITLE, kind: 'covers', label, ext: 'png', content: blob, stamp: false, replace: true })).not.toBeNull();
    }
    expect(await saveStudioManifest(TITLE, state)).toBe(true);
    expect(await saveStudioManifest(TITLE, state)).toBe(true); // Replaced in place, never "(2)".

    expect((await readdir(coversDir())).sort()).toEqual([
      'мастер 2026-10-17 15.40.07 — глубина.png', 'мастер 2026-10-17 15.40.07 — оригинал.png', 'мастер 2026-10-17 15.40.07.png', STUDIO_FILE,
    ].sort());
    const manifest = JSON.parse(await readFile(path.join(coversDir(), STUDIO_FILE), 'utf8'));
    expect(manifest).toEqual(studioManifest(state));
    expect(manifest.masters[0]).not.toHaveProperty('blob');

    const restored = await loadStudioFromFolder(TITLE);
    expect(restored).toMatchObject({ description: 'A window', selected: 'master_1', focus: { x: 0.3, y: 0.7 }, heroFormat: 'yt_thumb', savedAt: state.savedAt, text: state.text, style: state.style });
    const back = restored!.masters[0];
    expect(back).toMatchObject({ id: 'master_1', prompt: master.prompt, model: master.model, createdAt });
    expect(Buffer.from(await back.blob.arrayBuffer())).toEqual(PNG);
    expect(back.original!.size).toBe(PNG.length * 2);
    expect(back.depth!.type).toBe('image/png');
  });

  it('leaves out a picture removed from the folder, and has nothing for a book without a studio', async () => {
    const state: CoverStudioState = {
      description: '', model: 'm', focus: { x: 0.5, y: 0.5 }, text: { title: TITLE, author: '', tagline: '' }, style: DEFAULT_STYLE, selected: 'gone',
      masters: [{ id: 'gone', blob: new Blob([PNG], { type: 'image/png' }), prompt: 'p', model: 'm', createdAt: 1 }],
    };
    expect(await loadStudioFromFolder(TITLE)).toBeUndefined();
    await saveStudioManifest(TITLE, state);
    const restored = await loadStudioFromFolder(TITLE);
    expect(restored?.masters).toEqual([]);
    expect(restored?.selected).toBeUndefined();
  });

  it('prefers whichever copy was saved last', () => {
    const at = (savedAt?: number) => ({ savedAt } as CoverStudioState);
    expect(newerStudio(at(2), at(1))!.savedAt).toBe(2);
    expect(newerStudio(at(1), at(2))!.savedAt).toBe(2);
    expect(newerStudio(undefined, at(1))!.savedAt).toBe(1);
    expect(newerStudio(at(undefined), at(undefined))).toEqual(at(undefined));
  });

  it('reads back only files inside the book folder, and only for this machine', async () => {
    await saveToBookFolder({ title: TITLE, kind: 'covers', label: 'обложка книги', ext: 'png', content: new Blob([PNG], { type: 'image/png' }), stamp: false, replace: true });
    const get = (query: Record<string, string>, headers: Record<string, string> = {}) => fetch(`${url}/api/book-file?${new URLSearchParams(query)}`, { headers });

    const ok = await get({ title: TITLE, kind: 'covers', name: 'обложка книги.png' });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await ok.arrayBuffer())).toEqual(PNG);

    expect((await get({ title: TITLE, kind: 'covers', name: '../../../etc/passwd' })).status).toBe(404);
    expect((await get({ title: TITLE, kind: 'nowhere', name: 'обложка книги.png' })).status).toBe(404);
    expect((await get({ title: TITLE, kind: 'covers', name: 'обложка книги.png' }, { origin: 'http://evil.example' })).status).toBe(403);
    expect(await readBookFile(TITLE, 'covers', '..', path.join(root, 'Documents', 'NovelGenerator'))).toBeNull();
  });

  it('restores the author, imprint and book cover a browser lost, and only what it lost', async () => {
    await saveToBookFolder({ title: TITLE, kind: 'covers', label: 'обложка книги', ext: 'png', content: new Blob([PNG], { type: 'image/png' }), stamp: false, replace: true });
    await saveToBookFolder({ title: TITLE, kind: 'blueprints', label: 'издание', ext: 'json', content: JSON.stringify({ author: 'Стругацкие', imprint: { publisher: 'Мир' }, cover: 'обложка книги.png' }), stamp: false, replace: true });

    const all = await restoreEdition(TITLE, { author: false, imprint: false, cover: false });
    expect(all.author).toBe('Стругацкие');
    expect(all.imprint).toEqual({ publisher: 'Мир' });
    expect(all.cover).toBe(`data:image/png;base64,${PNG.toString('base64')}`);

    expect(await restoreEdition(TITLE, { author: true, imprint: true, cover: true })).toEqual({});

    // A cover removed in the app stays removed after reload.
    await saveToBookFolder({ title: TITLE, kind: 'blueprints', label: 'издание', ext: 'json', content: JSON.stringify({ author: '', imprint: null, cover: null }), stamp: false, replace: true });
    expect(await restoreEdition(TITLE, { author: false, imprint: false, cover: false })).toEqual({});
  });
});
