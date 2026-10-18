import type { Plugin } from 'vite';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  BOOK_FOLDERS,
  listAutosaves,
  listBooks,
  listRecoveryCopies,
  readBookSnapshot,
  saveProjectSnapshotToStorage,
  readBookFile,
  saveBookFile,
  type BookStorageCategory,
} from './bookStorageService';

/**
 * Everything the app saves goes to the book's folder in Documents/NovelGenerator: the autosave and every Save button.
 * The repository's autosaves/ is only read, for projects saved before the book folders.
 */
export function projectAutosavePlugin(root = process.cwd()): Plugin {
  const legacy = path.join(root, 'autosaves');
  const isTestRoot = root !== process.cwd();
  const docsBase = isTestRoot ? path.join(root, 'Documents', 'NovelGenerator') : undefined;

  let queue: Promise<unknown> = Promise.resolve();
  /** Only this machine's own page may read or write the book folders. */
  const localSameOrigin = (req: any): boolean => {
    const host = req.headers.host || '';
    try {
      const local = new URL(`http://${host}`);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(local.hostname)) return false;
      if (req.headers.origin && new URL(req.headers.origin).host !== host) return false;
      if (req.headers['sec-fetch-site'] === 'cross-site') return false;
      if (req.method === 'PUT' && !req.headers.origin) return false;
      return true;
    } catch { return false; }
  };
  const TYPES: Record<string, string> = { epub: 'application/epub+zip', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', json: 'application/json', txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8' };
  const middleware = (server: { middlewares: { use: Function } }) => {
    // 1. One file a person asked for: a manuscript, a cover, a report, a copy of the project.
    server.middlewares.use('/api/save-document', (req: any, res: any) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      const finish = (code: number, value: unknown) => { res.statusCode = code; res.end(JSON.stringify(value)); };

      if (req.method !== 'POST') { finish(405, { error: 'POST required' }); return; }

      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const category: BookStorageCategory = body.category in BOOK_FOLDERS ? body.category : 'manuscripts';
          let content: string | Buffer = body.content || '';
          if (body.base64 && typeof content === 'string') content = Buffer.from(content.replace(/^data:[^;]+;base64,/, ''), 'base64');

          const saved = await saveBookFile({
            title: body.title,
            category,
            label: body.label || body.details || 'файл',
            content,
            ext: body.ext || 'md',
            stamp: body.stamp ?? body.timestamp ?? true,
            replace: body.replace === true,
            customBase: docsBase,
          });
          finish(200, { ok: true, fullPath: saved.fullPath, fileName: saved.fileName, relativePath: saved.relativePath });
        } catch (error: any) {
          finish(500, { error: error?.message || 'Failed to save document' });
        }
      });
    });

    // 2. A file the app saved in a book's folder, read back on reload: the cover studio, its pictures, the book's cover.
    server.middlewares.use('/api/book-file', async (req: any, res: any) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!localSameOrigin(req)) { res.statusCode = 403; res.end(); return; }
      if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
      const query = new URL(req.url || '', 'http://local').searchParams;
      const kind = query.get('kind') || '';
      const name = query.get('name') || '';
      const content = kind in BOOK_FOLDERS ? await readBookFile(query.get('title') || '', kind as BookStorageCategory, name, docsBase) : null;
      if (!content) { res.statusCode = 404; res.end(); return; }
      res.setHeader('Content-Type', TYPES[name.split('.').pop()!.toLowerCase()] || 'application/octet-stream');
      res.statusCode = 200;
      res.end(content);
    });

    // 3. The library: every book in Documents/NovelGenerator, and one book's autosave to open it.
    server.middlewares.use('/api/books', async (req: any, res: any) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!localSameOrigin(req)) { res.statusCode = 403; res.end(); return; }
      if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
      const folder = new URL(req.url || '', 'http://local').searchParams.get('folder');
      res.setHeader('Content-Type', 'application/json');
      if (folder === null) { res.statusCode = 200; res.end(JSON.stringify({ books: await listBooks(docsBase) })); return; }
      const snapshot = await readBookSnapshot(folder, docsBase);
      res.statusCode = snapshot ? 200 : 404;
      res.end(snapshot ?? JSON.stringify({ error: 'No such book' }));
    });

    // 4. Endpoint for full project snapshot autosave and restore
    server.middlewares.use('/api/project-autosave', (req: any, res: any) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      const finish = (code: number, value: unknown) => { res.statusCode = code; res.end(JSON.stringify(value)); };
      if (!localSameOrigin(req)) { finish(403, { error: 'Local same-origin requests only' }); return; }

      if (req.method === 'GET') {
        queue.then(async () => {
          const recoveries: unknown[] = [];
          const copies = [
            ...await listRecoveryCopies(docsBase),
            ...(await readdir(legacy).catch(() => [] as string[])).filter(name => /^project-\d+\.project\.json$/.test(name)).sort().reverse().slice(0, 5).map(name => path.join(legacy, name)),
          ];
          for (const file of copies) {
            try { recoveries.push(JSON.parse(await readFile(file, 'utf8'))); } catch { /* Try next recovery. */ }
          }

          const [newest] = await listAutosaves(docsBase);
          const file = newest || path.join(legacy, 'latest.project.json');
          let snapshot: any = null;
          let readError: string | undefined;
          try { snapshot = JSON.parse(await readFile(file, 'utf8')); } catch (error: any) {
            if (error?.code !== 'ENOENT') readError = `Cannot read the autosave ${path.basename(file)}; trying recovery copies`;
          }
          finish(200, { snapshot, recoveries, path: snapshot ? file : undefined, ...(readError ? { error: readError } : {}) });
        });
        return;
      }

      if (req.method !== 'PUT') { finish(405, { error: 'GET or PUT required' }); return; }
      const chunks: Buffer[] = [];
      let size = 0, oversized = false;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 100 * 1024 * 1024) { if (!oversized) finish(413, { error: 'Project exceeds 100 MB' }); oversized = true; return; }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (oversized) return;
        let snapshot: any;
        try {
          snapshot = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (snapshot.version !== 1 || !snapshot.files || !Array.isArray(snapshot.files.manuscript) || !Number.isFinite(Date.parse(snapshot.exportedAt))) throw Error();
          if (snapshot.files.input && (typeof snapshot.files.input.premise !== 'string' || !Number.isInteger(snapshot.files.input.chapter_count))) throw Error();
          if (snapshot.files.manuscript.some((chapter: any) => !Number.isInteger(chapter.chapter) || typeof chapter.text !== 'string')) throw Error();
        } catch { finish(400, { error: 'Invalid project snapshot' }); return; }

        const save = queue.catch(() => undefined).then(async () => {
          const saved = await saveProjectSnapshotToStorage(snapshot, { customBase: docsBase });
          return { savedAt: saved.savedAt, path: saved.mainBackupPath };
        });

        queue = save.catch(() => undefined);
        save.then(value => finish(200, value), () => finish(500, { error: 'Autosave to the book folder failed; retrying on the next change' }));
      });
    });
  };
  return { name: 'project-repository-autosave', configureServer: middleware, configurePreviewServer: middleware };
}

