
import React, { useEffect, useRef } from 'react';

interface StreamingContentViewProps {
  title: string;
  content: string;
  fullHeight?: boolean;
}

const StreamingContentView: React.FC<StreamingContentViewProps> = ({ title, content, fullHeight = false }) => {
  const contentEndRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => {
    // Using 'auto' provides a more instant scroll which can feel better during rapid updates
    contentEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [content]);

  const wordCount = content ? content.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className={`p-4 md:p-6 bg-zinc-900/80 rounded-xl border border-zinc-800 shadow-sm flex flex-col ${fullHeight ? 'h-full' : 'mt-6'}`}>
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-3">
        <h3 className="font-semibold text-zinc-200 text-xs md:text-sm flex items-center gap-2 tracking-wide font-sans uppercase">
          <span className="w-2 h-2 rounded-full bg-zinc-400" />
          <span>{title}</span>
        </h3>
        <span className="text-[11px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono border border-zinc-700">
          {wordCount.toLocaleString()} words
        </span>
      </div>
      <div className={`overflow-y-auto text-left pr-2 flex-1 ${fullHeight ? 'min-h-[450px] max-h-[75vh]' : 'max-h-[600px]'}`}>
        <div className="whitespace-pre-wrap text-sm md:text-base leading-relaxed text-zinc-300 font-serif selection:bg-zinc-700/60">
          {content}
          <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse ml-1 align-middle" />
        </div>
        <div ref={contentEndRef} />
      </div>
    </div>
  );
};

export default StreamingContentView;
