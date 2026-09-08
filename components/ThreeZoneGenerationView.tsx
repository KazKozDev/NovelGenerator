import React, { useState, useEffect } from 'react';
import { GenerationStep, ChapterGenerationStage, ChapterData, AgentLogEntry } from '../types';
import ProgressBar from './ProgressBar';
import ThemeToggle from './ThemeToggle';
import PlanView from './PlanView';
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
  /** The studio puts the wordmark and the global reset on the same strip as the run status. */
  version?: string;
  onReset?: () => void;
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
  version,
  onReset,
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
      {/* One status strip: the step, the save state, the only global action. */}
      <div className="shrink-0 flex items-center justify-between gap-4 border-b border-zinc-800 pb-1.5">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-lg font-semibold text-zinc-100 tracking-tight leading-none shrink-0">NovelGenerator</span>
          {version && (
            <span className="shrink-0 font-mono text-[10px] text-zinc-500">
              {version}
            </span>
          )}
          <span className="text-zinc-700 shrink-0">|</span>
          <ProgressBar
            currentStep={currentStep}
            currentChapterProcessing={currentChapterProcessing}
            totalChaptersToProcess={totalChaptersToProcess}
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {generatedChapters.length > 0 && (
            <SaveStatusIndicator generatedChapters={generatedChapters} savedAt={lastSavedAt || undefined} />
          )}
          {isLoading && (
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono">
              <LoadingSpinner className="!my-0 !h-3.5 !w-3.5" />
              <span>Generating</span>
            </div>
          )}
          {isResumable && !isLoading && onResumeGeneration && (
            <Button onClick={onResumeGeneration} variant="primary" className="text-xs py-1 px-2.5">
              Resume Generation
            </Button>
          )}
          <ThemeToggle />
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              title="Wipe all temporary generation state and start from clean slate"
              className="text-xs font-mono px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors"
            >
              Clean Slate
            </button>
          )}
        </div>
      </div>

      {/* 3-Zone Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 w-full flex-1 min-h-0 items-stretch overflow-hidden">
        
        {/* ======================================================== */}
        {/* ZONE 1: Pipeline, Chapter Navigation & Narrative Plan     */}
        {/* ======================================================== */}
        <div
          data-testid="zone-pipeline"
          className="lg:col-span-2 flex flex-col h-full min-h-0 pr-4 text-left overflow-hidden"
        >
          <div className="shrink-0 flex items-baseline justify-between pb-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Chapters</h3>
            <span className="text-[11px] font-mono text-zinc-500">
              {currentChapterProcessing > 0 ? `Ch ${currentChapterProcessing} of ${totalChaptersToProcess || generatedChapters.length}` : 'Preparing'}
            </span>
          </div>

          {/* Chapter List Navigation */}
          <div className="shrink-0 flex flex-col gap-1.5 pt-2">
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-1">
              {Array.from({ length: Math.max(totalChaptersToProcess, generatedChapters.length) }).map((_, idx) => {
                const chapter = generatedChapters[idx];
                const chapterNum = idx + 1;
                const isSelected = selectedChapterIdx === idx;
                const isProcessing = currentChapterProcessing === chapterNum && isLoading;
                const isCompleted = chapter?.generationStage === ChapterGenerationStage.Complete;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedChapterIdx(idx)}
                    className={`flex items-center justify-between p-2 rounded-sm text-xs transition-colors text-left w-full border ${
                      isSelected
                        ? 'bg-zinc-800/70 border-zinc-700 text-zinc-100 font-medium'
                        : 'border-transparent hover:bg-zinc-900/60 text-zinc-400'
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
                        <span className="text-zinc-400 text-[11px] font-medium font-mono">Accepted</span>
                      ) : (
                        <span className="text-zinc-600 text-[11px] font-mono">{chapter?.content ? 'Needs review' : 'Pending'}</span>
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
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Plan · Ch {activeChapterNum}
              </span>
            </div>
            <div className="flex-1 min-h-0 pr-1 text-xs text-zinc-400 overflow-y-auto leading-relaxed">
              <PlanView
                content={activeChapter?.plan || currentChapterPlan || 'Drafting scene breakdown and pacing objectives...'}
              />
            </div>
          </div>

          {/* Collapsible Story Outline */}
          <div className={`border-t border-zinc-800 pt-2 flex flex-col gap-1.5 ${showOutline ? 'flex-1 min-h-0 overflow-hidden' : 'shrink-0'}`}>
            <button
              type="button"
              onClick={() => setShowOutline(!showOutline)}
              className="shrink-0 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span>Story Outline</span>
                <span className="text-[10px] text-zinc-500 lowercase">({currentStoryOutline ? `${currentStoryOutline.length} chars` : 'empty'})</span>
              </div>
              <span className="text-[10px] font-mono">{showOutline ? '[-]' : '[+]'}</span>
            </button>

            {showOutline && (
              <div className="flex-1 min-h-0 pr-1 text-xs text-zinc-400 overflow-y-auto leading-relaxed animate-fade-in">
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
          className="lg:col-span-8 flex flex-col w-full h-full min-h-0 overflow-hidden border-x border-zinc-800 sheet"
        >
          {isWritingProse || activeContent ? (
            <StreamingContentView
              title={`Chapter ${activeChapterNum}: ${activeTitle}`}
              content={activeContent}
              fullHeight={true}
            />
          ) : (
            <div className="pt-8 px-6 text-left text-zinc-500">
              <p className="text-xs font-medium text-zinc-400">Narrative pre-production</p>
              <p className="text-[11px] mt-1 max-w-sm leading-relaxed">
                The story plan is being prepared. Each completed scene appears here before chapter review.
              </p>
              <p className="text-[11px] mt-3 font-mono text-zinc-500">{currentStep}</p>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* ZONE 3: Agent Activity, Telemetry & Diffs (Unclipped)    */}
        {/* ======================================================== */}
        <div
          data-testid="zone-agent-inspector"
          className="lg:col-span-2 flex flex-col h-full min-h-0 pl-4 text-left overflow-hidden"
        >
          <div className="shrink-0 flex items-baseline justify-between pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-zinc-400" />
              <h3 className="font-semibold text-zinc-200 text-xs tracking-wider uppercase">
                Agent Inspector
              </h3>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              {agentLogs.length} events
            </span>
          </div>

          {/* Quick Agent Status Telemetry */}
          <div className="shrink-0 grid grid-cols-2 gap-2 pt-2">
            <div className="py-1">
              <div className="text-zinc-500 text-[10px] uppercase font-semibold">Specialists</div>
              <div className="text-zinc-300 font-medium mt-0.5 flex items-center gap-1.5 text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
                Active
              </div>
            </div>
            <div className="py-1">
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
            <div className="pt-3 text-zinc-500 text-[11px] font-mono">
              <span>Awaiting agent telemetry...</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default ThreeZoneGenerationView;
