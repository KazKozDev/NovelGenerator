import React from 'react';
import { useFillHeight } from '../utils/useFillHeight';
import { useWorkspaceEntry } from '../utils/workspaceState';
import { ebookCover, loadCoverArt, type CoverArt } from '../utils/publish/coverSource';
import { LANGUAGES, guessLanguage, normalizeIsbn13 } from '../utils/publish/ebookStores';
import { OWN_FORMATS, exportOwnFormat, type OwnFormat } from '../utils/publish/ownFormats';
import { publishSummary, type PublishGroup, type PublishStage } from '../utils/publish/publishStatus';
import type { Narration } from '../utils/publish/disclosures';
import { findChapterTimecodes, formatTimecode, type TimecodeChapter, type TranscriptWord } from '../utils/audiobook/chapterTimecodes';
import { getDefaultImprintData, type ImprintData } from '../utils/imprintConstants';
import PlatformRow, { type PublishPlatform } from './publish/PlatformRow';
import { useEbookPlatforms } from './publish/useEbookPlatforms';
import { usePrintPlatforms } from './publish/usePrintPlatforms';
import { useAudioPlatforms, type AudioMaster } from './publish/useAudioPlatforms';

interface PublishStudioProps {
  title: string;
  /** The cover studio's key for this book. */
  studioKey: string;
  /** The manuscript as Markdown, empty while no chapter is written. */
  content: string;
  metadata: Record<string, unknown>;
  draft: boolean;
  author: string;
  onAuthorChange?: (author: string) => void;
  imprint?: ImprintData;
  onImprintChange?: (imprint: ImprintData) => void;
  coverImage?: string | null;
  /** The chapters the audiobook's timecodes are found by; without them there are no audio editions. */
  audioChapters?: TimecodeChapter[];
}

// The studio vocabulary the Cover stage set: buttons, fields, labels and panels look the same on every stage.
// Secondary actions are outlined, not filled: a page of dark filled buttons reads as a wall of black blocks.
const button = 'px-3 py-1.5 text-xs rounded bg-transparent hover:bg-zinc-800/70 border border-zinc-700 text-zinc-300 hover:text-zinc-100 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';
const primary = 'px-3 py-1.5 text-xs rounded bg-zinc-500 hover:bg-zinc-600 text-white font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-zinc-500';
const field = 'w-full rounded border border-zinc-700 bg-zinc-800/60 px-2 py-1.5 text-xs text-zinc-200';
const label = 'block text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1';

const SEGMENT: Record<PublishStage, string> = {
  live: 'bg-emerald-500', checked: 'bg-zinc-200', built: 'bg-zinc-400', ready: 'bg-zinc-700', blocked: 'bg-red-500/60', failed: 'bg-red-500',
};
// What the edition is made from: their blockers are fixed in the sidebar's "Made from", not repeated in the list.
const SOURCE_NOTE = /recording|needs a cover|no cover|No chapter is written|timecodes/i;

const GROUPS: { id: PublishGroup; title: string; unit: string }[] = [
  { id: 'ebook', title: 'eBook stores', unit: 'store' },
  { id: 'print', title: 'Print', unit: 'printer' },
  { id: 'audio', title: 'Audiobook', unit: 'store' },
  { id: 'video', title: 'Video', unit: 'channel' },
];
const TAB_NAMES: Record<PublishGroup, string> = { ebook: 'eBook', print: 'Print', audio: 'Audio', video: 'Video' };

function uploadRecording(file: File, onShare: (share: number) => void): Promise<{ id: string; duration: number }> {
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

/**
 * The fifth stage, where the book leaves the app, laid out like the Cover stage: on the left the edition's facts, what
 * its files are made from and the app's own copies; on the right every store, printer and channel as one row that says
 * how far its edition has come (ready, built, checked, live), with requirements, checks and upload steps a click away.
 */
export default function PublishStudio({ title, studioKey, content, metadata, draft, author, onAuthorChange, imprint, onImprintChange, coverImage, audioChapters }: PublishStudioProps) {
  const hasText = !!content.trim();
  const [savedLanguage, setLanguage] = useWorkspaceEntry<string>(title, 'publish.language');
  const language = savedLanguage || guessLanguage(content);
  const [art, setArt] = React.useState<CoverArt | null | undefined>();
  // The stores' cover: drawn from the Cover studio's master at 1600 × 2560, or the book cover when there is no studio.
  const [storeCover, setStoreCover] = React.useState<{ dataUrl: string; width: number; height: number } | null | undefined>();
  const [master, setMaster] = React.useState<AudioMaster | null>(null);
  const [own, setOwn] = React.useState<{ busy?: OwnFormat; saved?: string; error?: string }>({});
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const [buildingAll, setBuildingAll] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<PublishGroup | 'all'>('all');
  const asideFill = useFillHeight<HTMLElement>();
  // The audio studio narrates with a digital voice; a recording by a person is the author's to say.
  const [savedNarration, setNarration] = useWorkspaceEntry<Narration>(title, 'publish.narration');
  const narration: Narration = savedNarration || 'digital';
  const [transcript] = useWorkspaceEntry<{ duration: number; words: TranscriptWord[]; fileName: string }>(title, 'audio:timecodes');
  const chapters = audioChapters || [];
  const timecodes = React.useMemo(() => (transcript && chapters.length ? findChapterTimecodes(transcript.words, chapters) : []), [transcript, chapters]);

  React.useEffect(() => {
    let cancelled = false;
    setStoreCover(undefined);
    loadCoverArt(studioKey, title, author, coverImage)
      .then(async found => {
        if (cancelled) return;
        setArt(found);
        setStoreCover(found ? await ebookCover(found) : null);
      })
      .catch(() => { if (!cancelled) { setArt(null); setStoreCover(null); } });
    return () => { cancelled = true; };
  }, [studioKey, title, author, coverImage]);

  const disclosure = { narration, aiCover: art?.source === 'studio' };
  const ebook = useEbookPlatforms({ title, author, language, content, metadata, imprint, cover: storeCover, disclosure });
  const print = usePrintPlatforms({ title, studioKey, content, author, language, imprint, coverImage, disclosure });
  const audio = useAudioPlatforms({ title, author, art, master, timecodes, chapters: chapters.length, disclosure });
  const platforms: PublishPlatform[] = [...ebook, ...print.platforms, ...(chapters.length ? audio : [])];
  const summary = publishSummary(platforms.map(p => ({ id: p.key, name: p.name, stage: p.stage, note: p.note })));

  const toggle = (key: string, force?: boolean) => setOpen(prev => {
    const next = new Set(prev);
    if (force ?? !next.has(key)) next.add(key); else next.delete(key);
    return next;
  });
  const reveal = (key: string) => {
    toggle(key, true);
    requestAnimationFrame(() => document.getElementById(`publish-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  // One after another: the audio builds share the server's encoder, the print layouts the browser's.
  const buildAll = async (list: PublishPlatform[], what: string) => {
    setBuildingAll(what);
    try { for (const p of list) await p.build(); } finally { setBuildingAll(null); }
  };
  const readyIn = (list: PublishPlatform[]) => list.filter(p => p.stage === 'ready' && !p.busy);

  const chooseRecording = async (file: File) => {
    setMaster({ name: file.name, share: 0 });
    try {
      const { id, duration } = await uploadRecording(file, share => setMaster(m => (m ? { ...m, share } : m)));
      setMaster({ id, name: file.name, duration });
    } catch (err) {
      setMaster({ name: file.name, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const exportOwn = async (format: OwnFormat) => {
    setOwn({ busy: format });
    try {
      const saved = await exportOwnFormat(format, content, { ...metadata, author, imprint }, draft);
      setOwn({ saved: saved || undefined });
    } catch (error) {
      setOwn({ error: error instanceof Error ? error.message : String(error) });
    }
  };

  const changeImprint = (change: Partial<ImprintData>) => onImprintChange?.({ ...(imprint || getDefaultImprintData()), ...change });
  const isbnEbook = imprint?.isbnEbook || '', isbnPrint = imprint?.isbnPaperback || '';
  const validIsbn = (isbn: string) => !isbn.trim() || !!normalizeIsbn13(isbn);
  const allReady = readyIn(platforms);
  const found = timecodes.filter(t => t.start !== null).length;
  const otherBlockers = summary.blockers.filter(b => !SOURCE_NOTE.test(b.note));
  const words = React.useMemo(() => content.split(/\s+/).filter(Boolean).length, [content]);
  const chapterCount = (content.match(/^##\s/gm) || []).length;
  const waiting = platforms.length - summary.live - summary.toUpload - summary.toBuild;
  const groups = GROUPS.map(g => ({ ...g, list: platforms.filter(p => p.group === g.id) })).filter(g => g.list.length);
  const shown = filter === 'all' ? groups : groups.filter(g => g.id === filter);
  const segmented = (value: Narration, text: string) => (
    <button type="button" onClick={() => setNarration(value)} aria-pressed={narration === value}
      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${narration === value ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60' : 'text-zinc-400 hover:text-zinc-200'}`}>{text}</button>
  );
  const sources: { name: string; level: 'ok' | 'warn' | 'missing'; value: string; action?: React.ReactNode }[] = [
    { name: 'Manuscript', level: hasText ? 'ok' : 'missing', value: hasText ? `${chapterCount || chapters.length} chapters · ${words.toLocaleString()} words` : 'No chapter is written yet' },
    { name: 'Cover', level: storeCover ? 'ok' : 'missing', value: storeCover ? (art?.source === 'studio' ? 'Lettered from the Cover stage' : 'The book cover') : storeCover === null ? 'Make one on the Cover stage' : 'Loading…' },
    ...(chapters.length ? [
      {
        name: 'Recording',
        level: (master?.id ? 'ok' : 'missing') as 'ok' | 'missing',
        value: !master ? `The whole book in one file · for ${audio.length} audio & video` : master.error ? master.error : master.share !== undefined ? `Uploading ${master.name} · ${Math.round(master.share * 100)}%` : `${master.name} · ${formatTimecode(master.duration || 0, (master.duration || 0) >= 3600)}`,
        action: (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <label className={`${button} cursor-pointer ${master?.share !== undefined ? 'pointer-events-none opacity-40' : ''}`}>
              {master?.id ? 'Change…' : 'Choose file…'}
              <input type="file" accept="audio/*,.mp3,.m4a,.m4b,.wav,.flac" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void chooseRecording(f); }} />
            </label>
            <span className="inline-flex p-0.5 bg-zinc-800/60 border border-zinc-800 rounded-md" role="group" aria-label="Narration">{segmented('digital', 'Digital voice')}{segmented('human', 'Human')}</span>
          </div>
        ),
      },
      {
        name: 'Timecodes', level: (transcript && found === chapters.length ? 'ok' : transcript ? 'warn' : 'missing') as 'ok' | 'warn' | 'missing',
        value: transcript ? `${found} of ${chapters.length} chapters found` : 'Not found yet: Audio → Timecodes',
      },
    ] : []),
  ];

  return (
    <section aria-label="Publish" className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)] items-start text-left">
      {/* Left: the edition every file carries, what the files are made from, and the app's own copies */}
      <aside ref={asideFill} aria-label="Edition" className="rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden flex flex-col lg:sticky lg:top-4">
        <div className="px-3.5 py-2.5 border-b border-zinc-800 bg-zinc-900/80 shrink-0 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-200">Edition</h2>
          <span className="text-[11px] font-mono text-zinc-500">{summary.live} of {platforms.length} live</span>
        </div>
        <div className="overflow-y-auto flex-1">
          <div className="p-3.5 space-y-3 border-b border-zinc-800">
            <div className="flex gap-3">
              {storeCover ? <img src={storeCover.dataUrl} alt="Book cover" className="w-16 shrink-0 rounded border border-zinc-700/80 shadow-lg" />
                : <div className="flex aspect-[1/1.6] w-16 shrink-0 items-center justify-center rounded border border-dashed border-zinc-700 text-center text-[10px] text-zinc-500">{storeCover === null ? 'No cover' : '…'}</div>}
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-zinc-100 leading-snug" style={{ fontFamily: 'ui-serif, Georgia, Cambria, serif' }}>{title || 'Untitled'}</p>
                <p className="text-[11px] text-zinc-500">Carried into every file. Files go to the book folder, in издания/.</p>
              </div>
            </div>
            <label className="block">
              <span className={label}>Author</span>
              <input className={field} value={author} placeholder="Name on the cover" onChange={e => onAuthorChange?.(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className={label}>Language</span>
                <select className={field} value={language} onChange={e => setLanguage(e.target.value)}>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </label>
              <label>
                <span className={label}>Edition</span>
                <input className={field} value={imprint?.edition ?? getDefaultImprintData().edition} placeholder="First edition" onChange={e => changeImprint({ edition: e.target.value })} title="On the copyright page of every edition" />
              </label>
              <label>
                <span className={label}>eBook ISBN</span>
                <input className={`${field} ${validIsbn(isbnEbook) ? '' : 'border-red-800'}`} value={isbnEbook} placeholder="Optional" onChange={e => changeImprint({ isbnEbook: e.target.value })} />
              </label>
              <label>
                <span className={label}>Print ISBN</span>
                <input className={`${field} ${validIsbn(isbnPrint) ? '' : 'border-red-800'}`} value={isbnPrint} placeholder="KDP gives one" onChange={e => changeImprint({ isbnPaperback: e.target.value })} />
              </label>
            </div>
          </div>

          <div className="p-3.5 space-y-3 border-b border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-200">Made from</h3>
            {sources.map(s => (
              <div key={s.name} className="flex items-start gap-2.5">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${s.level === 'ok' ? 'bg-emerald-500' : s.level === 'warn' ? 'bg-amber-400' : 'bg-zinc-600'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-200">{s.name}</p>
                  <p className="text-[11px] text-zinc-500 break-words">{s.value}</p>
                  {s.action}
                </div>
              </div>
            ))}
          </div>

          <div className="p-3.5 space-y-2">
            <h3 className="text-xs font-semibold text-zinc-200">Our formats</h3>
            <div className="flex flex-wrap gap-1.5">
              {OWN_FORMATS.map(f => (
                <button key={f.id} type="button" className={button} disabled={!hasText || !author.trim() || !!own.busy} onClick={() => void exportOwn(f.id)} title={f.note}>
                  {own.busy === f.id ? 'Saving…' : f.name}
                </button>
              ))}
            </div>
            {(!hasText || !author.trim()) && <p className="text-[11px] text-zinc-500">{!hasText ? 'Book formats open once a chapter is written.' : 'Add the author name above to save the book formats.'}</p>}
            {own.saved && <p className="text-xs text-emerald-300">Saved to {own.saved}</p>}
            {own.error && <p role="alert" className="text-xs text-red-300">{own.error}</p>}
          </div>
        </div>
      </aside>

      {/* Right: every store, printer and channel, and how far its edition has come */}
      <div className="space-y-5 min-w-0">
        <div className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/60 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <span>Publish Studio</span>
              <span className="text-xs font-normal text-zinc-400">· {platforms.length} editions</span>
            </h2>
            <p className="text-xs text-zinc-400">
              Ready → Built → Checked → Live · {summary.live} live · {summary.toUpload} to upload · {summary.toBuild} to build · {waiting} waiting
            </p>
            <div className="flex h-1.5 w-72 max-w-full gap-0.5 overflow-hidden rounded" aria-hidden="true">
              {platforms.map(p => <span key={p.key} title={`${p.name}: ${p.stage}`} className={`flex-1 ${SEGMENT[p.stage]}`} />)}
            </div>
          </div>
          <button type="button" className={primary} disabled={!allReady.length || !!buildingAll} onClick={() => void buildAll(allReady, 'all')}>
            {buildingAll === 'all' ? 'Building one by one…' : allReady.length ? `Build all (${allReady.length})` : 'Nothing ready to build'}
          </button>
          {otherBlockers.length > 0 && (
            <ul className="w-full space-y-1 border-t border-zinc-800 pt-2.5 text-[11px]">
              {otherBlockers.slice(0, 4).map(b => (
                <li key={b.note}>
                  <button type="button" onClick={() => reveal(b.firstId)} className="flex w-full gap-2 text-left text-zinc-400 hover:text-zinc-100" title={b.names.join(', ')}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    <span className="min-w-0"><span className="text-zinc-300">{b.note}</span> <span className="text-zinc-500">· {b.names.length === 1 ? b.names[0] : `${b.names.length} editions`}</span></span>
                  </button>
                </li>
              ))}
              {otherBlockers.length > 4 && <li className="pl-3.5 text-zinc-500">and {otherBlockers.length - 4} more below</li>}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-0.5 bg-zinc-900 border border-zinc-800 rounded-lg" role="tablist" aria-label="Edition groups">
            {[{ id: 'all' as const, name: 'All', n: platforms.length }, ...groups.map(g => ({ id: g.id, name: TAB_NAMES[g.id], n: g.list.length }))].map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={filter === t.id} onClick={() => setFilter(t.id)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${filter === t.id ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60' : 'text-zinc-400 hover:text-zinc-200'}`}>
                {t.name} ({t.n})
              </button>
            ))}
          </div>
          <span className="text-[11px] text-zinc-500">Click a row for its requirements, checks and upload steps</span>
        </div>

        {shown.map(group => {
          const ready = readyIn(group.list);
          const toUpload = group.list.filter(p => p.stage === 'built' || p.stage === 'checked').length;
          return (
            <div key={group.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden shadow-lg">
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/90 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <span>{group.title}</span>
                  <span className="text-xs font-normal font-mono text-zinc-400">
                    {group.list.length} {group.unit}{group.list.length === 1 ? '' : 's'}{toUpload ? ` · ${toUpload} to upload` : ''}
                  </span>
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  {group.id === 'print' && print.controls}
                  {group.list.length > 1 && (
                    <button type="button" className={button} disabled={!ready.length || !!buildingAll} onClick={() => void buildAll(ready, group.id)}>
                      {buildingAll === group.id ? 'Building…' : `Build ready (${ready.length})`}
                    </button>
                  )}
                </div>
              </div>
              <ul>
                {group.list.map(p => <PlatformRow key={p.key} p={p} open={open.has(p.key)} onToggle={() => toggle(p.key)} />)}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
