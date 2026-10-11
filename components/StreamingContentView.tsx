
import React, { useEffect, useRef, useState } from 'react';
import { MarkdownView } from './common/MarkdownView';
import { textRevision } from '../utils/textRevision';
import MarkdownChangesView from './MarkdownChangesView';

interface StreamingContentViewProps {
  title: string;
  content: string;
  previousContent?: string;
  fullHeight?: boolean;
}

const StreamingContentView: React.FC<StreamingContentViewProps> = ({ title, content, previousContent, fullHeight = false }) => {
  const contentEndRef = useRef<null | HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'changes' | 'markdown' | 'raw'>('changes');
  const previous=useRef({title,content});
  const [revision,setRevision]=useState<ReturnType<typeof textRevision>|null>(null);
  useEffect(()=>{
    const old=previous.current;
    if(old.title!==title||!old.content.trim())setRevision(null);
    else if(old.content!==content)setRevision(textRevision(old.content,content));
    previous.current={title,content};
  },[title,content]);

  const shownRevision = previousContent !== undefined && previousContent !== content ? textRevision(previousContent, content) : revision;
  const beforeRevision = shownRevision ? shownRevision.prefix + shownRevision.removed + shownRevision.suffix : undefined;
  useEffect(() => {
    const scroller = contentEndRef.current;
    if (!scroller) return;
    if (viewMode === 'changes') {
      const additions = scroller.querySelectorAll<HTMLElement>('.revision-added');
      const removals = scroller.querySelectorAll<HTMLElement>('.revision-removed');
      const target = additions[additions.length-1] || removals[removals.length-1];
      if (target) scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientHeight * .25;
    } else scroller.scrollTop = scroller.scrollHeight;
  }, [content, previousContent, viewMode, beforeRevision]);

  return (
    <div className={`p-3 md:p-4 rounded border border-zinc-800 flex flex-col ${fullHeight ? 'h-full flex-1 min-h-0 overflow-hidden' : 'mt-6'}`}>
      <div className="shrink-0 flex flex-wrap gap-2 items-center justify-between border-b border-zinc-800 pb-2.5 mb-2.5">
        <h3 className="font-semibold text-zinc-300 text-xs  flex items-center gap-2 uppercase">
          <span className="w-2 h-2 rounded-full bg-zinc-400" />
          <span>{title}</span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center border border-zinc-800 rounded p-0.5 text-xs">
            <button type="button" onClick={()=>setViewMode('changes')} aria-pressed={viewMode==='changes'} className={`px-2 py-0.5 rounded ${viewMode==='changes'?'bg-zinc-800 text-zinc-100':'text-zinc-500'}`}>Changes</button>
            <button
              type="button"
              onClick={() => setViewMode('markdown')}
              className={`px-2 py-0.5 rounded transition-colors ${viewMode === 'markdown' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Clean text
            </button>
            <button
              type="button"
              onClick={() => setViewMode('raw')}
              className={`px-2 py-0.5 rounded transition-colors ${viewMode === 'raw' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Raw
            </button>
          </div>
        </div>
      </div>
      <div ref={contentEndRef} className={`overflow-y-auto text-left pr-2 flex-1 min-h-0 ${fullHeight ? '' : 'max-h-[600px]'}`}>
        {!content ? (
          <div className="pt-8 font-serif text-prose max-w-[62ch] mx-auto text-zinc-500">
            <p>The scene is being written. Its prose appears here as it arrives.</p>
          </div>
        ) : viewMode === 'changes' && shownRevision ? (
          <MarkdownChangesView before={beforeRevision!} after={content} />
        ) : viewMode !== 'raw' ? (
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
      </div>
    </div>
  );
};

export default StreamingContentView;
