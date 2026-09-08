import React from 'react';
import { ChapterData, ChapterGenerationStage } from '../types';

interface SaveStatusIndicatorProps {
  generatedChapters: ChapterData[];
  savedAt?: number;
}

/** One line in the studio header. Per-chapter state belongs to the chapter panel, not here. */
const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({ generatedChapters, savedAt }) => {
  const formatTimestamp = (timestamp?: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSeconds < 10) return 'just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return date.toLocaleTimeString();
  };

  const inProgress = generatedChapters.some(
    chapter => chapter.generationStage && chapter.generationStage !== ChapterGenerationStage.Complete,
  );
  const stamp = formatTimestamp(savedAt);

  return (
    <div className="flex items-center gap-2 shrink-0" role="status" aria-live="polite">
      <span className={`w-1.5 h-1.5 rounded-full ${inProgress ? 'bg-zinc-400 animate-pulse' : 'bg-zinc-600'}`} />
      <span className="text-[11px] font-mono text-zinc-500 whitespace-nowrap">
        {inProgress ? 'auto-saving' : 'saved'}{stamp ? ` · ${stamp}` : ''}
      </span>
    </div>
  );
};

export default SaveStatusIndicator;
