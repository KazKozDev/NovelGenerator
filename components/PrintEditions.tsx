import React from 'react';
import { saveOrDownload } from '../utils/saveToBookFolder';
import { useWorkspaceEntry } from '../utils/workspaceState';
import { loadCoverArt } from '../utils/publish/coverSource';
import { printWrapFormat, renderPrintWrap, type PrintSpines } from '../utils/cover/formats';
import { coverPdf, layoutInterior, type LaidOutInterior } from '../utils/publish/printBuild';
import {
  PRINT_TARGETS,
  TRIMS,
  coverGeometry,
  printChecks,
  spineFromPages,
  type Paper,
  type PrintCheck,
  type PrintTarget,
  type PrintTargetId,
} from '../utils/publish/printSpecs';
import { normalizeIsbn13 } from '../utils/publish/ebookStores';
import { getDefaultImprintData, type ImprintData } from '../utils/imprintConstants';

interface PrintEditionsProps {
  title: string;
  /** The cover studio's key for this book, where its master pictures are kept. */
  studioKey: string;
  content: string;
  author: string;
  language: string;
  imprint?: ImprintData;
  onImprintChange?: (imprint: ImprintData) => void;
  coverImage?: string | null;
}

interface PrintSettings { trimId: string; paper: Paper }
/** Spine widths read from the printers' templates, and whether the author has checked them there. */
/** A confirmation holds for the page count it was made at; a re-layout to another count asks again. */
type TemplateSpines = Partial<Record<PrintTargetId, { spine: number; confirmed: boolean; pages?: number }>>;

interface TargetRun { busy?: string; pages?: number; spine?: number; saved?: string[]; error?: string; coverSkipped?: boolean }

const card = 'rounded-lg border border-zinc-800 bg-zinc-900/40 p-4';
const field = 'h-8 w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none';
const label = 'block text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1';

const Dot: React.FC<{ level: PrintCheck['level'] }> = ({ level }) => (
  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${level === 'ok' ? 'bg-emerald-500' : level === 'warn' ? 'bg-amber-400' : 'bg-red-500'}`} aria-hidden="true" />
);

/**
 * The print editions on the Publish stage: the interior laid out as a PDF at the trim size with the gutter its page
 * count asks for, and the full cover with the spine measured from that page count (KDP paperback) or read from the
 * printer's own template (KDP hardcover, IngramSpark).
 */
export default function PrintEditions({ title, studioKey, content, author, language, imprint, onImprintChange, coverImage }: PrintEditionsProps) {
  const [settings, setSettings] = useWorkspaceEntry<PrintSettings>(title, 'publish.print');
  const [templates, setTemplates] = useWorkspaceEntry<TemplateSpines>(title, 'publish.templates');
  const [spines, setSpines] = useWorkspaceEntry<PrintSpines>(title, 'publish.spines');
  const trimId = settings?.trimId || '6x9';
  const paper: Paper = settings?.paper || 'cream';
  const trim = TRIMS.find(t => t.id === trimId)!;
  const [runs, setRuns] = React.useState<Partial<Record<PrintTargetId, TargetRun>>>({});
  const interiors = React.useRef(new Map<string, LaidOutInterior>());
  const hasText = !!content.trim();
  const isbnPaperback = imprint?.isbnPaperback || '';

  // A change of text, trim or language makes earlier layouts stale.
  React.useEffect(() => { interiors.current.clear(); }, [content, trimId, language, title, author]);

  const setRun = (id: PrintTargetId, run: TargetRun) => setRuns(prev => ({ ...prev, [id]: run }));
  const pagesFor = (target: PrintTarget) => runs[target.id]?.pages ?? spines?.[`${target.id}:${trim.id}`]?.pages;
  const spineFor = (target: PrintTarget, pages: number) => target.spineFromPages
    ? spineFromPages(pages, paper)
    : templates?.[target.id]?.spine ?? spineFromPages(pages, paper);

  const build = async (target: PrintTarget) => {
    setRun(target.id, { busy: 'Laying out the interior…' });
    try {
      const key = `${trim.id}:${target.minMargin || 0}`;
      let interior = interiors.current.get(key);
      if (!interior) {
        interior = await layoutInterior(target, trim, { content, title, author, language, imprint });
        interiors.current.set(key, interior);
      }
      const pages = interior.pages;
      const spine = spineFor(target, pages);
      const confirmed = target.spineFromPages || (!!templates?.[target.id]?.confirmed && templates?.[target.id]?.pages === pages);
      setSpines({ ...(spines || {}), [`${target.id}:${trim.id}`]: { spine, pages, source: target.spineFromPages ? 'pages' : confirmed ? 'template' : 'estimate' } });
      const checks = printChecks(target, { pages, trimId: trim.id, spine, spineConfirmed: confirmed, author, title });
      const pagesFail = checks.some(c => c.level === 'fail' && /pages|title|Author|does not print/.test(c.text));
      if (pagesFail) { setRun(target.id, { pages, spine }); return; }

      const base = `${target.name} — ${trim.id}`;
      const saved: string[] = [];
      const interiorPath = await saveOrDownload({ title, kind: 'editions', label: `${base} — блок`, ext: 'pdf', content: interior.pdf, stamp: false, replace: true }, `${title}-${target.id}-${trim.id}-interior.pdf`);
      if (interiorPath) saved.push(interiorPath);

      // The cover waits for a spine the printer has confirmed: a wrong one shifts the front off the board.
      if (!confirmed) { setRun(target.id, { pages, spine, saved, coverSkipped: true }); return; }
      setRun(target.id, { busy: 'Drawing the cover…', pages, spine, saved });
      const art = await loadCoverArt(studioKey, title, author, coverImage);
      if (!art) throw new Error('No cover to draw from: make one on the Cover stage');
      const format = printWrapFormat(target, trim, { spine, pages, source: target.spineFromPages ? 'pages' : 'template' });
      const canvas = renderPrintWrap(art.master, format, art.text, art.style, art.focus, art.frontArt);
      const g = coverGeometry(target, trim, spine);
      const pdf = await coverPdf(canvas, g.width, g.height);
      const coverPath = await saveOrDownload({ title, kind: 'editions', label: `${base} — обложка`, ext: 'pdf', content: pdf, stamp: false, replace: true }, `${title}-${target.id}-${trim.id}-cover.pdf`);
      if (coverPath) saved.push(coverPath);
      setRun(target.id, { pages, spine, saved });
    } catch (error) {
      setRun(target.id, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <div className="space-y-3">
      <div className={`${card} grid gap-4 md:grid-cols-[1fr_1fr_1fr_2fr]`}>
        <label>
          <span className={label}>Trim size</span>
          <select className={field} value={trimId} onChange={e => setSettings({ trimId: e.target.value, paper })}>
            {TRIMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label>
          <span className={label}>Paper</span>
          <select className={field} value={paper} onChange={e => setSettings({ trimId, paper: e.target.value as Paper })}>
            <option value="cream">Cream (fiction)</option>
            <option value="white">White</option>
          </select>
        </label>
        <label>
          <span className={label}>Print ISBN</span>
          <input
            className={`${field} ${!isbnPaperback.trim() || normalizeIsbn13(isbnPaperback) ? '' : 'border-red-800'}`}
            value={isbnPaperback}
            placeholder="Optional · KDP gives a free one"
            onChange={e => onImprintChange?.({ ...(imprint || getDefaultImprintData()), isbnPaperback: e.target.value })}
          />
        </label>
        <p className="self-end text-[11px] leading-snug text-zinc-500">
          The interior is laid out at the trim with Charter 10.5 pt; the inside margin follows KDP's table for the page count it comes to.
          Files go to издания/.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PRINT_TARGETS.map(target => {
          const run = runs[target.id] || {};
          const pages = pagesFor(target);
          const spine = pages ? spineFor(target, pages) : undefined;
          const template = templates?.[target.id];
          const confirmed = target.spineFromPages || (!!template?.confirmed && template?.pages === pages);
          const checks = pages
            ? printChecks(target, { pages, trimId: trim.id, spine: spine!, spineConfirmed: confirmed, author, title })
            : printChecks(target, { pages: 0, trimId: trim.id, spine: 0, spineConfirmed: true, author, title }).filter(c => !/pages|margin|Spine|spine/.test(c.text));
          const blocked = !hasText || (!pages && checks.some(c => c.level === 'fail'));
          const g = spine !== undefined ? coverGeometry(target, trim, spine) : null;
          return (
            <article key={target.id} className={`${card} flex flex-col gap-3`}>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">{target.name}</h3>
                <p className="text-[11px] text-zinc-500">{target.where}</p>
              </div>
              <ul className="space-y-0.5 text-xs text-zinc-300">
                <li>Interior PDF · {trim.label}{pages ? ` · ${pages} pages` : ''}</li>
                <li>Cover PDF{g ? ` · ${g.width.toFixed(3)} × ${g.height.toFixed(3)} in` : ''}</li>
              </ul>

              {!target.spineFromPages && (
                <div className="space-y-1.5 rounded border border-zinc-800 bg-zinc-950/50 p-2">
                  <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <span className="whitespace-nowrap">Spine from the template</span>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      className="h-7 w-24 rounded border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200"
                      value={template?.spine ?? (spine !== undefined ? spine : '')}
                      placeholder="in"
                      onChange={e => {
                        const value = Number(e.target.value);
                        if (Number.isFinite(value) && value >= 0) setTemplates({ ...(templates || {}), [target.id]: { spine: value, confirmed: false } });
                      }}
                    />
                    <span>in</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={template?.spine === undefined || !pages}
                      onChange={e => setTemplates({ ...(templates || {}), [target.id]: { spine: template!.spine, confirmed: e.target.checked, pages } })}
                    />
                    Matches the {target.id === 'kdp_hardcover' ? 'KDP' : 'IngramSpark'} template for {pages ? `${pages} pages` : 'this page count'}
                  </label>
                </div>
              )}

              <ul className="space-y-1 text-[11px] text-zinc-400">
                {!hasText && <li className="flex gap-2"><Dot level="fail" /><span>No chapter is written yet</span></li>}
                {checks.map(c => <li key={c.text} className="flex gap-2"><Dot level={c.level} /><span>{c.text}</span></li>)}
                {!pages && hasText && <li className="flex gap-2"><Dot level="warn" /><span>Page count, margins and spine come from the first layout</span></li>}
              </ul>

              {run.coverSkipped && <p className="text-[11px] text-amber-400/90">Interior saved. The cover is built once the spine is confirmed against the template.</p>}
              {run.saved && run.saved.length > 0 && (
                <ul className="space-y-0.5 text-[11px] text-emerald-400/90">
                  {run.saved.map(path => <li key={path} className="truncate" title={path}>✓ {path.split('/').pop()}</li>)}
                </ul>
              )}
              {run.error && <p className="text-[11px] text-red-400">{run.error}</p>}

              <div className="mt-auto space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => void build(target)}
                  disabled={blocked || !!run.busy}
                  className="h-8 w-full rounded bg-zinc-200 text-xs font-semibold text-zinc-950 transition-colors hover:bg-white disabled:opacity-40"
                >
                  {run.busy || (run.saved ? 'Build again' : `Build for ${target.name}`)}
                </button>
                <details className="text-[11px] text-zinc-500">
                  <summary className="cursor-pointer hover:text-zinc-300">How to upload</summary>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4">{target.steps.map(step => <li key={step}>{step}</li>)}</ol>
                </details>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
