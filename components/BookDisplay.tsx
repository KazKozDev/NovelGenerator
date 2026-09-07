import React, { useState, useMemo } from 'react';
import { Button } from './common/Button';
import BookStatistics from './BookStatistics';
import AuthorPromptModal from './AuthorPromptModal';
import { MarkdownView } from './common/MarkdownView';
import { exportAsEpub, exportAsPdf, extractBookTitle, sanitizeFilename } from '../utils/exportUtils';

interface BookDisplayProps {
  bookContent: string;
  metadataJson: string;
  onReset: () => void;
}

const BookDisplay: React.FC<BookDisplayProps> = ({ bookContent, metadataJson, onReset }) => {
  const [activeTab, setActiveTab] = useState<'book' | 'metadata' | 'timeline'>('book');
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [isAuthorModalOpen, setIsAuthorModalOpen] = useState(false);
  const [exportType, setExportType] = useState<'epub' | 'pdf'>('epub');
  const [bookViewMode, setBookViewMode] = useState<'rendered' | 'raw'>('rendered');

  const metadata = useMemo(() => {
    try {
      return JSON.parse(metadataJson);
    } catch (e) {
      console.error("Failed to parse metadata JSON:", e);
      return null;
    }
  }, [metadataJson]);

  const timelineData = metadata?.timeline_data_by_chapter;
  const chapterSummaries = metadata?.chapter_summaries;


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
        <h2 className="text-xl font-semibold text-zinc-100 uppercase tracking-wide mb-4">Generation Complete</h2>
        
        {/* Book Statistics */}
        <BookStatistics bookContent={bookContent} metadata={metadata} />
      </div>
      
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('book')}
          className={`py-2 px-4 text-xs font-semibold uppercase tracking-wider transition-colors duration-150
            ${activeTab === 'book' ? 'border-b-2 border-zinc-200 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Book Content
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`py-2 px-4 text-xs font-semibold uppercase tracking-wider transition-colors duration-150
            ${activeTab === 'timeline' ? 'border-b-2 border-zinc-200 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Timeline
        </button>
        <button
          onClick={() => setActiveTab('metadata')}
          className={`py-2 px-4 text-xs font-semibold uppercase tracking-wider transition-colors duration-150
            ${activeTab === 'metadata' ? 'border-b-2 border-zinc-200 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Metadata
        </button>
      </div>

      {activeTab === 'book' && (
        <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-zinc-800/80 pb-3">
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded p-0.5 text-xs font-mono">
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
              <Button 
                onClick={() => downloadFile(bookContent, `${(metadata?.title || 'generated_book').replace(/\s+/g, '_')}.md`, 'text/markdown;charset=utf-8')}
                variant="secondary"
                size="sm"
              >
                Download .md
              </Button>
              <Button 
                onClick={() => {
                  setExportType('epub');
                  setIsAuthorModalOpen(true);
                }}
                variant="secondary"
                size="sm"
              >
                Export EPUB
              </Button>
              <Button 
                onClick={() => {
                  setExportType('pdf');
                  setIsAuthorModalOpen(true);
                }}
                variant="secondary"
                size="sm"
              >
                Export PDF
              </Button>
            </div>
          </div>
          {bookViewMode === 'rendered' ? (
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-lg max-h-[65vh] overflow-y-auto text-left">
              <MarkdownView 
                content={bookContent} 
                className="font-serif leading-relaxed text-sm md:text-base" 
              />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap text-xs md:text-sm text-zinc-300 bg-zinc-900 border border-zinc-800 p-4 rounded-lg max-h-[65vh] overflow-y-auto font-mono leading-relaxed text-left">
              {bookContent}
            </pre>
          )}
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl shadow-sm max-h-[60vh] overflow-y-auto">
          <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide mb-6 text-center">Narrative Timeline</h3>
          {timelineData && chapterSummaries ? (
              <div className="relative pl-8 border-l-2 border-zinc-700">
                  {Object.entries(timelineData).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([chapterNum, rawTimelineEntry]) => {
                      const timelineEntry = rawTimelineEntry as any;
                      const chapterInfo = chapterSummaries[chapterNum];

                      return (
                          <div key={chapterNum} className="mb-8 relative">
                              <div className="absolute -left-[39px] top-1 h-4 w-4 bg-zinc-400 rounded-full border-4 border-zinc-950" aria-hidden="true"></div>
                              <p className="text-xs text-zinc-500 font-mono">{timelineEntry.endTimeOfChapter}</p>
                              <h4 className="text-sm font-semibold text-zinc-200 mt-1 uppercase tracking-wide">
                                  Chapter {chapterNum}: {chapterInfo?.title || 'Untitled'}
                              </h4>
                              <div className="mt-2 text-zinc-400 text-xs space-y-1 pl-2 border-l-2 border-zinc-800 ml-1">
                                  <p><strong className="font-medium text-zinc-300">Time Elapsed:</strong> {timelineEntry.timeElapsed}</p>
                                  {timelineEntry.specificMarkers && timelineEntry.specificMarkers !== 'None' && <p><strong className="font-medium text-zinc-300">Key Markers:</strong> {timelineEntry.specificMarkers}</p>}
                              </div>
                          </div>
                      );
                  })}
              </div>
          ) : (
              <p className="text-center text-zinc-500 text-xs">Timeline metadata is not available.</p>
          )}
        </div>
      )}

      {activeTab === 'metadata' && (
        <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl shadow-sm">
          <div className="flex justify-end mb-3 space-x-2">
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
          <pre className="whitespace-pre-wrap text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 p-4 rounded-lg max-h-[60vh] overflow-y-auto font-mono">
            {metadataJson}
          </pre>
        </div>
      )}
      
      <div className="text-center mt-8">
        <Button onClick={onReset} variant="danger">
          Start New Book
        </Button>
      </div>

      {/* Author Prompt Modal */}
      <AuthorPromptModal
        isOpen={isAuthorModalOpen}
        defaultAuthor={metadata?.author || ''}
        onConfirm={async (authorName) => {
          setIsAuthorModalOpen(false);
          const updatedMetadata = { ...metadata, author: authorName };
          
          if (exportType === 'epub') {
            const title = extractBookTitle(bookContent);
            const filename = sanitizeFilename(title);
            await exportAsEpub(bookContent, updatedMetadata, `${filename}.epub`);
          } else {
            exportAsPdf(bookContent, updatedMetadata);
          }
        }}
        onCancel={() => setIsAuthorModalOpen(false)}
      />
    </div>
  );
};

export default BookDisplay;