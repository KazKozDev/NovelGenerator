import React, { useState, useEffect } from 'react';

interface SystemManualModalProps { isOpen: boolean; onClose: () => void }

const sections = [
  {
    id: 'start',
    label: 'Getting started',
    title: 'Define the book you want to write',
    intro: 'The main form supplies the premise and style parameters. The Craft 2.0 engine drafts the dossier, projects the relational scene matrix, and enacts each scene under strict POV barriers.',
    cards: [
      {
        title: 'Premise and story vision',
        paragraphs: [
          'Describe the central conflict, named characters, world setting, and desired resolution or thematic climax.',
          'Genre, audience, narrative voice (e.g. Third-Limited, First-Person), tense (Past, Present), tone (Serious, Whimsical, Dark, Gritty), and style (Descriptive, Cinematic, Minimalist) are passed directly into the strategic prompt architecture as authorial constraints.'
        ]
      },
      {
        title: 'Chapter count and rough size',
        paragraphs: [
          'Choose between 3 and 100 chapters. Rough words per chapter provides flexible guidance (default: 4,000 words); scenes expand or compress according to dramatic necessity rather than arbitrary cutoffs.',
          'The generation pipeline operates within a call and time budget that scales dynamically with chapter volume. Upon completion, the book transitions directly to the Author Desk with full editorial audits.'
        ]
      },
      {
        title: 'Author model and reader model',
        paragraphs: [
          'The Author model manages the strategic planning (world dossier, scene cards) and enacts the prose. You can select Google Gemini, local Ollama models (e.g. Qwen 2.5, Llama 3.3), Qwen, Hugging Face, or any OpenAI-compatible API endpoint.',
          'Enabling a dedicated Reader model assigns an independent LLM instance to the Observer, Blind Reader, and Dual Audits. If the Reader model experiences connectivity or token limits, the engine provides transparent fallback to the primary model.'
        ]
      },
      {
        title: 'Start, continue, or restore',
        paragraphs: [
          'Start Generation initializes a fresh book from the form. Resume Generation continues an interrupted run from the exact stage reached.',
          'Load Project restores a previous project from a .project.json backup file. Changing premise or chapter count begins a new book, while style adjustments apply immediately to upcoming scenes.'
        ]
      }
    ]
  },
  {
    id: 'workspace',
    label: 'Generation View',
    title: 'Watch the novel develop across three live zones',
    intro: 'During generation, the workspace organizes progress into three synchronized zones: navigation & logs, manuscript & craft tools, and real-time inspector metrics.',
    cards: [
      {
        title: 'Left · Chapters and pipeline logs',
        paragraphs: [
          'Click any chapter to inspect its draft. The chapter status indicates Pending (not yet reached), Live (currently being drafted or checked), or Draft (prose written and ready).',
          'Beneath the chapter list, the Live Pipeline Log records granular execution milestones: dossier synthesis, scene card projection, blind drafting, observer validation, and dual audits.'
        ]
      },
      {
        title: 'Center · Manuscript and Craft tabs',
        paragraphs: [
          'Clean text renders formatted reader prose; Raw shows markdown; Changes compares successive scene revisions with diff highlighting.',
          'Above the reader are the Craft 2.0 Inspector tabs: Dossier (4 Layers of Truth), Scene Cards (Relational Projection Matrix), Observer (Sensory Receipts), Reader (Blind Hypotheses), and Reviews (Dual Audits). Click an active tab again to toggle back to the manuscript.'
        ]
      },
      {
        title: 'Right · Checks and Agent Inspector',
        paragraphs: [
          'Checks displays chapter-level signals: real-time word count, dialogue percentage, originality score, repeated motifs, and prose rhythm.',
          'Agent Inspector tracks pipeline activity: active operation, elapsed time, total model calls, and cumulative input/output token usage (with ~ indicating local estimations).'
        ]
      }
    ]
  },
  {
    id: 'studio',
    label: 'Author Desk',
    title: 'Review, edit, and style your completed book',
    intro: 'Once all chapters are drafted, NovelGenerator transitions into the finished Author Desk—a focused three-zone publishing environment for editorial refinement and manuscript customization.',
    cards: [
      {
        title: 'Column 1 · Editorial Review & Auto-Repair',
        paragraphs: [
          'The Editorial Review card surfaces overall manuscript health, continuity warnings, POV fidelity, and line-level recommendations.',
          'Click Apply Review (or Run Review) to trigger an autonomous editorial revision pass: the engine re-evaluates flagged inconsistencies and enacts corrections directly across the manuscript.'
        ]
      },
      {
        title: 'Column 2 · Manuscript Reader & In-Place Editor',
        paragraphs: [
          'A distraction-free reading experience with chapter navigation, word count tracking, and instant copy-to-clipboard.',
          'Click Edit text to switch the entire book into an in-place markdown editor. Use standard shortcuts: press Cmd+S or Ctrl+S to save changes instantly, or Esc/Cancel to discard edits.'
        ]
      },
      {
        title: 'Column 3 · Book Cover & Publishing Imprint',
        paragraphs: [
          'Book Cover Artwork: Upload high-resolution front cover images (PNG, JPEG, WebP) with drag-and-drop. Artwork is automatically stored in project data and seamlessly embedded in EPUB and PDF exports.',
          'Author Attribution & Imprint: Specify author name, publication year, copyright holder, ISBN identifiers (eBook and Paperback), publisher name, and edition lines. All imprint fields are saved persistently and formatted into classic copyright pages.'
        ]
      }
    ]
  },
  {
    id: 'export',
    label: 'Publishing & Export',
    title: 'Professional industry-standard book exports',
    intro: 'NovelGenerator produces publication-grade deliverables ready for distribution across digital readers, print-on-demand services, and archive backups.',
    cards: [
      {
        title: 'EPUB 3.0 (eReaders & Tablets)',
        paragraphs: [
          'Generates a fully compliant EPUB 3.0 archive with embedded full-bleed cover artwork in the package manifest (properties="cover-image") and spine.',
          'Includes a dedicated Cover page, formatted Title page, publishing Imprint colophon (imprint.xhtml) with zero-indent legal blocks, and a semantic Table of Contents (nav.xhtml) matching e-reader navigation standards.'
        ]
      },
      {
        title: 'Print-Ready PDF (A4 / Book Print)',
        paragraphs: [
          'Full-Bleed Cover: The uploaded cover image stretches edge-to-edge across the initial page with zero white borders.',
          'Header & Footer Suppression: Eliminates browser-printed date/time headers and about:blank footers via strict print-engine page margins.',
          'Classic Publishing Colophon: Positioned bottom-left with crisp 8.5pt typography, zero paragraph indentation, and clean legal disclaimers (copyright, rights, AI assistance disclosure, liability, and fiction notes).',
          'Automatic Table of Contents: Generates a complete TOC with dotted leaders linking chapters to page numbers.',
          'Repeating Spacer Margins: Uses table-based thead and tfoot print spacers (2.8cm) ensuring multi-page chapters never clip or touch paper edges.'
        ]
      },
      {
        title: 'Plain Text (.txt) & Markdown (.md)',
        paragraphs: [
          'Exports clean, standardized plain text or markdown files with formatted chapter headings and scene dividers (* * *), ideal for import into Scrivener, Google Docs, or text editors.'
        ]
      },
      {
        title: 'Project Backup (.project.json) & Audit Report',
        paragraphs: [
          'Save Draft / Save Book produces a full portable JSON backup containing story settings, dossier, scene matrix, chapter drafts, editorial findings, and embedded cover artwork.',
          'Report (JSON) exports comprehensive quality metrics and observer audit receipts for transparency and technical review.'
        ]
      }
    ]
  },
  {
    id: 'metrics',
    label: 'Metrics & Stats',
    title: 'Understand every signal, metric, and indicator',
    intro: 'NovelGenerator computes multi-dimensional prose analytics at both the chapter level and across the full novel.',
    cards: [
      {
        title: 'Book Statistics Bar (Reading View)',
        paragraphs: [
          'Chapters: Total completed chapters and average words per chapter.',
          'Words & Chars: Total word count and character count (without whitespace).',
          'Read Time: Estimated reading time calculated at a standard average pace of 200 words per minute.',
          'Dialogue %: Proportion of words spoken within dialogue quotes versus narrative exposition.',
          'Avg Tension: Average emotional tension score across chapter narrative arcs (on a 1–10 scale).'
        ]
      },
      {
        title: 'Checks · Stylistic & Pacing Signals',
        paragraphs: [
          'Review: Manuscript verification state (Draft · not verified, Checks passed, Reviewed · warnings).',
          'Originality: Percentage of distinct 4-word n-gram sequences after normalization. Higher scores indicate richer phrasing with minimal verbal crutches.',
          'Motifs: Recurring 4-word phrases appearing across multiple sentences, identifying intentional leitmotifs or unintended echoes.',
          'Rhythm: Sentence length variance between chapter opening and closing passages (Held vs. drifted medians).',
          'Hook: Ten-point score assessing opening action, character agency, immediate conflict, and question planting.'
        ]
      },
      {
        title: 'Measured · Prose Texture',
        paragraphs: [
          'Words: Current chapter word count versus requested target.',
          'Median paragraph: Median paragraph length in words. Blank lines separate paragraphs.',
          'Comparisons/1k: Frequency of comparison markers (like, as if, as though) per thousand words to prevent simile overload.',
          'Lines with a beat: Share of dialogue lines accompanied by active physical beats or character gestures.'
        ]
      },
      {
        title: 'Agent Inspector · Operations & Resource Telemetry',
        paragraphs: [
          'Events: Total logged agent operations.',
          'Current operation: Active pipeline phase (Dossier, Scene Projection, Enactment, Observer, Audit).',
          'Calls & Tokens: Total LLM requests, cumulative prompt input tokens, and generated output tokens (~ marks local model approximations).'
        ]
      }
    ]
  },
  {
    id: 'process',
    label: 'Craft 2.0 Engine',
    title: 'Two Layers of Truth & Deterministic Pipeline',
    intro: 'Craft 2.0 cleanly separates strategic causality from sensory physical enactment through five architectural pillars.',
    cards: [
      {
        title: '1 · Deterministic Phased Pipeline',
        paragraphs: [
          'Strictly decoupled execution sequence: Dossier → Scene Cards → Preflight → Blind Write → Observer → Dual Review.',
          'Each stage operates under explicit JSON schema contracts, preventing hallucination cascades and preserving maximum context purity.'
        ]
      },
      {
        title: '2 · Strict Relational Scene Matrix (packet.json)',
        paragraphs: [
          'Every chapter consists of 3 distinct scenes governed by the "Therefore / But" causal momentum law (every action forces a dilemma or complication).',
          'Simultaneously tracks three layers of conflict (internal dilemma, interpersonal clash, external obstacle) and mandates value charge shifts (+ to - or - to +).'
        ]
      },
      {
        title: '3 · Strict POV Barrier',
        paragraphs: [
          'Scene prompts are strictly isolated from future narrative facts (povKnows, learnsAt < order).',
          'Omniscience leaks and narrative spoilers are blocked at prompt synthesis, guaranteeing characters only act upon what they legitimately know in the moment.'
        ]
      },
      {
        title: '4 · Anti-Metaphorical Directive',
        paragraphs: [
          'Explicit prohibition against abstract clichés, purple prose, and pseudo-literary filler.',
          'Demands concrete sensory grounding: physical character vectors, room acoustics, tangible props, and authentic dialogue beats.'
        ]
      },
      {
        title: '5 · Embedded Continuous Checks',
        paragraphs: [
          'A Blind Reader generates forward hypotheses and emotional anticipation before each scene with zero future knowledge.',
          'Dual Reviewers (Developmental and Literary) verify continuity, setup/payoff symmetry, and thematic resolution across the entire arc.'
        ]
      }
    ]
  },
  {
    id: 'checks',
    label: 'Quality & Audits',
    title: 'Independent Validation & Dual Reviews',
    intro: 'Every scene and chapter undergoes multi-perspective audit passes before being accepted into the final manuscript.',
    cards: [
      {
        title: 'Observer Sensory Validation Receipts',
        paragraphs: [
          'The Observer examines enacted scenes against their Scene Card specifications, generating physical receipts that verify sensory details, prop tracking, character positions, and subtext.'
        ]
      },
      {
        title: 'Blind Reader Hypothesis Tracking',
        paragraphs: [
          'Simulates reader comprehension with zero future knowledge. It records expectations, emerging questions, and emotional investment to verify narrative suspense and clarity.'
        ]
      },
      {
        title: 'Dual Review: Developmental & Literary',
        paragraphs: [
          'Developmental Audit: Evaluates narrative causality, character arcs, payoff integrity, and premise fulfillment.',
          'Literary Review: Inspects prose texture, voice consistency, sentence rhythm, and sensory immersion.'
        ]
      },
      {
        title: 'Causal Integrity & Repair Pass',
        paragraphs: [
          'If the Observer or Dual Reviewers flag severe continuity contradictions or POV breaches, the engine executes a targeted repair pass to resolve discrepancies before proceeding.'
        ]
      }
    ]
  },
  {
    id: 'saving',
    label: 'Saving & Models',
    title: 'Dual-persistence, model providers, and offline capability',
    intro: 'NovelGenerator combines local repository backups, browser storage, and wide LLM provider support.',
    cards: [
      {
        title: 'Atomic Dual-Persistence Autosave',
        paragraphs: [
          'Each book has its own folder in Documents/NovelGenerator: the project and its text are saved there automatically, and every Save button writes there too. The project is also mirrored to browser IndexedDB.',
          'Replacing a book with a new one under the same title keeps a dated copy in its копии/ folder. Reloading the page or closing the tab preserves your work completely.'
        ]
      },
      {
        title: 'Portable Project Backup & Restoration',
        paragraphs: [
          'Export Project downloads an all-inclusive .project.json containing input premise, dossier, relational scene matrix, chapter drafts, editorial findings, and custom cover artwork.',
          'Restore backup (.project.json) reloads any book into the workspace instantly, ready for further editing, review, or re-export.'
        ]
      },
      {
        title: 'Model Providers & Local Offline Execution',
        paragraphs: [
          'Google Gemini: High-speed cloud generation with Gemini 2.5 Flash / Pro.',
          'Ollama (Local LLMs): Connects to local models (e.g. Qwen 2.5 32B/72B, Llama 3.3) for 100% offline, private, and free generation.',
          'Qwen & Hugging Face: Connects via server proxy to open-weights models.',
          'API Compatible: Connects to any standard OpenAI-compatible Chat Completions endpoint (e.g. vLLM, LM Studio, OpenRouter, Groq).'
        ]
      },
      {
        title: 'Error Recovery & Resume Generation',
        paragraphs: [
          'If an external provider suffers network drops, timeouts, or rate limits, the run safely halts and displays detailed error context.',
          'Click Resume Generation to continue writing from the exact validated scene reached without losing prior progress.'
        ]
      }
    ]
  }
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
  start: 'book',
  workspace: 'layout',
  studio: 'pen',
  export: 'file',
  metrics: 'chart',
  process: 'layers',
  checks: 'check',
  saving: 'save',
};

function cardIcon(title: string): GuideIconName {
  if (/chapter count|budget|target/i.test(title)) return 'target';
  if (/start|continue|play/i.test(title)) return 'play';
  if (/premise|writing|manuscript|editor|author desk|cover|column 2|column 3/i.test(title)) return 'pen';
  if (/left|matrix|pipeline|column 1|relational/i.test(title)) return 'layers';
  if (/measured|checks ·|statistics|rhythm|metrics|signals|prose texture/i.test(title)) return 'chart';
  if (/inspector|progress|limits|continuous|time|telemetry/i.test(title)) return 'clock';
  if (/search|tools|evidence|observer|audit|receipt/i.test(title)) return 'search';
  if (/recover|over|repair|revision|restore/i.test(title)) return 'restore';
  if (/export|save draft|epub|pdf|formats|publish|plain text|backup/i.test(title)) return 'file';
  if (/autosave|saving|persistence/i.test(title)) return 'save';
  if (/model|gemini|local ml|ollama|provider/i.test(title)) return 'models';
  if (/review|check|barrier|directive|quality|integrity/i.test(title)) return 'check';
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
          <p className="mt-1 text-xs text-zinc-400 light:text-zinc-500">Craft 2.0 Engine · Author Desk & Publishing Studio</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close guide" title="Close (Esc)" className="shrink-0 p-1.5 text-zinc-400 hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-800 hover:bg-zinc-800 light:hover:bg-zinc-200 rounded-md transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </header>
      <nav aria-label="Guide sections" className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1 px-5 py-3 border-b border-zinc-800 light:border-zinc-200 shrink-0">
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>NovelGenerator · Craft 2.0 Engine</span>
          <span className="text-zinc-600 light:text-zinc-400">·</span>
          <span>
            &copy; {new Date().getFullYear()}{' '}
            <a
              href="https://github.com/KazKozDev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-zinc-200 light:text-zinc-600 light:hover:text-zinc-900 transition-colors underline decoration-dotted"
            >
              KazKozDev
            </a>
          </span>
        </div>
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
