import React, { useState, useEffect } from 'react';

interface SystemManualModalProps { isOpen: boolean; onClose: () => void }

const sections = [
  { id: 'start', label: 'Getting started', title: 'Define the book you want to write', intro: 'The main form supplies the story and its requirements. One author writes the book at its desk: it thinks, asks its people, writes each chapter whole and asks a reader.', cards: [
    { title: 'Premise and reading experience', paragraphs: ['Describe the central conflict, named characters, setting and desired resolution. State important constraints in the premise. Genre, audience, narrative voice, tone, style, tense and ending are also sent as author requirements.'] },
    { title: 'Chapter count and rough size', paragraphs: ['Rough words per chapter tells the author how large a book you have in mind. It is not a target: no chapter is cut or padded to a size, and a chapter is as long as it needs to be.', 'The author works within a budget of calls that grows with the number of chapters. When the budget is spent, the book goes out as it stands.'] },
    { title: 'Author model and reader model', paragraphs: ['The author model writes the book: the notebook, the plan, the voices of its people and every chapter. Choose Gemini, Ollama, Qwen or Hugging Face.', 'Enable Reader model to have another model read what the author writes: the reader of a chapter, and the reader who says, before the ending is written, what the book still owes. Without it, the author\'s own model reads its own text. If the reader model will not read a passage, the author\'s model reads it instead and the journal says so.'] },
    { title: 'Start or continue', paragraphs: ['Start Generation creates a new project from the main form. Resume Generation continues the saved desk with the models selected now. Changing the premise or the chapter count starts a different book. Changing the style updates the requirements the author resumes with; the pages already written stay.'] },
  ] },
  { id: 'workspace', label: 'Workspace', title: 'Read the book while it develops', intro: 'The three columns show the plan, the manuscript and the work being performed.', cards: [
    { title: 'Left · chapters and the author\'s steps', paragraphs: ['Select a chapter to read it. Under the list is what the author has done, step by step, in its own words: what it wrote, whom it asked and why.', 'Pending means no text has appeared yet. Live identifies the chapter being written. Draft is a chapter with text while the book is still in work.'] },
    { title: 'Center · manuscript and tools', paragraphs: ['Clean text renders the current manuscript. Raw shows the source. Changes compares the chapter before and after the author wrote it again.', 'To the left of those are the tabs of the author\'s tools. Reader holds what the author asked its readers and what they said. Characters holds its talk with its people. Keeper holds what it looked up in the book. Set in holds what it set into a chapter already written. Notebook holds its notebook, plan and dossier. Each shows the words themselves, not a log. Press a tab again, or any view of the chapter, to return to the text.'] },
    { title: 'Right · Checks and Agent Inspector', paragraphs: ['Checks describes the selected chapter: its word count, dialogue share, and a few measures of repetition. Agent Inspector shows the current step, elapsed time, calls and recorded events. Resume Generation appears when the saved desk can be continued after a stop.'] },
  ] },
  { id: 'metrics', label: 'Metrics explained', title: 'What each indicator means', intro: 'Checks and Measured describe the selected chapter. Agent Inspector describes the current operation, which may concern a different chapter. These indicators update as the manuscript and run change.', cards: [
    { title: 'Checks · review and writing signals', paragraphs: [
      'Ch #: The chapter selected for reading. All Checks and Measured values belong to its current text.',
      'Review: The verification status of the manuscript. Draft · not verified means the required completion checks are still pending or unresolved; local reviews may already have taken place. Checks passed means the required completion conditions were met. Reviewed · warnings means the completed review retains warnings.',
      'Originality: The percentage of distinct four-word sequences within the chapter after normalization. A higher value means less repeated wording. It does not measure the originality of the plot or compare the text with published books.',
      'Motifs: Repeated four-word phrases detected across distinct sentences. The display gives the number of qualifying phrases and a sample phrase. None circling means this detector found none; it does not rule out repeated ideas, short verbal tics or deliberate refrains.',
      'Rhythm: A comparison of sentence lengths at the beginning and end of the chapter. Held means the detector found no abrupt shortening pattern; drifted shows the change between the two medians. The w suffix means words, and the displayed length is the median sentence length in the closing section. Short samples use the whole text. This is a sentence-length signal, not an assessment of narrative pacing.',
      'Hook: A score on a ten-point scale for action, conflict, questions and dialogue attribution in the opening. It uses English wording patterns and is an advisory signal, not a reader rating. Any accompanying label identifies a detected concern, such as a weak opening or a recap ending.',
    ] },
    { title: 'Measured · length and prose texture', paragraphs: [
      'Words: Current chapter word count followed by the requested chapter target. The target comes from the author settings; it is not the total for the book. Words are counted as whitespace-separated text. The short draft can be below target before expansion.',
      'Dialogue: The share of words inside straight or curly double quotes. It approximates how much of the text is dialogue. Quoted thoughts and documents may count too, while dialogue written with dashes may be missed. There is no required ideal percentage.',
      'Median paragraph: The middle paragraph length after all paragraph lengths are sorted. The w suffix means words. Blank lines separate paragraphs. A higher value indicates longer typical paragraphs; the median is not an average.',
      'Comparisons/1k: Detected comparison markers per thousand words. English expressions such as like a, as if and as though are counted. The rate helps spot repeated figurative phrasing, but can include literal comparisons and miss other forms.',
      'Lines with a beat: The share of paragraphs containing quoted text that also contain a recognized English speech tag, such as said, asked or whispered. The current implementation measures dialogue attribution rather than all gestures or physical action beats.',
      'Additional findings: Labels beneath Measured identify detected prose patterns. Their descriptions explain the concern. These are editing suggestions, not proof that the story is inconsistent.',
      'Interpretation: Use these indicators to notice changes and repetition, rather than to maximize every score. English keyword detectors are less reliable for other languages. Story causality and completion are checked separately.',
    ] },
    { title: 'Agent Inspector · activity and usage', paragraphs: [
      'Events: The number of entries in the displayed activity log. Entries record requests and other agent activity; they do not count completed scenes or accepted edits.',
      'Current operation: Describes what the author is doing: writing, asking a reader, asking one of its people, or looking something up.',
      'Activity icon: A rotating icon indicates that generation is running. It does not confirm that new text is arriving or that a review has passed.',
      'Elapsed time: Time since the first entry in the displayed run log. It includes waiting for models and reviews, not just writing time. Reloading can begin a new visible activity history.',
      'Calls: The displayed request count. In the main workspace it is derived from the activity log, so it is not an independent provider billing counter. Writing, reviews and retries can all add calls.',
      'Input tokens: Total model input recorded for the project, including instructions, prompts and supplied context. Sending a passage again adds input usage again. Tokens are model units, not manuscript words.',
      'Output tokens: Total recorded model output, including plans, reviews, tool commands and prose. Reported retries, rejected responses and reasoning usage can also contribute. This total is not the size of the finished book.',
      'Approximation marker (~): Some usage was estimated because provider counts were unavailable or older summaries were restored. Available provider counts take precedence. Totals persist across continuation, but historical usage without retained records cannot be reconstructed. Token totals are usage information, not a monetary bill.',
    ] },
    { title: 'Pipeline and Target · execution state', paragraphs: [
      'Pipeline: Active means the generation routine is running. Stopped means an error interrupted it. Complete means the run finished. Idle means no generation is currently running.',
      'Target: The chapter assigned to the current operation. Book-wide planning and reviews may still display a chapter target; read the operation label for the actual scope. Target can differ from the chapter selected in Checks because reading and generation proceed independently.',
    ] },
  ] },
  { id: 'process', label: 'Writing process', title: 'One author, a desk, and a counted shape', intro: 'The author writes the book. Code counts the debts it names and stops the run when the calls are spent.', cards: [
    { title: '1 · The desk', paragraphs: ['The author has a notebook, a plan, a dossier, an envelope and drama.md, plus one file for each chapter. It chooses what to write. The screen follows that choice.'] },
    { title: '2 · The pages', paragraphs: ['A chapter is written whole, or changed at a place the author quotes. A reader can be asked about a chapter. A character can be asked what they would do. The keeper answers from what the book already says.'] },
    { title: '3 · What the book owes', paragraphs: ['drama.md names the turns, the stakes, the question, the guns and the last act, in the author\'s words. Code checks those words against the chapters. The first wording stays. Rewriting the line does not move the debt, and saying the book is done does not close it while a named debt is open and calls remain.'] },
    { title: '4 · The end of the run', paragraphs: ['When the budget is spent, the book goes out as it stands. The report lists chapters that were not written and debts that were not met. Resume continues the same desk.'] },
  ] },
  { id: 'checks', label: 'Quality & repairs', title: 'What is counted', intro: 'The manuscript is the author\'s. Code counts a few things it can count, and reports them.', cards: [
    { title: 'Named debts', paragraphs: ['The turns, stakes, question, guns and last act are met when their words stand in the chapter that owes them. Open debts are listed when the book is finished.'] },
    { title: 'Chapter measures', paragraphs: ['Originality is the share of distinct four-word sequences in the chapter. Hook, Rhythm and Motifs are signals about the opening, sentence length and repeated phrases. They are not a review of the plot.'] },
    { title: 'Stopping', paragraphs: ['The desk has a budget of calls that grows with the number of chapters. When it is spent, the book goes out as it stands and the report names what is still open. A provider failure stops the run; Resume continues the saved desk.'] },
  ] },
  { id: 'models', label: 'Models & data', title: 'Know which model is doing the work', intro: 'The author and the reader use the providers you select. The event log names the model that served each request.', cards: [
    { title: 'Gemini, Ollama and Qwen', paragraphs: ['Gemini uses the configured Google model. Ollama uses your endpoint and model name; a model ending in :cloud is served through Ollama cloud, not necessarily on your computer. Qwen uses the application server proxy; its upstream endpoint and credentials are configured on the server.', 'Provider configuration determines where prompts and manuscript excerpts are processed. Cloud routes send that material to the selected service. The browser’s local autosave does not make cloud generation local.'] },
    { title: 'Context and output limits', paragraphs: ['Context is what a model can read in a request; output is what it can return. An incomplete response at the output limit is rejected and the step is not kept. The author is told the answer was cut off and can try a smaller one.', 'A tool call or a reader counts toward the run allowance.'] },
  ] },
  { id: 'saving', label: 'Saving & recovery', title: 'Keep a project backup as well as a reading copy', intro: 'Autosave, manuscript export and project export serve different purposes.', cards: [
    { title: 'Autosaved to repo', paragraphs: ['Project changes save an atomic snapshot to autosaves/latest.project.json in the repository. The browser also keeps a secondary IndexedDB copy. Reloading restores the saved project, but generation does not continue while the page is closed. Resume Generation starts a new execution from retained state.', 'The local application server writes the file and reloads it on startup, including from another browser. Replacing or resetting a book keeps a recovery copy in autosaves/. The indicator confirms the file write; if writing fails, it reports the failure and retries. Export the project to keep a portable recovery copy. An unfinished model response is not saved manuscript text.'] },
    { title: 'Save draft / Save book', paragraphs: ['Choose EPUB, PDF, TXT or Markdown to export the available manuscript. Report (JSON) exports available metadata and audit information. EPUB and PDF ask for an author name. Save draft can include incomplete or unreviewed chapters; the file is a reading copy, not an executable project checkpoint.'] },
    { title: 'Export project / Import project', paragraphs: ['Project export saves a JSON snapshot of the stored input, plan, manuscript, reviews, edits and execution checkpoints. Import restores that project into the current project slot. It does not include a separate backup of your provider credentials.', 'The main form keeps its own preferences, so inspect author settings and selected models before continuing an imported project. Import is unavailable while generation is active.'] },
    { title: 'Recover or start over', paragraphs: ['A model response can take time before text appears. When the run has stopped, the log shows the cause. Resume continues the saved desk with a fresh allowance. It does not close a debt the pages have not met.', 'Start a new book and Clean Slate clear the project. Export it first if you want to keep it.'] },
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
  if (/center|premise/i.test(title)) return 'pen';
  if (/left/i.test(title)) return 'layers';
  if (/measured|checks ·/i.test(title)) return 'chart';
  if (/inspector|progress|limits/i.test(title)) return 'clock';
  if (/search|tools|evidence/i.test(title)) return 'search';
  if (/recover|over/i.test(title)) return 'restore';
  if (/export|save draft/i.test(title)) return 'file';
  if (/autosave/i.test(title)) return 'save';
  if (/model|gemini|local ml|editor/i.test(title)) return 'models';
  if (/review|check|repair|audit/i.test(title)) return 'check';
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
          <p className="mt-1 text-xs text-zinc-400 light:text-zinc-500">One author writes the book at its desk.</p>
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
        <span>NovelGenerator · the author's desk</span>
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
        {/* The ring is gone, so the mark carries the button on its own: drawn against the glyph's
            bounds rather than the circle's, it fills the frame the circle used to occupy. */}
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
