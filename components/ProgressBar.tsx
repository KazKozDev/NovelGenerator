import React from 'react';
import { GenerationStep } from '../types';

interface ProgressBarProps {
  currentStep: GenerationStep;
  currentChapterProcessing?: number;
  totalChaptersToProcess?: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ 
  currentStep, 
  currentChapterProcessing, 
  totalChaptersToProcess 
}) => {
  let progressMessage: string = currentStep;
  let percentage = 0;

  const stepOrder = [
    GenerationStep.Idle,
    GenerationStep.UserInput,
    GenerationStep.GeneratingOutline,
    GenerationStep.WaitingForOutlineApproval,
    GenerationStep.ExtractingCharacters,
    GenerationStep.ExtractingWorldName,
    GenerationStep.ExtractingMotifs,
    GenerationStep.GeneratingChapterPlan,
    GenerationStep.GeneratingChapters,
    GenerationStep.FinalEditingPass,
    GenerationStep.ProfessionalPolish,
    GenerationStep.FinalizingTransitions,
    GenerationStep.CompilingBook,
    GenerationStep.Done,
    GenerationStep.Error,
  ];

  const currentStepIndex = stepOrder.indexOf(currentStep);
  const totalMeaningfulSteps = stepOrder.length - 4; // Exclude Idle, UserInput, Error, Waiting


  if (currentStep === GenerationStep.GeneratingChapters && currentChapterProcessing && totalChaptersToProcess) {
    const basePercentageForChapters = (stepOrder.indexOf(GenerationStep.GeneratingChapters) / totalMeaningfulSteps) * 100;
    const chapterPhasePercentageRange = (stepOrder.indexOf(GenerationStep.FinalEditingPass) / totalMeaningfulSteps) * 100 - basePercentageForChapters;
    const chapterProgress = (currentChapterProcessing / totalChaptersToProcess) * chapterPhasePercentageRange;
    percentage = basePercentageForChapters + chapterProgress;
    progressMessage = `Generating Chapters: Chapter ${currentChapterProcessing} of ${totalChaptersToProcess}`;
  } else if (currentStep === GenerationStep.FinalEditingPass && currentChapterProcessing && totalChaptersToProcess) {
    const basePercentage = (stepOrder.indexOf(GenerationStep.FinalEditingPass) / totalMeaningfulSteps) * 100;
    const phaseRange = (stepOrder.indexOf(GenerationStep.ProfessionalPolish) / totalMeaningfulSteps) * 100 - basePercentage;
    const progress = (currentChapterProcessing / totalChaptersToProcess) * phaseRange;
    percentage = basePercentage + progress;
    progressMessage = `Final Editing Pass: Polishing Chapter ${currentChapterProcessing} of ${totalChaptersToProcess}`;
  } else if (currentStep === GenerationStep.ProfessionalPolish && currentChapterProcessing && totalChaptersToProcess) {
    const basePercentage = (stepOrder.indexOf(GenerationStep.ProfessionalPolish) / totalMeaningfulSteps) * 100;
    const phaseRange = (stepOrder.indexOf(GenerationStep.FinalizingTransitions) / totalMeaningfulSteps) * 100 - basePercentage;
    const progress = (currentChapterProcessing / totalChaptersToProcess) * phaseRange;
    percentage = basePercentage + progress;
    progressMessage = `Professional Polish: Refining Chapter ${currentChapterProcessing} of ${totalChaptersToProcess}`;
  } else if (currentStep === GenerationStep.FinalizingTransitions && currentChapterProcessing && totalChaptersToProcess && totalChaptersToProcess > 1) {
    const basePercentage = (stepOrder.indexOf(GenerationStep.FinalizingTransitions) / totalMeaningfulSteps) * 100;
    const phaseRange = (stepOrder.indexOf(GenerationStep.CompilingBook) / totalMeaningfulSteps) * 100 - basePercentage;
    const progress = (currentChapterProcessing / (totalChaptersToProcess - 1)) * phaseRange; // -1 because there are N-1 transitions
    percentage = basePercentage + progress;
    progressMessage = `Finalizing Transitions: Connecting chapter ${currentChapterProcessing} to ${currentChapterProcessing + 1}`;
  } else if (currentStepIndex > 0 && currentStep !== GenerationStep.Error && currentStep !== GenerationStep.Done) {
     percentage = (currentStepIndex / totalMeaningfulSteps) * 100;
  } else if (currentStep === GenerationStep.Done) {
    percentage = 100;
  }


  percentage = Math.min(Math.max(percentage, 0), 100);

  // Estimate remaining time (rough approximation)
  const estimateRemainingTime = (): string => {
    if (percentage >= 100) return '';
    
    // Rough estimates per chapter: ~2-3 minutes
    const avgMinutesPerChapter = 2.5;
    const totalEstimatedMinutes = (totalChaptersToProcess || 3) * avgMinutesPerChapter;
    const elapsedPercentage = percentage / 100;
    const remainingMinutes = Math.ceil(totalEstimatedMinutes * (1 - elapsedPercentage));
    
    if (remainingMinutes < 1) return 'Almost done...';
    if (remainingMinutes === 1) return '~1 minute remaining';
    return `~${remainingMinutes} minutes remaining`;
  };

  return (
    <div className="my-6 w-full">
      <div className="flex justify-between items-center mb-2">
        <p className="text-sky-300 text-lg animate-pulse">{progressMessage}</p>
        {percentage > 0 && percentage < 100 && (
          <p className="text-slate-400 text-sm">{estimateRemainingTime()}</p>
        )}
      </div>
      {currentStep !== GenerationStep.Idle && currentStep !== GenerationStep.UserInput && currentStep !== GenerationStep.Error && (
        <div className="w-full bg-slate-700 rounded-full h-4 overflow-hidden shadow-inner">
          <div
            className="bg-gradient-to-r from-sky-500 to-teal-400 h-4 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
      )}
       {currentStep === GenerationStep.Error && (
         <p className="text-red-400 text-center mt-2">An error occurred. Please check the message above.</p>
       )}
    </div>
  );
};

export default ProgressBar;