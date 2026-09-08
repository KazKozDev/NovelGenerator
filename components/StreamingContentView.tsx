
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
    <div className={`p-3 md:p-4 bg-zinc-900/80 rounded-sm border border-zinc-800 shadow-sm flex flex-col ${fullHeight ? 'h-full flex-1 min-h-0 overflow-hidden' : 'mt-6'}`}>
      <div className="shrink-0 flex items-center justify-between border-b border-zinc-800 pb-2.5 mb-2.5">
        <h3 className="font-semibold text-zinc-200 text-xs md:text-sm flex items-center gap-2 tracking-wide font-sans uppercase">
          <span className="w-2 h-2 rounded-full bg-zinc-400" />
          <span>{title}</span>
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-sm p-0.5 text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setViewMode('markdown')}
              className={`px-2 py-0.5 rounded-sm transition-colors ${viewMode === 'markdown' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Rendered
            </button>
            <button
              type="button"
              onClick={() => setViewMode('raw')}
              className={`px-2 py-0.5 rounded-sm transition-colors ${viewMode === 'raw' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Raw
            </button>
          </div>
          <span className="text-[11px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-sm font-mono border border-zinc-700">
            {wordCount.toLocaleString()} words
          </span>
        </div>
      </div>
      <div className={`overflow-y-auto text-left pr-2 flex-1 min-h-0 ${fullHeight ? '' : 'max-h-[600px]'}`}>
        {!content ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[350px] text-center p-6 text-zinc-500">
            <div className="w-10 h-10 rounded-sm bg-zinc-800/80 border border-zinc-700 text-zinc-400 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <p className="text-xs md:text-sm font-medium text-zinc-300 mb-1">
              Coordinated Agents Authoring Manuscript
            </p>
            <p className="text-[11px] text-zinc-500 max-w-sm leading-relaxed mb-4">
              Specialist agents (Structure, Character, Scene) are preparing chapter slots. Full unified prose will stream automatically upon synthesis.
            </p>
            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 bg-zinc-950 border border-zinc-800 px-3 py-1 rounded-sm">
              <span className="w-2 h-2 rounded-full bg-zinc-400 animate-ping" />
              <span>Pipeline active & synchronized</span>
            </div>
          </div>
        ) : viewMode === 'markdown' ? (
          <MarkdownView 
            content={content} 
            isStreaming={true} 
            className="text-sm md:text-base font-serif leading-relaxed max-w-[72ch] mx-auto" 
          />
        ) : (
          <div className="whitespace-pre-wrap text-xs md:text-sm font-mono text-zinc-300 leading-relaxed selection:bg-zinc-700/60">
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
