/**
 * Specialist Agents System
 * Specialized agents for different aspects of chapter generation
 */

import { generateGeminiText } from '../services/geminiService';
import { ParsedChapterPlan } from '../types';
import { StructureContext, CharacterContext, SceneContext, CoherenceConstraints } from './coherenceManager';
import { getFormattedPrompt, PromptNames, formatPrompt } from './promptLoader';

// =================== SHARED INTERFACES ===================

export interface AgentOutput {
  content: Record<string, string>;
  metadata: {
    agentType: string;
    processingTime: number;
    confidence: number;
    notes: string[];
  };
}

export interface SlotContent {
  slotId: string;
  content: string;
  type: 'dialogue' | 'action' | 'internal' | 'description' | 'transition';
  priority: number;
}

// =================== STRUCTURE AGENT ===================

export interface StructureAgentInput {
  chapterPlan: ParsedChapterPlan;
  chapterNumber: number;
  context: StructureContext;
  constraints: CoherenceConstraints;
  previousChapterEnd?: string;
  targetLength: number;
  storyOutline: string;
}

export interface StructureAgentOutput extends AgentOutput {
  chapterStructure: string; // Template with [SLOT] markers
  plotAdvancement: string[];
  pacingNotes: string[];
  transitionPoints: string[];
  slots: {
    dialogueSlots: string[];
    actionSlots: string[];
    internalSlots: string[];
    descriptionSlots: string[];
  };
}

export class StructureAgent {
  async generate(input: StructureAgentInput): Promise<StructureAgentOutput> {
    const startTime = Date.now();

    console.log(`🏗️ Structure Agent generating framework for Chapter ${input.chapterNumber}`);

    const prompt = this.buildStructurePrompt(input);
    const structureContent = await generateGeminiText(
      prompt.userPrompt,
      prompt.systemPrompt,
      undefined, // No JSON schema needed for structure
      0.7, // Higher creativity for structure
      0.9,
      40
    );

    const output = this.parseStructureOutput(structureContent, input);
    output.metadata = {
      agentType: 'Structure',
      processingTime: Date.now() - startTime,
      confidence: 85, // Structure is fairly predictable
      notes: [`Generated framework with ${Object.keys(output.content).length} slots`]
    };

    return output;
  }

  private buildStructurePrompt(input: StructureAgentInput): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are a master story architect specializing in chapter structure and narrative flow. Your job is to create a PROSE NARRATIVE SKELETON - flowing chapter text with [SLOT] markers for other specialists to fill.

CRITICAL OUTPUT REQUIREMENTS:
1. Write ACTUAL PROSE TEXT - flowing narrative that reads like a chapter draft
2. Embed [SLOT] markers seamlessly within the prose flow
3. DO NOT write outlines, frameworks, or meta-descriptions
4. DO NOT use intensity markings like "*Intensity: 5/10*"
5. DO NOT write "Here is the framework" or similar introductions
6. START IMMEDIATELY with narrative prose

MANDATORY EXAMPLES OF CORRECT OUTPUT:
✅ CORRECT: "Delilah stepped into the hotel lobby. [DESCRIPTION_LOBBY_ATMOSPHERE] The receptionist's smile was too wide. [DIALOGUE_RECEPTIONIST_GREETING] Something cold settled in her stomach. [INTERNAL_DELILAH_UNEASE] Before she could turn to leave, footsteps echoed behind her. [ACTION_APPROACH]"

❌ ABSOLUTELY WRONG: "*Opening scene - Intensity: 5/10* Character enters hotel. [DESCRIPTION_LOBBY_ATMOSPHERE]"
❌ ABSOLUTELY WRONG: "Here is the structural framework for Chapter 2..."
❌ ABSOLUTELY WRONG: "**Chapter Title** *Intensity markers* Structural elements"

SLOT TYPES TO EMBED NATURALLY:
- [DIALOGUE_X] for conversation scenes
- [ACTION_X] for physical action and movement
- [INTERNAL_X] for character thoughts and emotions
- [DESCRIPTION_X] for environmental and atmospheric details
- [TRANSITION_X] for connecting different scenes

YOUR OUTPUT MUST BE FLOWING PROSE WITH EMBEDDED SLOTS - nothing else!`;

    const userPrompt = `Write the prose skeleton for Chapter ${input.chapterNumber}: "${input.chapterPlan.title}"

**STORY OUTLINE - CRITICAL CONTEXT:**
${input.storyOutline}

**CHAPTER PLAN TO IMPLEMENT:**
${this.formatChapterPlan(input.chapterPlan)}

**DETAILED SCENE STRUCTURE:**
${this.formatDetailedScenes(input.chapterPlan)}

**PLANNED EVENTS:**
${this.formatChapterEvents(input.chapterPlan)}

**DIALOGUE BEATS:**
${this.formatDialogueBeats(input.chapterPlan)}

**CHARACTER ARCS:**
${this.formatCharacterArcs(input.chapterPlan)}

**STRUCTURAL REQUIREMENTS:**
- Role in story: ${input.context.chapterRole}
- Pacing: ${input.context.pacingRequirements.tempo} tempo
- Tension level: ${input.context.pacingRequirements.tensionLevel}/10
- Plot threads to advance: ${input.context.plotThreadsToAdvance.map(t => t.title).join(', ')}

**PREVIOUS CHAPTER CONNECTION:**
${input.previousChapterEnd ? `Previous chapter ended with: "${input.previousChapterEnd.slice(-200)}"` : 'This is the first chapter'}

**CRITICAL:** Structure must serve the OVERALL STORY ARC described in the outline above. Ensure this chapter advances the narrative toward the story's ultimate destination and maintains consistency with established themes, character arcs, and world-building.

**EMOTIONAL CURVE REQUIREMENTS:**
MANDATORY: Plan emotional intensity progression that avoids monotone levels
- Opening (0-20%): MEDIUM intensity (4-6/10) - establish baseline
- Rising (20-60%): Gradual increase with peaks and valleys
- Climax (70-80%): PEAK intensity (8-10/10) - main emotional moment
- Resolution (80-100%): Controlled decrease with potential hook spike

**STRUCTURE GUIDELINES:**

1. **OPENING HOOK (0-20% - Medium Intensity):** Start engaging but not overwhelming
   - Connect to previous chapter if not first
   - Establish current situation quickly
   - Use [DESCRIPTION_OPENING] for setting, [INTERNAL_OPENING] for character state
   - INTENSITY TARGET: 4-6/10

2. **RISING ACTION (20-60% - Variable Intensity):** Build tension with breathing moments
   - Use [DIALOGUE_X] slots for character interactions
   - Use [ACTION_X] slots for physical events
   - Use [INTERNAL_X] slots for character reactions
   - Include one calm beat every 2-3 high-tension slots
   - INTENSITY TARGET: 3-7/10 (varied)

3. **CLIMAX (70-80% - Peak Intensity):** Introduce the chapter's main challenge
   - Mark the key turning point clearly
   - Use [DIALOGUE_CONFLICT] for confrontational scenes
   - Use [ACTION_CLIMAX] for peak action
   - INTENSITY TARGET: 8-10/10

4. **RESOLUTION/HOOK (80-100% - Controlled Decrease):** End with forward momentum
   - Resolve immediate chapter conflict
   - Create hook for next chapter
   - Use [TRANSITION_END] for chapter closing
   - INTENSITY TARGET: 5-7/10

**SLOT DISTRIBUTION TARGETS:**
Target chapter length: ${input.targetLength} words

For this length, aim for:
- Dialogue slots: ${Math.ceil(input.targetLength / 500)}-${Math.ceil(input.targetLength / 400)} (conversations and character interactions)
- Action slots: ${Math.ceil(input.targetLength / 1000)}-${Math.ceil(input.targetLength / 600)} (physical events and movement)
- Internal slots: ${Math.ceil(input.targetLength / 1000)}-${Math.ceil(input.targetLength / 800)} (character thoughts and emotional reactions)
- Description slots: ${Math.ceil(input.targetLength / 800)}-${Math.ceil(input.targetLength / 600)} (atmosphere, environment, sensory details)
- Transition slots: ${Math.ceil(input.targetLength / 1200)}-${Math.ceil(input.targetLength / 1000)} (scene changes and flow connections)

NOTE: These are MINIMUM targets. Create MORE slots if needed to reach target length naturally.

**OUTPUT FORMAT:**
Create a flowing narrative framework that reads naturally while clearly marking where specialist content should be inserted. Each slot should have a brief indication of what type of content is needed.

**EXAMPLE STRUCTURE:**
"Hero entered the tavern. [DESCRIPTION_TAVERN_ATMOSPHERE] The barkeep's reaction was immediate. [DIALOGUE_BARKEEP_GREETING] Something about his manner set off alarm bells. [INTERNAL_HERO_SUSPICION]

The conversation took an unexpected turn. [DIALOGUE_REVELATION] [INTERNAL_HERO_REACTION] Without warning, the situation escalated. [ACTION_CONFRONTATION]

[TRANSITION_ESCAPE] The chapter ends with [DESCRIPTION_CONSEQUENCES] and [INTERNAL_RESOLVE]."

WRITE THE COMPLETE PROSE CHAPTER SKELETON NOW - start immediately with narrative text containing [SLOT] markers:`;

    return { systemPrompt, userPrompt };
  }

  private formatChapterPlan(plan: ParsedChapterPlan): string {
    return `Title: ${plan.title}
Summary: ${plan.summary}
Scene Breakdown: ${plan.sceneBreakdown}
Conflict Type: ${plan.conflictType}
Tension Level: ${plan.tensionLevel}/10
Moral Dilemma: ${plan.moralDilemma}
Character Complexity: ${plan.characterComplexity}
Consequences: ${plan.consequencesOfChoices}
Target Word Count: ${plan.targetWordCount || 'Not specified'}
Opening Hook: ${plan.openingHook || 'Not specified'}
Climax Moment: ${plan.climaxMoment || 'Not specified'}
Chapter Ending: ${plan.chapterEnding || 'Not specified'}`;
  }

  private formatDetailedScenes(plan: ParsedChapterPlan): string {
    if (!plan.detailedScenes || plan.detailedScenes.length === 0) {
      return 'No detailed scenes specified';
    }

    return plan.detailedScenes.map((scene, index) =>
      `Scene ${index + 1} (${scene.sceneId}):
  Location: ${scene.location}
  Participants: ${scene.participants.join(', ')}
  Objective: ${scene.objective}
  Conflict: ${scene.conflict}
  Outcome: ${scene.outcome}
  Duration: ${scene.duration}
  Mood: ${scene.mood}
  Key Moments: ${scene.keyMoments.join('; ')}`
    ).join('\n\n');
  }

  private formatChapterEvents(plan: ParsedChapterPlan): string {
    if (!plan.chapterEvents || plan.chapterEvents.length === 0) {
      return 'No specific events planned';
    }

    return plan.chapterEvents.map((event, index) =>
      `Event ${index + 1} (${event.eventType.toUpperCase()}):
  ${event.description}
  Participants: ${event.participants.join(', ')}
  Emotional Impact: ${event.emotionalImpact}/10
  Plot Significance: ${event.plotSignificance}
  Consequences: ${event.consequences.join('; ')}`
    ).join('\n\n');
  }

  private formatDialogueBeats(plan: ParsedChapterPlan): string {
    if (!plan.dialogueBeats || plan.dialogueBeats.length === 0) {
      return 'No specific dialogue beats planned';
    }

    return plan.dialogueBeats.map((beat, index) =>
      `Dialogue Beat ${index + 1}:
  Purpose: ${beat.purpose}
  Participants: ${beat.participants.join(', ')}
  Subtext: ${beat.subtext}
  Revelations: ${beat.revelations.join('; ')}
  Tensions: ${beat.tensions.join('; ')}
  Emotional Shifts: ${beat.emotionalShifts.join('; ')}`
    ).join('\n\n');
  }

  private formatCharacterArcs(plan: ParsedChapterPlan): string {
    if (!plan.characterArcs || plan.characterArcs.length === 0) {
      return 'No specific character arcs planned';
    }

    return plan.characterArcs.map((arc, index) =>
      `${arc.character}'s Arc:
  Start State: ${arc.startState}
  End State: ${arc.endState}
  Growth: ${arc.growth}
  Key Moments: ${arc.keyMoments.join('; ')}
  Internal Conflicts: ${arc.internalConflicts.join('; ')}
  Relationships: ${arc.relationships}`
    ).join('\n\n');
  }

  private parseStructureOutput(content: string, input: StructureAgentInput): StructureAgentOutput {
    // Extract slot information from the generated structure
    const slots = this.extractSlots(content);

    return {
      content: { structure: content },
      chapterStructure: content,
      plotAdvancement: this.extractPlotPoints(content),
      pacingNotes: this.extractPacingNotes(content, input),
      transitionPoints: this.extractTransitions(content),
      slots,
      metadata: {
        agentType: 'Structure',
        processingTime: 0,
        confidence: 0,
        notes: []
      }
    };
  }

  private extractSlots(content: string): StructureAgentOutput['slots'] {
    const dialogueSlots = (content.match(/\[DIALOGUE_[^\]]+\]/g) || []).map(s => s.slice(1, -1));
    const actionSlots = (content.match(/\[ACTION_[^\]]+\]/g) || []).map(s => s.slice(1, -1));
    const internalSlots = (content.match(/\[INTERNAL_[^\]]+\]/g) || []).map(s => s.slice(1, -1));
    const descriptionSlots = (content.match(/\[DESCRIPTION_[^\]]+\]/g) || []).map(s => s.slice(1, -1));

    return {
      dialogueSlots,
      actionSlots,
      internalSlots,
      descriptionSlots
    };
  }

  private extractPlotPoints(content: string): string[] {
    // Extract major plot advancement from structure
    // This is a simplified version - could be enhanced
    return ['Chapter structure created with plot progression'];
  }

  private extractPacingNotes(content: string, input: StructureAgentInput): string[] {
    return [`${input.context.pacingRequirements.tempo} pacing implemented`];
  }

  private extractTransitions(content: string): string[] {
    const transitions = content.match(/\[TRANSITION_[^\]]+\]/g) || [];
    return transitions.map(t => t.slice(1, -1));
  }
}

// =================== CHARACTER AGENT ===================

export interface CharacterAgentInput {
  chapterPlan: ParsedChapterPlan;
  chapterNumber: number;
  context: CharacterContext;
  constraints: CoherenceConstraints;
  structureSlots: StructureAgentOutput['slots'];
  dialogueRequirements: DialogueRequirement[];
  storyOutline: string;
}

export interface DialogueRequirement {
  slotId: string;
  characters: string[];
  purpose: string;
  emotionalTone: string;
  subtext?: string;
}

export interface CharacterAgentOutput extends AgentOutput {
  dialogueContent: Record<string, string>;
  internalThoughts: Record<string, string>;
  characterMoments: string[];
  emotionalProgression: string[];
}

export class CharacterAgent {
  async generate(input: CharacterAgentInput): Promise<CharacterAgentOutput> {
    const startTime = Date.now();

    console.log(`👥 Character Agent generating dialogue and development for Chapter ${input.chapterNumber}`);

    const prompt = this.buildCharacterPrompt(input);
    const characterContent = await generateGeminiText(
      prompt.userPrompt,
      prompt.systemPrompt,
      undefined,
      0.8, // High creativity for character content
      0.9,
      40
    );

    const output = this.parseCharacterOutput(characterContent, input);
    output.metadata = {
      agentType: 'Character',
      processingTime: Date.now() - startTime,
      confidence: 80, // Character content can be subjective
      notes: [`Generated content for ${input.structureSlots.dialogueSlots.length} dialogue slots`]
    };

    return output;
  }

  private buildCharacterPrompt(input: CharacterAgentInput): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are a character development specialist and dialogue expert. Your job is to write authentic, emotionally resonant dialogue and internal character moments in the style of epic fantasy masters.

MARTIN-INSPIRED WRITING STYLE:

**DIALOGUE WITH SUBTEXT:**
Every line should carry weight beyond its literal meaning. Characters speak in layers - what they say, what they mean, and what they hide.

Example:
"You speak of justice as if it were bread," she said quietly.
"Perhaps because both feed the hungry," he replied.
"And both can grow stale if left too long."
His smile never reached his eyes. "Then we must consume them quickly, my lady."

**INTERNAL MONOLOGUE:**
Show character thoughts through physical metaphors and sensory details. Emotions should feel tangible.

Example:
The memory clung to her like smoke from a dying fire. Each time she tried to forget, it curled back into her lungs, acrid and persistent. Duty had been her compass once, but now the needle spun wildly, pointing toward nothing but shadows.

**EMOTIONAL COMPLEXITY:**
Characters should contain contradictions. Heroes have flaws, villains have motivations, and everyone pays prices for their choices.

CORE PRINCIPLES:
- Every line of dialogue must have SUBTEXT - characters rarely say exactly what they mean
- Show character complexity through contradictions and unexpected reactions
- Use natural speech patterns - people interrupt, hesitate, misunderstand
- Emotional authenticity over literary beauty
- Each character has a unique voice and speech pattern

CRITICAL SHOW VS TELL RULES:
- NEVER write "she felt [emotion]" - show it through actions, dialogue, physical reactions
- NEVER write "he looked [emotion]" - describe specific physical details instead
- NEVER write "they seemed [state]" - demonstrate through behavior and speech
- ALWAYS show emotions through: facial expressions, body language, speech patterns, actions
- Use physical metaphors for emotions: "anger burned like acid", "fear spread like frost"

REPETITION AWARENESS:
- Avoid overusing words like: settled, heavy, sharp, cold, deep
- Vary sentence beginnings - don't start every sentence with "Her [body part]" or "She [action]"
- Replace common phrases: "breath hitched" → "breath caught/stopped/snagged"
- Avoid clichés: "knot in stomach", "heart skipped", "time stood still"

CRITICAL: You will receive specific slot requirements. Write content for each slot that fits seamlessly into the narrative structure.`;

    const userPrompt = `Generate character content for Chapter ${input.chapterNumber}: "${input.chapterPlan.title}"

**STORY OUTLINE - CHARACTER ARC CONTEXT:**
${input.storyOutline}

**CHARACTER CONTEXT:**
Active Characters: ${input.context.activeCharacters.join(', ')}

**CHARACTER STATES:**
${this.formatCharacterStates(input.context.characterStates)}

**CHAPTER EMOTIONAL JOURNEY:**
${input.chapterPlan.moralDilemma}
Character Complexity Focus: ${input.chapterPlan.characterComplexity}

**CRITICAL:** Character dialogue and thoughts must be consistent with the overall character arcs described in the story outline. Ensure character motivations, speech patterns, and emotional responses align with their established personalities and growth trajectories.

**DIALOGUE SLOTS TO FILL:**
${input.structureSlots.dialogueSlots.map((slot, i) => `${i+1}. [${slot}] - Purpose: ${this.inferDialoguePurpose(slot)}`).join('\n')}

**INTERNAL THOUGHT SLOTS TO FILL:**
${input.structureSlots.internalSlots.map((slot, i) => `${i+1}. [${slot}] - Focus: ${this.inferInternalFocus(slot)}`).join('\n')}

**DIALOGUE WRITING GUIDELINES:**

1. **AUTHENTIC SPEECH:**
   - Use contractions, incomplete sentences, verbal tics
   - Include interruptions, overlapping speech, mishearing
   - Each character has distinct vocabulary and rhythm
   - Add realistic "um," "uh," pauses, and trailing off

2. **SUBTEXT MASTERY:**
   - Characters say one thing, mean another
   - Emotional undercurrents in every exchange
   - Unspoken tensions and desires
   - What they DON'T say is as important as what they do

3. **EMOTIONAL AUTHENTICITY:**
   - Mix contradictory emotions (angry but hurt, excited but scared)
   - Physical reactions to emotions (clenched jaw, fidgeting hands)
   - Characters don't always understand their own feelings
   - Realistic emotional progression, not instant changes

4. **CHARACTER VOICE DISTINCTION:**
   - Unique speech patterns for each character
   - Different vocabulary levels and preferences
   - Distinct ways of avoiding direct answers
   - Personal verbal habits and mannerisms

**INTERNAL THOUGHT GUIDELINES:**

1. **STREAM OF CONSCIOUSNESS:**
   - Natural, unfiltered thoughts
   - Include random observations unrelated to plot
   - Mix important realizations with trivial concerns
   - Show how minds actually work - not linear

2. **EMOTIONAL COMPLEXITY:**
   - Acknowledge contradictory feelings
   - Show self-doubt and confusion
   - Include physical sensations tied to emotions
   - Honest assessment of motivations

3. **CHARACTER GROWTH:**
   - Show internal resistance to change
   - Gradual shifts in perspective
   - Old patterns of thinking vs new insights
   - Internal arguments and justifications

4. **CONTENT LIMITS:**
   - Keep internal monologues under 150 words per slot
   - Break up long thoughts with micro-actions (breath, glance, shift)
   - Avoid overwhelming blocks of introspection
   - Mix thoughts with immediate physical sensations

**QUALITY STANDARDS:**
- FORBIDDEN PHRASES: "she felt", "he looked", "seemed like", "appeared to be"
- REQUIRED: Show emotions through specific physical actions and dialogue
- WORD VARIATION: Use synonyms for repeated words, especially emotional descriptors
- SENTENCE VARIETY: Mix short punchy sentences with longer flowing ones
- RELEVANCE: In high-tension scenes, avoid mundane details (dinner, cleaning, trivial observations)

**OUTPUT FORMAT - CRITICAL REQUIREMENTS:**

⚠️ MANDATORY FORMAT - DO NOT DEVIATE:

You MUST output ONLY slot content in this EXACT format:

[SLOT_NAME]: Content goes here on the same line or continuing lines

[NEXT_SLOT_NAME]: Next content here

DO NOT:
- Add introductions like "Here are the slots"
- Add explanations or commentary
- Use numbered lists
- Use markdown headers
- Embed slots in narrative prose

DO:
- Start each slot with [SLOT_NAME]: immediately followed by content
- Put content on the same line or next line after the slot marker
- Separate different slots with blank lines

**CORRECT EXAMPLES:**

[DIALOGUE_BARKEEP_GREETING]: "'You're early,' Marcus said, not looking up from the glass he was cleaning. His tone suggested early wasn't necessarily good."

[INTERNAL_HERO_SUSPICION]: Something was off. Maybe it was the way Marcus kept his eyes down, or how his shoulders had tensioned the moment she walked in. Or maybe she was just paranoid again. God, she hoped she was just paranoid.

[DIALOGUE_CONFRONTATION]: "We need to talk," she said, her voice low but firm. "Now."

**WRONG EXAMPLES (DO NOT DO THIS):**

❌ Here are the dialogue slots:
1. [DIALOGUE_GREETING] - Marcus greets her

❌ The character enters. [INTERNAL_REACTION] She feels nervous.

❌ ## DIALOGUE_GREETING
Marcus said hello.

**NOW GENERATE ALL SLOT CONTENT IN THE CORRECT FORMAT:**`;

    return { systemPrompt, userPrompt };
  }

  private formatCharacterStates(characterStates: Record<string, any>): string {
    return Object.entries(characterStates)
      .map(([name, state]) => `${name}: Location - ${state.location}, Emotional State - ${state.emotionalState?.primaryEmotion || 'unknown'}`)
      .join('\n');
  }

  private inferDialoguePurpose(slotId: string): string {
    // Infer purpose from slot name - could be enhanced
    if (slotId.includes('GREETING')) return 'Initial interaction/establishing mood';
    if (slotId.includes('CONFLICT')) return 'Confrontation/tension escalation';
    if (slotId.includes('REVELATION')) return 'Information reveal/plot advancement';
    return 'Character interaction and development';
  }

  private inferInternalFocus(slotId: string): string {
    // Infer focus from slot name
    if (slotId.includes('SUSPICION')) return 'Growing doubt and uncertainty';
    if (slotId.includes('REACTION')) return 'Processing new information';
    if (slotId.includes('RESOLVE')) return 'Decision-making and determination';
    return 'Character emotional state and thoughts';
  }

  private parseCharacterOutput(content: string, input: CharacterAgentInput): CharacterAgentOutput {
    console.log('🔍 Character Agent parsing output...');
    console.log('📝 Raw content length:', content.length);
    
    const slots = this.extractSlotContent(content);
    console.log(`📋 Extracted ${Object.keys(slots).length} slots from Character Agent:`);
    Object.keys(slots).forEach(slotId => {
      console.log(`   ✅ [${slotId}]: ${slots[slotId].slice(0, 50)}...`);
    });

    const dialogueContent: Record<string, string> = {};
    const internalThoughts: Record<string, string> = {};

    // Separate dialogue and internal content
    for (const [slotId, slotContent] of Object.entries(slots)) {
      if (slotId.includes('DIALOGUE')) {
        dialogueContent[slotId] = slotContent;
      } else if (slotId.includes('INTERNAL')) {
        internalThoughts[slotId] = slotContent;
      }
    }

    return {
      content: slots,
      dialogueContent,
      internalThoughts,
      characterMoments: this.extractCharacterMoments(content),
      emotionalProgression: this.extractEmotionalProgression(content),
      metadata: {
        agentType: 'Character',
        processingTime: 0,
        confidence: 0,
        notes: []
      }
    };
  }

  private extractSlotContent(content: string): Record<string, string> {
    const slots: Record<string, string> = {};

    console.log('🔎 Starting advanced slot extraction...');

    // Strategy 1: Standard format [SLOT_NAME]: content
    this.extractStandardFormat(content, slots);

    // Strategy 2: Multiline format with newlines
    if (Object.keys(slots).length === 0) {
      console.log('🔄 Trying multiline format...');
      this.extractMultilineFormat(content, slots);
    }

    // Strategy 3: JSON-like format
    if (Object.keys(slots).length === 0) {
      console.log('🔄 Trying JSON format...');
      this.extractJsonFormat(content, slots);
    }

    // Strategy 4: Markdown-style format
    if (Object.keys(slots).length === 0) {
      console.log('🔄 Trying markdown format...');
      this.extractMarkdownFormat(content, slots);
    }

    // Strategy 5: Numbered list format
    if (Object.keys(slots).length === 0) {
      console.log('🔄 Trying numbered list format...');
      this.extractNumberedFormat(content, slots);
    }

    // Strategy 6: Fallback - extract any [SLOT] mentions with surrounding context
    if (Object.keys(slots).length === 0) {
      console.log('🔄 Using fallback extraction...');
      this.extractFallbackFormat(content, slots);
    }

    if (Object.keys(slots).length === 0) {
      console.warn('⚠️ WARNING: No slots found with any extraction method!');
      console.warn('⚠️ Content preview:', content.slice(0, 500));
      console.warn('⚠️ Full content length:', content.length);
    } else {
      console.log(`✅ Successfully extracted ${Object.keys(slots).length} slots`);
    }

    return slots;
  }

  // Strategy 1: Standard format [SLOT_NAME]: content
  private extractStandardFormat(content: string, slots: Record<string, string>): void {
    const patterns = [
      // Pattern 1: [SLOT]: "content" or [SLOT]: content (single line)
      /\[([^\]]+)\]:\s*"([^"]+)"/g,
      // Pattern 2: [SLOT]: content (until next slot or end)
      /\[([^\]]+)\]:\s*(.+?)(?=\n\[|\n\n|$)/gs,
      // Pattern 3: [SLOT] : content (with space before colon)
      /\[([^\]]+)\]\s*:\s*(.+?)(?=\n\[|\n\n|$)/gs,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const slotId = match[1].trim();
        let slotContent = match[2].trim();

        // Remove quotes if present
        if (slotContent.startsWith('"') && slotContent.endsWith('"')) {
          slotContent = slotContent.slice(1, -1);
        }
        if (slotContent.startsWith("'") && slotContent.endsWith("'")) {
          slotContent = slotContent.slice(1, -1);
        }

        // Clean up common artifacts
        slotContent = slotContent.replace(/^[\s\-*>]+/, '').trim();

        if (slotContent.length > 0) {
          slots[slotId] = slotContent;
          console.log(`   ✓ Standard format: [${slotId}]`);
        }
      }
      if (Object.keys(slots).length > 0) break;
    }
  }

  // Strategy 2: Multiline format
  // [SLOT_NAME]
  // Content here
  // More content
  private extractMultilineFormat(content: string, slots: Record<string, string>): void {
    const pattern = /\[([^\]]+)\]\s*\n+([\s\S]+?)(?=\n\[|\n\n\[|$)/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const slotId = match[1].trim();
      let slotContent = match[2].trim();

      // Remove quotes if present
      if (slotContent.startsWith('"') && slotContent.endsWith('"')) {
        slotContent = slotContent.slice(1, -1);
      }

      // Clean up
      slotContent = slotContent.replace(/^[\s\-*>]+/gm, '').trim();

      if (slotContent.length > 0 && slotContent.length < 2000) {
        slots[slotId] = slotContent;
        console.log(`   ✓ Multiline format: [${slotId}]`);
      }
    }
  }

  // Strategy 3: JSON-like format
  // {
  //   "SLOT_NAME": "content"
  // }
  private extractJsonFormat(content: string, slots: Record<string, string>): void {
    try {
      // Try to find JSON object in content
      const jsonMatch = content.match(/\{[\s\S]*\}/g);
      if (jsonMatch) {
        for (const jsonStr of jsonMatch) {
          try {
            const parsed = JSON.parse(jsonStr);
            for (const [key, value] of Object.entries(parsed)) {
              if (typeof value === 'string' && value.length > 0) {
                slots[key] = value;
                console.log(`   ✓ JSON format: [${key}]`);
              }
            }
          } catch (e) {
            // Not valid JSON, continue
          }
        }
      }
    } catch (error) {
      // JSON parsing failed, continue to next strategy
    }
  }

  // Strategy 4: Markdown-style format
  // ## SLOT_NAME
  // Content here
  private extractMarkdownFormat(content: string, slots: Record<string, string>): void {
    const patterns = [
      // Pattern 1: ## [SLOT_NAME]
      /##\s*\[([^\]]+)\]\s*\n+([\s\S]+?)(?=\n##|$)/g,
      // Pattern 2: **[SLOT_NAME]**
      /\*\*\[([^\]]+)\]\*\*\s*\n+([\s\S]+?)(?=\n\*\*\[|$)/g,
      // Pattern 3: ### SLOT_NAME (without brackets)
      /###\s*([A-Z_]+)\s*\n+([\s\S]+?)(?=\n###|$)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const slotId = match[1].trim();
        let slotContent = match[2].trim();

        slotContent = slotContent.replace(/^[\s\-*>]+/gm, '').trim();

        if (slotContent.length > 0 && slotContent.length < 2000) {
          slots[slotId] = slotContent;
          console.log(`   ✓ Markdown format: [${slotId}]`);
        }
      }
      if (Object.keys(slots).length > 0) break;
    }
  }

  // Strategy 5: Numbered list format
  // 1. [SLOT_NAME]: content
  private extractNumberedFormat(content: string, slots: Record<string, string>): void {
    const pattern = /\d+\.\s*\[([^\]]+)\]\s*:?\s*(.+?)(?=\n\d+\.|$)/gs;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const slotId = match[1].trim();
      let slotContent = match[2].trim();

      // Remove quotes
      if (slotContent.startsWith('"') && slotContent.endsWith('"')) {
        slotContent = slotContent.slice(1, -1);
      }

      slotContent = slotContent.replace(/^[\s\-*>]+/, '').trim();

      if (slotContent.length > 0) {
        slots[slotId] = slotContent;
        console.log(`   ✓ Numbered format: [${slotId}]`);
      }
    }
  }

  // Strategy 6: Fallback - extract slots with surrounding context
  private extractFallbackFormat(content: string, slots: Record<string, string>): void {
    // Find all [SLOT_NAME] mentions
    const slotMentions = content.match(/\[([A-Z_]+[A-Z0-9_]*)\]/g);
    if (!slotMentions) return;

    console.log(`   🔍 Found ${slotMentions.length} slot mentions, extracting context...`);

    for (const mention of slotMentions) {
      const slotId = mention.slice(1, -1);
      
      // Skip if already extracted
      if (slots[slotId]) continue;

      // Try to extract content after the slot
      const slotIndex = content.indexOf(mention);
      if (slotIndex === -1) continue;

      // Get text after the slot (next 500 chars or until next slot)
      const afterSlot = content.slice(slotIndex + mention.length);
      const nextSlotMatch = afterSlot.match(/\[([A-Z_]+[A-Z0-9_]*)\]/);
      const endIndex = nextSlotMatch ? afterSlot.indexOf(nextSlotMatch[0]) : Math.min(500, afterSlot.length);
      
      let slotContent = afterSlot.slice(0, endIndex).trim();

      // Clean up common prefixes
      slotContent = slotContent.replace(/^[:;\-\s]+/, '').trim();
      slotContent = slotContent.replace(/^\n+/, '').trim();

      // If content is too short, try getting text before the slot
      if (slotContent.length < 20) {
        const beforeSlot = content.slice(Math.max(0, slotIndex - 500), slotIndex);
        const prevSlotMatch = beforeSlot.match(/\[([A-Z_]+[A-Z0-9_]*)\]/g);
        const startIndex = prevSlotMatch ? beforeSlot.lastIndexOf(prevSlotMatch[prevSlotMatch.length - 1]) + prevSlotMatch[prevSlotMatch.length - 1].length : 0;
        
        slotContent = beforeSlot.slice(startIndex).trim();
        slotContent = slotContent.replace(/^[:;\-\s]+/, '').trim();
      }

      // Only accept if content is reasonable length and doesn't contain other slots
      if (slotContent.length >= 10 && slotContent.length <= 1000 && !slotContent.includes('[')) {
        slots[slotId] = slotContent;
        console.log(`   ✓ Fallback extraction: [${slotId}] (${slotContent.length} chars)`);
      }
    }
  }

  private extractCharacterMoments(content: string): string[] {
    // Extract significant character development moments
    return ['Character content generated with emotional depth'];
  }

  private extractEmotionalProgression(content: string): string[] {
    // Extract emotional journey through the chapter
    return ['Emotional progression tracked through dialogue and thoughts'];
  }
}

// =================== SCENE AGENT ===================

export interface SceneAgentInput {
  chapterPlan: ParsedChapterPlan;
  chapterNumber: number;
  context: SceneContext;
  constraints: CoherenceConstraints;
  structureSlots: StructureAgentOutput['slots'];
  storyOutline: string;
}

export interface SceneAgentOutput extends AgentOutput {
  descriptions: Record<string, string>;
  actionContent: Record<string, string>;
  atmosphericElements: string[];
  sensoryDetails: string[];
}

export class SceneAgent {
  async generate(input: SceneAgentInput): Promise<SceneAgentOutput> {
    const startTime = Date.now();

    console.log(`🎬 Scene Agent generating atmosphere and action for Chapter ${input.chapterNumber}`);

    const prompt = this.buildScenePrompt(input);
    const sceneContent = await generateGeminiText(
      prompt.userPrompt,
      prompt.systemPrompt,
      undefined,
      0.8, // High creativity for atmospheric content
      0.9,
      40
    );

    const output = this.parseSceneOutput(sceneContent, input);
    output.metadata = {
      agentType: 'Scene',
      processingTime: Date.now() - startTime,
      confidence: 85, // Scene content is fairly objective
      notes: [`Generated content for ${input.structureSlots.descriptionSlots.length} description slots and ${input.structureSlots.actionSlots.length} action slots`]
    };

    return output;
  }

  private buildScenePrompt(input: SceneAgentInput): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are a master of atmospheric writing and action sequences in the tradition of epic fantasy masters. Your specialty is creating vivid, immersive scenes that engage all the senses and make readers feel present in the story.

MARTIN-INSPIRED ATMOSPHERIC TECHNIQUES:

**ENVIRONMENTAL FORESHADOWING:**
Weather and atmosphere should hint at emotional or narrative developments. The world reflects the story's mood.

Example:
The evening hung like tarnished copper above the battlements, pregnant with unshed rain. Along the ramparts, torches wavered, their flames pulled eastward by wind that tasted of iron and distant storms. The sea beyond churned restless as a sleeper's dream, its waves the color of old blood.

**SENSORY LAYERING:**
Build atmosphere through multiple senses working together. Each detail should feel lived-in and specific.

Example:
The great hall reeked of cold mutton and dying fires. Smoke hung in the rafters like gray ghosts, and beneath it all, the sweet-sick smell of fear. The stones beneath her feet were slick with condensation that felt cold as tears.

**ACTION WITH CONSEQUENCE:**
Physical action should have weight and aftermath. Every movement costs something.

Example:
Steel rang against steel, the impact jarring up through his arm like lightning. His opponent stumbled, and for a heartbeat the world narrowed to that one opening. Then blood, hot and copper-bright, and the terrible weight of what came after.

CORE PRINCIPLES:
- Use ALL FIVE SENSES, not just sight and sound
- Specific details over general descriptions
- Connect sensory details to character emotions
- Action sequences focus on IMPACT and MOVEMENT
- Environment reflects and amplifies story mood
- Avoid purple prose - every detail must serve the story

PACING BY SCENE TYPE:
- ACTION scenes: Short, punchy sentences (8-12 words). Rapid-fire verbs. Minimal adjectives.
- EMOTIONAL scenes: Longer, flowing sentences (15-20 words). Rich sensory details. Atmospheric depth.
- REVELATION scenes: Medium sentences (12-15 words). Focus on specific concrete details.
- SETUP scenes: Varied sentence length. Balance action and description.

REPETITION AWARENESS:
- Avoid overusing: settled, heavy, sharp, cold, thick, dense
- Vary atmospheric words: oppressive/crushing/suffocating instead of "heavy"
- Replace common phrases: "hung in the air" → "pressed down/drifted/lingered"
- NO clichés: "silence hung heavy", "time stood still", "air thick with tension"

CONTEXT RELEVANCE:
- HIGH TENSION scenes: NO mundane details (cleaning, dinner, trivial observations)
- CALM scenes: Appropriate place for everyday details and micro-observations
- Match detail importance to scene urgency

CRITICAL: You will write content for specific slots that must integrate seamlessly with dialogue and character moments from other specialists.`;

    const userPrompt = `Generate scene content for Chapter ${input.chapterNumber}: "${input.chapterPlan.title}"

**STORY OUTLINE - WORLD & ATMOSPHERE CONTEXT:**
${input.storyOutline}

**SCENE TYPE DETECTED:** ${this.detectSceneType(input.chapterPlan)}
**REQUIRED PACING:** ${this.getPacingInstructions(input.chapterPlan)}

**SETTING CONTEXT:**
Primary Location: ${input.context.primaryLocation.name}
Atmosphere Required: ${input.context.atmosphereRequirements.mood}
Tension Level: ${input.context.atmosphereRequirements.tension}
Security Level: ${input.context.primaryLocation.securityLevel}

**SENSORY FOCUS:**
Primary Senses: ${input.context.atmosphereRequirements.sensoryFocus.join(', ')}

**CRITICAL:** Scene descriptions must be consistent with the world, tone, and atmosphere established in the story outline. Ensure environmental details, cultural elements, and atmospheric descriptions align with the overall story setting and genre.

**DESCRIPTION SLOTS TO FILL:**
${input.structureSlots.descriptionSlots.map((slot, i) => `${i+1}. [${slot}] - Type: ${this.inferDescriptionType(slot)}`).join('\n')}

**ACTION SLOTS TO FILL:**
${input.structureSlots.actionSlots.map((slot, i) => `${i+1}. [${slot}] - Type: ${this.inferActionType(slot)}`).join('\n')}

**ATMOSPHERIC WRITING GUIDELINES:**

1. **FIVE-SENSE IMMERSION:**
   - SIGHT: Specific visual details, lighting, movement
   - SOUND: Ambient noise, specific sounds, volume, tone
   - SMELL: Environment odors, character scents, food, decay
   - TOUCH: Temperature, texture, weight, pressure
   - TASTE: Air quality, stress responses, environmental taste

2. **SPECIFIC OVER GENERAL:**
   - "Rust-stained iron" not "old metal"
   - "Cigarette smoke and stale beer" not "tavern smells"
   - "Footsteps on wet cobblestone" not "walking sounds"
   - "Metallic taste of fear" not "was afraid"

3. **EMOTIONAL RESONANCE:**
   - Environment reflects character state
   - Weather/atmosphere amplifies mood
   - Sensory details trigger memories/emotions
   - Setting becomes a character in the scene

4. **ACTION WRITING PRINCIPLES:**
   - Short, punchy sentences for fast action
   - Focus on IMPACT and CONSEQUENCES
   - Physical details: muscle tension, balance, momentum
   - Show effort and physicality, not just results

**SCENE CONTENT GUIDELINES:**

1. **ENVIRONMENTAL DESCRIPTIONS:**
   - Layer multiple sensory details naturally
   - Include living elements (people, animals, movement)
   - Show how environment affects characters
   - Use specific, concrete nouns and active verbs

2. **ACTION SEQUENCES:**
   - Build tension before the action
   - Use sentence length to control pacing
   - Include physical consequences and effort
   - Show environmental interaction during action

3. **ATMOSPHERIC CONTINUITY:**
   - Maintain sensory consistency throughout
   - Show time progression through environment
   - Connect scenes through atmospheric elements
   - Use weather/lighting to enhance mood

**OUTPUT FORMAT - CRITICAL REQUIREMENTS:**

⚠️ MANDATORY FORMAT - DO NOT DEVIATE:

You MUST output ONLY slot content in this EXACT format:

[SLOT_NAME]: Content goes here on the same line or continuing lines

[NEXT_SLOT_NAME]: Next content here

DO NOT:
- Add introductions like "Here are the descriptions"
- Add explanations or commentary
- Use numbered lists
- Use markdown headers
- Embed slots in narrative prose

DO:
- Start each slot with [SLOT_NAME]: immediately followed by content
- Put content on the same line or next line after the slot marker
- Separate different slots with blank lines

**CORRECT EXAMPLES:**

[DESCRIPTION_TAVERN_ATMOSPHERE]: Lamplight struggled through smoke-thick air, casting amber shadows across scarred oak tables. The smell of ale mixed with unwashed bodies and something else—something metallic that made her mouth taste like copper pennies.

[ACTION_CONFRONTATION]: The chair legs scraped against stone as Marcus pushed back from the table. The sound cut through conversation like a blade, and suddenly every eye in the tavern was watching. Her hand found her dagger's hilt without conscious thought.

[DESCRIPTION_WEATHER]: Rain hammered the cobblestones outside, each drop exploding into a thousand smaller droplets. The storm had come fast, turning the street into a river of mud and refuse.

**WRONG EXAMPLES (DO NOT DO THIS):**

❌ Here are the scene descriptions:
1. [DESCRIPTION_TAVERN] - The tavern is dark

❌ The tavern was atmospheric. [DESCRIPTION_ATMOSPHERE] Smoke filled the air.

❌ ## DESCRIPTION_TAVERN
The tavern was crowded.

**NOW GENERATE ALL SLOT CONTENT IN THE CORRECT FORMAT:**`;

    return { systemPrompt, userPrompt };
  }

  private inferDescriptionType(slotId: string): string {
    if (slotId.includes('ATMOSPHERE')) return 'Environmental atmosphere and mood';
    if (slotId.includes('OPENING')) return 'Scene establishment and setting';
    if (slotId.includes('CONSEQUENCES')) return 'Aftermath and environmental impact';
    return 'Environmental description and sensory details';
  }

  private inferActionType(slotId: string): string {
    if (slotId.includes('CONFRONTATION')) return 'Tense physical interaction';
    if (slotId.includes('ESCAPE')) return 'Movement and chase sequence';
    if (slotId.includes('CLIMAX')) return 'Peak action moment';
    return 'Physical action and movement';
  }

  private parseSceneOutput(content: string, input: SceneAgentInput): SceneAgentOutput {
    console.log('🔍 Scene Agent parsing output...');
    console.log('📝 Raw content length:', content.length);
    
    const slots = this.extractSlotContent(content);
    console.log(`📋 Extracted ${Object.keys(slots).length} slots from Scene Agent:`);
    Object.keys(slots).forEach(slotId => {
      console.log(`   ✅ [${slotId}]: ${slots[slotId].slice(0, 50)}...`);
    });

    const descriptions: Record<string, string> = {};
    const actionContent: Record<string, string> = {};

    // Separate description and action content
    for (const [slotId, slotContent] of Object.entries(slots)) {
      if (slotId.includes('DESCRIPTION')) {
        descriptions[slotId] = slotContent;
      } else if (slotId.includes('ACTION')) {
        actionContent[slotId] = slotContent;
      }
    }

    return {
      content: slots,
      descriptions,
      actionContent,
      atmosphericElements: this.extractAtmosphericElements(content),
      sensoryDetails: this.extractSensoryDetails(content),
      metadata: {
        agentType: 'Scene',
        processingTime: 0,
        confidence: 0,
        notes: []
      }
    };
  }

  private extractSlotContent(content: string): Record<string, string> {
    const slots: Record<string, string> = {};

    console.log('🔎 Starting advanced slot extraction...');

    // Strategy 1: Standard format [SLOT_NAME]: content
    this.extractStandardFormat(content, slots);

    // Strategy 2: Multiline format with newlines
    if (Object.keys(slots).length === 0) {
      console.log('🔄 Trying multiline format...');
      this.extractMultilineFormat(content, slots);
    }

    // Strategy 3: JSON-like format
    if (Object.keys(slots).length === 0) {
      console.log('🔄 Trying JSON format...');
      this.extractJsonFormat(content, slots);
    }

    // Strategy 4: Markdown-style format
    if (Object.keys(slots).length === 0) {
      console.log('🔄 Trying markdown format...');
      this.extractMarkdownFormat(content, slots);
    }

    // Strategy 5: Numbered list format
    if (Object.keys(slots).length === 0) {
      console.log('🔄 Trying numbered list format...');
      this.extractNumberedFormat(content, slots);
    }

    // Strategy 6: Fallback - extract any [SLOT] mentions with surrounding context
    if (Object.keys(slots).length === 0) {
      console.log('🔄 Using fallback extraction...');
      this.extractFallbackFormat(content, slots);
    }

    if (Object.keys(slots).length === 0) {
      console.warn('⚠️ WARNING: No slots found with any extraction method!');
      console.warn('⚠️ Content preview:', content.slice(0, 500));
      console.warn('⚠️ Full content length:', content.length);
    } else {
      console.log(`✅ Successfully extracted ${Object.keys(slots).length} slots`);
    }

    return slots;
  }

  // Strategy 1: Standard format [SLOT_NAME]: content
  private extractStandardFormat(content: string, slots: Record<string, string>): void {
    const patterns = [
      // Pattern 1: [SLOT]: "content" or [SLOT]: content (single line)
      /\[([^\]]+)\]:\s*"([^"]+)"/g,
      // Pattern 2: [SLOT]: content (until next slot or end)
      /\[([^\]]+)\]:\s*(.+?)(?=\n\[|\n\n|$)/gs,
      // Pattern 3: [SLOT] : content (with space before colon)
      /\[([^\]]+)\]\s*:\s*(.+?)(?=\n\[|\n\n|$)/gs,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const slotId = match[1].trim();
        let slotContent = match[2].trim();

        // Remove quotes if present
        if (slotContent.startsWith('"') && slotContent.endsWith('"')) {
          slotContent = slotContent.slice(1, -1);
        }
        if (slotContent.startsWith("'") && slotContent.endsWith("'")) {
          slotContent = slotContent.slice(1, -1);
        }

        // Clean up common artifacts
        slotContent = slotContent.replace(/^[\s\-*>]+/, '').trim();

        if (slotContent.length > 0) {
          slots[slotId] = slotContent;
          console.log(`   ✓ Standard format: [${slotId}]`);
        }
      }
      if (Object.keys(slots).length > 0) break;
    }
  }

  // Strategy 2: Multiline format
  // [SLOT_NAME]
  // Content here
  // More content
  private extractMultilineFormat(content: string, slots: Record<string, string>): void {
    const pattern = /\[([^\]]+)\]\s*\n+([\s\S]+?)(?=\n\[|\n\n\[|$)/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const slotId = match[1].trim();
      let slotContent = match[2].trim();

      // Remove quotes if present
      if (slotContent.startsWith('"') && slotContent.endsWith('"')) {
        slotContent = slotContent.slice(1, -1);
      }

      // Clean up
      slotContent = slotContent.replace(/^[\s\-*>]+/gm, '').trim();

      if (slotContent.length > 0 && slotContent.length < 2000) {
        slots[slotId] = slotContent;
        console.log(`   ✓ Multiline format: [${slotId}]`);
      }
    }
  }

  // Strategy 3: JSON-like format
  // {
  //   "SLOT_NAME": "content"
  // }
  private extractJsonFormat(content: string, slots: Record<string, string>): void {
    try {
      // Try to find JSON object in content
      const jsonMatch = content.match(/\{[\s\S]*\}/g);
      if (jsonMatch) {
        for (const jsonStr of jsonMatch) {
          try {
            const parsed = JSON.parse(jsonStr);
            for (const [key, value] of Object.entries(parsed)) {
              if (typeof value === 'string' && value.length > 0) {
                slots[key] = value;
                console.log(`   ✓ JSON format: [${key}]`);
              }
            }
          } catch (e) {
            // Not valid JSON, continue
          }
        }
      }
    } catch (error) {
      // JSON parsing failed, continue to next strategy
    }
  }

  // Strategy 4: Markdown-style format
  // ## SLOT_NAME
  // Content here
  private extractMarkdownFormat(content: string, slots: Record<string, string>): void {
    const patterns = [
      // Pattern 1: ## [SLOT_NAME]
      /##\s*\[([^\]]+)\]\s*\n+([\s\S]+?)(?=\n##|$)/g,
      // Pattern 2: **[SLOT_NAME]**
      /\*\*\[([^\]]+)\]\*\*\s*\n+([\s\S]+?)(?=\n\*\*\[|$)/g,
      // Pattern 3: ### SLOT_NAME (without brackets)
      /###\s*([A-Z_]+)\s*\n+([\s\S]+?)(?=\n###|$)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const slotId = match[1].trim();
        let slotContent = match[2].trim();

        slotContent = slotContent.replace(/^[\s\-*>]+/gm, '').trim();

        if (slotContent.length > 0 && slotContent.length < 2000) {
          slots[slotId] = slotContent;
          console.log(`   ✓ Markdown format: [${slotId}]`);
        }
      }
      if (Object.keys(slots).length > 0) break;
    }
  }

  // Strategy 5: Numbered list format
  // 1. [SLOT_NAME]: content
  private extractNumberedFormat(content: string, slots: Record<string, string>): void {
    const pattern = /\d+\.\s*\[([^\]]+)\]\s*:?\s*(.+?)(?=\n\d+\.|$)/gs;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const slotId = match[1].trim();
      let slotContent = match[2].trim();

      // Remove quotes
      if (slotContent.startsWith('"') && slotContent.endsWith('"')) {
        slotContent = slotContent.slice(1, -1);
      }

      slotContent = slotContent.replace(/^[\s\-*>]+/, '').trim();

      if (slotContent.length > 0) {
        slots[slotId] = slotContent;
        console.log(`   ✓ Numbered format: [${slotId}]`);
      }
    }
  }

  // Strategy 6: Fallback - extract slots with surrounding context
  private extractFallbackFormat(content: string, slots: Record<string, string>): void {
    // Find all [SLOT_NAME] mentions
    const slotMentions = content.match(/\[([A-Z_]+[A-Z0-9_]*)\]/g);
    if (!slotMentions) return;

    console.log(`   🔍 Found ${slotMentions.length} slot mentions, extracting context...`);

    for (const mention of slotMentions) {
      const slotId = mention.slice(1, -1);
      
      // Skip if already extracted
      if (slots[slotId]) continue;

      // Try to extract content after the slot
      const slotIndex = content.indexOf(mention);
      if (slotIndex === -1) continue;

      // Get text after the slot (next 500 chars or until next slot)
      const afterSlot = content.slice(slotIndex + mention.length);
      const nextSlotMatch = afterSlot.match(/\[([A-Z_]+[A-Z0-9_]*)\]/);
      const endIndex = nextSlotMatch ? afterSlot.indexOf(nextSlotMatch[0]) : Math.min(500, afterSlot.length);
      
      let slotContent = afterSlot.slice(0, endIndex).trim();

      // Clean up common prefixes
      slotContent = slotContent.replace(/^[:;\-\s]+/, '').trim();
      slotContent = slotContent.replace(/^\n+/, '').trim();

      // If content is too short, try getting text before the slot
      if (slotContent.length < 20) {
        const beforeSlot = content.slice(Math.max(0, slotIndex - 500), slotIndex);
        const prevSlotMatch = beforeSlot.match(/\[([A-Z_]+[A-Z0-9_]*)\]/g);
        const startIndex = prevSlotMatch ? beforeSlot.lastIndexOf(prevSlotMatch[prevSlotMatch.length - 1]) + prevSlotMatch[prevSlotMatch.length - 1].length : 0;
        
        slotContent = beforeSlot.slice(startIndex).trim();
        slotContent = slotContent.replace(/^[:;\-\s]+/, '').trim();
      }

      // Only accept if content is reasonable length and doesn't contain other slots
      if (slotContent.length >= 10 && slotContent.length <= 1000 && !slotContent.includes('[')) {
        slots[slotId] = slotContent;
        console.log(`   ✓ Fallback extraction: [${slotId}] (${slotContent.length} chars)`);
      }
    }
  }

  private extractAtmosphericElements(content: string): string[] {
    return ['Atmospheric content generated with sensory details'];
  }

  private extractSensoryDetails(content: string): string[] {
    return ['Multi-sensory details integrated throughout scene content'];
  }

  private detectSceneType(chapterPlan: any): string {
    const title = chapterPlan.title?.toLowerCase() || '';
    const summary = chapterPlan.summary?.toLowerCase() || '';

    if (title.includes('battle') || title.includes('fight') || title.includes('chase') ||
        summary.includes('attack') || summary.includes('combat') || summary.includes('fight')) {
      return 'ACTION';
    }

    if (title.includes('reveal') || title.includes('truth') || title.includes('discover') ||
        summary.includes('revelation') || summary.includes('truth') || summary.includes('secret')) {
      return 'REVELATION';
    }

    if (title.includes('memory') || title.includes('emotion') || title.includes('feel') ||
        summary.includes('emotion') || summary.includes('remember') || summary.includes('past')) {
      return 'EMOTIONAL';
    }

    return 'SETUP';
  }

  private getPacingInstructions(chapterPlan: any): string {
    const sceneType = this.detectSceneType(chapterPlan);

    switch (sceneType) {
      case 'ACTION':
        return 'Short punchy sentences (8-12 words). Rapid verbs. Minimal description. Focus on movement and impact.';
      case 'EMOTIONAL':
        return 'Longer flowing sentences (15-20 words). Rich sensory details. Deep atmospheric description.';
      case 'REVELATION':
        return 'Medium sentences (12-15 words). Focus on specific concrete details. Clear, precise descriptions.';
      default:
        return 'Varied sentence length. Balance between action and description based on moment.';
    }
  }
}

// =================== EXPORT ===================

export const structureAgent = new StructureAgent();
export const characterAgent = new CharacterAgent();
export const sceneAgent = new SceneAgent();