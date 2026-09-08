


import React, { useEffect } from 'react';
import useBookGenerator from './hooks/useBookGenerator';
import { GenerationStep } from './types';
import ManuscriptRevision from './components/ManuscriptRevision';
import UserInput from './components/UserInput';
import BookDisplay from './components/BookDisplay';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import ApprovalView from './components/ApprovalView';
import AgentActivityLog from './components/AgentActivityLog';
import ThreeZoneGenerationView from './components/ThreeZoneGenerationView';
import { installConsoleBridge, logToTerminal } from './utils/terminalLogger';

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
    regenerateOutline,
    isLoading,
    currentStep,
    error,
    finalBookContent,
    finalMetadataJson,
    generatedChapters,
    currentChapterProcessing,
    totalChaptersToProcess,
    resetGenerator,
    currentStoryOutline,
    setCurrentStoryOutline,
    currentChapterPlan,
    isResumable,
    agentLogs,
    lastSavedAt,
    reviseChapter,
  } = useBookGenerator();

  useEffect(() => {
    installConsoleBridge();
    logToTerminal('Client interface connected & ready', 'System', 'info');
  }, []);


  const handleStartGeneration = () => {
    if (storyPremise && numChapters >= 3) {
      startGeneration(storyPremise, numChapters);
    } else if (isResumable) {
      // For resuming, premise and chapters are already in state
      startGeneration(storyPremise, numChapters);
    } else {
      // Basic validation feedback, can be improved
      alert("Please provide a story premise and at least 3 chapters.");
    }
  };
  
  const handleContinue = () => {
    continueGeneration();
  };

  const handleRegenerateOutline = () => {
    regenerateOutline();
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

  return (
    <div className={`w-full bg-zinc-950 text-zinc-200 flex flex-col items-center selection:bg-zinc-700 selection:text-white ${isStudioLayout ? 'h-screen max-h-screen overflow-hidden p-2 md:p-3' : 'min-h-screen p-4 md:p-8'}`}>
      {!isStudioLayout && (
      <header className="w-full max-w-4xl mb-6 px-4 md:px-8 transition-all duration-300">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl md:text-3xl font-semibold text-zinc-100 tracking-tight">
              NovelGenerator
            </h1>
            <span className="inline-flex items-center px-1.5 py-0 rounded-sm bg-zinc-800 text-zinc-500 border border-zinc-700 font-mono text-[10px]">
              v4.2
            </span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            title="Wipe all temporary generation state and start from clean slate"
            className="text-xs font-mono px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-sm transition-colors"
          >
            Clean Slate
          </button>
        </div>
        <p className="text-zinc-500 text-xs md:text-sm text-left">
          From an approved outline to a reviewed manuscript in your voice.
        </p>
      </header>
      )}

      <main className={`w-full ${isStudioLayout ? 'max-w-[1920px] flex-1 min-h-0 flex flex-col p-3 md:p-4 overflow-hidden' : 'max-w-4xl p-4 md:p-8'} animate-fade-in transition-all duration-300`}>
        {error && (
          <div className="mb-4 p-4 bg-red-950/40 border border-red-900/60 text-red-300 rounded-sm text-sm">
            <p className="font-semibold mb-1">Error:</p>
            <p className="whitespace-pre-wrap">{error}</p>
            {isResumable && <button onClick={handleContinue} disabled={isLoading} className="mt-3 mr-3 underline">Retry from checkpoint</button>}

            <button
              onClick={handleReset}
              className="mt-3 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-sm text-xs transition-colors"
            >
              Start a new book
            </button>
          </div>
        )}

        {(() => {
          console.log('[App] Checking Idle condition:', currentStep === GenerationStep.Idle, !finalBookContent, !isResumable);
          return currentStep === GenerationStep.Idle && !finalBookContent && !isResumable;
        })() &&(
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
        
        {(() => {
          const shouldShow = currentStep === GenerationStep.GeneratingOutline;
          console.log('[App] Checking GeneratingOutline condition:', currentStep === GenerationStep.GeneratingOutline, 'shouldShow:', shouldShow);
          return shouldShow;
        })() && (
          <div className="text-center py-12">
            <LoadingSpinner />
            <p className="mt-4 text-zinc-300 text-sm font-medium">Generating story outline...</p>
            <p className="mt-1 text-zinc-500 text-xs">Formulating narrative arc and chapter milestones</p>
          </div>
        )}

        {currentStep === GenerationStep.WaitingForOutlineApproval && !isLoading && (
            <ApprovalView
              title="Review & Edit Story Outline"
              content={currentStoryOutline}
              onContentChange={setCurrentStoryOutline}
              onApprove={handleContinue}
              onRegenerate={handleRegenerateOutline}
              isLoading={isLoading}
            />
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
            version="v4.2"
            onReset={handleReset}
          />
        )}


        {!isLoading && finalBookContent && finalMetadataJson && (
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
        {!isLoading && generatedChapters.length > 0 && <div className="shrink-0 max-h-[60vh] overflow-auto"><ManuscriptRevision chapters={generatedChapters} onRevise={reviseChapter} /></div>}
      </main>
      <footer className={`w-full ${isStudioLayout ? 'max-w-[1920px] mt-1 shrink-0 py-0.5' : 'max-w-4xl mt-8'} transition-all duration-300`}>
        <div className="text-center text-zinc-500 text-[10px] font-mono">
          <p>
            &copy; {new Date().getFullYear()}{' '}
            <a 
              href="https://github.com/KazKozDev" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-zinc-200 transition-colors duration-200 underline decoration-dotted"
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