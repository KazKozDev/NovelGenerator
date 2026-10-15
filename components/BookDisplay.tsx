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

  return (
    <div className="space-y-6">
      {/* Book Header & Title Section */}
      <div className="text-center space-y-2 mb-6">
        <div className="font-mono text-xs uppercase tracking-wider text-zinc-500">
          {metadata?.audit?.status === 'COMPLETE_WITH_WARNINGS'
            ? 'Book reviewed · warnings remain'
            : metadata?.audit?.need_more_evidence?.length
              ? 'Draft complete · review incomplete'
              : 'Draft complete'}
        </div>
        
        <h1 className="text-2xl sm:text-3xl font-serif font-semibold text-zinc-100 tracking-tight max-w-3xl mx-auto">
          {displayTitle}
        </h1>
        
        <p className="text-xs text-zinc-500 max-w-xl mx-auto">
          {chapterCount} chapters compiled · {findingsCount} editorial notes recorded
        </p>

        {/* Primary Actions */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {onEdit && (
            <Button onClick={onEdit} variant="secondary" size="sm" title="Re-run AI editorial review and structural revisions">
              Run editorial pass
            </Button>
          )}
          <Button onClick={() => handleCopyToClipboard(bookContent, 'quick-copy')} variant="secondary" size="sm">
            {copiedStates['quick-copy'] ? 'Copied' : 'Copy text'}
          </Button>
        </div>
      </div>

      {/* Book Statistics Cards */}
      <BookStatistics bookContent={bookContent} metadata={metadata} />

      {/* Editorial & Structure Review Card */}
      <section className="border border-zinc-800 rounded p-4 space-y-3 bg-zinc-900/30" aria-label="Editorial and craft review">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-3 border-b border-zinc-800">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Editorial review</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Automated craft analysis of narrative beats and pacing.</p>
          </div>
          <div className="font-mono text-xs text-zinc-500 flex items-center gap-3">
            <span>{chapterCount}/{chapterCount} ch</span>
            {findingsCount > 0 && <span>{findingsCount} notes</span>}
            {landmarksCount > 0 && <span>{landmarksCount} landmarks</span>}
          </div>
        </div>

        {/* Collapsible Inspection Details */}
        <div className="space-y-2 text-xs">
          {metadata?.audit && (
            <details className="text-zinc-400">
              <summary className="cursor-pointer hover:text-zinc-200 font-medium py-1">
                Editorial notes ({findingsCount})
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
                Story landmarks & pacing ({landmarksCount})
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
                Reader narrative map
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
      
      <div className="flex flex-wrap border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('book')}
          className={`py-2 px-4 text-xs font-semibold uppercase transition-colors duration-150
            ${activeTab === 'book' ? 'border-b-2 border-zinc-200 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Book Content
        </button>
        <button
          onClick={() => setActiveTab('metadata')}
          className={`py-2 px-4 text-xs font-semibold uppercase transition-colors duration-150
            ${activeTab === 'metadata' ? 'border-b-2 border-zinc-200 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Metadata
        </button>
      </div>

      {activeTab === 'book' && (
        <div className="p-4 border border-zinc-800 rounded">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-zinc-800/80 pb-3">
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setBookViewMode('rendered')}
                className={`px-3 py-1 rounded transition-colors ${bookViewMode === 'rendered' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Rendered Markdown
              </button>
              <button
                type="button"
                onClick={() => setBookViewMode('raw')}
                className={`px-3 py-1 rounded transition-colors ${bookViewMode === 'raw' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Raw Source
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button 
                onClick={() => handleCopyToClipboard(bookContent, 'book')}
                variant="secondary"
                size="sm"
              >
                {copiedStates['book'] ? 'Copied' : 'Copy Markdown'}
              </Button>
            </div>
          </div>
          {bookViewMode === 'rendered' ? (
            <div className="bg-zinc-900 border border-zinc-800 p-3 sm:p-6 rounded max-h-[65vh] overflow-y-auto text-left">
              <MarkdownView 
                content={bookContent} 
                className="font-serif text-prose break-words max-w-[62ch] mx-auto" 
              />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words text-xs  text-zinc-300 bg-zinc-900 border border-zinc-800 p-4 rounded max-h-[65vh] overflow-y-auto text-left">
              {bookContent}
            </pre>
          )}
        </div>
      )}

      {activeTab === 'metadata' && (
        <div className="p-4 border border-zinc-800 rounded">
          <div className="app-toolbar flex flex-wrap gap-2 justify-end mb-3">
            <Button 
              onClick={() => handleCopyToClipboard(metadataJson, 'metadata')}
              variant="secondary"
              size="sm"
            >
              {copiedStates['metadata'] ? 'Copied' : 'Copy JSON'}
            </Button>
             <Button 
              onClick={() => downloadFile(metadataJson, `${(metadata?.title || 'generated_book').replace(/\s+/g, '_')}_metadata.json`, 'application/json;charset=utf-8')}
              variant="secondary"
              size="sm"
            >
              Download .json
            </Button>
          </div>
          <pre className="whitespace-pre-wrap break-words text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 p-4 rounded max-h-[60vh] overflow-y-auto">
            {metadataJson}
          </pre>
        </div>
      )}
      
      <div className="text-center mt-10 pt-6 border-t border-zinc-800/80">
        <p className="text-xs text-zinc-500 mb-3">
          Done with this project? Make sure you have downloaded or exported your work above before starting fresh.
        </p>
        <Button onClick={onReset} variant="danger">
          Start New Book
        </Button>
      </div>


    </div>
  );
};

export default BookDisplay;
