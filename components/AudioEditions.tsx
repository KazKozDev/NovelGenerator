import React from 'react';
import { useWorkspaceEntry } from '../utils/workspaceState';
import { loadCoverArt, type CoverArt } from '../utils/publish/coverSource';
import { COVER_FORMATS, renderCover } from '../utils/cover/formats';
import { findChapterTimecodes, formatTimecode, youtubeChapterList, type TimecodeChapter, type TranscriptWord } from '../utils/audiobook/chapterTimecodes';
import {
  AUDIO_STORES,
  audioParts,
  audioReadiness,
  measureChecks,
  partFileName,
  type AudioCheck,
  type AudioMeasure,
  type AudioPart,
  type AudioStore,
} from '../utils/publish/audioStores';

/**
 * Publish stage, audiobook stores: the author's one recording of the book becomes each store's files, cut at the
 * chapter timecodes found on the Audio stage, levelled and encoded on the dev server, then measured and checked here
 * against what the store asks for. Files go to the book folder, издания/<store> — аудио/.
 */
interface Run { busy?: boolean; stage?: string; progress?: number; folder?: string; files?: { part: AudioPart; measure: AudioMeasure }[]; error?: string }

const card = 'rounded-lg border border-zinc-800 bg-zinc-900/40 p-4';
const smallButton = 'h-8 px-3 rounded border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors disabled:opacity-40';
const Dot: React.FC<{ level: AudioCheck['level'] }> = ({ level }) => (
  <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${level === 'ok' ? 'bg-emerald-500' : level === 'warn' ? 'bg-amber-400' : 'bg-red-500'}`} />
);

/** The store's cover: lettered from the studio's master at the store's size, or the finished cover over its own blur. */
function storeCover(art: CoverArt, store: AudioStore): string {
  const format = COVER_FORMATS.find(f => f.id === store.cover.formatId)!;
  if (!art.frontArt) return renderCover(art.master, format, art.text, art.style, art.focus).toDataURL('image/jpeg', 0.92);
  const canvas = document.createElement('canvas');
  const W = (canvas.width = format.width), H = (canvas.height = format.height);
  const ctx = canvas.getContext('2d')!;
  const front = art.frontArt;
  const fill = Math.max(W / front.width, H / front.height);
  ctx.filter = 'blur(48px) brightness(0.45)';
  ctx.drawImage(front, (W - front.width * fill) / 2, (H - front.height * fill) / 2, front.width * fill, front.height * fill);
  ctx.filter = 'none';
  const fit = Math.min((W * 0.92) / front.width, (H * 0.92) / front.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(front, (W - front.width * fit) / 2, (H - front.height * fit) / 2, front.width * fit, front.height * fit);
  return canvas.toDataURL('image/jpeg', 0.92);
}

function upload(file: File, onShare: (share: number) => void): Promise<{ id: string; duration: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/audiobook/master?${new URLSearchParams({ name: file.name })}`);
    xhr.upload.onprogress = e => e.lengthComputable && onShare(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        xhr.status === 200 ? resolve(data) : reject(new Error(data.error || `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status}). Is the dev server running?`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed. Is the dev server running?'));
    xhr.send(file);
  });
}

export default function AudioEditions({ title, studioKey, author, coverImage, chapters }: { title: string; studioKey: string; author: string; coverImage?: string; chapters: TimecodeChapter[] }) {
  const [transcript] = useWorkspaceEntry<{ duration: number; words: TranscriptWord[]; fileName: string }>(title, 'audio:timecodes');
  const timecodes = React.useMemo(() => (transcript ? findChapterTimecodes(transcript.words, chapters) : []), [transcript, chapters]);
  const [master, setMaster] = React.useState<{ id?: string; name: string; duration?: number; share?: number; error?: string } | null>(null);
  const [art, setArt] = React.useState<CoverArt | null | undefined>();
  const [runs, setRuns] = React.useState<Partial<Record<AudioStore['id'], Run>>>({});
  const setRun = (id: AudioStore['id'], change: Run) => setRuns(prev => ({ ...prev, [id]: { ...prev[id], ...change } }));

  React.useEffect(() => {
    let cancelled = false;
    loadCoverArt(studioKey, title, author, coverImage).then(a => { if (!cancelled) setArt(a); }, () => { if (!cancelled) setArt(null); });
    return () => { cancelled = true; };
  }, [studioKey, title, author, coverImage]);

  const choose = async (file: File) => {
    setMaster({ name: file.name, share: 0 });
    try {
      const { id, duration } = await upload(file, share => setMaster(m => (m ? { ...m, share } : m)));
      setMaster({ id, name: file.name, duration });
    } catch (err) {
      setMaster({ name: file.name, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const prepare = async (store: AudioStore) => {
    if (!master?.id || !master.duration || !art) return;
    setRun(store.id, { busy: true, stage: 'Drawing the cover', progress: 0, files: undefined, error: undefined });
    try {
      const parts = audioParts(store, timecodes, master.duration);
      let n = 0;
      const files = parts.map(p => ({ ...p, file: partFileName(p, p.kind === 'sample' ? 0 : n++, store) }));
      const list = youtubeChapterList(timecodes, title || 'Intro', master.duration);
      const res = await fetch('/api/audiobook/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master: master.id,
          title,
          author,
          store: { name: store.name, layout: store.layout, container: store.container, bitrateKbps: store.bitrateKbps, sampleRate: store.sampleRate, target: store.loudness.target, truePeak: store.loudness.truePeak, head: store.head ? (store.head[0] + store.head[1]) / 2 : undefined, tail: store.tail ? Math.min(store.tail[1], store.tail[0] + 1) : undefined },
          parts: files,
          cover: storeCover(art, store),
          coverName: `Cover ${store.cover.width}x${store.cover.height}`,
          extras: store.id === 'youtube' ? [{ name: 'YouTube description.txt', content: `${title}${author ? ` by ${author}` : ''}\n\nChapters\n${list}\n` }] : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Status ${res.status}`);
      // The build runs in the server's process; its progress is asked for once a second.
      for (;;) {
        await new Promise(r => setTimeout(r, 1000));
        const jobRes = await fetch(`/api/audiobook/job?${new URLSearchParams({ id: data.id })}`);
        const job = await jobRes.json();
        if (!jobRes.ok) throw new Error(job.error || `Status ${jobRes.status}`);
        setRun(store.id, { stage: job.stage, progress: job.progress, folder: job.folder, files: job.files });
        if (job.stage === 'error') throw new Error(job.error);
        if (job.stage === 'done') break;
      }
      setRun(store.id, { busy: false });
    } catch (err) {
      setRun(store.id, { busy: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const hours = (master?.duration ?? transcript?.duration ?? 0) >= 3600;
  const found = timecodes.filter(t => t.start !== null).length;

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-center gap-3`}>
        <label className={`${smallButton} inline-flex cursor-pointer items-center ${master && master.share !== undefined ? 'pointer-events-none opacity-40' : ''}`}>
          Choose the recording…
          <input type="file" accept="audio/*,.mp3,.m4a,.m4b,.wav,.flac" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void choose(f); }} />
        </label>
        <span className="text-xs text-zinc-400">
          {!master ? 'The whole book in one file, the same one the Timecodes tab was given.'
            : master.error ? <span className="text-red-400">{master.error}</span>
            : master.share !== undefined ? `Uploading ${master.name} · ${Math.round(master.share * 100)}%`
            : `${master.name} · ${formatTimecode(master.duration || 0, hours)}`}
        </span>
        <span className="ml-auto text-[11px] text-zinc-500">
          {transcript ? `Timecodes: ${found} of ${chapters.length} chapters, from ${transcript.fileName}` : 'No timecodes yet: Audio → Timecodes'}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {AUDIO_STORES.map(store => {
          const checks = audioReadiness(store, { title, author, timecodes, chapters: chapters.length, hasCover: !!art, hasMaster: !!master?.id });
          const blocked = checks.some(c => c.level === 'fail');
          const run = runs[store.id] || {};
          const results = (run.files || []).map(f => ({ ...f, checks: measureChecks(store, f.part, f.measure) }));
          const failing = results.filter(r => r.checks.some(c => c.level === 'fail')).length;
          return (
            <article key={store.id} className={`${card} flex flex-col gap-3`}>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">{store.name}</h3>
                <p className="text-[11px] text-zinc-500">{store.where}</p>
              </div>
              <ul className="space-y-0.5 text-xs text-zinc-300">{store.requirements.map(r => <li key={r}>{r}</li>)}</ul>
              <ul className="space-y-1 text-[11px] text-zinc-400">{checks.map(c => <li key={c.text} className="flex gap-2"><Dot level={c.level} /><span>{c.text}</span></li>)}</ul>

              {run.busy && (
                <div className="space-y-1" aria-live="polite">
                  <p className="text-[11px] text-zinc-400 truncate">{run.stage} · {Math.round((run.progress || 0) * 100)}%</p>
                  <div className="h-1 rounded bg-zinc-800 overflow-hidden"><div className="h-full bg-zinc-300 transition-all" style={{ width: `${(run.progress || 0) * 100}%` }} /></div>
                </div>
              )}
              {results.length > 0 && (
                <details className="rounded border border-zinc-800 bg-zinc-950/60 p-2 text-[11px]" open={failing > 0}>
                  <summary className={`cursor-pointer ${failing ? 'text-red-400' : 'text-emerald-400'}`}>
                    {results.length} file{results.length === 1 ? '' : 's'} measured · {failing ? `${failing} outside the limits` : 'all within the limits'}
                  </summary>
                  <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                    {results.map(r => (
                      <li key={r.measure.name}>
                        <p className="truncate text-zinc-300" title={r.measure.name}>{r.measure.name} · {formatTimecode(r.measure.duration, r.measure.duration >= 3600)}</p>
                        <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-zinc-500">{r.checks.map(c => <li key={c.text} className="flex gap-1.5"><Dot level={c.level} /><span>{c.text}</span></li>)}</ul>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {run.folder && !run.busy && !run.error && <p className="truncate text-[11px] text-emerald-400/90" title={run.folder}>✓ Saved to …/{run.folder.split('/').slice(-3).join('/')}</p>}
              {run.error && <p className="text-[11px] text-red-400 whitespace-pre-wrap">{run.error}</p>}

              <div className="mt-auto space-y-2 pt-1">
                <button type="button" onClick={() => void prepare(store)} disabled={blocked || run.busy}
                  className="h-8 w-full rounded bg-zinc-200 text-xs font-semibold text-zinc-950 transition-colors hover:bg-white disabled:opacity-40">
                  {run.busy ? 'Building and measuring…' : run.files ? 'Prepare again' : `Prepare for ${store.name}`}
                </button>
                <details className="text-[11px] text-zinc-500">
                  <summary className="cursor-pointer hover:text-zinc-300">How to upload</summary>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4">{store.steps.map(step => <li key={step}>{step}</li>)}</ol>
                </details>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
