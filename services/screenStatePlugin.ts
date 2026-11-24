import type { Plugin } from 'vite';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getDocumentsRoot } from './bookStorageService';

/** Where the app's description of its screen is kept for the agent: beside the books, one file, replaced each time. */
export const screenStateFile = (customBase?: string) => path.join(getDocumentsRoot(customBase), '.screen.json');

/** Development backend: the page tells what is on its screen (see utils/screenReport), the agent reads it with see_app. */
export function screenStatePlugin(customBase?: string): Plugin {
  const local = (req: any): boolean => {
    try { const origin = new URL(req.headers.origin || `http://${req.headers.host}`); return ['localhost', '127.0.0.1'].includes(origin.hostname) && origin.host === req.headers.host; } catch { return false; }
  };
  // Several tabs may be open: the one the person looks at wins over one left in the background.
  let shownAt = 0;
  return { name: 'screen-state', configureServer(server) {
    server.middlewares.use('/api/screen-state', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (!local(req)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'Local requests only' })); return; }
      if (req.method !== 'PUT') { res.statusCode = 405; res.end(JSON.stringify({ error: 'PUT required' })); return; }
      let body = '', oversized = false;
      req.on('data', chunk => { if (oversized) return; body += chunk; if (body.length > 2_000_000) { oversized = true; res.statusCode = 413; res.end(JSON.stringify({ error: 'Too large' })); } });
      req.on('end', async () => {
        if (oversized) return;
        try {
          const state = JSON.parse(body);
          if (state?.version !== 1 || typeof state.text !== 'string') throw Error();
          if (state.visible) shownAt = Date.now();
          else if (Date.now() - shownAt < 30_000) { res.end(JSON.stringify({ ok: true, kept: 'a visible tab' })); return; }
          const file = screenStateFile(customBase);
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
          await rename(`${file}.tmp`, file);
          res.end(JSON.stringify({ ok: true }));
        } catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid screen state' })); }
      });
    });
  } };
}
