import { useState, useRef, useEffect } from 'react';
import { type StorySettings, type AgentLogEntry, GenerationStep, type ChapterData } from '../types';
import { generateText, getStoredProviderConfig, getStoredValidatorConfig } from '../services/llmService';
import type { NovelLLM } from '../utils/novel/v2/llm';
import { Orchestrator, type ProgressStage } from '../utils/novel/v2/orchestrator';
import { ChapterPipelineV2 } from '../utils/novel/v2/pipeline';
import { downloadJson, restoreSnapshot, snapshotProject } from '../utils/novel/v2/export';
import { PersistentProjectStore } from '../utils/novel/v2/persistent';
import type { ProjectInput } from '../utils/novel/v2/types';
import { playSuccessSound } from '../utils/soundUtils';

const DEFAULT_SETTINGS: StorySettings = {
  genre: 'fantasy', narrativeVoice: 'third-limited', tone: 'serious', targetAudience: 'adult',
  writingStyle: 'descriptive', language: 'English', tense: 'past',
  ending: 'closed', targetWordsPerChapter: 4000,
};

/**
 * What a call is for, in the words a reader of the log would use. v2 prompts
 * name their stage in the first line, so the user prompt — not the shared
 * system contract — is what gets matched.
 */
export function stepName(prompt: string): string {
  const steps: [string, string][] = [
    ['Prepare a compact book construction', 'Designing the book'],
    ['Check whether the provided plan is ready', 'Reviewing the plan'],
    ['Plan only the current chapter', 'Planning the chapter'],
    ['Write a full literary scene', 'Writing a scene'],
    ['Extract the essential changes from the new scene', 'Updating story memory'],
    ['Refine the forward plan', 'Reconciling the plan'],
    ['Check the integrity of the finished book', 'Auditing the finished book'],
  ];
  const matched = steps.find(([key]) => prompt.includes(key));
  return matched ? matched[1] : prompt.slice(0, 60);
}

/** React presents snapshots; the v2 store owns execution state. */
export default function useBookGenerator() {
  const [storyPremise, setStoryPremise] = useState('');
  const [numChapters, setNumChapters] = useState(3);
  const [storySettings, setStorySettings] = useState<StorySettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  const [currentStep, setCurrentStep] = useState<GenerationStep>(GenerationStep.Idle);
  const [currentChapterProcessing, setCurrentChapterProcessing] = useState(0);
  const [generatedChapters, setGeneratedChapters] = useState<ChapterData[]>([]);
  const [finalBookContent, setFinalBookContent] = useState<string | null>(null);
  const [finalMetadataJson, setFinalMetadataJson] = useState<string | null>(null);
  const [currentStoryOutline, setCurrentStoryOutline] = useState('');
  const [currentChapterPlan, setCurrentChapterPlan] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<number | undefined>(undefined);
  const storeRef = useRef<PersistentProjectStore | null>(null);
  const inputRef = useRef<ProjectInput | null>(null);
  const epoch = useRef(0);
  const busy = useRef(false);
  const currentChapterRef = useRef(0);
  const [hasUnfinished, setHasUnfinished] = useState(false);
  const [storeReady, setStoreReady] = useState(false);

  function getStore(): PersistentProjectStore {
    if (!storeRef.current) throw new Error('Project storage is still opening.');
    return storeRef.current;
  }

  function refreshFromStore() {
    const store = getStore();
    const manuscript = store.manuscript();
    setGeneratedChapters(manuscript.map(({ chapter, text }) => ({ title: `Chapter ${chapter}`, content: text })));
    const design = store.loadDesign();
    if (design) {
      setCurrentStoryOutline(
        `Central conflict: ${design.dramatic_core.central_conflict}\nStakes: ${design.dramatic_core.stakes}\nResolution: ${design.ending.central_resolution}`
      );
      setCurrentChapterPlan(JSON.stringify(design.chapter_map, null, 2));
    }
    if (manuscript.length) setLastSavedAt(Date.now());
    const input = store.loadInput();
    setHasUnfinished(!!input && manuscript.length < input.chapter_count);
  }

  function publishFinal() {
    const store = getStore();
    const input = store.loadInput();
    if (!input) return;
    const manuscript = store.manuscript();
    const report = store.loadReport();
    const content = `# ${input.premise.slice(0, 80)}\n\n` + manuscript.map(({ chapter, text }) => `## Chapter ${chapter}\n\n${text}`).join('\n\n');
    setFinalBookContent(content);
    setFinalMetadataJson(JSON.stringify({
      title: input.premise.slice(0, 80),
      chapters: manuscript.map(({ chapter, text }) => ({ chapter, words: text.split(/\s+/).filter(Boolean).length })),
      audit: report ? { status: report.status, summary: report.summary } : null,
      premise: input.premise,
      genre: input.genre,
    }));
    setCurrentStep(GenerationStep.Done);
  }

  function handleProgress(stage: ProgressStage, chapter?: number) {
    if (stage === 'design') setCurrentStep(GenerationStep.GeneratingOutline);
    else if (stage === 'chapter') {
      setCurrentStep(GenerationStep.GeneratingChapters);
      setCurrentChapterProcessing(chapter || 0);
      refreshFromStore();
    }
    else if (stage === 'audit') { setCurrentStep(GenerationStep.FinalizingTransitions); refreshFromStore(); }
    else if (stage === 'done') refreshFromStore();
  }

  async function run(input: ProjectInput, fresh: boolean) {
    if (busy.current) return;
    busy.current = true;
    const token = epoch.current;
    const checkActive = () => { if (epoch.current !== token) throw new Error('This run was cancelled.'); };
    setIsLoading(true);
    setError(null);
    // A fresh book starts with a clean log; a continued run keeps the trail,
    // otherwise two runs glue together and every stage looks doubled.
    if (fresh) setAgentLogs([]);
    setFinalBookContent(null);
    setFinalMetadataJson(null);
    setGeneratedChapters([]);
    setCurrentChapterProcessing(0);
    // The same slot continues: finished chapters are skipped, partial ones restart.
    const store = getStore();
    const llm: NovelLLM = async (prompt, system, options = {}) => {
      checkActive();
      const start = Date.now();
      // A retry's prompt carries the rejection reason at its tail, past the
      // 500-char window: keep the head for context and the tail for the cause.
      const details = prompt.includes('could not be validated:')
        ? `${prompt.slice(0, 200)}\n…\n${prompt.slice(-400)}`
        : prompt.slice(0, 500);
      const writer = getStoredProviderConfig();
      const validator = getStoredValidatorConfig();
      const role = options.route === 'validator' && validator ? validator : writer;
      // Model identity joins the run log: after the fact anyone can see what
      // served each call — a validator step on the writer model means the
      // author judged its own prose, and that must be visible, not silent.
      const servingTag = role.provider === 'ollama'
        ? `Ollama:${role.ollamaModel || '?'}` : `Gemini:${role.geminiModel || 'default'}`;
      setAgentLogs(previous => [...previous, { timestamp: start, chapterNumber: currentChapterRef.current, type: 'execution', message: `${stepName(prompt)} · ${servingTag}`, details }]);
      // Structured validator calls carry a JSON contract under a tight output
      // cap: model reasoning would spend that cap before the answer starts, so
      // thinking is always off on this route. The writer toggle stays the author's.
      const provider = options.route === 'validator' ? { ...role, think: false } : role;
      const result = await generateText(prompt, system, options.schema, options.temperature ?? 0.4, undefined, undefined, provider, options.maxTokens, options.json);
      checkActive();
      return result;
    };
    const poll = setInterval(() => { if (epoch.current === token) refreshFromStore(); }, 1500);
    try {
      const orchestrator = new Orchestrator(store, undefined, new ChapterPipelineV2(), (stage, chapter) => {
        if (epoch.current !== token) return;
        handleProgress(stage, chapter);
      });
      const result = await orchestrator.runBook(input, llm);
      if (epoch.current !== token) return;
      refreshFromStore();
      if (result.status === 'FAILED') {
        setError(result.stoppedReason || 'Generation failed.');
        setCurrentStep(GenerationStep.Error);
      } else {
        publishFinal();
        if (result.status === 'COMPLETE') playSuccessSound();
      }
    } catch (err) {
      if (epoch.current === token) {
        setError(err instanceof Error ? err.message : String(err));
        setCurrentStep(GenerationStep.Error);
      }
    } finally {
      clearInterval(poll);
      if (epoch.current === token) { busy.current = false; setIsLoading(false); refreshFromStore(); }
    }
  }

  useEffect(() => { currentChapterRef.current = currentChapterProcessing; }, [currentChapterProcessing]);

  // The durable slot opens asynchronously; a stored book then shows
  // instead of a blank form.
  useEffect(() => {
    let live = true;
    PersistentProjectStore.open().then(store => {
      if (!live) return;
      storeRef.current = store;
      const input = store.loadInput();
      if (input) {
        inputRef.current = input;
        setStoryPremise(input.premise);
        setNumChapters(input.chapter_count);
        refreshFromStore();
        if (store.manuscript().length >= input.chapter_count) publishFinal();
      }
      setStoreReady(true);
    }).catch(() => {
      if (live) setStoreReady(true);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startGeneration(premise: string, count: number) {
    if (busy.current || !storeRef.current) return;
    getStore().clearAll();
    const wordsPerChapter = storySettings.targetWordsPerChapter || 4000;
    const input: ProjectInput = {
      premise,
      chapter_count: count,
      genre: storySettings.genre || 'fantasy',
      target_total_words: wordsPerChapter * count,
      author_requirements: [
        storySettings.narrativeVoice ? `Voice: ${storySettings.narrativeVoice}.` : '',
        storySettings.tone ? `Tone: ${storySettings.tone}.` : '',
        storySettings.writingStyle ? `Style: ${storySettings.writingStyle}.` : '',
        storySettings.targetAudience ? `Audience: ${storySettings.targetAudience}.` : '',
        storySettings.tense ? `Tense: ${storySettings.tense}.` : '',
        storySettings.ending ? `Ending: ${storySettings.ending}.` : '',
      ].filter(Boolean).join(' ') || '(none)',
      story_language: storySettings.language || 'English',
      planning_language: 'English',
    };
    inputRef.current = input;
    setStoryPremise(premise);
    setNumChapters(count);
    await run(input, true);
  }

  async function continueGeneration() {
    if (busy.current || !inputRef.current || !storeRef.current) return;
    await run(inputRef.current, false);
  }

  function exportProject(): void {
    const store = getStore();
    const input = store.loadInput();
    const name = (input?.premise || 'project').slice(0, 40).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'project';
    downloadJson(`${name}.project.json`, snapshotProject(store));
  }

  async function importProject(file: File): Promise<void> {
    if (busy.current) throw new Error('Finish or reset the running book first.');
    const store = getStore();
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Not a JSON file.');
    }
    restoreSnapshot(store, parsed);
    await store.flush();
    const input = store.loadInput();
    inputRef.current = input;
    if (input) {
      setStoryPremise(input.premise);
      setNumChapters(input.chapter_count);
    }
    setFinalBookContent(null);
    setFinalMetadataJson(null);
    setError(null);
    refreshFromStore();
    if (input && store.manuscript().length >= input.chapter_count) publishFinal();
    else setCurrentStep(GenerationStep.Idle);
  }

  async function resetGenerator() {
    epoch.current++;
    busy.current = false;
    setIsLoading(false);
    getStore().clearAll();
    inputRef.current = null;
    setStoryPremise('');
    setNumChapters(3);
    setAgentLogs([]);
    setError(null);
    setGeneratedChapters([]);
    setFinalBookContent(null);
    setFinalMetadataJson(null);
    setCurrentStoryOutline('');
    setCurrentChapterPlan('');
    setCurrentChapterProcessing(0);
    setCurrentStep(GenerationStep.Idle);
    setLastSavedAt(undefined);
    setHasUnfinished(false);
  }

  return {
    storyPremise, setStoryPremise, numChapters, setNumChapters, storySettings, setStorySettings,
    isLoading, currentStep, error,
    isResumable: hasUnfinished && !isLoading,
    storeReady, exportProject, importProject,
    startGeneration, continueGeneration, resetGenerator,
    finalBookContent,
    finalMetadataJson,
    generatedChapters,
    currentChapterProcessing,
    totalChaptersToProcess: numChapters,
    currentStoryOutline,
    currentChapterPlan,
    agentLogs, lastSavedAt,
  };
}
