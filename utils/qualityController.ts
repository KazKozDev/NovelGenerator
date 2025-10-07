/**
 * Quality Controller - Advanced quality analysis and auto-correction system
 * Based on detailed narrative quality feedback analysis
 */

// =================== INTERFACES ===================

export interface QualityAnalysis {
  emotionalCurve: EmotionalCurveAnalysis;
  pacing: PacingAnalysis;
  repetition: RepetitionAnalysis;
  showVsTell: ShowVsTellAnalysis;
  revelation: RevelationAnalysis;
  stakes: StakesAnalysis;
  microDetails: MicroDetailsAnalysis;
  overallScore: number;
  recommendations: QualityRecommendation[];
}

export interface EmotionalCurveAnalysis {
  hasClimax: boolean;
  climaxPosition: number; // percentage through chapter
  isMonotone: boolean;
  emotionalRange: number; // 1-10 scale
  needsBreathing: boolean;
  issues: string[];
}

export interface PacingAnalysis {
  sceneType: 'action' | 'emotional' | 'revelation' | 'setup';
  averageSentenceLength: number;
  expectedLength: number; // for scene type
  pacingMatch: boolean;
  issues: string[];
}

export interface RepetitionAnalysis {
  overusedWords: Array<{ word: string; count: number; severity: 'low' | 'medium' | 'high' }>;
  repetitivePatterns: Array<{ pattern: string; count: number }>;
  cliches: Array<{ phrase: string; category: string }>;
  needsVariation: boolean;
}

export interface ShowVsTellAnalysis {
  tellCount: number;
  showCount: number;
  ratio: number; // show/tell ratio
  problematicPhrases: Array<{ phrase: string; type: 'emotion-tell' | 'appearance-tell' | 'state-tell' }>;
  needsConversion: boolean;
}

export interface RevelationAnalysis {
  hasRevelation: boolean;
  isShown: boolean; // vs told
  readerExperience: 'immersive' | 'detached' | 'confused';
  specificity: number; // 1-10 scale
  emotionalImpact: number; // 1-10 scale
  issues: string[];
}

export interface StakesAnalysis {
  areStakesClear: boolean;
  stakesLevel: 'personal' | 'professional' | 'life-death' | 'world-ending';
  consequences: string[];
  playerAgency: boolean; // is character active or passive
  tension: number; // 1-10 scale
}

export interface MicroDetailsAnalysis {
  contextRelevant: boolean;
  distractingCount: number;
  atmosphericCount: number;
  balance: 'appropriate' | 'too-mundane' | 'too-sparse';
}

export interface QualityRecommendation {
  category: 'emotional' | 'pacing' | 'repetition' | 'show-tell' | 'revelation' | 'stakes' | 'details';
  severity: 'low' | 'medium' | 'high' | 'critical';
  issue: string;
  solution: string;
  autoFixable: boolean;
}

// =================== QUALITY CONTROLLER CLASS ===================

export class QualityController {
  private readonly OVERUSED_THRESHOLD = 3;
  private readonly CLICHE_DATABASE = [
    { phrase: 'teeth ache', category: 'sensory-cliche' },
    { phrase: 'knot in stomach', category: 'emotion-cliche' },
    { phrase: 'breath hitched', category: 'reaction-cliche' },
    { phrase: 'silence hung heavy', category: 'atmosphere-cliche' },
    { phrase: 'heart skipped a beat', category: 'emotion-cliche' },
    { phrase: 'blood ran cold', category: 'fear-cliche' },
    { phrase: 'time stood still', category: 'time-cliche' }
  ];

  private readonly TELL_PATTERNS = [
    /\b(she|he|they) felt (\w+)/gi,
    /\b(she|he|they) looked (\w+)/gi,
    /\b(she|he|they) seemed (\w+)/gi,
    /\b(she|he|they) appeared (\w+)/gi,
    /\bfelt (betrayed|confused|angry|sad|happy|excited)/gi,
    /\ba (profound|deep|overwhelming) (feeling|sense) of/gi
  ];

  private readonly EMOTION_TO_PHYSICAL = {
    'betrayed': ['Her hands trembled', 'She couldn\'t meet his eyes', 'Her voice cracked'],
    'confused': ['She blinked slowly', 'Her forehead creased', 'She tilted her head'],
    'angry': ['Her jaw clenched', 'Her fists went white', 'Heat flushed her cheeks'],
    'sad': ['Her shoulders sagged', 'She looked away', 'Her throat tightened'],
    'excited': ['She leaned forward', 'Her eyes widened', 'She spoke faster'],
    'afraid': ['She stepped back', 'Her breath quickened', 'Cold sweat beaded her forehead']
  };

  private readonly WORD_ALTERNATIVES = {
    'settled': ['sank', 'descended', 'lodged', 'nestled', 'anchored', 'rooted'],
    'heavy': ['oppressive', 'dense', 'crushing', 'thick', 'weighty', 'burdensome'],
    'sharp': ['keen', 'piercing', 'cutting', 'acute', 'jagged', 'biting'],
    'cold': ['icy', 'frigid', 'chilled', 'frozen', 'arctic', 'bitter']
  };

  // =================== MAIN ANALYSIS METHOD ===================

  analyzeChapter(content: string, chapterType: 'action' | 'emotional' | 'revelation' | 'setup'): QualityAnalysis {
    const emotionalCurve = this.analyzeEmotionalCurve(content);
    const pacing = this.analyzePacing(content, chapterType);
    const repetition = this.analyzeRepetition(content);
    const showVsTell = this.analyzeShowVsTell(content);
    const revelation = this.analyzeRevelation(content);
    const stakes = this.analyzeStakes(content);
    const microDetails = this.analyzeMicroDetails(content, chapterType);

    const overallScore = this.calculateOverallScore({
      emotionalCurve,
      pacing,
      repetition,
      showVsTell,
      revelation,
      stakes,
      microDetails
    });

    const recommendations = this.generateRecommendations({
      emotionalCurve,
      pacing,
      repetition,
      showVsTell,
      revelation,
      stakes,
      microDetails
    });

    return {
      emotionalCurve,
      pacing,
      repetition,
      showVsTell,
      revelation,
      stakes,
      microDetails,
      overallScore,
      recommendations
    };
  }

  // =================== EMOTIONAL CURVE ANALYSIS ===================

  private analyzeEmotionalCurve(content: string): EmotionalCurveAnalysis {
    const sentences = content.split(/[.!?]+/).filter(s => s.length > 10);
    const emotionalIntensity = sentences.map(s => this.calculateEmotionalIntensity(s));

    // Find peak intensity
    const maxIntensity = Math.max(...emotionalIntensity);
    const peakIndex = emotionalIntensity.indexOf(maxIntensity);
    const climaxPosition = (peakIndex / sentences.length) * 100;

    // Check if monotone (little variation)
    const intensityRange = maxIntensity - Math.min(...emotionalIntensity);
    const isMonotone = intensityRange < 3;

    // Check for climax in proper position (70-80%)
    const hasClimax = climaxPosition >= 70 && climaxPosition <= 85;

    // Check if needs breathing space (too many high-intensity sentences in a row)
    let needsBreathing = false;
    for (let i = 0; i < emotionalIntensity.length - 3; i++) {
      const consecutive = emotionalIntensity.slice(i, i + 4);
      if (consecutive.every(intensity => intensity >= 7)) {
        needsBreathing = true;
        break;
      }
    }

    const issues = [];
    if (!hasClimax) issues.push(`Climax at ${climaxPosition.toFixed(0)}% instead of 70-80%`);
    if (isMonotone) issues.push('Emotional range too narrow');
    if (needsBreathing) issues.push('Too much consecutive high intensity');

    return {
      hasClimax,
      climaxPosition,
      isMonotone,
      emotionalRange: intensityRange,
      needsBreathing,
      issues
    };
  }

  private calculateEmotionalIntensity(sentence: string): number {
    const highIntensityWords = ['screamed', 'shattered', 'exploded', 'terror', 'agony', 'ecstasy'];
    const mediumIntensityWords = ['shouted', 'worried', 'excited', 'afraid', 'angry', 'surprised'];
    const lowIntensityWords = ['said', 'walked', 'looked', 'sat', 'stood', 'thought'];

    let intensity = 5; // baseline

    highIntensityWords.forEach(word => {
      if (sentence.toLowerCase().includes(word)) intensity += 2;
    });

    mediumIntensityWords.forEach(word => {
      if (sentence.toLowerCase().includes(word)) intensity += 1;
    });

    lowIntensityWords.forEach(word => {
      if (sentence.toLowerCase().includes(word)) intensity -= 1;
    });

    return Math.max(1, Math.min(10, intensity));
  }

  // =================== PACING ANALYSIS ===================

  private analyzePacing(content: string, sceneType: 'action' | 'emotional' | 'revelation' | 'setup'): PacingAnalysis {
    const sentences = content.split(/[.!?]+/).filter(s => s.length > 5);
    const avgLength = sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / sentences.length;

    const expectedLengths = {
      action: 12,
      emotional: 18,
      revelation: 15,
      setup: 16
    };

    const expectedLength = expectedLengths[sceneType];
    const pacingMatch = Math.abs(avgLength - expectedLength) <= 3;

    const issues = [];
    if (!pacingMatch) {
      if (avgLength > expectedLength + 3) {
        issues.push(`Sentences too long for ${sceneType} scene (${avgLength.toFixed(1)} vs ${expectedLength} words)`);
      } else {
        issues.push(`Sentences too short for ${sceneType} scene (${avgLength.toFixed(1)} vs ${expectedLength} words)`);
      }
    }

    return {
      sceneType,
      averageSentenceLength: avgLength,
      expectedLength,
      pacingMatch,
      issues
    };
  }

  // =================== REPETITION ANALYSIS ===================

  private analyzeRepetition(content: string): RepetitionAnalysis {
    const words = content.toLowerCase().match(/\b\w+\b/g) || [];
    const wordCounts = words.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Find overused words
    const overusedWords = Object.entries(wordCounts)
      .filter(([word, count]) => count >= this.OVERUSED_THRESHOLD && word.length > 3)
      .map(([word, count]) => ({
        word,
        count,
        severity: count >= 8 ? 'high' : count >= 5 ? 'medium' : 'low' as const
      }))
      .sort((a, b) => b.count - a.count);

    // Check for cliches
    const cliches = this.CLICHE_DATABASE.filter(cliche =>
      content.toLowerCase().includes(cliche.phrase.toLowerCase())
    );

    // Check repetitive patterns
    const patterns = [
      { pattern: 'Her [body part] [action]', regex: /Her \w+ \w+/g },
      { pattern: 'A [noun] [verbed]', regex: /A \w+ \w+ed/g },
      { pattern: '[Something] settled', regex: /\w+ settled/g }
    ];

    const repetitivePatterns = patterns.map(p => ({
      pattern: p.pattern,
      count: (content.match(p.regex) || []).length
    })).filter(p => p.count >= 3);

    return {
      overusedWords,
      repetitivePatterns,
      cliches,
      needsVariation: overusedWords.length > 0 || cliches.length > 0 || repetitivePatterns.length > 0
    };
  }

  // =================== SHOW VS TELL ANALYSIS ===================

  private analyzeShowVsTell(content: string): ShowVsTellAnalysis {
    let tellCount = 0;
    const problematicPhrases: Array<{ phrase: string; type: 'emotion-tell' | 'appearance-tell' | 'state-tell' }> = [];

    this.TELL_PATTERNS.forEach(pattern => {
      const matches = content.match(pattern) || [];
      matches.forEach(match => {
        tellCount++;
        problematicPhrases.push({
          phrase: match,
          type: this.categorizeTeLL(match)
        });
      });
    });

    // Rough estimate of "show" instances (physical actions, dialogue, sensory details)
    const showPatterns = [
      /\b(clenched|trembled|widened|narrowed|tightened)\b/g,
      /"[^"]+"/g, // dialogue
      /\b(smell|taste|sound|feel|touch)\b/g
    ];

    let showCount = 0;
    showPatterns.forEach(pattern => {
      showCount += (content.match(pattern) || []).length;
    });

    const ratio = showCount / Math.max(tellCount, 1);
    const needsConversion = ratio < 2; // should have at least 2 shows per tell

    return {
      tellCount,
      showCount,
      ratio,
      problematicPhrases,
      needsConversion
    };
  }

  private categorizeTeLL(phrase: string): 'emotion-tell' | 'appearance-tell' | 'state-tell' {
    if (phrase.match(/felt|feeling/)) return 'emotion-tell';
    if (phrase.match(/looked|appeared|seemed/)) return 'appearance-tell';
    return 'state-tell';
  }

  // =================== REVELATION ANALYSIS ===================

  private analyzeRevelation(content: string): RevelationAnalysis {
    const revelationKeywords = ['revealed', 'discovered', 'realized', 'understood', 'truth', 'secret'];
    const hasRevelation = revelationKeywords.some(keyword =>
      content.toLowerCase().includes(keyword)
    );

    if (!hasRevelation) {
      return {
        hasRevelation: false,
        isShown: true,
        readerExperience: 'immersive',
        specificity: 10,
        emotionalImpact: 10,
        issues: []
      };
    }

    // Check if revelation is shown vs told
    const tellRevelationPatterns = [
      /he explained/gi,
      /she told/gi,
      /revealed that/gi,
      /made clear that/gi
    ];

    const isShown = !tellRevelationPatterns.some(pattern => content.match(pattern));

    // Check specificity (concrete facts vs vague statements)
    const specificityMarkers = content.match(/\b(exactly|precisely|specifically|[0-9]+|"[^"]*")/g) || [];
    const specificity = Math.min(10, specificityMarkers.length);

    // Estimate emotional impact based on character reactions
    const reactionMarkers = content.match(/(gasped|stumbled|stared|froze|trembled)/g) || [];
    const emotionalImpact = Math.min(10, reactionMarkers.length * 2);

    const issues = [];
    if (!isShown) issues.push('Revelation told rather than shown');
    if (specificity < 3) issues.push('Revelation lacks concrete details');
    if (emotionalImpact < 5) issues.push('Character reaction to revelation is weak');

    return {
      hasRevelation,
      isShown,
      readerExperience: isShown && specificity >= 3 ? 'immersive' : 'detached',
      specificity,
      emotionalImpact,
      issues
    };
  }

  // =================== STAKES ANALYSIS ===================

  private analyzeStakes(content: string): StakesAnalysis {
    const stakesKeywords = ['must', 'have to', 'need to', 'or else', 'if not', 'unless'];
    const consequenceKeywords = ['die', 'death', 'destroy', 'lose', 'fail', 'end'];

    const areStakesClear = stakesKeywords.some(keyword =>
      content.toLowerCase().includes(keyword)
    );

    // Determine stakes level
    let stakesLevel: 'personal' | 'professional' | 'life-death' | 'world-ending' = 'personal';
    if (content.toLowerCase().includes('world') || content.toLowerCase().includes('everyone')) {
      stakesLevel = 'world-ending';
    } else if (consequenceKeywords.some(k => content.toLowerCase().includes(k))) {
      stakesLevel = 'life-death';
    } else if (content.toLowerCase().includes('job') || content.toLowerCase().includes('career')) {
      stakesLevel = 'professional';
    }

    // Check player agency (active vs passive)
    const activeVerbs = content.match(/\b(she|he) (decides|chooses|fights|runs|attacks|defends)/gi) || [];
    const passiveVerbs = content.match(/\b(she|he) (watches|observes|waits|hides)/gi) || [];
    const playerAgency = activeVerbs.length > passiveVerbs.length;

    const consequences = consequenceKeywords.filter(keyword =>
      content.toLowerCase().includes(keyword)
    );

    const tension = Math.min(10, consequences.length + (playerAgency ? 2 : 0) + (areStakesClear ? 2 : 0));

    return {
      areStakesClear,
      stakesLevel,
      consequences,
      playerAgency,
      tension
    };
  }

  // =================== MICRO DETAILS ANALYSIS ===================

  private analyzeMicroDetails(content: string, chapterType: 'action' | 'emotional' | 'revelation' | 'setup'): MicroDetailsAnalysis {
    const mundaneDetails = [
      /dinner/gi, /cleaning/gi, /cold\b/gi, /wondered if/gi, /getting a/gi,
      /heading home/gi, /clean under/gi, /making her nose/gi
    ];

    const atmosphericDetails = [
      /dust/gi, /shadow/gi, /light/gi, /sound/gi, /smell/gi, /echo/gi,
      /creak/gi, /whisper/gi, /glow/gi, /shimmer/gi
    ];

    const distractingCount = mundaneDetails.reduce((count, pattern) =>
      count + (content.match(pattern) || []).length, 0
    );

    const atmosphericCount = atmosphericDetails.reduce((count, pattern) =>
      count + (content.match(pattern) || []).length, 0
    );

    // Context relevance depends on chapter type
    const isHighTension = chapterType === 'action' || chapterType === 'revelation';
    const contextRelevant = !isHighTension || distractingCount === 0;

    let balance: 'appropriate' | 'too-mundane' | 'too-sparse' = 'appropriate';
    if (distractingCount > 3) balance = 'too-mundane';
    if (atmosphericCount === 0) balance = 'too-sparse';

    return {
      contextRelevant,
      distractingCount,
      atmosphericCount,
      balance
    };
  }

  // =================== SCORING AND RECOMMENDATIONS ===================

  private calculateOverallScore(analysis: {
    emotionalCurve: EmotionalCurveAnalysis;
    pacing: PacingAnalysis;
    repetition: RepetitionAnalysis;
    showVsTell: ShowVsTellAnalysis;
    revelation: RevelationAnalysis;
    stakes: StakesAnalysis;
    microDetails: MicroDetailsAnalysis;
  }): number {
    let score = 100;

    // Emotional curve penalties
    if (!analysis.emotionalCurve.hasClimax) score -= 15;
    if (analysis.emotionalCurve.isMonotone) score -= 10;
    if (analysis.emotionalCurve.needsBreathing) score -= 10;

    // Pacing penalties
    if (!analysis.pacing.pacingMatch) score -= 10;

    // Repetition penalties
    score -= analysis.repetition.overusedWords.length * 2;
    score -= analysis.repetition.cliches.length * 3;

    // Show vs Tell penalties
    if (analysis.showVsTell.needsConversion) score -= 15;

    // Revelation penalties
    if (analysis.revelation.hasRevelation && analysis.revelation.issues.length > 0) {
      score -= analysis.revelation.issues.length * 5;
    }

    // Stakes penalties
    if (!analysis.stakes.areStakesClear) score -= 10;
    if (!analysis.stakes.playerAgency) score -= 8;

    // Details penalties
    if (!analysis.microDetails.contextRelevant) score -= 5;

    return Math.max(0, score);
  }

  private generateRecommendations(analysis: {
    emotionalCurve: EmotionalCurveAnalysis;
    pacing: PacingAnalysis;
    repetition: RepetitionAnalysis;
    showVsTell: ShowVsTellAnalysis;
    revelation: RevelationAnalysis;
    stakes: StakesAnalysis;
    microDetails: MicroDetailsAnalysis;
  }): QualityRecommendation[] {
    const recommendations: QualityRecommendation[] = [];

    // Emotional curve recommendations
    if (!analysis.emotionalCurve.hasClimax) {
      recommendations.push({
        category: 'emotional',
        severity: 'high',
        issue: `Climax at ${analysis.emotionalCurve.climaxPosition.toFixed(0)}% instead of 70-80%`,
        solution: 'Restructure chapter to place peak tension between 70-80% mark',
        autoFixable: false
      });
    }

    if (analysis.emotionalCurve.needsBreathing) {
      recommendations.push({
        category: 'emotional',
        severity: 'medium',
        issue: 'Too much consecutive high intensity',
        solution: 'Insert calmer moments between high-tension scenes',
        autoFixable: true
      });
    }

    // Pacing recommendations
    if (!analysis.pacing.pacingMatch) {
      recommendations.push({
        category: 'pacing',
        severity: 'medium',
        issue: analysis.pacing.issues[0] || 'Pacing mismatch',
        solution: `Adjust sentence length for ${analysis.pacing.sceneType} scene`,
        autoFixable: true
      });
    }

    // Repetition recommendations
    if (analysis.repetition.needsVariation) {
      recommendations.push({
        category: 'repetition',
        severity: 'medium',
        issue: `${analysis.repetition.overusedWords.length} overused words detected`,
        solution: 'Replace repeated words with synonyms',
        autoFixable: true
      });
    }

    // Show vs Tell recommendations
    if (analysis.showVsTell.needsConversion) {
      recommendations.push({
        category: 'show-tell',
        severity: 'high',
        issue: `Poor show/tell ratio: ${analysis.showVsTell.ratio.toFixed(1)}:1`,
        solution: 'Convert emotion/state tells to physical actions',
        autoFixable: true
      });
    }

    // Revelation recommendations
    analysis.revelation.issues.forEach(issue => {
      recommendations.push({
        category: 'revelation',
        severity: 'high',
        issue,
        solution: 'Show revelation through concrete details and character reactions',
        autoFixable: false
      });
    });

    // Stakes recommendations
    if (!analysis.stakes.areStakesClear) {
      recommendations.push({
        category: 'stakes',
        severity: 'high',
        issue: 'Stakes are unclear',
        solution: 'Explicitly state what character will lose if they fail',
        autoFixable: false
      });
    }

    return recommendations;
  }

  // =================== AUTO-CORRECTION METHODS ===================

  autoCorrectContent(content: string, recommendations: QualityRecommendation[]): string {
    let correctedContent = content;

    recommendations.forEach(rec => {
      if (!rec.autoFixable) return;

      switch (rec.category) {
        case 'repetition':
          correctedContent = this.autoFixRepetition(correctedContent);
          break;
        case 'show-tell':
          correctedContent = this.autoFixShowVsTell(correctedContent);
          break;
        case 'pacing':
          correctedContent = this.autoFixPacing(correctedContent);
          break;
        case 'emotional':
          correctedContent = this.autoFixEmotionalBreathing(correctedContent);
          break;
      }
    });

    return correctedContent;
  }

  private autoFixRepetition(content: string): string {
    let fixed = content;

    // Replace overused words with alternatives
    Object.entries(this.WORD_ALTERNATIVES).forEach(([word, alternatives]) => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = fixed.match(regex) || [];

      if (matches.length > this.OVERUSED_THRESHOLD) {
        let altIndex = 0;
        fixed = fixed.replace(regex, (match) => {
          if (altIndex === 0) {
            altIndex++;
            return match; // Keep first occurrence
          }
          const replacement = alternatives[altIndex % alternatives.length];
          altIndex++;
          return replacement;
        });
      }
    });

    return fixed;
  }

  private autoFixShowVsTell(content: string): string {
    let fixed = content;

    this.TELL_PATTERNS.forEach(pattern => {
      fixed = fixed.replace(pattern, (match) => {
        // Extract emotion from the tell phrase
        const emotionMatch = match.match(/(betrayed|confused|angry|sad|happy|excited|afraid)/i);
        if (emotionMatch) {
          const emotion = emotionMatch[1].toLowerCase();
          const physicalOptions = this.EMOTION_TO_PHYSICAL[emotion as keyof typeof this.EMOTION_TO_PHYSICAL];
          if (physicalOptions) {
            return physicalOptions[Math.floor(Math.random() * physicalOptions.length)];
          }
        }
        return match;
      });
    });

    return fixed;
  }

  private autoFixPacing(content: string): string {
    // This is a simplified version - would need more sophisticated sentence restructuring
    return content;
  }

  private autoFixEmotionalBreathing(content: string): string {
    // Insert breathing moments after high-intensity sequences
    const breathingMoments = [
      'She took a slow breath.',
      'The moment stretched.',
      'Silence settled between them.',
      'She steadied herself.'
    ];

    // Simple implementation - would need more sophisticated detection
    return content.replace(/(screamed|shattered|exploded)([^.]*\.)/g, (match) => {
      const breathingMoment = breathingMoments[Math.floor(Math.random() * breathingMoments.length)];
      return `${match}\n\n${breathingMoment}`;
    });
  }
}

// =================== EXPORT ===================

export const qualityController = new QualityController();