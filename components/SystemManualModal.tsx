import React, { useState, useEffect } from 'react';

interface SystemManualModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SystemManualModal({ isOpen, onClose }: SystemManualModalProps) {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'models' | 'canon' | 'memory'>('pipeline');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-zinc-900 light:bg-white border border-zinc-800 light:border-zinc-200 rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 light:border-zinc-200 bg-zinc-950/60 light:bg-zinc-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 light:bg-zinc-100 border border-zinc-700 light:border-zinc-300 text-zinc-300 light:text-zinc-800">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100 light:text-zinc-900">
                NovelGenerator Architecture & System Guide
              </h2>
              <p className="text-xs text-zinc-400 light:text-zinc-500">
                How a book is planned, written, checked and recorded — and what runs locally on your machine
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 light:text-zinc-500 light:hover:text-zinc-800 hover:bg-zinc-800 light:hover:bg-zinc-200 rounded-md transition-colors"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-3 pb-2 border-b border-zinc-800/80 light:border-zinc-200 bg-zinc-950/30 light:bg-zinc-100/50 shrink-0 text-xs overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('pipeline')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'pipeline'
                ? 'bg-zinc-800 light:bg-white text-zinc-100 light:text-zinc-900 shadow-sm'
                : 'text-zinc-400 light:text-zinc-600 hover:text-zinc-200 light:hover:text-zinc-900 hover:bg-zinc-800/50'
            }`}
          >
            Book Pipeline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('models')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'models'
                ? 'bg-zinc-800 light:bg-white text-zinc-100 light:text-zinc-900 shadow-sm'
                : 'text-zinc-400 light:text-zinc-600 hover:text-zinc-200 light:hover:text-zinc-900 hover:bg-zinc-800/50'
            }`}
          >
            ML Models & WebGPU
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('canon')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'canon'
                ? 'bg-zinc-800 light:bg-white text-zinc-100 light:text-zinc-900 shadow-sm'
                : 'text-zinc-400 light:text-zinc-600 hover:text-zinc-200 light:hover:text-zinc-900 hover:bg-zinc-800/50'
            }`}
          >
            Story Canon
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('memory')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'memory'
                ? 'bg-zinc-800 light:bg-white text-zinc-100 light:text-zinc-900 shadow-sm'
                : 'text-zinc-400 light:text-zinc-600 hover:text-zinc-200 light:hover:text-zinc-900 hover:bg-zinc-800/50'
            }`}
          >
            Memory, GPU & Cache
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm leading-relaxed text-zinc-300 light:text-zinc-800">
          {activeTab === 'pipeline' && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-zinc-100 light:text-zinc-900">
                Data Lineage: From Premise to Finished Manuscript
              </h3>
              <p className="text-xs text-zinc-400 light:text-zinc-600">
                One rule runs the whole engine: code brings evidence, the model disposes it — and everything
                happens before a prose token exists. Nothing rewrites prose on its own; nothing revisits a sealed chapter.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-zinc-300 light:text-zinc-800 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 light:bg-zinc-200 flex items-center justify-center text-[10px] text-zinc-200 light:text-zinc-800">1</span>
                    Book Design (P01)
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    Premise becomes a compact construction: contract, cast, rules, causal map, ending, chapter map.
                    Every person the premise names must be cast under that name; every concrete given (a warehouse,
                    a check, a fiber) must earn a home in the construction. Code verifies both.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-zinc-300 light:text-zinc-800 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 light:bg-zinc-200 flex items-center justify-center text-[10px] text-zinc-200 light:text-zinc-800">2</span>
                    Design Review (P02)
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    Up to 3 attempts to make the plan executable. Blocking issues fail the book loudly instead of
                    producing prose on a broken plan. First-time majors on re-review soften so the loop converges;
                    repeated flags keep full force. The kinetic test rejects outcomes that restate the setup.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-zinc-300 light:text-zinc-800 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 light:bg-zinc-200 flex items-center justify-center text-[10px] text-zinc-200 light:text-zinc-800">3</span>
                    Chapter Plan + Pre-Write Gate (P03)
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    One chapter planned from confirmed state, then checked before a word is written: the mechanism it
                    draws from the book&apos;s ledger, the cost it takes from someone, the rung it occupies on the
                    declared pressure curve, the staging it repeats, the ending it is running out of room to prepare.
                    A blocking finding sends the plan back to the planner with the evidence — up to twice, because a
                    plan costs a fiftieth of the chapter it describes. The local models add restaging and
                    plan-vs-memory suspicions on top; the review disposes them, and hard verdicts become writer
                    instructions stitched into the package.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-zinc-300 light:text-zinc-800 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 light:bg-zinc-200 flex items-center justify-center text-[10px] text-zinc-200 light:text-zinc-800">4</span>
                    Scene Write (P04)
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    The writer's package is confirmed memory only: exact name spellings on record, tired phrases to
                    retire, the newest knowledge notes (memory keeps everything; attention decays). One scene, one take.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-zinc-300 light:text-zinc-800 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 light:bg-zinc-200 flex items-center justify-center text-[10px] text-zinc-200 light:text-zinc-800">5</span>
                    Track & Fold (P05)
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    Deltas enter memory with evidence or not at all. Missed names are recovered from the prose by code;
                    near-twin drift (one letter off an established name) blocks the line: one rewrite with the exact spelling demanded,
                    a second consecutive break fails loudly.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-zinc-300 light:text-zinc-800 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-zinc-800 light:bg-zinc-200 flex items-center justify-center text-[10px] text-zinc-200 light:text-zinc-800">6</span>
                    Forward Seal (P06–P07)
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    The plan is reconciled with what was actually written; next-chapter inputs carry forward. Accepted
                    chapters lock permanently — future chapters can never rewrite the past. Final audit reports integrity
                    with coverage, never edits silently.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'models' && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-zinc-100 light:text-zinc-900">
                Active ML Models: Cloud + In-Browser WebGPU
              </h3>
              <p className="text-xs text-zinc-400 light:text-zinc-600">
                The architecture leverages a dual-tier intelligence stack: large generative models for creative prose paired with specialized compact on-device neural networks.
              </p>

              {/* Cloud/Local LLM */}
              <div className="p-4 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/50 light:bg-zinc-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm text-zinc-200 light:text-zinc-900">
                    Prose Generator & Story Architect (LLM)
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800 light:bg-zinc-100 border border-zinc-700 light:border-zinc-300 text-zinc-300 light:text-zinc-800">
                    Cloud / Local Ollama
                  </span>
                </div>
                <p className="text-xs text-zinc-400 light:text-zinc-600">
                  <strong className="text-zinc-300 light:text-zinc-800">Gemini</strong> or local <strong className="text-zinc-300 light:text-zinc-800">Ollama</strong>, whichever model you name. Two routes: writer (prose, plans)
                  and validator (reviews, extraction). Set a separate validator model — otherwise the author judges
                  its own prose. Every run-log line carries the serving model, so after the fact you can see what
                  actually fired.
                </p>
              </div>

              {/* Local Models Table */}
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">
                  In-Browser Local Models (ONNX / WebGPU / Transformers.js)
                </div>

                <div className="border border-zinc-800 light:border-zinc-200 rounded-lg overflow-hidden divide-y divide-zinc-800 light:divide-zinc-200 text-xs">
                  <div className="p-3 bg-zinc-950/40 light:bg-zinc-50 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-200 light:text-zinc-900">
                        Cross-Encoder (Paraphrase Repetition)
                      </div>
                      <div className="text-zinc-500 font-mono text-[11px]">onnx-community/bge-reranker-v2-m3-ONNX · ~544 MB</div>
                      <p className="text-zinc-400 light:text-zinc-600 mt-1">
                        Reads two passages together and scores how much one retells the other. It is the only check in
                        the pipeline that catches a scene told a second time in different words, where no sequence of
                        words repeats. Used twice: on each chapter plan against finished prose before writing, and on
                        each finished scene against the accepted book. Its threshold was fitted over 525 cross-chapter
                        pairs from real runs, not chosen.
                      </p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-zinc-800 light:bg-zinc-100 text-zinc-300 light:text-zinc-800 border border-zinc-700 light:border-zinc-300">
                      Always on
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950/40 light:bg-zinc-50 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-200 light:text-zinc-900">
                        Natural Language Inference (Plan vs Memory)
                      </div>
                      <div className="text-zinc-500 font-mono text-[11px]">Xenova/nli-deberta-v3-base · ~233 MB</div>
                      <p className="text-zinc-400 light:text-zinc-600 mt-1">
                        Scores entailment and contradiction between a planned scene&apos;s claims and confirmed state —
                        a plan that contradicts what the book already established, which no string check can see.
                        Findings advise the plan review; they never block on their own.
                      </p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-zinc-800 light:bg-zinc-100 text-zinc-300 light:text-zinc-800 border border-zinc-700 light:border-zinc-300">
                      Always on
                    </span>
                  </div>
                </div>

                <p className="text-xs text-zinc-500 light:text-zinc-600">
                  Two models, and no setting to reduce them. A third existed — a small sentence embedder scoring the
                  same pairs by cosine — and it was removed: it ran, it wrote &quot;paraphrase restaging&quot; into the
                  run log, and it let a scene be retold nearly beat for beat from one chapter to the next. A check that
                  reports coverage it does not have is a check that stops anyone looking.
                </p>

                <p className="text-xs text-zinc-500 light:text-zinc-600">
                  Weights load from the application itself when they have been staged there
                  (<code className="px-1 py-0.5 rounded bg-zinc-800 light:bg-zinc-200 font-mono text-[11px]">npx vite-node scripts/warm-models.ts</code>),
                  and from Hugging Face otherwise. Either way the browser caches them once and runs them on your
                  machine; nothing of the manuscript leaves it. A model unused for five minutes is disposed and the
                  worker gives its memory back.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'canon' && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-zinc-100 light:text-zinc-900">
                Story Canon, and Why the Book Only Moves Forward
              </h3>
              <p className="text-xs text-zinc-400 light:text-zinc-600">
                What the book records about itself, what it allocates before writing, and why a finished chapter is
                never reopened.
              </p>

              <div className="space-y-3">
                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-200 light:text-zinc-900 text-xs mb-1">
                    What Constitutes Story Canon
                  </div>
                  <ul className="list-disc list-inside text-xs text-zinc-400 light:text-zinc-600 space-y-1">
                    <li><strong className="text-zinc-300 light:text-zinc-800">Canon Facts:</strong> Character states, spatial locations, recovered items, uncovered secrets.</li>
                    <li><strong className="text-zinc-300 light:text-zinc-800">Story Events:</strong> Irreversible choices made and their lasting consequences for the world.</li>
                    <li><strong className="text-zinc-300 light:text-zinc-800">Plot Promises:</strong> Guarantees that narrative seeds and setups receive earned payoffs before the conclusion.</li>
                    <li><strong className="text-zinc-300 light:text-zinc-800">Name Registry:</strong> Canonical spelling of every proper name, with aliases (a diminutive beside the full form).
                      A near-twin with no declared referent (one letter off an established name) is a continuity break: one rewrite
                      with the exact spelling, then loud failure.</li>
                    <li><strong className="text-zinc-300 light:text-zinc-800">Premise Givens:</strong> Every concrete premise element must earn a home in the construction.
                      A coherent plan that declines to tell the promised story fails review like any broken one.</li>
                    <li><strong className="text-zinc-300 light:text-zinc-800">Kinetic Rule:</strong> An outcome must move someone's position, possession, knowledge, or
                      commitment past the setup. A prolonged posture in the same words is stasis, not an event.</li>
                  </ul>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-300 light:text-zinc-800 text-xs mb-1">
                    Finished Chapters Are Never Rewritten
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600 leading-relaxed">
                    Let a continuity problem in Chapter 3 send the editor back to Chapter 1, and the fix changes the
                    facts Chapters 2 and 3 were written against. There is no bottom to that.
                  </p>
                  <p className="text-xs text-zinc-400 light:text-zinc-600 leading-relaxed mt-2">
                    So the book only moves forward. A chapter&apos;s state is snapshotted when it finishes and becomes
                    the resume point; the post-chapter reconciliation may change the chapters still ahead and never the
                    ones behind. Everything that can be fixed is fixed earlier, where it is cheap — in the plan, before
                    prose exists — and what is left is repaired within the scene that has it: a sentence duplicating
                    earlier prose is replaced in place, carrying the same information, so no delta is recomputed and no
                    later scene is disturbed. A full redraft happens only when a tracked change contradicts confirmed
                    state, and only once.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-300 light:text-zinc-800 text-xs mb-1">
                    Budgets, Allocated Before Anything Is Written
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600 leading-relaxed">
                    The design declares what kind of book this is: the shape of its pressure curve, the repetitions it
                    means as refrains, what paying a price consists of here, and the distinct ways its central obstacle
                    can be met. Chapters draw from that ledger and spend what they draw.
                  </p>
                  <p className="text-xs text-zinc-400 light:text-zinc-600 leading-relaxed mt-2">
                    A repetition you have to detect in the prose is a repetition you already paid to write. A middle act
                    that circles instead of building is decided in the plan, and no amount of rewriting scene four turns
                    four identical chapters into a rising book.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-zinc-100 light:text-zinc-900">
                Resource Management, GPU VRAM & Persistence
              </h3>
              <p className="text-xs text-zinc-400 light:text-zinc-600">
                How the engine safeguards local hardware resources and protects your drafts:
              </p>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-300 light:text-zinc-800 mb-1">
                    Automatic Idle GPU Unloading (Idle Release)
                  </div>
                  <p className="text-zinc-400 light:text-zinc-600">
                    Local neural models (reranker, NLI) occupy between 200 MB and 600 MB of VRAM each. When a model remains unused for <strong className="text-zinc-300 light:text-zinc-800">5 minutes</strong>, the manager invokes <code className="px-1 py-0.5 rounded bg-zinc-800 font-mono text-[11px]">dispose()</code> to free GPU memory (logged as: <em>released an idle model after 300s</em>). This prevents browser tab crashes and memory leaks.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-300 light:text-zinc-800 mb-1">
                    Local Weight Caching (Zero-Download Re-runs)
                  </div>
                  <p className="text-zinc-400 light:text-zinc-600">
                    Model weights are saved directly into the browser's persistent Cache Storage / IndexedDB. A model is downloaded over the network <strong className="text-zinc-300 light:text-zinc-800">exactly once</strong>. Subsequent runs load weights instantly from local disk at zero network cost.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-300 light:text-zinc-800 mb-1">
                    Writer-Package Decay (Attention, Not Amnesia)
                  </div>
                  <p className="text-zinc-400 light:text-zinc-600">
                    Memory keeps every confirmed note; the writer's package carries the newest eight per participant.
                    Reviewers always read the full state, so decay trims attention, never evidence. Old slots without
                    a name shelf load fine — the registry starts accumulating from the next scene.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-zinc-300 light:text-zinc-800 mb-1">
                    Fault-Tolerant Persistence (BrowserRunStore)
                  </div>
                  <p className="text-zinc-400 light:text-zinc-600">
                    Every generated scene, chapter revision, plan, and outline is automatically committed to IndexedDB. You can refresh the page, close the browser, or click <strong className="text-zinc-300 light:text-zinc-800">Resume Generation</strong> at any time without losing work.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-zinc-800 light:border-zinc-200 bg-zinc-950/60 light:bg-zinc-50 shrink-0 text-xs text-zinc-500">
          <span>NovelGenerator · Autonomous Novel Generation System</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 light:bg-zinc-200 light:hover:bg-zinc-300 text-zinc-200 light:text-zinc-800 rounded-md font-medium transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/** The button component placed next to ThemeToggle */
export function SystemManualToggle({ className = '' }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="System Architecture & Documentation Guide"
        aria-label="Open System Architecture Guide"
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
