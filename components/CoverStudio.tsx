import React, { useEffect, useMemo, useRef, useState } from 'react';
import { saveOrDownload } from '../utils/saveToBookFolder';
import JSZip from 'jszip';
import { generateText } from '../services/llmService';
import { buildCoverPromptRequest, masterPrompt, MASTER_RULES, type CoverBookFacts } from '../utils/cover/coverPrompt';
import { canvasBlob, COVER_FORMATS, renderCover, type CoverFormat } from '../utils/cover/formats';
import { emptyStudio, loadStudio, saveStudio, type CoverStudioState } from '../utils/cover/coverStore';

const IMAGE_MODELS = [
  { id: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image — best quality' },
  { id: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image — faster, cheaper' },
];

const button = 'px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed';
const primary = 'px-3 py-1.5 text-xs rounded bg-zinc-100 text-zinc-900 font-semibold hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed';
const field = 'w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200';
const label = 'block text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1';

interface CoverStudioProps {
  bookKey: string;
  facts: CoverBookFacts;
  author: string;
  onUseAsCover?: (dataUrl: string) => void;
}

/** The fourth stage: one master picture from the book, cut and lettered for each format, ready to download. */
export default function CoverStudio({ bookKey, facts, author, onUseAsCover }: CoverStudioProps) {
  const [state, setState] = useState<CoverStudioState>(() => emptyStudio({ title: facts.title, author, tagline: '' }));
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<'' | 'prompt' | 'image' | 'export'>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [master, setMaster] = useState<ImageBitmap | null>(null);
  const [masterUrl, setMasterUrl] = useState('');
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    loadStudio(bookKey).then(saved => {
      if (cancelled) return;
      if (saved) setState({ ...saved, text: { ...saved.text, author: saved.text.author || author } });
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [bookKey]);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => { void saveStudio(bookKey, state).catch(() => setError('Could not save the cover studio in this browser.')); }, 400);
    return () => clearTimeout(timer);
  }, [state, loaded, bookKey]);

  const selected = state.masters.find(m => m.id === state.selected) || state.masters[0];
  useEffect(() => {
    if (!selected) { setMaster(null); setMasterUrl(''); return; }
    let cancelled = false;
    const url = URL.createObjectURL(selected.blob);
    setMasterUrl(url);
    createImageBitmap(selected.blob).then(bitmap => { if (!cancelled) setMaster(bitmap); });
    return () => { cancelled = true; URL.revokeObjectURL(url); };
  }, [selected?.id]);

  // Formats are drawn at full size a moment after the last change, not on every keystroke.
  useEffect(() => {
    if (!master) return;
    const timer = setTimeout(() => {
      for (const format of COVER_FORMATS) {
        const canvas = canvases.current[format.id];
        if (canvas) renderCover(master, format, state.text, state.style, state.focus, canvas);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [master, state.text, state.style, state.focus]);

  const update = (patch: Partial<CoverStudioState>) => setState(s => ({ ...s, ...patch }));

  async function writePrompt() {
    setBusy('prompt'); setError('');
    try {
      const { prompt, system } = buildCoverPromptRequest(facts);
      const description = (await generateText(prompt, system, undefined, 0.8)).trim();
      update({ description });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(''); }
  }

  async function generateMaster() {
    setBusy('image'); setError(''); setNotice('');
    try {
      const prompt = masterPrompt(state.description);
      const response = await fetch('/api/gemini/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, model: state.model, aspectRatio: '2:3', imageSize: '4K' }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.data) throw new Error(data.error || `Image request failed (${response.status}).`);
      const blob = await (await fetch(`data:${data.mimeType};base64,${data.data}`)).blob();
      const id = `master_${Date.now()}`;
      setState(s => ({ ...s, masters: [{ id, blob, prompt, model: s.model, createdAt: Date.now() }, ...s.masters], selected: id, focus: { x: 0.5, y: 0.5 } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(''); }
  }

  function removeMaster(id: string) {
    setState(s => {
      const masters = s.masters.filter(m => m.id !== id);
      return { ...s, masters, selected: s.selected === id ? masters[0]?.id : s.selected };
    });
  }

  function setFocus(event: React.MouseEvent<HTMLImageElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    update({ focus: { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height } });
  }

  async function download(format: CoverFormat) {
    if (!master) return;
    const blob = await canvasBlob(renderCover(master, format, state.text, state.style, state.focus), format.mime);
    const where = await saveOrDownload({ title: facts.title, kind: 'covers', label: `обложка ${format.label.split(' · ')[0]} ${format.width}x${format.height}`, ext: 'jpg', content: blob }, format.file);
    if (where) setNotice(`Сохранено в ${where}`);
  }

  async function downloadAll() {
    if (!master) return;
    setBusy('export');
    try {
      const zip = new JSZip();
      for (const format of COVER_FORMATS) zip.file(format.file, await canvasBlob(renderCover(master, format, state.text, state.style, state.focus), format.mime));
      zip.file('cover-master.png', selected!.blob);
      zip.file('cover-prompt.txt', selected!.prompt);
      const where = await saveOrDownload({ title: facts.title, kind: 'covers', label: 'все обложки', ext: 'zip', content: await zip.generateAsync({ type: 'blob' }) }, `${slug(facts.title)}-covers.zip`);
      if (where) setNotice(`Сохранено в ${where}`);
    } finally { setBusy(''); }
  }

  function useAsBookCover() {
    if (!master || !onUseAsCover) return;
    const ebook = COVER_FORMATS.find(f => f.id === 'ebook')!;
    onUseAsCover(renderCover(master, ebook, state.text, state.style, state.focus).toDataURL('image/jpeg', 0.9));
    setNotice('The eBook cover is now the book\'s cover for export.');
  }

  const text = state.text;
  const busyLabel = busy === 'prompt' ? 'Writing the prompt…' : busy === 'image' ? 'Drawing the master (up to a minute)…' : busy === 'export' ? 'Packing the files…' : '';

  return (
    <section aria-label="Cover studio" className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 text-left">
      <aside className="rounded border border-zinc-800 bg-zinc-900/40 p-3 space-y-4 self-start">
        <div>
          <span className={label}>1. Prompt for the master</span>
          <button type="button" className={button} disabled={!!busy} onClick={writePrompt}>Write from the book</button>
          <textarea aria-label="Master prompt" className={`${field} mt-2 h-40 resize-y`} value={state.description} placeholder="Describe the picture: subject, setting, light, palette, mood, style." onChange={e => update({ description: e.target.value })} />
          <details className="mt-1 text-[11px] text-zinc-500"><summary className="cursor-pointer">Rules added to every master</summary><p className="mt-1">{MASTER_RULES}</p></details>
        </div>
        <div>
          <span className={label}>2. Master picture · 2:3, 4K</span>
          <select aria-label="Image model" className={field} value={state.model} onChange={e => update({ model: e.target.value })}>
            {IMAGE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <button type="button" className={`${primary} mt-2 w-full`} disabled={!!busy || !state.description.trim()} onClick={generateMaster}>Generate master</button>
          {state.masters.length > 0 && (
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {state.masters.map(m => <MasterThumb key={m.id} blob={m.blob} active={m.id === selected?.id} onSelect={() => update({ selected: m.id, focus: { x: 0.5, y: 0.5 } })} onRemove={() => removeMaster(m.id)} />)}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <span className={label}>3. Lettering</span>
          <input aria-label="Title" className={field} value={text.title} placeholder="Title" onChange={e => update({ text: { ...text, title: e.target.value } })} />
          <input aria-label="Author" className={field} value={text.author} placeholder="Author" onChange={e => update({ text: { ...text, author: e.target.value } })} />
          <input aria-label="Tagline" className={field} value={text.tagline} placeholder="Tagline (optional)" onChange={e => update({ text: { ...text, tagline: e.target.value } })} />
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Font" className={field} value={state.style.font} onChange={e => update({ style: { ...state.style, font: e.target.value as 'serif' | 'sans' } })}>
              <option value="serif">Serif</option><option value="sans">Sans</option>
            </select>
            <input aria-label="Text color" type="color" className="h-8 w-full rounded border border-zinc-700 bg-zinc-950" value={state.style.color} onChange={e => update({ style: { ...state.style, color: e.target.value } })} />
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={state.style.uppercase} onChange={e => update({ style: { ...state.style, uppercase: e.target.checked } })} />Capitals</label>
          <label className="block text-xs text-zinc-400">Shade behind lettering
            <input aria-label="Shade" type="range" min={0} max={0.9} step={0.05} className="w-full" value={state.style.shade} onChange={e => update({ style: { ...state.style, shade: Number(e.target.value) } })} />
          </label>
        </div>
        {busyLabel && <p className="text-xs text-zinc-400">{busyLabel}</p>}
        {error && <p role="alert" className="text-xs text-red-300 whitespace-pre-wrap">{error}</p>}
        {notice && <p className="text-xs text-emerald-300">{notice}</p>}
      </aside>

      <div className="space-y-4 min-w-0">
        {!selected ? (
          <div className="rounded border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
            Write or type a prompt, then generate a master picture. It is cut for every format below, and the lettering is laid over it.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 items-start">
              <div className="shrink-0" style={{ width: 220 }}>
                <span className={label}>Master · click to set the focus</span>
                <div className="relative">
                  {masterUrl && <img src={masterUrl} alt="Master picture" className="block w-full rounded border border-zinc-800 cursor-crosshair" onClick={setFocus} />}
                  <span aria-hidden className="pointer-events-none absolute h-3 w-3 -ml-1.5 -mt-1.5 rounded-full border-2 border-white shadow" style={{ left: `${state.focus.x * 100}%`, top: `${state.focus.y * 100}%` }} />
                </div>
              </div>
              {COVER_FORMATS.map(format => (
                <figure key={format.id} className="shrink-0" style={{ width: format.width >= format.height ? 260 : 200 }}>
                  <figcaption className={label}>{format.label}</figcaption>
                  <div className="relative">
                    <canvas ref={el => { canvases.current[format.id] = el; }} className="w-full h-auto rounded border border-zinc-800" aria-label={`${format.label} preview`} />
                    {format.covered.map((c, i) => (
                      <span key={i} title={c.why} className="absolute border border-dashed border-amber-400/70 bg-amber-400/10" style={{ left: `${c.rect.x * 100}%`, top: `${c.rect.y * 100}%`, width: `${c.rect.w * 100}%`, height: `${c.rect.h * 100}%` }} />
                    ))}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{format.width}×{format.height} JPG</span>
                    <button type="button" className="underline hover:text-zinc-300" onClick={() => download(format)}>Download</button>
                  </div>
                </figure>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primary} disabled={!master || !!busy} onClick={downloadAll}>Download all (.zip)</button>
              {onUseAsCover && <button type="button" className={button} disabled={!master} onClick={useAsBookCover}>Use eBook cover as the book's cover</button>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function MasterThumb({ blob, active, onSelect, onRemove }: { blob: Blob; active: boolean; onSelect: () => void; onRemove: () => void }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className={`relative rounded border ${active ? 'border-zinc-200' : 'border-zinc-800'}`}>
      <img src={url} alt="Master variant" className="w-full cursor-pointer rounded" onClick={onSelect} />
      <button type="button" aria-label="Remove variant" className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] text-zinc-300" onClick={onRemove}>×</button>
    </div>
  );
}


const slug = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'book';
