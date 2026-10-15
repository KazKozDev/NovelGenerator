import type { NovelLLM } from '../v2/llm';
import type { ProjectStore } from '../v2/store';
import type { FinalReport, ProjectInput } from '../v2/types';
import { wornPhrases, authorKey, type AuthorDraft, type DeskState } from '../author';
import { normalizeChapterBody, repairStoredFormatting } from '../manuscript';
import { CraftSession, revision } from './state';
import { planArchitecture, preflightArchitecture, acceptedArchitecture, acceptArchitecture } from './planning';
import { projectArchitecture, prepareExecution, executionPrompt, commitEnacted, emptyEnacted, applyExecutionToCard, continueArchitecture } from './runtime';
import type { AuthorArchitecture, EnactedState, SceneExecution } from './types';
import { restructureBook, recoverSavedBook, type SceneSource } from './revision';
import { DRAFT_WRITER_SYSTEM } from './prose';
import { wholeBookContext } from './manuscriptContext';
import { bookLayout, projectionMetrics, wordPositions, openingWindow } from './metrics';
import { planSeries, betaReaders, compareBooks } from './readerTools';
import { validateReceipt, sceneNeedsRepair, observeScene, type Observation } from './observer';
import { preflightPacket, projectPacket, validatePacket } from './projection';
import { blindWriterContext, readBlind, readBlindPrefix } from './blindContext';
import { extractUsedImagery, stripSubtextDecoding, joinScenesWithCameraBreaks } from './craftRules';
import type { TrackedPropState } from './types';
import type { ProgressStage } from '../v2/orchestrator';
import { reviseManuscript, editorialReport, manuscriptText, EDITORIAL_FOCUSES, CORE_EDITORIAL_FOCUSES } from './editorial';

export const AUDIT_STAGES = new Set(['craft-dev-review', 'craft-lit-review', 'craft-preflight', 'craft-beta-reader', 'craft-comparables', 'craft-observe']);
export const AUDIT_CALLS = 16;

/** Edit saved prose; never call preparation, projection or scene drafting here. */
export async function runCraftEditorial(input: ProjectInput, store: ProjectStore, llm: NovelLLM, onProgress: (stage: ProgressStage, chapter?: number) => void, legacyDraft = false, editorialFocuses = EDITORIAL_FOCUSES): Promise<void> {
  repairStoredFormatting(store);
  const draft = store.loadAuthor();
  const source = store.manuscript();
  if (!draft?.desk || draft.input_key !== authorKey(input) || source.length !== input.chapter_count || source.some(c => !c.text.trim())) throw new Error('Editing requires the saved complete manuscript with its original input.');
  const desk = draft.desk;
  const editorialInput = { ...input, plan_feedback: [input.plan_feedback, desk.files['preflight.json'], desk.files['deferred-work.json']].filter(Boolean).join('\n') };
  const resumed = desk.editorial?.active;
  const startedAt = resumed ? desk.editorial!.startedAt : new Date().toISOString();
  const archive = `editorial-${Date.parse(startedAt)}`;
  if (!resumed) {
    desk.editorial = { active: true, sourceFiles: { ...desk.files }, sourceReport: store.loadReport(), startedAt };
    desk.files[`${archive}-source.json`] = JSON.stringify({ chapters: source, report: store.loadReport() });
  }
  draft.completed = false;
  desk.finished = false;
  store.saveAuthor(draft);
  store.clearReport();
  store.checkpoint(archive);
  onProgress('audit');
  let pendingScenes: SceneSource[] | undefined;
  const persistChapters = (chapters: { chapter: number; text: string }[], focus: string) => {
    const changed = chapters.some(c => desk.files[`chapter-${c.chapter}.md`] !== c.text);
    if (changed) desk.answers.forEach(answer => { if (/reader|observer/i.test(answer.who)) answer.stale = true; });
    for (const c of chapters) {
      desk.files[`chapter-${c.chapter}.md`] = c.text;
      draft.chapters[c.chapter - 1] = { ...(draft.chapters[c.chapter - 1] || { card: '', facts: '', reader: '' }), text: c.text };
    }
    desk.files['book.md'] = manuscriptText(chapters);
    if (pendingScenes) { desk.files['revision-scene-index.json'] = JSON.stringify(pendingScenes); pendingScenes = undefined; }
    if (changed && desk.files['enacted-state.json']) desk.files['enacted-state.json'] = JSON.stringify({ ...JSON.parse(desk.files['enacted-state.json']), stale: true });
    desk.files[`${archive}-${focus}-${Date.now()}.json`] = JSON.stringify(chapters);
    desk.journal.push(`Editorial ${focus} applied`);
    store.commitRevision(chapters, draft);
  };
  const session = legacyDraft && !desk.files['engine-state.json'] ? undefined : new CraftSession(desk.files, authorKey(input), async () => {
    store.saveAuthor(draft);
    const durable = store as ProjectStore & { flush?: () => Promise<void> };
    if (durable.flush) await durable.flush();
  });
  let editorialSource = source;
  if (session && !desk.files[`${archive}-structural-commit.json`]) {
    await session.phase('structural-revision');
    await recoverSavedBook(input, source, session, llm);
    const structural = await restructureBook(input, source, session, llm);
    pendingScenes = structural.scenes;
    persistChapters(structural.chapters, 'structural');
    editorialSource = structural.chapters;
    await session.put(`${archive}-structural-commit.json`, { source, result: structural.chapters });
  }
  const edited = await reviseManuscript(editorialInput, editorialSource, llm, persistChapters, review => {
    desk.answers.push({ who: `the review (${review.focus})`, step: ++desk.step, about: 'complete book', text: JSON.stringify(review) });
    store.log('craft-audit', `${review.focus}: ${review.issues.length} findings; ${review.failures.length} unavailable checks`);
    store.saveAuthor(draft);
  }, editorialFocuses, session ? {
    context: chapters => wholeBookContext(chapters, session, llm),
    structural: async (chapters, review) => { const revision = await restructureBook(input, chapters, session, llm, review); pendingScenes = revision.scenes; return revision.chapters; },
    phase: async focus => { await session.phase(focus === 'proofread' ? 'proofread' : focus === 'copyedit' ? 'copyedit' : ['baseline-literary', 'line'].includes(focus) ? 'line-edit' : 'structural-revision'); },
  } : undefined);
  desk.files[`${archive}-history.json`] = JSON.stringify(edited.history);
  const readers = await betaReaders(input, edited.chapters, llm, review => {
    desk.answers.push({ who: review.focus, step: ++desk.step, about: 'current complete book', text: JSON.stringify(review) });
    store.saveAuthor(draft);
  }, session);
  desk.files['word-positions.json'] = JSON.stringify(wordPositions(edited.chapters));
  desk.files['opening-window.json'] = JSON.stringify(openingWindow(edited.chapters));
  try {
    const comparison = await compareBooks(input, edited.chapters, llm, session ? await wholeBookContext(edited.chapters, session, llm) : undefined);
    if (comparison) desk.files['comparable-books.json'] = comparison;
  } catch (error) { readers.push({ focus: 'comparables', issues: [], failures: [String(error)] }); }
  const unavailableScenes: string[] = [];
  for (const [name, raw] of Object.entries(desk.files)) {
    if (!/^scene-\d+-observation\.json$/.test(name)) continue;
    try { const o = JSON.parse(raw) as Observation; if (!o.receipt) unavailableScenes.push(`${name}: observer unavailable; ${o.failures.join('; ')}`); }
    catch { unavailableScenes.push(`${name}: invalid saved observer assessment`); }
  }
  const report = editorialReport(edited.chapters, input.chapter_count, [...edited.reviews, ...readers, ...(unavailableScenes.length ? [{ focus: 'scene-observer-coverage', issues: [], failures: unavailableScenes }] : [])], input.target_total_words);
  store.saveReport(report);
  if (session) await session.phase('complete');
  desk.finished = true;
  desk.editorial!.active = false;
  draft.completed = report.status === 'COMPLETE' || report.status === 'COMPLETE_WITH_WARNINGS';
  store.saveAuthor(draft);
  onProgress('done');
}

export function extractTitle(text: string): string | undefined {
  const regex = /(?:^|\r?\n)[#*\-\d.\t ]*(?:BOOK[ \t]+)?TITLE\**[ \t]*:\**[ \t]*([^\r\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    let raw = m[1].replace(/^["'`*#\s]+|["'`*#\s]+$/g, '').trim();
    raw = raw.replace(/^(?:BOOK\s+)?TITLE\**\s*:\**\s*/i, '').trim();
    if (raw && raw.length >= 2 && raw.length <= 100 && !/^(undefined|null|none|n\/a|<[^>]+>)$/i.test(raw)) {
      return raw;
    }
  }
  // Check top-level markdown header: # Book Title
  const headerMatch = text.match(/^\s*#\s+([^\r\n]+)/m);
  if (headerMatch) {
    const raw = headerMatch[1].replace(/^["'`*#\s]+|["'`*#\s]+$/g, '').trim();
    if (raw && raw.length >= 2 && raw.length <= 100 && !/^(author\s+dossier|story\s+dossier|dossier|untitled)/i.test(raw)) {
      return raw;
    }
  }
  return undefined;
}

export function cleanFallbackTitle(premise: string): string {
  const text = premise.replace(/\s+/g, ' ').trim();
  if (!text) return 'Untitled Book';
  if (text.length <= 50) return text;
  const cut = text.slice(0, 50);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut)
    .replace(/[,;:\s\-—]+$/, '')
    .replace(/\b(and|or|but|the|a|an|in|on|at|to|for|with|by|who|which|that|is|was|are|were)\b$/i, '')
    .trim();
  return safe || 'Untitled Book';
}

export interface PropAnchor {
  name: string;
  role: 'setup' | 'complication' | 'payoff';
  camouflage?: string[]; // Mundane companion items (Rule of Three) to defuse premature spotlight
  focusInstruction?: string; // Guidance for casual introduction without foreshadowing
}

export interface DramaticIronyDirective {
  detail: string; // External environmental reality visible to reader
  readerVisible?: boolean; // Gardner psychic distance 1
  characterAware?: boolean; // Strictly false
}

export interface ValueCharge {
  start: string;
  end: string;
  shift: '+ to -' | '- to +';
}

export interface CardConflict {
  external?: string;
  interpersonal?: string;
  internal?: string;
}

export interface CardStakes {
  atRisk: string;
  costOfChoice: string;
}

export interface Card {
  id: string;
  chapter: number;
  order: number;
  pov?: string;
  goal?: string;
  targetWords?: number;
  writerDirectives?: string;
  sceneType?: 'scene' | 'sequel'; // Swain's pulse: Action (Goal->Conflict->Disaster) vs Reaction (Emotion->Dilemma->Decision)
  time: string;
  location: string;
  causalLink: 'therefore' | 'but';
  valueCharge: ValueCharge;
  conflict?: CardConflict; // Dynamic conflict layers per scene type
  dramaticIrony?: boolean | string | DramaticIronyDirective; // Hitchcock suspense: reader sees external threat while character is ignorant
  stakes?: CardStakes; // Concrete immediate stakes and cost
  purpose: string;
  action: string;
  choice: string;
  cost: string;
  change: string;
  dialogueAims: Record<string, string>;
  rhythm: string;
  readerBefore: string;
  readerAfter: string;
  endingCadence?: 'cliffhanger' | 'quiet-resonance';
  endingType?: 'interrupted-action' | 'new-reveal' | 'impossible-choice' | 'arrival-of-threat' | 'loaded-line' | 'pause';
  openLoopsIntroduced?: string[];
  openLoopsResolved?: string[];
  dependsOn: string[];
  povKnows: string[];
  newFacts: string[];
  props: string[];
  propAnchors?: PropAnchor[];
}

export interface Fact {
  id: string;
  text: string;
  kind: string;
  learnsAt: number;
  source: string;
}

export interface Packet {
  preflight?: { issues: { status: 'demonstrated' | 'uncertain'; reason: string; sources: string[] }[]; failures: string[] };
  dossierClarifications?: string;
  title?: string;
  names: Record<string, string>;
  initialProtagonistKnowledge: string[];
  facts: Fact[];
  scenes: Card[];
}

export interface Receipt {
  event: { status: 'enacted' | 'missing' | 'contradicted'; sources: string[]; reason: string };
  tangibleActionEnacted: boolean;
  valueChargeTurned?: boolean;
  isRepetitiveOrClichéd?: boolean;
  facts: { id: string; text: string; kind: string; knownBy: string[]; source: string }[];
  issues: { reason: string; sources: string[]; kind?: 'factual' | 'knowledge' | 'causal' | 'style' | 'uncertain'; status?: 'demonstrated' | 'uncertain' }[];
  wordCount: number;
}

function parseJson<T>(raw: string): T {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    for (let i = stripped.lastIndexOf('{'); i >= 0; ) {
      try {
        return JSON.parse(stripped.slice(i).replace(/\s*```$/i, '')) as T;
      } catch {}
      if (i === 0) break;
      i = stripped.lastIndexOf('{', i - 1);
    }
    throw new Error('Failed to parse JSON response: ' + raw.slice(0, 240));
  }
}

const wc = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0);

export const CRAFT_SYSTEM = `You are a master fiction author writing a published literary novel.
You follow the rigorous craft principles of "How Books Are Written: Craft, Structure, and Bestseller Techniques":

THE CORE MODEL: TWO LEVELS OF CRAFT & ONE LAW
1. ARCHITECTURE (The Skeleton):
   - What happens, why, and why the reader keeps turning pages.
   - THE CENTRAL LAW (Brandon Sanderson): PROMISE / PROGRESS / PAYOFF.
     A chapter (scene, book) makes a promise to the reader — delivers tangible, felt progress toward that promise — and finally pays it off with a consequence that immediately sets up a new promise.
     Every scene hinges on Cause-Choice-Action-Consequence: active, consequential choices.
   - The "But / Therefore" Law: scenes are causally linked by complication ("but") or direct consequence ("therefore"), never episodic "and then".
   - Value Charge Shift: every scene must turn the protagonist's value charge (+ to - or - to +). No static scenes.
   - 4 Layers of Truth: objective truth vs character POV knowledge vs character false beliefs vs reader evidence.

2. LINE-LEVEL PROSE (The Flesh and Skin):
   - ANTI-METAPHOR DIRECTIVE:
     You must enact actual physical actions, bodily gestures, spoken dialogue, tangible props, and physical contact on the page.
     Do NOT substitute physical action or intimacy with vague cosmic metaphors, dreamlike fade-outs, or repeating poetic figures ("the world turned to ash", "a pulse like frozen fire").
   - PERCEPTUAL ORDER (Immediate Experience):
     In moments of stress or action, physical sensory impact comes first, involuntary visceral reaction second, and conscious cognitive understanding third. Never put explanation before physical sensation.
   - BURN FILTER WORDS (Deep POV):
     Eliminate distancing filter words: "he saw", "she felt", "he noticed", "it seemed to her", "she heard". Ground experience directly in the physical reality.
   - OBLIQUE DIALOGUE & STAGE BUSINESS:
     Dialogue is combat with subtext. Characters deflect, counter with offensive questions, and negotiate over physical props and tasks. Ban fancy speech tags ("he hissed", "she gasped", "he retorted") and "-ly" adverbs; use clean action beats or invisible "said".
   - TIME DILATION & END-WEIGHT:
     Dilate time during climactic moments by capturing micro-sensory details. Place the most impactful, resonant word of key sentences immediately before the period.
   - THE TWO-SENSE RULE:
     In every key scene, engage at least one non-visual sense (tactile texture/temperature, smell, or specific sound).
   - NARRATIVE PERSPECTIVE & TENSE (THE 85% ABSOLUTE STANDARD):
     * Third Person Limited (Third-Person Limited POV): Anchor strictly inside the viewpoint character's sensory perception and immediate consciousness. Use he/she/they.
     * Past Tense (Past Tense Narration): The invisible font of fiction («The lock gave under his thumb. Bruce stepped inside and pulled the door shut behind him.»). All narration, stage business, and beats must be written in past tense (walked, looked, gave, spoke), NEVER present tense.
   - Clean, professional fiction prose in English only. Continuous story text with natural paragraph transitions. No meta-commentary, chapter headings, or author notes in the manuscript text.`;

export async function runCraftBook(
  input: ProjectInput,
  store: ProjectStore,
  llm: NovelLLM,
  onProgress: (stage: ProgressStage, chapter?: number) => void
): Promise<{ status: FinalReport['status']; summary: string }> {
  const numChapters = Math.max(1, input.chapter_count || 3);
  const layout = bookLayout(numChapters, input.target_total_words);
  const totalScenes = layout.scenes;
  const targetWordsPerScene = layout.wordsPerScene;

  onProgress('design');

  const savedDraft = store.loadAuthor();
  let savedPacket: Packet | undefined;
  if (savedDraft?.input_key === authorKey(input) && savedDraft.desk?.files['packet.json'] && savedDraft.desk.files['dossier.md']) {
    try { savedPacket = parseJson<Packet>(savedDraft.desk.files['packet.json']); validatePacket(savedPacket, numChapters, savedDraft.desk.files['engine-state.json'] ? undefined : totalScenes); }
    catch {
      if (store.manuscript().length) throw new Error('The saved manuscript uses a different scene layout. It is preserved; use Edit saved book, or start a fresh project for the restored three-scenes-per-chapter pipeline.');
      savedPacket = undefined;
    }
  }
  const previousAnswers = store.loadAuthor()?.desk?.answers || [];
  const previousJournal = store.loadAuthor()?.desk?.journal || [];
  const files: Record<string, string> = savedDraft?.input_key === authorKey(input) ? { ...savedDraft.desk?.files } : {};
  if (savedDraft?.input_key === authorKey(input) && !savedPacket && !files['engine-state.json'] && store.manuscript().length) {
    throw new Error('The saved manuscript has no compatible scene plan. Its text is preserved; recover the saved project or use saved-book editing instead of generating over it.');
  }
  if (savedDraft?.input_key === authorKey(input) && !files['engine-state.json'] && !savedPacket && !files['pre-author-engine-source.json']) {
    files['pre-author-engine-source.json'] = JSON.stringify({ draft: savedDraft, manuscript: store.manuscript(), report: store.loadReport(), input: store.loadInput() });
  }
  const answers: DeskState['answers'] = [];
  const journal: string[] = [];
  let activeTitle = input.title?.trim() || '';

  const isPremiseFallback = (t?: string): boolean => {
    if (!t) return false;
    const trimmed = t.trim();
    const premiseTrimmed = input.premise.trim();
    return trimmed === cleanFallbackTitle(premiseTrimmed) || (premiseTrimmed.startsWith(trimmed) && trimmed.length <= 80);
  };

  const existingAuthor = store.loadAuthor();
  if (!activeTitle && existingAuthor?.title && !isPremiseFallback(existingAuthor.title)) {
    activeTitle = existingAuthor.title.trim();
  }

  // Helper to sync state to store
  function syncAuthorState(options: {
    title?: string;
    dossier?: string;
    cardsMd?: string;
    timelineMd?: string;
    chaptersData?: { text: string; card: string; facts: string; reader: string }[];
    completed?: boolean;
    waiting?: string;
  } = {}) {
    const existing = store.loadAuthor();
    if (options.title?.trim()) {
      activeTitle = options.title.trim();
    }
    const resolvedTitle = activeTitle || existing?.title || (options.completed ? cleanFallbackTitle(input.premise) : '');
    const draft: AuthorDraft = {
      version: 1,
      input_key: authorKey(input),
      notebook: options.dossier ?? existing?.notebook ?? '',
      clock: options.timelineMd ?? existing?.clock ?? '',
      plan: options.cardsMd ?? existing?.plan ?? '',
      title: resolvedTitle,
      chapters: options.chaptersData ?? existing?.chapters ?? [],
      waiting: options.waiting ?? existing?.waiting ?? '',
      noticed: existing?.noticed ?? [],
      completed: options.completed ?? existing?.completed ?? false,
      desk: {
        files: { ...existing?.desk?.files, ...files },
        answers: [...previousAnswers, ...answers],
        journal: [...previousJournal, ...journal],
        step: journal.length,
        budget: 100,
        spent: journal.length,
        finished: options.completed ?? false,
      },
    };
    store.saveAuthor(draft);
  }

  // Craft 2.0 is the primary, deterministic engine (Dossier -> Cards -> Preflight -> Blind Write -> Observer -> Dual Review).
  // When generation_mode === 'craft' (default UI setting), the clean Craft 2.0 pipeline is strictly executed.
  const usesAuthorEngine = input.generation_mode !== 'craft' && (input.generation_mode === 'author' || !!files['engine-state.json'] || !savedPacket);
  let architecture: AuthorArchitecture | undefined;
  let session: CraftSession | undefined;
  let dossier = files['dossier.md'] || '';
  let packet: Packet;
  if (usesAuthorEngine) {
    session = new CraftSession(files, authorKey(input), async () => {
      syncAuthorState();
      const durable = store as ProjectStore & { flush?: () => Promise<void> };
      if (durable.flush) await durable.flush();
    });
    journal.push('Growing concept, objective events, character engines and causal scene architecture');
    const series = files['series-bible.json'] || await planSeries(input, llm);
    if (series) { files['series-bible.json'] = series; syncAuthorState(); }
    architecture = acceptedArchitecture(session);
    if (!architecture) {
      architecture = await planArchitecture(input, session, llm);
      architecture = await preflightArchitecture(architecture, session, llm);
      await acceptArchitecture(architecture, session);
    }
    packet = projectArchitecture(architecture);
    validatePacket(packet, numChapters, architecture.form.sceneSlots.length, architecture.form.layout);
    dossier = `# ${architecture.concept.title}\n\n${architecture.concept.synopsis}\n\n## Ending mechanism\n${JSON.stringify(architecture.concept.ending, null, 2)}\n\n## Objective events\n${JSON.stringify(architecture.world, null, 2)}\n\n## Character engines\n${JSON.stringify(architecture.characters, null, 2)}`;
    files['dossier.md'] = dossier;
    await session.phase('draft');
  } else if (savedPacket) {
    packet = savedPacket;
    if (!store.manuscript().length) {
      try {
        packet = await preflightPacket(packet, input.premise, dossier, numChapters, llm, (raw, candidate) => {
          answers.push({ who: 'the preflight auditor', step: journal.length, about: 'scene cards', text: raw });
          files['preflight.json'] = raw;
          files['packet.json'] = JSON.stringify(candidate);
          syncAuthorState();
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        store.log('craft-preflight', `Preflight advisory note (${msg}); proceeding with saved plan.`);
        answers.push({ who: 'the preflight auditor (advisory)', step: journal.length, about: 'scene cards', text: msg });
        if (files['packet.json']) {
          try { packet = JSON.parse(files['packet.json']); } catch { /* retain savedPacket */ }
        }
      }
    }
  } else {
    // Stage 1: Author Dossier (4 Layers of Truth)
    if (!dossier) {
      journal.push('Developing author dossier & 4 layers of truth');
      store.log('craft-preparation', 'Developing author dossier (4 Layers of Truth)...');
      const prepPrompt = `${CRAFT_SYSTEM}

EXPERIMENT CONTRACT:
Premise: ${input.premise}
Genre: ${input.genre || 'literary fiction'}
Requirements: ${input.author_requirements || 'none'}
Scope: ${numChapters} chapters (${totalScenes} scenes total, ~${targetWordsPerScene} words per scene).

Develop an ORIGINAL, psychologically grounded, complete author-only dossier (~1800-2400 words) before writing any prose:
${!activeTitle ? `0. BOOK TITLE:
   - BOOK TITLE: <Invent an original, evocative, commercial 2-5 word title for this book. Do NOT copy the premise text.>` : `0. BOOK TITLE:
   - BOOK TITLE: ${activeTitle}`}
1. OBJECTIVE TRUTH & PRE-STORY REALITY:
   - The concrete objective facts that took place before the story begins.
   - Stable cast, locations, and key physical props.
2. CHARACTER PSYCHOLOGY, MOTIVES & COSTS:
   - For protagonist and key counterparts: specific wants, hidden fears, false strategies, boundaries, and price of each choice.
3. CHRONOLOGICAL TIMELINE & 4 LAYERS OF TRUTH:
   - Separate: 1) What really happened; 2) What protagonist knows initially; 3) What characters falsely believe; 4) What the reader will see.
4. CAUSAL PROGRESSION & ANTI-METAPHOR DESIGN:
   - The chain of cause-choice-action-consequence across ${totalScenes} scenes.
   - Outline pivotal turning points with concrete physical and dialogue actions, not metaphorical fade-outs.
5. SCENE MILESTONES (${totalScenes} SCENES):
   - Outline broad goals for SC1 through SC${totalScenes} (3 scenes per chapter).

Output the author dossier only.`;

      dossier = await llm(prepPrompt, CRAFT_SYSTEM, { stage: 'craft-preparation', temperature: 0.8, maxTokens: 8000 });
      files['dossier.md'] = dossier;
      const dossierTitle = extractTitle(dossier);
      if (!activeTitle && dossierTitle && !isPremiseFallback(dossierTitle)) {
        activeTitle = dossierTitle;
      }
      syncAuthorState({ dossier, title: activeTitle });
    }

    // Stage 2: Scene Projection Cards (packet.json)
    journal.push('Building scene projection cards & knowledge registry');
    store.log('craft-cards', `Projecting story into ${totalScenes} executable scene cards...`);

    const scenesPerChapter = Math.round(totalScenes / numChapters);
    const cardsPrompt = `AUTHOR DOSSIER:
${dossier}

Project this exact story into an executable scene projection for ${totalScenes} chronological scenes (${scenesPerChapter} per chapter).
Separate objective truth from protagonist initial knowledge and newly acquired facts.
No hidden future information in a scene's POV knowledge.
Every fact referenced in povKnows must have learnsAt < scene.order.
Props must be concrete objects with owner and location.
Enact physical, bodily presence, dialogue aims, and concrete choices.

SCENE ARCHITECTURE PRINCIPLES:
1. SWAIN/BICKHAM PULSE & CONFLICT LAYERING:
   - "sceneType": "scene" (Action: Goal -> Conflict -> Disaster). Conflict is dominated by external obstacles and interpersonal friction. Do NOT force characters into artificial philosophical introspection or relationship dissection while dodging bullets or handling immediate physical crises.
   - "sceneType": "sequel" (Reaction: Emotion -> Dilemma -> Decision). Conflict is dominated by internal hesitation, cognitive dissonance, and choosing between bad alternatives. External obstacles remain ambient.
2. DRAMATIC IRONY (HITCHCOCK SUSPENSE):
   - When suspense is desired, set "dramaticIrony": {"detail": "...", "readerVisible": true, "characterAware": false}. The reader sees the ticking bomb or hidden threat, but the POV character remains unaware (respecting povKnows).
3. CHEKHOV PROP CAMOUFLAGE (DEFUSING THE SPOTLIGHT):
   - Use "propAnchors": [{"name": "...", "role": "setup|complication|payoff", "camouflage": ["mundane item 1", "mundane item 2"], "focusInstruction": "rule of three"}] to naturally conceal crucial setup props among ordinary items without drawing artificial spotlight.

Return JSON matching:
{
  "title": "Evocative 2-5 Word Book Title",
  "names": {"protagonist": "Full Name", "counterpart": "Full Name"},
  "initialProtagonistKnowledge": ["initial pre-story facts"],
  "facts": [
    {"id": "F1", "text": "specific fact", "kind": "objective|claim|belief", "learnsAt": 0, "source": "backstory or scene ID"}
  ],
  "scenes": [
    {
      "id": "SC1",
      "chapter": 1,
      "order": 1,
      "causalLink": "therefore",
      "sceneType": "scene",
      "time": "precise time",
      "location": "stable place",
      "purpose": "dramatic purpose",
      "action": "concrete physical action and dialogue to enact",
      "choice": "protagonist specific choice",
      "cost": "what is sacrificed",
      "change": "resulting change in relationship or situation",
      "dialogueAims": {"protagonist": "...", "other": "..."},
      "rhythm": "action|reaction|quiet tension",
      "readerBefore": "what reader suspects",
      "readerAfter": "what is revealed",
      "dependsOn": [],
      "povKnows": ["F1"],
      "newFacts": ["F2"],
      "props": ["concrete object"],
      "propAnchors": [{"name": "object", "role": "setup", "camouflage": ["item A", "item B"]}],
      "dramaticIrony": {"detail": "external threat visible to reader", "readerVisible": true, "characterAware": false},
      "valueCharge": {"start": "neutral", "end": "threatened", "shift": "+ to -"},
      "conflict": {"external": "external task", "interpersonal": "interpersonal friction", "internal": "internal hesitation"}
    }
  ]
}
Exactly ${totalScenes} scenes, order 1..${totalScenes}, chapter = ceil(order/3). Dependencies only on earlier scenes.`;

    packet = await projectPacket(cardsPrompt, CRAFT_SYSTEM, totalScenes, numChapters, llm);
    validatePacket(packet, numChapters, totalScenes);
    if ((!activeTitle || isPremiseFallback(activeTitle)) && packet.title?.trim() && !isPremiseFallback(packet.title)) {
      const cleaned = packet.title.trim().replace(/^["'`*#\s]+|["'`*#\s]+$/g, '');
      if (cleaned && cleaned.length >= 2 && cleaned.length <= 100) {
        activeTitle = cleaned;
      }
    }
    files['packet.json'] = JSON.stringify(packet);
    syncAuthorState({ title: activeTitle });

    // Stage 3: Preflight Validation
    journal.push('Running preflight audit');
    store.log('craft-preflight', 'Auditing scene cards for causal consistency...');
    try {
      packet = await preflightPacket(packet, input.premise, dossier, numChapters, llm, (raw, candidate) => {
        answers.push({ who: 'the preflight auditor', step: journal.length, about: 'scene cards', text: raw });
        files['preflight.json'] = raw;
        files['packet.json'] = JSON.stringify(candidate);
        syncAuthorState({ title: activeTitle });
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      store.log('craft-preflight', `Preflight advisory note (${msg}); proceeding with retained valid plan.`);
      answers.push({ who: 'the preflight auditor (advisory)', step: journal.length, about: 'scene cards', text: msg });
      if (files['packet.json']) {
        try { packet = JSON.parse(files['packet.json']); } catch { /* retain candidate */ }
      }
    }
  }
  syncAuthorState({ dossier, title: activeTitle });
  files['packet.json'] = JSON.stringify(packet);
  files['reader-promises-plan.json'] = JSON.stringify(projectionMetrics(packet));

  if ((!activeTitle || isPremiseFallback(activeTitle)) && packet.title?.trim() && !isPremiseFallback(packet.title)) {
    const cleaned = packet.title.trim().replace(/^["'`*#\s]+|["'`*#\s]+$/g, '');
    if (cleaned && cleaned.length >= 2 && cleaned.length <= 100) {
      activeTitle = cleaned;
    }
  }

  // If still no title or only a premise fallback, dedicated title generation pass
  if (!activeTitle || isPremiseFallback(activeTitle)) {
    try {
      const titlePrompt = `Based on this premise and story dossier, invent ONE compelling, original, evocative commercial book title (2 to 5 words). Do NOT repeat or quote the premise text. Output ONLY the title text, nothing else.\n\nPremise: ${input.premise}\nGenre: ${input.genre || 'literary fiction'}\n\nTitle:`;
      const generated = await llm(titlePrompt, 'You are an acclaimed book editor. Return ONLY the title text.', { stage: 'craft-title', temperature: 0.7, maxTokens: 40 });
      const cleaned = generated.replace(/^["'`*#\s]+|["'`*#\s]+$/g, '').split('\n')[0].trim();
      if (cleaned && cleaned.length >= 2 && cleaned.length <= 80 && !isPremiseFallback(cleaned)) {
        activeTitle = cleaned;
      }
    } catch {
      // Fallback will be handled by cleanFallbackTitle
    }
  }
  if (!activeTitle) {
    activeTitle = cleanFallbackTitle(input.premise);
  }

  // Format cards as human-readable markdown plan
  const cardsMarkdown = `# ${activeTitle}\n\n` + packet.scenes.map(s => `### Scene ${s.order} (${s.id}) · Chapter ${s.chapter} [${(s.sceneType || 'scene').toUpperCase()}]
- **Causal Link:** ${s.order === 1 ? 'Opening Scene' : (s.causalLink || 'therefore').toUpperCase()}
- **Value Charge Shift:** ${s.valueCharge?.start || '?'} → ${s.valueCharge?.end || '?'} (${s.valueCharge?.shift || 'turn'})
- **Location & Time:** ${s.location} (${s.time})
- **POV & Goal:** ${s.pov || 'protagonist'} — ${s.goal || s.purpose}
- **Target Words:** ${s.targetWords || targetWordsPerScene}
- **Conflict Profile (${s.sceneType === 'sequel' ? 'Sequel / Internal Dominant' : 'Action / External Dominant'}):**
  * *External:* ${s.conflict?.external || 'Ambient'}
  * *Interpersonal:* ${s.conflict?.interpersonal || 'Ambient'}
  * *Internal:* ${s.conflict?.internal || 'Ambient'}
${s.dramaticIrony ? `- **Dramatic Irony (Reader Suspense):** ${typeof s.dramaticIrony === 'object' && s.dramaticIrony !== null && 'detail' in s.dramaticIrony ? s.dramaticIrony.detail : typeof s.dramaticIrony === 'string' ? s.dramaticIrony : 'Active external detail visible to reader while character is ignorant'}\n` : ''}- **Stakes & Cost:** At risk: ${s.stakes?.atRisk || 'N/A'} | Cost: ${s.stakes?.costOfChoice || s.cost || 'N/A'}
- **Purpose:** ${s.purpose}
- **Action:** ${s.action}
- **Choice:** ${s.choice}
- **Ending:** ${s.endingCadence || 'standard'} (${s.endingType || 'resolution'})
- **Props & Chekhov Anchors:** ${s.propAnchors?.length ? s.propAnchors.map(p => `${p.name} [${p.role}${p.camouflage?.length ? `; camo: ${p.camouflage.join(', ')}` : ''}]`).join(', ') : s.props?.join(', ') || 'none'}
${s.openLoopsIntroduced?.length ? `- **Open Loops Introduced:** ${s.openLoopsIntroduced.join('; ')}\n` : ''}${s.openLoopsResolved?.length ? `- **Open Loops Resolved:** ${s.openLoopsResolved.join('; ')}\n` : ''}- **Change:** ${s.change}`).join('\n\n---\n\n');
  files['plan.md'] = cardsMarkdown;
  syncAuthorState({ cardsMd: cardsMarkdown, title: activeTitle });

  // =========================================================================
  // STAGE 4: Scene-by-Scene Blind Writing Loop
  // =========================================================================
  let enacted: EnactedState = session?.files['enacted-state.json'] ? session.read<EnactedState>('enacted-state.json') : emptyEnacted();
  const pages: string[] = [];
  const chaptersText: string[] = [];
  const knownFacts = new Set<string>();
  for (const f of packet.facts || []) {
    if (f.learnsAt === 0) knownFacts.add(f.id);
  }

  // Tracking dynamic stop-list of metaphors & physical object state graph
  let usedImagery: string[] = [];
  try {
    if (files['used-imagery.json']) usedImagery = JSON.parse(files['used-imagery.json']);
  } catch { /* use empty */ }

  let objectStates: Record<string, TrackedPropState> = {};
  try {
    if (files['object-states.json']) objectStates = JSON.parse(files['object-states.json']);
  } catch { /* use empty */ }
  if (!Object.keys(objectStates).length && packet.scenes) {
    for (const sc of packet.scenes) {
      for (const p of sc.props || []) {
        const pid = p.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        if (!objectStates[pid]) {
          objectStates[pid] = {
            id: pid,
            name: p,
            location: `${packet.names?.protagonist || 'Protagonist'}'s possession`,
          };
        }
      }
    }
    files['object-states.json'] = JSON.stringify(objectStates);
  }

  const chaptersData: { text: string; card: string; facts: string; reader: string }[] = [];

  for (let cIdx = 0; cIdx < numChapters; cIdx++) {
    const chNum = cIdx + 1;
    onProgress('chapter', chNum);
    store.log('craft-chapter', `Starting Chapter ${chNum}...`);

    const chScenes = packet.scenes.filter(s => s.chapter === chNum);
    const chSceneProse: string[] = [];

    for (const plannedCard of chScenes) {
      let card = architecture ? projectArchitecture(architecture).scenes.find(s => s.id === plannedCard.id)! : plannedCard;
      const sceneWords = Number.isFinite(card.targetWords) && card.targetWords! > 0 ? Math.round(card.targetWords!) : targetWordsPerScene;
      journal.push(`Writing Scene ${card.order} (${card.id})`);
      const availableFacts = packet.facts.filter(f => card.povKnows.includes(f.id) && f.learnsAt < card.order && knownFacts.has(f.id));
      const newSceneFacts = packet.facts.filter(f => card.newFacts?.includes(f.id));

      const worn = wornPhrases(pages);
      const wornWarning = worn.length > 0 
        ? `\n- BANNED REPETITIVE PHRASES (already overused in prior scenes; DO NOT USE):\n  ${worn.slice(0, 15).join(', ')}`
        : '';

      // A reader sees committed prose only, before the next scene exists.
      const beforeReader = `scene-${card.order}-reader-before.json`;
      const prefixRevision = await revision(pages);
      if (!files[beforeReader] || files[`${beforeReader}.source`] !== prefixRevision) {
        journal.push(`Blind reader before Scene ${card.order}`);
        files[beforeReader] = session ? await readBlindPrefix(pages, session, llm) : await readBlind(pages, llm);
        files[`${beforeReader}.source`] = prefixRevision;
        answers.push({ who: `a reader before Scene ${card.order}`, step: journal.length, about: card.id, text: files[beforeReader] });
        syncAuthorState();
      }

      // No premise, dossier, future cards, review advice or global author directives
      // cross this boundary. Only the current scene and permitted knowledge do.
      let context = `${blindWriterContext(packet, card, availableFacts, newSceneFacts, pages, input.genre, { usedImagery, objectStates })}

INSTRUCTIONS FOR WRITER:
- Write ONE continuous, complete fiction scene of ~${sceneWords} words (${Math.round(sceneWords * 0.85)}–${Math.round(sceneWords * 1.15)} words).
- Enact the specific choice, action, and consequence detailed in the scene card.
- ANTI-REPETITION & FRESH PROSE DIRECTIVE:
  * Do NOT repeat the physical actions of previous scenes (e.g. do not write another scene of characters meeting in a quiet ruin to touch and part).
  * Do NOT repeat stock sensory crutches (e.g. "copper taste", "burnt sage", "cold skin dry as parchment", "hand pressed flat against", "cupped hand"). Invent fresh sensory observations grounded in this specific scene's unique environment.${wornWarning}
- SCENE PULSE & CONFLICT FOCUS (Swain/Bickham Action vs Sequel):
  * ${card.sceneType === 'sequel'
    ? 'SEQUEL SCENE: Focus heavily on internal reaction, processing the emotional fallout, wrestling with a painful dilemma, and committing to a difficult decision. External action is secondary or ambient.'
    : 'ACTION SCENE: Focus on driving the immediate external objective and interpersonal confrontation towards a disaster/complication. Do NOT interrupt active physical stakes with artificial internal monologues or emotional philosophizing.'}
- CONFLICT LAYERS: External (${card.conflict?.external || 'ambient'}), Interpersonal (${card.conflict?.interpersonal || 'ambient'}), Internal (${card.conflict?.internal || 'ambient'}).
- VALUE CHARGE TURN: Ensure the scene shifts the emotional/situational polarity from ${card.valueCharge?.start || 'initial state'} to ${card.valueCharge?.end || 'terminal state'}.
- PERCEPTUAL ORDER: In shock/action moments, depict raw sensory stimulus first, involuntary physical reflex second, conscious cognitive labeling third. Never put explanation before physical sensation.
- DEEP POV (ZERO FILTER WORDS): Ban phrases like "he saw", "she felt", "he noticed", "she wondered", "it seemed". Present the world directly from inside the character's perception.
- SYNTACTIC PACING & TIME DILATION:
  * In moments of high crisis or impact, dilate time by lingering on concrete physical micro-details.
  * Use staccato, punchy sentence rhythm during high action; expansive, rhythmic phrasing during reflective sequels.
  * End-Weight Principle: Place the most impactful, resonant word of key sentences immediately before the period.
- OBLIQUE DIALOGUE & STAGE BUSINESS: Characters speak diagonally with subtext, avoiding on-the-nose answers. Anchor dialogue with physical prop actions (cups, coats, locks, papers). Use clean "said" or physical action beats (no fancy tags like "he hissed" or "-ly" adverbs).
- TWO-SENSE RULE: Include at least one vivid non-visual sensory detail (tactile texture/temperature, smell, or acoustic detail).
- ENDING CADENCE: Close the scene with ${card.endingCadence || 'resonance'} (${card.endingType || 'ending beats'}), leaving forward momentum.
- Do NOT retreat into vague poetic abstraction, cosmic dreaminess, or repetitive metaphors.
- NARRATIVE PERSPECTIVE & TENSE (MANDATORY STANDARD):
  * Point of View: Third Person Limited (3-е лицо, ограниченное восприятием одного персонажа). Anchor strictly inside the viewpoint character's sensory perception and immediate consciousness: he/she/they.
  * Grammatical Tense: Past Tense (Прошедшее время). The standard of world fiction («The lock gave under his thumb. Bruce stepped inside and pulled the door shut behind him.»). All narration, stage business, and beats must be written in past tense (walked, looked, gave, spoke), NEVER present tense.
- Current scene only; do not jump ahead to future scenes.
- Output fiction prose only, no titles, headings, or meta comments.`;

      let execution: SceneExecution | undefined;
      if (architecture && session) {
        const node = architecture.graph.scenes.find(s => s.id === card.id)!;
        execution = await prepareExecution(architecture, node, enacted, files[beforeReader], session, llm);
        card = applyExecutionToCard(card, execution);
        context = executionPrompt(execution, pages);
      }
      const sceneSystem = architecture ? DRAFT_WRITER_SYSTEM : CRAFT_SYSTEM;
      const needsRepair = (receipt: Receipt, prose: string) => architecture
        ? receipt.event.status !== 'enacted' || !receipt.tangibleActionEnacted || receipt.issues.some(i => i.status === 'demonstrated' && ['factual', 'knowledge', 'causal'].includes(i.kind || ''))
        : sceneNeedsRepair(receipt, prose, sceneWords);
      const sceneFile = `scene-${card.order}.md`;
      const stateFile = `scene-${card.order}-state.json`;
      let checkpoint: { sceneId?: string; phase?: string; repairAttempted?: boolean; observation?: Observation } = {};
      try { checkpoint = JSON.parse(files[stateFile] || '{}'); } catch { /* Re-observe saved prose if its checkpoint is invalid. */ }
      let sceneText = files[sceneFile]?.trim() ? files[sceneFile] : await llm(context, sceneSystem, { stage: 'craft-write', temperature: 0.8, maxTokens: Math.max(4000, sceneWords * 3) });
      sceneText = normalizeChapterBody(sceneText, chNum);
      sceneText = stripSubtextDecoding(sceneText);
      if (files[sceneFile] && files[sceneFile] !== sceneText) checkpoint.phase = 'written';
      const saveScene = (phase: string, observation?: Observation) => {
        files[sceneFile] = sceneText;
        files[stateFile] = JSON.stringify({ sceneId: card.id, phase, repairAttempted: checkpoint.repairAttempted, observation });
        const chScenesWithProse = chScenes.slice(0, chSceneProse.length).map((s, idx) => ({ text: chSceneProse[idx], pov: s.pov }));
        chScenesWithProse.push({ text: sceneText, pov: card.pov });
        const partial = joinScenesWithCameraBreaks(chScenesWithProse);
        files[`chapter-${chNum}.md`] = partial;
        store.saveManuscript(chNum, partial);
        syncAuthorState({ chaptersData: [...chaptersData, { text: partial, card: chScenes.map(s => s.purpose).join('; '), facts: '', reader: '' }] });
      };
      // Persist the writer's output before asking a fallible observer to describe it.
      if (checkpoint.phase !== 'complete') saveScene('written');

      // Observer check
      journal.push(`Observer verifying Scene ${card.order} (${card.id})`);
      const observerHistory = architecture ? JSON.stringify(enacted.scenes.filter(s => architecture!.graph.scenes.find(n => n.id === s.id)!.order < card.order).map(s => ({ id: s.id, summary: s.summary, acquisitions: s.acquisitions, resources: s.resources, relationships: s.relationships }))) : pages.join('\n\n');

      const obsPrompt = (text: string) => `REQUIRED SCENE CARD:
${JSON.stringify(card)}

ASSIGNED FACTS:
${JSON.stringify(newSceneFacts)}

PERMITTED POV KNOWLEDGE AND ACQUISITIONS:
${JSON.stringify(execution ? { available: execution.availableFacts, acquireNow: execution.acquireNow, initialKnowledge: execution.initialKnowledge } : {})}

PRIOR COMMITTED SCENES (data, compare continuity and repetition):
${observerHistory}

WRITTEN SCENE PARAGRAPHS:
${JSON.stringify(text.split(/\n\s*\n/).filter(Boolean).map((text, index) => ({ id: `${card.id}-p${index + 1}`, text })))}

${architecture ? 'DISCOVERY DRAFT: Assess only concrete execution, causality and permitted knowledge. Do not demand line polishing, filter-word removal, extra sensory detail or rigid length. Label each issue with kind factual|knowledge|causal|style|uncertain and status demonstrated|uncertain. Uncertainty and deliberate character lies are not demonstrated contradictions. Incidental new observations are allowed; do not grant decisive future knowledge without an enacted acquisition.' : 'Examine this scene draft.'}
${architecture ? `1. Was the required current physical action and choice actually enacted?
2. Does its causal consequence follow from visible action and permitted world access?
3. Did decisive knowledge enter only through an available fact or an enacted acquisition?
4. Extract plot-relevant observed facts with exact current paragraph sources. Distinguish claims from actual events.
Do not stop the discovery draft for wording, length, sensory density, metaphors or filter words.` : `1. Event status: was the card's required physical action and choice enacted, missing, or contradicted?
2. Tangibility check: did the prose depict concrete actions and dialogue, or did it evaporate into vague metaphors?
3. Repetition & Cliché check: did this scene recycle physical actions from earlier scenes, or use tired clichés ("copper taste", "burnt sage", "cold skin dry as parchment")?
4. Value charge turn: did the scene execute the required value charge turn (${card.valueCharge?.start || 'start'} -> ${card.valueCharge?.end || 'end'})?
5. Deep POV & Head-hopping check: did the text strictly maintain '${card.pov || packet.names?.protagonist || 'protagonist'}'s perspective and avoid hopping into other minds or using filter-word distancing?
6. Subtext Decoding check: did the text avoid explaining dialogue subtext ("he heard what was underneath", "what he really meant")?
7. End-weight check: did the scene conclude on a physical action, sensory detail, or dialogue rather than moralizing summary?
8. Facts: extract newly acquired or narrated facts with exact paragraph source IDs.
9. Issues: flag any factual contradictions with prior text.`}


Return JSON:
{
  "event": {"status": "enacted|missing|contradicted", "sources": ["${card.id}-p1"], "reason": "..."},
  "tangibleActionEnacted": true,
  "valueChargeTurned": true,
  "isRepetitiveOrClichéd": false,
  "facts": [{"id": "F1 or new_id", "text": "...", "kind": "narrated|claim|belief", "knownBy": ["protagonist"], "source": "${card.id}-p1"}],
  "issues": [{"reason": "...", "sources": ["${card.id}-p1"]${architecture ? ', "kind": "factual", "status": "demonstrated"' : ''}}],
  "wordCount": ${wc(sceneText)}
}`;

      let observation: Observation | undefined;
      if (checkpoint.sceneId === card.id && checkpoint.phase === 'complete' && checkpoint.observation) {
        try {
          if (checkpoint.observation.receipt) validateReceipt(checkpoint.observation.receipt, sceneText, card.id);
          observation = checkpoint.observation;
        } catch { /* A stale receipt is rechecked against the saved scene. */ }
      }
      observation ||= await observeScene(llm, obsPrompt(sceneText), sceneText, card.id, architecture ? 'draft' : 'legacy');
      let receipt = observation.receipt;

      // Programmatic scan for banned clichés / imagery duplicates across scenes:
      if (receipt && !receipt.isRepetitiveOrClichéd && usedImagery.length) {
        const lowerScene = sceneText.toLowerCase();
        const matchedCliche = usedImagery.find(c => lowerScene.includes(c));
        if (matchedCliche) {
          receipt.isRepetitiveOrClichéd = true;
          receipt.issues.push({
            reason: `Duplicate metaphor / cliché from earlier scene: "${matchedCliche}". Replace with fresh sensory image.`,
            sources: [`${card.id}-p1`],
          });
        }
      }

      if (receipt && needsRepair(receipt, sceneText) && !checkpoint.repairAttempted) {
        journal.push(`Repairing Scene ${card.order} (${card.id})`);
        store.log('craft-repair', `Repairing Scene ${card.id}: ${receipt.event.reason || 'scene findings'}`);
        checkpoint.repairAttempted = true;
        saveScene('written');
        const repairPrompt = `${context}\nCURRENT DRAFT:\n${sceneText}\nOBSERVER VALIDATION ISSUES:\n${JSON.stringify(receipt)}\nRewrite this scene to enact its required choice, action and consequence. Preserve successful material and the premise. Enact physical bodily presence, dialogue, and concrete actions. Eliminate vague metaphors, elliptical evasions, and recycled clichés. Ensure fresh vocabulary and distinct physical staging. Target ~${sceneWords} words. Output corrected fiction prose only.`;
        sceneText = normalizeChapterBody(await llm(repairPrompt, sceneSystem, { stage: 'craft-repair', temperature: 0.8, maxTokens: Math.max(4000, sceneWords * 3) }), chNum);
        sceneText = stripSubtextDecoding(sceneText);
        saveScene('written');
        observation = await observeScene(llm, obsPrompt(sceneText), sceneText, card.id, architecture ? 'draft' : 'legacy');
        receipt = observation.receipt;
      }

      files[`scene-${card.order}-observation.json`] = JSON.stringify(observation);
      if (receipt) {
        const tasks = files['deferred-work.json'] ? JSON.parse(files['deferred-work.json']) as { scene: string; reason: string; textRevision: string }[] : [];
        const remaining = tasks.filter(t => t.scene !== card.id);
        if (receipt.isRepetitiveOrClichéd) remaining.push({ scene: card.id, reason: 'Line edit: replace repetitive actions or clichés in this exact scene.', textRevision: await revision(sceneText) });
        if (receipt.valueChargeTurned !== true) remaining.push({ scene: card.id, reason: 'Structural revision: make the consequence and value change tangible.', textRevision: await revision(sceneText) });
        receipt.issues.filter(i => i.status !== 'demonstrated' || !['factual', 'knowledge', 'causal'].includes(i.kind || '')).forEach(i => remaining.push({ scene: card.id, reason: i.reason, textRevision: '' }));
        receipt.issues.filter(i => i.status === 'demonstrated' && ['factual', 'knowledge', 'causal'].includes(i.kind || '')).forEach(i => remaining.push({ scene: card.id, reason: `Causal revision: ${i.reason}`, textRevision: '' }));
        files['deferred-work.json'] = JSON.stringify(remaining);
      }
      if (!receipt || needsRepair(receipt, sceneText)) {
        files[`scene-${card.order}-unresolved.json`] = JSON.stringify(observation);
        store.log('craft-warning', receipt ? `Scene ${card.id} retains observer findings after repair. Deferring to whole-book revision.` : `Scene ${card.id} is saved; observer unavailable after two bounded attempts. Final manuscript checks will revisit it.`);
      } else delete files[`scene-${card.order}-unresolved.json`];
      // Keep saved prose and the pending checkpoint, but do not certify an unchecked scene when observer is unavailable.
      if (!receipt) {
        syncAuthorState();
        throw new Error(`Scene ${card.id} observer unavailable after recovery. Saved prose retained; Continue retries the check.`);
      }
      if (receipt) files[`scene-${card.order}-receipt.json`] = JSON.stringify(receipt);
      else delete files[`scene-${card.order}-receipt.json`];
      if (architecture && session) {
        enacted = await commitEnacted(architecture, architecture.graph.scenes.find(s => s.id === card.id)!, sceneText, enacted, session, llm);
        architecture = await continueArchitecture(architecture, enacted.scenes.find(s => s.id === card.id)!, session, llm);
        packet = projectArchitecture(architecture);
        files['packet.json'] = JSON.stringify(packet);
      }
      saveScene('complete', observation);
      pages.push(sceneText);
      chSceneProse.push(sceneText);
      for (const f of receipt?.facts || []) {
        if (f.knownBy?.includes('protagonist')) knownFacts.add(f.id);
      }

      // Update used imagery stop-list & physical object states
      const newImgs = extractUsedImagery([sceneText]);
      for (const img of newImgs) {
        if (!usedImagery.includes(img)) usedImagery.push(img);
      }
      files['used-imagery.json'] = JSON.stringify(usedImagery);

      if (card.props?.length && receipt) {
        for (const propName of card.props) {
          const pid = propName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          if (objectStates[pid]) {
            objectStates[pid].lastModifiedScene = card.id;
            if (card.location) objectStates[pid].location = card.location;
          }
        }
        files['object-states.json'] = JSON.stringify(objectStates);
      }

      answers.push({
        who: 'the observer',
        step: journal.length,
        about: card.id,
        text: `### Scene ${card.order} (${card.id})\n- **Status:** ${receipt?.event.status || 'unavailable'}\n- **Tangible Action:** ${receipt ? (receipt.tangibleActionEnacted ? 'Verified ✅' : 'Failed ❌') : 'Not checked'}\n- **Words:** ${wc(sceneText)}\n- **Reason:** ${receipt?.event.reason || observation.failures.join('; ') || 'OK'}`,
      });

      // Save interim chapter progress
      const interimChapterScenes = chScenes.slice(0, chSceneProse.length).map((s, idx) => ({ text: chSceneProse[idx], pov: s.pov }));
      store.saveManuscript(chNum, joinScenesWithCameraBreaks(interimChapterScenes));
    }

    const fullChapterScenes = chScenes.map((s, idx) => ({ text: chSceneProse[idx] || '', pov: s.pov }));
    const fullChapterText = joinScenesWithCameraBreaks(fullChapterScenes);
    chaptersText.push(fullChapterText);
    files[`chapter-${chNum}.md`] = fullChapterText;
    store.saveManuscript(chNum, fullChapterText);

    // Blind Reader after chapter
    journal.push(`Blind reader reviewing Chapter ${chNum}`);
    store.log('craft-reader', `Blind reader reviewing Chapter ${chNum}...`);

    const readerFeedbackRaw = session ? await readBlindPrefix(pages, session, llm) : await readBlind(pages, llm);
    answers.push({ who: `a reader after Chapter ${chNum}`, step: journal.length, about: `Chapter ${chNum}`, text: readerFeedbackRaw });

    chaptersData.push({
      text: fullChapterText,
      card: chScenes.map(s => `**${s.id}:** ${s.purpose} *(Choice: ${s.choice})*`).join('\n\n'),
      facts: chScenes.flatMap(s => s.newFacts || []).join(', '),
      reader: readerFeedbackRaw,
    });

    syncAuthorState({ chaptersData, waiting: readerFeedbackRaw });
  }

  // Automatic and user-invoked editing share the same saved-book path and resume marker.
  files['book.md'] = manuscriptText(chaptersText.map((text, index) => ({ chapter: index + 1, text })));
  syncAuthorState({ chaptersData, completed: false });
  if (session) await session.phase('structural-revision');
  await runCraftEditorial(input, store, llm, onProgress, !usesAuthorEngine);
  const report = store.loadReport()!;
  return { status: report.status, summary: report.summary };
}
