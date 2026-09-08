import React from 'react';
import { GenerationStep } from '../types';

interface ProgressBarProps {
  currentStep: GenerationStep;
  currentChapterProcessing?: number;
  totalChaptersToProcess?: number;
}

export default function ProgressBar({ currentStep, currentChapterProcessing, totalChaptersToProcess }: ProgressBarProps) {
  const label = currentStep === GenerationStep.GeneratingChapters && currentChapterProcessing
    ? `Writing and reviewing chapter ${currentChapterProcessing} of ${totalChaptersToProcess}` : currentStep;
  return <div className="my-4 w-full" role="status" aria-live="polite">
    <p className="text-zinc-200 text-xs font-medium tracking-wide uppercase">{label}</p>
    <p className="text-zinc-500 text-[11px] mt-1">Progress follows accepted checkpoints. Duration depends on the model and necessary revisions.</p>
  </div>;
}
