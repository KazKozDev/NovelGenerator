/**
 * Prompt registry - embeds all prompts for browser use
 */

import { registerPromptTemplate, PromptNames } from './promptLoader';
import { CHAPTER_WRITING_SYSTEM_PROMPT, CHAPTER_WRITING_USER_PROMPT } from './chapterWritingPrompt';

// Register all prompt templates
export function initializePrompts() {

  registerPromptTemplate(PromptNames.STORY_OUTLINE, {
    systemPrompt: `You are a professional novelist and editor who creates compelling, structured, and detailed story outlines.`,
    userPrompt: `Based on the following story premise, create a detailed story outline for a {{chapters_count}}-chapter book. The outline should be comprehensive, covering main plot points, character arcs, subplots, and key events for each part of the story (beginning, middle, and end).

STORY PREMISE: "{{story_premise}}"

**🚫 CRITICAL: FORBIDDEN WORDS - DO NOT USE AS CHARACTER NAMES OR IN ANY CONTEXT:**
NEVER use these words anywhere in the outline (including character names, place names, or descriptions):
- "obsidian" or any derivatives (obsidian-like, Obsidian as name)
- "thorn", "thorne", or any derivatives (thorns, thorny, Thorne as name, Thornfield, etc.)
- "crystalline", "gossamer", "eldritch", "ephemeral", "ethereal", "luminescent"

Use alternative words: "black stone", "spike", "sharp point", "clear", "thin", "strange", "brief", "faint", "glowing"
This applies to ALL parts of the outline including character names and locations.

Please structure your response with the following sections clearly marked:
1.  **LOGLINE:** A single sentence summarizing the core conflict.
2.  **MAIN CHARACTERS:** A list of the main characters with a brief (2-3 sentence) description of their personality, motivation, and core conflict/arc.
3.  **STORY ARC (THREE ACT STRUCTURE):**
    *   **ACT I (The Setup):** Introduction to the world and characters, the inciting incident, and the protagonist's initial goal. (Covers roughly the first 25% of chapters).
    *   **ACT II (The Confrontation):** Rising action, new challenges, character development, introduction of allies and enemies, the midpoint (a major turning point), and escalating stakes. (Covers roughly the next 50% of chapters).
    *   **ACT III (The Resolution):** The climax, falling action, and the final resolution of the main plot and character arcs. (Covers roughly the final 25% of chapters).
4.  **WORLD BUILDING DETAILS:** Key details about the setting, magic system (if any), culture, etc.
5.  **RECURRING MOTIFS/THEMES:** List 3-5 recurring symbols, ideas, or themes that will be woven throughout the narrative.`
  });

  registerPromptTemplate(PromptNames.CHAPTER_PLANNING, {
    systemPrompt: `You are an expert story planner creating detailed chapter-by-chapter plans. Your output MUST conform to the provided JSON schema. Focus on conflict, character development, and narrative momentum.`,
    userPrompt: `Create a detailed plan for {{num_chapters}} chapters based on this story outline. Each chapter needs specific conflict, character growth, and forward momentum.

**🎯 TOP 5 PLANNING PRIORITIES:**

1. **CONFLICT IN EVERY CHAPTER** - Specify 'conflictType':
   - External: fights, obstacles, chases
   - Internal: moral dilemmas, self-doubt, difficult choices
   - Interpersonal: relationship tension, betrayal, competition
   - Societal: system vs individual, corruption, injustice

2. **MORAL COMPLEXITY** - Specify 'moralDilemma':
   - No easy answers, characters face impossible choices
   - Good people make questionable decisions
   - Antagonists have understandable motivations
   - Show consequences of every choice

3. **CHARACTER DEPTH** - Specify 'characterComplexity':
   - Reveal contradictions and flaws
   - Internal conflicts that drive external action
   - Character change through difficult decisions
   - Avoid archetypes, create complex people

4. **PACING RHYTHM** - Specify 'rhythmPacing' (fast/medium/slow):
   - Fast: action-heavy, dialogue-driven scenes
   - Medium: balanced action and introspection
   - Slow: character development, world-building
   - Alternate deliberately across chapters

5. **ESCALATING TENSION** - Rate 'tensionLevel' (1-10):
   - Build systematically toward climax
   - Create peaks and strategic valleys
   - Personal stakes before global ones
   - Each chapter raises what's at risk

**📋 CHAPTER STRUCTURE TEMPLATE:**
- **Opening:** Hook that connects to previous chapter
- **Development:** ONE major event + ONE character change
- **Complication:** New problem or revelation
- **Escalation:** Raise stakes or reveal consequence
- **Hook ending:** Question or threat for next chapter

**⚡ SPECIAL CHAPTER TYPES:**

**Chapters 1-3 (Hook Phase):**
- Prioritize plot momentum over world-building
- Establish conflict quickly
- Show character in action, not description

**Middle Chapters (Anti-Sag Rules):**
- Vary patterns: no two consecutive chapters with same structure
- Introduce new complications vs repeating old ones
- Shift locations, add characters, reveal information
- Avoid "another chase/fight/betrayal" - make each unique

**Final Chapters (Resolution Phase):**
- Resolve all established conflicts clearly
- Hero must be changed by journey (physical/psychological scars)
- Cost of victory - something permanent changes
- Internal growth as important as external victory

**📖 EXAMPLE CHAPTER STRUCTURE:**
Chapter 3: "The Betrayal"
- conflictType: "interpersonal"
- moralDilemma: "Protagonist must choose between saving friend or mission"
- characterComplexity: "Hero realizes they enjoy the power they're fighting against"
- tensionLevel: 7
- rhythmPacing: "fast"
- consequencesOfChoices: "Friend's trust is broken, mission compromised"

**🏗️ STORY OUTLINE TO PLAN:**
{{story_outline}}

Generate complete chapter plans (1 to {{num_chapters}}) with all required fields filled.`
  });

  registerPromptTemplate(PromptNames.CHAPTER_ANALYSIS, {
    systemPrompt: `You are a meticulous literary analyst. Your task is to analyze chapter content and extract key information, conforming strictly to the provided JSON schema.`,
    userPrompt: `Analyze the provided content for Chapter {{chapter_number}} ("{{chapter_title}}"). Extract the required information and provide it in the specified JSON format.

CHAPTER CONTENT:
{{chapter_content}}`
  });

  registerPromptTemplate(PromptNames.SELF_CRITIQUE, {
    systemPrompt: `You are a writing coach specializing in detecting AI-generated patterns and making text feel human-written.`,
    userPrompt: `Analyze this chapter for AI-generated patterns that make text feel artificial. Focus on making it more human.

**CHAPTER {{chapter_number}} - "{{chapter_title}}":**
{{chapter_content_preview}}

**🤖 AI PATTERN DETECTION (PRIORITY 1):**
1. **STRUCTURAL TEMPLATING:** Does this chapter start/develop exactly like others? Flag mechanical repetition.
2. **EMOTIONAL EXCESS:** Are all feelings at maximum intensity? ("overwhelming terror" vs natural "uneasy")
3. **OVER-EXPLANATION:** Does text explain what's already shown? ("he was angry because...")
4. **PERFECT PROSE:** Is rhythm too smooth? Flag if no awkward/broken sentences.
5. **ARTIFICIAL BEAUTY:** Descriptions for prettiness vs function? ("ethereal moonlight" vs useful details)

**👤 HUMANITY MISSING:**
6. **PERSONAL STRANGENESS:** Does character notice anything weird/unrelated to plot?
7. **PHYSICAL REALITY:** Any mundane needs? (hunger, discomfort, random thoughts)
8. **IMPERFECTION:** Any stumbles, mishearing, irrational moments?
9. **UNRESOLVED ELEMENTS:** Anything mentioned but not explained?
10. **CONVERSATION REALITY:** Do people interrupt, say "um", misunderstand?

**💭 SUBJECTIVITY CHECK:**
- Does character think only about plot? (Add random tangents)
- Are all metaphors predictable? (Need personal, weird associations)
- Too many literary constructions? (Need simpler, concrete language)

**🎯 RESPONSE FORMAT:**
List specific AI patterns found:
- "MECHANICAL STRUCTURE: Starts exactly like Chapter X..."
- "EMOTIONAL EXCESS: 'crushing despair' - use smaller emotion"
- "MISSING HUMANITY: No personal details or random thoughts"
- "OVER-BEAUTIFUL: 'ancient mystical energy' - be concrete instead"

If chapter feels human-written, say "FEELS HUMAN" and note what works.

**Focus on making text feel like a real person wrote it, not a literature generator.**`
  });

  registerPromptTemplate(PromptNames.CHARACTER_UPDATES, {
    systemPrompt: `You are a story continuity assistant. Your job is to track character states from one chapter to the next based on events. You must output valid JSON conforming to the schema.`,
    userPrompt: `Based on the events in the following chapter, update the state of the main characters. Previous character states are provided for context. Only update fields that have explicitly changed based on the chapter's events. The character 'name' must exactly match one of the names from the provided character list.

CHARACTER LIST: {{character_list}}

PREVIOUS CHARACTER STATES:
{{previous_character_states}}

CHAPTER {{chapter_number}} ("{{chapter_title}}") CONTENT:
{{chapter_content}}

Return ONLY the JSON object with the updated character data. If no characters had a change in status, location, or emotional state, return an empty 'character_updates' array.`
  });

  registerPromptTemplate(PromptNames.TRANSITION_WRITING, {
    systemPrompt: `You are an expert fiction editor specializing in narrative flow and pacing.`,
    userPrompt: `You are a skilled novel editor. Your task is to seamlessly connect two chapters. Below is the end of Chapter {{chapter_a_number}} and the beginning of Chapter {{chapter_b_number}}. Rewrite the **ENDING of Chapter {{chapter_a_number}}** to create a smoother, more engaging, and less abrupt transition into the next chapter. The new ending should be approximately the same length as the original ending provided and should read naturally as part of the full chapter text. Do not summarize or add notes. Respond with **ONLY the rewritten text for the end of the chapter.**

**END OF CHAPTER {{chapter_a_number}}:**
---
{{end_of_chapter_a}}
---

**BEGINNING OF CHAPTER {{chapter_b_number}}:**
---
{{start_of_chapter_b}}
---

**REWRITTEN ENDING FOR CHAPTER {{chapter_a_number}}:**`
  });

  registerPromptTemplate(PromptNames.TITLE_GENERATION, {
    systemPrompt: `You are a book titling expert.`,
    userPrompt: `Create a compelling and marketable title for a book with this premise: "{{story_premise}}". Respond with ONLY the title.`
  });

  registerPromptTemplate(PromptNames.EDITING_AGENT_ANALYSIS, {
    systemPrompt: `You are an intelligent editing agent specialized in light polish for specialist-generated content. Your role is to enhance already-quality content, not to rewrite it.`,
    userPrompt: `You are analyzing specialist-generated content for light polish opportunities. This content was created by expert agents and should already be high quality.

**CHAPTER {{chapter_number}} ANALYSIS:**

**CRITIQUE NOTES:**
{{critique_notes}}

**CHAPTER PLAN:**
{{chapter_plan_text}}

**CHAPTER LENGTH:** {{chapter_length}} characters

**LIGHT POLISH ANALYSIS:**
Since this content was generated by specialist agents, focus only on minor improvements:

1. **POLISH** - Use when:
   - Minor flow improvements needed
   - Small word choice enhancements
   - Subtle rhythm adjustments
   - Changes needed are < 5% of text

2. **INTEGRATION-FIX** - Use when:
   - Slight integration seams between specialist content
   - Minor transition improvements
   - Light coherence adjustments
   - Changes needed are < 3% of text

3. **SKIP** - Use when:
   - Specialist content is already excellent
   - No meaningful improvements possible
   - Content meets all quality standards

**HYBRID SYSTEM NOTE:**
- DO NOT use "regenerate" or "targeted-edit" - specialist agents already handled content creation
- Focus on refinement, not recreation
- Preserve specialist expertise in each domain

**RESPOND IN JSON:**
{
  "strategy": "polish|integration-fix|skip",
  "reasoning": "Brief explanation focusing on why light polish is/isn't needed",
  "priority": "low|very-low",
  "estimatedChanges": "Percentage of minor changes needed (max 5%)"
}`
  });

  registerPromptTemplate(PromptNames.CONSISTENCY_CHECKER, {
    systemPrompt: `You are an expert story editor specializing in continuity and consistency.`,
    userPrompt: `You are a meticulous story continuity checker. Analyze the provided chapter for consistency issues.

**CHAPTER {{chapter_number}} CONTENT:**
{{chapter_content}}

**CHARACTERS:**
{{characters_json}}

**PREVIOUS CHAPTERS CONTEXT:**
{{previous_chapters_summary}}

**WORLD NAME:** {{world_name}}

**CHECK FOR:**
1. Character consistency (names, traits, abilities, relationships)
2. Plot consistency (events, timelines, cause-and-effect)
3. World consistency (rules, geography, technology, magic systems)
4. Dialogue consistency (character voices, speech patterns)
5. Timeline consistency (time progression, character ages, seasonal changes)

**RESPOND WITH:**
- "consistency_passed": true/false
- "issues": [list of specific consistency problems found]
- "warnings": [list of potential issues that should be reviewed]
- "severity": "critical"|"moderate"|"minor" for each issue

Return valid JSON format.`
  });

  // Integration-Fix Agent - Smooth seams between specialist content
  registerPromptTemplate(PromptNames.EDITING_AGENT_TARGETED, {
    systemPrompt: `You are an integration specialist smoothing minor seams between specialist agent outputs. Make MINIMAL changes only where content doesn't flow naturally.`,
    userPrompt: `Perform INTEGRATION-FIX - smooth minor seams where specialist agents' content connects awkwardly.

**🔗 INTEGRATION ISSUES TO FIX:**
{{critique_notes}}

**HYBRID SYSTEM CONTEXT:**
This chapter was generated by specialist agents:
- Structure Agent: Created framework and transitions
- Character Agent: Generated dialogue and internal thoughts
- Scene Agent: Provided descriptions and action
- Synthesis Agent: Combined all content

**⚡ INTEGRATION-FIX TARGETS (MINIMAL CHANGES ONLY):**

1. **TRANSITION SEAMS:**
   - Where dialogue meets description awkwardly
   - Where action sequences feel disconnected
   - Where internal thoughts don't flow into external action

2. **TONE INCONSISTENCIES:**
   - Minor mismatches between character voice and description tone
   - Slight pacing hiccups between fast action and slow moments

3. **REPETITION FIXES:**
   - Same information mentioned too close together by different agents
   - Similar sentence structures stacked from different sources

4. **FLOW IMPROVEMENTS:**
   - Add 1-2 words for better sentence connection
   - Adjust paragraph breaks for better rhythm
   - Fix pronoun clarity where multiple agents referenced same character

**🚫 STRICT LIMITATIONS:**
- Change MAXIMUM 3% of text
- DO NOT rewrite specialist content - only smooth connections
- Preserve all plot points, dialogue substance, character voices
- DO NOT add new descriptions or dialogue - only adjust flow

**✅ APPROVED MICRO-EDITS:**
- Add/remove connecting words ("but", "then", "still")
- Adjust sentence breaks for better flow
- Fix pronoun references for clarity
- Merge or split paragraphs for better pacing
- Replace repeated words with synonyms in adjacent sentences

**CHAPTER CONTENT:**
{{chapter_content}}

**🔧 CRITICAL: UNFILLED SLOT CLEANUP:**
If you see any unfilled markers like [SLOT_NAME], [DESCRIPTION_X], [DIALOGUE_X], [ACTION_X], [INTERNAL_X] in the text:
- These are ERRORS from the generation process
- You MUST either:
  a) Remove them completely if the text flows fine without them
  b) Replace them with appropriate brief content that fits the context
- DO NOT leave any [BRACKET_MARKERS] in the final text
- This is MANDATORY - scan the entire chapter for any remaining markers

Return the chapter with ONLY minor integration improvements. Preserve specialist expertise.`
  });

  registerPromptTemplate(PromptNames.EDITING_AGENT_REGENERATE, {
    systemPrompt: `You are a story architect regenerating chapters with structural issues. Follow the plan exactly while making text feel human-written, not AI-generated.`,
    userPrompt: `REGENERATE this chapter - it has major structural problems. Complete rewrite needed but FOLLOW THE PLAN exactly.

**🎯 MANDATORY PLAN ELEMENTS:**
- Moral Dilemma: {{moral_dilemma}}
- Character Complexity: {{character_complexity}}
- Consequences: {{consequences_of_choices}}
- Conflict Type: {{conflict_type}}
- Tension Level: {{tension_level}}/10

**📋 FULL CHAPTER PLAN:**
{{chapter_plan_text}}

**❌ PROBLEMS TO FIX:**
{{critique_notes}}

**📖 ORIGINAL (reference only):**
{{chapter_content_preview}}

**🔄 REGENERATION RULES:**
- Implement EVERY plan element (moral dilemma must be central)
- Fix all critique issues
- Keep same events/plot progression
- Show character complexity through contradictions
- Demonstrate consequences clearly
- Show don't tell, simple language, strong verbs

**🤖 ANTI-AI WRITING REQUIREMENTS:**
- No identical chapter openings (avoid structural templates)
- Mix emotions - not everything at maximum intensity
- Add mundane reality: hunger, fatigue, random thoughts
- Include imperfect dialogue: interruptions, mishearing, "um"
- Character notices something weird/unrelated to plot
- Avoid beautiful-for-beautiful's-sake descriptions
- Include awkward sentence breaks or trailing thoughts
- Characters sometimes say exactly what they don't mean
- Add physical discomforts or minor annoyances

**🚫 FORBIDDEN WORDS:** "obsidian" → "black stone", "thorn/thorne" → "spike", avoid "ethereal/crystalline/gossamer"

**🔧 CRITICAL: UNFILLED SLOT CLEANUP:**
If you see any unfilled markers like [SLOT_NAME], [DESCRIPTION_X], [DIALOGUE_X], [ACTION_X], [INTERNAL_X] in the original:
- These are ERRORS from the generation process
- You MUST NOT include them in your regeneration
- Replace them with proper content that fits the scene
- DO NOT leave any [BRACKET_MARKERS] in the final text

Generate completely rewritten chapter that follows plan perfectly and feels human-written.`
  });

  registerPromptTemplate(PromptNames.EDITING_AGENT_POLISH, {
    systemPrompt: `You are a master editor who makes text feel human-written while preserving its strengths. Perfect prose signals AI - add intentional human imperfections.`,
    userPrompt: `Polish this solid chapter with light improvements. Make it feel like a human writer crafted it, not AI.

**✨ POLISH FOCUS:**
- Verify plan elements are clear: {{moral_dilemma}} | {{character_complexity}} | {{consequences_of_choices}}
- Minor language improvements only
- Strengthen weak moments subtly
- Enhance rhythm and flow
- Ensure strong chapter ending

**🎨 SUBTLE IMPROVEMENTS:**
- Tighten verbose passages
- Vary sentence lengths for better rhythm
- Add concrete details where too abstract
- Improve dialogue naturalness (subtext, interruptions)
- Remove filter words ("she felt that...")
- Break up parallel patterns ("She X. She Y. She Z.")

**🤖 HUMANIZATION PRIORITIES:**
- Replace "perfect" emotional descriptions with messier reality
- Add small physical details (scratchy fabric, cold hands, growling stomach)
- Include one random thought unrelated to main plot
- Make one conversation slightly imperfect (mishearing, interruption)
- Add mundane environmental details (weather affecting mood)
- Include character noticing something weird but unimportant
- Break one sentence awkwardly or let thought trail off
- Replace one beautiful description with functional detail

**📊 MINOR ISSUES:**
{{critique_notes}}

**💫 POLISH PHILOSOPHY:**
Perfect prose is AI prose. Humans write with small imperfections:
- Occasional awkward sentence breaks
- Trailing thoughts that go nowhere
- Mundane details (weather, discomfort)
- Characters not always saying what they mean
- Real emotions mixed with contradictory feelings

**🚫 FORBIDDEN WORDS:** "obsidian" → "black stone", "thorn/thorne" → "spike", avoid "ethereal/crystalline/gossamer"

**📝 CONSTRAINTS:**
- Change <10% of text
- Preserve all good elements
- Add humanity without losing quality

**CHAPTER:**
{{chapter_content}}

**🔧 CRITICAL: UNFILLED SLOT CLEANUP:**
If you see any unfilled markers like [SLOT_NAME], [DESCRIPTION_X], [DIALOGUE_X], [ACTION_X], [INTERNAL_X] in the text:
- These are ERRORS from the generation process
- You MUST either:
  a) Remove them completely if the text flows fine without them
  b) Replace them with appropriate brief content that fits the context
- DO NOT leave any [BRACKET_MARKERS] in the final text
- This is MANDATORY - scan the entire chapter for any remaining markers

Return polished chapter that feels human-written, not AI-generated.`
  });

  registerPromptTemplate(PromptNames.EDITING_AGENT_EVALUATION, {
    systemPrompt: `You are a quality evaluator specializing in detecting AI-generated patterns and assessing human-like writing quality.`,
    userPrompt: `Evaluate this edited chapter for both quality and human-like writing. AI-generated text has telltale patterns that make it feel artificial.

**ORIGINAL LENGTH:** {{original_length}} characters
**REFINED LENGTH:** {{refined_length}} characters

**CHAPTER PLAN REQUIREMENTS:**
- Moral Dilemma: {{moral_dilemma}}
- Character Complexity: {{character_complexity}}

**REFINED CHAPTER (first 3000 chars):**
{{refined_chapter_preview}}

**EVALUATE (0-100 TOTAL):**

**1. PLAN ELEMENTS PRESENT (0-25 points):**
- Moral dilemma clearly shown and central to chapter
- Character complexity/contradictions demonstrated
- Consequences of choices visible

**2. PROSE QUALITY (0-25 points):**
- Show don't tell, economical language
- Strong verbs, minimal adverbs
- Varied sentence lengths and rhythms

**3. HUMAN-LIKE WRITING (0-25 points):**
- Does NOT feel AI-generated
- Includes mundane details/imperfections
- Natural dialogue with interruptions/subtext
- Characters have random thoughts/observations
- Emotional descriptions are nuanced, not extreme

**4. NARRATIVE EFFECTIVENESS (0-25 points):**
- Compelling pacing and flow
- Characters feel real and complex
- Chapter advances plot meaningfully

**🤖 AI PATTERN DEDUCTIONS (-5 each):**
- Identical structural patterns to other chapters
- Overly perfect/beautiful prose throughout
- All emotions at maximum intensity
- No mundane details or human imperfections
- Characters only think about plot-relevant things
- Dialogue too polished/literary
- Uses forbidden words (obsidian, thorn, ethereal, etc.)

**RESPOND WITH:**
- Quality Score: X/100
- Human-like Score: HUMAN/AI-LIKE/MIXED
- Major strengths (2-3 bullet points)
- Areas needing improvement (if any)
- AI patterns detected (if any)`
  });

  // Chapter writing prompt (large, separated into its own file)
  registerPromptTemplate(PromptNames.CHAPTER_WRITING, {
    systemPrompt: CHAPTER_WRITING_SYSTEM_PROMPT,
    userPrompt: CHAPTER_WRITING_USER_PROMPT
  });

  // 🚀 HYBRID MULTI-AGENT SYSTEM PROMPTS

  // Structure Agent - Creates chapter framework with slot markers
  registerPromptTemplate(PromptNames.STRUCTURE_AGENT, {
    systemPrompt: `You are a Structure Agent specialized in creating chapter frameworks. Your job is to create the structural skeleton of a chapter with clear slot markers for other specialist agents to fill.`,
    userPrompt: `Create the structural framework for Chapter {{chapter_number}}: "{{chapter_title}}"

**CHAPTER PLAN:**
{{chapter_plan_text}}

**STORY CONTEXT:**
{{story_outline}}

**PREVIOUS CHAPTER END:**
{{previous_chapter_end}}

**CHARACTERS:**
{{characters_json}}

**FRAMEWORK REQUIREMENTS:**

1. **OPENING HOOK** - Start with immediate engagement
2. **SCENE TRANSITIONS** - Clear structural shifts between scenes
3. **PACING CONTROL** - Balance action/reflection/dialogue sections
4. **CHAPTER ARC** - Clear beginning → development → climax/cliffhanger
5. **SLOT MARKERS** - Use these exact markers for other agents:
   - [DIALOGUE_X] - For dialogue sections (X = unique identifier)
   - [INTERNAL_X] - For internal monologue
   - [DESCRIPTION_X] - For environmental details
   - [ACTION_X] - For physical action
   - [TRANSITION_X] - For scene/time changes

**STRUCTURE OUTPUT FORMAT:**
Create a chapter framework with clear sections and slot markers. Example:

"The morning came with frost covering the windows. [DESCRIPTION_OPENING]

Marcus approached the door, his hand hesitating on the handle. [INTERNAL_HESITATION]

'Are you certain about this?' Elena asked. [DIALOGUE_QUESTION]

[ACTION_INTRUSION] The door burst open and soldiers poured in.

[TRANSITION_ESCAPE] Hours later, in the underground chamber..."

**CRITICAL RULES:**
- NO actual dialogue/descriptions - only frameworks and slot markers
- Focus on STRUCTURE and PACING, not content
- Address specific issues: {{target_issues}}
- Ensure {{conflict_type}} conflict drives the structure
- Target {{tension_level}}/10 tension progression

**📊 DESCRIPTION/ACTION BALANCE (follow exact proportions):**
- **Chapter Opening**: 20% description → 60% action → 20% dialogue
- **Action Scene**: 10% description → 80% action → 10% dialogue
- **Emotional Scene**: 40% description → 20% action → 40% dialogue
- **Information Reveal**: 30% description → 20% action → 50% dialogue
- **Climax**: 15% description → 70% action → 15% dialogue

**⚡ PACING RULES:**
- Action within first 2-3 paragraphs (NOT descriptions!)
- Vary sentence length: short for tension, long for reflection
- Alternate intensity: [Action] → [Breathing room] → [Emotion] → [Revelation]
- Max 2-3 description paragraphs in a row, then action/dialogue

**🎯 SPECIFIC PROBLEM FIXES:**
- **Dragged battle scenes**: Structure 80% action, minimal descriptions
- **Pacing jumps**: Smooth transitions between intensity sections + breathing room
- **Overloaded monologues**: Balance [INTERNAL_X] vs [ACTION_X] slots
- **Abstract endings**: Framework for concrete, specific conclusions
- **Information dumps**: NO major revelations without prior hints
- **Constant intensity**: Require breathing room after high-tension sections

**📚 INFORMATION REVEAL RULES:**
- **Major revelation**: Must have 2-3 hints in previous chapters
- **Character backstory**: Reveal in layers, not info dumps
- **World secrets**: Foreshadow before revealing
- **NO** sudden appearance of new important elements
- **Emotional weight**: Reader must care BEFORE the reveal

**⏰ PACING INTELLIGENCE:**
- **After intense action**: Force breathing room (quiet reflection/setup)
- **Before climax**: Build tension gradually, don't start at maximum
- **Emotional overload**: Prevent stacking trauma reactions
- **Chapter curve**: Rise → Peak → Cool down → Setup next

Return ONLY the structural framework with slot markers.`
  });

  // Character Agent - Fills dialogue and internal thoughts
  registerPromptTemplate(PromptNames.CHARACTER_AGENT, {
    systemPrompt: `You are a Character Agent specialized in creating authentic dialogue and deep internal psychology. You fill character-related slots with consistency and emotional truth.`,
    userPrompt: `Fill CHARACTER-related slots in this chapter framework for Chapter {{chapter_number}}: "{{chapter_title}}"

**FRAMEWORK TO FILL:**
{{structure_framework}}

**CHARACTER CONTEXT:**
{{characters_json}}

**STORY COHERENCE:**
{{coherence_context}}

**CHARACTER FILLING RULES:**

1. **[DIALOGUE_X] slots:**
   - Maintain CONSISTENT character names throughout
   - Each character has distinct voice/speech patterns
   - Include subtext, interruptions, natural speech rhythms
   - NO overly polished literary dialogue
   - Show character psychology through speech choices

2. **[INTERNAL_X] slots:**
   - Deep psychological authenticity
   - Internal contradictions and complexity
   - **CONTEXTUAL THOUGHTS**: Random thoughts ONLY during shock/dissociation
   - Show character growth and change
   - Avoid perfect emotional clarity

   **⚡ EMOTIONAL INTENSITY SCALE (choose appropriate level):**
   - **Minor surprise**: "paused", "hesitated", "frowned"
   - **Shock**: "breath caught", "went still", "eyes widened"
   - **Trauma**: "gasped", "recoiled", "world narrowed"
   - **DON'T** use trauma reactions for minor events!

   **🎭 RANDOM THOUGHTS (use sparingly!):**
   - ONLY during psychological shock/dissociation
   - Must be tonally appropriate to scene
   - Should reveal character state, not break immersion
   - Example: After trauma → mundane thought shows mental escape

**SPECIFIC QUALITY TARGETS:**
- **Name Consistency**: Use exact character names, never variations
- **Psychological Depth**: Show internal conflict, contradictions, growth
- **Natural Speech**: Imperfect, realistic dialogue with subtext
- **Emotional Truth**: Nuanced feelings, not extreme emotions

**CHARACTER STATES TO MAINTAIN:**
{{character_constraints}}

**FILL INSTRUCTIONS:**
- Replace ONLY [DIALOGUE_X] and [INTERNAL_X] markers
- Keep all other structure and markers intact
- Ensure character actions match established personalities
- Address psychological issues: {{target_psychological_issues}}

Return the framework with CHARACTER slots filled, all other slots intact.`
  });

  // Scene Agent - Provides descriptions and action content
  registerPromptTemplate(PromptNames.SCENE_AGENT, {
    systemPrompt: `You are a Scene Agent specialized in environmental descriptions and action sequences. You create vivid, concrete scenes without overwhelming detail.`,
    userPrompt: `Fill SCENE-related slots in this chapter framework for Chapter {{chapter_number}}: "{{chapter_title}}"

**FRAMEWORK TO FILL:**
{{character_filled_framework}}

**SCENE CONTEXT:**
World: {{world_name}}
Setting: {{primary_location}}
Time: {{time_context}}
Mood: {{emotional_tone}}

**WORLD CONSISTENCY RULES:**
{{world_consistency_rules}}

**ESTABLISHED WORLD ELEMENTS:**
- Technology Level: {{technology_level}}
- Magic System: {{magic_system_rules}}
- Tone/Genre: {{genre_requirements}}
- Physical Laws: {{physical_laws}}

**SCENE FILLING RULES:**

1. **[DESCRIPTION_X] slots:**
   - Concrete, specific environmental details
   - **SENSORY ECONOMY**: One dominant sense per scene (don't overload!)
   - Environmental elements that reflect character emotions
   - AVOID abstract/ethereal descriptions
   - **WORLD CONSISTENCY**: Only use technology/magic that fits established rules

   **🎯 SENSORY RULES (CONTEXTUAL):**
   - **High emotion scenes**: 1-2 sensory details max (focus on action)
   - **Calm/setup scenes**: 2-3 sensory details allowed for atmosphere
   - **NEVER**: smell + sound + touch + taste in same paragraph
   - **Context matters**: Sensory details must SERVE the scene purpose
   - **Dominant sense per EMOTIONAL state**: tension=hearing, trauma=physical, memory=smell

   **❌ AVOID SENSORY OVERLOAD:**
   - NO detailed room descriptions during action/dialogue
   - NO stacking multiple senses without narrative purpose
   - NO beautiful descriptions for their own sake

2. **[ACTION_X] slots:**
   - Clear, concrete physical actions
   - Active voice constructions ("she grabbed" not "was grabbed")
   - Specific movement and positioning
   - Immediate, visceral details
   - **WORLD CONSISTENCY**: Actions must follow established physical/magical laws

3. **[TRANSITION_X] slots:**
   - Smooth scene/time transitions
   - Maintain narrative flow
   - Bridge between different locations/moments
   - **WORLD CONSISTENCY**: Travel/movement follows world's transportation rules

**SPECIFIC QUALITY TARGETS:**
- **Concrete Finals**: Specific, clear action conclusions
- **Active Voice**: Strong verbs, clear subjects performing actions
- **Balanced Description**: Essential details, not overwhelming sensory overload
- **Pacing Service**: Descriptions that enhance, not slow, narrative flow
- **World Clarity**: NO mixed technology/magic without clear rules (fix "размытая картина мира")

**CRITICAL WORLD CONSISTENCY CHECKS:**
✅ **Technology Consistency**: If using tech (holographs, plasma rifles), stick to sci-fi
✅ **Magic Consistency**: If using magic (spells, barriers), stick to fantasy
✅ **Hybrid Rules**: If world mixes both, must follow established fusion rules
✅ **NO Contradiction**: Don't introduce elements that contradict established world
✅ **Genre Clarity**: Each scene should reinforce the world's core identity

**SCENE CONSTRAINTS:**
{{scene_constraints}}

**FILL INSTRUCTIONS:**
- Replace ONLY [DESCRIPTION_X], [ACTION_X], and [TRANSITION_X] markers
- Keep all dialogue and character content intact
- Ensure descriptions support chapter pacing: {{rhythm_pacing}}
- Address descriptive issues: {{target_description_issues}}

Return the framework with SCENE slots filled, preserving all character content.`
  });

  // Synthesis Agent - Integrates all specialist outputs
  registerPromptTemplate(PromptNames.SYNTHESIS_AGENT, {
    systemPrompt: `You are a Synthesis Agent responsible for seamlessly integrating content from Structure, Character, and Scene agents. Make MINIMAL changes - your job is integration, not rewriting.`,
    userPrompt: `Integrate the combined specialist outputs into a seamless chapter for Chapter {{chapter_number}}: "{{chapter_title}}"

**SPECIALIST OUTPUTS TO INTEGRATE:**
{{combined_content}}

**INTEGRATION TASKS:**

1. **Smooth Transitions**: Blend content where specialist outputs meet
2. **Flow Optimization**: Adjust paragraph breaks for better reading flow
3. **Pronoun Clarity**: Fix any unclear character references
4. **Consistency Check**: Ensure no contradictions between specialist content
5. **Final Polish**: Minor word choice improvements only
6. **🔧 STRUCTURAL ISSUES**: Fix completion problems and pacing
7. **🎯 NARRATIVE FOCUS**: Ensure clear conclusions and motivations
8. **📚 PLOT CLOSURE**: Address any unresolved elements within chapter

**STRICT LIMITATIONS:**
- Change MAXIMUM 5% of specialist content
- DO NOT rewrite dialogue, descriptions, or character thoughts
- DO NOT add new content - only smooth connections
- Preserve ALL specialist expertise and quality

**SYNTHESIS RULES:**
- Fix transition awkwardness between agent outputs
- Resolve any minor contradictions
- Ensure paragraph flow and structure
- Maintain active voice from Scene Agent
- Preserve character authenticity from Character Agent
- Keep structural pacing from Structure Agent

**FINAL QUALITY TARGETS:**
Address integration issues while preserving specialist quality:
- Character name consistency (Character Agent handled this)
- Balanced pacing (Structure Agent handled this)
- Concrete conclusions (Scene Agent handled this)
- Active constructions (Scene Agent handled this)
- Psychological depth (Character Agent handled this)

**🚨 CRITICAL FIXES FOR COMMON PROBLEMS:**

1. **Незавершённые диалоги**: Ensure ALL dialogue is complete, no placeholders left
2. **Избыточные описания**: Trim stacked sensory details (max 2 per paragraph)
3. **Повторяющиеся образы**: Remove duplicate metaphors/phrases
4. **Размытая картина мира**: Ensure technology/magic consistency throughout
5. **Затянутая боевая сцена**: Maintain dynamic pacing in action sequences
6. **Абстрактная концовка**: Make endings concrete and specific
7. **Неясная мотивация**: Clarify character and organizational motivations
8. **Скачки темпа**: Smooth pacing transitions between sections
9. **Перегруженность внутренними монологами**: Balance thought vs action
10. **Незакрытые сюжетные линии**: Address loose ends within chapter scope

**TARGET LENGTH:** {{target_length}} words

**📊 QUALITY METRICS CHECK (before return):**
□ Action starts within first 2-3 paragraphs?
□ Description takes < 20% of text?
□ Minimum one situation-changing event?
□ Sensory details are varied (not just visual)?
□ One dominant sense per scene?
□ Sentence lengths vary?
□ Max 2-3 description paragraphs in a row?
□ All dialogue complete (NO placeholders)?
□ Repetitive imagery removed?
□ Technology/magic consistency maintained?

**🚨 CONTEXTUAL INTELLIGENCE CHECK:**
□ Sensory details match scene intensity (high emotion = minimal senses)?
□ Emotional reactions appropriate to stimulus (no trauma response to minor events)?
□ Random thoughts only during shock/dissociation?
□ NO room descriptions during action scenes?
□ Information reveals have prior foreshadowing?
□ Breathing room after intense sections?
□ NO mechanical rule application without context?

**⚡ QUANTITATIVE TARGETS:**
- Description paragraphs in a row: max 3
- Words before first action: max 150
- Sensory details per paragraph: max 2 (max 1 in high-emotion scenes)
- Emotional intensity matches event severity
- Random thoughts: max 1 per chapter, only during dissociation

Return the fully integrated chapter with minimal changes to specialist content.`
  });
}