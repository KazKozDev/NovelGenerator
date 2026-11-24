import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { projectAutosavePlugin } from '../services/projectAutosavePlugin';

describe('saveDocument API endpoint', () => {
  let root: string | null = null;
  let server: any = null;

  afterEach(async () => {
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>(resolve => server.close(() => resolve()));
      server = null;
    }
    if (root) {
      await rm(root, { recursive: true, force: true });
      root = null;
    }
  });

  it('saves documents into Documents/NovelGenerator/<Book title>/<kind> with readable names', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'novel-save-doc-'));
    const routes = new Map<string, Function>();
    const plugin = projectAutosavePlugin(root);
    (plugin.configureServer as Function)({
      middlewares: {
        use: (routeOrFn: string | Function, maybeFn?: Function) => {
          if (typeof routeOrFn === 'string' && maybeFn) {
            routes.set(routeOrFn, maybeFn);
          }
        },
      },
    });

    server = createServer((req, res) => {
      const pathname = (req.url || '').split('?')[0];
      const handler = routes.get(pathname);
      if (handler) {
        handler(req, res);
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as any).port}`;

    const bookTitle = 'Пикник на обочине';

    // 1. Save manuscript (.md)
    const resMd = await fetch(`${url}/api/save-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: bookTitle,
        category: 'manuscripts',
        label: 'черновик',
        content: '# Пикник на обочине\n\nТекст книги...',
        ext: 'md',
        timestamp: true,
      }),
    });
    expect(resMd.status).toBe(200);
    const dataMd = await resMd.json();
    expect(dataMd.ok).toBe(true);
    expect(dataMd.fileName).toMatch(/^черновик \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.md$/);
    expect(dataMd.fileName.endsWith('.md')).toBe(true);

    const manuscriptsDir = path.join(root, 'Documents', 'NovelGenerator', 'Пикник на обочине', 'текст');
    const files = await readdir(manuscriptsDir);
    expect(files).toContain(dataMd.fileName);

    const savedContent = await readFile(path.join(manuscriptsDir, dataMd.fileName), 'utf8');
    expect(savedContent).toContain('Текст книги...');

    // 2. Save report (.json)
    const resReport = await fetch(`${url}/api/save-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: bookTitle,
        category: 'reports',
        label: 'редакторский отчёт',
        content: JSON.stringify({ issues: [], wordCount: 45000 }),
        ext: 'json',
        timestamp: true,
      }),
    });
    expect(resReport.status).toBe(200);
    const dataReport = await resReport.json();
    expect(dataReport.fileName).toMatch(/^редакторский отчёт .*\.json$/);
    expect(dataReport.fileName.endsWith('.json')).toBe(true);

    const reportsDir = path.join(root, 'Documents', 'NovelGenerator', 'Пикник на обочине', 'отчёты');
    const reportFiles = await readdir(reportsDir);
    expect(reportFiles).toContain(dataReport.fileName);

    // 3. Save cover (.png base64)
    const dummyPngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const resCover = await fetch(`${url}/api/save-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: bookTitle,
        category: 'covers',
        label: 'обложка eBook 1600x2560',
        content: dummyPngBase64,
        ext: 'png',
        base64: true,
        timestamp: true,
      }),
    });
    expect(resCover.status).toBe(200);
    const dataCover = await resCover.json();
    expect(dataCover.fileName).toMatch(/^обложка eBook 1600x2560 .*\.png$/);
    expect(dataCover.fileName.endsWith('.png')).toBe(true);

    const coversDir = path.join(root, 'Documents', 'NovelGenerator', 'Пикник на обочине', 'обложки');
    const coverFiles = await readdir(coversDir);
    expect(coverFiles).toContain(dataCover.fileName);

    const crossOrigin = await fetch(`${url}/api/save-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://evil.example' },
      body: JSON.stringify({ title: bookTitle, category: 'covers', label: 'обложка', content: 'x', ext: 'txt', replace: true }),
    });
    expect(crossOrigin.status).toBe(403);
  });
});
