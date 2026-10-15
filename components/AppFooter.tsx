import React, { useState } from 'react';
import { SystemManualModal } from './SystemManualModal';

interface AppFooterProps {
  isStudioLayout?: boolean;
  finalBookContent?: boolean;
}

export const AppFooter: React.FC<AppFooterProps> = ({
  isStudioLayout = false,
  finalBookContent = false,
}) => {
  const [isManualOpen, setIsManualOpen] = useState(false);

  // Keep studio layout strictly focused on workspace without vertical scroll clutter
  if (isStudioLayout) {
    return null;
  }

  return (
    <footer
      id="app-page-footer"
      className={`w-full ${
        finalBookContent ? 'max-w-[1700px]' : 'max-w-4xl'
      } mt-14 mb-8 px-4 md:px-6 transition-all duration-300`}
      aria-label="Application overview and publishing information"
    >
      {/* 4-column feature and architecture grid */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm p-6 md:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 text-left">
          
          {/* Column 1: Craft 2.0 Engine */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50" />
              <h3 className="text-xs font-semibold tracking-wider uppercase text-zinc-200">
                Craft 2.0 Engine
              </h3>
            </div>
            <p className="text-[11px] font-medium text-indigo-400/90">
              Autonomous Multi-Agent Cycle
            </p>
            <ul className="space-y-2 text-[11px] text-zinc-400 leading-relaxed">
              <li>
                <strong className="text-zinc-300">Causal Architecture:</strong> 4-layer truth separation (Dossier → Relational Scene Cards → Enactment).
              </li>
              <li>
                <strong className="text-zinc-300">Strict POV Barrier:</strong> Isolates prompt context to eliminate narrative leakage and plot inconsistency.
              </li>
              <li>
                <strong className="text-zinc-300">Dual Review & Observer:</strong> Blind reading audits paired with sensory validation receipts.
              </li>
            </ul>
          </div>

          {/* Column 2: Formats & Export */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <h3 className="text-xs font-semibold tracking-wider uppercase text-zinc-200">
                Formats & Export
              </h3>
            </div>
            <p className="text-[11px] font-medium text-emerald-400/90">
              Professional Distribution
            </p>
            <ul className="space-y-2 text-[11px] text-zinc-400 leading-relaxed">
              <li>
                <strong className="text-zinc-300">EPUB 3.0:</strong> Embedded cover art, standard manifest & spine navigation for Apple Books and Kindle.
              </li>
              <li>
                <strong className="text-zinc-300">Print-Ready PDF:</strong> Full-bleed cover sheet, legal colophon imprint & clean chapter breaks.
              </li>
              <li>
                <strong className="text-zinc-300">Markdown & Plain Text:</strong> Clean unpolluted prose for universal archiving.
              </li>
              <li>
                <strong className="text-zinc-300">Project Backup:</strong> Portable <code className="text-zinc-300 font-mono text-[10px]">.project.json</code> snapshot for 1-click restoration.
              </li>
            </ul>
          </div>

          {/* Column 3: Privacy & Offline */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
              <h3 className="text-xs font-semibold tracking-wider uppercase text-zinc-200">
                Privacy & Offline
              </h3>
            </div>
            <p className="text-[11px] font-medium text-amber-400/90">
              Author Sovereignty
            </p>
            <ul className="space-y-2 text-[11px] text-zinc-400 leading-relaxed">
              <li>
                <strong className="text-zinc-300">Zero Telemetry:</strong> Manuscripts and prompts never leave your local environment.
              </li>
              <li>
                <strong className="text-zinc-300">Local Ollama Support:</strong> Generate novel drafts entirely offline with private open-weights models.
              </li>
              <li>
                <strong className="text-zinc-300">Client-Side BYOK:</strong> Cloud API keys are stored in browser memory without intermediate proxy servers.
              </li>
              <li>
                <strong className="text-zinc-300">Local Autosave:</strong> IndexedDB resilient snapshots prevent data loss from accidental refreshes.
              </li>
            </ul>
          </div>

          {/* Column 4: Publishing & Rights */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500/50" />
              <h3 className="text-xs font-semibold tracking-wider uppercase text-zinc-200">
                Colophon & Rights
              </h3>
            </div>
            <p className="text-[11px] font-medium text-cyan-400/90">
              Legal & Imprint Standards
            </p>
            <ul className="space-y-2 text-[11px] text-zinc-400 leading-relaxed">
              <li>
                <strong className="text-zinc-300">Automated Colophon:</strong> Industry-standard publishing notice generated dynamically with author name.
              </li>
              <li>
                <strong className="text-zinc-300">Dual ISBN Registration:</strong> Dedicated input fields for Paperback and Ebook edition identifiers.
              </li>
              <li>
                <strong className="text-zinc-300">Author Protection:</strong> Explicit AI-assistance disclosures and worldwide distribution indemnity.
              </li>
              <li>
                <strong className="text-zinc-300">Model Provenance:</strong> Automatic logging of generation models in production metadata.
              </li>
            </ul>
          </div>

        </div>

        {/* Footer bottom utility bar */}
        <div className="mt-8 pt-5 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-400">NovelGenerator</span>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-500">Craft 2.0 Engine</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700/60">
              v4.5
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsManualOpen(true)}
              className="text-zinc-400 hover:text-zinc-200 transition-colors underline decoration-dotted"
            >
              System Manual
            </button>
            <span className="text-zinc-700">·</span>
            <span>
              &copy; {new Date().getFullYear()}{' '}
              <a
                href="https://github.com/KazKozDev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-zinc-200 transition-colors underline decoration-dotted"
              >
                KazKozDev
              </a>
            </span>
          </div>
        </div>
      </div>

      <SystemManualModal isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
    </footer>
  );
};

export default AppFooter;
