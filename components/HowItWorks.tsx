import React from 'react';

const HowItWorks: React.FC = () => {
  return (
    <div className="mb-8 p-6 border border-zinc-800 bg-zinc-900/60 rounded">
      <h2 className="text-lg font-semibold text-center text-zinc-100 mb-6">
        How it Works
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono font-medium text-xs">
              01
            </span>
            <h3 className="font-medium text-zinc-300 text-sm">Story Planning</h3>
          </div>
          <p className="text-zinc-400 text-xs pl-9">
            Enter your story idea and desired chapter count.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono font-medium text-xs">
              02
            </span>
            <h3 className="font-medium text-zinc-300 text-sm">Outline Generation</h3>
          </div>
          <p className="text-zinc-400 text-xs pl-9">
            AI generates a detailed story outline and chapter-by-chapter plan.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono font-medium text-xs">
              03
            </span>
            <h3 className="font-medium text-zinc-300 text-sm">Review & Approve</h3>
          </div>
          <p className="text-zinc-400 text-xs pl-9">
            You review and can edit the outline before proceeding.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono font-medium text-xs">
              04
            </span>
            <h3 className="font-medium text-zinc-300 text-sm">Chapter Writing</h3>
          </div>
          <p className="text-zinc-400 text-xs pl-9">
            Each chapter is written with individual editing and consistency checks.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono font-medium text-xs">
              05
            </span>
            <h3 className="font-medium text-zinc-300 text-sm">Final Editing Pass</h3>
          </div>
          <p className="text-zinc-400 text-xs pl-9">
            All chapters are reviewed together for continuity and flow.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono font-medium text-xs">
              06
            </span>
            <h3 className="font-medium text-zinc-300 text-sm">Professional Polish</h3>
          </div>
          <p className="text-zinc-400 text-xs pl-9">
            Final refinement focused on rhythm, subtext, and emotional depth.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono font-medium text-xs">
              07
            </span>
            <h3 className="font-medium text-zinc-300 text-sm">Book Compilation</h3>
          </div>
          <p className="text-zinc-400 text-xs pl-9">
            Your complete, publication-ready book draft is presented!
          </p>
        </div>
      </div>

      <div className="mt-6 p-3 bg-zinc-950 border border-zinc-800 rounded">
        <p className="text-xs text-zinc-400 text-center">
          <strong className="text-zinc-300 uppercaser">Time estimate:</strong> Generation can take several minutes. Each chapter undergoes specialist coordination and multi-pass refinement.
        </p>
      </div>
    </div>
  );
};

export default HowItWorks;
