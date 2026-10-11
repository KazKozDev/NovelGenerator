import type { Plugin } from 'vite';
import { mkdir, readFile, rename, writeFile, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/** Fixed local paths only. Atomic replacement keeps the last complete snapshot. */
export function projectAutosavePlugin(root = process.cwd()): Plugin {
  const directory = path.join(root, 'autosaves');
  const latest = path.join(directory, 'latest.project.json');
  let queue: Promise<unknown> = Promise.resolve();
  const middleware = (server: { middlewares: { use: Function } }) => {
    server.middlewares.use('/api/project-autosave', (req: any, res: any) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      const finish = (code: number, value: unknown) => { res.statusCode = code; res.end(JSON.stringify(value)); };
      const host = req.headers.host || '';
      try {
        const local = new URL(`http://${host}`);
        if (!['localhost', '127.0.0.1', '[::1]'].includes(local.hostname)) throw Error();
        if (req.headers.origin && new URL(req.headers.origin).host !== host) throw Error();
        if (req.headers['sec-fetch-site'] === 'cross-site') throw Error();
        if (req.method === 'PUT' && !req.headers.origin) throw Error();
      } catch { finish(403, { error: 'Local same-origin requests only' }); return; }
      if (req.method === 'GET') {
        queue.then(async () => {
          const recoveries: unknown[] = [];
          try {
            const names = (await readdir(directory)).filter(name=>/^project-\d+\.project\.json$/.test(name)).sort().reverse().slice(0,5);
            for (const name of names) { try { recoveries.push(JSON.parse(await readFile(path.join(directory,name),'utf8'))); } catch { /* Try the next recovery file. */ } }
          } catch { /* No archive directory yet. */ }
          try { finish(200, {snapshot:JSON.parse(await readFile(latest,'utf8')),recoveries}); }
          catch (error: any) { finish(200, {snapshot:null,recoveries,...(error.code==='ENOENT'?{}:{error:'Cannot read repository autosave; trying recovery copies'})}); }
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
          await mkdir(directory, { recursive: true });
          let previous: any;
          try { previous = JSON.parse(await readFile(latest, 'utf8')); } catch (error: any) { if (error instanceof SyntaxError) await copyFile(latest,path.join(directory,`corrupt-${Date.now()}.project.json`)); else if (error.code !== 'ENOENT') throw error; }
          // Keep recovery copies when resetting or replacing the book.
          if (previous?.files?.input && JSON.stringify(previous.files.input) !== JSON.stringify(snapshot.files.input)) {
            await copyFile(latest, path.join(directory, `project-${Date.now()}.project.json`));
          }
          await writeFile(`${latest}.tmp`, JSON.stringify(snapshot), { mode: 0o600 });
          await rename(`${latest}.tmp`, latest);
          return { savedAt: Date.now(), path: 'autosaves/latest.project.json' };
        });
        queue = save.catch(() => undefined);
        save.then(value => finish(200, value), () => finish(500, { error: 'Repository autosave failed; retrying on the next change' }));
      });
    });
  };
  return { name: 'project-repository-autosave', configureServer: middleware, configurePreviewServer: middleware };
}
