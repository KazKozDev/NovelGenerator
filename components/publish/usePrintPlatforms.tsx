import React from 'react';
import { saveOrDownload } from '../../utils/saveToBookFolder';
import { useWorkspaceEntry } from '../../utils/workspaceState';
import { loadCoverArt } from '../../utils/publish/coverSource';
import { printWrapFormat, renderPrintWrap, type PrintSpines } from '../../utils/cover/formats';
import { coverPdf, layoutInterior, type LaidOutInterior } from '../../utils/publish/printBuild';
import { PRINT_TARGETS, TRIMS, coverGeometry, printChecks, spineFromPages, type Paper, type PrintTarget, type PrintTargetId } from '../../utils/publish/printSpecs';
import { fingerprint, platformStage } from '../../utils/publish/publishStatus';
import { platformDisclosures, type DisclosureFacts } from '../../utils/publish/disclosures';
import type { ImprintData } from '../../utils/imprintConstants';
import { usePlatformMemory } from './usePlatformMemory';
import type { PublishPlatform } from './PlatformRow';

interface PrintSettings { trimId: string; paper: Paper }
/** Spine widths read from the printers' templates; a confirmation holds for the page count it was made at. */
type TemplateSpines = Partial<Record<PrintTargetId, { spine: number; confirmed: boolean; pages?: number }>>;
interface Run { busy?: string; error?: string }

const select = 'rounded border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-xs text-zinc-200';

/**
 * The print editions: the interior laid out as a PDF at the trim with the gutter its page count asks for, and the
 * full cover with the spine measured from that page count (KDP paperback) or read from the printer's template.
 */
export function usePrintPlatforms(book: {
  title: string; studioKey: string; content: string; author: string; language: string; imprint?: ImprintData; coverImage?: string | null; disclosure: DisclosureFacts;
}): { platforms: PublishPlatform[]; controls: React.ReactNode } {
  const { title, studioKey, content, author, language, imprint, coverImage, disclosure } = book;
  const [settings, setSettings] = useWorkspaceEntry<PrintSettings>(title, 'publish.print');
  const [templates, setTemplates] = useWorkspaceEntry<TemplateSpines>(title, 'publish.templates');
  const [spines, setSpines] = useWorkspaceEntry<PrintSpines>(title, 'publish.spines');
  // Builds run one after another from the render they were started in; each adds its spine to the latest table.
  const latestSpines = React.useRef(spines);
  latestSpines.current = spines;
  const trimId = settings?.trimId || '6x9';
  const paper: Paper = settings?.paper || 'cream';
  const trim = TRIMS.find(t => t.id === trimId)!;
  const [runs, setRuns] = React.useState<Partial<Record<PrintTargetId, Run>>>({});
  const interiors = React.useRef(new Map<string, LaidOutInterior>());
  const hasText = !!content.trim();
  const setRun = (id: PrintTargetId, run: Run) => setRuns(prev => ({ ...prev, [id]: run }));

  // A change of text, trim or language makes earlier layouts stale.
  React.useEffect(() => { interiors.current.clear(); }, [content, trimId, language, title, author]);

  const pagesFor = (target: PrintTarget) => spines?.[`${target.id}:${trim.id}`]?.pages;
  const spineFor = (target: PrintTarget, pages: number) => target.spineFromPages ? spineFromPages(pages, paper) : templates?.[target.id]?.spine ?? spineFromPages(pages, paper);

  const platforms = PRINT_TARGETS.map(target => {
    const key = `print:${target.id}`;
    // A fixed list: the same hooks run in the same order on every render.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const memory = usePlatformMemory(title, key);
    const run = runs[target.id] || {};
    const pages = pagesFor(target);
    const spine = pages ? spineFor(target, pages) : undefined;
    const template = templates?.[target.id];
    const confirmed = target.spineFromPages || (!!template?.confirmed && template?.pages === pages);
    const source = fingerprint(content, title, author, language, trimId, paper, imprint?.isbnPaperback, imprint?.edition, target.spineFromPages ? null : template, coverImage?.length);
    const checks = [
      ...(!hasText ? [{ level: 'fail' as const, text: 'No chapter is written yet' }] : []),
      ...(pages
        ? printChecks(target, { pages, trimId: trim.id, spine: spine!, spineConfirmed: confirmed, author, title })
        : printChecks(target, { pages: 0, trimId: trim.id, spine: 0, spineConfirmed: true, author, title }).filter(c => !/pages|margin|Spine|spine/.test(c.text))),
      ...(!pages && hasText ? [{ level: 'warn' as const, text: 'Page count, margins and spine come from the first layout' }] : []),
    ];
    // An unconfirmed spine stops only the cover: the interior is still built, and the row says what is left.
    const blocking = checks.filter(c => c.level === 'fail' && !/is an estimate/.test(c.text));
    const status = platformStage({ checks: blocking, source, record: memory.record, liveAt: memory.liveAt });
    const g = spine !== undefined ? coverGeometry(target, trim, spine) : null;

    const build = async () => {
      setRun(target.id, { busy: 'Laying out' });
      try {
        const layoutKey = `${trim.id}:${target.minMargin || 0}`;
        let interior = interiors.current.get(layoutKey);
        if (!interior) {
          interior = await layoutInterior(target, trim, { content, title, author, language, imprint });
          interiors.current.set(layoutKey, interior);
        }
        const laidPages = interior.pages;
        const laidSpine = spineFor(target, laidPages);
        const isConfirmed = target.spineFromPages || (!!templates?.[target.id]?.confirmed && templates?.[target.id]?.pages === laidPages);
        latestSpines.current = { ...(latestSpines.current || {}), [`${target.id}:${trim.id}`]: { spine: laidSpine, pages: laidPages, source: target.spineFromPages ? 'pages' : isConfirmed ? 'template' : 'estimate' } };
        setSpines(latestSpines.current);
        const laidChecks = printChecks(target, { pages: laidPages, trimId: trim.id, spine: laidSpine, spineConfirmed: isConfirmed, author, title });
        const refused = laidChecks.find(c => c.level === 'fail' && /pages|title|Author|does not print/.test(c.text));
        if (refused) {
          memory.setRecord({ at: Date.now(), source, ok: false, note: refused.text, files: [] });
          setRun(target.id, {});
          return;
        }
        const base = `${target.name} — ${trim.id}`;
        const files: string[] = [];
        const interiorPath = await saveOrDownload({ title, kind: 'editions', label: `${base} — блок`, ext: 'pdf', content: interior.pdf, stamp: false, replace: true }, `${title}-${target.id}-${trim.id}-interior.pdf`);
        if (interiorPath) files.push(interiorPath);
        // The cover waits for a spine the printer has confirmed: a wrong one shifts the front off the board.
        if (!isConfirmed) {
          memory.setRecord({ at: Date.now(), source, ok: null, note: `Interior saved; confirm the spine (${laidPages} pages) to build the cover`, files });
          setRun(target.id, {});
          return;
        }
        setRun(target.id, { busy: 'Drawing the cover' });
        const art = await loadCoverArt(studioKey, title, author, coverImage);
        if (!art) throw new Error('No cover to draw from: make one on the Cover stage');
        const format = printWrapFormat(target, trim, { spine: laidSpine, pages: laidPages, source: target.spineFromPages ? 'pages' : 'template' });
        const canvas = renderPrintWrap(art.master, format, art.text, art.style, art.focus, art.frontArt);
        const geometry = coverGeometry(target, trim, laidSpine);
        const pdf = await coverPdf(canvas, geometry.width, geometry.height);
        const coverPath = await saveOrDownload({ title, kind: 'editions', label: `${base} — обложка`, ext: 'pdf', content: pdf, stamp: false, replace: true }, `${title}-${target.id}-${trim.id}-cover.pdf`);
        if (coverPath) files.push(coverPath);
        memory.setRecord({ at: Date.now(), source, ok: true, note: `${laidPages} pages · spine ${laidSpine.toFixed(3)}"`, files });
        setRun(target.id, {});
      } catch (error) {
        setRun(target.id, { error: error instanceof Error ? error.message : String(error) });
      }
    };

    const platform: PublishPlatform = {
      key, id: target.id, group: 'print', name: target.name, where: target.where,
      spec: `Interior PDF · ${trim.label}${pages ? ` · ${pages} pages` : ''} · Cover PDF${g ? ` ${g.width.toFixed(3)} × ${g.height.toFixed(3)} in` : ''}`,
      checks, stage: status.stage, note: status.note, liveAt: memory.liveAt, setLive: memory.setLive,
      busy: run.busy ? { label: run.busy } : undefined, error: run.error,
      files: memory.record?.source === source ? memory.record.files : [],
      build, actionLabel: 'Build', steps: target.steps, disclosures: platformDisclosures(key, disclosure),
      details: target.spineFromPages ? undefined : (
        <div className="space-y-1.5 rounded border border-zinc-800 bg-zinc-800/40 p-2">
          <label className="flex items-center gap-2 text-[11px] text-zinc-400">
            <span className="whitespace-nowrap">Spine from the template</span>
            <input type="number" step="0.001" min="0" className="h-7 w-24 rounded border border-zinc-800 bg-zinc-800/60 px-2 text-xs text-zinc-200"
              value={template?.spine ?? (spine !== undefined ? spine : '')} placeholder="in"
              onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value) && value >= 0) setTemplates({ ...(templates || {}), [target.id]: { spine: value, confirmed: false } }); }} />
            <span>in</span>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-zinc-400">
            <input type="checkbox" checked={confirmed} disabled={template?.spine === undefined || !pages}
              onChange={e => setTemplates({ ...(templates || {}), [target.id]: { spine: template!.spine, confirmed: e.target.checked, pages } })} />
            Matches the {target.id === 'kdp_hardcover' ? 'KDP' : 'IngramSpark'} template for {pages ? `${pages} pages` : 'this page count'}
          </label>
        </div>
      ),
    };
    return platform;
  });

  const controls = (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
      <label className="flex items-center gap-1.5">Trim
        <select className={select} value={trimId} onChange={e => setSettings({ trimId: e.target.value, paper })}>
          {TRIMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1.5">Paper
        <select className={select} value={paper} onChange={e => setSettings({ trimId, paper: e.target.value as Paper })}>
          <option value="cream">Cream (fiction)</option>
          <option value="white">White</option>
        </select>
      </label>
    </div>
  );
  return { platforms, controls };
}
