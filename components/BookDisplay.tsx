import React, { useState, useMemo, useEffect } from 'react';
import BookStatistics from './BookStatistics';

import { extractBookTitle } from '../utils/exportUtils';
import { MarkdownView } from './common/MarkdownView';
import BookCoverUpload from './BookCoverUpload';

interface BookDisplayProps {
  bookContent: string;
  metadataJson: string;
  onReset: () => void;
  onEdit?: () => void;
  isEditorialRunning?: boolean;
  editorialStatus?: string;
  onManualSave?: (newContent: string) => boolean;
  author?: string;
  onAuthorChange?: (author: string) => void;
}

const BookDisplay: React.FC<BookDisplayProps> = ({
  bookContent,
  metadataJson,
  onReset,
  onEdit,
  isEditorialRunning,
  editorialStatus,
  onManualSave,
  author,
  onAuthorChange,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const [currentAuthor, setCurrentAuthor] = useState<string>(() => {
    if (author) return author;
    try {
      const parsed = JSON.parse(metadataJson);
      if (parsed?.author) return parsed.author;
    } catch {}
    try {
      return localStorage.getItem('novel_author_name') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (author !== undefined) {
      setCurrentAuthor(author);
    }
  }, [author]);

  const handleAuthorChange = (newAuthor: string) => {
    setCurrentAuthor(newAuthor);
    onAuthorChange?.(newAuthor);
  };

  const metadata = useMemo(() => {
    try {
      return JSON.parse(metadataJson);
    } catch (e) {
      console.error("Failed to parse metadata JSON:", e);
      return null;
    }
  }, [metadataJson]);

  const displayTitle = useMemo(() => {
    if (metadata?.title && typeof metadata.title === 'string' && metadata.title.trim()) {
      return metadata.title.trim();
    }
    const extracted = extractBookTitle(bookContent);
    return extracted && extracted !== 'Untitled Book' ? extracted : 'Manuscript Draft';
  }, [metadata?.title, bookContent]);

  const findingsCount = metadata?.audit?.findings?.length || 0;
  const landmarksCount = metadata?.craft?.landmarks?.length || 0;
  const unavailableCount = metadata?.audit?.need_more_evidence?.length || 0;
  const chapterMatches = bookContent.match(/^##\s+Chapter\s+\d+/gm);
  const chapterCount = chapterMatches ? chapterMatches.length : (metadata?.chapters_count || 1);

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      alert('Failed to copy text. Please try manually.');
    });
  };

  const manuscriptWithTitle = useMemo(() => {
    if (/^#\s+[^\r\n]+/m.test(bookContent)) {
      return bookContent;
    }
    return `# ${displayTitle}\n\n${bookContent}`;
  }, [bookContent, displayTitle]);

  const [isEditing, setIsEditing] = useState(false);
  const [editableContent, setEditableContent] = useState(manuscriptWithTitle);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setEditableContent(manuscriptWithTitle);
    }
  }, [manuscriptWithTitle, isEditing]);

  const handleSave = () => {
    const success = onManualSave?.(editableContent);
    if (success !== false) {
      setIsEditing(false);
      setSaveError(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setSaveError('Could not save manuscript chapters.');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditableContent(manuscriptWithTitle);
    setSaveError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div className="space-y-4">
      <BookStatistics bookContent={bookContent} metadata={metadata} />

      {/* Three-zone layout: Column 1 (40%), Column 2 (40%), Column 3 (1fr / remaining width) */}
      <div className="grid grid-cols-1 lg:grid-cols-[40%_40%_1fr] gap-6 items-start">
        {/* Column 1 (~35%): Editorial Review */}
        <section className="border border-zinc-800 rounded bg-zinc-900/40 overflow-hidden text-left flex flex-col" aria-label="Editorial review">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80">
            <h2 className="text-sm font-medium text-zinc-200">Editorial Review</h2>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                disabled={isEditorialRunning}
                className="inline-flex items-center gap-1.5 h-6 px-2.5 text-xs font-medium whitespace-nowrap shrink-0 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 disabled:hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors"
              >
                <span className={isEditorialRunning ? 'inline-block animate-spin' : ''}>↻</span>
                <span>
                  {isEditorialRunning
                    ? (editorialStatus || 'Applying Review…')
                    : findingsCount > 0 ? 'Apply Review' : 'Run Review'}
                </span>
              </button>
            )}
          </div>

          <div className="p-4 space-y-3 text-xs max-h-[78vh] overflow-y-auto">
            {metadata?.audit && (
              <details className="text-zinc-400" open>
                <summary className="cursor-pointer hover:text-zinc-200 font-medium py-1 select-none">
                  Editorial notes ({findingsCount})
                </summary>
                <div className="pt-2 pl-2 space-y-2 border-t border-zinc-800/60 mt-1">
                  {metadata.audit.findings?.length > 0 ? (
                    <ul className="space-y-2">
                      {metadata.audit.findings.map((f: any, i: number) => (
                        <li key={i} className="text-zinc-400">
                          <span className="font-mono text-[11px] uppercase text-zinc-500 mr-2">[{f.severity || 'note'}]</span>
                          <span className="text-zinc-300">{f.description}</span>
                          {f.evidence_refs?.length > 0 && (
                            <p className="text-[11px] text-zinc-500 mt-1 italic pl-2 border-l border-zinc-800">{f.evidence_refs.join(' · ')}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-zinc-500">No stylistic notes recorded.</p>
                  )}
                  {unavailableCount > 0 && (
                    <p className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-800/40">
                      {unavailableCount} deep checks omitted for current chapter count.
                    </p>
                  )}
                </div>
              </details>
            )}

            {metadata?.craft?.landmarks?.length > 0 && (
              <details className="text-zinc-400">
                <summary className="cursor-pointer hover:text-zinc-200 font-medium py-1 select-none">
                  Story landmarks & pacing ({landmarksCount})
                </summary>
                <div className="overflow-x-auto pt-2 border-t border-zinc-800/60 mt-1">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-zinc-500 border-b border-zinc-800">
                        <th className="p-2 text-[11px] font-medium uppercase tracking-wider">Turn</th>
                        <th className="p-2 text-[11px] font-medium uppercase tracking-wider">Position</th>
                        <th className="p-2 text-[11px] font-medium uppercase tracking-wider">Chapter</th>
                        <th className="p-2 text-[11px] font-medium uppercase tracking-wider">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metadata.craft.landmarks.map((p: any) => (
                        <tr key={p.name} className="border-b border-zinc-800/40">
                          <td className="p-2 font-medium text-zinc-300">{p.name}</td>
                          <td className="p-2 font-mono text-zinc-500">{Number(p.percent).toFixed(1)}%</td>
                          <td className="p-2 text-zinc-400">{p.chapter}</td>
                          <td className="p-2 text-zinc-400 italic">“{p.quote}”</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {metadata?.craft?.readerMap && (
              <details className="text-zinc-400">
                <summary className="cursor-pointer hover:text-zinc-200 font-medium py-1 select-none">
                  Reader narrative map
                </summary>
                <div className="pt-2 border-t border-zinc-800/60 mt-1 space-y-2">
                  {metadata.craft.readerMap.loops?.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Plot loops</div>
                      <ul className="space-y-1 pl-2">
                        {metadata.craft.readerMap.loops.map((loop: any) => (
                          <li key={loop.id} className="text-zinc-400">
                            <span className="text-zinc-300 font-medium">{loop.id} · {loop.scale}</span> — ch {loop.opened.chapter}: “{loop.opened.quote}” · {loop.closed ? `closed in ch ${loop.closed.chapter}` : 'open'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {metadata.craft.readerMap.props?.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-zinc-800/40">
                      <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Story props</div>
                      <ul className="space-y-1 pl-2">
                        {metadata.craft.readerMap.props.map((prop: any) => (
                          <li key={prop.name} className="text-zinc-400">
                            <span className="text-zinc-300 font-medium">{prop.name}</span>: {prop.appearances.map((p: any) => `${p.role}, ch ${p.chapter}`).join(' → ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        </section>

        {/* Column 2 (~35%): Manuscript Reader Card */}
        <div className="border border-zinc-800 rounded bg-zinc-900/40 overflow-hidden text-left flex flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80">
            <h2 className="text-sm font-medium text-zinc-200">Manuscript</h2>

            <div className="flex items-center gap-2">
              {saveSuccess && !isEditing && (
                <span className="text-xs text-emerald-400 font-medium">Saved ✓</span>
              )}
              {onManualSave && !isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditableContent(manuscriptWithTitle);
                    setIsEditing(true);
                    setSaveError(null);
                  }}
                  className="inline-flex items-center h-6 px-2.5 text-xs font-medium whitespace-nowrap shrink-0 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors"
                >
                  Edit text
                </button>
              )}
              {isEditing && (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="inline-flex items-center h-6 px-2.5 text-xs font-semibold whitespace-nowrap shrink-0 bg-zinc-200 hover:bg-zinc-100 text-zinc-900 rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="inline-flex items-center h-6 px-2.5 text-xs font-medium whitespace-nowrap shrink-0 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => handleCopyToClipboard(manuscriptWithTitle)}
                className="inline-flex items-center h-6 px-2.5 text-xs font-medium whitespace-nowrap shrink-0 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors"
              >
                {isCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="p-6 sm:p-8 max-h-[78vh] overflow-y-auto">
            {saveError && (
              <p className="text-xs text-red-400 mb-3">{saveError}</p>
            )}
            {isEditing ? (
              <div>
                <textarea
                  value={editableContent}
                  onChange={(e) => setEditableContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="Edit manuscript"
                  className="w-full min-h-[50vh] p-4 bg-zinc-950 border border-zinc-800 rounded font-serif text-prose text-zinc-200 focus:outline-none focus:border-zinc-700 resize-y leading-relaxed"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-zinc-500">
                    Tip: press <kbd className="px-1.5 py-0.5 bg-zinc-900 rounded border border-zinc-800 text-zinc-400 text-[11px]">Cmd+S</kbd> or <kbd className="px-1.5 py-0.5 bg-zinc-900 rounded border border-zinc-800 text-zinc-400 text-[11px]">Ctrl+S</kbd> to save
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      className="inline-flex items-center h-7 px-3 text-xs font-semibold whitespace-nowrap bg-zinc-200 hover:bg-zinc-100 text-zinc-900 rounded transition-colors"
                    >
                      Save changes
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="inline-flex items-center h-7 px-3 text-xs font-medium whitespace-nowrap bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <MarkdownView
                content={manuscriptWithTitle}
                className="font-serif text-prose break-words max-w-[62ch] mx-auto text-zinc-200"
              />
            )}
          </div>
        </div>

        {/* Column 3 (~20%): Book Cover */}
        <div className="flex flex-col">
          <BookCoverUpload
            title={displayTitle}
            genre={metadata?.genre}
            author={currentAuthor}
            onAuthorChange={handleAuthorChange}
          />
        </div>
      </div>
    </div>
  );
};

export default BookDisplay;
