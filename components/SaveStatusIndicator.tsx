import React from 'react';
import { ChapterData, ChapterGenerationStage } from '../types';

interface SaveStatusIndicatorProps {
  generatedChapters: ChapterData[];
  savedAt?: number;
}

const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({ generatedChapters, savedAt }) => {
  const getStageLabel = (stage?: ChapterGenerationStage): string => {
    switch (stage) {
      case ChapterGenerationStage.NotStarted:
        return 'Not Started';
      case ChapterGenerationStage.FirstDraft:
        return 'First Draft';
      case ChapterGenerationStage.LightPolish:
        return 'Polished';
      case ChapterGenerationStage.ConsistencyCheck:
        return 'Checked';
      case ChapterGenerationStage.Complete:
        return 'Complete';
      default:
        return 'In Progress';
    }
  };

  const formatTimestamp = (timestamp?: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffSeconds < 10) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return date.toLocaleTimeString();
  };

  const hasChaptersInProgress = generatedChapters.some(ch => 
    ch.generationStage && ch.generationStage !== ChapterGenerationStage.Complete
  );

  const completedCount = generatedChapters.filter(ch => 
    ch.generationStage === ChapterGenerationStage.Complete
  ).length;

  return (
    <div className="mt-4 p-3 bg-slate-700/50 rounded-md border border-slate-600">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${hasChaptersInProgress ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`}></div>
          <span className="text-sm text-slate-300 font-medium">
            {hasChaptersInProgress ? 'Generating & Auto-saving...' : 'All changes saved'}
          </span>
        </div>
        {savedAt && (
          <span className="text-xs text-slate-400">
            {formatTimestamp(savedAt)}
          </span>
        )}
      </div>

      {generatedChapters.length > 0 && (
        <div className="space-y-1">
          {generatedChapters.map((chapter, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Chapter {idx + 1}: {chapter.title || 'Untitled'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">
                  {getStageLabel(chapter.generationStage)}
                </span>
                {chapter.draftVersions && chapter.draftVersions.length > 0 && (
                  <span className="text-slate-600 text-[10px]">
                    ({chapter.draftVersions.length} versions)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {completedCount > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-600">
          <span className="text-xs text-green-400">
            ✅ {completedCount} / {generatedChapters.length} chapters completed
          </span>
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-slate-600 text-[10px] text-slate-500">
        Progress automatically saved to browser. Safe to refresh if needed.
      </div>
    </div>
  );
};

export default SaveStatusIndicator;

