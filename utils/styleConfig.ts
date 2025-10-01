/**
 * Style and tone configuration for narrative voice and writing style
 */

import { StorySettings } from '../types';

export interface NarrativeVoiceConfig {
  name: string;
  description: string;
  guidelines: string;
  examples: string;
}

export const NARRATIVE_VOICES: Record<string, NarrativeVoiceConfig> = {
  'first-person': {
    name: "First Person",
    description: "Story told from 'I' perspective",
    guidelines: `
**FIRST PERSON GUIDELINES:**
- Use "I" for the protagonist's thoughts and actions
- Limited to protagonist's knowledge and perceptions
- Strong character voice is essential
- Internal thoughts flow naturally
- Can't know what others are thinking (unless told)
- More intimate and immediate
- Reader experiences everything through protagonist's filter`,
    examples: `"I stepped into the room, my heart pounding. The shadows seemed to move, but I couldn't be sure."`
  },
  
  'third-limited': {
    name: "Third Person Limited",
    description: "Story told from 'he/she' perspective, limited to one character's POV",
    guidelines: `
**THIRD PERSON LIMITED GUIDELINES:**
- Use "he/she/they" for the POV character
- Stay in one character's head per scene/chapter
- Can describe the character's appearance (unlike first person)
- Limited to what the POV character knows/perceives
- Thoughts can be shown directly or indirectly
- More flexibility than first person, still intimate
- Can switch POV between chapters if needed`,
    examples: `"Sarah stepped into the room, her heart pounding. The shadows seemed to move, but she couldn't be sure."`
  },
  
  'third-omniscient': {
    name: "Third Person Omniscient",
    description: "All-knowing narrator who can see into any character's mind",
    guidelines: `
**THIRD PERSON OMNISCIENT GUIDELINES:**
- Narrator knows everything about all characters
- Can reveal any character's thoughts and feelings
- Can provide information characters don't know
- Narrator can comment on events
- More distant but offers broader perspective
- Can foreshadow future events
- Requires careful handling to avoid head-hopping`,
    examples: `"Sarah stepped into the room, unaware that Marcus watched from the shadows, his hand on his weapon."`
  }
};

export interface ToneConfig {
  name: string;
  description: string;
  guidelines: string;
  vocabularyGuidance: string;
}

export const TONE_CONFIGS: Record<string, ToneConfig> = {
  dark: {
    name: "Dark",
    description: "Serious, grim, often dealing with difficult themes",
    guidelines: `
**DARK TONE GUIDELINES:**
- Use stark, visceral language
- Don't shy away from harsh realities
- Atmosphere should feel oppressive or tense
- Humor, if present, is bitter or ironic
- Endings may be ambiguous or tragic
- Focus on consequences and moral complexity`,
    vocabularyGuidance: "Use words like: shadow, cold, harsh, bitter, void, decay, fracture"
  },
  
  humorous: {
    name: "Humorous",
    description: "Light, funny, entertaining",
    guidelines: `
**HUMOROUS TONE GUIDELINES:**
- Use wit, wordplay, and comedic timing
- Characters can be self-aware or absurd
- Situations can be exaggerated for effect
- Dialogue should sparkle with banter
- Even serious moments can have levity
- Timing is everything - setup and payoff`,
    vocabularyGuidance: "Use playful language, unexpected comparisons, witty observations"
  },
  
  serious: {
    name: "Serious",
    description: "Thoughtful, earnest, grounded",
    guidelines: `
**SERIOUS TONE GUIDELINES:**
- Treat subject matter with gravity
- Characters face real consequences
- Avoid melodrama or camp
- Emotional moments are earned, not manipulated
- Focus on authentic human experiences
- Can have hope without being light`,
    vocabularyGuidance: "Use precise, considered language; avoid flippancy"
  },
  
  epic: {
    name: "Epic",
    description: "Grand, sweeping, larger-than-life",
    guidelines: `
**EPIC TONE GUIDELINES:**
- Large stakes, world-changing events
- Elevated, sometimes formal language
- Scope spans time and space
- Multiple storylines and perspectives
- Sense of history and destiny
- Moments of grandeur and spectacle`,
    vocabularyGuidance: "Use powerful, evocative language; grand imagery"
  },
  
  intimate: {
    name: "Intimate",
    description: "Personal, emotional, character-focused",
    guidelines: `
**INTIMATE TONE GUIDELINES:**
- Focus on internal experiences
- Small, personal moments matter
- Emotional honesty is key
- Quiet observations carry weight
- Relationships are central
- Vulnerability is strength`,
    vocabularyGuidance: "Use precise emotional language; focus on sensory details"
  }
};

export function getStylePrompt(settings: StorySettings): string {
  let prompt = "";
  
  // CRITICAL: Add forbidden words and anti-LLM rules FIRST
  prompt += `
### FORBIDDEN WORDS (NEVER USE):
**BANNED OVERUSED LLM WORDS:**
- obsidian (and ALL derivatives: obsidian-like, obsidian's, etc.) → use "black stone" / "dark walls" / "stone" / "dark rock"
- crystalline → just describe the moment
- gossamer → use concrete fabric names or "thin"
- eldritch → use "strange" / "ancient" / "wrong"
- ephemeral → use "brief" / "fleeting" / "short"
- confluence → use "meeting" / "joining"
- dichotomy → use "split" / "division" / "contrast"
- juxtaposition → just show the contrast
- paradigm → use "model" / "pattern" / "way"
- ethereal → use "faint" / "pale" / "ghostly"
- luminescent → use "glowing" / "bright" / "lit"
- tendrils (of shadow/darkness) → use "shadows" / "dark shapes"
- tapestry (metaphorical) → be specific
- symphony (metaphorical) → be specific
- dance (of shadows/light) → just describe movement
- thorn / thorne (and ALL variations) → use "spike" / "sharp point" / "barb" / be specific

### CORE WRITING RULES:
1. **SIMPLIFY RUTHLESSLY:**
   - Cut 70-80% of adjectives
   - Replace metaphors with concrete actions
   - Break complex sentences into simple ones
   - Add plain sentences: "She walked in." "It was cold." "He waited."

2. **DESTROY REPETITIVE PATTERNS:**
   - NEVER: "for one [adjective] moment" → just show the moment
   - NEVER: "not X, but Y" → pick one or rephrase
   - NEVER: Triple modifiers ("terrible, terrifying, profound") → single word
   - NEVER: "something [adjective]" → be specific or admit ignorance
   - Use "said" more than "whispered/murmured"
   - AVOID: "pressed in", "clung to", "like a physical blow"

3. **SHOW THROUGH ACTIONS:**
   - Instead of: "Terror filled her" → "Her hand missed the doorknob twice"
   - Instead of: "He was exhausted" → "He sat without taking off his coat"

4. **CREATE UNEVENNESS:**
   - Alternate long and short paragraphs
   - Include boring moments: waiting, routine, mundane details
   - Vary rhythm: drama → pause → drama
   - Not every sentence needs to be beautiful

5. **ADD RANDOMNESS:**
   - Insignificant details (crack in wall, sound outside)
   - Awkward dialogue with pauses, repetitions, unfinished thoughts
   - Irrational character actions
   - Details that don't serve the plot

6. **MAKE ABSTRACTIONS CONCRETE:**
   - Instead of: "cold sensation spreading" → "Her fingers went numb. She couldn't feel the knife."
   - Instead of: "pressure building around her" → "The air tasted like copper. Her ears popped."

7. **COMPLICATE MORALITY:**
   - Remove convenient justifications
   - Give victims specific traits, histories, last words
   - Show doubt BEFORE action, not after
   - Don't decide for reader who's right

8. **UNDERMINE CERTAINTY:**
   - Show contradictions in visions
   - Character doubts their own interpretations
   - Other characters see different things

**REMEMBER:** Not every sentence should be literary. Good prose breathes. Don't fear being boring. Trust the reader.

`;
  
  // Add narrative voice guidelines
  if (settings.narrativeVoice) {
    const voiceConfig = NARRATIVE_VOICES[settings.narrativeVoice];
    if (voiceConfig) {
      prompt += `\n**NARRATIVE VOICE: ${voiceConfig.name}**\n${voiceConfig.guidelines}\n`;
    }
  }
  
  // Add tone guidelines
  if (settings.tone) {
    const toneConfig = TONE_CONFIGS[settings.tone];
    if (toneConfig) {
      prompt += `\n**TONE: ${toneConfig.name}**\n${toneConfig.guidelines}\n${toneConfig.vocabularyGuidance}\n`;
    }
  }
  
  // Add target audience considerations
  if (settings.targetAudience) {
    prompt += `\n**TARGET AUDIENCE: ${settings.targetAudience}**\n`;
    
    if (settings.targetAudience === 'YA') {
      prompt += `- Protagonist typically 15-18 years old
- Coming-of-age themes
- Voice should feel authentic to teens
- Can tackle serious issues but with hope
- Pacing tends to be faster\n`;
    } else if (settings.targetAudience === 'adult') {
      prompt += `- More complex themes and moral ambiguity
- Can explore darker subject matter
- Characters face adult consequences
- Pacing can vary based on story needs\n`;
    }
  }
  
  // Add writing style guidance
  if (settings.writingStyle) {
    prompt += `\n**WRITING STYLE: ${settings.writingStyle}**\n`;
    
    switch (settings.writingStyle) {
      case 'descriptive':
        prompt += `- Rich sensory details
- Vivid imagery and atmosphere
- Take time to paint scenes
- Balance description with action\n`;
        break;
      case 'minimalist':
        prompt += `- Spare, economical prose
- Every word must earn its place
- Implication over explanation
- Short sentences, concrete details\n`;
        break;
      case 'lyrical':
        prompt += `- Poetic, musical language
- Attention to rhythm and sound
- Metaphor and imagery
- Beauty in the prose itself\n`;
        break;
      case 'fast-paced':
        prompt += `- Short sentences and paragraphs
- Focus on action and dialogue
- Minimal description
- Keep momentum high\n`;
        break;
    }
  }
  
  return prompt;
}

export function getNarrativeVoiceList(): string[] {
  return Object.keys(NARRATIVE_VOICES);
}

export function getToneList(): string[] {
  return Object.keys(TONE_CONFIGS);
}
