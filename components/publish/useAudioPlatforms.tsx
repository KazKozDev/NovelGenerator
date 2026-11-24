import React from 'react';
import type { CoverArt } from '../../utils/publish/coverSource';
import { COVER_FORMATS, renderCover } from '../../utils/cover/formats';
import { formatTimecode, youtubeChapterList, type ChapterTimecode } from '../../utils/audiobook/chapterTimecodes';
import { AUDIO_STORES, audioParts, audioReadiness, measureChecks, partFileName, type AudioMeasure, type AudioPart, type AudioStore } from '../../utils/publish/audioStores';
import { fingerprint, platformStage } from '../../utils/publish/publishStatus';
import { DIGITAL_VOICE_LINE, platformDisclosures, type DisclosureFacts } from '../../utils/publish/disclosures';
import { usePlatformMemory } from './usePlatformMemory';
import { Dot, type PublishPlatform } from './PlatformRow';

/** The author's one recording of the whole book, uploaded once to the dev server for every audio edition. */
export interface AudioMaster { id?: string; name: string; duration?: number; share?: number; error?: string }
interface Run { busy?: string; share?: number; error?: string; measured?: { part: AudioPart; measure: AudioMeasure }[] }

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

/**
 * The audiobook stores and the YouTube video: the recording cut at the chapter timecodes, levelled and encoded on the
 * dev server (services/audiobookDevPlugin.ts), then every file measured and checked against the store's limits.
 */
export function useAudioPlatforms(book: {
  title: string; author: string; art: CoverArt | null | undefined; master: AudioMaster | null;
  timecodes: ChapterTimecode[]; chapters: number; disclosure: DisclosureFacts;
}): PublishPlatform[] {
  const { title, author, art, master, timecodes, chapters, disclosure } = book;
  const [runs, setRuns] = React.useState<Partial<Record<AudioStore['id'], Run>>>({});
  const setRun = (id: AudioStore['id'], change: Run) => setRuns(prev => ({ ...prev, [id]: { ...prev[id], ...change } }));
  const starts = timecodes.map(t => t.start);

  return AUDIO_STORES.map(store => {
    const group = store.layout === 'video' ? 'video' : 'audio';
    const key = `${group}:${store.id}`;
    // A fixed list: the same hooks run in the same order on every render.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const memory = usePlatformMemory(title, key);
    const run = runs[store.id] || {};
    const checks = audioReadiness(store, { title, author, timecodes, chapters, hasCover: !!art, hasMaster: !!master?.id, narration: disclosure.narration });
    // The recording is named by its file and length: the same file chosen again after a reload is the same source.
    const source = fingerprint(master?.name, master?.duration && Math.round(master.duration), starts, title, author, art?.source, store.layout === 'video' ? disclosure.narration : null);
    // Without the recording chosen in this visit the files cannot be rebuilt, but a finished build still stands.
    const recordSource = master?.id ? source : memory.record?.source ?? source;
    const { stage, note } = platformStage({ checks: master?.id ? checks : checks.filter(c => !/recording/i.test(c.text)), source: recordSource, record: memory.record, liveAt: memory.liveAt });
    const shownStage = !master?.id && stage === 'ready' ? 'blocked' : stage;
    const shownNote = !master?.id && stage === 'ready' ? 'Choose the recording of the whole book above' : note;

    const build = async () => {
      if (!master?.id || !master.duration || !art) return;
      setRun(store.id, { busy: 'Drawing the cover', share: undefined, error: undefined, measured: undefined });
      try {
        const parts = audioParts(store, timecodes, master.duration);
        let n = 0;
        const named = parts.map(p => ({ ...p, file: partFileName(p, p.kind === 'sample' ? 0 : n++, store) }));
        const list = youtubeChapterList(timecodes, title || 'Intro', master.duration);
        const res = await fetch('/api/audiobook/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            master: master.id, title, author,
            store: { name: store.name, layout: store.layout, container: store.container, bitrateKbps: store.bitrateKbps, sampleRate: store.sampleRate, target: store.loudness.target, truePeak: store.loudness.truePeak, head: store.head ? (store.head[0] + store.head[1]) / 2 : undefined, tail: store.tail ? Math.min(store.tail[1], store.tail[0] + 1) : undefined },
            parts: named,
            cover: storeCover(art, store),
            coverName: `Cover ${store.cover.width}x${store.cover.height}`,
            extras: store.layout === 'video' ? [{ name: 'YouTube description.txt', content: `${title}${author ? ` by ${author}` : ''}\n${disclosure.narration === 'digital' ? `\n${DIGITAL_VOICE_LINE}\n` : ''}\nChapters\n${list}\n` }] : [],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Status ${res.status}`);
        // The build runs in the server's process; its progress is asked for once a second.
        let job: { stage: string; progress: number; folder?: string; files: { part: AudioPart; path: string; measure: AudioMeasure }[]; error?: string };
        for (;;) {
          await new Promise(r => setTimeout(r, 1000));
          const jobRes = await fetch(`/api/audiobook/job?${new URLSearchParams({ id: data.id })}`);
          job = await jobRes.json();
          if (!jobRes.ok) throw new Error((job as { error?: string }).error || `Status ${jobRes.status}`);
          setRun(store.id, { busy: job.stage.startsWith('Measuring') ? 'Measuring' : 'Encoding', share: job.progress, measured: job.files });
          if (job.stage === 'error') throw new Error(job.error);
          if (job.stage === 'done') break;
        }
        const failing = job.files.filter(f => measureChecks(store, f.part, f.measure).some(c => c.level === 'fail')).length;
        memory.setRecord({
          at: Date.now(), source, ok: failing === 0,
          note: failing ? `${failing} of ${job.files.length} files outside the limits` : `${job.files.length} file${job.files.length === 1 ? '' : 's'} within the limits`,
          files: job.files.map(f => f.path.split('/Documents/').pop() || f.path),
        });
        setRun(store.id, { busy: undefined, share: undefined });
      } catch (err) {
        setRun(store.id, { busy: undefined, error: err instanceof Error ? err.message : String(err) });
      }
    };

    const measured = (run.measured || []).map(f => ({ ...f, checks: measureChecks(store, f.part, f.measure) }));
    const platform: PublishPlatform = {
      key, id: store.id, group, name: store.name, where: store.where,
      spec: store.requirements[0],
      checks,
      stage: shownStage, note: shownNote, liveAt: memory.liveAt, setLive: memory.setLive,
      busy: run.busy ? { label: run.busy, share: run.share } : undefined, error: run.error,
      files: memory.record && memory.record.source === recordSource ? memory.record.files : [],
      build, actionLabel: 'Prepare', steps: store.steps, disclosures: platformDisclosures(key, disclosure),
      cannotBuild: master?.id ? undefined : 'Choose the recording above to build again',
      details: (<>
        <ul className="space-y-0.5 text-[11px] text-zinc-300">{store.requirements.slice(1).map(r => <li key={r}>{r}</li>)}</ul>
        {measured.length > 0 && <ul className="max-h-64 space-y-2 overflow-y-auto rounded border border-zinc-800 bg-zinc-800/40 p-2 text-[11px]">
          {measured.map(r => (
            <li key={r.measure.name}>
              <p className="truncate text-zinc-300" title={r.measure.name}>{r.measure.name} · {formatTimecode(r.measure.duration, r.measure.duration >= 3600)}</p>
              <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-zinc-500">{r.checks.map(c => <li key={c.text} className="flex gap-1.5"><Dot level={c.level} /><span>{c.text}</span></li>)}</ul>
            </li>
          ))}
        </ul>}
      </>),
    };
    return platform;
  });
}
