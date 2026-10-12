import type { Plugin } from 'vite';

/** The models Gemini offers for writing text, by their ids. The key goes in a header, never in the address. */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  if (!apiKey) throw new Error('Set GEMINI_API_KEY in .env.local or the environment.');
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': apiKey } });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Gemini model list failed (${response.status})`);
  return (Array.isArray(data.models) ? data.models : [])
    .filter((model: any) => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
    .map((model: any) => String(model.name || '').replace(/^models\//, ''))
    // A book is written with a text model: what speaks, draws or embeds is left out of the list.
    .filter((id: string) => id && !/image|tts|audio|embed|veo|imagen|live|robotics|computer-use/i.test(id)).sort();
}

/** Development backend for the Gemini model list: asked from the server, for the local page only. */
export function geminiDevPlugin(apiKey: string): Plugin {
  return { name: 'gemini-model-list', configureServer(server) {
    server.middlewares.use('/api/gemini/models', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      try { const origin = new URL(req.headers.origin || `http://${req.headers.host}`); if (!['localhost', '127.0.0.1'].includes(origin.hostname) || origin.host !== req.headers.host) throw Error(); }
      catch { res.statusCode = 403; res.end(JSON.stringify({ error: 'Local requests only' })); return; }
      listGeminiModels(apiKey).then(models => res.end(JSON.stringify({ models })), error => { res.statusCode = 502; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Model list failed' })); });
    });
  } };
}
