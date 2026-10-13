import type { Plugin } from 'vite';
import { generateHuggingFaceText, listHuggingFaceModels } from './hfService';
import { similarHuggingFace } from './hfSimilarService';

/** Development backend for Hugging Face Inference Providers: the token stays on the server. */
export function hfDevPlugin(): Plugin {
  const local = (req: any): boolean => {
    try { const origin = new URL(req.headers.origin || `http://${req.headers.host}`); return ['localhost', '127.0.0.1'].includes(origin.hostname) && origin.host === req.headers.host; } catch { return false; }
  };
  return { name: 'huggingface-local-gateway', configureServer(server) {
    server.middlewares.use('/api/hf/models', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (!local(req)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'Local requests only' })); return; }
      listHuggingFaceModels().then(models => res.end(JSON.stringify({ models })), error => { res.statusCode = 502; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Model list failed' })); });
    });
    // Search by meaning: one text and many lines in, a likeness for each line out. The token stays here.
    server.middlewares.use('/api/hf/similar', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST required' })); return; }
      if (!req.headers.origin || !local(req)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'Hugging Face requests must originate from the local application' })); return; }
      let body = '', oversized = false;
      req.on('data', chunk => { if (oversized) return; body += chunk; if (Buffer.byteLength(body) > 4_000_000) { oversized = true; res.statusCode = 413; res.end(JSON.stringify({ error: 'Request too large' })); } });
      req.on('end', async () => {
        if (oversized) return;
        let input: any;
        try {
          input = JSON.parse(body);
          if (typeof input.model !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(input.model) || typeof input.source !== 'string' || !input.source.trim() || input.source.length > 4000
            || !Array.isArray(input.sentences) || input.sentences.length < 1 || input.sentences.length > 6000 || !input.sentences.every((line: unknown) => typeof line === 'string' && line.length <= 2000)) throw Error();
        } catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid request' })); return; }
        try { res.end(JSON.stringify({ scores: await similarHuggingFace(input.model, input.source, input.sentences) })); }
        catch (error) { res.statusCode = 502; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Search by meaning failed' })); }
      });
    });
    server.middlewares.use('/api/hf', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST required' })); return; }
      if (!req.headers.origin || !local(req)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'Hugging Face requests must originate from the local application' })); return; }
      let body = '', oversized = false;
      req.on('data', chunk => { if (oversized) return; body += chunk; if (Buffer.byteLength(body) > 8_000_000) { oversized = true; res.statusCode = 413; res.end(JSON.stringify({ error: 'Request too large' })); } });
      req.on('end', async () => {
        if (oversized) return;
        let input: any;
        try {
          input = JSON.parse(body);
          if (typeof input.prompt !== 'string' || !input.prompt.trim() || (input.system !== undefined && typeof input.system !== 'string')
            || typeof input.model !== 'string' || !/^[\w.-]+\/[\w.-]+(:[\w.-]+)?$/.test(input.model)
            || (input.maxTokens !== undefined && (!Number.isInteger(input.maxTokens) || input.maxTokens < 1 || input.maxTokens > 131072))
            || (input.temperature !== undefined && (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2))
            || (input.schema !== undefined && (!input.schema || typeof input.schema !== 'object' || Array.isArray(input.schema)))) throw Error();
        } catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid Hugging Face request: the model must be org/name or org/name:provider' })); return; }
        // The answer is passed on as it arrives, one JSON object a line: pieces of text, a notice
        // when the request had to be started again, and at the end the whole text or the error.
        let metadata: unknown;
        res.setHeader('Content-Type', 'application/x-ndjson'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Accel-Buffering', 'no');
        const line = (value: object) => { if (!res.writableEnded) res.write(JSON.stringify(value) + '\n'); };
        try {
          const text = await generateHuggingFaceText(input.prompt, input.system, input.maxTokens, input.model, input.temperature, value => { metadata = value; }, input.schema,
            { onDelta: delta => line({ delta }), onRestart: why => line({ restart: why }) });
          line({ text, metadata });
        } catch (error) { line({ error: error instanceof Error ? error.message : 'Hugging Face request failed', metadata }); }
        res.end();
      });
    });
  } };
}
