import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

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

export const GEMINI_IMAGE_MODELS = ['gemini-3-pro-image', 'gemini-3.1-flash-image'] as const;

export interface GeminiImageRequest { prompt: string; model?: string; aspectRatio?: string; imageSize?: '1K' | '2K' | '4K' }

/** One picture from a Gemini image model, as base64 with its type. Text the model adds beside the image is ignored. */
export async function generateGeminiImage(apiKey: string, request: GeminiImageRequest): Promise<{ data: string; mimeType: string }> {
  if (!apiKey) throw new Error('Set GEMINI_API_KEY in .env.local or the environment.');
  const model = request.model && (GEMINI_IMAGE_MODELS as readonly string[]).includes(request.model) ? request.model : GEMINI_IMAGE_MODELS[0];
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: request.aspectRatio || '2:3', imageSize: request.imageSize || '4K' } },
    }),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Gemini image request failed (${response.status})`);
  const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
  const image = parts.find(part => part?.inlineData?.data);
  if (!image) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
    throw new Error(`Gemini returned no image${reason ? ` (${reason})` : ''}.`);
  }
  return { data: image.inlineData.data, mimeType: image.inlineData.mimeType || 'image/png' };
}

function localOnly(req: IncomingMessage, res: ServerResponse): boolean {
  try {
    const origin = new URL(req.headers.origin || `http://${req.headers.host}`);
    if (!['localhost', '127.0.0.1'].includes(origin.hostname) || origin.host !== req.headers.host) throw Error();
    return true;
  } catch {
    res.statusCode = 403; res.end(JSON.stringify({ error: 'Local requests only' }));
    return false;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100_000) { reject(new Error('Request too large')); req.destroy(); } });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/** Development backend for Gemini: the model list, and pictures for the cover studio. Asked from the server, for the local page only. */
export function geminiDevPlugin(apiKey: string): Plugin {
  return { name: 'gemini-model-list', configureServer(server) {
    server.middlewares.use('/api/gemini/models', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (!localOnly(req, res)) return;
      listGeminiModels(apiKey).then(models => res.end(JSON.stringify({ models })), error => { res.statusCode = 502; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Model list failed' })); });
    });
    server.middlewares.use('/api/gemini/image', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (!localOnly(req, res)) return;
      if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST only' })); return; }
      readBody(req)
        .then(body => generateGeminiImage(apiKey, JSON.parse(body || '{}')))
        .then(image => res.end(JSON.stringify(image)), error => { res.statusCode = 502; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Image request failed' })); });
    });
  } };
}
