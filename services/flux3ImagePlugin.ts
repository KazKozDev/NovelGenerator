import type { Plugin } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * A cover master drawn on this Mac by FLUX 3 Image Klein through mflux (MLX), with no image API to pay for.
 * The mflux command and the model folder come from FLUX3_BIN and FLUX3_MODEL, or the places they were installed to.
 * One picture at a time: at 1024 × 1536 it takes about 25 GB of memory and a few minutes on an M1 Max.
 */
export const FLUX3_BIN = process.env.FLUX3_BIN || path.join(os.homedir(), 'venvs', 'flux3', 'bin', 'mflux-generate-flux3');
export const FLUX3_MODEL = process.env.FLUX3_MODEL || '/Volumes/SSD/models/flux3-klein-mlx-8bit';

export interface Flux3Request { prompt: string; width?: number; height?: number; steps?: number; seed?: number }

/** The mflux arguments for one picture: the distilled checkpoint's 16 steps, 2:3 at 1024 × 1536 by default. */
export function flux3Args(request: Flux3Request, output: string, model = FLUX3_MODEL): string[] {
  const even = (n: number | undefined, fallback: number) => (Number.isFinite(n) && n! >= 256 && n! <= 2048 ? Math.round(n! / 16) * 16 : fallback);
  return [
    '--model', model,
    '--prompt', request.prompt.trim(),
    '--width', String(even(request.width, 1024)),
    '--height', String(even(request.height, 1536)),
    '--steps', String(Number.isInteger(request.steps) && request.steps! > 0 && request.steps! <= 50 ? request.steps : 16),
    '--seed', String(Number.isInteger(request.seed) ? request.seed : Math.floor(Math.random() * 2 ** 31)),
    '--output', output,
  ];
}

export async function generateWithFlux3(request: Flux3Request): Promise<{ data: string; mimeType: string; seconds: number }> {
  if (!existsSync(FLUX3_BIN)) throw new Error(`mflux is not installed at ${FLUX3_BIN}; set FLUX3_BIN`);
  if (!existsSync(FLUX3_MODEL)) throw new Error(`The FLUX 3 model is not at ${FLUX3_MODEL}; is the SSD connected? Set FLUX3_MODEL otherwise`);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'flux3-'));
  const output = path.join(dir, 'master.png');
  const started = Date.now();
  try {
    const stderr: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(FLUX3_BIN, flux3Args(request, output), { stdio: ['ignore', 'ignore', 'pipe'] });
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('FLUX 3 took more than 20 minutes')); }, 20 * 60_000);
      child.stderr.on('data', chunk => { stderr.push(String(chunk)); if (stderr.length > 200) stderr.shift(); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => {
        clearTimeout(timer);
        if (code === 0 && existsSync(output)) resolve();
        else reject(new Error(`FLUX 3 stopped (exit ${code}): ${stderr.join('').split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 400)}`));
      });
    });
    return { data: (await readFile(output)).toString('base64'), mimeType: 'image/png', seconds: Math.round((Date.now() - started) / 1000) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function flux3ImagePlugin(): Plugin {
  let running = false;
  const middleware = (server: { middlewares: { use: Function } }) => {
    server.middlewares.use('/api/cover/flux3-image', (req: any, res: any) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST required' })); return; }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        if (running) { res.statusCode = 409; res.end(JSON.stringify({ error: 'FLUX 3 is already drawing a picture' })); return; }
        running = true;
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          if (typeof body.prompt !== 'string' || !body.prompt.trim()) throw new Error('Missing prompt');
          res.statusCode = 200;
          res.end(JSON.stringify(await generateWithFlux3(body)));
        } catch (error: any) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: error?.message || 'FLUX 3 failed' }));
        } finally {
          running = false;
        }
      });
    });
  };
  return { name: 'flux3-image', configureServer: middleware };
}
