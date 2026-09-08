import { useState, useRef, useEffect } from 'react';
import { type StorySettings, type AgentLogEntry } from '../types';
import { generateText, getStoredProviderConfig } from '../services/llmService';
import { createBookSpec, type NovelRun } from '../utils/novel/contracts';
import { createRun, NovelEngine } from '../utils/novel/engine';
import { BrowserRunStore, type RunStore } from '../utils/novel/runStore';
import { addCandidate, reconcileCheckpoint } from '../utils/novel/storyState';
import { compileBook, displayChapters, generationStep, metadata } from '../utils/novel/presentation';
import { playSuccessSound } from '../utils/soundUtils';
import type { NovelLLM } from '../utils/novel/review';

const DEFAULT_SETTINGS: StorySettings = {
  genre: 'fantasy', narrativeVoice: 'third-limited', tone: 'serious', targetAudience: 'adult',
  writingStyle: 'descriptive', language: 'English', tense: 'past',
  ending: 'closed', targetWordsPerChapter: 4000, writingMode: 'slots',
};

/** React presents snapshots; the engine owns execution state and durable transactions. */
export default function useBookGenerator() {
  const [storyPremise, setStoryPremise] = useState('');
  const [numChapters, setNumChapters] = useState(3);
  const [storySettings, setStorySettings] = useState<StorySettings>(DEFAULT_SETTINGS);
  const [snapshot, setSnapshot] = useState<NovelRun>();
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  const runRef = useRef<NovelRun | undefined>(undefined);
  const storeRef = useRef<RunStore>(new BrowserRunStore());
  const epoch = useRef(0);
  const busy = useRef(false);

  function update(run: NovelRun) { setSnapshot(structuredClone(run)); }

  useEffect(() => {
    if (busy.current) return; // Hot reload must not replace the running engine with an older checkpoint.
    let mounted = true;
    const restoreEpoch = epoch.current;
    const restore = async () => {
      try {
        let run = await storeRef.current.load();
        if (!run) {
          const legacyText = localStorage.getItem('novelGeneratorState');
          if (legacyText) {
            const legacy = JSON.parse(legacyText);
            if (legacy.storyPremise && legacy.currentStoryOutline) {
              run = createRun(createBookSpec(legacy.storyPremise, legacy.numChapters || 3, legacy.storySettings || DEFAULT_SETTINGS), getStoredProviderConfig());
              run.outline = legacy.currentStoryOutline;
              run.importedDrafts = (legacy.generatedChapters || []).map((chapter: { content?: string }) => chapter.content || '');
              if (run.importedDrafts.some(Boolean)) run.stage = 'planning';
              await storeRef.current.save(run);
            }
          }
        }
        if (!mounted || epoch.current !== restoreEpoch) return;
        if (run) {
          if (reconcileCheckpoint(run)) await storeRef.current.save(run);
          runRef.current = run;
          update(run);
          setStoryPremise(run.spec.premise);
          setNumChapters(run.spec.chapterCount);
          setStorySettings(run.spec);
          setError(run.error || null);
        }
      } catch (err) {
        if (mounted) setError(`Could not restore the manuscript: ${String(err)}. Existing data has not been deleted.`);
      } finally { if (mounted) setIsRestoring(false); }
    };
    void restore();
    return () => { mounted = false; };
  }, []);

  function makeEngine(run: NovelRun, token: number) {
    const checkActive = () => { if (epoch.current !== token) throw new Error('This run was cancelled.'); };
    const llm: NovelLLM = async (prompt, system, options = {}) => {
      checkActive();
      const start = Date.now();
      let success = false;
      let result = '';
      setAgentLogs(previous => [...previous, { timestamp: start, chapterNumber: run.chapters.find(chapter => chapter.status !== 'accepted')?.number || 0, type: 'execution', message: system }]);
      try {
        const provider = options.route === 'validator' && run.validationProvider ? run.validationProvider : run.provider;
        result = await generateText(prompt, system, options.schema, options.temperature ?? 0.4, undefined, undefined, provider, options.maxTokens, options.json);
        checkActive();
        success = true;
        return result;
      } finally {
        run.calls ||= [];
        run.calls.push({ purpose: system, durationMs: Date.now() - start, inputCharacters: prompt.length + system.length, outputCharacters: result.length, success });
      }
    };
    const scopedStore: RunStore = {
      load: () => storeRef.current.load(),
      clear: async () => { checkActive(); await storeRef.current.clear(); },
      save: async state => { checkActive(); await storeRef.current.save(state); },
    };
    return new NovelEngine(llm, scopedStore, state => { checkActive(); update(state); });
  }

  async function execute(action: (run: NovelRun, engine: NovelEngine) => Promise<void>) {
    if (busy.current || isRestoring || !runRef.current) return;
    busy.current = true;
    const token = epoch.current;
    const run = runRef.current;
    setIsLoading(true);
    setError(null);
    if (run.stage === 'needs_revision') {
      run.stage = run.resumeStage || 'writing';
      update(run);
    }
    try {
      await action(run, makeEngine(run, token));
      if (epoch.current === token && run.stage === 'complete') playSuccessSound();
    } catch (err) {
      if (epoch.current === token) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (epoch.current === token) { busy.current = false; setIsLoading(false); update(run); }
    }
  }

  async function startGeneration(premise: string, count: number) {
    if (busy.current || isRestoring) return;
    if (runRef.current) return continueGeneration();
    try {
      const run = createRun(createBookSpec(premise, count, storySettings), getStoredProviderConfig());
      runRef.current = run;
      update(run);
      await execute(async (state, engine) => { await storeRef.current.save(state); await engine.outline(state); });
    } catch (err) { setError(String(err)); }
  }

  async function continueGeneration() {
    await execute(async (run, engine) => {
      if (!run.outline.trim()) await engine.outline(run);
      else await engine.continue(run);
    });
  }

  async function regenerateOutline() {
    if (runRef.current?.stage !== 'outline') return;
    await execute((run, engine) => engine.outline(run));
  }

  function setCurrentStoryOutline(outline: string) {
    const run = runRef.current;
    if (!run || busy.current || run.stage !== 'outline') return;
    run.outline = outline;
    run.updatedAt = Date.now();
    update(run);
    void storeRef.current.save(run).catch(err => setError(`Outline was not saved: ${String(err)}`));
  }

  async function reviseChapter(number: number, content: string) {
    if (busy.current || !runRef.current || !content.trim()) return;
    const run = runRef.current;
    const chapter = run.chapters[number - 1];
    if (!chapter) return;
    addCandidate(chapter, content, 'Author revision');
    chapter.status = 'needs_revision';
    chapter.repairAttempts = 0;
    run.structuralAttempts = 0;
    run.finalAttempts = 0;
    run.stage = 'writing';
    run.error = undefined;
    run.finalReview = undefined;
    run.updatedAt = Date.now();
    try { await storeRef.current.save(run); update(run); await continueGeneration(); }
    catch (err) { setError(String(err)); }
  }

  async function resetGenerator() {
    epoch.current++;
    busy.current = false;
    setIsLoading(false);
    runRef.current = undefined;
    setSnapshot(undefined);
    setStoryPremise('');
    setNumChapters(3);
    setAgentLogs([]);
    setError(null);
    try { await storeRef.current.clear(); localStorage.removeItem('novelGeneratorState'); }
    catch (err) { setError(`Could not reset the saved manuscript: ${String(err)}`); }
  }

  const generatedChapters = displayChapters(snapshot);
  const complete = snapshot?.stage === 'complete';
  return {
    storyPremise, setStoryPremise, numChapters, setNumChapters, storySettings, setStorySettings,
    isLoading: isLoading || isRestoring, currentStep: generationStep(snapshot, isLoading), error,
    isResumable: Boolean(snapshot && !complete && snapshot.stage !== 'outline' && !isLoading),
    startGeneration, continueGeneration, regenerateOutline, resetGenerator, reviseChapter,
    finalBookContent: complete ? compileBook(snapshot) : null,
    finalMetadataJson: complete ? metadata(snapshot) : null,
    generatedChapters,
    currentChapterProcessing: snapshot?.chapters.find(chapter => chapter.status !== 'accepted')?.number || 0,
    totalChaptersToProcess: snapshot?.spec.chapterCount || numChapters,
    currentStoryOutline: snapshot?.outline || '', setCurrentStoryOutline,
    currentChapterPlan: snapshot?.blueprint ? JSON.stringify(snapshot.blueprint, null, 2) : '',
    agentLogs, lastSavedAt: snapshot?.updatedAt,
  };
}
