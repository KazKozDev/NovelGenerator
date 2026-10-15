import React, { useState, useMemo } from 'react';
import { Button } from './common/Button';
import BookStatistics from './BookStatistics';
import ReaderTools from './ReaderTools';

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
      <div className="text-center">
        <h2 className="text-lg font-semibold text-zinc-100 uppercase mb-4">{metadata?.audit?.need_more_evidence?.length ? 'Draft complete · review incomplete' : metadata?.audit?.status === 'COMPLETE_WITH_WARNINGS' ? 'Book reviewed · warnings remain' : 'Draft complete'}</h2>
        
        {/* Book Statistics */}
        <BookStatistics bookContent={bookContent} metadata={metadata} />

      </div>
      {metadata?.audit && <section className="text-sm border border-zinc-800 rounded p-4" aria-label="Final manuscript review">
        <p>{metadata.audit.summary}</p>
        <details className="mt-3">
        <summary className="cursor-pointer text-xs text-zinc-400">Review details</summary>
        {metadata.audit.findings?.length > 0 && <ul className="list-disc pl-5 mt-2">{metadata.audit.findings.map((f: any, i: number) => <li key={i} className="mt-2"><strong>{f.severity}</strong>: {f.description}<p className="text-xs text-zinc-500">{f.evidence_refs?.join(' · ')}</p></li>)}</ul>}
        {metadata.audit.need_more_evidence?.map((failure: string, i: number) => <p key={i} className="text-amber-300 text-xs mt-2">Check unavailable: {failure}</p>)}
        </details>
        {onEdit && <Button onClick={onEdit} variant="secondary" size="sm" className="mt-3">Edit saved book</Button>}
      </section>}
      {metadata?.craft?.landmarks?.length > 0 && <details className="border border-zinc-800 rounded p-4 text-xs">
        <summary className="cursor-pointer">Turning points · actual word positions</summary>
        <div className="overflow-x-auto mt-3"><table className="w-full text-left"><thead><tr><th>Turn</th><th>Position</th><th>Chapter</th><th>Evidence</th></tr></thead><tbody>{metadata.craft.landmarks.map((p: any) => <tr key={p.name}><td className="p-2">{p.name}</td><td className="p-2">{Number(p.percent).toFixed(1)}%</td><td className="p-2">{p.chapter}</td><td className="p-2">{p.quote}</td></tr>)}</tbody></table></div>
      </details>}
      {metadata?.craft?.readerMap && <details className="border border-zinc-800 rounded p-4 text-xs">
        <summary className="cursor-pointer">Reader questions and setups · source map</summary>
        <ul className="mt-3 space-y-2">{metadata.craft.readerMap.loops.map((loop: any) => <li key={loop.id}><strong>{loop.id} · {loop.scale}</strong> — chapter {loop.opened.chapter}: “{loop.opened.quote}” · {loop.progress.length} progress beats · {loop.closed ? `answered in chapter ${loop.closed.chapter}: “${loop.closed.quote}”` : 'still open'}</li>)}</ul>
        <ul className="mt-3 space-y-2">{metadata.craft.readerMap.props.map((prop: any) => <li key={prop.name}><strong>{prop.name}</strong>: {prop.appearances.map((p: any) => `${p.role}, chapter ${p.chapter}: “${p.quote}”`).join(' → ')}</li>)}</ul>
      </details>}
      <ReaderTools text={bookContent} />
      
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
      
      <div className="text-center mt-8">
        <Button onClick={onReset} variant="danger">
          Start New Book
        </Button>
      </div>


    </div>
  );
};

export default BookDisplay;
