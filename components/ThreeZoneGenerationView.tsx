import React, { useState, useEffect } from 'react';
import { GenerationStep, ChapterData, AgentLogEntry } from '../types';
import ProgressBar from './ProgressBar';
import StreamingContentView from './StreamingContentView';
import AgentActivityLog from './AgentActivityLog';
import SaveStatusIndicator from './SaveStatusIndicator';
import { LoadingSpinner } from './common/LoadingSpinner';
import { Button } from './common/Button';
import { MarkdownView } from './common/MarkdownView';

export interface ThreeZoneGenerationViewProps {
  currentStep: GenerationStep;
  currentChapterProcessing: number;
  totalChaptersToProcess: number;
  currentStoryOutline: string;
  currentChapterPlan: string;
  generatedChapters: ChapterData[];
  agentLogs: AgentLogEntry[];
  lastSavedAt?: number | null;
  isResumable?: boolean;
  isLoading?: boolean;
  onResumeGeneration?: () => void;
}

export const ThreeZoneGenerationView: React.FC<ThreeZoneGenerationViewProps> = ({
  currentStep,
  currentChapterProcessing,
  totalChaptersToProcess,
  currentStoryOutline,
  currentChapterPlan,
  generatedChapters,
  agentLogs,
  lastSavedAt,
  isResumable = false,
  isLoading = false,
  onResumeGeneration,
}) => {
  // Track selected chapter for viewing (defaults to active processing chapter)
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number>(0);
  const [showOutline, setShowOutline] = useState<boolean>(false);

  // Sync selected chapter with currently processing chapter
  useEffect(() => {
    if (currentChapterProcessing > 0 && currentChapterProcessing <= generatedChapters.length) {
      setSelectedChapterIdx(currentChapterProcessing - 1);
    } else if (generatedChapters.length > 0 && selectedChapterIdx >= generatedChapters.length) {
      setSelectedChapterIdx(generatedChapters.length - 1);
    }
  }, [currentChapterProcessing, generatedChapters.length]);

  const activeChapter = generatedChapters[selectedChapterIdx] || generatedChapters[currentChapterProcessing - 1] || null;
  const activeChapterNum = selectedChapterIdx + 1;
  const activeTitle = activeChapter?.title || (activeChapterNum === currentChapterProcessing ? 'Generating...' : `Chapter ${activeChapterNum}`);
  const activeContent = activeChapter?.content || '';

  // Determine stage description
  const isWritingProse = currentStep === GenerationStep.GeneratingChapters || currentStep === GenerationStep.FinalEditingPass;

  return (
    <div className="w-full h-full flex-1 min-h-0 flex flex-col gap-2.5 animate-fade-in text-zinc-200 overflow-hidden">
      {/* Top Header & Global Controls */}
      <div className="shrink-0 bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 md:p-3.5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 mb-2.5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm md:text-base font-semibold text-zinc-100 tracking-tight">Author Studio</h2>
                <span className="px-2 py-0.5 text-[10px] font-medium font-mono rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  Pipeline Active
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Real-time synchronization: narrative structure, manuscript prose, and agent telemetry.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isLoading && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700 text-zinc-300 text-xs font-mono">
                <LoadingSpinner className="!my-0 !h-3.5 !w-3.5" />
                <span>Generating...</span>
              </div>
            )}
            {isResumable && !isLoading && onResumeGeneration && (
              <Button onClick={onResumeGeneration} variant="primary" className="text-xs py-1 px-2.5">
                Resume Generation
              </Button>
            )}
          </div>
        </div>

        {/* Global Progress Bar */}
        <ProgressBar
          currentStep={currentStep}
          currentChapterProcessing={currentChapterProcessing}
          totalChaptersToProcess={totalChaptersToProcess}
        />

        {/* Global Save Status Indicator */}
        {generatedChapters.length > 0 && (
          <div className="mt-1.5">
            <SaveStatusIndicator
              generatedChapters={generatedChapters}
              savedAt={lastSavedAt || undefined}
            />
          </div>
        )}
      </div>

      {/* 3-Zone Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 w-full flex-1 min-h-0 items-stretch overflow-hidden">
        
        {/* ======================================================== */}
        {/* ZONE 1: Pipeline, Chapter Navigation & Narrative Plan     */}
        {/* ======================================================== */}
        <div
          data-testid="zone-pipeline"
          className="lg:col-span-3 flex flex-col h-full min-h-0 bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 shadow-sm text-left overflow-hidden"
        >
          <div className="shrink-0 flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-zinc-400" />
              <h3 className="font-semibold text-zinc-200 text-xs tracking-wider uppercase">
                Pipeline & Chapters
              </h3>
            </div>
            <span className="text-[11px] font-mono bg-zinc-800/90 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700/80">
              {currentChapterProcessing > 0 ? `Ch ${currentChapterProcessing} of ${totalChaptersToProcess || generatedChapters.length}` : 'Preparing'}
            </span>
          </div>

          {/* Chapter List Navigation */}
          <div className="shrink-0 flex flex-col gap-1.5 pt-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
              Chapter Navigation
            </label>
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-1">
              {Array.from({ length: Math.max(totalChaptersToProcess, generatedChapters.length) }).map((_, idx) => {
                const chapter = generatedChapters[idx];
                const chapterNum = idx + 1;
                const isSelected = selectedChapterIdx === idx;
                const isProcessing = currentChapterProcessing === chapterNum && isLoading;
                const isCompleted = Boolean(chapter?.content && chapter.content.trim().length > 100);

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedChapterIdx(idx)}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs transition-colors text-left w-full border ${
                      isSelected
                        ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-medium'
                        : 'bg-zinc-900/60 border-zinc-800 hover:bg-zinc-800/60 text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <span className="font-mono text-zinc-500 w-5">#{chapterNum}</span>
                      <span className="truncate">
                        {chapter?.title || (isProcessing ? 'Generating...' : `Chapter ${chapterNum}`)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isProcessing ? (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-300 font-medium font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-ping" />
                          Live
                        </span>
                      ) : isCompleted ? (
                        <span className="text-zinc-400 text-[11px] font-medium font-mono">Done</span>
                      ) : (
                        <span className="text-zinc-600 text-[11px] font-mono">Pending</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Chapter Plan */}
          <div className="flex-1 min-h-0 border-t border-zinc-800 pt-2 flex flex-col gap-1.5 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Active Chapter Plan
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                Ch #{activeChapterNum}
              </span>
            </div>
            <div className="flex-1 min-h-0 p-2.5 bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 overflow-y-auto leading-relaxed rounded-lg">
              <MarkdownView
                content={(selectedChapterIdx === currentChapterProcessing - 1 && currentChapterPlan) 
                  ? currentChapterPlan 
                  : (activeChapter?.plan || currentChapterPlan || 'Drafting scene breakdown and pacing objectives...')}
                className="text-xs"
              />
            </div>
          </div>

          {/* Collapsible Story Outline */}
          <div className={`border-t border-zinc-800 pt-2 flex flex-col gap-1.5 ${showOutline ? 'flex-1 min-h-0 overflow-hidden' : 'shrink-0'}`}>
            <button
              type="button"
              onClick={() => setShowOutline(!showOutline)}
              className="shrink-0 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span>Story Outline</span>
                <span className="text-[10px] text-zinc-500 lowercase">({currentStoryOutline ? `${currentStoryOutline.length} chars` : 'empty'})</span>
              </div>
              <span className="text-[10px] font-mono">{showOutline ? '[-]' : '[+]'}</span>
            </button>

            {showOutline && (
              <div className="flex-1 min-h-0 p-2.5 bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 overflow-y-auto leading-relaxed rounded-lg animate-fade-in">
                <MarkdownView
                  content={currentStoryOutline || 'No outline generated yet.'}
                  className="text-xs"
                />
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* ZONE 2: Live Prose Manuscript Stream (Unclipped)         */}
        {/* ======================================================== */}
        <div
          data-testid="zone-prose"
          className="lg:col-span-6 flex flex-col w-full h-full min-h-0 overflow-hidden"
        >
          {isWritingProse || activeContent ? (
            <StreamingContentView
              title={`Chapter ${activeChapterNum}: ${activeTitle}`}
              content={activeContent}
              fullHeight={true}
            />
          ) : (
            <div className="p-6 md:p-8 bg-zinc-900/80 border border-zinc-800 rounded-xl shadow-sm flex flex-col items-center justify-center text-center h-full flex-1 min-h-0 overflow-y-auto">
              <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-1.5 uppercase tracking-wide">Narrative Pre-production</h3>
              <p className="text-xs text-zinc-400 max-w-md mb-5 leading-relaxed">
                Specialist agents are formulating character arcs, world mechanics, and scene breakdowns. Manuscript prose streaming will commence automatically.
              </p>
              <div className="flex items-center gap-2 text-xs text-zinc-300 bg-zinc-800/80 px-3 py-1.5 rounded-lg border border-zinc-700 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-ping" />
                <span>{currentStep}</span>
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* ZONE 3: Agent Activity, Telemetry & Diffs (Unclipped)    */}
        {/* ======================================================== */}
        <div
          data-testid="zone-agent-inspector"
          className="lg:col-span-3 flex flex-col h-full min-h-0 bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 shadow-sm text-left overflow-hidden"
        >
          <div className="shrink-0 flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-zinc-400" />
              <h3 className="font-semibold text-zinc-200 text-xs tracking-wider uppercase">
                Agent Inspector
              </h3>
            </div>
            <span className="text-[11px] font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700">
              {agentLogs.length} events
            </span>
          </div>

          {/* Quick Agent Status Telemetry */}
          <div className="shrink-0 grid grid-cols-2 gap-2 pt-2">
            <div className="p-2 bg-zinc-950 rounded-lg border border-zinc-800">
              <div className="text-zinc-500 text-[10px] uppercase font-semibold">Specialists</div>
              <div className="text-zinc-300 font-medium mt-0.5 flex items-center gap-1.5 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
                Active
              </div>
            </div>
            <div className="p-2 bg-zinc-950 rounded-lg border border-zinc-800">
              <div className="text-zinc-500 text-[10px] uppercase font-semibold">Target</div>
              <div className="text-zinc-300 font-medium mt-0.5 truncate text-xs font-mono">
                Ch #{currentChapterProcessing || 1}
              </div>
            </div>
          </div>

          {/* Full Agent Activity Log */}
          {agentLogs.length > 0 ? (
            <div className="flex-1 min-h-0 overflow-y-auto pt-2 pr-1">
              <AgentActivityLog logs={agentLogs} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-zinc-500 text-xs gap-2 font-mono">
              <span>Awaiting agent telemetry...</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default ThreeZoneGenerationView;
