import type { Plugin } from 'vite';
import { generateWithChatgpt } from './chatgptImage';

/** /api/cover/chatgpt-image: a master drawn by ChatGPT in the author's browser through WebOperator, one at a time. */
export function chatgptImagePlugin(): Plugin {
  let running = false;
  const middleware = (server: { middlewares: { use: Function } }) => {
    server.middlewares.use('/api/cover/chatgpt-image', (req: any, res: any) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST required' })); return; }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        // One browser tab does the work: a second request would type into the first one's chat.
        if (running) { res.statusCode = 409; res.end(JSON.stringify({ error: 'ChatGPT is already drawing a picture' })); return; }
        running = true;
        try {
          const { prompt } = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Missing prompt');
          const image = await generateWithChatgpt(prompt, { log: step => console.log(`[chatgpt-image] ${step}`) });
          res.statusCode = 200;
          res.end(JSON.stringify(image));
        } catch (error: any) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: error?.message || 'ChatGPT image failed' }));
        } finally {
          running = false;
        }
      });
    });
  };
  return { name: 'chatgpt-image', configureServer: middleware };
}
