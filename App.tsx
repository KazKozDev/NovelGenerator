


import React from 'react';
import useBookGenerator from './hooks/useBookGenerator';
import { GenerationStep } from './types';
import UserInput from './components/UserInput';
import BookDisplay from './components/BookDisplay';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import ApprovalView from './components/ApprovalView';
import AgentActivityLog from './components/AgentActivityLog';
import ThreeZoneGenerationView from './components/ThreeZoneGenerationView';

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
  } = useBookGenerator();

  // Debug logging
  console.log('[App] render - currentStep:', currentStep, 'isLoading:', isLoading);

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
                       currentStep !== GenerationStep.WaitingForOutlineApproval;

  const isStudioLayout = showProgress;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-sky-900 text-slate-100 flex flex-col items-center p-4 md:p-8 selection:bg-sky-500 selection:text-white">
      <header className={`w-full ${isStudioLayout ? 'max-w-[1800px]' : 'max-w-4xl'} mb-8 text-center transition-all duration-300`}>
        <div className="flex items-center justify-center gap-3 mb-2">
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-teal-400 py-2">
            NovelGenerator
          </h1>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg animate-pulse">
            v4.1
          </span>
        </div>
        <p className="text-slate-400 mt-2 text-sm md:text-base">
          Become an author. Before your coffee gets cold. <br />Turn ideas into books. With one prompt.
        </p>
      </header>

      <main className={`w-full ${isStudioLayout ? 'max-w-[1800px]' : 'max-w-4xl'} bg-slate-800 shadow-2xl rounded-2xl p-4 md:p-8 animate-fade-in transition-all duration-300`}>
        {error && (
          <div className="mb-4 p-4 bg-red-700 border border-red-500 text-white rounded-md">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
            <button
              onClick={handleReset}
              className="mt-2 px-3 py-1 bg-red-500 hover:bg-red-400 rounded text-sm"
            >
              Try Again
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
              generationSpeedMode={storySettings.generationSpeedMode || 'fast'}
              setGenerationSpeedMode={(generationSpeedMode) => setStorySettings({ ...storySettings, generationSpeedMode })}
              onSubmit={handleStartGeneration}
              isLoading={isLoading}
            />
            <div className="mt-12 border-t border-slate-700 pt-6">
              <p className="text-[10px] text-slate-500 mb-4 text-left leading-relaxed">
                * Time to create: Several minutes to several hours, depending on length. Each chapter receives multiple AI passes for professional quality. Patience creates perfection.
              </p>
              <p className="text-[10px] text-slate-500 mb-2 text-left">** Technical Process:</p>
              <div className="text-[10px] text-slate-500 leading-relaxed text-left space-y-1">
                <p>Specialist Coordination: Three LLM agents (Structure, Character, Scene) work sequentially, each receiving full context and previous outputs.</p>
                <p>Slot-Based Architecture: Structure agent creates prose framework with embedded slots, specialists fill them with dialogue, action, descriptions.</p>
                <p>Real-Time Validation: Automatic checks for repetition patterns, tone consistency, content balance during generation.</p>
                <p>Persistent Context: Story Context Database tracks character states, plot threads, world facts across all chapters for coherence.</p>
                <p>Synthesis Integration: Advanced merging engine resolves conflicts, generates transitions, performs slot replacement with fallback handling.</p>
                <p>Multi-Pass Refinement: Light polish → repetition fixes → continuity checks → professional polish for publication-ready quality.</p>
              </div>
            </div>
          </>
        )}
        
        {(() => {
          const shouldShow = currentStep === GenerationStep.GeneratingOutline;
          console.log('[App] Checking GeneratingOutline condition:', currentStep === GenerationStep.GeneratingOutline, 'shouldShow:', shouldShow);
          return shouldShow;
        })() && (
          <div className="text-center py-12">
            <LoadingSpinner />
            <p className="mt-4 text-sky-300 text-lg">Generating story outline...</p>
            <p className="mt-2 text-slate-400 text-sm">This may take 10-30 seconds</p>
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
      </main>
      <footer className={`w-full ${isStudioLayout ? 'max-w-[1800px]' : 'max-w-4xl'} mt-8 transition-all duration-300`}>
        <div className="text-center text-slate-500 text-[10px]">
          <p>
            &copy; {new Date().getFullYear()}{' '}
            <a 
              href="https://github.com/KazKozDev" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sky-400 hover:text-sky-300 transition-colors duration-200 underline decoration-dotted"
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