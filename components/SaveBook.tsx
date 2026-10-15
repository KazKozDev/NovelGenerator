import React, { useState } from 'react';
import { exportAsEpub, exportAsJSON, exportAsPdf, exportAsText, exportAsMarkdown, extractBookTitle, sanitizeFilename } from '../utils/exportUtils';

export default function SaveBook({ content, metadata = {}, draft = false }: { content: string; metadata?: Record<string, unknown>; draft?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const filename = sanitizeFilename(extractBookTitle(content));

  const download = async (format: string) => {
    setError('');
    setBusy(true);
    try {
      if (format === 'txt') exportAsText(content.replace(/^#{1,6}\s+/gm, ''), `${filename}.txt`);
      else if (format === 'md') exportAsMarkdown(content, `${filename}.md`);
      else if (format === 'report') exportAsJSON(metadata, `${filename}-report.json`);
      else if (format === 'pdf') exportAsPdf(content, metadata);
      else await exportAsEpub(content, metadata, `${filename}.epub`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative group shrink-0">
      <button
        type="button"
        aria-label={draft ? 'Save draft' : 'Save book'}
        disabled={busy || !content.trim()}
        className="inline-flex shrink-0 items-center justify-center h-7 text-xs px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 rounded transition-colors disabled:opacity-50"
      >
        {busy ? 'Downloading…' : draft ? 'Download Draft ▾' : 'Download Book ▾'}
      </button>
      <div className="hidden group-hover:block hover:block absolute right-0 top-full pt-1 z-30 min-w-[140px]">
        <div className="bg-zinc-900 border border-zinc-800 rounded shadow-lg py-1 text-xs text-zinc-300">
          <button type="button" onClick={() => download('epub')} className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">EPUB (.epub)</button>
          <button type="button" onClick={() => download('md')} className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">Markdown (.md)</button>
          <button type="button" onClick={() => download('txt')} className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">Plain Text (.txt)</button>
          <button type="button" onClick={() => download('pdf')} className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">PDF (.pdf)</button>
          <button type="button" onClick={() => download('report')} className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">Editorial Report (.json)</button>
        </div>
      </div>
      {error && <p role="alert" className="absolute top-full mt-1 text-[11px] text-red-400 bg-zinc-950 p-1 rounded border border-red-900 z-40">{error}</p>}
    </div>
  );
}
