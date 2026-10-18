import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { ensureBookFolder, safeName } from './bookStorageService';

/**
 * Development plugin for the Publish stage's audiobook editions. The author's one recording of the whole book is
 * streamed to a temp file once; for each store ffmpeg cuts it at the chapter starts the page sends, levels it to the
 * store's loudness, encodes it, and measures every file it wrote. The files go to the book folder, издания/<store> — аудио/.
 * Which limits the measurements must meet is the page's code (utils/publish/audioStores.ts).
 */
interface Part { kind: string; label: string; start: number; end: number; file: string }
interface BuildRequest {
  master: string;
  title: string;
  author: string;
  store: { name: string; layout: 'chapters' | 'video'; container: 'mp3' | 'mp4'; bitrateKbps: number; sampleRate: number; target: number; truePeak: number; head?: number; tail?: number };
  parts: Part[];
  cover?: string;
  coverName?: string;
  extras?: { name: string; content: string }[];
}
interface Measure { name: string; duration: number; rms: number; peak: number; noise: number; head: number; tail: number; sampleRate: number; bitrateKbps: number; channels: number }
interface BuildJob { stage: string; progress: number; done: number; total: number; folder?: string; files: { part: Part; path: string; measure: Measure }[]; error?: string; finishedAt?: number }

const masters = new Map<string, { path: string; duration: number }>();
const jobs = new Map<string, BuildJob>();

const send = (res: any, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Runs ffmpeg or ffprobe; reports the share of `duration` encoded so far when given one. */
function run(cmd: string, args: string[], duration?: number, onShare?: (share: number) => void): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = '', stderr = '';
    child.stdout.on('data', d => {
      stdout += d.toString();
      if (duration && onShare) {
        const times = [...stdout.matchAll(/out_time_us=(\d+)/g)];
        const last = times.at(-1);
        if (last) onShare(Math.min(1, Number(last[1]) / 1e6 / duration));
        if (stdout.length > 100_000) stdout = stdout.slice(-2000);
      }
    });
    child.stderr.on('data', d => { stderr = (stderr + d.toString()).slice(-200_000); });
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr.trim().split('\n').slice(-4).join('\n') || `${cmd} exited ${code}`))));
  });
}

async function probe(file: string): Promise<{ duration: number; sampleRate: number; bitrateKbps: number; channels: number }> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  const data = JSON.parse(stdout);
  const audio = (data.streams || []).find((s: any) => s.codec_type === 'audio') || {};
  return {
    duration: Number(data.format?.duration) || 0,
    sampleRate: Number(audio.sample_rate) || 0,
    bitrateKbps: (Number(audio.bit_rate) || Number(data.format?.bit_rate) || 0) / 1000,
    channels: Number(audio.channels) || 0,
  };
}

/** RMS, peak and noise floor (quietest 50 ms window) by astats; quiet head and tail by silencedetect. */
async function measure(file: string, name: string): Promise<Measure> {
  const info = await probe(file);
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'astats=length=0.05:measure_perchannel=none,silencedetect=noise=-50dB:d=0.25', '-f', 'null', '-']);
  const overall = stderr.slice(stderr.lastIndexOf('Overall'));
  const num = (label: string) => {
    const m = overall.match(new RegExp(`${label}:\\s*(-?[\\d.]+|-inf)`));
    // Digital silence measures -inf; JSON carries it as -120 dB, below every limit.
    return !m ? NaN : m[1] === '-inf' ? -120 : Number(m[1]);
  };
  const starts = [...stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map(m => Math.max(0, Number(m[1])));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map(m => Number(m[1]));
  const head = starts.length && starts[0] < 0.05 ? (ends[0] ?? info.duration) : 0;
  // The last quiet stretch is the tail when it runs to the end of the file (ffmpeg closes it there, or leaves it open).
  const lastStart = starts[starts.length - 1];
  const tail = starts.length && (starts.length > ends.length || ends[ends.length - 1] >= info.duration - 0.1) ? info.duration - lastStart : 0;
  // Older ffmpeg prints "RMS trough", newer "RMS through".
  return { name, ...info, rms: num('RMS level dB'), peak: num('Peak level dB'), noise: num('RMS t(?:h)?rough dB'), head, tail };
}

async function build(job: BuildJob, req: BuildRequest) {
  const master = masters.get(req.master);
  if (!master || !fs.existsSync(master.path)) throw new Error('The recording is gone from the server (it restarted). Choose it again.');
  const { dir } = await ensureBookFolder(req.title, 'editions');
  const folder = path.join(dir, `${safeName(req.store.name, 'audio')} — аудио`);
  fs.mkdirSync(folder, { recursive: true });
  // The folder is this edition's own output: files of an earlier build (other chapter names) leave with it.
  for (const name of fs.readdirSync(folder)) if (/\.(mp3|mp4|m4a)$/i.test(name)) fs.rmSync(path.join(folder, name));
  job.folder = folder;
  const s = req.store;
  let coverPath = '';
  if (req.cover) {
    coverPath = path.join(folder, safeName(req.coverName || 'Cover', 'Cover') + '.jpg');
    fs.writeFileSync(coverPath, Buffer.from(req.cover.replace(/^data:[^;]+;base64,/, ''), 'base64'));
  }
  for (const extra of req.extras || []) fs.writeFileSync(path.join(folder, safeName(extra.name, 'notes.txt')), extra.content);

  const total = req.parts.reduce((sum, p) => sum + (p.end - p.start), 0) || 1;
  let encoded = 0;
  for (const part of req.parts) {
    job.stage = `Encoding ${part.label}`;
    const out = path.join(folder, safeName(part.file, `part.${s.container}`));
    const length = part.end - part.start;
    const level = `loudnorm=I=${s.target}:TP=${s.truePeak}:LRA=11,aresample=${s.sampleRate}`;
    const onShare = (share: number) => { job.progress = (encoded + share * length) / total; };
    const tags = ['-metadata', `title=${part.label}`, '-metadata', `artist=${req.author}`, '-metadata', `album=${req.title}`, '-metadata', 'genre=Audiobook'];
    if (s.layout === 'video') {
      if (!coverPath) throw new Error('The video needs a cover frame.');
      await run('ffmpeg', ['-y', '-hide_banner', '-nostats', '-progress', 'pipe:1', '-loop', '1', '-framerate', '1', '-i', coverPath, '-i', master.path,
        '-map', '0:v', '-map', '1:a', '-af', level, '-c:v', 'libx264', '-tune', 'stillimage', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '1',
        // -t, not -shortest: a one-frame-a-second picture would run past the sound by half a minute.
        '-c:a', 'aac', '-b:a', `${s.bitrateKbps}k`, '-ac', '2', '-ar', String(s.sampleRate), '-t', String(master.duration), '-movflags', '+faststart', ...tags, out], length, onShare);
    } else {
      // Quiet at both ends is cut off and laid back at the store's length, so every file opens and closes alike.
      const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse';
      const pads = part.kind === 'sample' ? '' : `,adelay=delays=${Math.round((s.head ?? 0.75) * 1000)}:all=1,apad=pad_dur=${s.tail ?? 2}`;
      // RMS is what the store measures, pauses and padding included, so the file is cut first, measured as it will
      // be heard, and only then raised to the target with a limiter holding the peaks under the store's ceiling.
      const cut = path.join(path.dirname(master.path), `cut-${newId()}.wav`);
      try {
        await run('ffmpeg', ['-y', '-hide_banner', '-nostats', '-progress', 'pipe:1', '-ss', String(part.start), '-to', String(part.end), '-i', master.path,
          '-vn', '-af', `${trim},aresample=${s.sampleRate}${pads}`, '-ac', '1', '-c:a', 'pcm_s16le', cut], length, share => onShare(share / 2));
        const { rms } = await measure(cut, 'cut');
        const gain = Math.max(-30, Math.min(30, s.target - rms));
        const ceiling = Math.pow(10, s.truePeak / 20).toFixed(4);
        await run('ffmpeg', ['-y', '-hide_banner', '-nostats', '-progress', 'pipe:1', '-i', cut,
          '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=${ceiling}:level=0:attack=5:release=50,aresample=${s.sampleRate}`,
          '-ac', '1', '-c:a', 'libmp3lame', '-b:a', `${s.bitrateKbps}k`, '-id3v2_version', '3', ...tags, out], length, share => onShare(0.5 + share / 2));
      } finally {
        fs.rm(cut, { force: true }, () => {});
      }
    }
    encoded += length;
    job.stage = `Measuring ${part.label}`;
    job.files.push({ part, path: out, measure: await measure(out, path.basename(out)) });
    job.done++;
    job.progress = encoded / total;
  }
}

export function audiobookDevPlugin(): Plugin {
  return {
    name: 'audiobook-dev-plugin',
    configureServer(server) {
      server.middlewares.use('/api/audiobook', (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');

        if (url.pathname === '/master' && req.method === 'POST') {
          const ext = path.extname(url.searchParams.get('name') || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.audio';
          const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audiobook-'));
          const file = path.join(dir, `master${ext}`);
          const out = fs.createWriteStream(file);
          req.pipe(out);
          out.on('error', err => send(res, 500, { error: err.message }));
          out.on('finish', async () => {
            try {
              const { duration } = await probe(file);
              if (!duration) throw new Error('ffprobe could not read this file as audio.');
              const id = newId();
              masters.set(id, { path: file, duration });
              send(res, 200, { id, duration });
            } catch (err) {
              fs.rm(dir, { recursive: true, force: true }, () => {});
              send(res, 400, { error: err instanceof Error ? err.message : String(err) });
            }
          });
          return;
        }

        if (url.pathname === '/build' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            let payload: BuildRequest;
            try {
              payload = JSON.parse(body);
            } catch {
              return send(res, 400, { error: 'Invalid JSON payload' });
            }
            const id = newId();
            const job: BuildJob = { stage: 'Starting', progress: 0, done: 0, total: payload.parts?.length || 0, files: [] };
            jobs.set(id, job);
            send(res, 200, { id });
            build(job, payload)
              .then(() => { job.stage = 'done'; job.progress = 1; })
              .catch(err => { job.stage = 'error'; job.error = err instanceof Error ? err.message : String(err); })
              .finally(() => { job.finishedAt = Date.now(); });
          });
          return;
        }

        if (url.pathname === '/job' && req.method === 'GET') {
          const job = jobs.get(url.searchParams.get('id') || '');
          if (!job) return send(res, 404, { error: 'No such build. The server may have restarted.' });
          return send(res, 200, job);
        }

        send(res, 404, { error: 'Unknown audiobook endpoint' });
      });
    },
  };
}
