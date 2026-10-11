import React from 'react';
import { ChapterData } from '../types';

interface SaveStatusIndicatorProps {
  generatedChapters: ChapterData[];
  status?: { state: 'saving' | 'saved' | 'error'; error?: string };
  savedAt?: number;
}

/** One line in the studio header. Per-chapter state belongs to the chapter panel, not here. */
const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({ generatedChapters, savedAt, status }) => {
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

  const inProgress = status?.state === 'saving';
  const stamp = formatTimestamp(savedAt);

  return (
    <div className="flex items-center gap-1.5 shrink-0 h-7 pr-1" role="status" aria-live="polite" title={status?.error || "Automatic project backup: autosaves/latest.project.json in the repository."}>
      <span className={`w-1.5 h-1.5 rounded-full ${status?.state === 'error' ? 'bg-amber-500' : inProgress ? 'bg-zinc-400 animate-pulse' : status?.state === 'saved' && savedAt ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
      <span className="text-xs text-zinc-500 whitespace-nowrap">
        {status?.state === 'error' ? 'Autosave failed · retrying' : inProgress ? 'Autosaving' : savedAt ? 'Autosaved to repo' : 'Not saved yet'}{stamp ? ` · ${stamp}` : ''}
      </span>
    </div>
  );
};

export default SaveStatusIndicator;
