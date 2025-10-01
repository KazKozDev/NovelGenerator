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
