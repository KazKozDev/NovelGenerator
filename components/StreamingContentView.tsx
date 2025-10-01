
import React, { useEffect, useRef } from 'react';

interface StreamingContentViewProps {
  title: string;
  content: string;
}

const StreamingContentView: React.FC<StreamingContentViewProps> = ({ title, content }) => {
  const contentEndRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => {
    // Using 'auto' provides a more instant scroll which can feel better during rapid updates
    contentEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [content]);

  return (
    <div className="mt-6 p-4 bg-slate-900/50 rounded-md border border-slate-700 animate-fade-in">
      <h3 className="font-semibold mb-3 text-sky-400 text-lg">{title}</h3>
      <div className="max-h-80 overflow-y-auto text-left pr-2">
        <pre className="whitespace-pre-wrap text-sm text-slate-300">
          {content}
          <span className="inline-block w-2 h-4 bg-sky-400 animate-pulse ml-1" />
        </pre>
        <div ref={contentEndRef} />
      </div>
    </div>
  );
};

export default StreamingContentView;
