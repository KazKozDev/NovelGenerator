
import React, { useEffect, useRef, useState } from 'react';
import { MarkdownView } from './common/MarkdownView';

interface StreamingContentViewProps {
  title: string;
  content: string;
  fullHeight?: boolean;
}

const StreamingContentView: React.FC<StreamingContentViewProps> = ({ title, content, fullHeight = false }) => {
  const contentEndRef = useRef<null | HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'markdown' | 'raw'>('markdown');

  useEffect(() => {
    contentEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [content]);

  const wordCount = content ? content.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className={`p-3 md:p-4 rounded border border-zinc-800 flex flex-col ${fullHeight ? 'h-full flex-1 min-h-0 overflow-hidden' : 'mt-6'}`}>
      <div className="shrink-0 flex items-center justify-between border-b border-zinc-800 pb-2.5 mb-2.5">
        <h3 className="font-semibold text-zinc-300 text-xs  flex items-center gap-2 uppercase">
          <span className="w-2 h-2 rounded-full bg-zinc-400" />
          <span>{title}</span>
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-zinc-800 rounded p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('markdown')}
              className={`px-2 py-0.5 rounded transition-colors ${viewMode === 'markdown' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Rendered
            </button>
            <button
              type="button"
              onClick={() => setViewMode('raw')}
              className={`px-2 py-0.5 rounded transition-colors ${viewMode === 'raw' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Raw
            </button>
          </div>
          <span className="text-xs text-zinc-500">
            {wordCount.toLocaleString()} words
          </span>
        </div>
      </div>
      <div className={`overflow-y-auto text-left pr-2 flex-1 min-h-0 ${fullHeight ? '' : 'max-h-[600px]'}`}>
        {!content ? (
          <div className="pt-8 font-serif text-prose max-w-[62ch] mx-auto text-zinc-500">
            <p>Specialist passages are being written. The finished scene appears here on synthesis.</p>
          </div>
        ) : viewMode === 'markdown' ? (
          <MarkdownView 
            content={content} 
            isStreaming={true} 
            className="font-serif text-prose max-w-[62ch] mx-auto" 
          />
        ) : (
          <div className="whitespace-pre-wrap font-mono text-xs text-zinc-300 selection:bg-zinc-700/60">
            {content}
            <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse ml-1 align-middle" />
          </div>
        )}
        <div ref={contentEndRef} />
      </div>
    </div>
  );
};

export default StreamingContentView;
