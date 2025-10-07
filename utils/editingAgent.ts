/**
 * LLM Agent Architecture for Intelligent Chapter Editing
 * 
 * This agent uses a multi-step reasoning process to analyze and improve chapters
 */

import { generateGeminiText } from '../services/geminiService';
import { ParsedChapterPlan, AgentLogEntry } from '../types';
import { getFormattedPrompt, PromptNames } from './promptLoader';

export interface EditingContext {
  chapterContent: string;
  chapterPlan: ParsedChapterPlan;
  chapterPlanText: string;
  critiqueNotes: string;
  chapterNumber: number;
  onLog?: (entry: AgentLogEntry) => void; // Callback for UI logging
}

export interface AgentDecision {
  strategy: 'targeted-edit' | 'regenerate' | 'polish' | 'skip';
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
  estimatedChanges: string;
  confidence: number; // 0-100, how confident the agent is in this decision
}

export interface EditingResult {
  refinedContent: string;
  decision: AgentDecision;
  changesApplied: string[];
  qualityScore: number;
  logs: AgentLogEntry[]; // All logs from this editing session
}

/**
 * Helper to create and emit log entries
 */
function log(context: EditingContext, type: AgentLogEntry['type'], message: string, details?: any) {
  const entry: AgentLogEntry = {
    timestamp: Date.now(),
    chapterNumber: context.chapterNumber,
    type,
    message,
    details
  };
  
  // Console log
  const emoji = {
    decision: '🤖',
    execution: '⚙️',
    evaluation: '📊',
    iteration: '🔄',
    warning: '⚠️',
    success: '✅'
  }[type];
  
  console.log(`${emoji} ${message}`, details || '');
  
  // UI callback
  if (context.onLog) {
    context.onLog(entry);
  }
}

/**
 * Step 1: Agent analyzes the situation and decides on strategy
 */
export async function analyzeAndDecide(context: EditingContext): Promise<AgentDecision> {
  const { systemPrompt, userPrompt: analysisPrompt } = getFormattedPrompt(PromptNames.EDITING_AGENT_ANALYSIS, {
    chapter_number: context.chapterNumber,
    critique_notes: context.critiqueNotes || 'No issues identified',
    chapter_plan_text: context.chapterPlanText,
    chapter_length: context.chapterContent.length
  });
  
  try {
    const responseSchema = {
      type: 'object' as const,
      properties: {
        strategy: { type: 'string' as const, enum: ['targeted-edit', 'regenerate', 'polish', 'skip'] },
        reasoning: { type: 'string' as const },
        priority: { type: 'string' as const, enum: ['high', 'medium', 'low'] },
        estimatedChanges: { type: 'string' as const },
        confidence: { type: 'number' as const, description: 'Confidence level 0-100. High confidence (80+) means clear decision. Low confidence (<60) means uncertain.' }
      },
      required: ['strategy', 'reasoning', 'priority', 'estimatedChanges', 'confidence']
    };
    
    const response = await generateGeminiText(analysisPrompt, systemPrompt, responseSchema, 0.3, 0.7, 20);
    const decision = JSON.parse(response);
    
    // Log decision
    log(context, 'decision', `Strategy: ${decision.strategy} - ${decision.reasoning}`, {
      strategy: decision.strategy,
      confidence: decision.confidence,
      priority: decision.priority,
      estimatedChanges: decision.estimatedChanges
    });
    
    if (decision.confidence < 60) {
      log(context, 'warning', `LOW CONFIDENCE (${decision.confidence}%) - Agent is uncertain`, {
        confidence: decision.confidence
      });
    }
    
    return decision;
  } catch (e) {
    console.warn('Agent decision failed, falling back to heuristics:', e);
    return fallbackDecision(context);
  }
}

/**
 * Fallback decision logic if agent fails
 */
function fallbackDecision(context: EditingContext): AgentDecision {
  const critique = context.critiqueNotes.toLowerCase();
  
  if (!context.critiqueNotes || context.critiqueNotes.includes('CHAPTER IS STRONG')) {
    return {
      strategy: 'skip',
      reasoning: 'No issues identified or chapter marked as strong',
      priority: 'low',
      estimatedChanges: '0%',
      confidence: 90
    };
  }
  
  if (critique.includes('moral simplicity') || critique.includes('flat') || critique.includes('archetypal')) {
    return {
      strategy: 'regenerate',
      reasoning: 'Serious structural issues detected',
      priority: 'high',
      estimatedChanges: '40-60%',
      confidence: 75
    };
  }
  
  if (critique.includes('metaphor') || critique.includes('adjective') || critique.includes('adverb')) {
    return {
      strategy: 'targeted-edit',
      reasoning: 'Language-level issues detected',
      priority: 'medium',
      estimatedChanges: '10-20%',
      confidence: 70
    };
  }
  
  return {
    strategy: 'polish',
    reasoning: 'Minor improvements needed',
    priority: 'low',
    estimatedChanges: '5-10%',
    confidence: 65
  };
}

/**
 * Step 2: Agent executes the chosen strategy
 */
export async function executeStrategy(
  context: EditingContext,
  decision: AgentDecision,
  generateText: typeof generateGeminiText
): Promise<string> {
  
  const originalContent = context.chapterContent;
  
  switch (decision.strategy) {
    case 'skip':
      log(context, 'execution', 'Skipping edits - chapter is strong');
      return context.chapterContent;
      
    case 'targeted-edit':
      log(context, 'execution', 'Applying targeted edits');
      const targetedResult = await executeTargetedEdit(context, generateText);
      // Log diff for targeted edits
      if (targetedResult !== originalContent) {
        logDiff(context, originalContent, targetedResult, 'targeted-edit');
      }
      return targetedResult;
      
    case 'regenerate':
      log(context, 'execution', 'Regenerating chapter with plan');
      const regenerateResult = await executeRegeneration(context, generateText);
      // Log diff for regeneration
      if (regenerateResult !== originalContent) {
        logDiff(context, originalContent, regenerateResult, 'regenerate');
      }
      return regenerateResult;
      
    case 'polish':
      log(context, 'execution', 'Polishing chapter');
      const polishResult = await executePolish(context, generateText);
      // Log diff for polish
      if (polishResult !== originalContent) {
        logDiff(context, originalContent, polishResult, 'polish');
      }
      return polishResult;
      
    default:
      return context.chapterContent;
  }
}

/**
 * Helper to log text differences for visualization
 */
function logDiff(context: EditingContext, before: string, after: string, strategy: string) {
  const entry: AgentLogEntry = {
    timestamp: Date.now(),
    chapterNumber: context.chapterNumber,
    type: 'diff',
    message: `Text changes applied via ${strategy}`,
    beforeText: before,
    afterText: after,
    strategy: strategy
  };
  
  console.log(`📝 Diff captured for Chapter ${context.chapterNumber} (${strategy})`);
  
  // UI callback
  if (context.onLog) {
    context.onLog(entry);
  }
}

/**
 * Strategy: Targeted Edit - Surgical fixes for specific issues
 */
async function executeTargetedEdit(
  context: EditingContext,
  generateText: typeof generateGeminiText
): Promise<string> {
  
  const { systemPrompt, userPrompt: prompt } = getFormattedPrompt(PromptNames.EDITING_AGENT_TARGETED, {
    critique_notes: context.critiqueNotes,
    chapter_content: context.chapterContent
  });
  
  return await generateText(prompt, systemPrompt, undefined, 0.5, 0.8, 40);
}

/**
 * Strategy: Regeneration - Full rewrite following plan
 */
async function executeRegeneration(
  context: EditingContext,
  generateText: typeof generateGeminiText
): Promise<string> {
  
  const { systemPrompt, userPrompt: prompt } = getFormattedPrompt(PromptNames.EDITING_AGENT_REGENERATE, {
    chapter_plan_text: context.chapterPlanText,
    moral_dilemma: context.chapterPlan.moralDilemma || 'Not specified',
    character_complexity: context.chapterPlan.characterComplexity || 'Not specified',
    consequences_of_choices: context.chapterPlan.consequencesOfChoices || 'Not specified',
    conflict_type: context.chapterPlan.conflictType || 'Not specified',
    tension_level: context.chapterPlan.tensionLevel || 5,
    chapter_content_preview: context.chapterContent.substring(0, 8000) + (context.chapterContent.length > 8000 ? '...(truncated)' : ''),
    critique_notes: context.critiqueNotes
  });
  
  return await generateText(prompt, systemPrompt, undefined, 0.7, 0.9, 60);
}

/**
 * Strategy: Polish - Light improvements with plan verification
 */
async function executePolish(
  context: EditingContext,
  generateText: typeof generateGeminiText
): Promise<string> {
  
  const { systemPrompt, userPrompt: prompt } = getFormattedPrompt(PromptNames.EDITING_AGENT_POLISH, {
    moral_dilemma: context.chapterPlan.moralDilemma || 'Not specified',
    character_complexity: context.chapterPlan.characterComplexity || 'Not specified',
    consequences_of_choices: context.chapterPlan.consequencesOfChoices || 'Not specified',
    critique_notes: context.critiqueNotes || 'No specific issues',
    chapter_content: context.chapterContent
  });
  
  return await generateText(prompt, systemPrompt, undefined, 0.4, 0.8, 30);
}

/**
 * Step 3: Agent evaluates the result
 */
export async function evaluateResult(
  original: string,
  refined: string,
  context: EditingContext,
  generateText: typeof generateGeminiText
): Promise<{ qualityScore: number; changesApplied: string[] }> {
  
  const { systemPrompt: evaluationSystemPrompt, userPrompt: evaluationPrompt } = getFormattedPrompt(PromptNames.EDITING_AGENT_EVALUATION, {
    original_length: original.length,
    refined_length: refined.length,
    moral_dilemma: context.chapterPlan.moralDilemma || 'Not specified',
    character_complexity: context.chapterPlan.characterComplexity || 'Not specified',
    refined_chapter_preview: refined.substring(0, 3000) + '...'
  });

  try {
    const evaluationSchema = {
      type: 'object' as const,
      properties: {
        qualityScore: { type: 'number' as const, description: 'Quality score from 0-100' },
        changesApplied: { type: 'array' as const, items: { type: 'string' as const }, description: 'List of improvements made' },
        planElementsPresent: { type: 'boolean' as const, description: 'Are plan elements present?' },
        remainingIssues: { type: 'array' as const, items: { type: 'string' as const }, description: 'Any remaining problems' }
      },
      required: ['qualityScore', 'changesApplied', 'planElementsPresent', 'remainingIssues']
    };
    
    const response = await generateText(evaluationPrompt, evaluationSystemPrompt, evaluationSchema, 0.3, 0.7, 20);
    const evaluation = JSON.parse(response);
    
    log(context, 'evaluation', `Quality Score: ${evaluation.qualityScore}/100`, {
      qualityScore: evaluation.qualityScore,
      planElementsPresent: evaluation.planElementsPresent,
      changesApplied: evaluation.changesApplied,
      remainingIssues: evaluation.remainingIssues
    });
    
    return {
      qualityScore: evaluation.qualityScore,
      changesApplied: evaluation.changesApplied || []
    };
  } catch (e) {
    log(context, 'warning', `Evaluation failed: ${e}. Using default score.`);
    return {
      qualityScore: 75, // Default score
      changesApplied: ['Edits applied']
    };
  }
}

/**
 * Main Agent Workflow - Orchestrates the entire editing process with iterative refinement
 */
export async function agentEditChapter(
  context: EditingContext,
  generateText: typeof generateGeminiText
): Promise<EditingResult> {
  
  log(context, 'iteration', `Agent starting work on Chapter ${context.chapterNumber}`);
  
  const MAX_ITERATIONS = 2;
  let iteration = 1;
  let currentContent = context.chapterContent;
  let lastDecision: AgentDecision;
  let lastQualityScore = 0;
  let allChangesApplied: string[] = [];
  
  while (iteration <= MAX_ITERATIONS) {
    log(context, 'iteration', `Iteration ${iteration}/${MAX_ITERATIONS}`);
    
    // Step 1: Analyze and decide strategy
    const iterationContext = { ...context, chapterContent: currentContent };
    const decision = await analyzeAndDecide(iterationContext);
    lastDecision = decision;
    
    // If agent says skip, we're done
    if (decision.strategy === 'skip') {
      log(context, 'success', 'Chapter is strong, no changes needed');
      break;
    }
    
    // Step 2: Execute strategy
    const refinedContent = await executeStrategy(iterationContext, decision, generateText);
    
    // Step 3: Evaluate result
    const { qualityScore, changesApplied } = await evaluateResult(
      currentContent,
      refinedContent,
      context,
      generateText
    );
    
    lastQualityScore = qualityScore;
    allChangesApplied.push(...changesApplied);
    
    // Check if we need another iteration
    const needsRefinement = qualityScore < 70;
    const hasConfidence = decision.confidence >= 60;
    
    if (!needsRefinement) {
      log(context, 'success', `Quality threshold met (${qualityScore}/100)`, { qualityScore });
      currentContent = refinedContent;
      break;
    }
    
    if (iteration >= MAX_ITERATIONS) {
      log(context, 'warning', `Max iterations reached (${qualityScore}/100)`, { qualityScore });
      currentContent = refinedContent;
      break;
    }
    
    // Decide on next iteration strategy
    if (!hasConfidence && decision.strategy !== 'regenerate') {
      log(context, 'iteration', 'Low confidence + low quality → trying regeneration');
      context.critiqueNotes += '\n\nPREVIOUS ATTEMPT FAILED. Need complete regeneration following plan.';
    } else if (decision.strategy === 'targeted-edit') {
      log(context, 'iteration', 'Targeted edit insufficient → trying regeneration');
      context.critiqueNotes += '\n\nTargeted edits not enough. Need deeper structural changes.';
    } else {
      log(context, 'warning', `Quality still low after ${decision.strategy}`);
    }
    
    currentContent = refinedContent;
    iteration++;
  }
  
  log(context, 'success', `Agent completed Chapter ${context.chapterNumber} after ${iteration} iteration(s)`, {
    finalQuality: lastQualityScore,
    totalChanges: allChangesApplied.length
  });
  
  return {
    refinedContent: currentContent,
    decision: lastDecision,
    changesApplied: allChangesApplied,
    qualityScore: lastQualityScore,
    logs: [] // Logs are sent via callback, not stored here
  };
}
