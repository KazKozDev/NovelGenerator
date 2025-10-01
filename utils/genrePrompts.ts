/**
 * Genre-specific prompts and guidelines for different types of stories
 */

export interface GenreConfig {
  name: string;
  description: string;
  focusAreas: string[];
  writingGuidelines: string;
  commonPitfalls: string;
  exampleAuthors?: string[];
}

export const GENRE_CONFIGS: Record<string, GenreConfig> = {
  fantasy: {
    name: "Fantasy",
    description: "Epic fantasy, urban fantasy, magical realism",
    focusAreas: [
      "World-building and magic systems",
      "Consistent magical rules",
      "Rich descriptive language",
      "Epic scope and stakes",
      "Character growth through trials"
    ],
    writingGuidelines: `
**FANTASY-SPECIFIC GUIDELINES:**
1. **Magic System Consistency:** Establish clear rules for magic and never break them. Magic should have costs and limitations.
2. **World-Building Integration:** Weave world details naturally through action and dialogue, not info-dumps.
3. **Sensory Richness:** Fantasy worlds need vivid sensory details - sights, sounds, smells of this new world.
4. **Stakes and Scope:** Fantasy often deals with world-ending threats. Make the stakes feel real and personal.
5. **Character Agency:** Heroes should solve problems through their own choices and growth, not deus ex machina.
6. **Cultural Depth:** Different races/cultures should have distinct customs, values, and speech patterns.

**AVOID:**
- Info-dumping about magic systems or history
- Inconsistent magic rules
- Generic medieval European settings without unique elements
- Prophecies that remove character agency
- Overpowered protagonists without meaningful challenges`,
    commonPitfalls: "Info-dumps, inconsistent magic, generic settings, chosen one clichés",
    exampleAuthors: ["Brandon Sanderson", "N.K. Jemisin", "Patrick Rothfuss"]
  },

  scifi: {
    name: "Science Fiction",
    description: "Hard sci-fi, space opera, cyberpunk, dystopian",
    focusAreas: [
      "Technological consistency",
      "Scientific plausibility",
      "Social/philosophical implications",
      "Future world-building",
      "Human condition in new contexts"
    ],
    writingGuidelines: `
**SCI-FI-SPECIFIC GUIDELINES:**
1. **Tech Consistency:** Establish technology rules early and maintain them. Tech should have logical limitations.
2. **Show, Don't Explain:** Demonstrate how technology works through use, not technical manuals.
3. **Human Element:** Focus on how technology affects people, relationships, society - not just the tech itself.
4. **Plausibility:** Even in far-future settings, maintain internal logic and scientific grounding.
5. **Social Implications:** Explore how technological changes affect culture, politics, ethics.
6. **Avoid Technobabble:** Use technical terms sparingly and only when they serve the story.

**AVOID:**
- Long technical explanations that stop the story
- Technology that solves every problem (deus ex machina)
- Ignoring the social impact of technological changes
- Inconsistent tech capabilities
- Characters who are just mouthpieces for ideas`,
    commonPitfalls: "Technobabble, inconsistent tech, ignoring human element, info-dumps",
    exampleAuthors: ["Ursula K. Le Guin", "Ted Chiang", "Ann Leckie"]
  },

  thriller: {
    name: "Thriller/Mystery",
    description: "Suspense, mystery, crime, psychological thriller",
    focusAreas: [
      "Pacing and tension",
      "Clues and red herrings",
      "Suspense building",
      "Plot twists",
      "Character psychology"
    ],
    writingGuidelines: `
**THRILLER-SPECIFIC GUIDELINES:**
1. **Constant Tension:** Every scene should increase stakes or reveal new complications. No filler.
2. **Fair Play:** Plant clues that readers can theoretically solve the mystery, but make them subtle.
3. **Pacing Control:** Alternate between high-tension scenes and brief breathing room. Build to climax.
4. **Ticking Clock:** Use time pressure to increase urgency. Deadlines create tension.
5. **Unreliable Information:** Characters (including POV) can be wrong or lie. Keep readers guessing.
6. **Payoff Setup:** Every twist should be surprising yet inevitable in hindsight.

**AVOID:**
- Slow starts (hook readers immediately)
- Convenient coincidences that solve problems
- Twists that come from nowhere (no setup)
- Explaining the mystery too early
- Protagonists who are passive observers`,
    commonPitfalls: "Slow pacing, unearned twists, passive protagonists, convenient solutions",
    exampleAuthors: ["Gillian Flynn", "Tana French", "Lee Child"]
  },

  romance: {
    name: "Romance",
    description: "Contemporary romance, historical romance, romantic comedy",
    focusAreas: [
      "Emotional depth",
      "Character chemistry",
      "Relationship development",
      "Internal conflict",
      "Satisfying resolution"
    ],
    writingGuidelines: `
**ROMANCE-SPECIFIC GUIDELINES:**
1. **Emotional Honesty:** Show vulnerability, fear, desire authentically. Romance lives in emotional truth.
2. **Chemistry Through Action:** Show attraction through body language, dialogue subtext, and reactions.
3. **Internal Conflict:** The biggest obstacles should be internal (fear, past trauma, beliefs) not just external.
4. **Earned Intimacy:** Build emotional connection before physical. Make readers root for the couple.
5. **Distinct Voices:** Each love interest should have a unique personality, goals, and way of speaking.
6. **Satisfying Arc:** Both characters should grow and change through the relationship.

**AVOID:**
- Insta-love without foundation
- Miscommunication as the only conflict
- Toxic behaviors portrayed as romantic
- One character "fixing" the other
- Telling us they're in love instead of showing it`,
    commonPitfalls: "Insta-love, miscommunication plots, toxic dynamics, telling not showing",
    exampleAuthors: ["Talia Hibbert", "Courtney Milan", "Casey McQuiston"]
  },

  horror: {
    name: "Horror",
    description: "Psychological horror, supernatural horror, gothic",
    focusAreas: [
      "Atmosphere and dread",
      "Psychological tension",
      "The unknown/unseen",
      "Character vulnerability",
      "Visceral reactions"
    ],
    writingGuidelines: `
**HORROR-SPECIFIC GUIDELINES:**
1. **Atmosphere First:** Build dread through setting, sensory details, and mood before showing the threat.
2. **Less is More:** The unseen/unknown is scarier than explicit gore. Suggest rather than show.
3. **Psychological Depth:** Horror works best when it taps into primal fears and psychological vulnerability.
4. **Pacing Variation:** Alternate between quiet dread and shock moments. Constant intensity numbs readers.
5. **Character Investment:** Readers must care about characters to fear for them. Build empathy first.
6. **Sensory Horror:** Use all senses - sounds, smells, textures can be more disturbing than sights.

**AVOID:**
- Relying only on gore/shock value
- Showing the monster too early or too much
- Characters making stupid decisions just to advance plot
- Explaining away the horror (mystery is scarier)
- Constant jump scares (they lose impact)`,
    commonPitfalls: "Over-explaining, showing too much, stupid character decisions, constant shock",
    exampleAuthors: ["Shirley Jackson", "Stephen King", "Carmen Maria Machado"]
  },

  literary: {
    name: "Literary Fiction",
    description: "Character-driven, literary, contemporary fiction",
    focusAreas: [
      "Prose quality",
      "Character depth",
      "Thematic exploration",
      "Subtle storytelling",
      "Emotional resonance"
    ],
    writingGuidelines: `
**LITERARY-SPECIFIC GUIDELINES:**
1. **Prose as Art:** Every sentence should be crafted. Word choice, rhythm, and sound matter.
2. **Character Over Plot:** Focus on internal journeys, psychological depth, and character revelation.
3. **Subtlety and Nuance:** Trust readers to understand implications. Leave space for interpretation.
4. **Thematic Depth:** Explore complex themes through character and situation, not explicit statements.
5. **Emotional Truth:** Prioritize authentic emotional experiences over dramatic events.
6. **Ambiguity:** Not everything needs resolution. Life is messy; fiction can be too.

**AVOID:**
- Plot-driven action at expense of character
- Explaining themes explicitly
- Neat, tidy resolutions to complex problems
- Melodrama or sentimentality
- Prioritizing "what happens" over "what it means"`,
    commonPitfalls: "Over-explaining, melodrama, neat resolutions, prioritizing plot over character",
    exampleAuthors: ["Kazuo Ishiguro", "Celeste Ng", "Ocean Vuong"]
  }
};

export function getGenreGuidelines(genre: string): string {
  const config = GENRE_CONFIGS[genre.toLowerCase()];
  if (!config) {
    return ""; // Return empty string for unknown genres, use default guidelines
  }

  return `
**GENRE: ${config.name.toUpperCase()}**

${config.writingGuidelines}

**FOCUS AREAS FOR THIS GENRE:**
${config.focusAreas.map(area => `- ${area}`).join('\n')}

**COMMON PITFALLS TO AVOID:**
${config.commonPitfalls}
`;
}

export function getGenreList(): string[] {
  return Object.keys(GENRE_CONFIGS);
}

export function getGenreDescription(genre: string): string {
  const config = GENRE_CONFIGS[genre.toLowerCase()];
  return config ? config.description : "General fiction";
}
