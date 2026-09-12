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
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
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
                Pipeline workflow, data lineage, and ML model orchestrations
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
            📖 Book Pipeline
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
            🧠 ML Models & WebGPU
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
            🛡️ Story Canon & Forward-Only
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
            ⚡ Memory, GPU & Cache
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm leading-relaxed text-zinc-300 light:text-zinc-700">
          {activeTab === 'pipeline' && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-zinc-100 light:text-zinc-900">
                Data Lineage: From Premise to Finished Manuscript
              </h3>
              <p className="text-xs text-zinc-400 light:text-zinc-600">
                The generator avoids monolithic unguided writing by structuring novel production into a multi-tier Causal Blueprint:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-indigo-400 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px]">1</span>
                    Authorial Contract
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    Fixes genre, language (e.g. English, Russian), POV, tense, tone, chapter count, and target word budget. Serves as immutable foundation for all downstream generation.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-emerald-400 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px]">2</span>
                    Causal Blueprint & Outline
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    Architects overall plot, central conflict, character arcs, and dramatic promises—tracking where every Chekhovian gun is planted and in which chapter it must fire.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-amber-400 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px]">3</span>
                    Scene Staging & Direction
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    Each chapter is decomposed into scenes with explicit participants, conflict, setting, sensory anchors, and dramatic shift to prevent wandering narrative.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-cyan-400 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-[10px]">4</span>
                    Prose Drafting (Writer)
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    Generates prose adhering to setting continuity (no restating room decor if characters remain in place), single-take climaxes, and emotional pulse.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-purple-400 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px]">5</span>
                    Local Quality Check (1–5 Edits)
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    Verifies canon consistency and NLI contradiction checks against previous chapters. If flaws exist, performs at most 1–2 targeted edits (top 5 defects).
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="flex items-center gap-2 font-medium text-rose-400 text-xs uppercase tracking-wide mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center text-[10px]">6</span>
                    Forward-Only Seal
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600">
                    Accepted chapter is permanently locked. Canon facts and world events are extracted into novel memory. The next chapter builds strictly on top of this sealed canon.
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
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                    Cloud / Local Ollama
                  </span>
                </div>
                <p className="text-xs text-zinc-400 light:text-zinc-600">
                  <strong className="text-zinc-300 light:text-zinc-800">Gemini (2.5 Flash / Pro)</strong> or local <strong className="text-zinc-300 light:text-zinc-800">Ollama</strong> (Llama 3, Qwen 2.5, DeepSeek). Handles scene prose, dialogue, dramatic tension, and local targeted line editing.
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
                        Fast Semantic Repetition Scanner (Embeddings)
                      </div>
                      <div className="text-zinc-500 font-mono text-[11px]">Xenova/all-MiniLM-L6-v2 · ~23 MB</div>
                      <p className="text-zinc-400 light:text-zinc-600 mt-1">
                        Encodes each paragraph into a 384-dimensional vector. Computes cosine similarity across paragraphs in 10ms to detect stylistic echoes and repeated motifs.
                      </p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Default Active
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950/40 light:bg-zinc-50 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-200 light:text-zinc-900">
                        Cross-Encoder Repetition Reranker
                      </div>
                      <div className="text-zinc-500 font-mono text-[11px]">onnx-community/bge-reranker-v2-m3-ONNX · ~600 MB</div>
                      <p className="text-zinc-400 light:text-zinc-600 mt-1">
                        Deep joint evaluation of suspicious candidate pairs (top 8). Analyzes paragraphs simultaneously in shared context to distinguish deliberate leitmotif from unintended repetition.
                      </p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      WebGPU
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950/40 light:bg-zinc-50 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-200 light:text-zinc-900">
                        Natural Language Inference (NLI Canon Verification)
                      </div>
                      <div className="text-zinc-500 font-mono text-[11px]">Xenova/nli-deberta-v3-base · ~250 MB</div>
                      <p className="text-zinc-400 light:text-zinc-600 mt-1">
                        Evaluates logical entailment and contradiction between claims in new chapters and established canon facts, with calibrated thresholds to suppress false positives.
                      </p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400">
                      Optional
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950/40 light:bg-zinc-50 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-200 light:text-zinc-900">
                        Language Guard (Language Identification)
                      </div>
                      <div className="text-zinc-500 font-mono text-[11px]">onnx-community/language_detection-ONNX · ~100 MB</div>
                      <p className="text-zinc-400 light:text-zinc-600 mt-1">
                        Ensures prose stays strictly in the contracted language and prevents unintended language leakage or intrusive code-switching.
                      </p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400">
                      Optional
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950/40 light:bg-zinc-50 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-200 light:text-zinc-900">
                        Ledger Compression (Summarization)
                      </div>
                      <div className="text-zinc-500 font-mono text-[11px]">Xenova/distilbart-cnn-6-6 · ~300 MB</div>
                      <p className="text-zinc-400 light:text-zinc-600 mt-1">
                        Summarizes sprawling story history when ledger exceeds 8,000 characters, conserving context tokens for generative models.
                      </p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400">
                      Optional
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950/40 light:bg-zinc-50 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-200 light:text-zinc-900">
                        Genre & Emotion Trajectory Analysis
                      </div>
                      <div className="text-zinc-500 font-mono text-[11px]">bart-large-mnli (~400 MB) · roberta-base-go_emotions (~130 MB)</div>
                      <p className="text-zinc-400 light:text-zinc-600 mt-1">
                        Classifies alignment with target genre and tracks emotional arc (28 granular emotion categories) across the novel's unfolding chapters.
                      </p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400">
                      Optional
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'canon' && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-zinc-100 light:text-zinc-900">
                Story Canon & Forward-Only Discipline
              </h3>
              <p className="text-xs text-zinc-400 light:text-zinc-600">
                How ironclad plot integrity is guaranteed without getting trapped in infinite revision cascades.
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
                  </ul>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-emerald-400 text-xs mb-1">
                    Why Forward-Only Mode is Crucial
                  </div>
                  <p className="text-xs text-zinc-400 light:text-zinc-600 leading-relaxed">
                    In naive iterative systems, a minor continuity issue in Chapter 3 causes the editor to retroactively rewrite Chapter 1. But modifying Chapter 1 alters canon facts and invalidates Chapters 2 and 3—triggering an infinite cascading rewrite loop.
                  </p>
                  <p className="text-xs text-zinc-400 light:text-zinc-600 leading-relaxed mt-2">
                    In <strong className="text-zinc-200 light:text-zinc-800">Forward-Only</strong> mode, a strict monotonic invariant applies: <em>"Chapter drafts → verified against established canon (1–5 targeted edits) → permanently sealed"</em>. Future chapters can never invalidate or rewrite past chapters, guaranteeing deterministic completion within planned budget.
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
                  <div className="font-medium text-amber-400 mb-1">
                    Automatic Idle GPU Unloading (Idle Release)
                  </div>
                  <p className="text-zinc-400 light:text-zinc-600">
                    Local neural models (reranker, NLI) occupy between 200 MB and 600 MB of VRAM each. When a model remains unused for <strong className="text-zinc-300 light:text-zinc-800">5 minutes</strong>, the manager invokes <code className="px-1 py-0.5 rounded bg-zinc-800 font-mono text-[11px]">dispose()</code> to free GPU memory (logged as: <em>released an idle model after 300s</em>). This prevents browser tab crashes and memory leaks.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-indigo-400 mb-1">
                    Local Weight Caching (Zero-Download Re-runs)
                  </div>
                  <p className="text-zinc-400 light:text-zinc-600">
                    Model weights are saved directly into the browser's persistent Cache Storage / IndexedDB. A model is downloaded over the network <strong className="text-zinc-300 light:text-zinc-800">exactly once</strong>. Subsequent runs load weights instantly from local disk at zero network cost.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg border border-zinc-800 light:border-zinc-200 bg-zinc-950/40 light:bg-zinc-50">
                  <div className="font-medium text-emerald-400 mb-1">
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
        className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-all duration-200 text-zinc-400 hover:text-indigo-400 light:text-zinc-500 light:hover:text-indigo-600 border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 hover:border-indigo-500/40 light:border-zinc-200/80 light:bg-white light:hover:bg-zinc-100 shadow-sm ${className}`}
      >
        <svg
          className="w-3.5 h-3.5 transition-transform duration-200 hover:scale-110"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
      <SystemManualModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

export default SystemManualToggle;
