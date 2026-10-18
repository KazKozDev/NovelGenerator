import React from 'react';
import { buildEpub } from '../utils/exportUtils';
import { saveOrDownload } from '../utils/saveToBookFolder';
import { useWorkspaceEntry } from '../utils/workspaceState';
import { coverJpeg } from '../utils/publish/coverImage';
import { ebookCover, loadCoverArt } from '../utils/publish/coverSource';
import {
  EBOOK_STORES,
  LANGUAGES,
  editionChecks,
  editionFileLabel,
  epubCoverSize,
  guessLanguage,
  normalizeIsbn13,
  stableBookId,
  type EbookStore,
  type EditionCheck,
} from '../utils/publish/ebookStores';
import { OWN_FORMATS, exportOwnFormat, type OwnFormat } from '../utils/publish/ownFormats';
import { getDefaultImprintData, type ImprintData } from '../utils/imprintConstants';
import PrintEditions from './PrintEditions';
import AudioEditions from './AudioEditions';
import type { TimecodeChapter } from '../utils/audiobook/chapterTimecodes';
import PlatformLogo from './PlatformLogo';

interface EpubCheckResult { available: boolean; ok?: boolean; version?: string; messages: { severity: string; id: string; message: string; where?: string }[] }

interface StoreRun {
  busy?: boolean;
  check?: EpubCheckResult;
  saved?: string[];
  error?: string;
}

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
  /** The chapters the audiobook's timecodes are found by; without them there is no audiobook section. */
  audioChapters?: TimecodeChapter[];
}

const card = 'rounded-lg border border-zinc-800 bg-zinc-900/40 p-4';
const field = 'h-8 w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none';
const label = 'block text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1';
const smallButton = 'h-8 px-3 rounded border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors disabled:opacity-40 disabled:hover:bg-transparent';

const Dot: React.FC<{ level: EditionCheck['level'] }> = ({ level }) => (
  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${level === 'ok' ? 'bg-emerald-500' : level === 'warn' ? 'bg-amber-400' : 'bg-red-500'}`} aria-hidden="true" />
);

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '') || 'book';

/**
 * The fifth stage: the book leaves the app. Each store gets the files its upload form asks for, checked the way the
 * store checks them; the app's own formats sit below. The project itself needs no export: it saves to the book folder.
 */
export default function PublishStudio({ title, studioKey, content, metadata, draft, author, onAuthorChange, imprint, onImprintChange, coverImage, audioChapters }: PublishStudioProps) {
  const hasText = !!content.trim();
  const [savedLanguage, setLanguage] = useWorkspaceEntry<string>(title, 'publish.language');
  const language = savedLanguage || guessLanguage(content);
  // The stores' cover: drawn from the Cover studio's master at 1600 × 2560, or the book cover when there is no studio.
  const [storeCover, setStoreCover] = React.useState<{ dataUrl: string; width: number; height: number; source: string } | null | undefined>();
  const cover = storeCover ? { width: storeCover.width, height: storeCover.height } : undefined;
  const [runs, setRuns] = React.useState<Partial<Record<EbookStore['id'], StoreRun>>>({});
  const [own, setOwn] = React.useState<{ busy?: OwnFormat; saved?: string; error?: string }>({});
  const isbnEbook = imprint?.isbnEbook || '';

  React.useEffect(() => {
    let cancelled = false;
    setStoreCover(undefined);
    loadCoverArt(studioKey, title, author, coverImage)
      .then(async art => (art ? { ...(await ebookCover(art)), source: art.source } : null))
      .then(found => { if (!cancelled) setStoreCover(found); }, () => { if (!cancelled) setStoreCover(null); });
    return () => { cancelled = true; };
  }, [studioKey, title, author, coverImage]);

  const facts = { title, author, language, hasText, cover, isbnEbook };
  const setRun = (id: EbookStore['id'], run: StoreRun) => setRuns(prev => ({ ...prev, [id]: run }));

  const prepare = async (store: EbookStore) => {
    if (!storeCover) return;
    const source = storeCover.dataUrl;
    setRun(store.id, { busy: true });
    try {
      const inside = epubCoverSize(store);
      const epubCover = await coverJpeg(source, inside.width, inside.height);
      const uploadCover = await coverJpeg(source, store.uploadCover.width, store.uploadCover.height);
      const isbn = normalizeIsbn13(isbnEbook);
      const epub = await buildEpub(content, { ...metadata, author, imprint }, {
        language,
        identifier: isbn ? `urn:isbn:${isbn}` : stableBookId(title, author),
        cover: { mime: 'image/jpeg', base64: epubCover.base64 },
      });
      let check: EpubCheckResult;
      try {
        const res = await fetch('/api/publish/epubcheck', { method: 'POST', body: epub });
        check = res.ok ? await res.json() : { available: false, messages: [] };
      } catch {
        check = { available: false, messages: [] };
      }
      // A store refuses an EPUB EPUBCheck refuses; such files are not saved for upload.
      if (check.available && !check.ok) { setRun(store.id, { check }); return; }
      const name = `${slug(title)}-${store.id}`;
      const saved = [
        await saveOrDownload({ title, kind: 'editions', label: editionFileLabel(store, 'книга'), ext: 'epub', content: epub, stamp: false, replace: true }, `${name}.epub`),
        await saveOrDownload({ title, kind: 'editions', label: editionFileLabel(store, 'обложка'), ext: 'jpg', content: uploadCover.blob, stamp: false, replace: true }, `${name}-cover.jpg`),
      ].filter((path): path is string => !!path);
      setRun(store.id, { check, saved });
    } catch (error) {
      setRun(store.id, { error: error instanceof Error ? error.message : String(error) });
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
  const isbnValid = !isbnEbook.trim() || !!normalizeIsbn13(isbnEbook);

  return (
    <section aria-label="Publish" className="space-y-5 text-left">
      {/* The edition: what every store's form and file carry */}
      <div className={card}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">Edition</h2>
          <p className="text-[11px] text-zinc-500">Carried into every file below. Files go to the book folder, in издания/.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-[1.2fr_1fr_0.8fr_0.9fr_1fr]">
          <div>
            <span className={label}>Title</span>
            <p className="h-8 truncate text-sm leading-8 text-zinc-100" style={{ fontFamily: 'ui-serif, Georgia, Cambria, serif' }}>{title || '—'}</p>
          </div>
          <label>
            <span className={label}>Author</span>
            <input className={field} value={author} placeholder="Name on the cover" onChange={e => onAuthorChange?.(e.target.value)} />
          </label>
          <label>
            <span className={label}>Language</span>
            <select className={field} value={language} onChange={e => setLanguage(e.target.value)}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </label>
          <label>
            <span className={label}>eBook ISBN</span>
            <input className={`${field} ${isbnValid ? '' : 'border-red-800'}`} value={isbnEbook} placeholder="Optional · 978…" onChange={e => changeImprint({ isbnEbook: e.target.value })} />
          </label>
          <label>
            <span className={label}>Edition</span>
            <input className={field} value={imprint?.edition ?? getDefaultImprintData().edition} placeholder="First edition" onChange={e => changeImprint({ edition: e.target.value })} title="On the copyright page of every edition" />
          </label>
        </div>
      </div>

      {/* eBook stores */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">eBook stores</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {EBOOK_STORES.map(store => {
            const checks = editionChecks(store, facts);
            const blocked = checks.some(c => c.level === 'fail');
            const run = runs[store.id] || {};
            const inside = epubCoverSize(store);
            return (
              <article key={store.id} className={`${card} flex flex-col gap-3`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-100">{store.name}</h3>
                    <p className="text-[11px] text-zinc-500">{store.where}</p>
                  </div>
                  <PlatformLogo id={store.id} />
                </div>
                <ul className="space-y-0.5 text-xs text-zinc-300">
                  <li>EPUB 3 · cover inside {inside.width}×{inside.height}</li>
                  <li>Cover JPEG {store.uploadCover.width}×{store.uploadCover.height}</li>
                </ul>
                <ul className="space-y-1 text-[11px] text-zinc-400">
                  {checks.map(c => <li key={c.text} className="flex gap-2"><Dot level={c.level} /><span>{c.text}</span></li>)}
                </ul>

                {run.check && (
                  <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2 text-[11px]">
                    {!run.check.available ? (
                      <p className="text-amber-400/90">EPUBCheck is not installed here, so the file was not checked: brew install epubcheck</p>
                    ) : run.check.messages.length === 0 ? (
                      <p className="text-emerald-400">EPUBCheck {run.check.version || ''}: no errors or warnings</p>
                    ) : (
                      <>
                        <p className={run.check.ok ? 'text-amber-400/90' : 'text-red-400'}>
                          EPUBCheck: {run.check.messages.filter(m => m.severity !== 'WARNING').length} errors, {run.check.messages.filter(m => m.severity === 'WARNING').length} warnings{run.check.ok ? '' : ' · files not saved'}
                        </p>
                        <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto font-mono text-zinc-400">
                          {run.check.messages.map((m, i) => <li key={i}>{m.severity} {m.id} {m.where ? `(${m.where})` : ''}: {m.message}</li>)}
                        </ul>
                      </>
                    )}
                  </div>
                )}
                {run.saved && run.saved.length > 0 && (
                  <ul className="space-y-0.5 text-[11px] text-emerald-400/90">
                    {run.saved.map(path => <li key={path} className="truncate" title={path}>✓ {path.split('/').pop()}</li>)}
                  </ul>
                )}
                {run.error && <p className="text-[11px] text-red-400">{run.error}</p>}

                <div className="mt-auto space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void prepare(store)}
                    disabled={blocked || run.busy}
                    className="h-8 w-full rounded bg-zinc-200 text-xs font-semibold text-zinc-950 transition-colors hover:bg-white disabled:opacity-40"
                  >
                    {run.busy ? 'Building and checking…' : run.saved ? `Prepare again` : `Prepare for ${store.name}`}
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

      {/* Print editions */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Print</h2>
        <PrintEditions title={title} studioKey={studioKey} content={content} author={author} language={language} imprint={imprint} onImprintChange={onImprintChange} coverImage={coverImage} />
      </div>

      {/* Audiobook stores */}
      {audioChapters && audioChapters.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Audiobook</h2>
          <AudioEditions title={title} studioKey={studioKey} author={author} coverImage={coverImage || undefined} chapters={audioChapters} />
        </div>
      )}

      {/* The app's own formats */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Our formats</h2>
        <div className={`${card} space-y-3`}>
          <div className="flex flex-wrap gap-2">
            {OWN_FORMATS.map(f => (
              <button key={f.id} type="button" className={smallButton} disabled={!hasText || !author.trim() || !!own.busy} onClick={() => void exportOwn(f.id)} title={f.note}>
                {own.busy === f.id ? 'Saving…' : f.name}
              </button>
            ))}
          </div>
          {(!hasText || !author.trim()) && <p className="text-[11px] text-zinc-500">{!hasText ? 'Book formats open once a chapter is written.' : 'Add the author name above to save the book formats.'}</p>}
          {own.saved && <p className="text-[11px] text-emerald-400/90">✓ Saved to {own.saved}</p>}
          {own.error && <p className="text-[11px] text-red-400">{own.error}</p>}
        </div>
      </div>
    </section>
  );
}
