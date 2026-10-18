import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceEntry } from '../utils/workspaceState';
import { saveOrDownload } from '../utils/saveToBookFolder';
import {
  findChapterTimecodes,
  formatTimecode,
  youtubeChapterList,
  type TimecodeChapter,
  type TranscriptWord,
} from '../utils/audiobook/chapterTimecodes';

/**
 * Audio stage, Timecodes tab: the author gives the finished audiobook as one file, a local Whisper writes down every
 * word with its time (scripts/audio_timecodes.py through /api/timecodes), and the app finds each chapter's start in
 * those words. The transcript is kept in the book's workspace, so the table survives a reload and follows text edits.
 */
interface Transcript { fileName: string; duration: number; engine: string; model: string; words: TranscriptWord[] }
interface Job { id: string; stage: string; progress: number; duration?: number; error?: string }

const button = 'rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40';
const STAGES: Record<string, string> = {
  uploading: 'Uploading the file',
  starting: 'Starting the recognizer',
  decoding: 'Decoding the audio',
  loading: 'Loading the speech model',
  transcribing: 'Transcribing',
  done: 'Done',
};

function upload(file: File, onProgress: (share: number) => void, signal: { xhr?: XMLHttpRequest }): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal.xhr = xhr;
    xhr.open('POST', `/api/timecodes/transcribe?${new URLSearchParams({ name: file.name })}`);
    xhr.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        xhr.status === 200 && data.id ? resolve(data.id) : reject(new Error(data.error || `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status}). Is the dev server running?`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed. Is the dev server running?'));
    xhr.onabort = () => reject(new Error('Cancelled'));
    xhr.send(file);
  });
}

export default function AudioTimecodes({ bookTitle, chapters }: { bookTitle: string; chapters: TimecodeChapter[] }) {
  const [transcript, setTranscript] = useWorkspaceEntry<Transcript>(bookTitle, 'audio:timecodes');
  // A transcription takes minutes; its id is kept with the book, so a reload picks the running job up again.
  const [pending, setPending] = useWorkspaceEntry<{ id: string; fileName: string; startedAt: number }>(bookTitle, 'audio:timecodes:job');
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const audioUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  const player = useRef<HTMLAudioElement | null>(null);
  const uploadRef = useRef<{ xhr?: XMLHttpRequest }>({});

  const timecodes = useMemo(() => (transcript ? findChapterTimecodes(transcript.words, chapters) : []), [transcript, chapters]);
  const hours = (transcript?.duration ?? 0) >= 3600;
  const list = useMemo(() => youtubeChapterList(timecodes, bookTitle || 'Intro', transcript?.duration), [timecodes, bookTitle, transcript?.duration]);
  const running = !!job && job.stage !== 'done' && job.stage !== 'error' && job.stage !== 'cancelled';
  useEffect(() => {
    if (pending && !job) {
      setJob({ id: pending.id, stage: 'starting', progress: 0 });
      setStartedAt(pending.startedAt);
    }
  }, [pending?.id]);

  // While a transcription runs, its progress is asked for once a second; the work itself is in the server's process.
  useEffect(() => {
    if (!running || !job || job.stage === 'uploading') return;
    const timer = setInterval(async () => {
      setNow(Date.now());
      try {
        const res = await fetch(`/api/timecodes/job?${new URLSearchParams({ id: job.id })}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Status ${res.status}`);
        if (data.stage === 'done' && data.result) {
          const r = data.result;
          setPending(undefined);
          setTranscript({ fileName: pending?.fileName || file?.name || 'audiobook', duration: r.duration, engine: r.engine, model: r.model, words: r.words });
          setJob(null);
          setMessage(`Transcribed ${r.words.length.toLocaleString()} words in ${Math.round(r.seconds || 0)} s with ${r.model}.`);
        } else if (data.stage === 'error' || data.stage === 'cancelled') {
          setPending(undefined);
          setJob(null);
          setError(data.error || 'Transcription failed.');
        } else {
          setJob(j => (j ? { ...j, ...data } : j));
        }
      } catch (err) {
        setPending(undefined);
        setJob(null);
        setError(err instanceof Error ? err.message : String(err));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [running, job?.id, job?.stage === 'uploading']);

  const start = async () => {
    if (!file) return;
    setError('');
    setMessage('');
    setStartedAt(Date.now());
    setJob({ id: '', stage: 'uploading', progress: 0 });
    try {
      const id = await upload(file, share => setJob(j => (j ? { ...j, progress: share } : j)), uploadRef.current);
      setPending({ id, fileName: file.name, startedAt: Date.now() });
      setJob({ id, stage: 'starting', progress: 0 });
    } catch (err) {
      setJob(null);
      if ((err as Error).message !== 'Cancelled') setError(err instanceof Error ? err.message : String(err));
    }
  };

  const cancel = async () => {
    uploadRef.current.xhr?.abort();
    if (job?.id) await fetch(`/api/timecodes/cancel?${new URLSearchParams({ id: job.id })}`, { method: 'POST' }).catch(() => {});
    setPending(undefined);
    setJob(null);
  };

  const seek = (seconds: number | null) => {
    if (seconds === null || !player.current) return;
    player.current.currentTime = seconds;
    void player.current.play();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(list);
      setMessage('Chapter list copied.');
    } catch {
      setMessage('The browser did not allow copying; select the list below instead.');
    }
  };

  const saveList = async () => {
    const where = await saveOrDownload({ title: bookTitle, kind: 'editions', label: 'таймкоды глав YouTube', ext: 'txt', content: list, stamp: false, replace: true }, `${bookTitle || 'book'} chapters.txt`, 'text/plain;charset=utf-8');
    setMessage(where ? `Saved to ${where}` : 'Downloaded.');
  };

  const saveTable = async () => {
    const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = ['Chapter,Title,Timecode,Seconds,Match', ...timecodes.map(t =>
      [t.chapter, quote(t.label), t.start === null ? '' : formatTimecode(t.start, hours), t.start ?? '', Math.round(t.score * 100) + '%'].join(','))].join('\n');
    const where = await saveOrDownload({ title: bookTitle, kind: 'editions', label: 'таймкоды глав', ext: 'csv', content: csv, stamp: false, replace: true }, `${bookTitle || 'book'} timecodes.csv`, 'text/csv;charset=utf-8');
    setMessage(where ? `Saved to ${where}` : 'Downloaded.');
  };

  const share = job ? (job.stage === 'uploading' || job.stage === 'transcribing' ? job.progress : 0) : 0;
  const elapsed = startedAt ? Math.round((now - startedAt) / 1000) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className={`${button} cursor-pointer ${running ? 'pointer-events-none opacity-40' : ''}`}>
            Choose audiobook…
            <input type="file" accept="audio/*,.mp3,.m4a,.m4b,.wav,.flac,.ogg" className="hidden" disabled={running}
              onChange={e => { setFile(e.target.files?.[0] || null); setError(''); setMessage(''); e.target.value = ''; }} />
          </label>
          <span className="text-xs text-zinc-400 truncate max-w-[24rem]">
            {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : 'One file with the whole book: mp3, m4a or wav.'}
          </span>
          <div className="ml-auto flex gap-2">
            {running
              ? <button type="button" className={button} onClick={cancel}>Cancel</button>
              : <button type="button" className={`${button} bg-zinc-200 text-zinc-950 font-semibold hover:bg-zinc-300`} disabled={!file || !chapters.length} onClick={start}>
                  {transcript ? 'Transcribe again' : 'Find chapter timecodes'}
                </button>}
          </div>
        </div>
        {!chapters.length && <p className="text-xs text-amber-300">The book has no written chapters yet; the timecodes are found by the chapters' text.</p>}
        {running && job && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>{STAGES[job.stage] || job.stage}{job.stage === 'uploading' || job.stage === 'transcribing' ? ` · ${Math.round(share * 100)}%` : '…'}</span>
              <span>{job.duration ? `${formatTimecode(job.duration, job.duration >= 3600)} of audio · ` : ''}{formatTimecode(elapsed)} elapsed</span>
            </div>
            <div className="h-1.5 rounded bg-zinc-800 overflow-hidden" role="progressbar" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full bg-zinc-300 transition-all ${share ? '' : 'animate-pulse w-full opacity-30'}`} style={share ? { width: `${share * 100}%` } : undefined} />
            </div>
          </div>
        )}
        {error && <p role="alert" className="rounded border border-red-900 p-2 text-xs text-red-300 whitespace-pre-wrap">{error}</p>}
        {message && <p className="text-xs text-zinc-400">{message}</p>}
        {audioUrl && <audio ref={player} src={audioUrl} controls className="w-full h-9" />}
      </div>

      {transcript && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/60">
              <span className="text-xs text-zinc-400">
                {transcript.fileName} · {formatTimecode(transcript.duration, hours)} · {transcript.words.length.toLocaleString()} words · {transcript.model}
              </span>
              <button type="button" className={button} onClick={saveTable}>Save table</button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="px-3 py-2 font-medium">Chapter</th>
                  <th className="px-3 py-2 font-medium w-28">Timecode</th>
                  <th className="px-3 py-2 font-medium w-20 text-right">Match</th>
                </tr>
              </thead>
              <tbody>
                {timecodes.map(t => (
                  <tr key={t.chapter} className="border-t border-zinc-800/70">
                    <td className="px-3 py-2 text-zinc-200">{t.label}</td>
                    <td className="px-3 py-2 font-mono">
                      {t.start === null
                        ? <span className="text-amber-300 text-xs">not heard</span>
                        : <button type="button" className="text-zinc-100 hover:underline disabled:no-underline disabled:cursor-default" disabled={!audioUrl} onClick={() => seek(t.start)} title={audioUrl ? 'Play from here' : 'Choose the file again to listen'}>
                            {formatTimecode(t.start, hours)}
                          </button>}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs ${t.score >= 0.6 ? 'text-zinc-400' : 'text-amber-300'}`} title="Share of the heading and opening words heard in order at this place">
                      {t.start === null ? '—' : `${Math.round(t.score * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-zinc-800 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-400">For the YouTube description</span>
              <div className="flex gap-2">
                <button type="button" className={button} disabled={!list} onClick={copy}>Copy</button>
                <button type="button" className={button} disabled={!list} onClick={saveList}>Save .txt</button>
              </div>
            </div>
            <textarea readOnly value={list} rows={Math.min(20, Math.max(4, list.split('\n').length + 1))} aria-label="YouTube chapter list"
              className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-xs text-zinc-200" onFocus={e => e.target.select()} />
          </div>
        </div>
      )}
    </div>
  );
}
