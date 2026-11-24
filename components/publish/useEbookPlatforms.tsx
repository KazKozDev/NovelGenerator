import React from 'react';
import { buildEpub } from '../../utils/exportUtils';
import { saveOrDownload } from '../../utils/saveToBookFolder';
import { coverJpeg } from '../../utils/publish/coverImage';
import { EBOOK_STORES, editionChecks, editionFileLabel, epubCoverSize, normalizeIsbn13, stableBookId, type EbookStore } from '../../utils/publish/ebookStores';
import { fingerprint, platformStage } from '../../utils/publish/publishStatus';
import { platformDisclosures, type DisclosureFacts } from '../../utils/publish/disclosures';
import type { ImprintData } from '../../utils/imprintConstants';
import { usePlatformMemory } from './usePlatformMemory';
import type { PublishPlatform } from './PlatformRow';

interface EpubCheckResult { available: boolean; ok?: boolean; version?: string; messages: { severity: string; id: string; message: string; where?: string }[] }
interface Run { busy?: string; error?: string; check?: EpubCheckResult }

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '') || 'book';

/** The ebook stores: an EPUB 3 and an upload cover each, built here and checked by EPUBCheck as the stores check them. */
export function useEbookPlatforms(book: {
  title: string; author: string; language: string; content: string; metadata: Record<string, unknown>; imprint?: ImprintData;
  cover: { dataUrl: string; width: number; height: number; revision: string } | null | undefined; disclosure: DisclosureFacts;
}): PublishPlatform[] {
  const { title, author, language, content, metadata, imprint, cover, disclosure } = book;
  const isbnEbook = imprint?.isbnEbook || '';
  const [runs, setRuns] = React.useState<Partial<Record<EbookStore['id'], Run>>>({});
  const setRun = (id: EbookStore['id'], run: Run) => setRuns(prev => ({ ...prev, [id]: run }));
  // The cover counts by its revision and size, not its bytes: a redraw of the same cover gives slightly different bytes on every load.
  const source = fingerprint(content, title, author, language, isbnEbook, imprint?.edition, cover && `${cover.revision}:${cover.width}x${cover.height}`);
  const facts = { title, author, language, hasText: !!content.trim(), cover: cover ? { width: cover.width, height: cover.height } : undefined, isbnEbook };

  return EBOOK_STORES.map(store => {
    const key = `ebook:${store.id}`;
    // A fixed list: the same hooks run in the same order on every render.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const memory = usePlatformMemory(title, key);
    const run = runs[store.id] || {};
    const checks = editionChecks(store, facts);
    const { stage, note } = platformStage({ checks, source, record: memory.record, liveAt: memory.liveAt });
    const inside = epubCoverSize(store);

    const build = async () => {
      if (!cover) return;
      setRun(store.id, { busy: 'Building' });
      try {
        const epubCover = await coverJpeg(cover.dataUrl, inside.width, inside.height);
        const uploadCover = await coverJpeg(cover.dataUrl, store.uploadCover.width, store.uploadCover.height);
        const isbn = normalizeIsbn13(isbnEbook);
        const epub = await buildEpub(content, { ...metadata, author, imprint }, {
          language,
          identifier: isbn ? `urn:isbn:${isbn}` : stableBookId(title, author),
          cover: { mime: 'image/jpeg', base64: epubCover.base64 },
        });
        setRun(store.id, { busy: 'Checking' });
        let check: EpubCheckResult;
        try {
          const res = await fetch('/api/publish/epubcheck', { method: 'POST', body: epub });
          check = res.ok ? await res.json() : { available: false, messages: [] };
        } catch {
          check = { available: false, messages: [] };
        }
        const errors = check.messages.filter(m => m.severity !== 'WARNING').length;
        const warnings = check.messages.length - errors;
        // A store refuses an EPUB EPUBCheck refuses; such files are not saved for upload.
        if (check.available && !check.ok) {
          memory.setRecord({ at: Date.now(), source, ok: false, note: `EPUBCheck: ${errors} errors · files not saved`, files: [] });
          setRun(store.id, { check });
          return;
        }
        const name = `${slug(title)}-${store.id}`;
        const files = [
          await saveOrDownload({ title, kind: 'editions', label: editionFileLabel(store, 'книга'), ext: 'epub', content: epub, stamp: false, replace: true }, `${name}.epub`),
          await saveOrDownload({ title, kind: 'editions', label: editionFileLabel(store, 'обложка'), ext: 'jpg', content: uploadCover.blob, stamp: false, replace: true }, `${name}-cover.jpg`),
        ].filter((path): path is string => !!path);
        memory.setRecord({
          at: Date.now(), source, files,
          ok: check.available ? true : null,
          note: !check.available ? 'EPUBCheck is not installed here, so the file was not checked' : warnings ? `EPUBCheck: ${warnings} warnings` : undefined,
        });
        setRun(store.id, { check });
      } catch (error) {
        setRun(store.id, { error: error instanceof Error ? error.message : String(error) });
      }
    };

    const check = run.check;
    return {
      key, id: store.id, group: 'ebook', name: store.name, where: store.where,
      spec: `EPUB 3 · cover inside ${inside.width}×${inside.height} · Cover JPEG ${store.uploadCover.width}×${store.uploadCover.height}`,
      checks, stage, note, liveAt: memory.liveAt, setLive: memory.setLive,
      busy: run.busy ? { label: run.busy } : undefined, error: run.error,
      files: memory.record?.source === source ? memory.record.files : [],
      build, actionLabel: 'Prepare', steps: store.steps, disclosures: platformDisclosures(key, disclosure),
      details: check?.available && check.messages.length > 0 ? (
        <div className="rounded border border-zinc-800 bg-zinc-800/40 p-2 text-[11px]">
          <p className={check.ok ? 'text-amber-400/90' : 'text-red-400'}>EPUBCheck {check.version || ''}</p>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto font-mono text-zinc-400">
            {check.messages.map((m, i) => <li key={i}>{m.severity} {m.id} {m.where ? `(${m.where})` : ''}: {m.message}</li>)}
          </ul>
        </div>
      ) : check?.available ? <p className="text-[11px] text-emerald-400">EPUBCheck {check.version || ''}: no errors or warnings</p> : undefined,
    };
  });
}
