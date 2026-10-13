import type {RepairReport} from '../utils/novel/v2/repairPackage';
import {addTokenUsage,emptyTokenTotals,savedTokenTotals,type TokenTotals} from '../utils/tokenUsage';
import { allocateThesisWords, renderThesisBook, previousThesisChapter } from '../utils/novel/v2/theses';
import { inputKey } from '../utils/novel/v2/progressive';
import { useState, useRef, useEffect } from 'react';
import { type StorySettings, type AgentLogEntry, GenerationStep, type ChapterData } from '../types';
import { generateText, getStoredProviderConfig, getStoredValidatorConfig, getStoredSecondWriterConfig } from '../services/llmService';
import { browserDuelMemory } from '../utils/novel/v2/duel';
import type { NovelLLM } from '../utils/novel/v2/llm';
import { authorKey } from '../utils/novel/v3/author';
import { deskTabs, deskFocus, type DeskTab, type DeskFocus } from '../utils/novel/v3/deskTabs';
import { HELPER_MODEL, type LabelRequest } from '../utils/novel/v3/envelope';
import { labelHuggingFaceBrowser } from '../services/hfBrowserService';
import { withOllamaOutputRoom } from '../utils/novel/v2/llm';
import { budgetFor, Orchestrator, type ProgressStage } from '../utils/novel/v2/orchestrator';
import { ChapterPipelineV2 } from '../utils/novel/v2/pipeline';
import { downloadJson, restoreSnapshot, snapshotProject } from '../utils/novel/v2/export';
import { PersistentProjectStore } from '../utils/novel/v2/persistent';
import type { ProjectInput } from '../utils/novel/v2/types';
import { playSuccessSound } from '../utils/soundUtils';
import { browserHabitMemory } from '../utils/novel/v2/habits';
import { livePreview } from '../utils/livePreview';
import { readGenerationSettings, saveGenerationSettings, readMainForm, saveMainForm, buildProjectInput, DEFAULT_GENERATION_SETTINGS } from '../utils/generationSettings';

const DEFAULT_SETTINGS = DEFAULT_GENERATION_SETTINGS;

/**
 * What a call is for, in the words a reader of the log would use. v2 prompts
 * name their stage in the first line, so the user prompt — not the shared
 * system contract — is what gets matched.
 */
export function stepName(prompt: string): string {
  const steps: [string, string][] = [
    ['Build three pressure situations', 'Testing character intentions'],
    ['Choose an action for this person', 'Choosing a character action'],
    ['Resolve what follows when independently chosen actions meet', 'Resolving character choices'],
    ['Generate exactly THREE', 'Exploring book plans'],
    ['Compare three candidate plans', 'Choosing the book plan'],
    ['Crystallize the approved short plan', 'Developing the story structure'],
    ['Crystallize the approved structure', 'Developing the chapter map'],
    ['Prepare a compact book construction', 'Designing the book'],
    ['Check whether the provided plan is ready', 'Reviewing the plan'],
    ['Plan only the current chapter', 'Planning the chapter'],
    ['Write a full literary scene', 'Writing a scene'],
    ['Extract the essential changes from the new scene', 'Updating story memory'],
    ['Refine the forward plan', 'Closing the chapter'],
    ['Rewrite the listed sentences so each states what the book holds', 'Correcting a stated fact'],
    ['Write the short passage that goes between the two paragraphs', 'Adding a missing beat'],
    ['Rewrite the listed paragraphs so they no longer stage', 'Condensing a repeated beat'],
    ['Rewrite the listed sentences', 'Repairing repeated prose'],
    ['Check the integrity of the finished book', 'Auditing the finished book'],
  ];
  const matched = steps.find(([key]) => prompt.includes(key));
  return matched ? matched[1] : prompt.slice(0, 60);
}

const STAGES: Record<string, string> = {
  'thesis-synopsis': 'Synopsis',
  'thesis-chapter-development': 'Chapter development · writing',
  'thesis-chapter-development-review': 'Chapter development · review',
  'thesis-chapter-development-repair': 'Chapter development · rewriting only the chapters with findings',
  'thesis-plan': 'Scene plan · writing',
  'thesis-plan-review': 'Scene plan · review',
  'thesis-premise-coverage': 'Scene plan · is every premise given played in a scene?',
  'thesis-plan-stress': 'Scene plan · stress test of the mechanism',
  'thesis-plan-dryrun': 'Scene plan · dry run: is everything in place before the scene that needs it?',
  'thesis-plan-repair': 'Scene plan · repair by field edits',
  'thesis-choice': 'Scene plan · asking one person alone what they would do',
  'thesis-choice-compare': 'Scene plan · does the outline make people act against themselves?',
  'thesis-scene-design': 'Scene plan · redesign',
  'thesis-scene-coverage': 'Scene plan · adding scenes to a short chapter',
  'thesis-scene-review': 'Scene plan · review of the redesign',
  'author-step': 'The author at its desk',
  'author-character': 'The author asks one of its people',
  'author-notebook': 'The author thinks the book through in its notebook',
  'author-clock': 'The author settles the clock: who, where, at what hour, and what the truth comes out by',
  'author-plan': 'The author plans the book',
  'author-chapter': 'The author writes the chapter, once',
  'author-reader': 'A reader reads this far and says what they are waiting for',
  'thesis-block-write': 'writing',
  'thesis-draft-choice': 'choosing between two drafts, blind',
  'thesis-block-review': 'review',
  'thesis-block-repair': 'repair',
  'thesis-habits': 'Naming writing habits in the new scene',
  'thesis-state': 'where things are, and who has learned what',
  'thesis-impact-review': 're-review after an edit',
  'thesis-voice-opponent': 'The opponent speaks for themselves: what I want and what I will do',
  'thesis-voice-protagonist': 'The protagonist speaks for themselves, seeing only what comes before their eyes',
  'thesis-spine': 'Building the story where the two accounts collide',
  'thesis-scene-voices': 'the others in the room say what they came for',
  'thesis-record': 'Taking down what the scene has committed the book to',
  'thesis-expand': 'expanding to length',
  'thesis-expand-review': 'review after expanding',
  'thesis-polish': 'polishing',
  'thesis-polish-review': 'review after polishing',
  'thesis-final-recheck-review': 'final re-review',
  'thesis-seam-review': 'Seam between scenes · review',
  'thesis-seam-final-review': 'Seam between scenes · final review',
  'thesis-seam-repair': 'Seam between scenes · repair',
  'thesis-rough-review': 'Whole book · review',
  'thesis-rough-reconcile': 'Whole-book repair · correcting the plan',
  'thesis-causal-review': 'Whole-book repair · checking the corrected plan',
  'thesis-rough-repair': 'Whole-book repair · patching',
  'thesis-rough-verify': 'Whole-book repair · were the defects resolved?',
  'thesis-rough-candidate-review': 'Whole-book repair · review of the patched book',
  'thesis-expanded-causal-review': 'Whole book · review after expansion',
  'thesis-audit-causal-review': 'Final audit · locating its findings',
  'thesis-audit-repair': 'Final audit · repair',
  'thesis-final-audit': 'Final audit',
};
const SCENE_STAGES = new Set(['thesis-scene-voices', 'thesis-draft-choice', 'thesis-block-write', 'thesis-block-review', 'thesis-block-repair', 'thesis-state', 'thesis-impact-review', 'thesis-expand', 'thesis-expand-review', 'thesis-polish', 'thesis-polish-review', 'thesis-final-recheck-review', 'thesis-rough-repair']);
const SCENE_PATTERNS = [/THE SCENE BOTH DRAFTS WERE ASKED TO WRITE:\n\{"id":"([^"]+)"/, /THE SCENE TO WRITE, AS ITS POINT-OF-VIEW CHARACTER HAS IT:\n\{"id":"([^"]+)"/, /CURRENT THESIS — WRITE DIRECTLY BENEATH THIS ONE:\n\{"id":"([^"]+)"/, /"thesis":"(\S+) \(whole in the outline/, /Current thesis: \{"id":"([^"]+)"/, /CURRENT SCENE ONLY: \{"id":"([^"]+)"/, /\nSCENE (\S+):\n/, /^SCENE (\S+):\n/, /Writable blocks: \["([^"]+)"\]/];

/**
 * What a call is doing, in words a reader of the run can follow: the step, the scene it
 * concerns, and whether it is a first attempt or the repair of a refused answer. Every
 * entry used to show the first sixty characters of the prompt, which is the author's
 * request and is the same for all of them.
 */
export function describeCall(stage: string | undefined, prompt: string): { title: string; reason: string } {
  const evidence = stage?.endsWith('-evidence');
  const base = evidence ? stage!.slice(0, -'-evidence'.length) : stage || '';
  const named = STAGES[base];
  const scene = SCENE_STAGES.has(base) ? SCENE_PATTERNS.map(pattern => prompt.match(pattern)?.[1]).find(Boolean) : undefined;
  let title = named ? (SCENE_STAGES.has(base) ? `Scene ${scene || '?'} · ${named}` : named) : stage ? stage : stepName(prompt);
  if (evidence) title += ' · locating the cited passages';
  const patch = prompt.match(/Validation defect: ([\s\S]{0,400}?)\.\nOriginal task and requirements:/)?.[1];
  const redo = prompt.match(/\nRepair the previous response: ([\s\S]{0,400})/)?.[1];
  const reason = (patch || redo || '').replace(/^Error:\s*/, '').split('\n')[0].slice(0, 240);
  if (patch || redo) title += ' · fixing a refused answer';
  return { title, reason };
}
const size = (characters: number): string => characters >= 1000 ? `${Math.round(characters / 1000)}K` : String(characters);

/**
 * The book's own title when the design carries one. A book designed before P01
 * named its titles falls back to the premise — trimmed at a word, never
 * mid-word, because "...the ships she guides home ha" reads as damage.
 */
export function bookTitle(declared: string | undefined, premise: string): string {
  if (typeof declared === 'string' && declared.trim()) return declared.trim();
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
  const [storySettings, setStorySettings] = useState<StorySettings>(()=>readGenerationSettings(DEFAULT_SETTINGS));
  useEffect(()=>{saveGenerationSettings(storySettings)},[storySettings]);
  useEffect(()=>{saveMainForm(storyPremise,numChapters)},[storyPremise,numChapters]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repairProgress,setRepairProgress]=useState<RepairReport|undefined>();
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

  function getStore(): PersistentProjectStore {
    if (!storeRef.current) throw new Error('Project storage is still opening.');
    return storeRef.current;
  }

  function refreshFromStore() {
    const store = getStore();
    setTokenTotals(savedTokenTotals(store.runLog()));
    const manuscript = store.manuscript();
    const theses = store.loadTheses();
    setRepairProgress(theses?.repair_reports?.at(-1));
    const author = store.loadAuthor();
    setGeneratedChapters(manuscript.map(({ chapter, text }) => ({ title: `Chapter ${chapter}`, content: text, ...(author?.chapters[chapter - 1] ? { plan: `${author.chapters[chapter - 1].card ? `**What the author noted on closing it**\n\n${author.chapters[chapter - 1].card}\n\n` : ''}**What a reader said**\n\n${author.chapters[chapter - 1].reader || '(the author has not asked a reader about this chapter)'}` } : {}), ...(theses ? { plan: renderThesisBook(theses, chapter, false), previousContent: previousThesisChapter(theses, chapter) } : {}) })));
    const progressive = store.loadProgressive();
    if (progressive) {
      const pass = progressive.pending?.pass || progressive.versions.at(-1)?.pass;
      const labels = { story: 'Writing the complete short story', scenes: 'Making choices and consequences clear', prose: 'Bringing the scenes fully into focus', polish: 'Finishing the whole story' };
      setDevelopmentLabel(progressive.completed ? (store.loadReport() ? undefined : 'Reviewing the complete book') : pass ? labels[pass] : 'Planning the whole book');
      setCurrentStoryOutline(progressive.plan);
      setCurrentChapterPlan(`Whole-book draft: ${progressive.pending?.pass || progressive.versions.at(-1)?.pass || 'plan'}`);
    }
    if (theses) {
      setDevelopmentLabel(!theses.plan && theses.chapter_development ? (theses.chapter_development.review?.ready ? 'Dividing chapter development into scenes' : 'Developing and checking chapter progression') : theses.scene_design ? 'Planning scenes and chapter budgets' : theses.rough_gate?.repair ? `Repairing connected story defects · round ${theses.rough_gate.attempts}` : theses.rough_gate && !theses.rough_gate.review?.ready && theses.manifestation?.phase === 'rough' && theses.blocks.length === theses.plan?.theses.length ? 'Checking the complete short book' : theses.completed ? (store.loadReport() ? undefined : 'Reviewing the complete book') : !theses.plan_ready ? 'Clarifying and checking the thesis outline' : theses.manifestation && theses.manifestation.phase !== 'rough' ? `${theses.manifestation.phase}: ${theses.plan!.theses[theses.manifestation.next]?.id || ''}` : `Writing beneath thesis ${theses.plan!.theses[theses.blocks.length]?.id || ''}`);
      setCurrentStoryOutline(renderThesisBook(theses, undefined, false));
      const activeChapter = theses.plan?.theses[theses.blocks.length]?.chapter || currentChapterRef.current || 1;
      setCurrentChapterPlan(renderThesisBook(theses, activeChapter, false));
    }
    setDeskTools(author?.desk ? deskTabs(author.desk) : []);
    if (author) {
      // The left pane shows the author's own desk: the plan it wrote for itself, and its clock.
      setDevelopmentLabel(author.completed ? undefined : author.desk ? `The author is at its desk · step ${author.desk.step} · ${author.desk.budget - author.desk.spent} calls left` : !author.notebook && !author.clock ? 'The author is thinking the book through' : !author.clock ? 'The author is settling who, where and when' : !author.plan ? 'The author is planning the book' : `The author is writing chapter ${Math.min(author.chapters.length + 1, store.loadInput()?.chapter_count || 1)}`);
      setCurrentStoryOutline([author.notebook ? `# The author's notebook\n\n${author.notebook}` : '', author.plan ? `# The author's plan\n\n${author.plan}` : '', author.clock ? `# ${author.desk ? 'The dossier' : 'The clock'}\n\n${author.clock}` : ''].filter(Boolean).join('\n\n') || 'The author has not written its plan yet.');
      const at = author.chapters.at(-1);
      if (author.desk) setCurrentChapterPlan(`**What the author has done, step by step**\n\n${author.desk.journal.slice(-30).map(line => `- ${line}`).join('\n') || '(nothing yet)'}${author.desk.answers.length ? `\n\n**What it was last told**\n\n*${author.desk.answers.at(-1)!.who}:* ${author.desk.answers.at(-1)!.text}` : ''}`);
      else setCurrentChapterPlan(at ? `**Chapter ${author.chapters.length}, as the author noted it**\n\n${at.card}${author.waiting ? `\n\n**What a reader is waiting for now**\n\n${author.waiting}` : ''}${author.noticed.length ? `\n\n**What readers said did not add up** (carried forward, not rewritten)\n\n${author.noticed.map(item => `- ${item}`).join('\n')}` : ''}` : author.plan || 'The first chapter is not written yet.');
    }
    const design = store.loadDesign();
    if (design && !progressive && !theses && !author) {
      setCurrentStoryOutline(
        `Central conflict: ${design.dramatic_core.central_conflict}\nStakes: ${design.dramatic_core.stakes}\nResolution: ${design.ending.central_resolution}`
      );
      setCurrentChapterPlan(JSON.stringify(design.chapter_map, null, 2));
    }

    const input = store.loadInput();
    // A book with no chapter written is not work to continue: it is a book that
    // never started. The form, still holding the premise, is where the author
    // belongs — a resume card offering "0 of 3 chapters written" is not an offer.
    setHasUnfinished(!!input && (author ? !author.completed || !store.loadReport() : theses ? !theses.completed || !store.loadReport() : input.generation_mode === 'theses' ? !store.loadReport() : progressive ? !progressive.completed || !store.loadReport() : input.generation_mode === 'progressive' ? !store.loadReport() : manuscript.length > 0 && manuscript.length < input.chapter_count));
  }

  function publishFinal() {
    const store = getStore();
    const input = store.loadInput();
    if (!input || (store.loadAuthor() && (!store.loadAuthor()!.completed || !store.loadReport())) || (store.loadTheses() && (!store.loadTheses()!.completed || !store.loadReport())) || (store.loadProgressive() && (!store.loadProgressive()!.completed || !store.loadReport()))) return;
    const manuscript = store.manuscript();
    const report = store.loadReport();
    const title = bookTitle(store.loadAuthor()?.title || store.loadTheses()?.plan?.title || store.loadDesign()?.contract?.working_title, input.premise);
    const content = `# ${title}\n\n` + manuscript.map(({ chapter, text }) => `## Chapter ${chapter}\n\n${text}`).join('\n\n');
    setFinalBookContent(content);
    setFinalMetadataJson(JSON.stringify({
      title,
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
      // Set at once as well: a call that starts in the same tick read the previous chapter.
      currentChapterRef.current = chapter || 0;
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
    setCurrentStep(GenerationStep.GeneratingOutline);
    setError(null);
    // A fresh book starts with a clean log; a continued run keeps the trail,
    // otherwise two runs glue together and every stage looks doubled.
    if (fresh) {setAgentLogs([]);setTokenTotals(emptyTokenTotals());setRepairProgress(undefined);}
    setFinalBookContent(null);
    setFinalMetadataJson(null);
    setGeneratedChapters([]);
    setCurrentChapterProcessing(0);
    // The same slot continues: finished chapters are skipped, partial ones restart.
    const store = getStore();
    const writer = getStoredProviderConfig();
    const validator = getStoredValidatorConfig();
    const second = getStoredSecondWriterConfig();
    const modelOf = (config: typeof writer): string => `${config.provider}:${config.provider === 'anthropic' ? config.anthropicModel || 'default' : config.provider === 'huggingface' ? config.hfModel || '?' : config.provider === 'qwen' ? config.qwenModel || 'qwen3.8-flash' : config.provider === 'ollama' ? config.ollamaModel || '?' : config.geminiModel || 'default'}`;
    // Who writes and who reads, said once in the saved log: it can be checked after the fact, not only on screen.
    const helperModel = HELPER_MODEL;
    store.log('models', `author: ${modelOf(writer)} · reader: ${validator ? modelOf(validator) : `the author's own (${modelOf(writer)})`} · small network: huggingface:${helperModel}`);
    const llm: NovelLLM = async (prompt, system, options = {}) => {
      checkActive();
      // The small network that labels sentences for the code, asked quietly. Without a token it fails, and the engine goes on without it.
      if (options.route === 'helper') { const request = JSON.parse(prompt) as LabelRequest; return JSON.stringify(await labelHuggingFaceBrowser(helperModel, request.inputs, request.labels, request.template)); }
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
      const servingTag = role.provider === 'anthropic' ? `Anthropic:${role.anthropicModel || 'default'}` : role.provider === 'huggingface' ? `HF:${role.hfModel || '?'}` : role.provider === 'qwen' ? `Qwen:${role.qwenModel || 'qwen3.8-flash'}` : role.provider === 'ollama'
        ? `Ollama:${role.ollamaModel || '?'}` : `Gemini:${role.geminiModel || 'default'}`;
      setAgentLogs(previous => [...previous, { timestamp: start, chapterNumber: currentChapterRef.current, type: 'execution', message: `${call.title} · ${servingTag}`, details, ...(call.reason ? { outcome: `Refused for: ${call.reason}` } : {}) }]);
      // While an answer arrives: the inspector says how much has come and how fast, and a
      // writer's prose is shown as it is written. Both are refreshed a few times a second at most.
      const writing = /^(author-step|author-chapter|thesis-(block-write|block-repair|expand|polish|seam-repair|rough-repair|audit-repair))$/.test(options.stage || '');
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
          const body = desk ? (/^\**FILE\**\s*:\**\s*[`"']?chapter-\d+/mi.test(now) && /^\**TOOL\**\s*:\**\s*`?(write|append)/mi.test(now) ? now.split(/\n-{3,}[ \t]*\n/)[1] || '' : '') : livePreview(arrived).split(/\n\s*={3,}\s*CARD/i)[0];
          if (body || !desk) setLiveDraft({ label: desk ? `The author is writing ${now.match(/^\**FILE\**\s*:\**\s*[`"']?(chapter-\d+)/mi)?.[1].replace('-', ' ') || 'a chapter'}` : call.title, text: body });
        }
      };
      const live = { onChunk: (chunk: string) => { arrived += chunk; progress(); }, onRestart: (why: string) => { arrived = ''; progress(true); setAgentLogs(previous => previous.map(entry => entry.timestamp === start && entry.details === details && !entry.finished ? { ...entry, outcome: `Asking again: ${why}` } : entry)); } };
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
        result = role.provider === 'ollama'
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
      const orchestrator = new Orchestrator(store, budgetFor(input.chapter_count,input), new ChapterPipelineV2(), (stage, chapter) => {
        if (epoch.current !== token) return;
        handleProgress(stage, chapter);
      }, browserHabitMemory(modelOf(writer)),
        second ? { name: modelOf(second), habits: browserHabitMemory(modelOf(second)), record: browserDuelMemory(`${modelOf(writer)}|${modelOf(second)}`) } : undefined);
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
      store.onSaveStatus = status => { if (live) { setAutosaveStatus(status); setLastSavedAt(status.savedAt); } };
      setAutosaveStatus(store.saveStatus); setLastSavedAt(store.saveStatus.savedAt);
      if (store.saveStatus.state === 'error') { setError(store.saveStatus.error || 'Project storage failed'); setCurrentStep(GenerationStep.Error); }
      const input = store.loadInput();
      if (input) {
        inputRef.current = input;
        setStoryPremise(input.premise);
        setNumChapters(input.chapter_count);
        refreshFromStore();
        if (store.manuscript().length >= input.chapter_count && (!store.loadAuthor() || store.loadAuthor()!.completed && !!store.loadReport()) && (!store.loadProgressive() || store.loadProgressive()!.completed && !!store.loadReport()) && (!store.loadTheses() || store.loadTheses()!.completed && !!store.loadReport())) publishFinal();
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

  async function startGeneration(premise: string, count: number) {
    if (busy.current || !storeRef.current) return;
    const input = buildProjectInput(premise,count,storySettings);
    getStore().clearAll();
    inputRef.current = input;
    setStoryPremise(premise);
    setNumChapters(count);
    await run(input, true);
  }

  async function continueGeneration() {
    if (busy.current || !inputRef.current || !storeRef.current) return;
    let configured:ProjectInput;
    try { configured=buildProjectInput(storyPremise,numChapters,storySettings); }
    catch(error){setError(error instanceof Error?error.message:String(error));setCurrentStep(GenerationStep.Error);return;}
    if(configured.premise!==inputRef.current.premise||configured.chapter_count!==inputRef.current.chapter_count) {
      setError('Premise or chapter count changed. Start a new book with the main-page settings.');setCurrentStep(GenerationStep.Error);return;
    }
    const input={...inputRef.current,...configured};
    if (inputKey(input)!==inputKey(inputRef.current)) {
      const store=getStore(), theses=store.loadTheses();
      if (theses) {
        theses.input_key=inputKey(input);
        if (theses.plan) { theses.plan=allocateThesisWords(theses.plan,input); theses.plan_ready=false; theses.budget_replan=true; theses.rounds=[{plan:structuredClone(theses.plan),review:null}]; delete theses.rough_gate; delete theses.scene_design; delete theses.tool_session; }
        store.saveTheses(theses);
      }
      const progressive=store.loadProgressive();
      if(progressive){progressive.input_key=inputKey(input);store.saveProgressive(progressive);}
      // An author's book goes on under the settings it is resumed with; what is written stays.
      const authored=store.loadAuthor();
      if(authored){authored.input_key=authorKey({...input,generation_mode:'author'});store.saveAuthor(authored);}
      store.clearReport?.(); store.saveInput(input); inputRef.current=input;
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
    if (input && store.manuscript().length >= input.chapter_count && (!store.loadAuthor() || store.loadAuthor()!.completed && !!store.loadReport()) && (!store.loadProgressive() || store.loadProgressive()!.completed && !!store.loadReport()) && (!store.loadTheses() || store.loadTheses()!.completed && !!store.loadReport())) publishFinal();
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
    setRepairProgress(undefined);
    setHasUnfinished(false);
  }

  // Derive from the durable history even when an in-flight poll was started
  // before a hot update; remounting the text view must not erase its baseline.
  const workspaceTheses = storeRef.current?.loadTheses();
  const workspaceReport = storeRef.current?.loadReport();
  const revisionStatus = workspaceReport?.status === 'COMPLETE' && workspaceTheses?.completed && workspaceTheses.final_checks
    && Object.values(workspaceTheses.final_checks).every(check=>check.passed)
    && workspaceTheses.blocks.every(block=>block.review.ready) ? 'Checks passed'
      : workspaceReport?.status === 'COMPLETE_WITH_WARNINGS' ? 'Reviewed · warnings' : 'Draft · not verified';
  const workspaceChapters = workspaceTheses ? generatedChapters.map((chapter, index) => ({...chapter,
    revisionStatus,
    previousContent: previousThesisChapter(workspaceTheses, index + 1)})) : generatedChapters;

  return {
    storyPremise, setStoryPremise, numChapters, setNumChapters, storySettings, setStorySettings,
    isLoading, currentStep, error, developmentLabel,
    isResumable: hasUnfinished && !isLoading,
    tokenTotals, repairProgress, storeReady, exportProject, importProject,
    startGeneration, continueGeneration, resetGenerator, editSettings,
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
