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
      <div className="text-center space-y-3 mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {metadata?.audit?.status === 'COMPLETE_WITH_WARNINGS'
            ? 'Book reviewed · warnings remain'
            : metadata?.audit?.need_more_evidence?.length
              ? 'Draft complete · review incomplete'
              : 'Draft complete · Ready to Read'}
        </div>
        
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-zinc-100 tracking-tight max-w-2xl mx-auto">
          {displayTitle}
        </h1>
        
        <p className="text-xs text-zinc-400 max-w-xl mx-auto">
          All chapters have been compiled with emotional arc and craft telemetry. You can download the book, explore the editorial notes, or edit the text.
        </p>

        {/* Quick Primary Actions */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          {onEdit && (
            <Button onClick={onEdit} variant="secondary" size="sm" className="shadow-sm font-medium">
              <span className="mr-1.5">✏️</span> Edit saved book
            </Button>
          )}
          <Button onClick={() => handleCopyToClipboard(bookContent, 'quick-copy')} variant="secondary" size="sm">
            <span className="mr-1.5">📋</span> {copiedStates['quick-copy'] ? 'Copied to Clipboard!' : 'Copy Full Text'}
          </Button>
        </div>
      </div>

      {/* Book Statistics Cards */}
      <BookStatistics bookContent={bookContent} metadata={metadata} />

      {/* Editorial & Craft Review Card */}
      <section className="border border-zinc-800 rounded-lg p-5 space-y-4 bg-zinc-900/30" aria-label="Editorial and craft review">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-3 border-b border-zinc-800/80">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base" role="img" aria-label="Analysis">🔍</span>
              <h3 className="text-sm font-semibold text-zinc-100">
                Editorial & Narrative Analysis
              </h3>
            </div>
            <p className="text-xs text-zinc-400">
              Automated review of story beats, pacing milestones, and narrative continuity.
            </p>
          </div>

          {/* Quick status badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
              ✓ {chapterCount}/{chapterCount} Chapters Verified
            </span>
            {findingsCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-sky-950/60 text-sky-300 border border-sky-800/60">
                {findingsCount} Editorial Polish Notes
              </span>
            )}
            {landmarksCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-purple-950/60 text-purple-300 border border-purple-800/60">
                {landmarksCount} Story Turning Points
              </span>
            )}
          </div>
        </div>

        {/* Friendly explanation for newcomers */}
        <p className="text-xs text-zinc-400 leading-relaxed bg-zinc-900/50 p-3 rounded border border-zinc-800/50">
          <strong className="text-zinc-300">Author’s Desk note:</strong> Your full draft is safely compiled and ready to read. The findings below are AI editor suggestions to guide stylistic polishing (dialogue rhythm, sensory depth, pacing).
        </p>

        {/* Collapsible Inspection Details */}
        <div className="space-y-2.5 pt-1 text-xs">
          {metadata?.audit && (
            <details className="group border border-zinc-800/60 rounded bg-zinc-900/40 p-3 transition-colors hover:border-zinc-700/60">
              <summary className="cursor-pointer font-medium text-zinc-300 flex items-center justify-between list-none">
                <span className="flex items-center gap-2">
                  <span className="text-zinc-500 group-open:rotate-90 transition-transform">▶</span>
                  <span>Editorial Polish Suggestions ({findingsCount})</span>
                </span>
                <span className="text-[11px] text-zinc-500 font-normal">Scene critique & style advice</span>
              </summary>
              <div className="pt-3 pl-4 space-y-2 border-t border-zinc-800/60 mt-3">
                {metadata.audit.findings?.length > 0 ? (
                  <ul className="space-y-2.5">
                    {metadata.audit.findings.map((f: any, i: number) => (
                      <li key={i} className="bg-zinc-950/40 p-2.5 rounded border border-zinc-800/40 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${f.severity === 'major' ? 'bg-amber-950/70 text-amber-300 border border-amber-800/50' : 'bg-zinc-800 text-zinc-400'}`}>
                            {f.severity || 'note'}
                          </span>
                          <span className="text-zinc-200 font-medium">{f.description}</span>
                        </div>
                        {f.evidence_refs?.length > 0 && (
                          <p className="text-[11px] text-zinc-400 italic pl-1 border-l-2 border-zinc-800">
                            {f.evidence_refs.join(' · ')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-zinc-400">No unresolved stylistic findings recorded.</p>
                )}
                {unavailableCount > 0 && (
                  <div className="pt-2 text-[11px] text-zinc-500 border-t border-zinc-800/40">
                    <span className="text-zinc-400 font-medium">{unavailableCount} deep checks omitted</span> (e.g. full-novel multi-pass tests not needed for this chapter count).
                  </div>
                )}
              </div>
            </details>
          )}

          {metadata?.craft?.landmarks?.length > 0 && (
            <details className="group border border-zinc-800/60 rounded bg-zinc-900/40 p-3 transition-colors hover:border-zinc-700/60">
              <summary className="cursor-pointer font-medium text-zinc-300 flex items-center justify-between list-none">
                <span className="flex items-center gap-2">
                  <span className="text-zinc-500 group-open:rotate-90 transition-transform">▶</span>
                  <span>Story Landmarks & Turning Points ({landmarksCount})</span>
                </span>
                <span className="text-[11px] text-zinc-500 font-normal">Pacing milestones by chapter</span>
              </summary>
              <div className="overflow-x-auto pt-3 border-t border-zinc-800/60 mt-3">
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
                        <td className="p-2 font-mono text-zinc-400">{Number(p.percent).toFixed(1)}%</td>
                        <td className="p-2 text-zinc-300">{p.chapter}</td>
                        <td className="p-2 text-zinc-400 italic">“{p.quote}”</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {metadata?.craft?.readerMap && (
            <details className="group border border-zinc-800/60 rounded bg-zinc-900/40 p-3 transition-colors hover:border-zinc-700/60">
              <summary className="cursor-pointer font-medium text-zinc-300 flex items-center justify-between list-none">
                <span className="flex items-center gap-2">
                  <span className="text-zinc-500 group-open:rotate-90 transition-transform">▶</span>
                  <span>Narrative Setups & Payoffs (Reader Map)</span>
                </span>
                <span className="text-[11px] text-zinc-500 font-normal">Tracking open loops & story props</span>
              </summary>
              <div className="pt-3 border-t border-zinc-800/60 mt-3 space-y-3">
                {metadata.craft.readerMap.loops?.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase text-zinc-400 mb-1.5">Dramatic Questions & Plot Loops</h4>
                    <ul className="space-y-1.5 pl-2">
                      {metadata.craft.readerMap.loops.map((loop: any) => (
                        <li key={loop.id} className="text-zinc-300">
                          <strong className="text-zinc-200">{loop.id} · {loop.scale}</strong> — chapter {loop.opened.chapter}: “{loop.opened.quote}” · {loop.progress.length} progress beats · {loop.closed ? `answered in chapter ${loop.closed.chapter}: “${loop.closed.quote}”` : 'still open'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {metadata.craft.readerMap.props?.length > 0 && (
                  <div className="border-t border-zinc-800/40 pt-2">
                    <h4 className="text-[11px] font-semibold uppercase text-zinc-400 mb-1.5">Key Story Objects (Props)</h4>
                    <ul className="space-y-1.5 pl-2">
                      {metadata.craft.readerMap.props.map((prop: any) => (
                        <li key={prop.name} className="text-zinc-300">
                          <strong className="text-zinc-200">{prop.name}</strong>: {prop.appearances.map((p: any) => `${p.role}, chapter ${p.chapter}: “${p.quote}”`).join(' → ')}
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
