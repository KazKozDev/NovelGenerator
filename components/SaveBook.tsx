import React, { useState } from 'react';
import { exportOwnFormat, type OwnFormat } from '../utils/publish/ownFormats';

export default function SaveBook({
  content,
  metadata = {},
  draft = false,
  onExportProject,
  align = 'right',
}: {
  content: string;
  metadata?: Record<string, unknown>;
  draft?: boolean;
  onExportProject?: () => void;
  /** Which edge of the button the menu opens from. */
  align?: 'left' | 'right';
}) {
  const hasText = !!content.trim();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [showAuthorAlert, setShowAuthorAlert] = useState(false);

  const showSaved = (where: string | null) => {
    if (!where) return;
    setSavedNotice(where);
    setTimeout(() => setSavedNotice(null), 5000);
  };

  const download = async (format: OwnFormat) => {
    setError('');
    setShowAuthorAlert(false);

    // Author name is mandatory for saving
    const authorName = typeof metadata?.author === 'string' ? metadata.author.trim() : '';
    if (!authorName) {
      setError('Author name is required to save');
      setShowAuthorAlert(true);
      const authorInput = document.getElementById('book-author-input') as HTMLInputElement | null;
      if (authorInput) {
        authorInput.focus();
        authorInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        authorInput.classList.add('ring-2', 'ring-red-500', 'border-red-500');
        setTimeout(() => {
          authorInput.classList.remove('ring-2', 'ring-red-500', 'border-red-500');
        }, 3000);
      }
      return;
    }

    setBusy(true);
    try {
      showSaved(await exportOwnFormat(format, content, metadata, draft));
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
        aria-label={draft ? 'Export draft' : 'Export book'}
        title="The book saves itself to its folder; this exports it for readers and stores"
        disabled={busy || (!hasText && !onExportProject)}
        className="inline-flex shrink-0 items-center justify-center h-7 text-xs px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors disabled:opacity-50"
      >
        {busy ? 'Exporting…' : draft ? 'Export draft ▾' : 'Export ▾'}
      </button>
      <div className="hidden group-hover:block hover:block absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full pt-1 z-30 min-w-[190px]">
        <div className="bg-zinc-900 border border-zinc-800 rounded shadow-lg py-1 text-xs text-zinc-300 whitespace-nowrap flex flex-col">
          <button type="button" disabled={!hasText} onClick={() => download('epub')} className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-zinc-100 transition-colors disabled:opacity-40 disabled:hover:bg-transparent">EPUB (.epub)</button>
          <button type="button" disabled={!hasText} onClick={() => download('md')} className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-zinc-100 transition-colors disabled:opacity-40 disabled:hover:bg-transparent">Markdown (.md)</button>
          <button type="button" disabled={!hasText} onClick={() => download('txt')} className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-zinc-100 transition-colors disabled:opacity-40 disabled:hover:bg-transparent">Plain Text (.txt)</button>
          <button type="button" disabled={!hasText} onClick={() => download('pdf')} className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-zinc-100 transition-colors disabled:opacity-40 disabled:hover:bg-transparent">PDF (.pdf)</button>
          <button type="button" disabled={!hasText} onClick={() => download('report')} className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-zinc-100 transition-colors disabled:opacity-40 disabled:hover:bg-transparent">Editorial Report (.json)</button>
          {!hasText && <p className="px-3 pb-1 text-[11px] text-zinc-500">Book formats open once a chapter is written.</p>}
          {onExportProject && (
            <>
              <div className="my-1 border-t border-zinc-800/80" />
              <button
                type="button"
                onClick={onExportProject}
                className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
              >
                Project Backup (.project.json)
              </button>
            </>
          )}
        </div>
      </div>
      {savedNotice && (
        <p role="status" className={`absolute top-full mt-1 ${align === 'left' ? 'left-0' : 'right-0'} text-[11px] text-emerald-400 bg-zinc-950 px-2 py-1 rounded border border-emerald-900/60 z-40 whitespace-nowrap shadow-md`}>
          ✓ Saved to {savedNotice}
        </p>
      )}
      {error && <p role="alert" className="absolute top-full mt-1 text-[11px] text-red-400 bg-zinc-950 p-1 rounded border border-red-900 z-40 whitespace-nowrap">{error}</p>}

      {showAuthorAlert && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-zinc-900 border border-red-500 rounded-lg shadow-2xl text-xs max-w-md animate-fade-in"
        >
          <div className="w-8 h-8 rounded-full bg-red-950 border border-red-800 flex items-center justify-center shrink-0 text-red-400 font-bold">
            !
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="font-semibold text-zinc-100">Author name required</p>
            <p className="text-zinc-400 text-[11px]">Please enter the Author name in the Book Cover panel to save your book.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowAuthorAlert(false);
              const authorInput = document.getElementById('book-author-input');
              authorInput?.focus();
            }}
            className="shrink-0 px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[11px] font-medium transition-colors"
          >
            Enter author
          </button>
          <button
            type="button"
            onClick={() => setShowAuthorAlert(false)}
            className="shrink-0 p-1 text-zinc-500 hover:text-zinc-300"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
