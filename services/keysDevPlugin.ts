import type { Plugin } from 'vite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setEnvLine } from '../utils/envFile';

/** What a person may set from the app. A key is never sent back to the page: only whether it is there. */
export const KEY_SETTINGS = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'HF_TOKEN', 'COMPATIBLE_API_KEY', 'COMPATIBLE_BASE_URL'] as const;
const PUBLIC = ['COMPATIBLE_BASE_URL'];
const FILE = '.env.local';

const stored = (name: string): string => {
  if (process.env[name]) return process.env[name]!;
  if (!existsSync(FILE)) return '';
  const line = readFileSync(FILE, 'utf8').split('\n').find(item => new RegExp(`^\\s*${name}\\s*=`).test(item));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
};

/**
 * Development backend for the keys window: the keys live in .env.local on this computer, which git ignores,
 * and are read by the local server. The page can set one and ask whether one is set; it cannot read one back.
 */
export function keysDevPlugin(): Plugin {
  const local = (req: any): boolean => {
    try { const origin = new URL(req.headers.origin || `http://${req.headers.host}`); return ['localhost', '127.0.0.1'].includes(origin.hostname) && origin.host === req.headers.host; } catch { return false; }
  };
  const status = () => Object.fromEntries(KEY_SETTINGS.map(name => [name, { set: !!stored(name) || (name === 'GEMINI_API_KEY' && !!stored('API_KEY')), ...(PUBLIC.includes(name) ? { value: stored(name) } : {}) }]));
  return { name: 'keys-local-settings', configureServer(server) {
    server.middlewares.use('/api/keys', (req, res) => {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      if (!local(req)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'Local requests only' })); return; }
      if (req.method === 'GET') { res.end(JSON.stringify({ keys: status() })); return; }
      if (req.method !== 'POST' || !req.headers.origin) { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST from the local application required' })); return; }
      let body = '';
      req.on('data', chunk => { if (body.length < 20000) body += chunk; });
      req.on('end', () => {
        try {
          const input = JSON.parse(body);
          if (!KEY_SETTINGS.includes(input.name) || typeof input.value !== 'string' || input.value.length > 4000) throw new Error('Not a setting this window can change');
          const value = input.value.trim();
          writeFileSync(FILE, setEnvLine(existsSync(FILE) ? readFileSync(FILE, 'utf8') : '', input.name, value), { mode: 0o600 });
          // In force at once for the local server; the page's own Gemini key arrives when the server restarts, which a changed env file makes it do.
          if (value) process.env[input.name] = value; else delete process.env[input.name];
          res.end(JSON.stringify({ keys: status() }));
        } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Could not save' })); }
      });
    });
  } };
}
