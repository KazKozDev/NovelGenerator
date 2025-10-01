import React from 'react';

const HowItWorks: React.FC = () => {
  return (
    <div className="mb-8 p-6 border border-sky-700/50 bg-slate-800/50 backdrop-blur-sm rounded-lg">
      <h2 className="text-2xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300 mb-6">
        How it Works
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 font-bold text-sm">
              1
            </span>
            <h3 className="font-semibold text-sky-300">Story Planning</h3>
          </div>
          <p className="text-slate-400 text-sm pl-10">
            Enter your story idea and desired chapter count.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 font-bold text-sm">
              2
            </span>
            <h3 className="font-semibold text-sky-300">Outline Generation</h3>
          </div>
          <p className="text-slate-400 text-sm pl-10">
            AI generates a detailed story outline and chapter-by-chapter plan.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 font-bold text-sm">
              3
            </span>
            <h3 className="font-semibold text-sky-300">Review & Approve</h3>
          </div>
          <p className="text-slate-400 text-sm pl-10">
            You review and can edit the outline before proceeding.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 font-bold text-sm">
              4
            </span>
            <h3 className="font-semibold text-sky-300">Chapter Writing</h3>
          </div>
          <p className="text-slate-400 text-sm pl-10">
            Each chapter is written with individual editing and consistency checks.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 font-bold text-sm">
              5
            </span>
            <h3 className="font-semibold text-sky-300">Final Editing Pass</h3>
          </div>
          <p className="text-slate-400 text-sm pl-10">
            All chapters are reviewed together for continuity and flow.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 font-bold text-sm">
              6
            </span>
            <h3 className="font-semibold text-sky-300">Professional Polish</h3>
          </div>
          <p className="text-slate-400 text-sm pl-10">
            Final refinement focused on rhythm, subtext, and emotional depth.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 font-bold text-sm">
              7
            </span>
            <h3 className="font-semibold text-sky-300">Book Compilation</h3>
          </div>
          <p className="text-slate-400 text-sm pl-10">
            Your complete, publication-ready book draft is presented!
          </p>
        </div>
      </div>

      <div className="mt-6 p-4 bg-sky-900/20 border border-sky-700/30 rounded-md">
        <p className="text-sm text-slate-300 text-center">
          <strong className="text-sky-400">⏱️ Time estimate:</strong> Generation can take several minutes, especially for more chapters. 
          Each chapter goes through multiple AI editing passes for professional quality. Please be patient.
        </p>
      </div>
    </div>
  );
};

export default HowItWorks;
