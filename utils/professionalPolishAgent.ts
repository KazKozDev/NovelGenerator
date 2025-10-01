/**
 * Professional Polish Agent - Final pass focused on making text read like a professional novel
 * This is the last editing step before compilation
 */

import { generateGeminiText } from '../services/geminiService';
import { ChapterData, AgentLogEntry } from '../types';

export interface ProfessionalPolishResult {
  polishedChapters: ChapterData[];
  totalChanges: number;
}

/**
 * Applies professional polish to all chapters
 * Focuses on rhythm, subtext, motivation, variety, emotional anchors, and perception layers
 */
export async function applyProfessionalPolish(
  chapters: ChapterData[],
  onProgress?: (current: number, total: number) => void,
  onLog?: (entry: AgentLogEntry) => void
): Promise<ProfessionalPolishResult> {
  
  const polishedChapters: ChapterData[] = [];
  let totalChanges = 0;
  
  console.log('✨ Starting professional polish pass...');
  
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const chapterNum = i + 1;
    
    if (onProgress) {
      onProgress(chapterNum, chapters.length);
    }
    
    console.log(`\n✨ Professional polish: Chapter ${chapterNum}/${chapters.length}`);
    
    // Log start
    if (onLog) {
      onLog({
        timestamp: Date.now(),
        chapterNumber: chapterNum,
        type: 'execution',
        message: `Applying professional polish to Chapter ${chapterNum}`,
        details: { phase: 'professional-polish' }
      });
    }
    
    const originalContent = chapter.content;
    
    // Apply professional polish
    const polishedContent = await polishChapterProfessionally(
      originalContent,
      chapterNum,
      chapters.length
    );
    
    // Check if changes were made
    const hasChanges = polishedContent !== originalContent;
    
    if (hasChanges) {
      totalChanges++;
      
      // Log diff
      if (onLog) {
        onLog({
          timestamp: Date.now(),
          chapterNumber: chapterNum,
          type: 'diff',
          message: `Professional polish applied to Chapter ${chapterNum}`,
          beforeText: originalContent,
          afterText: polishedContent,
          strategy: 'professional-polish'
        });
      }
    }
    
    const polishedChapter: ChapterData = {
      ...chapter,
      content: polishedContent
    };
    
    polishedChapters.push(polishedChapter);
    
    console.log(`✅ Chapter ${chapterNum} professionally polished ${hasChanges ? '(changes applied)' : '(no changes needed)'}`);
  }
  
  console.log(`\n🎉 Professional polish complete! ${totalChanges} chapters modified.`);
  
  return {
    polishedChapters,
    totalChanges
  };
}

/**
 * Applies professional-level polish to a single chapter
 */
async function polishChapterProfessionally(
  content: string,
  chapterNumber: number,
  totalChapters: number
): Promise<string> {
  
  const polishPrompt = `You are a professional editor and stylist. Your task is to take a finished chapter and polish it so it reads like a professional novel.

**CHAPTER ${chapterNumber} of ${totalChapters}:**

${content}

---

**YOUR POLISHING INSTRUCTIONS:**

**1. PACE AND RHYTHM**
- Break up long paragraphs (more than 5-6 sentences)
- Alternate descriptions with short emotional beats (1-2 sentences)
- Vary sentence length to create rhythm
- Use short paragraphs for tense moments

**2. DIALOGUE WITH SUBTEXT**
- Eliminate direct explanations in dialogue
- Add pauses, gestures, things left unsaid
- Characters should rarely say everything directly
- Show non-verbal cues: glances, silence, tone
- Remove exposition from dialogue ("As you know, Bob...")

**3. MOTIVATION AND DOUBT**
- Insert internal struggle in key decisions
- Show doubts, memories, fear before choices
- Don't jump instantly to action — let character think
- Show the cost of decision BEFORE it's made

**4. ANTI-REPETITION**
- Remove identical words in adjacent paragraphs
- For recurring concepts (darkness, fire, fear) use varied metaphors
- Vary synonyms
- Don't repeat the same sentence structure consecutively

**5. EMOTIONAL ANCHORS**
- In each important scene, leave a small "human moment"
- A memory, smell, gesture, detail that connects reader to character
- Sensory details: not just sight, but sound, smell, touch
- One concrete image is better than three abstract ones

**6. LAYERS OF PERCEPTION**
- Show difference between what character sees and how they interpret it
- Light shade of self-deception or bias
- Subjectivity of perception: one sees threat, another sees opportunity
- Internal monologue can contradict actions

**7. FINAL POLISH**
- Choose richer and more varied vocabulary
- Avoid clichés and overused phrases
- Maintain consistent style throughout chapter
- Make text flow smoothly, without jarring transitions between scenes
- Check that transitions between paragraphs are logical

**CRITICAL WORD BANS:**
- NEVER use the word "obsidian" or any derivatives (obsidian-like, obsidian's, etc.)
- Replace with: "black stone", "dark walls", "stone", "dark rock"
- This is ABSOLUTE - scan entire text and remove ALL mentions

**IMPORTANT:**
- Preserve all plot events and dialogue
- Don't change the meaning of scenes
- Don't add new scenes or characters
- Focus on QUALITY OF DELIVERY, not content
- This is final polish, not rewriting

**RETURN:**
Polished version of the chapter. Only chapter text, no comments.`;

  const systemPrompt = `You are a master editor specializing in final polish of fiction. Your task is to transform good text into professional novel through work with rhythm, subtext, emotional anchors, and layers of perception.`;

  try {
    const polished = await generateGeminiText(
      polishPrompt,
      systemPrompt,
      undefined,
      0.7, // Higher temperature for creative polish
      0.9,
      40
    );
    
    // Validation: polished text should be similar length (within 40%)
    const lengthRatio = polished.length / content.length;
    if (lengthRatio < 0.6 || lengthRatio > 1.4) {
      console.warn(`Professional polish changed length significantly (${lengthRatio.toFixed(2)}x) for chapter ${chapterNumber}. Using original.`);
      return content;
    }
    
    return polished;
  } catch (e) {
    console.warn(`Professional polish failed for chapter ${chapterNumber}:`, e);
    return content;
  }
}
