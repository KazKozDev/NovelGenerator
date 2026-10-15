import React, { useState, useEffect } from 'react';

interface SystemManualModalProps { isOpen: boolean; onClose: () => void }

const sections = [
  { id: 'start', label: 'Getting started', title: 'Define the book you want to write', intro: 'The main form supplies the premise and style parameters. The Craft 2.0 engine drafts the dossier, projects the relational scene matrix, and enacts each scene under strict POV barriers.', cards: [
    { title: 'Premise and reading experience', paragraphs: ['Describe the central conflict, named characters, setting, and desired resolution. State important constraints in the premise. Genre, audience, narrative voice, tone, style, tense, and ending are also sent as author requirements.'] },
    { title: 'Chapter count and rough size', paragraphs: ['Rough words per chapter tells the engine how large a book you have in mind. It is not an arbitrary word-chopper: scenes expand or contract according to dramatic necessity.', 'The generation pipeline works within a call and time budget that scales with the number of chapters. When the budget is reached, the book completes with a detailed audit report.'] },
    { title: 'Author model and reader model', paragraphs: ['The Author model handles the strategic layer (dossier, scene cards) and enacts the prose. Choose Gemini, Ollama, Qwen, Hugging Face, or API Compatible.', 'Enable Reader model to have a dedicated model handle the Observer, Blind Reader, and Dual Audit. Without it, the primary model handles validation. If the reader model encounters issues, the primary model provides automatic fallback.'] },
    { title: 'Start or continue', paragraphs: ['Start Generation creates a new project from the main form. Resume Generation continues the saved state with the models selected now. Changing the premise or chapter count starts a fresh book; changing style options updates constraints for subsequent scenes.'] },
  ] },
  { id: 'workspace', label: 'Workspace', title: 'Read the book while it develops', intro: 'The three columns show the plan, the manuscript, and the active inspection tools.', cards: [
    { title: 'Left · chapters and pipeline progress', paragraphs: ['Select a chapter to read its text. Beneath the chapter list is the live pipeline log: preparation, scene card projection, scene enactment, observer checks, and audits.', 'Pending means generation has not reached this chapter yet. Live identifies the chapter currently being enacted. Draft indicates a chapter with written text.'] },
    { title: 'Center · manuscript and craft tools', paragraphs: ['Clean text renders the formatted prose. Raw shows the source markdown. Changes compares chapter revisions.', 'To the left of those are the Craft 2.0 Inspector tabs: Dossier (4 Layers of Truth), Scene Cards (Relational Projection Matrix), Observer (Sensory Validation Receipts), Reader (Blind Hypotheses), and Reviews (Dual Developmental & Literary Audits). Press an active tab again to return to the manuscript.'] },
    { title: 'Right · Checks and Agent Inspector', paragraphs: ['Checks describes the selected chapter: word count, dialogue share, and prose texture signals. Agent Inspector shows the current stage, elapsed time, model calls, and token usage. Resume Generation appears if a run was stopped.'] },
  ] },
  { id: 'metrics', label: 'Metrics explained', title: 'What each indicator means', intro: 'Checks and Measured describe the selected chapter. Agent Inspector describes the current operation, which may concern a different chapter. These indicators update as the manuscript develops.', cards: [
    { title: 'Checks · review and writing signals', paragraphs: [
      'Ch #: The chapter selected for reading. All Checks and Measured values belong to its current text.',
      'Review: The verification status of the manuscript. Draft · not verified means the required completion checks are still pending; Checks passed means all completion conditions were met; Reviewed · warnings means the completed review retains advisory flags.',
      'Originality: The percentage of distinct four-word sequences within the chapter after normalization. A higher value means less repeated wording.',
      'Motifs: Repeated four-word phrases detected across distinct sentences. The display gives the number of qualifying phrases and a sample phrase.',
      'Rhythm: A comparison of sentence lengths at the beginning and end of the chapter. Held means no abrupt shortening pattern; drifted shows the difference between the two medians.',
      'Hook: A score on a ten-point scale for action, conflict, questions, and dialogue attribution in the opening scenes.',
    ] },
    { title: 'Measured · length and prose texture', paragraphs: [
      'Words: Current chapter word count followed by the requested target. Target comes from generation settings.',
      'Dialogue: The percentage of words inside dialogue quotes. It measures conversational pacing versus narrative exposition.',
      'Median paragraph: The median paragraph length in words. Blank lines separate paragraphs.',
      'Comparisons/1k: Detected comparison markers per thousand words (such as like a, as if, as though). Helps spot excessive figurative language.',
      'Lines with a beat: The share of dialogue paragraphs containing a speech tag or physical action beat.',
      'Additional findings: Labels beneath Measured identify detected prose patterns with contextual suggestions.',
      'Interpretation: Use these indicators to notice stylistic shifts and repetition. Story causality and completion are audited separately.',
    ] },
    { title: 'Agent Inspector · activity and usage', paragraphs: [
      'Events: The number of entries in the displayed activity log recording agent operations.',
      'Current operation: Describes what the craft pipeline is doing: preparation (dossier), scene cards projection, blind writing, observer validation, blind reading, or dual review.',
      'Activity icon: A rotating icon indicates active generation and network requests.',
      'Elapsed time: Time since the start of the current run, including model thinking and validation latency.',
      'Calls: The total request count for this project across generation and validation stages.',
      'Input tokens: Total model input tokens recorded, including prompts, system instructions, and supplied context.',
      'Output tokens: Total model output tokens recorded, including scene plans, reviews, and prose.',
      'Approximation marker (~): Indicates estimated token counts when exact provider metrics were unavailable.',
    ] },
    { title: 'Pipeline and Target · execution state', paragraphs: [
      'Pipeline: Active means generation is running. Stopped means an error interrupted it. Complete means the run finished. Idle means waiting for user input.',
      'Target: The chapter assigned to the current operation. May differ from the chapter selected in Checks because reading and generation proceed independently.',
    ] },
  ] },
  { id: 'process', label: 'Craft 2.0 Engine', title: 'Two Layers of Truth & Deterministic Pipeline', intro: 'Craft 2.0 separates strategic causal architecture from physical scene enactment through five core principles.', cards: [
    { title: '1 · Deterministic Phased Pipeline', paragraphs: [
      'Strictly separated sequential stages: Dossier → Scene Cards → Preflight → Blind Write → Observer → Dual Review.',
      'Each stage executes independently with explicit schema contracts, preventing cascading hallucinations and maintaining high context purity.',
    ] },
    { title: '2 · Strict Relational Scene Matrix (packet.json)', paragraphs: [
      '3 scenes per chapter governed by the "Therefore / But" causal momentum law (action leads to reaction, reaction forces dilemma).',
      'Tracks 3 layers of conflict (internal, interpersonal, external) and enforces value charge shifts (+ to - or - to +) in every scene.',
    ] },
    { title: '3 · Strict POV Barrier', paragraphs: [
      'Scene generation prompts are strictly isolated from future narrative facts (povKnows, learnsAt < order).',
      'Omniscience leaks and narrative spoilers are blocked at prompt assembly time, ensuring characters only act on what they currently know.',
    ] },
    { title: '4 · Anti-Metaphorical Directive', paragraphs: [
      'Strict prohibition of abstract clichés and pseudo-literary filler prose. Focuses on concrete physical sensory actions, spatial grounding, and authentic dialogue.',
      'Every scene enactment is independently checked and verified by the Observer agent.',
    ] },
    { title: '5 · Embedded Continuous Checks', paragraphs: [
      'A Blind Reader builds narrative hypotheses and anticipations before each scene without knowledge of future secrets.',
      'Dual Reviewers (developmental and literary) audit causal continuity, pacing rhythm, and thematic coherence across the full manuscript.',
    ] },
  ] },
  { id: 'checks', label: 'Quality & Audits', title: 'Independent Validation & Dual Reviews', intro: 'Every chapter undergoes multi-perspective verification before final completion.', cards: [
    { title: 'Observer Sensory Receipts', paragraphs: ['The Observer analyzes every written scene against its Scene Card specification. It outputs physical receipts validating sensory details, prop continuity, character positions, and dialogue subtext.'] },
    { title: 'Blind Reader Hypothesis Tracking', paragraphs: ['The Blind Reader simulates reader expectations with zero forward knowledge. It records hypotheses, questions, and emotional reactions, verifying narrative suspense and clarity.'] },
    { title: 'Dual Review: Developmental & Literary', paragraphs: ['Developmental Audit: Evaluates plot causality, setup/payoff balance, premise fidelity, and character arc resolution.', 'Literary Review: Inspects prose texture, voice consistency, pacing cadence, and sensory immersion.'] },
    { title: 'Causal Integrity & Repair Pass', paragraphs: ['If the Observer or Dual Reviewers flag severe causal inconsistencies or POV breaches, the engine executes a targeted repair pass to resolve the discrepancy before advancing.'] },
  ] },
  { id: 'models', label: 'Models & data', title: 'Know which model is doing the work', intro: 'The author and reader use the providers you select. The event log records the model that served each request.', cards: [
    { title: 'Gemini, Ollama, Qwen, and API Compatible', paragraphs: ['Gemini uses the configured Google model. Ollama connects to your local endpoint and models. Qwen uses the application server proxy. API Compatible connects to any standard OpenAI-compatible Chat Completions endpoint.', 'Provider settings determine where prompts and manuscript excerpts are processed. Cloud routes send data to their respective services.'] },
    { title: 'Context and output limits', paragraphs: ['Context is what a model can read in a request; output is what it can generate. Incomplete responses at token limits are caught and retried cleanly.', 'Observer checks and Dual Audits run under dedicated token allocations to ensure thorough reviews without truncating the prose.'] },
  ] },
  { id: 'saving', label: 'Saving & recovery', title: 'Keep a project backup as well as a reading copy', intro: 'Autosave, manuscript export, and project export serve different purposes.', cards: [
    { title: 'Autosaved to repo & browser', paragraphs: ['Project changes save an atomic snapshot to autosaves/latest.project.json in the repository, complemented by browser IndexedDB storage. Reloading restores the project state. Resume Generation restarts execution from the exact stage reached.', 'Replacing or resetting a project preserves a dated recovery snapshot in autosaves/. Export the project file for an independent portable backup.'] },
    { title: 'Save draft / Save book', paragraphs: ['Export the manuscript at any time as EPUB, PDF, TXT, or Markdown. Report (JSON) exports complete audit results and scene card metadata. EPUB and PDF include formatted title pages and author attribution.'] },
    { title: 'Export project / Import project', paragraphs: ['Project export produces a portable JSON snapshot containing input settings, dossier, scene matrix, manuscript chapters, and review receipts. Import restores that state into the active workspace.', 'Import is disabled while generation is active to prevent state collisions.'] },
    { title: 'Recover or start over', paragraphs: ['If a generation run is stopped or interrupted by network errors, the run log displays the exact error message. Resume Generation continues from the last validated stage.', 'Clean Slate wipes temporary state to begin a new project from scratch.'] },
  ] },
] as const;

type GuideIconName = 'book' | 'layout' | 'chart' | 'layers' | 'check' | 'models' | 'save' | 'pen' | 'target' | 'play' | 'search' | 'clock' | 'file' | 'restore';

const guideIconPaths: Record<GuideIconName, string> = {
  book: 'M12 5.5C9 3.8 5.7 3.8 3 5v15c2.7-1.2 6-1.2 9 .5m0-15c3-1.7 6.3-1.7 9-.5v15c-2.7-1.2-6-1.2-9 .5V5.5',
  layout: 'M3 4h18v16H3zM8 4v16M16 4v16',
  chart: 'M4 4v16h17M8 16v-5M13 16V7M18 16v-8',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  check: 'M12 3 4 6v6c0 4 3 7 8 9 5-2 8-5 8-9V6l-8-3Zm-4 9 3 3 5-6',
  models: 'M8 3v3m8-3v3M8 18v3m8-3v3M3 8h3m-3 8h3m12-8h3m-3 8h3M6 6h12v12H6zM10 10h4v4h-4z',
  save: 'M4 3h13l4 4v14H3V3h1Zm3 0v6h10V3M7 21v-8h10v8',
  pen: 'm15 4 5 5M4 20l1-6L16 3l5 5L10 19l-6 1Z',
  target: 'M21 12a9 9 0 1 1-9-9M17 12a5 5 0 1 1-5-5m0 5 9-9m-5 0h5v5',
  play: 'm9 6 9 6-9 6V6ZM4 4v16',
  search: 'M15.5 15.5 21 21M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  file: 'M14 3H4v18h16V9l-6-6Zm0 0v6h6M8 13h8M8 17h5',
  restore: 'M3 10a9 9 0 1 1 1 7m-1-7V4m0 6h6m3-3v5l3 2',
};

const sectionIcons: Record<string, GuideIconName> = {
  start: 'book', workspace: 'layout', metrics: 'chart', process: 'layers', checks: 'check', models: 'models', saving: 'save',
};

function cardIcon(title: string): GuideIconName {
  if (/chapter count|budget|target/i.test(title)) return 'target';
  if (/start or continue/i.test(title)) return 'play';
  if (/center|premise|writing/i.test(title)) return 'pen';
  if (/left|matrix|pipeline/i.test(title)) return 'layers';
  if (/measured|checks ·/i.test(title)) return 'chart';
  if (/inspector|progress|limits|continuous/i.test(title)) return 'clock';
  if (/search|tools|evidence|observer/i.test(title)) return 'search';
  if (/recover|over|repair/i.test(title)) return 'restore';
  if (/export|save draft/i.test(title)) return 'file';
  if (/autosave/i.test(title)) return 'save';
  if (/model|gemini|local ml|editor/i.test(title)) return 'models';
  if (/review|check|audit|barrier|directive/i.test(title)) return 'check';
  return 'layers';
}

function GuideIcon({ name, className = 'w-4 h-4' }: { name: GuideIconName; className?: string }) {
  return <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={guideIconPaths[name]} /></svg>;
}

export function SystemManualModal({ isOpen, onClose }: SystemManualModalProps) {
  const [activeTab, setActiveTab] = useState<string>('start');
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const section = sections.find(item => item.id === activeTab) || sections[0];
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="guide-title" className="relative w-full max-w-[1200px] max-h-[94dvh] flex flex-col bg-zinc-900 light:bg-white border border-zinc-800 light:border-zinc-200 rounded-xl shadow-2xl overflow-hidden" onClick={event => event.stopPropagation()}>
      <header className="flex items-start gap-3 justify-between px-5 py-4 border-b border-zinc-800 light:border-zinc-200 bg-zinc-950/60 light:bg-zinc-50 shrink-0">
        <div className="min-w-0">
          <h2 id="guide-title" className="text-base font-semibold text-zinc-100 light:text-zinc-900">NovelGenerator Guide</h2>
          <p className="mt-1 text-xs text-zinc-400 light:text-zinc-500">Craft 2.0: Two Layers of Truth & Execution.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close guide" title="Close (Esc)" className="shrink-0 p-1.5 text-zinc-400 hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-800 hover:bg-zinc-800 light:hover:bg-zinc-200 rounded-md transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </header>
      <nav aria-label="Guide sections" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-1 px-5 py-3 border-b border-zinc-800 light:border-zinc-200 shrink-0">
        {sections.map(item => <button key={item.id} type="button" aria-current={item.id === section.id ? 'page' : undefined} onClick={() => setActiveTab(item.id)} className={`flex items-center gap-2 min-w-0 px-2.5 py-2 rounded-md text-xs font-medium text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 ${item.id === section.id ? 'bg-zinc-800 light:bg-zinc-100 text-zinc-100 light:text-zinc-900' : 'text-zinc-400 light:text-zinc-600 hover:bg-zinc-800/50 light:hover:bg-zinc-100'}`}><GuideIcon name={sectionIcons[item.id] || 'book'} /><span>{item.label}</span></button>)}
      </nav>
      <div key={section.id} className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6 space-y-5 text-sm leading-relaxed text-zinc-300 light:text-zinc-800">
        <div><h3 className="flex items-center gap-2.5 text-base font-semibold text-zinc-100 light:text-zinc-900"><GuideIcon name={sectionIcons[section.id] || 'book'} className="w-5 h-5 text-zinc-400 light:text-zinc-500" />{section.title}</h3><p className="mt-2 text-zinc-400 light:text-zinc-600">{section.intro}</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">{section.cards.map(card => <section key={card.title} className="p-4 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50 md:[&:last-child:nth-child(odd)]:col-span-2">
          <h4 className="flex items-start gap-2.5 font-semibold text-zinc-200 light:text-zinc-900"><GuideIcon name={cardIcon(card.title)} className="w-[18px] h-[18px] mt-0.5 text-zinc-400 light:text-zinc-500" /><span>{card.title}</span></h4>
          {card.paragraphs.map(paragraph => <p key={paragraph} className="mt-2 text-zinc-400 light:text-zinc-600">{section.id === 'metrics' && paragraph.includes(':') ? <><strong className="font-medium text-zinc-200 light:text-zinc-800">{paragraph.slice(0, paragraph.indexOf(':') + 1)}</strong>{paragraph.slice(paragraph.indexOf(':') + 1)}</> : paragraph}</p>)}
        </section>)}</div>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-zinc-800 light:border-zinc-200 shrink-0 text-xs text-zinc-500">
        <span>NovelGenerator · Craft 2.0 Engine</span>
        <button type="button" onClick={onClose} className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 light:bg-zinc-200 light:hover:bg-zinc-300 text-zinc-200 light:text-zinc-800 rounded-md font-medium">Got it</button>
      </footer>
    </div>
  </div>;
}

/** The button component placed next to ThemeToggle */
export function SystemManualToggle({ className = '' }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="NovelGenerator Guide"
        aria-label="Open NovelGenerator Guide"
        className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-all duration-200 text-zinc-400 hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-900 border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 hover:border-zinc-700 light:border-zinc-300 light:border-zinc-200/80 light:bg-white light:hover:bg-zinc-100 shadow-sm ${className}`}
      >
        <svg
          className="w-4 h-4 transition-transform duration-200 hover:scale-110"
          viewBox="7 4 10 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
      <SystemManualModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

export default SystemManualToggle;
