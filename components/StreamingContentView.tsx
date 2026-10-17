
import React, { useEffect, useRef, useState } from 'react';
import { MarkdownView } from './common/MarkdownView';
import { textRevision } from '../utils/textRevision';
import MarkdownChangesView from './MarkdownChangesView';

interface StreamingContentViewProps {
  title: string;
  content: string;
  previousContent?: string;
  fullHeight?: boolean;
  /** A scene being written or edited right now: its text so far, not yet reviewed or saved. */
  live?: { label: string; text: string } | null;
  /** The author's tools: each tab shows the words that passed through that tool, not a log of it. */
  tools?: { name: string; count: number; text: string }[];
  /** Where the author is working now. The pane follows it: into that tool's tab, and back to the chapter when it writes one. */
  toolFocus?: { tab: string | null; label: string; text: string } | null;
}

const StreamingContentView: React.FC<StreamingContentViewProps> = ({ title, content, previousContent, fullHeight = false, live, tools, toolFocus }) => {
  const contentEndRef = useRef<null | HTMLDivElement>(null);
  const liveEndRef = useRef<null | HTMLDivElement>(null);
  // Follow the scene being written, unless the reader has scrolled away from the end.
  useEffect(() => {
    const scroller = contentEndRef.current;
    if (!scroller || !live?.text) return;
    if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 240) liveEndRef.current?.scrollIntoView({ block: 'end' });
  }, [live?.text]);
  const [viewMode, setViewMode] = useState<'changes' | 'markdown' | 'raw'>('changes');
  // A tool's tab, when one is open, takes the place of the chapter until a view of the chapter is chosen again.
  const [toolName, setToolName] = useState<string | null>(null);
  const tool = tools?.find(item => item.name === toolName) || null;
  const view = (mode: 'changes' | 'markdown' | 'raw') => { setToolName(null); setViewMode(mode); };
  // Follow the author when it moves: only the move itself turns the page, so a tab a person opened by hand stays open until then.
  const focusTab = toolFocus ? toolFocus.tab : undefined;
  useEffect(() => { if (focusTab !== undefined) setToolName(focusTab); }, [focusTab]);
  const happening = tool && toolFocus?.tab === tool.name && toolFocus.text.trim() ? toolFocus : null;
  // In a tool's tab the newest words are at the bottom: keep them in sight as they come.
  useEffect(() => { const scroller = contentEndRef.current; if (scroller && tool) scroller.scrollTop = scroller.scrollHeight; }, [tool?.name, tool?.text, happening?.text]);
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
    <div className={`flex flex-col ${fullHeight ? 'h-full flex-1 min-h-0 overflow-hidden' : 'p-3 md:p-4 rounded border border-zinc-800 mt-6'}`}>
      <div className={`shrink-0 flex flex-wrap gap-2 items-center justify-between border-b border-zinc-800 bg-zinc-900/80 ${fullHeight ? 'px-4 py-2.5' : 'pb-2.5 mb-2.5'}`}>
        <h2 className="text-sm font-medium text-zinc-200 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-zinc-400" />
          <span>{title}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {!!tools?.length && (
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-xs" data-testid="tool-tabs">
              {tools.map(item => (
                <button key={item.name} type="button" aria-pressed={tool?.name === item.name} onClick={() => setToolName(tool?.name === item.name ? null : item.name)}
                  className={`px-2 py-0.5 rounded transition-colors ${tool?.name === item.name ? 'bg-zinc-800 text-zinc-100 font-medium' : item.count ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-600 hover:text-zinc-400'}`}>
                  {item.name}{item.count ? <span className="ml-1 text-zinc-500 tabular-nums">{item.count}</span> : null}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-xs">
            <button type="button" onClick={()=>view('changes')} aria-pressed={!tool&&viewMode==='changes'} className={`px-2 py-0.5 rounded transition-colors ${!tool&&viewMode==='changes'?'bg-zinc-800 text-zinc-100 font-medium':'text-zinc-400 hover:text-zinc-200'}`}>Changes</button>
            <button
              type="button"
              onClick={() => view('markdown')}
              className={`px-2 py-0.5 rounded transition-colors ${!tool && viewMode === 'markdown' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Clean text
            </button>
            <button
              type="button"
              onClick={() => view('raw')}
              className={`px-2 py-0.5 rounded transition-colors ${!tool && viewMode === 'raw' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Raw
            </button>
          </div>
        </div>
      </div>
      <div ref={contentEndRef} className={`overflow-y-auto text-left pr-2 flex-1 min-h-0 ${fullHeight ? 'p-4' : 'max-h-[600px]'}`}>
        {tool ? (
          <div data-testid="tool-text">
            <MarkdownView content={tool.text} className="font-serif text-prose max-w-[62ch] mx-auto" />
            {happening && (
              <div className="pt-6 pb-8 mt-6 border-t border-zinc-800 max-w-[62ch] mx-auto" data-testid="tool-live">
                <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Happening now · {happening.label}</p>
                <div className="font-serif text-prose text-zinc-400 whitespace-pre-wrap">{happening.text}</div>
              </div>
            )}
          </div>
        ) : !content ? (live?.text ? null : (
          <div className="pt-8 font-serif text-prose max-w-[62ch] mx-auto text-zinc-500">
            <p>The scene is being written. Its prose appears here as it arrives.</p>
          </div>
        )) : viewMode === 'changes' && shownRevision ? (
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
        {/* Under the accepted text: the scene in flight, as it arrives. It is not in the book yet. */}
        {!tool && live?.text && (
          <div className="pt-6 pb-8 mt-6 border-t border-zinc-800 max-w-[62ch] mx-auto" data-testid="live-draft">
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Being written now · {live.label} · not yet reviewed</p>
            <div className="font-serif text-prose text-zinc-400 whitespace-pre-wrap">{live.text}</div>
            <div ref={liveEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};

export default StreamingContentView;
