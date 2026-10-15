import React, { useState, useMemo } from 'react';
import { Button } from './common/Button';
import BookStatistics from './BookStatistics';

import { extractBookTitle } from '../utils/exportUtils';
import { MarkdownView } from './common/MarkdownView';

interface BookDisplayProps {
  bookContent: string;
  metadataJson: string;
  onReset: () => void;
  onEdit?: () => void;
}

const BookDisplay: React.FC<BookDisplayProps> = ({ bookContent, metadataJson, onReset, onEdit }) => {
  const [activeTab, setActiveTab] = useState<'book' | 'metadata'>('book');
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [bookViewMode, setBookViewMode] = useState<'rendered' | 'raw'>('rendered');

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

  const handleCopyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedStates(prev => ({ ...prev, [type]: true }));
      setTimeout(() => setCopiedStates(prev => ({ ...prev, [type]: false })), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      alert('Failed to copy text. Please try manually.');
    });
  };
  
  const downloadFile = (content: string, filename: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const readerContent = useMemo(() => {
    return bookContent.replace(/^#\s+[^\r\n]+\r?\n*/m, '').trimStart();
  }, [bookContent]);

  return (
    <div className="space-y-6">
      {/* Title & Compact Statistics */}
      <div className="space-y-2 mb-6 text-left">
        <h1 className="text-2xl sm:text-3xl font-serif font-semibold text-zinc-100 tracking-tight">
          {displayTitle}
        </h1>
        <BookStatistics bookContent={bookContent} metadata={metadata} />
      </div>

      {/* Editorial Review Block */}
      <section className="border border-zinc-800 rounded p-4 space-y-3 bg-zinc-900/30" aria-label="Editorial review">
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-200">Editorial Review</h3>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center h-6 px-2.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded transition-colors"
            >
              <span className="mr-1">↻</span> {findingsCount > 0 ? 'Re-run Review' : 'Run Review'}
            </button>
          )}
        </div>

        <div className="space-y-2 text-xs">
          {metadata?.audit && (
            <details className="text-zinc-400">
              <summary className="cursor-pointer hover:text-zinc-200 font-medium py-1">
                ▸ Editorial notes ({findingsCount})
              </summary>
              <div className="pt-2 pl-2 space-y-2 border-t border-zinc-800/60 mt-1">
                {metadata.audit.findings?.length > 0 ? (
                  <ul className="space-y-2">
                    {metadata.audit.findings.map((f: any, i: number) => (
                      <li key={i} className="text-zinc-400">
                        <span className="font-mono text-[11px] uppercase text-zinc-500 mr-1.5">[{f.severity || 'note'}]</span>
                        <span className="text-zinc-300">{f.description}</span>
                        {f.evidence_refs?.length > 0 && (
                          <p className="text-[11px] text-zinc-500 mt-0.5 italic">{f.evidence_refs.join(' · ')}</p>
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
              <summary className="cursor-pointer hover:text-zinc-200 font-medium py-1">
                ▸ Story landmarks & pacing ({landmarksCount})
              </summary>
              <div className="overflow-x-auto pt-2 border-t border-zinc-800/60 mt-1">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-800">
                      <th className="p-2">Turn</th>
                      <th className="p-2">Position</th>
                      <th className="p-2">Chapter</th>
                      <th className="p-2">Evidence</th>
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
              <summary className="cursor-pointer hover:text-zinc-200 font-medium py-1">
                ▸ Reader narrative map
              </summary>
              <div className="pt-2 border-t border-zinc-800/60 mt-1 space-y-2">
                {metadata.craft.readerMap.loops?.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-zinc-500 uppercase">Plot loops</div>
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
                    <div className="text-[11px] font-medium text-zinc-500 uppercase">Story props</div>
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

      {/* Reader & Metadata Card */}
      <div className="border border-zinc-800 rounded bg-zinc-900/40 overflow-hidden text-left">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 border-b border-zinc-800 bg-zinc-900/80">
          {/* Left tabs: Text | Metadata */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('book')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${activeTab === 'book' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Text
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('metadata')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${activeTab === 'metadata' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Metadata
            </button>
          </div>

          {/* Right controls: Reader | Markdown toggle and Copy button */}
          {activeTab === 'book' ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setBookViewMode('rendered')}
                  className={`px-2.5 py-0.5 rounded transition-colors ${bookViewMode === 'rendered' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Reader
                </button>
                <button
                  type="button"
                  onClick={() => setBookViewMode('raw')}
                  className={`px-2.5 py-0.5 rounded transition-colors ${bookViewMode === 'raw' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Markdown
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleCopyToClipboard(bookViewMode === 'rendered' ? readerContent : bookContent, 'book')}
                className="h-6 text-xs px-2.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors"
              >
                {copiedStates['book'] ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopyToClipboard(metadataJson, 'metadata')}
                className="h-6 text-xs px-2.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors"
              >
                {copiedStates['metadata'] ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => downloadFile(metadataJson, `${(metadata?.title || 'generated_book').replace(/\s+/g, '_')}_metadata.json`, 'application/json;charset=utf-8')}
                className="h-6 text-xs px-2.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors"
              >
                Download .json
              </button>
            </div>
          )}
        </div>

        {/* Clean content body without nested borders */}
        {activeTab === 'book' ? (
          bookViewMode === 'rendered' ? (
            <div className="p-4 sm:p-8 max-h-[70vh] overflow-y-auto">
              <MarkdownView
                content={readerContent}
                className="font-serif text-prose break-words max-w-[62ch] mx-auto text-zinc-200"
              />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words text-xs text-zinc-300 p-4 sm:p-6 max-h-[70vh] overflow-y-auto font-mono">
              {bookContent}
            </pre>
          )
        ) : (
          <pre className="whitespace-pre-wrap break-words text-xs text-zinc-400 p-4 sm:p-6 max-h-[70vh] overflow-y-auto font-mono">
            {metadataJson}
          </pre>
        )}
      </div>

      <div className="text-center mt-8 pt-4 border-t border-zinc-800">
        <Button onClick={onReset} variant="danger">
          Start New Book
        </Button>
      </div>


    </div>
  );
};

export default BookDisplay;
