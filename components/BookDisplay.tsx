import React, { useState, useMemo } from 'react';
import { Button } from './common/Button';
import BookStatistics from './BookStatistics';
import AuthorPromptModal from './AuthorPromptModal';
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
        <h2 className="text-3xl font-semibold text-sky-400 mb-4">Your Book is Ready!</h2>
        
        {/* Book Statistics */}
        <BookStatistics bookContent={bookContent} metadata={metadata} />
      </div>
      
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setActiveTab('book')}
          className={`py-2 px-4 text-sm font-medium transition-colors duration-150
            ${activeTab === 'book' ? 'border-b-2 border-sky-500 text-sky-400' : 'text-slate-400 hover:text-sky-300'}`}
        >
          Book Content
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`py-2 px-4 text-sm font-medium transition-colors duration-150
            ${activeTab === 'timeline' ? 'border-b-2 border-sky-500 text-sky-400' : 'text-slate-400 hover:text-sky-300'}`}
        >
          Timeline
        </button>
        <button
          onClick={() => setActiveTab('metadata')}
          className={`py-2 px-4 text-sm font-medium transition-colors duration-150
            ${activeTab === 'metadata' ? 'border-b-2 border-sky-500 text-sky-400' : 'text-slate-400 hover:text-sky-300'}`}
        >
          Metadata (JSON)
        </button>
      </div>

      {activeTab === 'book' && (
        <div className="p-4 bg-slate-700 rounded-md shadow">
          <div className="flex justify-end mb-2 space-x-2">
            <Button 
              onClick={() => handleCopyToClipboard(bookContent, 'book')}
              variant="secondary"
              size="sm"
            >
              {copiedStates['book'] ? 'Copied!' : 'Copy Markdown'}
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
              Export Epub
            </Button>
            <Button 
              onClick={() => {
                setExportType('pdf');
                setIsAuthorModalOpen(true);
              }}
              variant="secondary"
              size="sm"
            >
              Save PDF
            </Button>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-slate-200 bg-slate-900/50 p-4 rounded-md max-h-[60vh] overflow-y-auto">
            {bookContent}
          </pre>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="p-4 bg-slate-700 rounded-md shadow max-h-[60vh] overflow-y-auto">
          <h3 className="text-2xl font-semibold text-sky-400 mb-6 text-center">Story Timeline</h3>
          {timelineData && chapterSummaries ? (
              <div className="relative pl-8 border-l-2 border-slate-600">
                  {Object.entries(timelineData).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([chapterNum, rawTimelineEntry]) => {
                      const timelineEntry = rawTimelineEntry as any; // Cast to access properties
                      const chapterInfo = chapterSummaries[chapterNum];

                      return (
                          <div key={chapterNum} className="mb-8 relative">
                              <div className="absolute -left-[39px] top-1 h-5 w-5 bg-sky-500 rounded-full border-4 border-slate-700" aria-hidden="true"></div>
                              <p className="text-sm text-slate-400 font-mono">{timelineEntry.endTimeOfChapter}</p>
                              <h4 className="text-xl font-bold text-sky-300 mt-1">
                                  Chapter {chapterNum}: {chapterInfo?.title || 'Untitled'}
                              </h4>
                              <div className="mt-2 text-slate-300 text-sm space-y-1 pl-2 border-l-2 border-slate-600/50 ml-1">
                                  <p><strong className="font-semibold text-slate-200">Time Elapsed:</strong> {timelineEntry.timeElapsed}</p>
                                  {timelineEntry.specificMarkers && timelineEntry.specificMarkers !== 'None' && <p><strong className="font-semibold text-slate-200">Key Markers:</strong> {timelineEntry.specificMarkers}</p>}
                              </div>
                          </div>
                      );
                  })}
              </div>
          ) : (
              <p className="text-center text-slate-400">Timeline data is not available in the metadata.</p>
          )}
        </div>
      )}

      {activeTab === 'metadata' && (
        <div className="p-4 bg-slate-700 rounded-md shadow">
          <div className="flex justify-end mb-2 space-x-2">
            <Button 
              onClick={() => handleCopyToClipboard(metadataJson, 'metadata')}
              variant="secondary"
              size="sm"
            >
              {copiedStates['metadata'] ? 'Copied!' : 'Copy JSON'}
            </Button>
             <Button 
              onClick={() => downloadFile(metadataJson, `${(metadata?.title || 'generated_book').replace(/\s+/g, '_')}_metadata.json`, 'application/json;charset=utf-8')}
              variant="secondary"
              size="sm"
            >
              Download .json
            </Button>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-slate-200 bg-slate-900/50 p-4 rounded-md max-h-[60vh] overflow-y-auto">
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