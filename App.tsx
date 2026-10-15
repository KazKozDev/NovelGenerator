


import React, { useEffect } from 'react';
import { assembleManuscript } from './utils/novel/manuscript';
import { MIN_CHAPTERS, MAX_CHAPTERS } from './constants';
import useBookGenerator, { splitError } from './hooks/useBookGenerator';
import { GenerationStep } from './types';
import UserInput from './components/UserInput';
import ThemeToggle from './components/ThemeToggle';
import SystemManualToggle from './components/SystemManualModal';
import ApiKeysToggle from './components/ApiKeysModal';
import BookDisplay from './components/BookDisplay';
import { ImprintData } from './components/BookCoverUpload';
import SaveBook from './components/SaveBook';

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
    bookTitleInput,
    setBookTitleInput,
    startGeneration,
    continueGeneration,
    editBook,
    isEditorialRunning,
    updateManualManuscript,
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
    deskTools,
    deskNow,
    developmentLabel,
    isResumable,
    agentLogs,
    liveDraft,
    tokenTotals,
    lastSavedAt, autosaveStatus,
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
    if (storyPremise && numChapters >= MIN_CHAPTERS && numChapters <= MAX_CHAPTERS) {
      startGeneration(storyPremise, numChapters, bookTitleInput);
    } else {
      // Basic validation feedback, can be improved
      alert(`Please provide a story premise and between ${MIN_CHAPTERS} and ${MAX_CHAPTERS} chapters.`);
    }
  };

  const handleContinue = () => {
    continueGeneration();
  };

  const handleReset = () => {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const confirmed = window.confirm('Reset this project? All progress and manuscript text will be lost.');
      if (!confirmed) return;
    }
    resetGenerator();
  };

  const showProgress = (isLoading && !isEditorialRunning) || (isResumable && currentStep !== GenerationStep.Done);

  const isStudioLayout = showProgress;

  const [authorName, setAuthorName] = React.useState<string>(() => {
    try {
      return localStorage.getItem('novel_author_name') || '';
    } catch {
      return '';
    }
  });

  const handleAuthorChange = React.useCallback((newAuthor: string) => {
    setAuthorName(newAuthor);
    try {
      localStorage.setItem('novel_author_name', newAuthor);
    } catch {
      // ignore
    }
  }, []);

  const [imprintData, setImprintData] = React.useState<ImprintData | undefined>(() => {
    try {
      const saved = localStorage.getItem('novel_imprint_global');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return undefined;
  });

  const [coverImageUrl, setCoverImageUrl] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem('novel_cover_image') || null;
    } catch {
      return null;
    }
  });

  const handleImprintChange = React.useCallback((newImprint: ImprintData) => {
    setImprintData(newImprint);
    try {
      localStorage.setItem('novel_imprint_global', JSON.stringify(newImprint));
    } catch {
      // ignore
    }
  }, []);

  // The metadata document runs to hundreds of kilobytes on a finished book, and this parsed it on every
  // render — twice over, since BookDisplay parses it too and its memo missed on a string rebuilt each
  // time. Parsed once per document now.
  const savedMetadata = React.useMemo(() => {
    try {
      const parsed = finalMetadataJson ? JSON.parse(finalMetadataJson) : {};
      if (authorName.trim()) {
        parsed.author = authorName.trim();
      }
      if (imprintData) {
        parsed.imprint = imprintData;
      }
      if (coverImageUrl) {
        parsed.coverImage = coverImageUrl;
      }
      return parsed;
    } catch {
      const base: Record<string, unknown> = {};
      if (authorName.trim()) base.author = authorName.trim();
      if (imprintData) base.imprint = imprintData;
      if (coverImageUrl) base.coverImage = coverImageUrl;
      return base;
    }
  }, [finalMetadataJson, authorName, imprintData, coverImageUrl]);
  const saveControl = finalBookContent ? (
    <SaveBook content={finalBookContent} metadata={savedMetadata} onExportProject={exportProject} />
  ) : generatedChapters.some(chapter => chapter.content.trim()) ? (
    <SaveBook draft content={assembleManuscript(generatedChapters.map((chapter, index) => ({ chapter: index + 1, text: chapter.content })).filter(c => c.text.trim()), 'Manuscript — Draft')} onExportProject={exportProject} />
  ) : null;

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      importProject(file).catch(err =>
        alert(`Import failed: ${err instanceof Error ? err.message : err}`)
      );
    }
  };

  const loadProjectButton = (
    <label
      title="Load project from backup (.project.json)"
      className="inline-flex shrink-0 items-center justify-center h-7 text-xs px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded cursor-pointer transition-colors"
    >
      Load Project
      <input
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileImport}
      />
    </label>
  );

  const errorPanel = error ? (
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
              {(!isStudioLayout || !isResumable) && (
                <button onClick={handleContinue} disabled={isLoading} className="underline">Continue where it stopped, with current models</button>
              )}
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
        ) : null;

  const isMainPage = currentStep === GenerationStep.Idle && !finalBookContent;

  return (
    <div className={`app-shell w-full bg-zinc-950 text-zinc-300 flex flex-col items-center selection:bg-zinc-700 selection:text-white ${isStudioLayout ? 'studio-viewport h-screen max-h-screen overflow-hidden p-2 md:p-3' : 'min-h-screen p-4 md:p-8'}`}>
      {!isStudioLayout && (
      <header className={`w-full ${finalBookContent ? 'max-w-[1700px]' : 'max-w-4xl'} mb-6 px-4 md:px-8 transition-all duration-300`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold wordmark">
              NovelGenerator
            </h1>
            {isMainPage && (
              <p className="text-xs text-zinc-500 mt-1">
                Write a novel before your coffee gets cold
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 ml-auto" aria-label="Project and appearance controls">
            {loadProjectButton}

            <button
              type="button"
              onClick={handleReset}
              title="Wipe state and start a new book"
              className="inline-flex shrink-0 items-center justify-center h-7 text-xs px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors"
            >
              Reset Project
            </button>

            {saveControl}

            <span className="w-px h-4 bg-zinc-800 mx-1 hidden sm:inline-block" aria-hidden="true" />

            <div className="flex shrink-0 items-center gap-1.5" aria-label="Appearance and help">
              <ThemeToggle />
              <ApiKeysToggle />
              <SystemManualToggle />
            </div>
          </div>
        </div>
      </header>
      )}

      <main className={`w-full ${isStudioLayout ? 'studio-main max-w-[1920px] flex-1 min-h-0 flex flex-col p-3 md:p-4 overflow-hidden' : (finalBookContent ? 'max-w-[1700px] p-4 md:p-6' : 'max-w-4xl p-4 md:p-8')} animate-fade-in transition-all duration-300`}>
        {!showProgress && errorPanel}

        {currentStep === GenerationStep.Idle && !finalBookContent && isResumable && !showProgress && (
          <div className="border border-zinc-800 bg-zinc-900/40 rounded p-4 md:p-5 text-sm text-zinc-300 space-y-3">
            <div>
              <p className="font-medium text-zinc-200">Unfinished book found: {generatedChapters.length} of {totalChaptersToProcess} chapters written.</p>
              <p className="text-xs text-zinc-500 mt-1">Finished chapters keep their manuscript and memory; the run continues where it stopped.</p>
            </div>
            <label className="block text-xs font-medium text-zinc-300">Target words per chapter
              <input
                type="number"
                min="1"
                step="1"
                value={storySettings.targetWordsPerChapter || 4000}
                onChange={event => {
                  const value = Number(event.target.value);
                  if (Number.isSafeInteger(value) && value > 0) {
                    setStorySettings({ ...storySettings, targetWordsPerChapter: value });
                  }
                }}
                className="block mt-1.5 h-9 px-3 rounded border border-zinc-800 bg-zinc-950 text-xs text-zinc-200 hover:border-zinc-700 focus:border-zinc-500 focus:outline-none transition-colors"
              />
            </label>
            <div className="pt-1 flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleContinue}
                disabled={isLoading}
                className="h-8 px-3.5 bg-zinc-100 hover:bg-white text-zinc-900 rounded text-xs font-medium transition-colors disabled:opacity-50"
              >
                Continue writing
              </button>
              <button
                onClick={handleReset}
                className="h-8 px-3.5 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 rounded text-xs text-zinc-300 transition-colors"
              >
                Discard and start new
              </button>
              <label className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-auto">
                Restore backup (.project.json)
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleFileImport}
                />
              </label>
            </div>
          </div>
        )}

        {currentStep === GenerationStep.Idle && !finalBookContent && !storeReady && (
          <p className="text-zinc-500 text-xs">Opening project storage…</p>
        )}

        {currentStep === GenerationStep.Idle && !finalBookContent && !isResumable && storeReady && (
          <UserInput
            bookTitle={bookTitleInput}
            setBookTitle={setBookTitleInput}
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
        )}
        


        {showProgress && (
          <ThreeZoneGenerationView
            targetWordsPerChapter={storySettings.targetWordsPerChapter}
            inspectorContent={errorPanel}
            currentStep={currentStep}
            currentChapterProcessing={currentChapterProcessing}
            totalChaptersToProcess={totalChaptersToProcess}
            currentStoryOutline={currentStoryOutline}
            currentChapterPlan={currentChapterPlan}
            tools={deskTools}
            toolFocus={deskNow}
            developmentLabel={developmentLabel}
            generatedChapters={generatedChapters}
            agentLogs={agentLogs}
            liveDraft={liveDraft}
            tokenTotals={tokenTotals}
            lastSavedAt={lastSavedAt} autosaveStatus={autosaveStatus}
            isResumable={isResumable}
            isLoading={isLoading}
            onResumeGeneration={handleContinue}
            headerActions={<>{loadProjectButton}{saveControl}</>}
            onReset={handleReset}
          />
        )}


        {finalBookContent && finalMetadataJson && (
          <>
            <BookDisplay
              bookContent={finalBookContent}
              metadataJson={finalMetadataJson}
              onReset={handleReset}
              onEdit={editBook}
              isEditorialRunning={isEditorialRunning}
              editorialStatus={developmentLabel}
              onManualSave={updateManualManuscript}
              author={authorName}
              onAuthorChange={handleAuthorChange}
              imprint={imprintData}
              onImprintChange={handleImprintChange}
              coverImage={coverImageUrl}
              onCoverChange={setCoverImageUrl}
            />
            
            {/* Show agent logs after completion too */}
            {agentLogs.length > 0 && (
              <AgentActivityLog logs={agentLogs} />
            )}
          </>
        )}

      </main>
    </div>
  );
};

export default App;
