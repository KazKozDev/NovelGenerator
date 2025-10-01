/**
 * Final Editing Pass - Reviews all chapters together for consistency and polish
 * This runs after all chapters are generated and individually edited
 */

import { generateGeminiText } from '../services/geminiService';
import { ParsedChapterPlan, AgentLogEntry, ChapterData } from '../types';
import { agentEditChapter, EditingContext } from './editingAgent';

export interface FinalPassResult {
  editedChapters: ChapterData[];
  totalChanges: number;
  logs: AgentLogEntry[];
}

/**
 * Performs a final editing pass on all chapters
 * This is more aggressive than individual chapter editing because we have full context
 */
export async function performFinalEditingPass(
  chapters: ChapterData[],
  parsedChapterPlans: ParsedChapterPlan[],
  onProgress?: (current: number, total: number) => void,
  onLog?: (entry: AgentLogEntry) => void
): Promise<FinalPassResult> {
  
  const editedChapters: ChapterData[] = [];
  let totalChanges = 0;
  
  console.log('🔄 Starting final editing pass on all chapters...');
  
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const chapterNum = i + 1;
    const plan = parsedChapterPlans[i];
    
    if (onProgress) {
      onProgress(chapterNum, chapters.length);
    }
    
    console.log(`\n📝 Final pass: Chapter ${chapterNum}/${chapters.length}`);
    
    // Build context from surrounding chapters for better continuity
    const previousChapter = i > 0 ? chapters[i - 1] : null;
    const nextChapter = i < chapters.length - 1 ? chapters[i + 1] : null;
    
    // Generate comprehensive critique for final pass
    const finalCritique = await generateFinalCritique(
      chapter.content,
      plan,
      chapterNum,
      previousChapter?.content,
      nextChapter?.content
    );
    
    // Build chapter plan text
    const chapterPlanText = buildChapterPlanText(plan);
    
    // Run agent editing with final pass context
    const context: EditingContext = {
      chapterContent: chapter.content,
      chapterPlan: plan,
      chapterPlanText: chapterPlanText,
      critiqueNotes: finalCritique,
      chapterNumber: chapterNum,
      onLog: onLog
    };
    
    const result = await agentEditChapter(context, generateGeminiText);
    
    // Update chapter with edited content
    const editedChapter: ChapterData = {
      ...chapter,
      content: result.refinedContent
    };
    
    editedChapters.push(editedChapter);
    totalChanges += result.changesApplied.length;
    
    console.log(`✅ Chapter ${chapterNum} final pass complete (${result.changesApplied.length} changes)`);
  }
  
  console.log(`\n🎉 Final editing pass complete! Total changes: ${totalChanges}`);
  
  return {
    editedChapters,
    totalChanges,
    logs: [] // Logs are sent via callback
  };
}

/**
 * Generates a comprehensive critique for the final pass
 * This is more thorough than individual chapter critiques
 */
async function generateFinalCritique(
  chapterContent: string,
  plan: ParsedChapterPlan,
  chapterNumber: number,
  previousChapterContent?: string | null,
  nextChapterContent?: string | null
): Promise<string> {
  
  const previousContext = previousChapterContent 
    ? `\n**PREVIOUS CHAPTER (last 1000 chars):**\n${previousChapterContent.slice(-1000)}\n`
    : '';
  
  const nextContext = nextChapterContent
    ? `\n**NEXT CHAPTER (first 1000 chars):**\n${nextChapterContent.slice(0, 1000)}\n`
    : '';
  
  const critiquePrompt = `You are performing a FINAL EDITING PASS on this chapter. This is the last chance to fix issues before publication.

**CHAPTER ${chapterNumber}:**
${chapterContent.substring(0, 6000)}${chapterContent.length > 6000 ? '...(content continues)' : ''}

**CHAPTER PLAN:**
- Moral Dilemma: ${plan.moralDilemma || 'Not specified'}
- Character Complexity: ${plan.characterComplexity || 'Not specified'}
- Consequences: ${plan.consequencesOfChoices || 'Not specified'}
${previousContext}${nextContext}

**FINAL PASS CRITIQUE FOCUS:**

1. **CONTINUITY ISSUES (CRITICAL):**
   - Does this chapter flow naturally from the previous one?
   - Are there jarring transitions or unexplained jumps?
   - Do character states/locations make sense given previous chapter?

2. **OVERWRITING (CRITICAL):**
   - Stacked metaphors (more than one per paragraph)
   - Excessive adjectives (more than 2 per noun)
   - Purple prose or overly fancy language
   - Redundant descriptions

3. **SHOW VS TELL:**
   - Are emotions told instead of shown?
   - Too much "she felt", "he saw", "they heard"?

4. **PLAN ADHERENCE:**
   - Is the moral dilemma present and clear?
   - Does character complexity show through?
   - Are consequences of choices visible?

5. **PACING:**
   - Are there slow spots or info dumps?
   - Does the chapter maintain momentum?

6. **DIALOGUE:**
   - Does dialogue sound natural?
   - Are character voices distinct?
   - Too much exposition in dialogue?

7. **CHAPTER ENDING:**
   - Does it create forward momentum?
   - Is there a hook for the next chapter?

**RESPOND WITH:**
- If chapter is strong: "CHAPTER IS STRONG" + what works well
- If issues found: List 3-5 specific problems with examples
- Focus on issues that would be noticed by readers
- Be direct and actionable

Remember: This is the FINAL PASS. Only flag issues worth fixing.`;

  const systemPrompt = "You are a senior editor performing final quality control before publication.";
  
  try {
    const critique = await generateGeminiText(critiquePrompt, systemPrompt, undefined, 0.4, 0.7, 20);
    return critique;
  } catch (e) {
    console.warn(`Failed to generate final critique for chapter ${chapterNumber}:`, e);
    return "Perform standard quality check.";
  }
}

/**
 * Builds chapter plan text from parsed plan object
 */
function buildChapterPlanText(plan: ParsedChapterPlan): string {
  return `Title: ${plan.title || 'Untitled'}
Summary: ${plan.summary || 'No summary'}
Scene Breakdown: ${plan.sceneBreakdown || 'No breakdown'}
Character Development Focus: ${plan.characterDevelopmentFocus || 'Not specified'}
Plot Advancement: ${plan.plotAdvancement || 'Not specified'}
Timeline Indicators: ${plan.timelineIndicators || 'Not specified'}
Emotional Tone/Tension: ${plan.emotionalToneTension || 'Not specified'}
Connection to Next Chapter: ${plan.connectionToNextChapter || 'Not specified'}
Conflict Type: ${plan.conflictType || 'Not specified'}
Tension Level: ${plan.tensionLevel || 'Not specified'}/10
Rhythm/Pacing: ${plan.rhythmPacing || 'Not specified'}
Word Economy Focus: ${plan.wordEconomyFocus || 'Not specified'}

**MORAL & CHARACTER DEPTH:**
Moral Dilemma: ${plan.moralDilemma || 'Not specified'}
Character Complexity: ${plan.characterComplexity || 'Not specified'}
Consequences of Choices: ${plan.consequencesOfChoices || 'Not specified'}`.trim();
}

/**
 * Quick check if final pass is needed
 * Returns true if chapters likely need final polish
 */
export function shouldPerformFinalPass(chapters: ChapterData[]): boolean {
  // Always perform final pass for books with 3+ chapters
  if (chapters.length >= 3) {
    return true;
  }
  
  return false;
}
