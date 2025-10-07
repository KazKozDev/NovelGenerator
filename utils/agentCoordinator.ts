/**
 * Agent Coordinator - Central orchestrator for hybrid multi-agent chapter generation
 */

import { ChapterData, ParsedChapterPlan, Character } from '../types';
import { coherenceManager, ChapterContext, RepetitionReport, RepetitionConstraints } from './coherenceManager';
import { structureAgent, characterAgent, sceneAgent, DialogueRequirement } from './specialistAgents';
import { synthesisAgent } from './synthesisAgent';
import { agentEditChapter } from './editingAgent';
import { generateGeminiText } from '../services/geminiService';
import { storyContextDB, SharedChapterState, RevelationValidation, ContentLimitCheck, ToneGuidance, BalanceReport } from './storyContextDatabase';

// =================== INTERFACES ===================

export interface ChapterGenerationInput {
  chapterNumber: number;
  chapterPlan: ParsedChapterPlan;
  characters: Record<string, Character>;
  previousChapterEnd?: string;
  storyOutline: string;
  targetLength: number;
}

export interface GenerationPhaseResult {
  phaseName: string;
  duration: number;
  success: boolean;
  output?: any;
  errors?: string[];
  warnings?: string[];
}

export interface HybridGenerationResult {
  success: boolean;
  chapterData: ChapterData;
  phases: GenerationPhaseResult[];
  metadata: {
    totalTime: number;
    agentPerformance: Record<string, { time: number; confidence: number }>;
    qualityMetrics: {
      coherenceScore: number;
      integrationScore: number;
      polishScore: number;
    };
  };
}

export interface GenerationOptions {
  enableLightPolish: boolean;
  enableConsistencyCheck: boolean;
  enableFallbackToOldSystem: boolean;
  parallelProcessing: boolean;
  maxRetries: number;
}

// =================== AGENT COORDINATOR CLASS ===================

export class AgentCoordinator {
  private options: GenerationOptions;

  constructor(options: Partial<GenerationOptions> = {}) {
    this.options = {
      enableLightPolish: true,
      enableConsistencyCheck: true,
      enableFallbackToOldSystem: false, // Disable fallback to force coordinated system
      parallelProcessing: false, // Use sequential coordinated generation
      maxRetries: 2,
      ...options
    };
  }

  // =================== MAIN GENERATION METHOD ===================

  async generateChapter(input: ChapterGenerationInput): Promise<HybridGenerationResult> {
    const startTime = Date.now();
    const phases: GenerationPhaseResult[] = [];

    console.log(`🚀 Starting hybrid generation for Chapter ${input.chapterNumber}: "${input.chapterPlan.title}"`);

    try {
      // Phase 1: Context Preparation
      const contextPhase = await this.executePhase('Context Preparation', async () => {
        return await this.prepareContext(input);
      });
      phases.push(contextPhase);

      if (!contextPhase.success) {
        throw new Error('Context preparation failed');
      }

      const context = contextPhase.output as ChapterContext;

      // Phase 2: Coordinated Sequential Generation
      const generationPhase = await this.executePhase('Coordinated Specialist Generation', async () => {
        return await this.coordinatedSequentialGeneration(input, context);
      });
      phases.push(generationPhase);

      if (!generationPhase.success) {
        if (this.options.enableFallbackToOldSystem) {
          console.log('🔄 Falling back to old generation system...');
          return await this.fallbackToOldSystem(input);
        }
        throw new Error('Specialist generation failed');
      }

      const { structureOutput, characterOutput, sceneOutput } = generationPhase.output;

      // Phase 3: Synthesis with Macro Validation
      const synthesisPhase = await this.executePhase('Synthesis & Macro Validation', async () => {
        const balanceReport = storyContextDB.validateChapterBalance();

        return await this.synthesisWithValidation({
          structureOutput,
          characterOutput,
          sceneOutput,
          chapterNumber: input.chapterNumber,
          chapterTitle: input.chapterPlan.title,
          balanceReport
        });
      });
      phases.push(synthesisPhase);

      if (!synthesisPhase.success) {
        throw new Error('Content synthesis failed');
      }

      const synthesisResult = synthesisPhase.output;
      let finalContent = synthesisResult.integratedChapter;

      console.log(`🔗 Content synthesis completed with high-quality agent coordination`);

      // Phase 4: Light Polish (Optional)
      if (this.options.enableLightPolish) {
        const polishPhase = await this.executePhase('Light Polish', async () => {
          return await this.applyLightPolish(finalContent, input);
        });
        phases.push(polishPhase);

        if (polishPhase.success && polishPhase.output) {
          finalContent = polishPhase.output;
        }
      }

      // Phase 5: Repetition Check & Fix
      const repetitionPhase = await this.executePhase('Repetition Check', async () => {
        const repetitionReport = coherenceManager.checkForRepetition(finalContent, input.chapterNumber);

        if (repetitionReport.severity === 'high' || repetitionReport.totalRepetitions > 2) {
          console.log(`⚠️ High repetition detected in Chapter ${input.chapterNumber}:`, repetitionReport.issues.map(i => i.phrase));

          // Apply repetition fixes to final content
          let fixedContent = finalContent;
          for (const issue of repetitionReport.issues) {
            if (issue.severity === 'high') {
              // Simple repetition fix - could be enhanced
              const regex = new RegExp(issue.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
              const matches = fixedContent.match(regex);
              if (matches && matches.length > 1) {
                // Keep first occurrence, replace others with variations
                let replaceCount = 0;
                fixedContent = fixedContent.replace(regex, (match) => {
                  if (replaceCount === 0) {
                    replaceCount++;
                    return match; // Keep first
                  }
                  replaceCount++;
                  return this.getAlternativePhrase(match, issue.category);
                });
              }
            }
          }

          return { report: repetitionReport, fixedContent, fixed: fixedContent !== finalContent };
        }

        return { report: repetitionReport, fixedContent: finalContent, fixed: false };
      });
      phases.push(repetitionPhase);

      if (repetitionPhase.success && repetitionPhase.output?.fixed) {
        finalContent = repetitionPhase.output.fixedContent;
        console.log(`🔧 Applied repetition fixes to Chapter ${input.chapterNumber}`);
      }

      // Phase 6: Coherence Update
      const updatePhase = await this.executePhase('Coherence Update', async () => {
        const chapterData: ChapterData = {
          title: input.chapterPlan.title,
          content: finalContent,
          plan: this.formatChapterPlan(input.chapterPlan),
          summary: input.chapterPlan.summary
        };

        coherenceManager.updateFromGeneratedChapter(chapterData, input.chapterNumber);
        return chapterData;
      });
      phases.push(updatePhase);

      const finalChapterData = updatePhase.output as ChapterData;

      // Calculate metadata
      const metadata = this.calculateMetadata(phases, startTime);

      console.log(`✅ Hybrid generation complete for Chapter ${input.chapterNumber} (${metadata.totalTime}ms)`);

      return {
        success: true,
        chapterData: finalChapterData,
        phases,
        metadata
      };

    } catch (error) {
      console.error(`❌ Hybrid generation failed for Chapter ${input.chapterNumber}:`, error);

      if (this.options.enableFallbackToOldSystem) {
        console.log('🔄 Attempting fallback to old system...');
        return await this.fallbackToOldSystem(input);
      }

      return {
        success: false,
        chapterData: {
          title: input.chapterPlan.title,
          content: `Error generating chapter: ${error}`,
          plan: this.formatChapterPlan(input.chapterPlan)
        },
        phases,
        metadata: this.calculateMetadata(phases, startTime)
      };
    }
  }

  // =================== PHASE EXECUTION ===================

  private async executePhase<T>(
    phaseName: string,
    phaseFunction: () => Promise<T>
  ): Promise<GenerationPhaseResult> {
    const startTime = Date.now();
    console.log(`📋 Starting phase: ${phaseName}`);

    try {
      const output = await phaseFunction();
      const duration = Date.now() - startTime;

      console.log(`✅ Phase complete: ${phaseName} (${duration}ms)`);

      return {
        phaseName,
        duration,
        success: true,
        output
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error(`❌ Phase failed: ${phaseName} (${duration}ms):`, error);

      return {
        phaseName,
        duration,
        success: false,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  // =================== CONTEXT PREPARATION ===================

  private async prepareContext(input: ChapterGenerationInput): Promise<ChapterContext> {
    // Initialize coherence manager if first chapter
    if (input.chapterNumber === 1) {
      coherenceManager.initializeFromOutline(
        input.storyOutline,
        input.characters,
        10 // Assuming 10 chapters - should come from input
      );
    }

    // Prepare chapter context
    const context = coherenceManager.prepareChapterContext(
      input.chapterNumber,
      input.chapterPlan
    );

    console.log(`📋 Context prepared with ${context.structure.plotThreadsToAdvance.length} plot threads`);
    return context;
  }

  // =================== SPECIALIST GENERATION ===================

  private async parallelSpecialistGeneration(
    input: ChapterGenerationInput,
    context: ChapterContext
  ) {
    console.log(`⚡ Running specialist agents in parallel...`);

    const [structureOutput, characterOutput, sceneOutput] = await Promise.all([
      structureAgent.generate({
        chapterPlan: input.chapterPlan,
        chapterNumber: input.chapterNumber,
        context: context.structure,
        constraints: context.constraints,
        previousChapterEnd: input.previousChapterEnd,
        targetLength: input.targetLength,
        storyOutline: input.storyOutline
      }),
      characterAgent.generate({
        chapterPlan: input.chapterPlan,
        chapterNumber: input.chapterNumber,
        context: context.character,
        constraints: context.constraints,
        structureSlots: { dialogueSlots: [], actionSlots: [], internalSlots: [], descriptionSlots: [] }, // Will be filled after structure
        dialogueRequirements: this.generateDialogueRequirements(input.chapterPlan, input.characters),
        storyOutline: input.storyOutline
      }),
      sceneAgent.generate({
        chapterPlan: input.chapterPlan,
        chapterNumber: input.chapterNumber,
        context: context.scene,
        constraints: context.constraints,
        structureSlots: { dialogueSlots: [], actionSlots: [], internalSlots: [], descriptionSlots: [] }, // Will be filled after structure
        storyOutline: input.storyOutline
      })
    ]);

    // Update character and scene outputs with actual structure slots
    const updatedCharacterOutput = await this.updateWithStructureSlots(
      characterOutput,
      structureOutput,
      input,
      context
    );

    const updatedSceneOutput = await this.updateWithStructureSlots(
      sceneOutput,
      structureOutput,
      input,
      context
    );

    return {
      structureOutput,
      characterOutput: updatedCharacterOutput,
      sceneOutput: updatedSceneOutput
    };
  }

  private async sequentialSpecialistGeneration(
    input: ChapterGenerationInput,
    context: ChapterContext
  ) {
    console.log(`🔄 Running specialist agents sequentially...`);

    // First: Structure Agent
    const structureOutput = await structureAgent.generate({
      chapterPlan: input.chapterPlan,
      chapterNumber: input.chapterNumber,
      context: context.structure,
      constraints: context.constraints,
      previousChapterEnd: input.previousChapterEnd,
      targetLength: input.targetLength,
      storyOutline: input.storyOutline
    });

    console.log(`📊 Structure Agent created slots:`);
    console.log(`   - Dialogue slots: ${structureOutput.slots.dialogueSlots.length} - ${structureOutput.slots.dialogueSlots.join(', ')}`);
    console.log(`   - Action slots: ${structureOutput.slots.actionSlots.length} - ${structureOutput.slots.actionSlots.join(', ')}`);
    console.log(`   - Internal slots: ${structureOutput.slots.internalSlots.length} - ${structureOutput.slots.internalSlots.join(', ')}`);
    console.log(`   - Description slots: ${structureOutput.slots.descriptionSlots.length} - ${structureOutput.slots.descriptionSlots.join(', ')}`);

    // Then: Character Agent (with structure slots)
    const characterOutput = await characterAgent.generate({
      chapterPlan: input.chapterPlan,
      chapterNumber: input.chapterNumber,
      context: context.character,
      constraints: context.constraints,
      structureSlots: structureOutput.slots,
      dialogueRequirements: this.generateDialogueRequirements(input.chapterPlan, input.characters),
      storyOutline: input.storyOutline
    });

    // Finally: Scene Agent (with structure slots)
    const sceneOutput = await sceneAgent.generate({
      chapterPlan: input.chapterPlan,
      chapterNumber: input.chapterNumber,
      context: context.scene,
      constraints: context.constraints,
      structureSlots: structureOutput.slots,
      storyOutline: input.storyOutline
    });

    return {
      structureOutput,
      characterOutput,
      sceneOutput
    };
  }

  private generateDialogueRequirements(chapterPlan: ParsedChapterPlan, characters?: Record<string, any>): DialogueRequirement[] {
    const activeCharacters = characters ? Object.keys(characters) : ['protagonist'];
    const requirements: DialogueRequirement[] = [];

    // Main dialogue based on chapter focus
    if (chapterPlan.characterDevelopmentFocus) {
      requirements.push({
        slotId: 'DIALOGUE_CHARACTER_DEVELOPMENT',
        characters: activeCharacters.slice(0, 2),
        purpose: 'Character development and relationships',
        emotionalTone: chapterPlan.emotionalToneTension || 'neutral',
        subtext: chapterPlan.characterComplexity
      });
    }

    // Conflict-related dialogue
    if (chapterPlan.conflictType) {
      requirements.push({
        slotId: 'DIALOGUE_CONFLICT',
        characters: activeCharacters,
        purpose: `Address ${chapterPlan.conflictType} conflict`,
        emotionalTone: chapterPlan.emotionalToneTension || 'tense'
      });
    }

    // Plot advancement dialogue
    if (chapterPlan.plotAdvancement) {
      requirements.push({
        slotId: 'DIALOGUE_PLOT',
        characters: activeCharacters.slice(0, 2),
        purpose: 'Advance main plot',
        emotionalTone: chapterPlan.emotionalToneTension || 'neutral'
      });
    }

    // Default dialogue if no specific requirements
    if (requirements.length === 0) {
      requirements.push({
        slotId: 'DIALOGUE_MAIN',
        characters: activeCharacters.slice(0, 2),
        purpose: 'Advance story',
        emotionalTone: chapterPlan.emotionalToneTension || 'neutral'
      });
    }

    return requirements;
  }

  private async updateWithStructureSlots(
    agentOutput: any,
    structureOutput: any,
    input: ChapterGenerationInput,
    context: ChapterContext
  ) {
    // For parallel generation, we need to regenerate character/scene content
    // with actual structure slots. This is a simplification - in production
    // we'd have a more sophisticated update mechanism
    return agentOutput;
  }

  // =================== LIGHT POLISH ===================

  private async applyLightPolish(
    content: string,
    input: ChapterGenerationInput
  ): Promise<string> {
    console.log(`✨ Applying light polish to Chapter ${input.chapterNumber}...`);

    try {
      // Use existing editing system in "light polish" mode
      const editingResult = await agentEditChapter(
        {
          chapterContent: content,
          chapterPlan: input.chapterPlan,
          chapterPlanText: this.formatChapterPlan(input.chapterPlan),
          critiqueNotes: 'Light polish only - preserve specialist content quality',
          chapterNumber: input.chapterNumber,
          onLog: (entry) => {
            console.log(`📝 Editing log: ${entry.message}`);
          }
        },
        generateGeminiText
      );

      return editingResult.refinedContent;
    } catch (error) {
      console.warn('Light polish failed, returning original content:', error);
      return content;
    }
  }

  // =================== FALLBACK SYSTEM ===================

  private async fallbackToOldSystem(input: ChapterGenerationInput): Promise<HybridGenerationResult> {
    console.log('🔄 Using fallback to old generation system...');

    // This would implement fallback to the existing chapter generation system
    // For now, returning a placeholder
    return {
      success: false,
      chapterData: {
        title: input.chapterPlan.title,
        content: 'Fallback system not yet implemented - would use existing chapter generation',
        plan: this.formatChapterPlan(input.chapterPlan)
      },
      phases: [{
        phaseName: 'Fallback System',
        duration: 0,
        success: false,
        errors: ['Fallback system not yet implemented']
      }],
      metadata: {
        totalTime: 0,
        agentPerformance: {},
        qualityMetrics: {
          coherenceScore: 0,
          integrationScore: 0,
          polishScore: 0
        }
      }
    };
  }

  // =================== HELPER METHODS ===================

  private formatChapterPlan(plan: ParsedChapterPlan): string {
    return `Title: ${plan.title}
Summary: ${plan.summary}
Scene Breakdown: ${plan.sceneBreakdown}
Character Development: ${plan.characterDevelopmentFocus}
Conflict Type: ${plan.conflictType}
Tension Level: ${plan.tensionLevel}/10
Moral Dilemma: ${plan.moralDilemma}
Character Complexity: ${plan.characterComplexity}
Consequences: ${plan.consequencesOfChoices}`;
  }

  private calculateMetadata(phases: GenerationPhaseResult[], startTime: number) {
    const totalTime = Date.now() - startTime;
    const agentPerformance: Record<string, { time: number; confidence: number }> = {};

    // Extract agent performance from phases
    for (const phase of phases) {
      if (phase.output?.metadata) {
        const metadata = phase.output.metadata;
        agentPerformance[metadata.agentType] = {
          time: metadata.processingTime,
          confidence: metadata.confidence
        };
      }
    }

    // Calculate quality metrics (simplified)
    const qualityMetrics = {
      coherenceScore: phases.every(p => p.success) ? 90 : 60,
      integrationScore: phases.find(p => p.phaseName === 'Content Synthesis')?.success ? 85 : 50,
      polishScore: phases.find(p => p.phaseName === 'Light Polish')?.success ? 80 : 70
    };

    return {
      totalTime,
      agentPerformance,
      qualityMetrics
    };
  }

  // =================== REPETITION HELPERS ===================

  private getAlternativePhrase(originalPhrase: string, category: string): string {
    // Simple alternative phrase replacements for common repetitive patterns
    const alternatives: Record<string, string[]> = {
      'metaphors': [
        'металлический привкус страха -> горький вкус тревоги',
        'металлический привкус адреналина -> острый привкус возбуждения',
        'холодный пот -> ледяная испарина',
        'дрожь пробежала -> волна дрожи охватила',
        'сердце забилось -> пульс участился'
      ],
      'sensoryDescriptions': [
        'запах наполнил -> аромат достиг',
        'звук раздался -> шум прорезал тишину',
        'холод пронзил -> прохлада коснулась'
      ],
      'emotionalPhrases': [
        'страх сковал -> тревога охватила',
        'ужас парализовал -> испуг сковал'
      ]
    };

    // Try to find a direct replacement
    const categoryAlts = alternatives[category] || [];
    for (const alt of categoryAlts) {
      const [original, replacement] = alt.split(' -> ');
      if (originalPhrase.toLowerCase().includes(original.toLowerCase())) {
        return originalPhrase.replace(new RegExp(original, 'gi'), replacement);
      }
    }

    // Fallback: simple variation
    if (originalPhrase.includes('металлический')) {
      return originalPhrase.replace('металлический', 'горький');
    }
    if (originalPhrase.includes('холодный')) {
      return originalPhrase.replace('холодный', 'ледяной');
    }
    if (originalPhrase.includes('дрожь')) {
      return originalPhrase.replace('дрожь', 'волна дрожи');
    }

    // Last resort: mark as varied
    return `${originalPhrase} [варьировано]`;
  }

  // =================== COORDINATED GENERATION ===================

  private async coordinatedSequentialGeneration(input: ChapterGenerationInput, context: ChapterContext): Promise<any> {
    const sceneType = this.determineSceneType(input.chapterPlan);

    // Initialize Story Context DB for this chapter
    storyContextDB.initializeChapter(input.chapterNumber, sceneType);

    console.log(`🔄 Starting coordinated sequential generation (${sceneType} scene)`);

    // Step 1: Structure Agent with Story Memory Validation
    console.log('📋 Phase 1: Structure Planning with Story Memory');
    const structureOutput = await this.structureAgentWithValidation(input, context);

    if (!structureOutput.success) {
      throw new Error(`Structure validation failed: ${structureOutput.errors?.join(', ')}`);
    }

    // Step 2: Character Agent with Content Limits
    console.log('👥 Phase 2: Character Generation with Content Limits');
    const characterOutput = await this.characterAgentWithLimits(structureOutput, input, context);

    if (!characterOutput.success) {
      throw new Error(`Character generation failed: ${characterOutput.errors?.join(', ')}`);
    }

    // Register character output for tone analysis
    storyContextDB.registerCharacterOutput(characterOutput.content);

    // Step 3: Scene Agent with Tone Awareness
    console.log('🎬 Phase 3: Scene Generation with Tone Coordination');
    const sceneOutput = await this.sceneAgentWithToneAwareness(structureOutput, characterOutput.content, input, context);

    if (!sceneOutput.success) {
      throw new Error(`Scene generation failed: ${sceneOutput.errors?.join(', ')}`);
    }

    return {
      structureOutput: structureOutput.framework,
      characterOutput: characterOutput.content,
      sceneOutput: sceneOutput.content,
      coordinationMetadata: {
        sceneType,
        toneDetected: storyContextDB.getSharedState().currentTone,
        contentLimitsApplied: characterOutput.limitsApplied || [],
        toneCoordination: sceneOutput.toneAdaptation || 'none'
      }
    };
  }

  private async structureAgentWithValidation(input: ChapterGenerationInput, context: ChapterContext): Promise<any> {
    // Check for planned revelations in this chapter
    const chapterPlan = input.chapterPlan;

    // More intelligent revelation detection - look for specific revelation keywords
    const summary = chapterPlan.summary?.toLowerCase() || '';
    const hasSignificantRevelation = (
      summary.includes('major reveal') ||
      summary.includes('discovers the truth') ||
      summary.includes('shocking revelation') ||
      summary.includes('reveals the secret') ||
      (summary.includes('reveal') && (summary.includes('identity') || summary.includes('betrayal') || summary.includes('conspiracy')))
    );

    if (hasSignificantRevelation) {
      console.log('🔍 Checking major revelation timing and context...');

      // More nuanced context check - Chapter 1 can have setup revelations, but not major story revelations
      const isEarlyChapter = input.chapterNumber <= 2;
      const isSetupRevelation = summary.includes('setup') || summary.includes('introduction') || summary.includes('beginning');

      if (isEarlyChapter && !isSetupRevelation) {
        console.log('⚠️ Major revelation may need more context establishment');
        // Don't block, just warn - let the generation proceed but note the concern
        console.log('🔄 Proceeding with generation but flagging for review...');
      }
    }

    // Call original structure agent (would be enhanced with story memory)
    try {
      const result = await structureAgent.generate({
        chapterPlan: input.chapterPlan,
        chapterNumber: input.chapterNumber,
        context: context.structure,
        constraints: context.constraints,
        previousChapterEnd: input.previousChapterEnd,
        targetLength: input.targetLength,
        storyOutline: input.storyOutline
      });

      return {
        success: true,
        framework: result.chapterStructure,
        slots: result.slots,
        metadata: result.metadata
      };
    } catch (error: any) {
      return {
        success: false,
        errors: [error.message]
      };
    }
  }

  private async characterAgentWithLimits(structureOutput: any, input: ChapterGenerationInput, context: any): Promise<any> {
    try {
      // Extract character names from the input characters
      const activeCharacters = input.characters ? Object.keys(input.characters) : ['protagonist'];

      // Call character agent
      const result = await characterAgent.generate({
        chapterPlan: input.chapterPlan,
        chapterNumber: input.chapterNumber,
        context: context.character || {
          activeCharacters: activeCharacters,
          characterStates: input.characters || {},
          relationshipDynamics: [],
          emotionalJourneys: [],
          goalsAndMotivations: []
        },
        constraints: context.constraints || {
          mustNotContradictFacts: [],
          mustRespectRelationships: [],
          mustFollowWorldRules: [],
          mustAdvancePlotThreads: [],
          mustMaintainCharacterConsistency: []
        },
        structureSlots: structureOutput.slots || {
          dialogueSlots: ['DIALOGUE_1', 'DIALOGUE_2'],
          actionSlots: ['ACTION_1'],
          internalSlots: ['INTERNAL_1'],
          descriptionSlots: ['DESCRIPTION_1']
        },
        dialogueRequirements: [
          {
            slotId: 'DIALOGUE_1',
            characters: activeCharacters.slice(0, 2),
            purpose: 'Advance plot',
            emotionalTone: input.chapterPlan.emotionalToneTension || 'neutral'
          }
        ],
        storyOutline: input.storyOutline
      });

      const content = result.content.characterContent || '';

      // Check content limits
      const limitCheck = storyContextDB.checkContentLimits('character', content);

      if (!limitCheck.allowed) {
        console.log(`⚠️ Content limits exceeded: ${limitCheck.reason}`);

        // Apply automatic corrections based on suggestion
        let correctedContent = content;

        if (limitCheck.suggestedAction === 'condense-internal') {
          // Simple condensation logic
          correctedContent = this.condenseInternalMonologue(content);
          console.log('🔧 Applied internal monologue condensation');
        }

        if (limitCheck.suggestedAction === 'add-micro-action') {
          correctedContent = this.insertMicroActions(content);
          console.log('🔧 Added micro-actions to break up internal blocks');
        }

        return {
          success: true,
          content: correctedContent,
          limitsApplied: [limitCheck.suggestedAction],
          originalLimitIssue: limitCheck.reason
        };
      }

      return {
        success: true,
        content: content,
        limitsApplied: []
      };

    } catch (error: any) {
      return {
        success: false,
        errors: [error.message]
      };
    }
  }

  private async sceneAgentWithToneAwareness(structureOutput: any, characterContent: string, input: ChapterGenerationInput, context: any): Promise<any> {
    try {
      // Get tone guidance from Story Context DB
      const toneGuidance = storyContextDB.getToneGuidanceForScene();

      console.log(`🎭 Scene adapting to detected tone: ${storyContextDB.getSharedState().currentTone}`);
      console.log(`📏 Description guidance: ${toneGuidance.descriptionLength}, ${toneGuidance.sentenceStyle}`);

      // Call scene agent with tone guidance
      const result = await sceneAgent.generate({
        chapterPlan: input.chapterPlan,
        chapterNumber: input.chapterNumber,
        context: context.scene || {
          primaryLocation: {
            name: input.chapterPlan.primaryLocation || 'unknown location',
            description: 'Primary scene location',
            currentOccupants: [],
            securityLevel: 'neutral' as const,
            changes: []
          },
          secondaryLocations: [],
          atmosphereRequirements: {
            mood: input.chapterPlan.emotionalToneTension || 'neutral',
            tension: String(input.chapterPlan.tensionLevel || 5),
            sensoryFocus: ['visual', 'auditory']
          },
          worldStateRequirements: []
        },
        constraints: context.constraints || {
          mustNotContradictFacts: [],
          mustRespectRelationships: [],
          mustFollowWorldRules: [],
          mustAdvancePlotThreads: [],
          mustMaintainCharacterConsistency: []
        },
        structureSlots: structureOutput.slots || {
          dialogueSlots: ['DIALOGUE_1', 'DIALOGUE_2'],
          actionSlots: ['ACTION_1'],
          internalSlots: ['INTERNAL_1'],
          descriptionSlots: ['DESCRIPTION_1']
        },
        storyOutline: input.storyOutline
      });

      return {
        success: true,
        content: result.content.sceneDescriptions || '',
        toneAdaptation: `Adapted to ${storyContextDB.getSharedState().currentTone} tone`
      };

    } catch (error: any) {
      return {
        success: false,
        errors: [error.message]
      };
    }
  }

  private async synthesisWithValidation(input: any): Promise<any> {
    try {
      // Create compatible output objects for synthesis agent
      const structureAgentOutput = {
        chapterStructure: input.structureOutput,
        plotAdvancement: [],
        pacingNotes: [],
        transitionPoints: [],
        slots: {
          dialogueSlots: [],
          actionSlots: [],
          internalSlots: [],
          descriptionSlots: []
        },
        content: {},
        metadata: {
          agentType: 'Structure',
          processingTime: 0,
          confidence: 0.8,
          notes: []
        }
      };

      const characterAgentOutput = {
        characterContent: input.characterOutput,
        slotsFilled: [],
        dialogueGenerated: [],
        internalMonologue: [],
        dialogueContent: {},
        internalThoughts: {},
        characterMoments: [],
        emotionalProgression: [],
        content: { characterContent: input.characterOutput },
        metadata: {
          agentType: 'Character',
          processingTime: 0,
          confidence: 0.8,
          notes: []
        }
      };

      const sceneAgentOutput = {
        sceneDescriptions: input.sceneOutput,
        atmosphericElements: [],
        sensoryDetails: [],
        settingEstablishment: '',
        descriptions: {},
        actionContent: {},
        content: { sceneDescriptions: input.sceneOutput },
        metadata: {
          agentType: 'Scene',
          processingTime: 0,
          confidence: 0.8,
          notes: []
        }
      };

      // First, run normal synthesis
      const synthesisResult = await synthesisAgent.integrate({
        structureOutput: structureAgentOutput,
        characterOutput: characterAgentOutput,
        sceneOutput: sceneAgentOutput,
        chapterNumber: input.chapterNumber,
        chapterTitle: input.chapterTitle
      });

      let finalContent = synthesisResult.integratedChapter;

      // Then, run macro validation
      const balanceReport = input.balanceReport;

      if (balanceReport.issues.length > 0) {
        console.log(`⚠️ Balance issues detected:`, balanceReport.issues.map(i => i.type));

        // Apply automatic corrections
        for (const issue of balanceReport.issues) {
          switch (issue.type) {
            case 'description-overload':
              finalContent = this.reduceDescriptionDensity(finalContent);
              console.log('🔧 Reduced description density');
              break;

            case 'internal-overload':
              finalContent = this.breakUpInternalMonologue(finalContent);
              console.log('🔧 Broke up internal monologue blocks');
              break;

            case 'consecutive-description':
              finalContent = this.insertActionBeats(finalContent);
              console.log('🔧 Inserted action beats between descriptions');
              break;
          }
        }
      }

      return {
        ...synthesisResult,
        integratedChapter: finalContent,
        balanceCorrections: balanceReport.issues.map(i => i.type)
      };

    } catch (error: any) {
      throw new Error(`Synthesis with validation failed: ${error.message}`);
    }
  }

  // =================== CONTENT CORRECTION HELPERS ===================

  private determineSceneType(chapterPlan: any): SharedChapterState['sceneType'] {
    const summary = chapterPlan.summary?.toLowerCase() || '';

    if (summary.includes('fight') || summary.includes('battle') || summary.includes('chase')) {
      return 'action';
    }
    if (summary.includes('reveal') || summary.includes('truth') || summary.includes('discover')) {
      return 'revelation';
    }
    if (summary.includes('emotion') || summary.includes('feel') || summary.includes('remember')) {
      return 'emotional';
    }
    if (summary.includes('final') || summary.includes('climax') || summary.includes('end')) {
      return 'climax';
    }

    return 'setup';
  }

  private condenseInternalMonologue(content: string): string {
    // Simple condensation: find long internal blocks and shorten them
    return content.replace(/(\[INTERNAL[^\]]*\][^[]{200,})/g, (match) => {
      const words = match.split(/\s+/);
      if (words.length > 50) {
        return words.slice(0, 50).join(' ') + '...';
      }
      return match;
    });
  }

  private insertMicroActions(content: string): string {
    // Insert micro-actions between internal blocks
    const microActions = [
      'She shifted in her seat.',
      'He took a breath.',
      'Her gaze dropped.',
      'He clenched his fist.',
      'She looked away.'
    ];

    let actionIndex = 0;
    return content.replace(/(\[INTERNAL[^\]]*\][^[]+)(\[INTERNAL)/g, (match, first, second) => {
      const action = microActions[actionIndex % microActions.length];
      actionIndex++;
      return `${first}\n\n${action}\n\n${second}`;
    });
  }

  private reduceDescriptionDensity(content: string): string {
    // Remove excessive adjectives and sensory details
    return content.replace(/(\w+),\s*(\w+),\s*(\w+)\s*(smell|sound|taste|feel)/g, '$4');
  }

  private breakUpInternalMonologue(content: string): string {
    // Similar to insertMicroActions but for final content
    return this.insertMicroActions(content);
  }

  private insertActionBeats(content: string): string {
    // Insert physical actions between long description blocks
    const actionBeats = [
      'She moved closer.',
      'He scanned the room.',
      'The moment stretched.',
      'Something shifted.'
    ];

    // This would be more sophisticated in real implementation
    return content.replace(/(\.)\s*([A-Z][^.]{100,}\.)\s*([A-Z][^.]{100,}\.)/g, (match, end1, desc1, desc2) => {
      const beat = actionBeats[Math.floor(Math.random() * actionBeats.length)];
      return `${end1} ${desc1}\n\n${beat}\n\n${desc2}`;
    });
  }

  // =================== CONFIGURATION ===================

  updateOptions(newOptions: Partial<GenerationOptions>): void {
    this.options = { ...this.options, ...newOptions };
    console.log('📝 Agent coordinator options updated:', this.options);
  }

  getOptions(): GenerationOptions {
    return { ...this.options };
  }
}

// =================== EXPORT ===================

export const agentCoordinator = new AgentCoordinator();