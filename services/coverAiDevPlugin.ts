import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

/**
 * Development plugin providing local AI Depth & Aesthetic inference endpoints
 * using models cached on the external SSD (/Volumes/SSD/models/cover_ai/cache).
 */
export function coverAiDevPlugin(): Plugin {
  return {
    name: 'cover-ai-dev-plugin',
    configureServer(server) {
      server.middlewares.use('/api/cover/depth', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'POST required' }));
          return;
        }

        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const imageBase64 = payload.image;
            const threshold = typeof payload.threshold === 'number' ? payload.threshold : 150;

            if (!imageBase64 || typeof imageBase64 !== 'string') {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing image data' }));
              return;
            }

            const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
            const tmpDir = os.tmpdir();
            const inputPath = path.join(tmpDir, `cover_in_${Date.now()}.png`);
            const depthPath = path.join(tmpDir, `cover_depth_${Date.now()}.png`);
            const maskPath = path.join(tmpDir, `cover_mask_${Date.now()}.png`);

            fs.writeFileSync(inputPath, Buffer.from(cleanBase64, 'base64'));

            const scriptPath = path.resolve(__dirname, '../scripts/cover_ai.py');
            const pyProcess = spawn('python3', [
              scriptPath,
              'depth',
              '--input', inputPath,
              '--output', depthPath,
              '--mask', maskPath,
              '--threshold', String(threshold)
            ]);

            let stdout = '';
            let stderr = '';

            pyProcess.stdout.on('data', d => { stdout += d.toString(); });
            pyProcess.stderr.on('data', d => { stderr += d.toString(); });

            pyProcess.on('close', code => {
              try {
                if (code !== 0) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: stderr || 'Depth estimation failed' }));
                  return;
                }

                const maskBuffer = fs.readFileSync(maskPath);
                const depthBuffer = fs.readFileSync(depthPath);

                // Clean up temp files
                try {
                  fs.unlinkSync(inputPath);
                  fs.unlinkSync(depthPath);
                  fs.unlinkSync(maskPath);
                } catch {}

                res.statusCode = 200;
                res.end(JSON.stringify({
                  status: 'ok',
                  maskBase64: `data:image/png;base64,${maskBuffer.toString('base64')}`,
                  depthBase64: `data:image/png;base64,${depthBuffer.toString('base64')}`,
                }));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
              }
            });
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
      });

      server.middlewares.use('/api/cover/aesthetic', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'POST required' }));
          return;
        }

        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const imageBase64 = payload.image;

            if (!imageBase64 || typeof imageBase64 !== 'string') {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing image data' }));
              return;
            }

            const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
            const tmpDir = os.tmpdir();
            const inputPath = path.join(tmpDir, `cover_aes_${Date.now()}.png`);

            fs.writeFileSync(inputPath, Buffer.from(cleanBase64, 'base64'));

            const scriptPath = path.resolve(__dirname, '../scripts/cover_ai.py');
            const pyProcess = spawn('python3', [
              scriptPath,
              'aesthetic',
              '--input', inputPath,
            ]);

            let stdout = '';
            let stderr = '';

            pyProcess.stdout.on('data', d => { stdout += d.toString(); });
            pyProcess.stderr.on('data', d => { stderr += d.toString(); });

            pyProcess.on('close', code => {
              try {
                try {
                  fs.unlinkSync(inputPath);
                } catch {}

                if (code !== 0) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: stderr || 'Aesthetic scoring failed' }));
                  return;
                }

                // Extract JSON from output line
                const lines = stdout.trim().split('\n');
                const lastLine = lines[lines.length - 1];
                const parsed = JSON.parse(lastLine);

                res.statusCode = 200;
                res.end(JSON.stringify(parsed));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
              }
            });
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
      });

      server.middlewares.use('/api/cover/deplastic', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'POST required' }));
          return;
        }

        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const imageBase64 = payload.image;
            const strength = typeof payload.strength === 'number' ? payload.strength : 0.65;
            const grain = typeof payload.grain === 'number' ? payload.grain : 0.35;
            const dewax = typeof payload.dewax === 'number' ? payload.dewax : 0.5;
            const codeformer = typeof payload.codeformer === 'boolean' ? payload.codeformer : true;
            const fidelity = typeof payload.fidelity === 'number' ? payload.fidelity : 0.7;

            if (!imageBase64 || typeof imageBase64 !== 'string') {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing image data' }));
              return;
            }

            const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
            const tmpDir = os.tmpdir();
            const inputPath = path.join(tmpDir, `cover_deplastic_in_${Date.now()}.png`);
            const outputPath = path.join(tmpDir, `cover_deplastic_out_${Date.now()}.png`);

            fs.writeFileSync(inputPath, Buffer.from(cleanBase64, 'base64'));

            const scriptPath = path.resolve(__dirname, '../scripts/cover_ai.py');
            const pyArgs = [
              scriptPath,
              'deplastic',
              '--input', inputPath,
              '--output', outputPath,
              '--strength', String(strength),
              '--grain', String(grain),
              '--dewax', String(dewax),
              '--fidelity', String(fidelity),
            ];
            if (!codeformer) {
              pyArgs.push('--no-codeformer');
            }

            const pyProcess = spawn('python3', pyArgs);

            let stdout = '';
            let stderr = '';
            pyProcess.stdout.on('data', d => { stdout += d.toString(); });
            pyProcess.stderr.on('data', d => { stderr += d.toString(); });

            pyProcess.on('close', code => {
              try {
                if (code !== 0 || !fs.existsSync(outputPath)) {
                  try { fs.unlinkSync(inputPath); } catch {}
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: stderr || 'De-plasticizing failed' }));
                  return;
                }

                const outBuffer = fs.readFileSync(outputPath);
                try {
                  fs.unlinkSync(inputPath);
                  fs.unlinkSync(outputPath);
                } catch {}

                let meta: any = {};
                try {
                  const lines = stdout.trim().split('\n');
                  meta = JSON.parse(lines[lines.length - 1]);
                } catch {}

                res.statusCode = 200;
                res.end(JSON.stringify({
                  status: 'ok',
                  imageBase64: `data:image/png;base64,${outBuffer.toString('base64')}`,
                  facesRestored: meta.faces_restored || 0,
                  codeformerApplied: meta.codeformer_applied ?? codeformer,
                  fidelity,
                }));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
              }
            });
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
      });
    },
  };
}
