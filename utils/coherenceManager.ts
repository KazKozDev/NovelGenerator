/**
 * Coherence Management System
 * Central system for maintaining story consistency across chapters
 */

import { Character, ChapterData, ParsedChapterPlan } from '../types';

// =================== CORE INTERFACES ===================

export interface RepetitionIssue {
  phrase: string;
  category: 'metaphors' | 'sensoryDescriptions' | 'emotionalPhrases' | 'characterActions' | 'worldDescriptions';
  currentChapter: number;
  previousUsage: number[];
  severity: 'low' | 'medium' | 'high';
}

export interface RepetitionReport {
  chapterNumber: number;
  issues: RepetitionIssue[];
  totalRepetitions: number;
  severity: 'low' | 'medium' | 'high';
}

export interface RepetitionConstraints {
  avoidPhrases: string[];
  maxSimilarMetaphors: number;
  maxSensoryOverload: number;
  guidelines: string[];
}

export interface LocationState {
  name: string;
  description: string;
  currentOccupants: string[];
  politicalControl?: string;
  securityLevel: 'safe' | 'neutral' | 'dangerous' | 'hostile';
  lastVisited?: number; // chapter number
  changes: LocationChange[];
}

export interface LocationChange {
  chapter: number;
  description: string;
  type: 'damage' | 'improvement' | 'occupation' | 'abandonment' | 'discovery';
}

export interface RelationshipStatus {
  currentStatus: 'ally' | 'enemy' | 'neutral' | 'unknown' | 'complicated';
  trustLevel: number; // -10 to 10
  emotionalBond: 'none' | 'weak' | 'moderate' | 'strong' | 'unbreakable';
  sharedSecrets: string[];
  lastInteraction?: number; // chapter number
  history: RelationshipEvent[];
}

export interface RelationshipEvent {
  chapter: number;
  event: string;
  impact: 'positive' | 'negative' | 'neutral';
  trustChange: number;
}

export interface EmotionalProfile {
  primaryEmotion: string;
  secondaryEmotions: string[];
  emotionalArc: EmotionalArcPoint[];
  traumaMarkers: TraumaMarker[];
  copingMechanisms: string[];
}

export interface EmotionalArcPoint {
  chapter: number;
  emotion: string;
  intensity: number; // 1-10
  trigger: string;
}

export interface TraumaMarker {
  chapter: number;
  event: string;
  severity: 'minor' | 'moderate' | 'severe' | 'life-changing';
  currentImpact: 'resolved' | 'processing' | 'suppressed' | 'active';
}

export interface Objective {
  goal: string;
  motivation: string;
  urgency: number; // 1-10
  obstacles: string[];
  progress: 'not-started' | 'in-progress' | 'near-completion' | 'completed' | 'failed';
  establishedInChapter: number;
}

export interface PlotThread {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'paused' | 'resolved' | 'abandoned';
  priority: 'primary' | 'secondary' | 'background';
  nextMilestone: PlotPoint;
  emotionalWeight: number; // 1-10
  charactersInvolved: string[];
  establishedInChapter: number;
  payoffTargetChapter?: number;
  promises: NarrativePromise[];
}

export interface PlotPoint {
  description: string;
  requiredChapter?: number;
  prerequisites: string[];
  consequences: string[];
}

export interface NarrativePromise {
  type: 'mystery' | 'relationship' | 'conflict' | 'revelation' | 'consequence';
  description: string;
  setupChapter: number;
  payoffChapter?: number;
  fulfilled: boolean;
  importance: 'critical' | 'important' | 'minor';
}

export interface Mystery {
  question: string;
  setupChapter: number;
  cluesPlanted: Clue[];
  redHerrings: string[];
  solution: string;
  revealTargetChapter?: number;
  characterKnowledge: Record<string, 'unaware' | 'suspicious' | 'investigating' | 'knows'>;
}

export interface Clue {
  chapter: number;
  description: string;
  obviousness: 'subtle' | 'moderate' | 'obvious';
  characterWhoFound?: string;
}

export interface ThematicElement {
  theme: string;
  question: string;
  explorationMethods: string[];
  characterPerspectives: Record<string, string>;
  currentDevelopment: 'introduced' | 'exploring' | 'climaxing' | 'resolved';
  chapters: ThematicMoment[];
}

export interface ThematicMoment {
  chapter: number;
  exploration: string;
  characterInvolved: string;
  insight: string;
}

// =================== MAIN COHERENCE INTERFACE ===================

export interface StoryCoherence {
  // World State
  worldState: {
    locations: Map<string, LocationState>;
    politicalSituation: {
      powers: string[];
      conflicts: string[];
      alliances: string[];
      tensions: string[];
    };
    magicSystemRules: {
      established: string[];
      limitations: string[];
      costs: string[];
      taboos: string[];
    };
    timeline: {
      majorEvents: TimelineEvent[];
      personalEvents: TimelineEvent[];
      worldEvents: TimelineEvent[];
    };
  };

  // Character State
  characterStates: {
    [name: string]: {
      location: string;
      relationships: Record<string, RelationshipStatus>;
      emotionalState: EmotionalProfile;
      knowledgeBase: string[];
      secrets: string[];
      currentGoals: Objective[];
      characterArc: {
        startingPoint: string;
        currentState: string;
        growthAchieved: string[];
        remainingGrowth: string[];
        majorDecisions: CharacterDecision[];
      };
    };
  };

  // Plot Tracking
  plotThreads: {
    [threadId: string]: PlotThread;
  };

  // Narrative Promises
  narrativePromises: {
    unresolved: NarrativePromise[];
    mysteries: Mystery[];
    thematicQuestions: ThematicElement[];
  };

  // Meta Information
  metadata: {
    totalChapters: number;
    currentChapter: number;
    storyPhase: 'setup' | 'rising-action' | 'climax' | 'falling-action' | 'resolution';
    lastUpdated: number;
  };

  // Repetition Tracking
  usedPhrases: {
    metaphors: Map<string, number[]>; // phrase -> chapter numbers where used
    sensoryDescriptions: Map<string, number[]>;
    emotionalPhrases: Map<string, number[]>;
    characterActions: Map<string, number[]>;
    worldDescriptions: Map<string, number[]>;
  };
}

export interface TimelineEvent {
  chapter: number;
  description: string;
  type: 'action' | 'revelation' | 'relationship' | 'world-change';
  impact: 'local' | 'regional' | 'global';
  consequences: string[];
}

export interface CharacterDecision {
  chapter: number;
  decision: string;
  motivation: string;
  consequences: string[];
  characterGrowth?: string;
}

// =================== CONTEXT INTERFACES ===================

export interface ChapterContext {
  structure: StructureContext;
  character: CharacterContext;
  scene: SceneContext;
  constraints: CoherenceConstraints;
}

export interface StructureContext {
  plotThreadsToAdvance: PlotThread[];
  promisesToAddress: NarrativePromise[];
  chapterRole: 'setup' | 'development' | 'complication' | 'climax' | 'resolution';
  pacingRequirements: {
    tempo: 'slow' | 'medium' | 'fast';
    tensionLevel: number;
    emotionalWeight: number;
  };
}

export interface CharacterContext {
  activeCharacters: string[];
  characterStates: Record<string, any>;
  relationshipDynamics: RelationshipStatus[];
  emotionalJourneys: EmotionalProfile[];
  goalsAndMotivations: Objective[];
}

export interface SceneContext {
  primaryLocation: LocationState;
  secondaryLocations: LocationState[];
  atmosphereRequirements: {
    mood: string;
    tension: string;
    sensoryFocus: string[];
  };
  worldStateRequirements: string[];
}

export interface CoherenceConstraints {
  mustNotContradictFacts: string[];
  mustRespectRelationships: RelationshipStatus[];
  mustFollowWorldRules: string[];
  mustAdvancePlotThreads: string[];
  mustMaintainCharacterConsistency: string[];
}

// =================== COHERENCE MANAGER CLASS ===================

export class CoherenceManager {
  private storyCoherence: StoryCoherence;

  constructor() {
    this.storyCoherence = this.initializeEmptyCoherence();
  }

  private initializeEmptyCoherence(): StoryCoherence {
    return {
      worldState: {
        locations: new Map(),
        politicalSituation: {
          powers: [],
          conflicts: [],
          alliances: [],
          tensions: []
        },
        magicSystemRules: {
          established: [],
          limitations: [],
          costs: [],
          taboos: []
        },
        timeline: {
          majorEvents: [],
          personalEvents: [],
          worldEvents: []
        }
      },
      characterStates: {},
      plotThreads: {},
      narrativePromises: {
        unresolved: [],
        mysteries: [],
        thematicQuestions: []
      },
      metadata: {
        totalChapters: 0,
        currentChapter: 0,
        storyPhase: 'setup',
        lastUpdated: Date.now()
      },
      usedPhrases: {
        metaphors: new Map(),
        sensoryDescriptions: new Map(),
        emotionalPhrases: new Map(),
        characterActions: new Map(),
        worldDescriptions: new Map()
      }
    };
  }

  // =================== INITIALIZATION ===================

  initializeFromOutline(outline: string, characters: Record<string, Character>, numChapters: number): void {
    // Initialize basic story structure from outline
    this.storyCoherence.metadata.totalChapters = numChapters;
    this.initializeCharacters(characters);
    this.extractPlotThreadsFromOutline(outline);
    this.extractThemesFromOutline(outline);

    console.log('📖 Initialized story coherence from outline');
  }

  private initializeCharacters(characters: Record<string, Character>): void {
    for (const [name, character] of Object.entries(characters)) {
      this.storyCoherence.characterStates[name] = {
        location: 'unknown',
        relationships: {},
        emotionalState: {
          primaryEmotion: 'neutral',
          secondaryEmotions: [],
          emotionalArc: [],
          traumaMarkers: [],
          copingMechanisms: []
        },
        knowledgeBase: [],
        secrets: [],
        currentGoals: [],
        characterArc: {
          startingPoint: character.description,
          currentState: character.description,
          growthAchieved: [],
          remainingGrowth: [],
          majorDecisions: []
        }
      };
    }
  }

  private extractPlotThreadsFromOutline(outline: string): void {
    // Basic plot thread extraction - can be enhanced with AI analysis
    const mainThread: PlotThread = {
      id: 'main-plot',
      title: 'Main Story Arc',
      description: 'Primary narrative thread',
      status: 'active',
      priority: 'primary',
      nextMilestone: {
        description: 'First major plot point',
        prerequisites: [],
        consequences: []
      },
      emotionalWeight: 10,
      charactersInvolved: Object.keys(this.storyCoherence.characterStates),
      establishedInChapter: 1,
      promises: []
    };

    this.storyCoherence.plotThreads['main-plot'] = mainThread;
  }

  private extractThemesFromOutline(outline: string): void {
    // Basic theme extraction - can be enhanced with AI analysis
    // This would typically analyze the outline for thematic elements
  }

  // =================== CONTEXT PREPARATION ===================

  prepareChapterContext(chapterNumber: number, chapterPlan: ParsedChapterPlan): ChapterContext {
    this.storyCoherence.metadata.currentChapter = chapterNumber;

    const structureContext = this.prepareStructureContext(chapterNumber, chapterPlan);
    const characterContext = this.prepareCharacterContext(chapterNumber);
    const sceneContext = this.prepareSceneContext(chapterNumber, chapterPlan);
    const constraints = this.generateConstraints(chapterNumber);

    return {
      structure: structureContext,
      character: characterContext,
      scene: sceneContext,
      constraints
    };
  }

  private prepareStructureContext(chapterNumber: number, chapterPlan: ParsedChapterPlan): StructureContext {
    const activeThreads = Object.values(this.storyCoherence.plotThreads)
      .filter(thread => thread.status === 'active');

    const unresolvedPromises = this.storyCoherence.narrativePromises.unresolved
      .filter(promise => !promise.fulfilled);

    const chapterRole = this.determineChapterRole(chapterNumber);

    return {
      plotThreadsToAdvance: activeThreads,
      promisesToAddress: unresolvedPromises,
      chapterRole,
      pacingRequirements: {
        tempo: chapterPlan.rhythmPacing as 'slow' | 'medium' | 'fast',
        tensionLevel: chapterPlan.tensionLevel || 5,
        emotionalWeight: 5 // Default, could be calculated
      }
    };
  }

  private prepareCharacterContext(chapterNumber: number): CharacterContext {
    const characterStates = this.storyCoherence.characterStates;
    const activeCharacters = Object.keys(characterStates);

    return {
      activeCharacters,
      characterStates,
      relationshipDynamics: this.extractCurrentRelationships(),
      emotionalJourneys: Object.values(characterStates).map(char => char.emotionalState),
      goalsAndMotivations: Object.values(characterStates).flatMap(char => char.currentGoals)
    };
  }

  private prepareSceneContext(chapterNumber: number, chapterPlan: ParsedChapterPlan): SceneContext {
    // For now, create basic scene context
    // This would be enhanced with location tracking
    return {
      primaryLocation: {
        name: 'Current Setting',
        description: 'Main location for this chapter',
        currentOccupants: [],
        securityLevel: 'neutral',
        changes: []
      },
      secondaryLocations: [],
      atmosphereRequirements: {
        mood: chapterPlan.emotionalToneTension || 'neutral',
        tension: chapterPlan.tensionLevel?.toString() || '5',
        sensoryFocus: ['visual', 'auditory']
      },
      worldStateRequirements: []
    };
  }

  private generateConstraints(chapterNumber: number): CoherenceConstraints {
    return {
      mustNotContradictFacts: this.getEstablishedFacts(),
      mustRespectRelationships: this.extractCurrentRelationships(),
      mustFollowWorldRules: this.storyCoherence.worldState.magicSystemRules.established,
      mustAdvancePlotThreads: Object.keys(this.storyCoherence.plotThreads),
      mustMaintainCharacterConsistency: Object.keys(this.storyCoherence.characterStates)
    };
  }

  // =================== UPDATE METHODS ===================

  updateFromGeneratedChapter(chapterData: ChapterData, chapterNumber: number): void {
    console.log(`🔄 Updating coherence from Chapter ${chapterNumber}`);

    // Extract new facts, relationships, and plot developments
    this.extractAndUpdateFacts(chapterData, chapterNumber);
    this.updatePlotThreads(chapterData, chapterNumber);
    this.updateCharacterStates(chapterData, chapterNumber);
    this.checkPromiseFulfillment(chapterData, chapterNumber);

    this.storyCoherence.metadata.lastUpdated = Date.now();
    console.log(`✅ Coherence updated for Chapter ${chapterNumber}`);
  }

  private extractAndUpdateFacts(chapterData: ChapterData, chapterNumber: number): void {
    // This would use AI or pattern matching to extract new facts
    // For now, basic implementation

    // Add to timeline
    const event: TimelineEvent = {
      chapter: chapterNumber,
      description: chapterData.summary || 'Chapter events',
      type: 'action',
      impact: 'local',
      consequences: []
    };

    this.storyCoherence.worldState.timeline.majorEvents.push(event);
  }

  private updatePlotThreads(chapterData: ChapterData, chapterNumber: number): void {
    // Update plot thread progress based on chapter content
    // This would analyze the chapter for plot developments
  }

  private updateCharacterStates(chapterData: ChapterData, chapterNumber: number): void {
    // Update character emotional states, relationships, knowledge
    // This would analyze character interactions and developments
  }

  private checkPromiseFulfillment(chapterData: ChapterData, chapterNumber: number): void {
    // Check if any narrative promises were fulfilled in this chapter
  }

  // =================== VALIDATION METHODS ===================

  validateConsistency(): { passed: boolean; issues: string[]; warnings: string[] } {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check for plot thread consistency
    this.validatePlotThreads(issues, warnings);

    // Check for character consistency
    this.validateCharacterConsistency(issues, warnings);

    // Check for world consistency
    this.validateWorldConsistency(issues, warnings);

    return {
      passed: issues.length === 0,
      issues,
      warnings
    };
  }

  private validatePlotThreads(issues: string[], warnings: string[]): void {
    for (const thread of Object.values(this.storyCoherence.plotThreads)) {
      if (thread.status === 'active' && !thread.nextMilestone) {
        warnings.push(`Plot thread "${thread.title}" is active but has no next milestone`);
      }
    }
  }

  private validateCharacterConsistency(issues: string[], warnings: string[]): void {
    // Check for character consistency issues
  }

  private validateWorldConsistency(issues: string[], warnings: string[]): void {
    // Check for world rule violations
  }

  // =================== HELPER METHODS ===================

  private determineChapterRole(chapterNumber: number): 'setup' | 'development' | 'complication' | 'climax' | 'resolution' {
    const totalChapters = this.storyCoherence.metadata.totalChapters;
    const progress = chapterNumber / totalChapters;

    if (progress <= 0.25) return 'setup';
    if (progress <= 0.7) return 'development';
    if (progress <= 0.85) return 'complication';
    if (progress <= 0.95) return 'climax';
    return 'resolution';
  }

  private extractCurrentRelationships(): RelationshipStatus[] {
    const relationships: RelationshipStatus[] = [];

    for (const character of Object.values(this.storyCoherence.characterStates)) {
      for (const relationship of Object.values(character.relationships)) {
        relationships.push(relationship);
      }
    }

    return relationships;
  }

  private getEstablishedFacts(): string[] {
    // Extract all established facts from the story
    const facts: string[] = [];

    // Add timeline events as facts
    for (const event of this.storyCoherence.worldState.timeline.majorEvents) {
      facts.push(event.description);
    }

    return facts;
  }

  // =================== REPETITION TRACKING ===================

  trackPhrase(phrase: string, category: 'metaphors' | 'sensoryDescriptions' | 'emotionalPhrases' | 'characterActions' | 'worldDescriptions', chapterNumber: number): void {
    const categoryMap = this.storyCoherence.usedPhrases[category];
    const normalizedPhrase = this.normalizePhrase(phrase);

    if (categoryMap.has(normalizedPhrase)) {
      const chapters = categoryMap.get(normalizedPhrase)!;
      chapters.push(chapterNumber);
    } else {
      categoryMap.set(normalizedPhrase, [chapterNumber]);
    }
  }

  checkForRepetition(content: string, chapterNumber: number): RepetitionReport {
    const repetitions: RepetitionIssue[] = [];

    // Common repetitive patterns to check
    const patterns = {
      metaphors: [
        /металлический привкус\s+(?:адреналина|страха|тревоги|опасности)/gi,
        /холодный\s+пот\s+(?:выступил|покрыл|окатил)/gi,
        /сердце\s+(?:забилось|заколотилось|екнуло|замерло)/gi,
        /дрожь\s+(?:пробежала|прошла|охватила)/gi
      ],
      sensoryDescriptions: [
        /(?:запах|аромат|вонь)\s+[\w\s]{1,30}(?:наполнил|ударил|достиг)/gi,
        /(?:звук|шум|грохот)\s+[\w\s]{1,30}(?:раздался|прорезал|эхом)/gi,
        /(?:холод|тепло|жар)\s+[\w\s]{1,20}(?:пронзил|охватил|накрыл)/gi
      ],
      emotionalPhrases: [
        /(?:страх|ужас|тревога)\s+(?:сковал|охватил|парализовал)/gi,
        /(?:гнев|ярость|злость)\s+(?:вскипела|нахлынула|охватила)/gi
      ]
    };

    // Check each category
    for (const [category, categoryPatterns] of Object.entries(patterns)) {
      for (const pattern of categoryPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          for (const match of matches) {
            this.trackPhrase(match, category as any, chapterNumber);

            // Check if this phrase was used recently
            const usageHistory = this.getPhraseUsage(match, category as any);
            if (usageHistory.length > 1) {
              // Used more than once
              const recentUsage = usageHistory.filter(ch => Math.abs(ch - chapterNumber) <= 2);
              if (recentUsage.length > 1) {
                repetitions.push({
                  phrase: match,
                  category: category as any,
                  currentChapter: chapterNumber,
                  previousUsage: usageHistory.filter(ch => ch !== chapterNumber),
                  severity: this.calculateSeverity(usageHistory, chapterNumber)
                });
              }
            }
          }
        }
      }
    }

    return {
      chapterNumber,
      issues: repetitions,
      totalRepetitions: repetitions.length,
      severity: repetitions.length > 3 ? 'high' : repetitions.length > 1 ? 'medium' : 'low'
    };
  }

  getPhraseUsage(phrase: string, category: 'metaphors' | 'sensoryDescriptions' | 'emotionalPhrases' | 'characterActions' | 'worldDescriptions'): number[] {
    const normalizedPhrase = this.normalizePhrase(phrase);
    return this.storyCoherence.usedPhrases[category].get(normalizedPhrase) || [];
  }

  getRepetitionConstraints(chapterNumber: number): RepetitionConstraints {
    const recentPhrases: string[] = [];

    // Collect phrases used in recent chapters (current and previous 2)
    const recentChapters = [chapterNumber - 2, chapterNumber - 1, chapterNumber].filter(ch => ch > 0);

    for (const [category, phraseMap] of Object.entries(this.storyCoherence.usedPhrases)) {
      for (const [phrase, chapters] of phraseMap.entries()) {
        const hasRecentUsage = chapters.some(ch => recentChapters.includes(ch));
        if (hasRecentUsage) {
          recentPhrases.push(phrase);
        }
      }
    }

    return {
      avoidPhrases: recentPhrases,
      maxSimilarMetaphors: 1,
      maxSensoryOverload: 2, // Max 2 sensory descriptions per paragraph
      guidelines: [
        'Avoid repeating exact metaphors from recent chapters',
        'Vary sensory descriptions (don\'t stack smell + sound + touch)',
        'Use fresh emotional language, avoid clichés',
        'If you must use similar concepts, find new ways to express them'
      ]
    };
  }

  private normalizePhrase(phrase: string): string {
    return phrase.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private calculateSeverity(usageHistory: number[], currentChapter: number): 'low' | 'medium' | 'high' {
    const timeSinceLastUse = Math.min(...usageHistory.filter(ch => ch < currentChapter).map(ch => currentChapter - ch));
    const totalUses = usageHistory.length;

    if (totalUses >= 4 || timeSinceLastUse <= 1) return 'high';
    if (totalUses >= 3 || timeSinceLastUse <= 2) return 'medium';
    return 'low';
  }

  // =================== EXPORT METHODS ===================

  getCoherence(): StoryCoherence {
    return { ...this.storyCoherence };
  }

  exportCoherenceForPrompt(): string {
    // Export coherence information in a format suitable for AI prompts
    const summary = {
      currentChapter: this.storyCoherence.metadata.currentChapter,
      activePlotThreads: Object.keys(this.storyCoherence.plotThreads),
      characterStates: Object.keys(this.storyCoherence.characterStates),
      unresolvedPromises: this.storyCoherence.narrativePromises.unresolved.length,
      establishedFacts: this.getEstablishedFacts().slice(-5) // Last 5 facts
    };

    return JSON.stringify(summary, null, 2);
  }
}

// Export singleton instance
export const coherenceManager = new CoherenceManager();