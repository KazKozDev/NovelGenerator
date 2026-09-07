
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
    <div className={`p-4 md:p-6 bg-slate-900/70 rounded-xl border border-slate-700/80 shadow-xl flex flex-col ${fullHeight ? 'h-full' : 'mt-6'}`}>
      <div className="flex items-center justify-between border-b border-slate-700/80 pb-3 mb-3">
        <h3 className="font-semibold text-sky-400 text-sm md:text-base flex items-center gap-2 tracking-wide font-sans">
          <span className="w-2 h-2 rounded-full bg-sky-400" />
          <span>{title}</span>
        </h3>
        <span className="text-xs bg-slate-800 text-sky-300 px-2.5 py-1 rounded-full font-mono border border-slate-700">
          {wordCount.toLocaleString()} words
        </span>
      </div>
      <div className={`overflow-y-auto text-left pr-2 flex-1 ${fullHeight ? 'min-h-[450px] max-h-[75vh]' : 'max-h-[600px]'}`}>
        <div className="whitespace-pre-wrap text-sm md:text-base leading-relaxed text-slate-200 font-serif selection:bg-sky-500/30">
          {content}
          <span className="inline-block w-2 h-4 bg-sky-400 animate-pulse ml-1 align-middle" />
        </div>
        <div ref={contentEndRef} />
      </div>
    </div>
  );
};

export default StreamingContentView;
