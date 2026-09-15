export interface Character {
  name: string;
  description: string;
  first_appearance: number; // Chapter number
  status: string; // e.g., alive, injured, unknown
  development: Array<{ chapter: number; description: string }>;
  relationships: Record<string, string>; // e.g., { "CharacterName": "Ally" }
  relationships_text?: string; // For storing raw text from LLM if needed
  location: string; // Last known location
  emotional_state: string;
  /**
   * What this character cannot do and what they will not do — the two together, because on the page
   * they fail the same way. A reviewer of a finished book listed them in one breath: an ordinary man
   * tearing an invulnerable one's suit with his fingers, human teeth leaving a mark that lasts days,
   * a man who does not kill using a living person to stop a rifle, and a character too badly hurt to
   * drive taking the wheel two paragraphs after the prose said he could not.
   *
   * Physical and standing both: "cannot lift more than a strong man can", "will not kill, and will
   * not let a death happen to buy himself an advantage". The prose may break one only by paying for
   * it on the page — a stated cost, a changed condition, a choice the character makes and answers
   * for. Breaking one silently is the defect.
   */
  limits?: string[];
  /**
   * What this person hides, as a short noun phrase in the manuscript language
   * ("делец синдиката", "сын короля"). Nobody speaks it aloud until
   * revealChapter; a book planned before the field existed exposes nothing.
   */
  secret?: string;
  /** First chapter where the book exposes secret; the check sleeps from there on. */
  revealChapter?: number;
}

export enum ChapterGenerationStage {
  NotStarted = "not_started",
  StructureGeneration = "structure_generation",
  CharacterGeneration = "character_generation", 
  SceneGeneration = "scene_generation",
  Synthesis = "synthesis",
  FirstDraft = "first_draft",
  LightPolish = "light_polish",
  ConsistencyCheck = "consistency_check",
  FinalDraft = "final_draft",
  Complete = "complete"
}

export interface ChapterData {
  title?: string; 
  content: string;
  summary?: string;
  timelineEntry?: string; // Raw text from LLM for timeline
  emotionalArcEntry?: string; // Raw text from LLM for emotional arc
  plan?: string; // Individual chapter plan
  /** Measured prose texture of the shown revision, and what the measurements said about it. */
  texture?: {
    dialogueShare: number;
    medianParagraphWords: number;
    similesPer1000?: number;
    taggedSpeechShare?: number;
    findings: { id: string; description: string }[];
  };
  // Extended analysis metrics
  pacingScore?: number; // 1-10
  dialogueRatio?: number; // 0-100%
  wordCount?: number;
  keyEvents?: string[];
  characterMoments?: string[];
  foreshadowing?: string[];
  // Generation progress tracking
  generationStage?: ChapterGenerationStage;
  draftVersions?: {
    stage: ChapterGenerationStage;
    content: string;
    timestamp: number;
  }[];
  lastSavedAt?: number; // Unix timestamp
}

export enum GenerationStep {
  Idle = "Idle",
  UserInput = "Waiting for User Input",
  GeneratingOutline = "Generating Story Outline...",
  WaitingForOutlineApproval = "Waiting for Outline Approval",
  ExtractingCharacters = "Extracting Characters from Outline...",
  ExtractingWorldName = "Extracting World Name from Outline...",
  ExtractingMotifs = "Extracting Recurring Motifs from Outline...",
  GeneratingChapterPlan = "Generating Detailed Chapter-by-Chapter Plan...",
  GeneratingChapters = "Generating Chapters...",
  FinalEditingPass = "Final Editing Pass - Polishing All Chapters...",
  ProfessionalPolish = "Professional Polish - Final Refinement...",
  FinalizingTransitions = "Final Book Review...",
  CompilingBook = "Compiling Final Book...",
  Done = "Book Generation Complete!",
  Error = "An Error Occurred"
}

// Detailed scene structure for comprehensive chapter planning
export interface LegacyDetailedSceneFields {
  /** @deprecated Checkpoint compatibility only; current plans do not produce these fields. */
  duration?: string;
  /** @deprecated Checkpoint compatibility only; current plans do not produce these fields. */
  mood?: string;
  /** @deprecated Checkpoint compatibility only; current plans use staging and accepted canon. */
  initialState?: string;
  /** @deprecated Checkpoint compatibility only; current plans use keyMoments and shift. */
  characterDecisions?: string[];
  /** @deprecated Checkpoint compatibility only; current plans use outcome. */
  consequenceForNextScene?: string;
  /** @deprecated Checkpoint compatibility only; current plans use accepted canon and staging. */
  continuityRequirements?: string[];
  /** @deprecated Checkpoint compatibility only; current plans use keyMoments. */
  informationRevealed?: string[];
  /** @deprecated Checkpoint compatibility only; current plans use scheduled promises. */
  informationWithheld?: string[];
  /** @deprecated Checkpoint compatibility only; current plans use shift. */
  emotionalDelta?: string;
  /** @deprecated Checkpoint compatibility only; current plans use conflict and outcomeType. */
  prohibitedShortcuts?: string[];
  /** @deprecated Checkpoint compatibility only; current plans use outcome and chapter ending. */
  exitHook?: string;
}

export interface DetailedScene extends LegacyDetailedSceneFields {
  sceneId: string; // Unique identifier for the scene
  location: string; // Where the scene takes place
  participants: string[]; // Characters involved in this scene
  objective: string; // What the scene is trying to accomplish
  conflict: string; // Main tension or obstacle in the scene
  outcome: string; // How the scene resolves
  narrativeWeight?: number; // Relative page space (1–5), not elapsed story time
  /** How the scene's conflict reaches the page. 'speech' obliges the prose to dramatize it in direct speech. */
  conflictCarriedBy?: 'speech' | 'action' | 'solitude';
  /**
   * Distinct dramatic shape of the scene. One of SCENE_SHAPES in utils/novel/diversity.ts
   * (confrontation, negotiation, investigation, discovery, confession, pursuit, escape, preparation,
   * aftermath, reflection); the plan validator normalizes near misses and rejects anything else.
   */
  sceneShape?: string;
  /**
   * What this scene moves, declared before it is written and verified against the prose afterwards:
   * the register that changes, the state it changes from and the state it changes to.
   */
  shift?: { register: 'knowledge' | 'resource' | 'relationship' | 'initiative' | 'position'; from: string; to: string };
  /**
   * How the scene's attempt ends: won at a cost, lost and made worse, or won outright. A chapter is
   * allowed at most one 'clean', because a scene that costs nothing leaves the next one nothing.
   */
  outcomeType?: 'costly-success' | 'setback' | 'clean';
  /**
   * Whose eyes the scene is seen through. In a limited narrative voice one scene has one viewpoint,
   * and the place a generated chapter loses it is inside a scene rather than at a scene break: a
   * finished book spent a page in one character's kitchen and then, with no break and no name,
   * continued in another character's body — with the pronoun pointing at the wrong man.
   * Declared here so the writer is told whose scene it is, and so a reviewer can be asked a question
   * with an answer instead of being asked to notice.
   */
  pov?: string;
  /** Binding fresh-idea constraint for this scene (genre mix, setting card, ban). */
  freshConstraint?: string;
  /** One-line staging: positions, key objects within reach, and the physical conditions constraining action as the scene opens. */
  staging?: string;
  keyMoments: string[]; // Specific beats or events within the scene
}

// Specific events that drive the narrative forward
export interface ChapterEvent {
  eventId: string; // Unique identifier
  eventType: 'dialogue' | 'action' | 'revelation' | 'conflict' | 'internal' | 'transition';
  description: string; // What happens in this event
  participants: string[]; // Who is involved
  consequences: string[]; // What this event leads to
  emotionalImpact: number; // 1-10 scale of emotional intensity
  plotSignificance: string; // How this advances the overall story
  sceneId?: string; // Which scene this event belongs to
}

// Planned dialogue moments with subtext and purpose
export interface DialogueBeat {
  beatId: string; // Unique identifier
  purpose: string; // What this dialogue accomplishes
  participants: string[]; // Who is speaking
  subtext: string; // What's really being communicated beneath the words
  revelations: string[]; // Information revealed through this dialogue
  tensions: string[]; // Conflicts or tensions exposed
  emotionalShifts: string[]; // How characters' feelings change
  sceneId?: string; // Which scene this belongs to
}

// Character emotional journey through the chapter
export interface CharacterEmotionalArc {
  character: string; // Character name
  startState: string; // Emotional state at chapter beginning
  keyMoments: string[]; // Specific moments that affect this character
  endState: string; // Emotional state at chapter end
  internalConflicts: string[]; // Inner struggles the character faces
  growth: string; // How the character changes or develops
  relationships: string; // How relationships with other characters evolve (comma-separated list)
}

// Action sequences and physical events
export interface ActionSequence {
  sequenceId: string; // Unique identifier
  description: string; // What physical action occurs
  participants: string[]; // Who is involved in the action
  stakes: string; // What's at risk during this action
  outcome: string; // How the action resolves
  pacing: 'slow' | 'medium' | 'fast' | 'frantic'; // Speed of the action
  sceneId?: string; // Which scene this belongs to
}

// For storing chapter plan parsed from the main chapter plan blob
export interface ParsedChapterPlan {
  title: string;
  summary: string;
  sceneBreakdown: string; // Could be more structured
  characterDevelopmentFocus: string;
  plotAdvancement: string;
  timelineIndicators: string;
  emotionalToneTension: string;
  connectionToNextChapter: string;
  conflictType?: string; // Type of conflict: external, internal, interpersonal, or societal
  tensionLevel?: number; // Tension level from 1-10
  rhythmPacing?: string; // Chapter pacing: fast, medium, or slow
  wordEconomyFocus?: string; // Economy focus: dialogue-heavy, action-focused, or atmosphere-light
  moralDilemma?: string; // The moral dilemma or ethical question this chapter explores
  characterComplexity?: string; // How this chapter reveals character contradictions and depths
  consequencesOfChoices?: string; // Consequences of decisions made in this chapter
  primaryLocation?: string; // Primary location where the chapter takes place

  // EXPANDED DETAILED PLANNING
  detailedScenes?: DetailedScene[]; // 3-5 detailed scenes that make up the chapter
  chapterEvents?: ChapterEvent[]; // Specific events that drive the narrative
  dialogueBeats?: DialogueBeat[]; // Planned dialogue moments with purpose and subtext
  characterArcs?: CharacterEmotionalArc[]; // Emotional journeys for each character
  actionSequences?: ActionSequence[]; // Physical action and movement sequences

  /**
   * What the validator had to put right in this plan before accepting it. A plan is refused where it
   * is wrong about the book — a person not in the cast, a promise paid before it is set up — and put
   * right where it merely contradicts itself in a way only one field can be wrong about. Recorded so
   * a correction is never silent.
   */
  normalizations?: string[];

  // PACING AND STRUCTURE
  targetWordCount?: number; // Estimated length for this chapter
  sceneTransitions?: string[]; // How scenes connect and flow into each other
  climaxMoment?: string; // The peak emotional/tension moment of the chapter
  openingHook?: string; // How the chapter begins to engage readers
  chapterEnding?: string; // How the chapter concludes and leads to the next

  // THEMATIC ELEMENTS
  symbolism?: string[]; // Symbolic elements to weave through the chapter
  foreshadowing?: string[]; // Elements that hint at future events
  callbacks?: string[]; // References to earlier events or chapters

  // TECHNICAL REQUIREMENTS
  requiredSlots?: number; // Minimum number of content slots needed
  complexityLevel?: 'simple' | 'moderate' | 'complex' | 'intricate'; // Chapter complexity
  generationPriority?: 'standard' | 'high' | 'critical'; // How much attention this chapter needs
}

// Added for structured post-chapter analysis
export interface TimelineEntry {
  timeElapsed: string;
  endTimeOfChapter: string;
  specificMarkers: string;
}

export interface EmotionalArcEntry {
  primaryEmotion: string;
  tensionLevel: number | string;
  unresolvedHook: string;
}

export type GenerationSpeedMode = 'fast' | 'thorough';
export type ChapterMode = 'full' | 'scene';

// Story settings for genre, tone, and narrative style
export interface StorySettings {
  tense?: 'past' | 'present';
  ending?: 'closed' | 'open' | 'series';
  targetWordsPerChapter?: number;
  genre?: string;
  narrativeVoice?: string;
  tone?: string;
  targetAudience?: string;
  writingStyle?: string;
  generationSpeedMode?: GenerationSpeedMode;
  chapterMode?: ChapterMode;
  skipEditing?: boolean;
  forwardOnly?: boolean;
}

// Agent activity log for UI display
export interface AgentLogEntry {
  timestamp: number;
  chapterNumber: number;
  type: 'decision' | 'execution' | 'evaluation' | 'iteration' | 'warning' | 'success' | 'diff';
  message: string;
  details?: any;
  // For diff visualization
  beforeText?: string;
  afterText?: string;
  strategy?: string;
}

export type LLMProviderType = 'gemini' | 'ollama';

export interface LLMProviderConfig {
  provider: LLMProviderType;
  ollamaEndpoint: string;
  ollamaModel: string;
  /** Gemini model ID typed by the author (e.g. gemini-2.5-flash). Absent means the built-in default. */
  geminiModel?: string;
  /**
   * Reasoning trace for the prose writer only. Structured validator calls run
   * under a tight output cap that reasoning would spend before the answer, so
   * the generator forces thinking off on that route regardless of this flag.
   */
  think?: boolean;
}
