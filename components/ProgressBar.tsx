import React from 'react';
import { GenerationStep } from '../types';

interface ProgressBarProps {
  currentStep: GenerationStep;
  currentChapterProcessing?: number;
  totalChaptersToProcess?: number;
}

/** The current step, on one line. What the pipeline is and how long it takes is not news every render. */
export default function ProgressBar({ currentStep, currentChapterProcessing, totalChaptersToProcess }: ProgressBarProps) {
  const label = currentStep === GenerationStep.GeneratingChapters && currentChapterProcessing
    ? `Writing and reviewing chapter ${currentChapterProcessing} of ${totalChaptersToProcess}` : currentStep;
  return (
    <p className="text-zinc-300 text-xs font-medium uppercase truncate" role="status" aria-live="polite">
      {label}
    </p>
  );
}
