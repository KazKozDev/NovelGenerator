import { literaryCurrent } from './literaryState';
import { ChapterGenerationStage, GenerationStep, type ChapterData } from '../../types';
import type { NovelRun } from './contracts';
import { acceptedVersion } from './storyState';

export function generationStep(run: NovelRun | undefined, busy: boolean): GenerationStep {
  if (!run) return GenerationStep.Idle;
  switch (run.stage) {
    case 'outline': return busy ? GenerationStep.GeneratingOutline : GenerationStep.WaitingForOutlineApproval;
    case 'planning': return GenerationStep.GeneratingChapterPlan;
    case 'writing': return GenerationStep.GeneratingChapters;
    case 'structural_review': return GenerationStep.FinalEditingPass;
    case 'line_editing': return GenerationStep.ProfessionalPolish;
    case 'final_review': return GenerationStep.FinalizingTransitions;
    case 'complete': return GenerationStep.Done;
    case 'needs_revision': return busy ? GenerationStep.GeneratingChapters : GenerationStep.Error;
  }
}

export function displayChapters(run?: NovelRun): ChapterData[] {
  return (run?.chapters || []).map(chapter => {
    const version = chapter.versions.find(item => item.revision === chapter.candidateRevision) || acceptedVersion(chapter) || chapter.versions.at(-1);
    const content = version?.content || chapter.sceneDrafts?.join('\n\n***\n\n') || '';
    return {
      title: chapter.plan.title, content, plan: JSON.stringify(chapter.plan, null, 2),
      summary: acceptedVersion(chapter)?.analysis?.summary,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      generationStage: chapter.status === 'accepted' && chapter.candidateRevision === undefined ? ChapterGenerationStage.Complete : ChapterGenerationStage.FirstDraft,
      draftVersions: chapter.versions.map(item => ({ stage: item.revision === chapter.acceptedRevision ? ChapterGenerationStage.Complete : ChapterGenerationStage.FirstDraft, content: item.content, timestamp: item.createdAt })),
      texture: version?.prosody && {
        dialogueShare: version.prosody.metrics.dialogueShare,
        medianParagraphWords: version.prosody.metrics.medianParagraphWords,
        similesPer1000: version.prosody.metrics.similesPer1000,
        taggedSpeechShare: version.prosody.metrics.taggedSpeechShare,
        findings: version.prosody.findings.map(issue => ({ id: issue.id, description: issue.description })),
      },
      lastSavedAt: run.updatedAt,
    };
  });
}

export function compileBook(run: NovelRun): string {
  if (run.literaryValidationVersion !== 1 || run.stage !== 'complete' || run.finalReview?.status !== 'passed' || run.chapters.length !== run.spec.chapterCount || run.chapters.some(chapter => chapter.candidateRevision !== undefined || !acceptedVersion(chapter) || (run.literaryValidationVersion === 1 && (!literaryCurrent(run, chapter.number, acceptedVersion(chapter)) || acceptedVersion(chapter).literary?.status !== 'passed')))) {
    throw new Error('Only a complete, reviewed manuscript can be exported as final.');
  }
  return `# ${run.title}\n\n` + run.chapters.map(chapter => `## Chapter ${chapter.number}: ${chapter.plan.title}\n\n${acceptedVersion(chapter).content}`).join('\n\n');
}

export function metadata(run: NovelRun): string {
  return JSON.stringify({
    title: run.title, story_premise: run.spec.premise, spec: run.spec, provider: run.provider, validationProvider: run.validationProvider,
    runId: run.id, characters: run.blueprint?.characters, chapter_summaries: run.canon.summaries,
    literaryState: run.chapters.map(chapter => ({ number: chapter.number, plan: chapter.literaryPlan, assessment: acceptedVersion(chapter)?.literary })),
    prosody: run.chapters.map(chapter => ({ number: chapter.number, report: acceptedVersion(chapter)?.prosody })),
    canon: run.canon, promises: run.blueprint?.promises, finalReview: run.finalReview,
    chapterVersions: run.chapters.map(chapter => ({ number: chapter.number, revision: chapter.acceptedRevision })),
    measurement: { calls: run.calls || [], note: 'Provider calls and duration are operational measurements, not literary quality scores.' },
  }, null, 2);
}
