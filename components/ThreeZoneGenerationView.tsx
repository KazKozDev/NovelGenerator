import React, { useState, useEffect } from 'react';
import { GenerationStep, ChapterData, AgentLogEntry } from '../types';
import ProgressBar from './ProgressBar';
import StreamingContentView from './StreamingContentView';
import AgentActivityLog from './AgentActivityLog';
import SaveStatusIndicator from './SaveStatusIndicator';
import { LoadingSpinner } from './common/LoadingSpinner';
import { Button } from './common/Button';

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
    <div className="w-full flex flex-col gap-6 animate-fade-in text-slate-100">
      {/* Top Header & Global Controls */}
      <div className="bg-slate-900/80 backdrop-blur border border-slate-700/80 rounded-2xl p-5 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">Author Studio</h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Live Multi-Agent Pipeline
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time 3-zone synchronization: Structural planning, live manuscript stream, and agent telemetry.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isLoading && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-950/60 border border-sky-800/60 text-sky-300 text-xs">
                <LoadingSpinner />
                <span>Generating book...</span>
              </div>
            )}
            {isResumable && !isLoading && onResumeGeneration && (
              <Button onClick={onResumeGeneration} variant="primary" className="text-xs py-1.5 px-3">
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
          <div className="mt-3">
            <SaveStatusIndicator
              generatedChapters={generatedChapters}
              savedAt={lastSavedAt || undefined}
            />
          </div>
        )}
      </div>

      {/* 3-Zone Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
        
        {/* ======================================================== */}
        {/* ZONE 1: Pipeline, Chapter Navigation & Narrative Plan     */}
        {/* ======================================================== */}
        <div
          data-testid="zone-pipeline"
          className="lg:col-span-3 flex flex-col gap-4 bg-slate-900/80 backdrop-blur border border-slate-700/80 rounded-2xl p-4 md:p-5 shadow-xl text-left"
        >
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sky-400 text-lg">🗺️</span>
              <h3 className="font-semibold text-slate-100 text-sm md:text-base">
                Pipeline & Chapters
              </h3>
            </div>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
              {currentChapterProcessing > 0 ? `Ch ${currentChapterProcessing} of ${totalChaptersToProcess || generatedChapters.length}` : 'Preparing'}
            </span>
          </div>

          {/* Chapter List Navigation */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
              Chapter Navigation
            </label>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
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
                    className={`flex items-center justify-between p-2.5 rounded-xl text-xs transition-all text-left w-full border ${
                      isSelected
                        ? 'bg-sky-500/20 border-sky-400 text-sky-200 font-medium shadow-sm'
                        : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <span className="font-mono text-slate-400 w-5">#{chapterNum}</span>
                      <span className="truncate">
                        {chapter?.title || (isProcessing ? 'Generating...' : `Chapter ${chapterNum}`)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isProcessing ? (
                        <span className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                          Live
                        </span>
                      ) : isCompleted ? (
                        <span className="text-emerald-400 text-[11px]">✓ Done</span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Pending</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Chapter Plan */}
          <div className="border-t border-slate-700/80 pt-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Active Chapter Plan
              </span>
              <span className="text-[11px] text-sky-400 font-mono">
                Ch #{activeChapterNum}
              </span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-300 max-h-56 overflow-y-auto leading-relaxed whitespace-pre-wrap font-mono">
              {(selectedChapterIdx === currentChapterProcessing - 1 && currentChapterPlan) 
                ? currentChapterPlan 
                : (activeChapter?.plan || currentChapterPlan || 'Drafting scene breakdown and pacing objectives...')}
            </div>
          </div>

          {/* Collapsible Story Outline */}
          <div className="border-t border-slate-700/80 pt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowOutline(!showOutline)}
              className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span>📚 Story Outline</span>
                <span className="text-[10px] text-slate-500 lowercase">({currentStoryOutline ? `${currentStoryOutline.length} chars` : 'empty'})</span>
              </div>
              <span>{showOutline ? '▼' : '▶'}</span>
            </button>

            {showOutline && (
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-300 max-h-64 overflow-y-auto leading-relaxed whitespace-pre-wrap font-mono animate-fade-in">
                {currentStoryOutline || 'No outline generated yet.'}
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* ZONE 2: Live Prose Manuscript Stream (Unclipped)         */}
        {/* ======================================================== */}
        <div
          data-testid="zone-prose"
          className="lg:col-span-6 flex flex-col w-full h-full min-h-[600px]"
        >
          {isWritingProse || activeContent ? (
            <StreamingContentView
              title={`Writing Chapter ${activeChapterNum}: ${activeTitle}`}
              content={activeContent}
              fullHeight={true}
            />
          ) : (
            <div className="p-8 bg-slate-900/80 backdrop-blur rounded-2xl border border-slate-700/80 shadow-xl flex flex-col items-center justify-center text-center h-full min-h-[500px]">
              <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center text-3xl mb-4">
                ✍️
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Narrative Pre-production in Progress</h3>
              <p className="text-sm text-slate-300 max-w-md mb-6 leading-relaxed">
                Specialist agents are formulating character arcs, world mechanics, and scene breakdowns. Full manuscript prose streaming will commence automatically.
              </p>
              <div className="flex items-center gap-3 text-xs text-sky-400 bg-sky-950/40 px-4 py-2 rounded-xl border border-sky-800/50">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
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
          className="lg:col-span-3 flex flex-col gap-4 bg-slate-900/80 backdrop-blur border border-slate-700/80 rounded-2xl p-4 md:p-5 shadow-xl text-left max-h-[85vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 text-lg">🧠</span>
              <h3 className="font-semibold text-slate-100 text-sm md:text-base">
                Agent Inspector
              </h3>
            </div>
            <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full border border-slate-700 font-mono">
              {agentLogs.length} events
            </span>
          </div>

          {/* Quick Agent Status Telemetry */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-slate-950/50 rounded-xl border border-slate-800">
              <div className="text-slate-400 text-[10px] uppercase font-semibold">Specialists</div>
              <div className="text-emerald-400 font-medium mt-0.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </div>
            </div>
            <div className="p-2.5 bg-slate-950/50 rounded-xl border border-slate-800">
              <div className="text-slate-400 text-[10px] uppercase font-semibold">Target</div>
              <div className="text-sky-300 font-medium mt-0.5 truncate">
                Ch #{currentChapterProcessing || 1}
              </div>
            </div>
          </div>

          {/* Full Agent Activity Log */}
          {agentLogs.length > 0 ? (
            <div className="flex-1">
              <AgentActivityLog logs={agentLogs} />
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs flex flex-col items-center gap-2">
              <span className="text-2xl opacity-40">🤖</span>
              <span>Waiting for agent telemetry...</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default ThreeZoneGenerationView;
