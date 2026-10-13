import type {TokenTotals} from '../utils/tokenUsage';
import React, { useState, useEffect, useMemo } from 'react';
import { GenerationStep, ChapterGenerationStage, ChapterData, AgentLogEntry } from '../types';
import ChapterChecks from './ChapterChecks';
import { measureTexture } from '../utils/novel/analytics';
import ProgressBar from './ProgressBar';
import ThemeToggle from './ThemeToggle';
import SystemManualToggle from './SystemManualModal';
import PlanView from './PlanView';
import StreamingContentView from './StreamingContentView';
import AgentActivityLog from './AgentActivityLog';

import SaveStatusIndicator from './SaveStatusIndicator';
import { RunClock } from './RunClock';
import { LoadingSpinner } from './common/LoadingSpinner';
import { Button } from './common/Button';
import { MarkdownView } from './common/MarkdownView';
export interface ThreeZoneGenerationViewProps {
  proseContent?: (chapter: number) => React.ReactNode;
  inspectorContent?: React.ReactNode;
  selectedChapterNumber?: number;
  onChapterSelect?: (chapter: number) => void;
  followActiveChapter?: boolean;
  developmentLabel?: string;
  targetWordsPerChapter?:number;
  currentStep: GenerationStep;
  currentChapterProcessing: number;
  totalChaptersToProcess: number;
  currentStoryOutline: string;
  currentChapterPlan: string;
  /** The author's tools, each as readable text: shown as tabs beside the view of the chapter. */
  tools?: { name: string; count: number; text: string }[];
  /** Where the author is working now: the centre pane follows it into that tab, and back to the chapter. */
  toolFocus?: { tab: string | null; label: string; text: string } | null;
  generatedChapters: ChapterData[];
  agentLogs: AgentLogEntry[];
  /** The prose of the call now in flight, as far as it has arrived. */
  liveDraft?: { label: string; text: string } | null;
  tokenTotals?:TokenTotals;
  autosaveStatus?: { state: 'saving' | 'saved' | 'error'; error?: string };
  lastSavedAt?: number | null;
  isResumable?: boolean;
  isLoading?: boolean;
  onResumeGeneration?: () => void;
  /** The studio puts the wordmark and the global reset on the same strip as the run status. */
  version?: string;
  onReset?: () => void;
  headerActions?: React.ReactNode;
}

export const ThreeZoneGenerationView: React.FC<ThreeZoneGenerationViewProps> = ({
  proseContent, inspectorContent, selectedChapterNumber, onChapterSelect, followActiveChapter = true,
  developmentLabel,
  targetWordsPerChapter,
  currentStep,
  currentChapterProcessing,
  totalChaptersToProcess,
  currentStoryOutline,
  currentChapterPlan,
  tools,
  toolFocus,
  generatedChapters,
  agentLogs,
  liveDraft,
  tokenTotals,
  lastSavedAt, autosaveStatus,
  version,
  onReset,
  headerActions,
  isResumable = false,
  isLoading = false,
  onResumeGeneration,
}) => {
  // Track selected chapter for viewing (defaults to active processing chapter)
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number>(0);
  const [showOutline, setShowOutline] = useState<boolean>(false);

  // Sync selected chapter with currently processing chapter
  useEffect(() => {
    if (!followActiveChapter) return;
    // The chapter being written is followed from its first word, before it has any saved text:
    // otherwise its live text was shown under the chapter before it.
    if (currentChapterProcessing > 0 && currentChapterProcessing <= Math.max(totalChaptersToProcess, generatedChapters.length)) {
      setSelectedChapterIdx(currentChapterProcessing - 1);
    } else if (generatedChapters.length > 0 && selectedChapterIdx >= generatedChapters.length) {
      setSelectedChapterIdx(generatedChapters.length - 1);
    }
  }, [currentChapterProcessing, generatedChapters.length]);

  useEffect(() => { if (selectedChapterNumber) setSelectedChapterIdx(selectedChapterNumber - 1); }, [selectedChapterNumber]);

  const activeChapter = generatedChapters[selectedChapterIdx] || null;
  // Text that is arriving belongs to the chapter being written and is shown only there.
  const liveHere = liveDraft?.text && (!currentChapterProcessing || selectedChapterIdx + 1 === currentChapterProcessing) ? liveDraft : null;
  const activeChapterNum = selectedChapterIdx + 1;
  // The stored title may already carry its number ("Chapter 1" from the v2
  // hook, "Chapter 1: The Awakening" from older runs): strip it before the
  // heading adds its own, so the number never prints twice.
  const storedTitle = (activeChapter?.title || '').trim();
  const titleBody = storedTitle.replace(/^chapter\s+\d+\s*:?\s*/i, '').trim();
  const activeTitle = titleBody || (activeChapterNum === currentChapterProcessing ? 'Generating...' : '');
  const proseHeading = activeTitle ? `Chapter ${activeChapterNum}: ${activeTitle}` : `Chapter ${activeChapterNum}`;
  const activeContent = activeChapter?.content || '';
  // Measured live from the shown text: stored texture (when present) wins,
  // otherwise Checks computes over whatever prose is on screen.
  const liveTexture = useMemo(
    () => (activeContent.trim() ? measureTexture(activeContent) : null),
    [activeContent],
  );
  const texture = activeChapter?.texture
    ? {
        dialogueShare: activeChapter.texture.dialogueShare,
        medianParagraphWords: activeChapter.texture.medianParagraphWords,
        similesPer1000: activeChapter.texture.similesPer1000 ?? liveTexture?.similesPer1000 ?? 0,
        taggedSpeechShare: activeChapter.texture.taggedSpeechShare ?? liveTexture?.taggedSpeechShare ?? 0,
        findings: activeChapter.texture.findings,
      }
    : liveTexture
      ? { ...liveTexture, findings: [] as { id: string; description: string }[] }
      : null;

  // Determine stage description
  const isWritingProse = currentStep === GenerationStep.GeneratingChapters || currentStep === GenerationStep.FinalEditingPass;

  // An inspector with nothing to inspect should not hold a column open beside the manuscript.
  const showInspector = true; // Keep all three workspace columns visible before the first event.

  return (
    <div className="studio-layout w-full h-full flex-1 min-h-0 flex flex-col gap-2.5 animate-fade-in text-zinc-300 overflow-hidden">
      {/* Brand, slogan and global actions; runtime status belongs to the inspector. */}
      <div className="studio-header shrink-0 flex items-start gap-3 border-b border-zinc-800 pb-1.5">
        <div className="flex flex-1 min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="studio-heading flex flex-wrap items-baseline gap-2 min-w-0">
          <span className="text-xl font-semibold shrink-0 wordmark">NovelGenerator</span>
          {version && (
            <span className="shrink-0 font-mono text-xs text-zinc-500">
              {version}
            </span>
          )}
          <span className="text-zinc-700 shrink-0">|</span>
          <span className="text-zinc-500 text-xs">Write a novel before your coffee gets cold</span>
        </div>

        <div className="app-toolbar flex flex-wrap items-center gap-2 min-w-0">
          {generatedChapters.length > 0 && (
            <SaveStatusIndicator generatedChapters={generatedChapters} savedAt={lastSavedAt || undefined} status={autosaveStatus} />
          )}
          {headerActions}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              title="Wipe all temporary generation state and start from clean slate"
              className="h-7 text-xs px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300 rounded transition-colors"
            >
              Clean Slate
            </button>
          )}
        </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 ml-auto" aria-label="Appearance and help">
          <ThemeToggle />
          <SystemManualToggle />
        </div>
      </div>

      {/* 3-Zone Studio Grid */}
      <div className="studio-grid grid grid-cols-1 lg:grid-cols-12 gap-3 w-full flex-1 min-h-0 items-stretch overflow-hidden">
        
        {/* ======================================================== */}
        {/* ZONE 1: Pipeline, Chapter Navigation & Narrative Plan     */}
        {/* ======================================================== */}
        <div
          data-testid="zone-pipeline"
          className="studio-side lg:col-span-2 min-w-0 flex flex-col h-full min-h-0 pr-4 text-left overflow-hidden"
        >
          <div className="shrink-0 flex items-baseline justify-between pb-2">
            <h3 className="text-xs font-semibold uppercase text-zinc-500">Chapters</h3>
            <span className="text-xs text-zinc-500">
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
                    onClick={() => { setSelectedChapterIdx(idx); onChapterSelect?.(idx + 1); }}
                    className={`flex items-center justify-between p-2 rounded text-xs transition-colors text-left w-full border ${
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
                        <span className="flex items-center gap-1 text-xs text-zinc-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Live
                        </span>
                      ) : isCompleted ? (
                        <span className="text-zinc-400 text-xs">Accepted</span>
                      ) : (
                        <span className="text-zinc-600 text-xs">{chapter?.content ? (isLoading ? 'Draft' : 'Written') : 'Pending'}</span>
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
              <span className="text-xs font-semibold uppercase text-zinc-500">
                Plan · Ch {activeChapterNum}
              </span>
            </div>
            <div className="flex-1 min-h-0 pr-1 text-xs text-zinc-400 overflow-y-auto">
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
              className="shrink-0 flex items-center justify-between text-xs font-semibold uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span>Story Outline</span>
                <span className="text-xs text-zinc-500 lowercase">({currentStoryOutline ? `${currentStoryOutline.length} chars` : 'empty'})</span>
              </div>
              <span className="text-xs">{showOutline ? '[-]' : '[+]'}</span>
            </button>

            {showOutline && (
              <div className="flex-1 min-h-0 pr-1 text-xs text-zinc-400 overflow-y-auto animate-fade-in">
                <MarkdownView
                  content={currentStoryOutline ? currentStoryOutline.replace(/\r\n/g, '\n').replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n') : 'No outline generated yet.'}
                  className="text-xs compact-outline"
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
          className={`${showInspector ? 'lg:col-span-8' : 'lg:col-span-10'} studio-manuscript min-w-0 flex flex-col w-full h-full min-h-0 overflow-hidden border-x border-zinc-800 sheet`}
        >
          {proseContent ? proseContent(activeChapterNum) : isWritingProse || activeContent || liveHere || tools?.length ? (
            <StreamingContentView
              title={proseHeading}
              content={activeContent}
              live={liveHere}
              tools={tools}
              toolFocus={toolFocus}
              previousContent={activeChapter?.previousContent}
              fullHeight={true}
            />
          ) : (
            <div className="pt-8 px-6 font-serif text-prose max-w-[62ch] mx-auto text-zinc-500">
              <p>The story plan is being prepared. Each completed scene appears here before chapter review.</p>
              <p className="text-xs mt-4">{currentStep}</p>
            </div>
          )}
        </div>

        {/* ZONE 3: checks occupy their content height; telemetry fills the remaining space. */}
        {showInspector && (
          <div
            data-testid="zone-agent-inspector"
            className="studio-side lg:col-span-2 min-w-0 flex flex-col h-full min-h-0 pl-4 text-left overflow-hidden"
          >
            {(inspectorContent || isWritingProse || activeContent) && (
              <div className="shrink-0 max-h-[50%] min-h-0 overflow-y-auto pr-1">
                {inspectorContent}
                {(isWritingProse || activeContent) && (
                  <ChapterChecks content={activeContent} chapterNum={activeChapterNum} revisionStatus={activeChapter?.revisionStatus} texture={texture} targetWords={targetWordsPerChapter} />
                )}
              </div>
            )}
            {isResumable && !isLoading && onResumeGeneration && (
              <Button onClick={onResumeGeneration} variant="secondary" size="sm" className="shrink-0 w-full !h-7 !py-0 !px-2.5 mt-3 mb-2 inline-flex items-center justify-center">
                Resume Generation
              </Button>
            )}
            <div className="border-t border-zinc-800 mt-2 pt-3 flex flex-col min-h-[8rem] flex-1 overflow-hidden">
              <div className="shrink-0 flex items-baseline justify-between gap-2 pb-2">
                <h3 className="text-xs font-semibold uppercase text-zinc-500">Agent Inspector</h3>
                <span className="text-xs text-zinc-500">
                  {agentLogs.length} events
                </span>
              </div>

              <div className="shrink-0 min-w-0">
                <div className="flex items-start gap-1.5 min-w-0">
                  {isLoading && <LoadingSpinner className="!mx-0 !mb-0 !mt-0.5 !h-3 !w-3 shrink-0" />}
                  <div className="min-w-0 [&>p]:normal-case [&>p]:whitespace-normal [&>p]:break-words [&>p]:leading-relaxed">
                <ProgressBar
                  currentStep={currentStep}
                  developmentLabel={developmentLabel}
                  currentChapterProcessing={currentChapterProcessing}
                  totalChaptersToProcess={totalChaptersToProcess}
                />
                  </div>
                </div>

              {isLoading && (
                <div className="flex justify-end mt-1.5 text-zinc-400 text-xs leading-relaxed">
                  <RunClock agentLogs={agentLogs} isLoading={isLoading} className="min-w-0 text-right whitespace-normal tabular-nums" />
                </div>
              )}
              </div>

              <div className="shrink-0 mt-2 flex flex-col gap-2" aria-label="Total token usage" title="Project totals, including writer, editor and reported retries. ~ marks an estimate; older calls without usage may be missing.">
                {(['input','output'] as const).map(direction=><div key={direction} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="uppercase text-zinc-500">{direction} tokens</span>
                  <span className="text-zinc-300 tabular-nums text-right">{tokenTotals?.calls ? `${tokenTotals[direction==='input'?'estimatedInput':'estimatedOutput']?'~ ':''}${tokenTotals[direction].toLocaleString('en-US')}`:'—'}</span>
                </div>)}
              </div>

              {/* Quick Agent Status Telemetry */}
              <div className="shrink-0 flex flex-col gap-2 mt-3 pb-3 border-b border-zinc-800">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-xs font-semibold uppercase text-zinc-500">Pipeline</div>
                  <div className="text-xs text-zinc-300 flex items-center justify-end gap-1.5 text-right">
                    <span className={`w-1.5 h-1.5 rounded-full ${isLoading && currentStep !== GenerationStep.Error && currentStep !== GenerationStep.Done ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`} />
                    {currentStep === GenerationStep.Error ? 'Stopped' : currentStep === GenerationStep.Done ? 'Complete' : isLoading ? 'Active' : 'Idle'}
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-xs font-semibold uppercase text-zinc-500">Target</div>
                  <div className="text-xs text-zinc-300 text-right tabular-nums">
                    Ch #{currentChapterProcessing || 1}
                  </div>
                </div>
              </div>

              {/* Full Agent Activity Log */}
              {agentLogs.length > 0 ? (
                <div className="flex-1 min-h-0 overflow-y-auto mt-3 pr-1">
                  <AgentActivityLog logs={agentLogs} />
                </div>
              ) : (
                <div className="pt-3 text-zinc-500 text-xs">
                  <span>Awaiting agent telemetry...</span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ThreeZoneGenerationView;
