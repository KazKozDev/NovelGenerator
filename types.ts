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
  FinalizingTransitions = "Finalizing Chapter Transitions & Openings...",
  CompilingBook = "Compiling Final Book...",
  Done = "Book Generation Complete!",
  Error = "An Error Occurred"
}

// Detailed scene structure for comprehensive chapter planning
export interface DetailedScene {
  sceneId: string; // Unique identifier for the scene
  location: string; // Where the scene takes place
  participants: string[]; // Characters involved in this scene
  objective: string; // What the scene is trying to accomplish
  conflict: string; // Main tension or obstacle in the scene
  outcome: string; // How the scene resolves
  duration: string; // Estimated time span (e.g., "10 minutes", "several hours")
  mood: string; // Emotional atmosphere of the scene
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

// Story settings for genre, tone, and narrative style
export interface StorySettings {
  genre?: string;
  narrativeVoice?: string;
  tone?: string;
  targetAudience?: string;
  writingStyle?: string;
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
