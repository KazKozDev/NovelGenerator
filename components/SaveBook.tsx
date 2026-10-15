import React, { useState } from 'react';
import { exportAsEpub, exportAsJSON, exportAsPdf, exportAsText, exportAsMarkdown, extractBookTitle, sanitizeFilename } from '../utils/exportUtils';

export default function SaveBook({ content, metadata = {}, draft = false }: { content: string; metadata?: Record<string, unknown>; draft?: boolean }) {
  const [format, setFormat] = useState('epub');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const filename = sanitizeFilename(extractBookTitle(content));
  const save = async () => {
    setError('');
    setBusy(true);
    try {
      if (format === 'txt') exportAsText(content.replace(/^#{1,6}\s+/gm, ''), `${filename}.txt`);
      else if (format === 'md') exportAsMarkdown(content, `${filename}.md`);
      // The report the book wrote about itself: the whole-book review's findings, the promises it
      // never paid, the places the plan did not hold, the chapters that gave up on a defect. All of
      // it was being produced and kept where only a developer would find it.
      else if (format === 'report') exportAsJSON(metadata, `${filename}-report.json`);
      else if (format === 'pdf') exportAsPdf(content, metadata);
      else await exportAsEpub(content, metadata, `${filename}.epub`);
    } catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  };
  return <div className="shrink-0 max-w-full">
    <div className="app-toolbar flex flex-wrap items-center gap-2">
      <select aria-label="Save format" value={format} onChange={event => setFormat(event.target.value)} disabled={busy} className="bg-zinc-900 border border-zinc-700 rounded h-7 px-3 py-1 text-xs text-zinc-200">
        <option value="epub">EPUB</option><option value="pdf">PDF</option><option value="txt">TXT</option><option value="md">Markdown</option><option value="report">Report (JSON)</option>
      </select>
      <button type="button" onClick={save} disabled={busy || !content.trim()} className="h-7 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-100 disabled:opacity-50">{busy ? 'Saving…' : draft ? 'Save draft' : 'Save book'}</button>
      {draft && <span className="sr-only">Current chapters · not fully reviewed</span>}
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
  </div>;
}
