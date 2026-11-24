import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, type ChildProcess } from 'child_process';

/**
 * Development plugin for the Audio stage's Timecodes tab. The author's whole audiobook is streamed to a temp file,
 * scripts/audio_timecodes.py transcribes it with word timestamps in the background, and the page asks for the job's
 * progress until the words are ready. Finding the chapters in those words is the page's own code.
 */
interface TimecodeJob {
  stage: string;
  progress: number;
  duration?: number;
  engine?: string;
  error?: string;
  result?: unknown;
  child?: ChildProcess;
  finishedAt?: number;
}

const jobs = new Map<string, TimecodeJob>();
const KEEP_FINISHED_MS = 30 * 60 * 1000;

const send = (res: any, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const forgetOldJobs = () => {
  const now = Date.now();
  for (const [id, job] of jobs) if (job.finishedAt && now - job.finishedAt > KEEP_FINISHED_MS) jobs.delete(id);
};

export function timecodesDevPlugin(): Plugin {
  return {
    name: 'timecodes-dev-plugin',
    configureServer(server) {
      server.middlewares.use('/api/timecodes', (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const id = url.searchParams.get('id') || '';

        if (url.pathname === '/transcribe' && req.method === 'POST') {
          forgetOldJobs();
          const ext = path.extname(url.searchParams.get('name') || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.audio';
          const jobId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
          const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'timecodes-'));
          const inputPath = path.join(dir, `book${ext}`);
          const outputPath = path.join(dir, 'words.json');
          const language = (url.searchParams.get('language') || '').replace(/[^a-z]/gi, '');
          const job: TimecodeJob = { stage: 'uploading', progress: 0 };
          jobs.set(jobId, job);
          const cleanup = () => fs.rm(dir, { recursive: true, force: true }, () => {});
          const fail = (message: string) => {
            job.stage = 'error';
            job.error = message;
            job.finishedAt = Date.now();
            cleanup();
          };

          const file = fs.createWriteStream(inputPath);
          req.pipe(file);
          req.on('error', err => fail(err.message));
          file.on('error', err => {
            fail(err.message);
            send(res, 500, { error: err.message });
          });
          file.on('finish', () => {
            send(res, 200, { id: jobId });
            job.stage = 'starting';
            const args = [path.resolve(__dirname, '../scripts/audio_timecodes.py'), '--input', inputPath, '--output', outputPath];
            if (language) args.push('--language', language);
            const child = spawn('python3', args);
            job.child = child;
            let stderr = '';
            let pending = '';
            child.stdout.on('data', chunk => {
              pending += chunk.toString();
              const lines = pending.split('\n');
              pending = lines.pop() || '';
              for (const line of lines) {
                try {
                  const event = JSON.parse(line);
                  if (event.stage) job.stage = event.stage;
                  if (typeof event.progress === 'number') job.progress = event.progress;
                  if (typeof event.duration === 'number') job.duration = event.duration;
                  if (event.engine) job.engine = event.engine;
                } catch {
                  // Not a progress line.
                }
              }
            });
            child.stderr.on('data', chunk => {
              stderr = (stderr + chunk.toString()).slice(-4000);
            });
            child.on('error', err => fail(err.message));
            child.on('close', code => {
              job.child = undefined;
              if (job.stage === 'cancelled' || job.stage === 'error') return cleanup();
              if (code !== 0) return fail(stderr.trim().split('\n').slice(-3).join('\n') || `Transcription stopped (code ${code})`);
              try {
                job.result = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
                job.stage = 'done';
                job.progress = 1;
                job.finishedAt = Date.now();
                cleanup();
              } catch (err) {
                fail(err instanceof Error ? err.message : String(err));
              }
            });
          });
          return;
        }

        if (url.pathname === '/job' && req.method === 'GET') {
          const job = jobs.get(id);
          if (!job) return send(res, 404, { error: 'No such transcription. It may have finished long ago or the server restarted.' });
          const { child: _child, finishedAt: _finished, ...visible } = job;
          return send(res, 200, visible);
        }

        if (url.pathname === '/cancel' && req.method === 'POST') {
          const job = jobs.get(id);
          if (job) {
            job.stage = 'cancelled';
            job.finishedAt = Date.now();
            job.child?.kill();
          }
          return send(res, 200, { ok: true });
        }

        send(res, 404, { error: 'Unknown timecodes endpoint' });
      });
    },
  };
}
