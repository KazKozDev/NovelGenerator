import type { Plugin } from 'vite';
import { generateAnthropicLive, listAnthropicModels } from './anthropicService';

/** Development backend for Anthropic: the key stays on the server, and the answer is passed on as it arrives. */
export function anthropicDevPlugin(): Plugin {
  const local = (req: any): boolean => {
    try { const origin = new URL(req.headers.origin || `http://${req.headers.host}`); return ['localhost', '127.0.0.1'].includes(origin.hostname) && origin.host === req.headers.host; } catch { return false; }
  };
  return { name: 'anthropic-local-gateway', configureServer(server) {
    server.middlewares.use('/api/anthropic/models', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (!local(req)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'Local requests only' })); return; }
      listAnthropicModels().then(models => res.end(JSON.stringify({ models })), error => { res.statusCode = 502; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Model list failed' })); });
    });
    server.middlewares.use('/api/anthropic', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST required' })); return; }
      if (!req.headers.origin || !local(req)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'Anthropic requests must originate from the local application' })); return; }
      let body = '', oversized = false;
      req.on('data', chunk => { if (oversized) return; body += chunk; if (Buffer.byteLength(body) > 8_000_000) { oversized = true; res.statusCode = 413; res.end(JSON.stringify({ error: 'Request too large' })); } });
      req.on('end', async () => {
        if (oversized) return;
        let input: any;
        try {
          input = JSON.parse(body);
          if (typeof input.prompt !== 'string' || !input.prompt.trim() || (input.system !== undefined && typeof input.system !== 'string')
            || (input.model !== undefined && (typeof input.model !== 'string' || !/^claude-[\w.-]+$/.test(input.model)))
            || (input.maxTokens !== undefined && (!Number.isInteger(input.maxTokens) || input.maxTokens < 1 || input.maxTokens > 131072))
            || (input.temperature !== undefined && (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2))
            || (input.schema !== undefined && (!input.schema || typeof input.schema !== 'object' || Array.isArray(input.schema)))) throw Error();
        } catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid Anthropic request: the model must be a claude-… id' })); return; }
        let metadata: unknown;
        res.setHeader('Content-Type', 'application/x-ndjson'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Accel-Buffering', 'no');
        const line = (value: object) => { if (!res.writableEnded) res.write(JSON.stringify(value) + '\n'); };
        try {
          // No temperature is passed on: this API refuses anything but its default.
          const text = await generateAnthropicLive(input.prompt, input.system, input.maxTokens, input.model, value => { metadata = value; }, input.schema,
            { onDelta: delta => line({ delta }), onRestart: why => line({ restart: why }) });
          line({ text, metadata });
        } catch (error) { line({ error: error instanceof Error ? error.message : 'Anthropic request failed', metadata }); }
        res.end();
      });
    });
  } };
}
