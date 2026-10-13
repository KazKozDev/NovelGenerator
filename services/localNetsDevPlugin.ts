import type { Plugin } from 'vite';
import { findObjectsLocally } from './localObjectsService';

/** Development backend for the small networks that run on this machine. */
export function localNetsDevPlugin(): Plugin {
  const local = (req: any): boolean => {
    try { const origin = new URL(req.headers.origin || `http://${req.headers.host}`); return ['localhost', '127.0.0.1'].includes(origin.hostname) && origin.host === req.headers.host; } catch { return false; }
  };
  return { name: 'local-nets-gateway', configureServer(server) {
    server.middlewares.use('/api/local/objects', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST required' })); return; }
      if (!req.headers.origin || !local(req)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'Requests must originate from the local application' })); return; }
      let body = '', oversized = false;
      req.on('data', chunk => { if (oversized) return; body += chunk; if (Buffer.byteLength(body) > 1_000_000) { oversized = true; res.statusCode = 413; res.end(JSON.stringify({ error: 'Request too large' })); } });
      req.on('end', async () => {
        if (oversized) return;
        let input: any;
        try {
          input = JSON.parse(body);
          const strings = (value: unknown, most: number, longest: number) => Array.isArray(value) && value.length >= 1 && value.length <= most && value.every(item => typeof item === 'string' && item.trim() && item.length <= longest);
          if (typeof input.model !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(input.model) || !strings(input.texts, 400, 4000) || !strings(input.labels, 8, 60) || !Number.isFinite(input.threshold) || input.threshold < 0 || input.threshold > 1) throw Error();
        } catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid request' })); return; }
        try { res.end(JSON.stringify({ found: await findObjectsLocally(input.model, input.texts, input.labels, input.threshold) })); }
        catch (error) { res.statusCode = 502; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'The local network failed' })); }
      });
    });
  } };
}
