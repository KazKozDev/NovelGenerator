import { AUDIT_STAGES } from '../utils/novel/craft/craftOrchestrator';
import {addTokenUsage,emptyTokenTotals,savedTokenTotals,type TokenTotals} from '../utils/tokenUsage';
import { useState, useRef, useEffect } from 'react';
import { type StorySettings, type AgentLogEntry, GenerationStep, type ChapterData } from '../types';
import { generateText, getStoredProviderConfig, getStoredValidatorConfig, getStoredSecondWriterConfig } from '../services/llmService';
import type { NovelLLM } from '../utils/novel/v2/llm';
import { authorKey } from '../utils/novel/author';
import { deskTabs, deskFocus, type DeskTab, type DeskFocus } from '../utils/novel/deskTabs';
import { SIMILAR_MODEL, type SimilarRequest } from '../utils/novel/similar';
import { similarHuggingFaceBrowser } from '../services/hfBrowserService';
import { withOllamaOutputRoom } from '../utils/novel/v2/llm';
import { budgetFor, Orchestrator, type ProgressStage } from '../utils/novel/v2/orchestrator';
import { downloadJson, restoreSnapshot, snapshotProject } from '../utils/novel/v2/export';
import { PersistentProjectStore } from '../utils/novel/v2/persistent';
import type { ProjectInput } from '../utils/novel/v2/types';
import { playSuccessSound } from '../utils/soundUtils';
import { assembleManuscript, normalizeChapterBody, parseBookChapters } from '../utils/novel/manuscript';
import { readGenerationSettings, saveGenerationSettings, readMainForm, saveMainForm, buildProjectInput, DEFAULT_GENERATION_SETTINGS } from '../utils/generationSettings';

const DEFAULT_SETTINGS = DEFAULT_GENERATION_SETTINGS;

/**
 * What a call is for, in the words a reader of the log would use. v2 prompts
 * name their stage in the first line, so the user prompt — not the shared
 * system contract — is what gets matched.
 */
export function stepName(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim().slice(0, 60).trim();
}

const STAGES: Record<string, string> = {
  'craft-preparation': 'Author Dossier: 4 Layers of Truth & Backstory',
  'craft-cards': 'Scene Projection: Scene Cards & Knowledge Registry',
  'craft-preflight': 'Preflight: Causal Consistency Audit',
  'craft-write': 'Writing Scene (Anti-Metaphor Directive)',
  'craft-observe': 'Observer: Validating Scene Enactment',
  'craft-repair': 'Repair: Enacting Concrete Action',
  'craft-reader': 'Blind Reader: Chapter Prefix Hypotheses',
  'craft-dev-review': 'Developmental Review: Causal Arc & Closure',
  'craft-lit-review': 'Literary Review: Craft, Sensory Detail & Voice',
  'author-step': 'The author at its desk',
  'author-character': 'The author asks one of its people',
  'author-reader': 'A reader reads this far',
  'author-similar': 'Looking through the book for a line',
};

/** What a call is doing, in words a reader of the run can follow. */
export function describeCall(stage: string | undefined, prompt: string): { title: string; reason: string } {
  const title = (stage && STAGES[stage]) || (stage ? stage : stepName(prompt));
  return { title, reason: '' };
}
const size = (characters: number): string => characters >= 1000 ? `${Math.round(characters / 1000)}K` : String(characters);

/**
 * The book's own title when the design carries one. A book designed before P01
 * named its titles falls back to the premise — trimmed at a word, never
 * mid-word, because "...the ships she guides home ha" reads as damage.
 */
export function bookTitle(declared: string | undefined, premise: string): string {
  if (typeof declared === 'string' && declared.trim()) {
    const candidate = declared.trim();
    // Guard against truncated premise fragments (e.g. legacy slice(0, 60) ending in single letter or dangling word)
    const isPremiseSlice = premise.startsWith(candidate) && candidate.length < premise.length;
    const endsWithFragment = /\s+[a-z]{1,2}$/i.test(candidate) || /[,;:\s\-—]+$/.test(candidate) || /\b(is|was|who|which|that|and|or|but|the|a|an|in|on|at|to|for|with|by)\b$/i.test(candidate);
    if (!isPremiseSlice || !endsWithFragment) {
      return candidate;
    }
  }
  const text = premise.trim();
  if (!text) return 'Untitled book';
  if (text.length <= 80) return text;
  const cut = text.slice(0, 80);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, '')}…`;
}

/**
 * A failure reported to the reader: the headline first, the rest on request.
 * A refused design arrives as the reviewer's own prose — required decisions,
 * consequences, alternatives — and three of those in a red box is a wall
 * nobody reads, least of all the person deciding whether to try again.
 */
export function splitError(message: string): { headline: string; detail: string } {
  const text = (message || '').trim();
  if (!text) return { headline: 'Generation failed.', detail: '' };
  const firstLine = text.split('\n')[0].trim();
  // A sentence end, not a decimal point or an abbreviation: the period must be
  // followed by a space and a capital, or end the line.
  const sentence = firstLine.match(/^.*?[.!?](?=\s+[A-Z"'\u201c]|$)/)?.[0]?.trim() || firstLine;
  const headline = sentence.length > 200 ? `${sentence.slice(0, 200).trimEnd()}…` : sentence;
  const detail = text.startsWith(headline.replace(/…$/, '')) && text.length > headline.length
    ? text.slice(headline.replace(/…$/, '').length).trim()
    : text === headline ? '' : text;
  return { headline, detail };
}

/** React presents snapshots; the v2 store owns execution state. */
export default function useBookGenerator() {
  const [storyPremise, setStoryPremise] = useState(()=>readMainForm().premise);
  const [numChapters, setNumChapters] = useState(()=>readMainForm().chapters);
  const [bookTitleInput, setBookTitleInput] = useState(()=>readMainForm().title || '');
  const [storySettings, setStorySettings] = useState<StorySettings>(()=>readGenerationSettings(DEFAULT_SETTINGS));
  useEffect(()=>{saveGenerationSettings(storySettings)},[storySettings]);
  useEffect(()=>{saveMainForm(storyPremise,numChapters,bookTitleInput)},[storyPremise,numChapters,bookTitleInput]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenTotals,setTokenTotals]=useState<TokenTotals>(emptyTokenTotals);
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  // The prose of the call now in flight, as far as it has arrived.
  const [liveDraft, setLiveDraft] = useState<{ label: string; text: string } | null>(null);
  const [currentStep, setCurrentStep] = useState<GenerationStep>(GenerationStep.Idle);
  const [currentChapterProcessing, setCurrentChapterProcessing] = useState(0);
  const [generatedChapters, setGeneratedChapters] = useState<ChapterData[]>([]);
  const [finalBookContent, setFinalBookContent] = useState<string | null>(null);
  const [finalMetadataJson, setFinalMetadataJson] = useState<string | null>(null);
  const [currentStoryOutline, setCurrentStoryOutline] = useState('');
  const [currentChapterPlan, setCurrentChapterPlan] = useState('');
  // What the author's tools hold, as text: its talk with readers, with its people, with the keeper.
  const [deskTools, setDeskTools] = useState<DeskTab[]>([]);
  // Where the author is working at this moment, so that the screen follows it from tab to tab.
  const [deskNow, setDeskNow] = useState<DeskFocus | null>(null);
  const deskTabRef = useRef<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<PersistentProjectStore['saveStatus']>();
  const [lastSavedAt, setLastSavedAt] = useState<number | undefined>(undefined);
  const storeRef = useRef<PersistentProjectStore | null>(null);
  const inputRef = useRef<ProjectInput | null>(null);
  const epoch = useRef(0);
  const busy = useRef(false);
  const currentChapterRef = useRef(0);
  const [developmentLabel, setDevelopmentLabel] = useState<string | undefined>();
  const [hasUnfinished, setHasUnfinished] = useState(false);
  const [storeReady, setStoreReady] = useState(false);
  const [isEditorialRunning, setIsEditorialRunning] = useState(false);
  const editorialRunningRef = useRef(false);

  function getStore(): PersistentProjectStore {
    if (!storeRef.current) throw new Error('Project storage is still opening.');
    return storeRef.current;
  }

  function refreshFromStore() {
    const store = getStore();
    setTokenTotals(savedTokenTotals(store.runLog()));
    const manuscript = store.manuscript();
    const author = store.loadAuthor();
    setGeneratedChapters(manuscript.map(({ chapter, text }) => ({ title: `Chapter ${chapter}`, content: normalizeChapterBody(text, chapter), ...(author?.chapters[chapter - 1] ? { plan: `${author.chapters[chapter - 1].card ? `**What the author noted on closing it**\n\n${author.chapters[chapter - 1].card}\n\n` : ''}**What a reader said**\n\n${author.chapters[chapter - 1].reader || '(the author has not asked a reader about this chapter)'}` } : {}) })));
    setDeskTools(author?.desk ? deskTabs(author.desk) : []);
    if (author) {
      let engineLabel: string | undefined;
      try {
        const state = JSON.parse(author.desk?.files['engine-state.json'] || 'null');
        if (state) {
          const running = Object.entries(state.operations || {}).find(([, value]) => (value as { status: string }).status === 'running')?.[0];
          engineLabel = running ? `Developing ${running.split('/')[0].replaceAll('-', ' ')}` : ({ planning: 'Developing the story', draft: 'Writing the draft', 'structural-revision': 'Reshaping the book', 'line-edit': 'Editing prose', copyedit: 'Copyediting', proofread: 'Proofreading', complete: 'Book processing finished' } as Record<string, string>)[state.phase];
        }
      } catch { /* Legacy projects keep their existing progress display. */ }
      setDevelopmentLabel(author.completed ? undefined : engineLabel || (author.desk ? `${author.desk.editorial?.active ? 'Revising novel' : 'Writing novel'} · step ${author.desk.step} · ${author.desk.budget - author.desk.spent} calls left` : !author.notebook && !author.clock ? 'Developing premise & concept' : !author.clock ? 'Settling characters & world' : !author.plan ? 'Planning chapters' : `Writing chapter ${Math.min(author.chapters.length + 1, store.loadInput()?.chapter_count || 1)}`));
      setCurrentStoryOutline([author.notebook ? `# The author's notebook\n\n${author.notebook}` : '', author.plan ? `# The author's plan\n\n${author.plan}` : '', author.clock ? `# ${author.desk ? 'The dossier' : 'The clock'}\n\n${author.clock}` : ''].filter(Boolean).join('\n\n') || 'The author has not written its plan yet.');
      const at = author.chapters.at(-1);
      if (author.desk) setCurrentChapterPlan(`**What the author has done, step by step**\n\n${author.desk.journal.slice(-30).map(line => `- ${line}`).join('\n') || '(nothing yet)'}${author.desk.answers.length ? `\n\n**What it was last told**\n\n*${author.desk.answers.at(-1)!.who}:* ${author.desk.answers.at(-1)!.text}` : ''}`);
      else setCurrentChapterPlan(at ? `**Chapter ${author.chapters.length}, as the author noted it**\n\n${at.card}${author.waiting ? `\n\n**What a reader is waiting for now**\n\n${author.waiting}` : ''}${author.noticed.length ? `\n\n**What readers said did not add up** (carried forward, not rewritten)\n\n${author.noticed.map(item => `- ${item}`).join('\n')}` : ''}` : author.plan || 'The first chapter is not written yet.');
    }
    const input = store.loadInput();
    setHasUnfinished(!!input && !!author && (!author.completed || !store.loadReport()));
    if (editorialRunningRef.current && input && manuscript.length > 0) {
      const title = bookTitle(author?.title, input.premise);
      setFinalBookContent(assembleManuscript(manuscript, title));
    }
  }

  function publishFinal() {
    const store = getStore();
    const input = store.loadInput();
    if (!input || (store.loadAuthor() && (!store.loadAuthor()!.completed || !store.loadReport()))) return;
    const manuscript = store.manuscript();
    const report = store.loadReport();
    const desk = store.loadAuthor()?.desk;
    const latestReview = (focus: string) => {
      for (const answer of [...(desk?.answers || [])].reverse()) {
        try { const review = JSON.parse(answer.text); if (review.focus === focus) return review; } catch { /* prose feedback */ }
      }
      return undefined;
    };
    const title = bookTitle(store.loadAuthor()?.title, input.premise);
    const content = assembleManuscript(manuscript, title);
    setFinalBookContent(content);
    setFinalMetadataJson(JSON.stringify({
      title,
      chapters: manuscript.map(({ chapter, text }) => ({ chapter, words: text.split(/\s+/).filter(Boolean).length })),
      audit: report,
      craft: { landmarks: latestReview('structure')?.landmarks, readerMap: latestReview('reader-promises')?.readerMap },
      premise: input.premise,
      genre: input.genre,
    }));
    setCurrentStep(GenerationStep.Done);
  }

  function handleProgress(stage: ProgressStage, chapter?: number) {
    if (stage === 'design') setCurrentStep(GenerationStep.GeneratingOutline);
    else if (stage === 'chapter') {
      setCurrentStep(GenerationStep.GeneratingChapters);
      // Set at once as well: a call that starts in the same tick read the previous chapter.
      currentChapterRef.current = chapter || 0;
      setCurrentChapterProcessing(chapter || 0);
      refreshFromStore();
    }
    else if (stage === 'audit') { setCurrentStep(GenerationStep.FinalizingTransitions); refreshFromStore(); }
    else if (stage === 'done') refreshFromStore();
  }

  async function run(input: ProjectInput, fresh: boolean, editorial = false) {
    if (busy.current) return;
    busy.current = true;
    const token = epoch.current;
    const checkActive = () => { if (epoch.current !== token) throw new Error('This run was cancelled.'); };
    setIsLoading(true);
    if (editorial) {
      editorialRunningRef.current = true;
      setIsEditorialRunning(true);
    } else {
      editorialRunningRef.current = false;
      setIsEditorialRunning(false);
      setFinalBookContent(null);
      setFinalMetadataJson(null);
      setGeneratedChapters([]);
      setCurrentChapterProcessing(0);
    }
    setCurrentStep(GenerationStep.GeneratingOutline);
    setError(null);
    // A fresh book starts with a clean log; a continued run keeps the trail,
    // otherwise two runs glue together and every stage looks doubled.
    if (fresh) { setAgentLogs([]); setTokenTotals(emptyTokenTotals()); }
    // The same slot continues: finished chapters are skipped, partial ones restart.
    const store = getStore();
    const writer = getStoredProviderConfig();
    const validator = getStoredValidatorConfig();
    const second = getStoredSecondWriterConfig();
    const modelOf = (config: typeof writer): string => `${config.provider}:${config.provider === 'compatible' ? config.compatibleModel || '?' : config.provider === 'anthropic' ? config.anthropicModel || 'default' : config.provider === 'huggingface' ? config.hfModel || '?' : config.provider === 'qwen' ? config.qwenModel || 'qwen3.8-flash' : config.provider === 'ollama' ? config.ollamaModel || '?' : config.geminiModel || 'default'}`;
    // Who writes and who reads, said once in the saved log: it can be checked after the fact, not only on screen.
    store.log('models', `author: ${modelOf(writer)} · reader: ${validator ? modelOf(validator) : `the author's own (${modelOf(writer)})`}`);
    const llm: NovelLLM = async (prompt, system, options = {}) => {
      checkActive();
      // Search by meaning, asked quietly of a small network. Without a token it fails, and the engine searches by words instead.
      if (options.route === 'helper') { const request = JSON.parse(prompt) as SimilarRequest; return JSON.stringify(await similarHuggingFaceBrowser(SIMILAR_MODEL, request.source, request.sentences)); }
      const start = Date.now();
      // A retry's prompt carries the rejection reason at its tail, past the
      // 500-char window: keep the head for context and the tail for the cause.
      // The head of a prompt is the author's request, the same on every call; what this
      // call was asked is at its end, and what it was refused for is named separately.
      const call = describeCall(options.stage, prompt);
      const details = [`stage: ${options.stage || 'unlabelled'} · role: ${options.route === 'writer2' ? 'second writer' : options.route || 'writer'} · sent ${size(prompt.length + system.length)} characters`,
        call.reason ? `refused for: ${call.reason}` : '', `the request ends:\n…${prompt.slice(-700)}`].filter(Boolean).join('\n\n');
      const finish = (type: 'success' | 'warning', outcome: string) => setAgentLogs(previous => previous.map(entry => entry.timestamp === start && entry.type === 'execution' && entry.details === details ? { ...entry, type: type === 'warning' ? type : entry.type, finished: true, outcome } : entry));
      const role = options.route === 'validator' && validator ? validator : options.route === 'writer2' && second ? second : writer;
      // Model identity joins the run log: after the fact anyone can see what
      // served each call — a validator step on the writer model means the
      // author judged its own prose, and that must be visible, not silent.
      const servingTag = role.provider === 'compatible' ? `API:${role.compatibleModel || '?'}` : role.provider === 'anthropic' ? `Anthropic:${role.anthropicModel || 'default'}` : role.provider === 'huggingface' ? `HF:${role.hfModel || '?'}` : role.provider === 'qwen' ? `Qwen:${role.qwenModel || 'qwen3.8-flash'}` : role.provider === 'ollama'
        ? `Ollama:${role.ollamaModel || '?'}` : `Gemini:${role.geminiModel || 'default'}`;
      setAgentLogs(previous => [...previous, { timestamp: start, chapterNumber: currentChapterRef.current, type: 'execution', message: `${call.title} · ${servingTag}`, details, ...(call.reason ? { outcome: `Refused for: ${call.reason}` } : {}) }]);
      // While an answer arrives: the inspector says how much has come and how fast, and a
      // writer's prose is shown as it is written. Both are refreshed a few times a second at most.
      const writing = /^(author-step|author-chapter|craft-write|craft-repair|thesis-(block-write|block-repair|expand|polish|seam-repair|rough-repair|audit-repair))$/.test(options.stage || '');
      let arrived = '', shown = 0;
      const progress = (force = false) => {
        if (epoch.current !== token || (!force && Date.now() - shown < 400)) return;
        shown = Date.now();
        const elapsed = Math.max(1, (Date.now() - start) / 1000);
        const note = `${Math.round(elapsed)}s · received ${size(arrived.length)} so far · ${Math.round(arrived.length / elapsed)} characters/s`;
        setAgentLogs(previous => previous.map(entry => entry.timestamp === start && entry.type === 'execution' && entry.details === details && !entry.finished ? { ...entry, outcome: note } : entry));
        const focus = deskFocus(options.stage || '', arrived, deskTabRef.current);
        if (focus) { deskTabRef.current = focus.tab; setDeskNow(focus); }
        if (writing) {
          // At its desk the author's answer is a thought, a tool and then the text: only a chapter being written is shown as it arrives.
          const desk = options.stage === 'author-step';
          // One answer may hold several steps: only the step now arriving counts, and only if it is a chapter.
          const now = desk ? arrived.slice(Math.max(0, ...[...arrived.matchAll(/^\**TOOL\**\s*:/gmi)].map(found => found.index ?? 0))) : '';
          const body = desk
            ? (/^\**FILE\**\s*:\**\s*[`"']?chapter-\d+/mi.test(now) && /^\**TOOL\**\s*:\**\s*`?(write|append)/mi.test(now) ? now.split(/\n-{3,}[ \t]*\n/)[1] || '' : '')
            : options.stage?.startsWith('craft-') ? arrived : livePreview(arrived).split(/\n\s*={3,}\s*CARD/i)[0];
          if (body || !desk) setLiveDraft({ label: desk ? `The author is writing ${now.match(/^\**FILE\**\s*:\**\s*[`"']?(chapter-\d+)/mi)?.[1].replace('-', ' ') || 'a chapter'}` : call.title, text: body });
        }
      };
      const boundedAudit = AUDIT_STAGES.has(options.stage || '');
      const live = { retryOutputLimit: !boundedAudit, onChunk: (chunk: string) => { arrived += chunk; progress(); }, onRestart: (why: string) => { arrived = ''; progress(true); setAgentLogs(previous => previous.map(entry => entry.timestamp === start && entry.details === details && !entry.finished ? { ...entry, outcome: `Asking again: ${why}` } : entry)); } };
      const ask = async (maxTokens: number | undefined, retry = false) => {
        checkActive();
        arrived = '';
        if (retry) setAgentLogs(previous => [...previous, {
          timestamp: Date.now(), chapterNumber: currentChapterRef.current, type: 'decision',
          message: `Retry after output limit · ${servingTag}`,
          details: `Incomplete answer rejected. Repeating the same request with an output limit of ${maxTokens} tokens.`,
        }]);
        return generateText(prompt, system, options.schema, options.temperature ?? 0.4, undefined, undefined, role, maxTokens, options.json, options.deliberate,usage=>{
          if(epoch.current!==token)return;
          const totals=addTokenUsage(savedTokenTotals(store.runLog()),usage);
          store.log('token_totals',JSON.stringify(totals));
          setTokenTotals(totals);
        }, live);
      };
      const seconds = () => `${Math.max(1, Math.round((Date.now() - start) / 1000))}s`;
      let result: string;
      try {
        result = boundedAudit ? await ask(options.maxTokens) : role.provider === 'ollama'
          ? await withOllamaOutputRoom(ask, options.maxTokens)
          // A metered provider is asked for what the call asked, and for twice that if the answer
          // was cut off — but not for a scene or an edit of one: a scene that fills eight thousand
          // tokens is a model in a loop, and twice the room is twice the loop.
          : writing ? await ask(options.maxTokens) : await withOllamaOutputRoom(ask, options.maxTokens, options.maxTokens ?? 16384);
      } catch (error) {
        finish('warning', `Failed after ${seconds()}: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`);
        if (writing) setLiveDraft(null);
        if (/^author-(step|reader|character)$/.test(options.stage || '')) setDeskNow(now => now && now.text ? { ...now, text: '' } : now);
        throw error;
      }
      // What the author decided to do at this step, in its own words.
      const did = options.stage === 'author-step' ? (() => { const tool = result.match(/^\**TOOL\**\s*:\**\s*(.*)$/mi)?.[1].trim() || '', file = result.match(/^\**(?:FILE|NAME)\**\s*:\**\s*(.*)$/mi)?.[1].trim() || '', thought = result.match(/^\**THOUGHT\**\s*:\**\s*(.*)$/mi)?.[1].trim() || ''; return `${[tool, file].filter(Boolean).join(' ')}${thought ? ` — ${thought.slice(0, 260)}` : ''} · `; })() : '';
      finish('success', `${did}${seconds()} · sent ${size(prompt.length + system.length)} · received ${size(result.length)}${call.reason ? ` · was refused for: ${call.reason}` : ''}`);
      if (writing) setLiveDraft(null);
      if (/^author-(step|reader|character)$/.test(options.stage || '')) setDeskNow(now => now && now.text ? { ...now, text: '' } : now);
      checkActive();
      return result;
    };
    const poll = setInterval(() => { if (epoch.current === token) refreshFromStore(); }, 1500);
    try {
      const orchestrator = new Orchestrator(store, budgetFor(input.chapter_count), (stage, chapter) => {
        if (epoch.current !== token) return;
        handleProgress(stage, chapter);
      });
      const result = editorial ? await orchestrator.runEditorial(input, llm) : await orchestrator.runBook(input, llm);
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
      if (epoch.current === token) {
        busy.current = false;
        editorialRunningRef.current = false;
        setIsEditorialRunning(false);
        setIsLoading(false);
        refreshFromStore();
      }
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
      store.onSaveStatus = status => { if (live) { setAutosaveStatus(status); setLastSavedAt(status.savedAt); } };
      setAutosaveStatus(store.saveStatus); setLastSavedAt(store.saveStatus.savedAt);
      if (store.saveStatus.state === 'error') { setError(store.saveStatus.error || 'Project storage failed'); setCurrentStep(GenerationStep.Error); }
      const input = store.loadInput();
      if (input) {
        inputRef.current = input;
        if (input.title) setBookTitleInput(input.title);
        setStoryPremise(input.premise);
        setNumChapters(input.chapter_count);
        refreshFromStore();
        if (store.manuscript().length >= input.chapter_count && store.loadAuthor()?.completed && store.loadReport()) publishFinal();
      }
      setStoreReady(true);
    }).catch(error => {
      if (live) {
        setError(`Project storage could not be opened: ${error instanceof Error ? error.message : String(error)}`);
        setCurrentStep(GenerationStep.Error);
        setAutosaveStatus({state:'error',error:String(error)});
        setStoreReady(false);
      }
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startGeneration(premise: string, count: number, customTitle?: string) {
    if (busy.current || !storeRef.current) return;
    const title = customTitle !== undefined ? customTitle : bookTitleInput;
    const input: ProjectInput = { ...buildProjectInput(premise, count, storySettings, title), generation_mode: 'craft' };
    getStore().clearAll();
    inputRef.current = input;
    if (title) setBookTitleInput(title);
    setStoryPremise(premise);
    setNumChapters(count);
    await run(input, true);
  }

  async function editBook() {
    if (busy.current || !storeRef.current || !inputRef.current) return;
    await run(inputRef.current, false, true);
  }

  function updateManualManuscript(newContent: string): boolean {
    if (busy.current || !storeRef.current) return false;
    const store = getStore();
    const parsed = parseBookChapters(newContent);
    if (!parsed.length) return false;
    const draft = store.loadAuthor();
    for (const c of parsed) {
      store.saveManuscript(c.num, c.content);
      if (draft?.chapters[c.num - 1]) {
        draft.chapters[c.num - 1].text = c.content;
      }
      if (draft?.desk) {
        draft.desk.files[`chapter-${c.num}.md`] = c.content;
      }
    }
    if (draft?.desk) {
      draft.desk.files['book.md'] = newContent;
      store.saveAuthor(draft);
    }
    const input = store.loadInput();
    const title = input ? bookTitle(draft?.title, input.premise) : undefined;
    const finalContent = assembleManuscript(store.manuscript(), title);
    setFinalBookContent(finalContent);
    const report = store.loadReport();
    const desk = draft?.desk;
    const latestReview = (focus: string) => {
      for (const answer of [...(desk?.answers || [])].reverse()) {
        try { const review = JSON.parse(answer.text); if (review.focus === focus) return review; } catch { /* prose feedback */ }
      }
      return undefined;
    };
    setFinalMetadataJson(JSON.stringify({
      title,
      chapters: store.manuscript().map(({ chapter, text }) => ({ chapter, words: text.split(/\s+/).filter(Boolean).length })),
      audit: report,
      craft: { landmarks: latestReview('structure')?.landmarks, readerMap: latestReview('reader-promises')?.readerMap },
      premise: input?.premise,
      genre: input?.genre,
    }));
    refreshFromStore();
    return true;
  }

  async function continueGeneration() {
    if (busy.current || !inputRef.current || !storeRef.current) return;
    let configured:ProjectInput;
    try { configured=buildProjectInput(storyPremise,numChapters,storySettings,bookTitleInput); }
    catch(error){setError(error instanceof Error?error.message:String(error));setCurrentStep(GenerationStep.Error);return;}
    if(configured.premise!==inputRef.current.premise||configured.chapter_count!==inputRef.current.chapter_count) {
      setError('Premise or chapter count changed. Start a new book with the main-page settings.');setCurrentStep(GenerationStep.Error);return;
    }
    const input={...inputRef.current,...configured};
    const store=getStore();
    const authored=store.loadAuthor();
    if(authored && authorKey({...input,generation_mode:'author'})!==authored.input_key){
      authored.input_key=authorKey({...input,generation_mode:'author'});
      store.saveAuthor(authored);
      store.clearReport(); store.saveInput(input); inputRef.current=input;
    }
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
    if (input && store.loadAuthor()?.completed && store.loadReport() && store.manuscript().length >= input.chapter_count) publishFinal();
    else setCurrentStep(GenerationStep.Idle);
  }

  /**
   * Back to the form after a failure, with the premise, the settings and the
   * stored project intact. Starting over is the other button; this one exists
   * because a design the reviewer refused is usually fixed by changing the
   * premise or the editor model, and retyping both to reach that form is a
   * punishment for a failure the author did not cause.
   */
  function editSettings() {
    epoch.current++;
    busy.current = false;
    setIsLoading(false);
    setError(null);
    setHasUnfinished(false);
    setCurrentStep(GenerationStep.Idle);
  }

  async function resetGenerator() {
    epoch.current++;
    busy.current = false;
    setIsLoading(false);
    const store = getStore();
    // Save even the edits still waiting for the debounce before clearing.
    // The repository backend archives this snapshot when the empty slot arrives.
    try { await store.flush(); }
    catch (error) {
      setError(`Clean Slate could not save the current project: ${error instanceof Error ? error.message : String(error)}`);
      setCurrentStep(GenerationStep.Error);
      return;
    }
    store.clearAll();
    await store.flush().catch(() => undefined);
    inputRef.current = null;
    setStoryPremise('');
    setNumChapters(3);
    setAgentLogs([]);
    setError(null);
    setGeneratedChapters([]);
    setFinalBookContent(null);
    setFinalMetadataJson(null);
    setDevelopmentLabel(undefined);
    setCurrentStoryOutline('');
    setCurrentChapterPlan(''); setDeskTools([]); setDeskNow(null); deskTabRef.current = null;
    setCurrentChapterProcessing(0);
    setCurrentStep(GenerationStep.Idle);
    setLastSavedAt(undefined);
    setTokenTotals(emptyTokenTotals());
    setHasUnfinished(false);
  }

  // Derive from the durable history even when an in-flight poll was started
  // before a hot update; remounting the text view must not erase its baseline.
  const report = storeRef.current?.loadReport();
  const revisionStatus = report?.status === 'COMPLETE' ? 'Checks passed' : report?.status === 'COMPLETE_WITH_WARNINGS' ? 'Reviewed · warnings' : 'Draft · not verified';
  const workspaceChapters = generatedChapters.map(chapter => ({ ...chapter, revisionStatus }));

  return {
    storyPremise, setStoryPremise, numChapters, setNumChapters, storySettings, setStorySettings,
    bookTitleInput, setBookTitleInput,
    isLoading, currentStep, error, developmentLabel,
    isResumable: hasUnfinished && !isLoading,
    tokenTotals, storeReady, exportProject, importProject,
    startGeneration, continueGeneration, editBook, resetGenerator, editSettings,
    isEditorialRunning, updateManualManuscript,
    finalBookContent,
    finalMetadataJson,
    generatedChapters: workspaceChapters,
    currentChapterProcessing,
    totalChaptersToProcess: numChapters,
    currentStoryOutline,
    currentChapterPlan,
    deskTools,
    deskNow,
    agentLogs, liveDraft, lastSavedAt, autosaveStatus,
  };
}
