


import React from 'react';
import useBookGenerator from './hooks/useBookGenerator';
import { GenerationStep } from './types';
import UserInput from './components/UserInput';
import ProgressBar from './components/ProgressBar';
import BookDisplay from './components/BookDisplay';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { Button } from './components/common/Button';
import ApprovalView from './components/ApprovalView';
import StreamingContentView from './components/StreamingContentView';
import AgentActivityLog from './components/AgentActivityLog';
import FeatureGrid from './components/FeatureGrid';

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
  } = useBookGenerator();

  // Debug logging
  console.log('🎨 App render - currentStep:', currentStep, 'isLoading:', isLoading);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-sky-900 text-slate-100 flex flex-col items-center p-4 md:p-8 selection:bg-sky-500 selection:text-white">
      <header className="w-full max-w-4xl mb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-teal-400 py-2">
            NovelGenerator
          </h1>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg animate-pulse">
            v4.0
          </span>
        </div>
        <p className="text-slate-400 mt-2 text-sm md:text-base">
          Become an author. Before your coffee gets cold. <br />Turn ideas into books. With one prompt.
        </p>
      </header>

      <main className="w-full max-w-4xl bg-slate-800 shadow-2xl rounded-lg p-6 md:p-8 animate-fade-in">
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
          console.log('🔍 Checking Idle condition:', currentStep === GenerationStep.Idle, !finalBookContent, !isResumable);
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
              onSubmit={handleStartGeneration}
              isLoading={isLoading}
            />
            <div className="mt-8">
              <FeatureGrid />
            </div>
          </>
        )}
        
        {(() => {
          const shouldShow = currentStep === GenerationStep.GeneratingOutline && isLoading;
          console.log('🔍 Checking GeneratingOutline condition:', currentStep === GenerationStep.GeneratingOutline, isLoading, 'shouldShow:', shouldShow);
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
           <div className="text-center">
            {isLoading && <LoadingSpinner />}
            
            {isResumable && !isLoading && (
              <div className="my-6 p-4 border border-sky-700 bg-sky-900/30 rounded-md">
                  <p className="text-lg text-sky-300 mb-4">You have a book in progress.</p>
                  <Button onClick={handleStartGeneration} variant="primary">
                      Resume Generation
                  </Button>
              </div>
            )}
            
            <ProgressBar
              currentStep={currentStep}
              currentChapterProcessing={currentChapterProcessing}
              totalChaptersToProcess={totalChaptersToProcess}
            />
            
            {currentStep === GenerationStep.GeneratingChapters && generatedChapters.length > 0 && currentChapterProcessing > 0 ? (
                <StreamingContentView
                    title={`Writing Chapter ${currentChapterProcessing}: ${generatedChapters[currentChapterProcessing - 1]?.title || '...'}`}
                    content={generatedChapters[currentChapterProcessing - 1]?.content || ''}
                />
            ) : (
              <>
                {currentStoryOutline && (
                  <div className="mt-4 p-4 bg-slate-700 rounded-md max-h-60 overflow-y-auto text-left">
                    <h3 className="font-semibold mb-2 text-sky-400">Story Outline (In Progress):</h3>
                    <pre className="whitespace-pre-wrap text-sm text-slate-300">{currentStoryOutline.slice(0,1000)}...</pre>
                  </div>
                )}
                {currentChapterPlan && (
                  <div className="mt-4 p-4 bg-slate-700 rounded-md max-h-60 overflow-y-auto text-left">
                    <h3 className="font-semibold mb-2 text-sky-400">Chapter Plan (In Progress):</h3>
                    <pre className="whitespace-pre-wrap text-sm text-slate-300">{currentChapterPlan.slice(0,1000)}...</pre>
                  </div>
                )}
                {generatedChapters.length > 0 && (
                  <div className="mt-4 p-4 bg-slate-700 rounded-md max-h-60 overflow-y-auto text-left">
                    <h3 className="font-semibold mb-2 text-sky-400">Generated Chapters Progress:</h3>
                    <ul className="list-disc list-inside text-sm text-slate-300">
                      {generatedChapters.map((ch, idx) => (
                        <li key={idx}>Chapter {idx + 1}: {ch.title || `Generating...`} ({(ch.content?.length || 0) > 0 ? 'Content generated' : 'Pending'})</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {/* Agent Activity Log */}
            {agentLogs.length > 0 && (
              <AgentActivityLog logs={agentLogs} />
            )}
          </div>
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
      <footer className="w-full max-w-4xl mt-8">
        <div className="text-center text-slate-500 text-xs">
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