import { useState, useRef, useEffect, useMemo } from 'react';
import { type StorySettings, type AgentLogEntry } from '../types';
import { generateText, getStoredProviderConfig, getStoredValidatorConfig } from '../services/llmService';
import { embedOllama } from '../services/ollamaService';
import { RERANK_STORAGE_KEY, sharedReranker } from '../utils/novel/reranker';
import { reportLocalModels } from '../utils/novel/modelProgress';
import { DEFAULT_LOCAL_EMBEDDER, sharedLocalEmbedder } from '../utils/novel/localEmbedder';
import { createBookSpec, type NovelRun } from '../utils/novel/contracts';
import { createRun, NovelEngine } from '../utils/novel/engine';
import { BrowserRunStore, type RunStore } from '../utils/novel/runStore';
import { acceptedVersion, addCandidate, reconcileCheckpoint } from '../utils/novel/storyState';
import { SUMMARIZER_KEY, checkChapter, checkEmotions, checkGenre, deepCheckTools, isLocalModelOn } from '../utils/novel/deepCheck';
import { sharedSummarizer } from '../utils/novel/summarizer';
import { compileBook, displayChapters, generationStep, metadata } from '../utils/novel/presentation';
import { playSuccessSound } from '../utils/soundUtils';
import type { NovelLLM } from '../utils/novel/review';

const DEFAULT_SETTINGS: StorySettings = {
  genre: 'fantasy', narrativeVoice: 'third-limited', tone: 'serious', targetAudience: 'adult',
  writingStyle: 'descriptive', language: 'English', tense: 'past',
  ending: 'closed', targetWordsPerChapter: 4000, chapterMode: 'scene',
  skipEditing: true,
};

/**
 * What a call is for, in the words a reader of the log would use.
 *
 * The inspector was showing the system prompt of every call, so four consecutive extractions read as
 * four identical paragraphs about JSON output contracts and Markdown fences. What a reader wants to
 * know is which step of the book is running, and the system prompt is the one thing on hand that says
 * so — but it says it in the first clause and then spends two hundred characters on formatting rules.
 */
export function stepName(system: string): string {
  const steps: [string, string][] = [
    ['novel architect', 'Outlining the book'],
    ['explicit novel blueprint', 'Designing the book'],
    ['plan causally', 'Planning the chapter'],
    ['plan literary development', 'Planning the chapter\'s development'],
    ['single prose writer', 'Writing a scene'],
    ['targeted fiction revision on named passages', 'Repairing the passages a finding names'],
    ['targeted fiction revision', 'Repairing the chapter'],
    ['never write prose', 'Choosing what to delete'],
    ['continuity record', 'Noting what the scene established'],
    ['continuity and developmental', 'Reviewing the chapter'],
    ['assess literary development', 'Assessing the chapter\'s development'],
    ['extract evidence', 'Extracting what the chapter established'],
    ['complete novel through', 'Reviewing the whole book'],
    ['title completed', 'Naming the book'],
  ];
  const matched = steps.find(([key]) => system.toLowerCase().includes(key));
  return matched ? matched[1] : system.slice(0, 60);
}

/**
 * The two halves of the repetition check: an embedder that nominates one earlier passage per
 * paragraph, and the cross-encoder that decides whether it is a repetition.
 *
 * The cross-encoder is a ~600MB download on first use, fetched while the first chapter that has a
 * chapter before it is measured, and cached by the browser afterwards. It is on by default because a
 * check nobody switched on is a check that never ran: the repetitions it finds were sitting in
 * finished books. If it cannot load, the cosine decides alone rather than the run losing the check.
 */
export { RERANK_STORAGE_KEY } from '../utils/novel/reranker';

function repetitionTools(log: (entry: { type: AgentLogEntry['type']; message: string }) => void): { embed?: (inputs: string[]) => Promise<number[][]>; rerank?: ReturnType<typeof sharedReranker> } {
  const config = getStoredProviderConfig();
  // The in-browser embedder, on its worker. It is the fallback for every provider that cannot embed.
  const browserEmbed = async (inputs: string[]) => {
    const local = sharedLocalEmbedder();
    log({ type: 'execution', message: `Measuring repetition locally: reading ${inputs.length} paragraphs (first use downloads ${DEFAULT_LOCAL_EMBEDDER})` });
    const vectors = await local(inputs);
    log({ type: 'success', message: `Measuring repetition locally: ${inputs.length} paragraphs read` });
    return vectors;
  };
  // Without a local Ollama there is no server embedder to nominate pairs with. Fall back to the
  // in-browser MiniLM embedder so cloud-provider users get the semantic check too: the first
  // measurement downloads the weights once, the browser caches them afterwards. The cross-encoder
  // alone would have to score every paragraph against every earlier one, so it stays off here.
  if (config.provider !== 'ollama') return { embed: browserEmbed };
  /**
   * Ollama is asked first, and answers for itself.
   *
   * "The provider is Ollama" was read as "Ollama can embed", and for a cloud setup that is false:
   * `:cloud` models are proxied and need no local weights, while an embedding needs a model on the
   * machine. Found on a live run — the server held no models at all, its store on an external volume
   * refusing to open — so every call to /api/embed failed, measureProsody caught it and fell back to a
   * report with no repetition check, and the cross-encoder behind it never ran either: with no
   * embedder to nominate pairs there is nothing for it to score. Both halves of the semantic
   * repetition check were installed and dead, and nothing said so out loud.
   *
   * So the choice is made by capability rather than by configuration. The first failure is reported
   * once and remembered: a server that cannot embed will not learn to mid-run, and asking it again per
   * chapter would spend a timeout each time.
   */
  let serverCanEmbed = true;
  const embed = async (inputs: string[]) => {
    if (serverCanEmbed) {
      try {
        log({ type: 'execution', message: `Measuring repetition: reading ${inputs.length} paragraphs` });
        const vectors = await embedOllama(inputs, undefined, config.ollamaEndpoint);
        log({ type: 'success', message: `Measuring repetition: ${inputs.length} paragraphs read` });
        return vectors;
      } catch (error) {
        serverCanEmbed = false;
        log({ type: 'warning', message: `${config.ollamaEndpoint} cannot embed (${error instanceof Error ? error.message : String(error)}). Cloud models are proxied and carry no local weights, so the repetition check moves to the in-browser embedder for the rest of this run.` });
      }
    }
    return browserEmbed(inputs);
  };
  // The cross-encoder now runs on a worker of its own, so the page keeps answering while a chapter is
  // measured; onnxruntime-web executes on whichever thread calls it, and owning that thread was the
  // only arrangement that moved it off this one. It is still a 600MB download on first use and a
  // second of CPU per pair, so "off" in this key leaves the cosine deciding alone, as it did before
  // the cross-encoder existed.
  try {
    if (localStorage.getItem(RERANK_STORAGE_KEY) === 'off') return { embed };
  } catch { /* a browser that refuses storage gets the default */ }
  const model = sharedReranker();
  const rerank = async (pairs: [string, string][]) => {
    log({ type: 'execution', message: `Comparing ${pairs.length} passage pair(s) — the first use downloads the model, about 600MB` });
    const scores = await model(pairs);
    log({ type: 'success', message: `Compared ${pairs.length} passage pair(s)` });
    return scores;
  };
  return { embed, rerank };
}

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
  // Deep-check memory survives across executes: an accepted chapter is scanned once, ever.
  const deepSeen = useRef({ chapters: new Set<string>(), genres: new Set<string>(), arc: new Map<string, string[]>() });

  /**
   * A snapshot for React, not a copy of the manuscript. Cloning the whole run took 10ms once it held
   * five chapters and their revisions — 9.4MB of prose — and it runs after every scene, every
   * revision and every checkpoint. New objects down to the chapter are enough for React to see the
   * change; the versions beneath are large, and the engine only ever appends to them.
   */
  function update(run: NovelRun) {
    setSnapshot({ ...run, chapters: run.chapters.map(chapter => ({ ...chapter })) });
  }

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
      const chapterNumber = run.chapters.find(chapter => chapter.status !== 'accepted')?.number || 0;
      setAgentLogs(previous => [...previous, { timestamp: start, chapterNumber, type: 'execution', message: stepName(system), details: system }]);
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
    // Direct writing means exactly that: no post-acceptance scans, embeddings, reranking,
    // summarizers, or background model downloads may be started while chapters are being written.
    if (run.spec.skipEditing) {
      return new NovelEngine(llm, scopedStore, state => { checkActive(); update(state); });
    }
    // Where a local model ended up running, and when it gives its memory back, in the reader's own log.
    reportLocalModels(message => setAgentLogs(previous => [...previous,
      { timestamp: Date.now(), chapterNumber: runRef.current?.chapters.find(chapter => chapter.status !== 'accepted')?.number || 0, type: 'execution', message }]));
    const { embed, rerank } = repetitionTools(entry => setAgentLogs(previous => [...previous,
      { timestamp: Date.now(), chapterNumber: runRef.current?.chapters.find(chapter => chapter.status !== 'accepted')?.number || 0, ...entry }]));
    const tools = deepCheckTools(entry => setAgentLogs(previous => [...previous,
      { timestamp: Date.now(), chapterNumber: runRef.current?.chapters.find(chapter => chapter.status !== 'accepted')?.number || 0, ...entry }]));
    const summarize = isLocalModelOn(SUMMARIZER_KEY) ? sharedSummarizer() : undefined;
    if (summarize) {
      setAgentLogs(previous => [...previous,
        { timestamp: Date.now(), chapterNumber: 0, type: 'execution', message: 'Ledger compression on: the first planning call downloads the summarizer (~300MB)' }]);
    }
    // Quiet post-acceptance checks: newly accepted chapters are scanned once each, in the
    // background, and report as advisory log lines. Failures here never touch the run.
    const seen = deepSeen.current;
    const say = (chapterNumber: number, message: string) => {
      setAgentLogs(previous => [...previous, { timestamp: Date.now(), chapterNumber, type: 'evaluation', message }]);
    };
    const maybeDeepCheck = (state: NovelRun) => {
      if (tools.classifyGenre && state.outline.trim() && !seen.genres.has(state.id)) {
        seen.genres.add(state.id);
        void (async () => {
          try {
            const verdict = await checkGenre(state, state.outline, tools.classifyGenre!);
            if (epoch.current !== token || !verdict) return;
            say(0, verdict.ok
              ? `Genre check: outline reads as ${verdict.top} — matches contract (${verdict.expected})`
              : `Genre check: outline reads as ${verdict.top}, contract says ${verdict.expected} — advisory`);
          } catch {
            // A quiet check that fails stays quiet: it must never lose a reviewed chapter.
          }
        })();
      }
      if (!tools.score && !tools.identify && !tools.scoreEmotion) return;
      for (const chapter of state.chapters) {
        if (chapter.status !== 'accepted') continue;
        const version = acceptedVersion(chapter);
        if (!version) continue;
        const key = `${state.id}#${chapter.number}r${version.revision}`;
        if (seen.chapters.has(key)) continue;
        seen.chapters.add(key);
        void (async () => {
          try {
            const report = await checkChapter(state, chapter.number, version.content, tools);
            if (epoch.current !== token) return;
            if (tools.score) {
              say(chapter.number, report.contradictions.length
                ? `Deep check ch ${chapter.number}: ${report.contradictions.length} possible contradiction(s) vs canon — advisory, see report`
                : `Deep check ch ${chapter.number}: no canon contradictions`);
            }
            if (report.language && !report.language.ok) {
              say(chapter.number, `Deep check ch ${chapter.number}: prose reads as ${report.language.label}, expected ${report.language.expected}`);
            }
            if (tools.scoreEmotion) {
              const felt = await checkEmotions(chapter.number, version.content, tools.scoreEmotion);
              if (epoch.current !== token || !felt) return;
              say(chapter.number, `Emotion ch ${chapter.number}: dominant ${felt.dominant} · variety ${Math.round(felt.variety * 100)}%`);
              const trail = [...(seen.arc.get(state.id) || []), `${chapter.number}:${felt.dominant}`]
                .sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0]));
              seen.arc.set(state.id, trail);
              const moods = trail.map(entry => entry.split(':')[1]);
              if (new Set(moods.map(mood => mood.toLowerCase())).size > 1) {
                say(chapter.number, `Emotion arc travels: ${moods.join(' → ')}`);
              }
            }
          } catch {
            // A quiet check that fails stays quiet: it must never lose a reviewed chapter.
          }
        })();
      }
    };
    return new NovelEngine(llm, scopedStore, state => { checkActive(); update(state); maybeDeepCheck(state); }, embed, rerank, summarize);
  }

  async function execute(action: (run: NovelRun, engine: NovelEngine) => Promise<void>) {
    if (busy.current || isRestoring || !runRef.current) return;
    busy.current = true;
    const token = epoch.current;
    const run = runRef.current;
    // A saved run may predate direct-only generation. Never resume it through the old editorial
    // pipeline: the active product path writes the manuscript without validator or repair passes.
    setIsLoading(true);
    setError(null);
    if (run.stage === 'needs_revision') {
      run.stage = run.resumeStage || 'writing';
      update(run);
    }
    const nextProvider = getStoredProviderConfig();
    run.provider = nextProvider;
    run.validationProvider = getStoredValidatorConfig();
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
      const run = createRun(createBookSpec(premise, count, { ...storySettings, skipEditing: false }), getStoredProviderConfig());
      run.validationProvider = getStoredValidatorConfig();
      runRef.current = run;
      update(run);
      await execute(async (state, engine) => { await storeRef.current.save(state); await engine.outline(state); });
    } catch (err) { setError(String(err)); }
  }

  async function continueGeneration() {
    const retry = runRef.current?.stage === 'needs_revision';
    await execute(async (run, engine) => {
      if (!run.outline.trim()) await engine.outline(run);
      else await engine.continue(run, { retry });
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
    chapter.lastFindings = undefined;
    chapter.repairVersionStart = chapter.versions.length;
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

  /**
   * Derived once per snapshot, not once per render.
   *
   * These four were rebuilt on every render, and a render happens on every checkpoint, every appended
   * log line and every keystroke elsewhere in the tree: the chapter list, which copies each chapter
   * and pretty-prints its plan; the blueprint, pretty-printed whole; and on a finished book the
   * compiled manuscript and the metadata document, which is hundreds of kilobytes of JSON that
   * something downstream then parses again. None of them can change while the snapshot does not.
   */
  const generatedChapters = useMemo(() => displayChapters(snapshot), [snapshot]);
  const complete = snapshot?.stage === 'complete';
  const finalBook = useMemo(() => {
    if (!complete || !snapshot) return { content: null as string | null, metadata: null as string | null };
    // A run marked complete that cannot be compiled is a defect to report, never a throw on every
    // render of the page that would report it.
    try { return { content: compileBook(snapshot), metadata: metadata(snapshot) }; }
    catch { return { content: null, metadata: null }; }
  }, [snapshot, complete]);
  const blueprintJson = useMemo(() => snapshot?.blueprint ? JSON.stringify(snapshot.blueprint, null, 2) : '', [snapshot]);
  return {
    storyPremise, setStoryPremise, numChapters, setNumChapters, storySettings, setStorySettings,
    isLoading: isLoading || isRestoring, currentStep: generationStep(snapshot, isLoading), error,
    isResumable: Boolean(snapshot && !complete && snapshot.stage !== 'outline' && !isLoading),
    startGeneration, continueGeneration, regenerateOutline, resetGenerator, reviseChapter,
    reviewCompleted: () => execute((run, engine) => engine.reviewCompleted(run)),
    applyEditorial: () => execute((run, engine) => engine.applyEditorial(run)),
    editorial: snapshot?.editorial,
    manuscriptHistory: snapshot?.manuscriptHistory || [],
    finalBookContent: finalBook.content,
    finalMetadataJson: finalBook.metadata,
    generatedChapters,
    currentChapterProcessing: snapshot?.chapters.find(chapter => chapter.status !== 'accepted')?.number || 0,
    totalChaptersToProcess: snapshot?.spec.chapterCount || numChapters,
    currentStoryOutline: snapshot?.outline || '', setCurrentStoryOutline,
    currentChapterPlan: blueprintJson,
    agentLogs, lastSavedAt: snapshot?.updatedAt,
  };
}
