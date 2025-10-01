/**
 * Specialized editing passes for different aspects of prose
 */

export interface EditingPass {
  name: string;
  systemPrompt: string;
  userPromptTemplate: (content: string, context?: any) => string;
}

/**
 * Dialogue Polish Pass - focuses on making dialogue natural and purposeful
 */
export const DIALOGUE_POLISH_PASS: EditingPass = {
  name: "Dialogue Polish",
  systemPrompt: "You are a dialogue specialist. Your expertise is making conversations sound natural, revealing character, and advancing plot through speech.",
  userPromptTemplate: (content: string) => `Review the dialogue in this chapter. For each conversation:

**DIALOGUE PRINCIPLES:**
1. **Subtext over exposition** - People rarely say exactly what they mean
2. **Distinct voices** - Each character should sound different
3. **Purpose** - Every line should reveal character, advance plot, or increase tension
4. **Natural rhythm** - People interrupt, trail off, use contractions
5. **Cut filler** - Remove "um", "well", "you know" unless characterizing

**WHAT TO FIX:**
- Exposition dumps ("As you know, Bob...")
- On-the-nose dialogue (saying exactly what they feel)
- Generic voices (everyone sounds the same)
- Unnecessary pleasantries that don't serve the story

Return the chapter with improved dialogue. Keep all non-dialogue text exactly as is.

CHAPTER:
${content}`
};

/**
 * Action Sequence Tightening - makes action clear, fast, impactful
 */
export const ACTION_TIGHTENING_PASS: EditingPass = {
  name: "Action Tightening",
  systemPrompt: "You are an action sequence specialist. You make fight scenes, chases, and physical confrontations visceral and clear.",
  userPromptTemplate: (content: string) => `Tighten the action sequences in this chapter.

**ACTION PRINCIPLES:**
1. **Short sentences** - Create urgency and speed
2. **Strong verbs** - "lunged" not "moved quickly"
3. **Sensory details** - What does it feel/sound/smell like?
4. **Clear choreography** - Reader should visualize the action
5. **Cut unnecessary movements** - Skip "he stood up and walked to the door"

**WHAT TO FIX:**
- Verbose action descriptions
- Weak verb + adverb combinations
- Unclear spatial relationships
- Over-explanation of obvious movements

Return the chapter with tightened action. Keep all non-action text exactly as is.

CHAPTER:
${content}`
};

/**
 * Description Refinement - balances atmosphere with economy
 */
export const DESCRIPTION_REFINEMENT_PASS: EditingPass = {
  name: "Description Refinement",
  systemPrompt: "You are a description specialist. You create vivid imagery with minimal words, balancing atmosphere with narrative momentum.",
  userPromptTemplate: (content: string, context?: { focus: string }) => `Refine the descriptive passages in this chapter.

**DESCRIPTION PRINCIPLES:**
1. **Specific over generic** - "oak table" beats "table"
2. **Sensory variety** - Not just visual, include sound, smell, touch
3. **Economy** - One perfect detail beats three mediocre ones
4. **Mood-appropriate** - Description should match the scene's emotional tone
5. **Avoid purple prose** - No "magnificently resplendent" anything

**FOCUS:** ${context?.focus || 'balanced - maintain atmosphere without slowing pace'}

**WHAT TO FIX:**
- Generic descriptions ("beautiful", "nice", "good")
- Purple prose (overly flowery language)
- Info-dumps (paragraphs of setting description)
- Filtering ("she saw", "he noticed")

Return the chapter with refined descriptions. Keep dialogue and action exactly as is.

CHAPTER:
${content}`
};

/**
 * Pacing Adjustment - speeds up or slows down as needed
 */
export const PACING_ADJUSTMENT_PASS: EditingPass = {
  name: "Pacing Adjustment",
  systemPrompt: "You are a pacing specialist. You control narrative rhythm through sentence structure, paragraph length, and scene transitions.",
  userPromptTemplate: (content: string, context?: { targetPacing: string }) => `Adjust the pacing of this chapter.

**TARGET PACING:** ${context?.targetPacing || 'medium'}

**PACING TECHNIQUES:**
- **Fast pacing:** Short sentences. Brief paragraphs. Cut description. Focus on action and dialogue.
- **Medium pacing:** Varied sentence length. Balance action, dialogue, and description.
- **Slow pacing:** Longer sentences. More introspection. Atmospheric details. Character reflection.

**WHAT TO ADJUST:**
- Sentence length variation
- Paragraph breaks
- Balance of action vs. reflection
- Transition speed between scenes

Return the chapter with adjusted pacing. Maintain all plot points and character moments.

CHAPTER:
${content}`
};

/**
 * Apply a specialized editing pass to content
 */
export async function applyEditingPass(
  content: string,
  pass: EditingPass,
  context: any,
  llmFunction: (prompt: string, system: string, schema?: object, temp?: number, topP?: number, topK?: number) => Promise<string>
): Promise<string> {
  try {
    const userPrompt = pass.userPromptTemplate(content, context);
    const edited = await llmFunction(userPrompt, pass.systemPrompt, undefined, 0.6, 0.85, 30);
    
    // Basic validation - edited content should be similar length (within 30%)
    const lengthRatio = edited.length / content.length;
    if (lengthRatio < 0.5 || lengthRatio > 1.5) {
      console.warn(`${pass.name} changed content length significantly (${lengthRatio.toFixed(2)}x). Using original.`);
      return content;
    }
    
    return edited;
  } catch (error) {
    console.warn(`${pass.name} failed:`, error);
    return content;
  }
}

/**
 * Apply multiple editing passes in sequence
 */
export async function applyMultipleEditingPasses(
  content: string,
  passes: { pass: EditingPass; context?: any }[],
  llmFunction: (prompt: string, system: string, schema?: object, temp?: number, topP?: number, topK?: number) => Promise<string>
): Promise<string> {
  let editedContent = content;
  
  for (const { pass, context } of passes) {
    console.log(`Applying ${pass.name}...`);
    editedContent = await applyEditingPass(editedContent, pass, context, llmFunction);
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return editedContent;
}
