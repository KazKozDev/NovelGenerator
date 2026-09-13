


import React, { useEffect } from 'react';
import useBookGenerator, { splitError } from './hooks/useBookGenerator';
import { GenerationStep } from './types';
import UserInput from './components/UserInput';
import ThemeToggle from './components/ThemeToggle';
import SystemManualToggle from './components/SystemManualModal';
import BookDisplay from './components/BookDisplay';
import SaveBook from './components/SaveBook';
import { LoadingSpinner } from './components/common/LoadingSpinner';

import AgentActivityLog from './components/AgentActivityLog';
import ThreeZoneGenerationView from './components/ThreeZoneGenerationView';
import { installConsoleBridge, logToTerminal, watchMainThreadStalls } from './utils/terminalLogger';

const App: React.FC = () => {
  const {
    storyPremise,
    setStoryPremise,
    numChapters,
    setNumChapters,
    storySettings,
    setStorySettings,
    startGeneration,
    continueGeneration,
    isLoading,
    currentStep,
    error,
    finalBookContent,
    finalMetadataJson,
    generatedChapters,
    currentChapterProcessing,
    totalChaptersToProcess,
    resetGenerator,
    editSettings,
    currentStoryOutline,
    currentChapterPlan,
    isResumable,
    agentLogs,
    lastSavedAt,
    exportProject,
    importProject,
    storeReady,
  } = useBookGenerator();

  const hasConnectedRef = React.useRef(false);
  // What the application is doing, readable from outside a render. The stall watch reports the step a
  // block happened during, and a ref is the only way to read the current one from a listener that
  // outlives the render it was installed in.
  const doingRef = React.useRef('starting up');
  doingRef.current = `${currentStep}${currentChapterProcessing ? ` · chapter ${currentChapterProcessing}` : ''}${isLoading ? '' : ' · idle'}`;

  useEffect(() => {
    installConsoleBridge();
    if (!hasConnectedRef.current) {
      hasConnectedRef.current = true;
      logToTerminal('Client interface connected & ready', 'System', 'info');
    }
    const watch = watchMainThreadStalls(() => doingRef.current);
    return () => watch.stop();
  }, []);


  const handleStartGeneration = () => {
    if (!storeReady) return;
    if (storyPremise && numChapters >= 3) {
      startGeneration(storyPremise, numChapters);
    } else {
      // Basic validation feedback, can be improved
      alert("Please provide a story premise and at least 3 chapters.");
    }
  };

  const handleContinue = () => {
    continueGeneration();
  };

  const handleReset = () => {
    resetGenerator();
  };

  const showProgress = (isLoading || isResumable) && 
                       currentStep !== GenerationStep.Idle && 
                       currentStep !== GenerationStep.Done &&
                       currentStep !== GenerationStep.Error &&
                       currentStep !== GenerationStep.WaitingForOutlineApproval &&
                       currentStep !== GenerationStep.GeneratingOutline;

  const isStudioLayout = showProgress;

  // The metadata document runs to hundreds of kilobytes on a finished book, and this parsed it on every
  // render — twice over, since BookDisplay parses it too and its memo missed on a string rebuilt each
  // time. Parsed once per document now.
  const savedMetadata = React.useMemo(() => {
    try { return finalMetadataJson ? JSON.parse(finalMetadataJson) : {}; } catch { return {}; }
  }, [finalMetadataJson]);
  const saveControl = finalBookContent ? (
    <SaveBook content={finalBookContent} metadata={savedMetadata} />
  ) : generatedChapters.some(chapter => chapter.content.trim()) ? (
    <SaveBook draft content={'# Manuscript — Draft\n\n' + generatedChapters.map((chapter, index) => chapter.content.trim() ? `## Chapter ${index + 1}: ${chapter.title}\n\n${chapter.content}` : '').filter(Boolean).join('\n\n')} />
  ) : null;

  return (
    <div className={`w-full bg-zinc-950 text-zinc-300 flex flex-col items-center selection:bg-zinc-700 selection:text-white ${isStudioLayout ? 'h-screen max-h-screen overflow-hidden p-2 md:p-3' : 'min-h-screen p-4 md:p-8'}`}>
      {!isStudioLayout && (
      <header className="w-full max-w-4xl mb-6 px-4 md:px-8 transition-all duration-300">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1.5">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-semibold wordmark">
              NovelGenerator
            </h1>
            <span className="font-mono text-xs text-zinc-500">v4.2</span>
          </div>
          <div className="flex items-center gap-3">
          <ThemeToggle />
          <SystemManualToggle />
          {saveControl}
          <button
            type="button"
            onClick={exportProject}
            title="Download the whole project slot (§10): design, plans, scenes, memory, manuscript, report"
            className="h-7 text-xs px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300 rounded transition-colors"
          >
            Export project
          </button>
          <label
            title="Restore a project from an exported .project.json file"
            className="h-7 text-xs px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300 rounded transition-colors cursor-pointer"
          >
            Import project
            <input type="file" accept=".json,application/json" className="hidden" onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) importProject(file).catch(err => alert(`Import failed: ${err instanceof Error ? err.message : err}`));
            }} />
          </label>
          <button
            type="button"
            onClick={handleReset}
            title="Wipe all temporary generation state and start from clean slate"
            className="h-7 text-xs px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300 rounded transition-colors"
          >
            Clean Slate
          </button>
          </div>
        </div>
        <p className="text-zinc-500 text-xs  text-left">
          A finished story before your coffee gets cold.
        </p>
      </header>
      )}

      <main className={`w-full ${isStudioLayout ? 'max-w-[1920px] flex-1 min-h-0 flex flex-col p-3 md:p-4 overflow-hidden' : 'max-w-4xl p-4 md:p-8'} animate-fade-in transition-all duration-300`}>
        {error && (
          <div className="mb-4 p-4 bg-red-950/40 border border-red-900/60 text-red-300 rounded text-sm">
            <p className="font-semibold mb-1">Error:</p>
            <p className="whitespace-pre-wrap">{splitError(error).headline}</p>
            {splitError(error).detail && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-red-300/80 hover:text-red-200">What the review said</summary>
                <p className="mt-2 whitespace-pre-wrap text-xs text-red-300/90 max-h-64 overflow-y-auto">{splitError(error).detail}</p>
              </details>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button onClick={handleContinue} disabled={isLoading} className="underline">Continue where it stopped, with current models</button>
              {/* A refused design is usually fixed by changing the premise or the
                  editor model. Without this, reaching the form again costs the
                  author everything they typed. */}
              <button
                onClick={editSettings}
                disabled={isLoading}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded text-xs transition-colors"
              >
                Change the premise or models
              </button>
              <button
                onClick={handleReset}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded text-xs transition-colors"
              >
                Start a new book
              </button>
            </div>
          </div>
        )}

        {currentStep === GenerationStep.Idle && !finalBookContent && isResumable && (
          <div className="border border-zinc-800 rounded p-4 md:p-5 text-sm text-zinc-300">
            <p className="font-medium">Unfinished book found: {generatedChapters.length} of {totalChaptersToProcess} chapters written.</p>
            <p className="text-xs text-zinc-500 mt-1">Finished chapters keep their manuscript and memory; the run continues where it stopped.</p>
            <div className="mt-3 flex gap-3">
              <button onClick={handleContinue} disabled={isLoading} className="px-3 py-1 bg-zinc-200 text-zinc-900 rounded text-xs font-medium">Continue writing</button>
              <button onClick={handleReset} className="px-3 py-1 border border-zinc-700 rounded text-xs">Discard and start new</button>
            </div>
          </div>
        )}

        {currentStep === GenerationStep.Idle && !finalBookContent && !storeReady && (
          <p className="text-zinc-500 text-xs">Opening project storage…</p>
        )}

        {currentStep === GenerationStep.Idle && !finalBookContent && !isResumable && storeReady && (
          <>
            <UserInput
              storyPremise={storyPremise}
              setStoryPremise={setStoryPremise}
              numChapters={numChapters}
              setNumChapters={setNumChapters}
              genre={storySettings.genre || 'fantasy'}
              setGenre={(genre) => setStorySettings({ ...storySettings, genre })}
              storySettings={storySettings}
              setStorySettings={setStorySettings}
              onSubmit={handleStartGeneration}
              isLoading={isLoading}
            />

          </>
        )}
        
        {currentStep === GenerationStep.GeneratingOutline && (
          <div className="text-center py-12">
            <LoadingSpinner />
            <p className="mt-4 text-zinc-300 text-sm font-medium">Designing the book...</p>
            <p className="mt-1 text-zinc-500 text-xs">Causal map, characters, chapter plan and construction review</p>
          </div>
        )}


        {showProgress && (
          <ThreeZoneGenerationView
            currentStep={currentStep}
            currentChapterProcessing={currentChapterProcessing}
            totalChaptersToProcess={totalChaptersToProcess}
            currentStoryOutline={currentStoryOutline}
            currentChapterPlan={currentChapterPlan}
            generatedChapters={generatedChapters}
            agentLogs={agentLogs}
            lastSavedAt={lastSavedAt}
            isResumable={isResumable}
            isLoading={isLoading}
            onResumeGeneration={handleStartGeneration}
            headerActions={saveControl}
            version="v4.2"
            onReset={handleReset}
          />
        )}


        {finalBookContent && finalMetadataJson && (
          <>
            <BookDisplay
              bookContent={finalBookContent}
              metadataJson={finalMetadataJson}
              onReset={handleReset}
            />
            
            {/* Show agent logs after completion too */}
            {agentLogs.length > 0 && (
              <AgentActivityLog logs={agentLogs} />
            )}
          </>
        )}

      </main>
      <footer className={`w-full ${isStudioLayout ? 'max-w-[1920px] mt-1 shrink-0 py-0.5' : 'max-w-4xl mt-8'} transition-all duration-300`}>
        <div className="text-center text-zinc-500 text-xs">
          <p>
            &copy; {new Date().getFullYear()}{' '}
            <a 
              href="https://github.com/KazKozDev" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-zinc-300 transition-colors duration-200 underline decoration-dotted"
            >
              KazKozDev
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
