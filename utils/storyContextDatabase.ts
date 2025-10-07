/**
 * Story Context Database - Shared memory system for agent coordination
 * Tracks what reader knows vs what characters know, manages revelation timing
 */

export interface EstablishedFact {
  fact: string;
  chapterEstablished: number;
  importance: 'critical' | 'major' | 'minor';
  type: 'world-rule' | 'character-info' | 'plot-event' | 'relationship';
}

export interface PlannedRevelation {
  id: string;
  content: string;
  targetChapter: number;
  minimumChapter: number;
  requiredContext: string[];
  requiredHints: string[];
  importance: 'critical' | 'major' | 'minor';
  type: 'character-past' | 'world-secret' | 'plot-twist' | 'relationship-truth';
}

export interface ForeshadowingHint {
  id: string;
  content: string;
  chapterPlaced: number;
  targetRevelation: string;
  subtlety: 'obvious' | 'moderate' | 'subtle';
}

export interface CharacterKnowledge {
  characterName: string;
  knownFacts: string[];
  suspicions: string[];
  blindSpots: string[];
}

export interface ReaderKnowledge {
  establishedFacts: EstablishedFact[];
  receivedHints: ForeshadowingHint[];
  currentExpectations: string[];
  unansweredQuestions: string[];
}

export interface SharedChapterState {
  chapterNumber: number;
  sceneType: 'action' | 'emotional' | 'revelation' | 'setup' | 'climax';
  currentTone: 'tense' | 'reflective' | 'urgent' | 'mysterious' | 'calm';

  // Content tracking
  wordCounts: {
    description: number;
    action: number;
    dialogue: number;
    internal: number;
  };

  consecutiveBlocks: {
    description: number;
    internal: number;
    dialogue: number;
  };

  sensoryLoad: {
    sight: number;
    sound: number;
    smell: number;
    touch: number;
    taste: number;
  };

  // Agent outputs
  structureComplete: boolean;
  characterOutput?: string;
  sceneOutput?: string;
  synthesisOutput?: string;
}

export class StoryContextDatabase {
  private readerKnowledge: ReaderKnowledge;
  private characterKnowledge: Map<string, CharacterKnowledge>;
  private plannedRevelations: Map<string, PlannedRevelation>;
  private foreshadowingHints: Map<string, ForeshadowingHint>;
  private currentChapterState: SharedChapterState;

  constructor() {
    this.readerKnowledge = {
      establishedFacts: [],
      receivedHints: [],
      currentExpectations: [],
      unansweredQuestions: []
    };
    this.characterKnowledge = new Map();
    this.plannedRevelations = new Map();
    this.foreshadowingHints = new Map();
    this.currentChapterState = this.initializeChapterState(1);
  }

  // =================== REVELATION TIMING ===================

  canReveal(revelationId: string, currentChapter: number): RevelationValidation {
    const revelation = this.plannedRevelations.get(revelationId);
    if (!revelation) {
      return { allowed: false, reason: 'Revelation not found' };
    }

    // Check minimum chapter requirement
    if (currentChapter < revelation.minimumChapter) {
      return {
        allowed: false,
        reason: `Too early. Minimum chapter: ${revelation.minimumChapter}`
      };
    }

    // Check required context
    const missingContext = revelation.requiredContext.filter(context =>
      !this.isFactEstablished(context)
    );

    if (missingContext.length > 0) {
      return {
        allowed: false,
        reason: `Missing context: ${missingContext.join(', ')}`,
        requiredActions: missingContext.map(context => ({
          action: 'establish-context',
          content: context
        }))
      };
    }

    // Check required hints
    const placedHints = revelation.requiredHints.filter(hintId =>
      this.foreshadowingHints.has(hintId)
    );

    if (placedHints.length < 2) {
      return {
        allowed: false,
        reason: `Insufficient foreshadowing. Need ${2 - placedHints.length} more hints`,
        requiredActions: [{
          action: 'add-foreshadowing',
          content: `Need hints for: ${revelation.content}`
        }]
      };
    }

    return { allowed: true, reason: 'All requirements met' };
  }

  // =================== CONTENT LIMITS ===================

  checkContentLimits(agentType: 'character' | 'scene', proposedAddition: string): ContentLimitCheck {
    const wordCount = this.countWords(proposedAddition);
    const currentState = this.currentChapterState;

    if (agentType === 'character') {
      // Internal monologue limits
      if (proposedAddition.includes('[INTERNAL')) {
        const internalWords = this.extractInternalWords(proposedAddition);

        if (internalWords > 150) {
          return {
            allowed: false,
            reason: `Internal monologue too long: ${internalWords} words (max 150)`,
            suggestedAction: 'condense-internal'
          };
        }

        if (currentState.consecutiveBlocks.internal >= 3) {
          return {
            allowed: false,
            reason: 'Too many consecutive internal blocks',
            suggestedAction: 'add-micro-action'
          };
        }
      }
    }

    if (agentType === 'scene') {
      // Sensory overload check
      const sensoryCount = this.countSensoryDetails(proposedAddition);
      if (sensoryCount > 2) {
        return {
          allowed: false,
          reason: `Too many sensory details: ${sensoryCount} (max 2 per paragraph)`,
          suggestedAction: 'reduce-sensory'
        };
      }
    }

    return { allowed: true, reason: 'Within limits' };
  }

  // =================== TONE COORDINATION ===================

  registerCharacterOutput(output: string): void {
    this.currentChapterState.characterOutput = output;

    // Analyze tone from character output
    const detectedTone = this.analyzeTone(output);
    this.currentChapterState.currentTone = detectedTone;

    // Update word counts
    this.updateWordCounts(output);
  }

  getToneGuidanceForScene(): ToneGuidance {
    const tone = this.currentChapterState.currentTone;
    const sceneType = this.currentChapterState.sceneType;

    switch (tone) {
      case 'tense':
        return {
          descriptionLength: 'short',
          sentenceStyle: 'sharp',
          sensoryFocus: 'hearing',
          detailLevel: 'minimal'
        };

      case 'reflective':
        return {
          descriptionLength: 'medium',
          sentenceStyle: 'flowing',
          sensoryFocus: 'sight',
          detailLevel: 'rich'
        };

      case 'urgent':
        return {
          descriptionLength: 'minimal',
          sentenceStyle: 'clipped',
          sensoryFocus: 'kinesthetic',
          detailLevel: 'action-focused'
        };

      default:
        return {
          descriptionLength: 'medium',
          sentenceStyle: 'balanced',
          sensoryFocus: 'sight',
          detailLevel: 'moderate'
        };
    }
  }

  // =================== MACRO VALIDATION ===================

  validateChapterBalance(): BalanceReport {
    const state = this.currentChapterState;
    const total = state.wordCounts.description + state.wordCounts.action +
                  state.wordCounts.dialogue + state.wordCounts.internal;

    const percentages = {
      description: (state.wordCounts.description / total) * 100,
      action: (state.wordCounts.action / total) * 100,
      dialogue: (state.wordCounts.dialogue / total) * 100,
      internal: (state.wordCounts.internal / total) * 100
    };

    const expectedBalance = this.getExpectedBalance(state.sceneType);

    const issues: BalanceIssue[] = [];

    // Check description overload
    if (percentages.description > expectedBalance.description + 10) {
      issues.push({
        type: 'description-overload',
        severity: 'high',
        current: percentages.description,
        expected: expectedBalance.description,
        suggestion: 'Reduce environmental descriptions, focus on essential details'
      });
    }

    // Check internal monologue overload
    if (percentages.internal > 25) {
      issues.push({
        type: 'internal-overload',
        severity: 'high',
        current: percentages.internal,
        expected: 20,
        suggestion: 'Break up internal thoughts with micro-actions'
      });
    }

    // Check consecutive blocks
    if (state.consecutiveBlocks.description > 3) {
      issues.push({
        type: 'consecutive-description',
        severity: 'medium',
        current: state.consecutiveBlocks.description,
        expected: 3,
        suggestion: 'Insert action beats between description blocks'
      });
    }

    return {
      percentages,
      expectedBalance,
      issues,
      overallScore: this.calculateBalanceScore(percentages, expectedBalance)
    };
  }

  // =================== PRIVATE HELPERS ===================

  private initializeChapterState(chapterNumber: number): SharedChapterState {
    return {
      chapterNumber,
      sceneType: 'setup',
      currentTone: 'calm',
      wordCounts: { description: 0, action: 0, dialogue: 0, internal: 0 },
      consecutiveBlocks: { description: 0, internal: 0, dialogue: 0 },
      sensoryLoad: { sight: 0, sound: 0, smell: 0, touch: 0, taste: 0 },
      structureComplete: false
    };
  }

  private isFactEstablished(fact: string): boolean {
    return this.readerKnowledge.establishedFacts.some(f => f.fact === fact);
  }

  private analyzeTone(characterOutput: string): SharedChapterState['currentTone'] {
    // Simple tone analysis based on keywords and patterns
    const lowerOutput = characterOutput.toLowerCase();

    if (lowerOutput.includes('danger') || lowerOutput.includes('weapon') ||
        lowerOutput.includes('threat')) {
      return 'tense';
    }

    if (lowerOutput.includes('remember') || lowerOutput.includes('past') ||
        lowerOutput.includes('thought')) {
      return 'reflective';
    }

    if (lowerOutput.includes('run') || lowerOutput.includes('quick') ||
        lowerOutput.includes('now')) {
      return 'urgent';
    }

    if (lowerOutput.includes('secret') || lowerOutput.includes('hidden') ||
        lowerOutput.includes('why')) {
      return 'mysterious';
    }

    return 'calm';
  }

  private updateWordCounts(output: string): void {
    // Simple word counting based on content markers
    const words = output.split(/\s+/).length;

    if (output.includes('[DESCRIPTION')) {
      this.currentChapterState.wordCounts.description += words * 0.3;
    }
    if (output.includes('[ACTION')) {
      this.currentChapterState.wordCounts.action += words * 0.2;
    }
    if (output.includes('[DIALOGUE')) {
      this.currentChapterState.wordCounts.dialogue += words * 0.3;
    }
    if (output.includes('[INTERNAL')) {
      this.currentChapterState.wordCounts.internal += words * 0.2;
    }
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  private extractInternalWords(text: string): number {
    // Extract words from internal monologue sections
    const internalSections = text.match(/\[INTERNAL[^\]]*\]([^[]*)/g) || [];
    return internalSections.reduce((total, section) =>
      total + this.countWords(section), 0
    );
  }

  private countSensoryDetails(text: string): number {
    const sensoryWords = [
      // Sight
      'bright', 'dark', 'color', 'shadow', 'light', 'gleam', 'flash',
      // Sound
      'sound', 'noise', 'whisper', 'shout', 'echo', 'buzz', 'hum',
      // Smell
      'smell', 'scent', 'odor', 'aroma', 'stench', 'fragrance',
      // Touch
      'rough', 'smooth', 'cold', 'warm', 'sharp', 'soft', 'texture',
      // Taste
      'taste', 'flavor', 'bitter', 'sweet', 'sour', 'metallic'
    ];

    const lowerText = text.toLowerCase();
    return sensoryWords.reduce((count, word) =>
      count + (lowerText.split(word).length - 1), 0
    );
  }

  private getExpectedBalance(sceneType: string): Record<string, number> {
    switch (sceneType) {
      case 'action':
        return { description: 10, action: 80, dialogue: 10, internal: 0 };
      case 'emotional':
        return { description: 40, action: 20, dialogue: 40, internal: 0 };
      case 'revelation':
        return { description: 30, action: 20, dialogue: 50, internal: 0 };
      case 'climax':
        return { description: 15, action: 70, dialogue: 15, internal: 0 };
      default: // setup
        return { description: 20, action: 60, dialogue: 20, internal: 0 };
    }
  }

  private calculateBalanceScore(current: Record<string, number>, expected: Record<string, number>): number {
    const deviations = Object.keys(expected).map(key =>
      Math.abs(current[key] - expected[key])
    );
    const avgDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / deviations.length;
    return Math.max(0, 100 - avgDeviation);
  }

  // =================== PUBLIC API ===================

  initializeChapter(chapterNumber: number, sceneType: SharedChapterState['sceneType']): void {
    this.currentChapterState = this.initializeChapterState(chapterNumber);
    this.currentChapterState.sceneType = sceneType;
  }

  getSharedState(): SharedChapterState {
    return { ...this.currentChapterState };
  }

  establishFact(fact: string, chapter: number, importance: EstablishedFact['importance']): void {
    this.readerKnowledge.establishedFacts.push({
      fact,
      chapterEstablished: chapter,
      importance,
      type: 'plot-event' // Could be made more specific
    });
  }

  addPlannedRevelation(revelation: PlannedRevelation): void {
    this.plannedRevelations.set(revelation.id, revelation);
  }

  addForeshadowingHint(hint: ForeshadowingHint): void {
    this.foreshadowingHints.set(hint.id, hint);
  }
}

// =================== TYPES ===================

export interface RevelationValidation {
  allowed: boolean;
  reason: string;
  requiredActions?: Array<{
    action: 'establish-context' | 'add-foreshadowing';
    content: string;
  }>;
}

export interface ContentLimitCheck {
  allowed: boolean;
  reason: string;
  suggestedAction?: 'condense-internal' | 'add-micro-action' | 'reduce-sensory';
}

export interface ToneGuidance {
  descriptionLength: 'minimal' | 'short' | 'medium' | 'rich';
  sentenceStyle: 'clipped' | 'sharp' | 'flowing' | 'balanced';
  sensoryFocus: 'sight' | 'hearing' | 'kinesthetic' | 'smell' | 'touch';
  detailLevel: 'minimal' | 'action-focused' | 'moderate' | 'rich';
}

export interface BalanceIssue {
  type: 'description-overload' | 'internal-overload' | 'consecutive-description' | 'consecutive-internal';
  severity: 'low' | 'medium' | 'high';
  current: number;
  expected: number;
  suggestion: string;
}

export interface BalanceReport {
  percentages: Record<string, number>;
  expectedBalance: Record<string, number>;
  issues: BalanceIssue[];
  overallScore: number;
}

// Export singleton instance
export const storyContextDB = new StoryContextDatabase();