import React from 'react';
import { GenerationStep } from '../types';

interface ProgressBarProps {
  developmentLabel?: string;
  currentStep: GenerationStep;
  currentChapterProcessing?: number;
  totalChaptersToProcess?: number;
}

/** The current step, on one line. What the pipeline is and how long it takes is not news every render. */
export default function ProgressBar({ developmentLabel, currentStep, currentChapterProcessing, totalChaptersToProcess }: ProgressBarProps) {
  const label = developmentLabel || (currentStep === GenerationStep.GeneratingChapters && currentChapterProcessing
    ? `Writing and reviewing chapter ${currentChapterProcessing} of ${totalChaptersToProcess}` : currentStep);
  return (
    <p className="text-zinc-300 text-xs font-medium uppercase truncate" role="status" aria-live="polite">
      {label}
    </p>
  );
}
