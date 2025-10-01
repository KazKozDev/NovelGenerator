/**
 * LLM Agent Architecture for Intelligent Chapter Editing
 * 
 * This agent uses a multi-step reasoning process to analyze and improve chapters
 */

import { generateGeminiText } from '../services/geminiService';
import { ParsedChapterPlan, AgentLogEntry } from '../types';

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
  const analysisPrompt = `You are an intelligent editing agent. Analyze this chapter and decide the best editing strategy.

**CHAPTER ${context.chapterNumber} ANALYSIS:**

**CRITIQUE NOTES:**
${context.critiqueNotes || 'No issues identified'}

**CHAPTER PLAN:**
${context.chapterPlanText}

**CHAPTER LENGTH:** ${context.chapterContent.length} characters

**YOUR TASK:**
Analyze the critique and decide on the best strategy:

1. **TARGETED-EDIT** - Use when:
   - Issues are language-level (metaphors, adjectives, verbs)
   - Structure and plot are solid
   - Changes needed are < 20% of text
   
2. **REGENERATE** - Use when:
   - Missing critical plan elements (moral dilemma, character complexity)
   - Structural problems (flat characters, no conflict)
   - Changes needed are > 30% of text
   
3. **POLISH** - Use when:
   - No major issues
   - Just needs minor improvements
   - Changes needed are < 10% of text
   
4. **SKIP** - Use when:
   - Chapter is strong as-is
   - Critique says "CHAPTER IS STRONG"

**RESPOND IN JSON:**
{
  "strategy": "targeted-edit|regenerate|polish|skip",
  "reasoning": "Brief explanation of why this strategy",
  "priority": "high|medium|low",
  "estimatedChanges": "Percentage or description of changes needed"
}`;

  const systemPrompt = "You are an intelligent editing agent that makes strategic decisions about how to improve text.";
  
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
  
  const prompt = `You are a precision editor making SURGICAL edits to fix specific issues.

**ISSUES TO FIX:**
${context.critiqueNotes}

**EDITING PROTOCOL:**
1. Identify each issue mentioned in critique
2. Make MINIMAL change to fix that specific issue
3. Preserve everything else exactly as-is
4. Do NOT rewrite sentences unless the issue is in that sentence

**SPECIFIC FIXES:**
- "stacked metaphors" → Keep ONE metaphor per paragraph, remove extras
- "too many adjectives" → Reduce to 1-2 adjectives per noun
- "weak verb + adverb" → Replace with single strong verb (e.g., "ran quickly" → "sprinted")
- "filtering" → Remove "she saw", "he felt", "she heard" constructions
- "fancy language" → Replace complex words with simple ones
- "telling emotions" → Show through action/dialogue instead

### SECOND-PASS RHYTHM & TEXTURE CHECKS:

**1. RHYTHM VARIATION (check every page):**
- Add at least one sentence under 5 words
- Add at least one sentence over 25 words
- Vary paragraph lengths from 1 line to 8+ lines
- Create tonal shifts (tense → calm → tense)

**2. HUNT REMAINING LLM PATTERNS:**
- Parallel structure 3+ times ("She saw X. She felt Y. She knew Z.") → break it
- "-ing" clause overuse ("Walking to the door, she noticed...") → rephrase
- Consistent action beat placement in dialogue → vary it
- Every paragraph ending with insight/emotion → some should trail off

**3. CONCRETE VS ABSTRACT RATIO:**
- Max 2 abstract emotions per paragraph
- At least 1 concrete physical detail per paragraph
- If describing feeling, add what character DOES

**4. DIALOGUE NATURALNESS:**
- People shouldn't always say exactly what they mean
- Add interruptions, topic changes, non-sequiturs
- Vary speech patterns between characters
- Include uncomfortable silences

**5. REMOVE FILTERS:**
Cut or replace: "she felt that...", "she realized...", "she noticed...", "it seemed..."
Just state the observation directly.

**6. ADD TEXTURE (every 2-3 pages):**
- One mundane detail (weather, background sound, bodily discomfort)
- One moment of character distraction
- One unresolved minor element (smell they can't place, sound they ignore)

**7. EMOTIONAL PACING:**
- If intensity stays high for 3+ paragraphs → add breathing room
- Not every scene should end on emotional peak → some trail off
- Add physical needs: bored, hungry, cold

**SENTENCE-LEVEL CHECKS:**
- If 3 sentences in a row start with subject → vary structure
- If 2 consecutive sentences use same verb tense → mix it up
- If adjectives cluster (3+ in one sentence) → cut to 1

**PARAGRAPH-LEVEL:**
- If paragraph is only internal thought → add physical action
- If paragraph is only action → maybe add one brief thought
- If paragraph is perfectly shaped → break it awkwardly

**ANTI-POLISH DIRECTIVE:**
If a passage feels too smooth, too polished, too balanced:
- Break a sentence awkwardly
- Add a sentence fragment
- Let a character trail off mid-thought
- Include an observation that goes nowhere

**REMEMBER:** Perfect prose is LLM prose. Human prose has wrinkles. Some clutter is human.

**CONSTRAINTS:**
- Change < 20% of text
- Preserve all plot points
- Keep all dialogue content (can adjust wording)
- Maintain character voices
- Do not add new scenes or remove existing ones

**CHAPTER TO EDIT:**
${context.chapterContent}

**OUTPUT:**
Return the edited chapter. Make only the necessary surgical fixes.`;

  const systemPrompt = "You are a precision editor who makes minimal, targeted changes to fix specific issues.";
  
  return await generateText(prompt, systemPrompt, undefined, 0.5, 0.8, 40);
}

/**
 * Strategy: Regeneration - Full rewrite following plan
 */
async function executeRegeneration(
  context: EditingContext,
  generateText: typeof generateGeminiText
): Promise<string> {
  
  const prompt = `You are regenerating a chapter that has serious structural issues. Follow the plan exactly.

**CHAPTER PLAN (MUST IMPLEMENT EVERY ELEMENT):**
${context.chapterPlanText}

**CRITICAL PLAN ELEMENTS TO INCLUDE:**
- Moral Dilemma: ${context.chapterPlan.moralDilemma || 'Not specified'}
- Character Complexity: ${context.chapterPlan.characterComplexity || 'Not specified'}
- Consequences: ${context.chapterPlan.consequencesOfChoices || 'Not specified'}
- Conflict Type: ${context.chapterPlan.conflictType || 'Not specified'}
- Tension Level: ${context.chapterPlan.tensionLevel || 5}/10

**ORIGINAL CHAPTER (reference for events/structure):**
${context.chapterContent.substring(0, 8000)}${context.chapterContent.length > 8000 ? '...(truncated)' : ''}

**PROBLEMS IN ORIGINAL:**
${context.critiqueNotes}

**REGENERATION PROTOCOL:**
1. Follow the chapter plan exactly - every element must appear
2. Fix all identified problems from critique
3. Keep the same events and plot progression from original
4. Preserve good dialogue and descriptions from original where possible
5. Ensure moral dilemma is CENTRAL to the chapter
6. Show character complexity through contradictions and choices
7. Demonstrate consequences of decisions clearly

**WRITING PRINCIPLES:**
- Show, don't tell
- Maximum ONE metaphor per paragraph
- Maximum 1-2 adjectives per noun
- Simple, clear language
- Strong verbs, minimal adverbs

**OUTPUT:**
Generate the improved chapter. This is a regeneration, so you can rewrite significantly, but you MUST implement all plan elements.`;

  const systemPrompt = "You are a story architect who regenerates chapters to perfectly match their plans while fixing structural issues.";
  
  return await generateText(prompt, systemPrompt, undefined, 0.7, 0.9, 60);
}

/**
 * Strategy: Polish - Light improvements with plan verification
 */
async function executePolish(
  context: EditingContext,
  generateText: typeof generateGeminiText
): Promise<string> {
  
  const prompt = `You are polishing a solid chapter. Make light improvements and verify plan elements.

**CHAPTER PLAN (verify these are present and clear):**
- Moral Dilemma: ${context.chapterPlan.moralDilemma || 'Not specified'}
- Character Complexity: ${context.chapterPlan.characterComplexity || 'Not specified'}
- Consequences: ${context.chapterPlan.consequencesOfChoices || 'Not specified'}

**MINOR ISSUES (if any):**
${context.critiqueNotes || 'No specific issues'}

**POLISHING PROTOCOL:**
1. Verify plan elements are present and clear
2. If moral dilemma is weak or missing, strengthen it subtly
3. If character complexity is weak, add a moment of contradiction
4. Fix any minor language issues
5. Tighten any verbose passages
6. Ensure strong chapter ending

### CRITICAL SECOND-PASS CHECKS:

**RHYTHM VARIATION:**
- Ensure at least one sentence under 5 words per page
- Ensure at least one sentence over 25 words per page
- Vary paragraph lengths (1 line to 8+ lines)
- Create tonal shifts (tense → calm → tense)

**HUNT LLM PATTERNS:**
- Break parallel structures ("She saw X. She felt Y. She knew Z.")
- Reduce "-ing" clause overuse
- Vary action beat placement in dialogue
- Not every paragraph should end with insight

**CONCRETE VS ABSTRACT:**
- Max 2 abstract emotions per paragraph
- At least 1 concrete physical detail per paragraph
- Show what character DOES when feeling something

**DIALOGUE NATURALNESS:**
- Add interruptions, topic changes, non-sequiturs
- Vary speech patterns between characters
- Include uncomfortable silences
- People don't always say what they mean

**REMOVE FILTERS:**
Cut: "she felt that...", "she realized...", "she noticed...", "it seemed..."

**ADD TEXTURE:**
- Mundane details (weather, sounds, discomfort)
- Character distractions
- Unresolved minor elements

**EMOTIONAL PACING:**
- Add breathing room after high intensity
- Some scenes should trail off, not peak
- Add physical needs (hunger, cold, boredom)

**ANTI-POLISH:**
If too smooth:
- Break a sentence awkwardly
- Add sentence fragments
- Let character trail off mid-thought
- Include observations that go nowhere

**REMEMBER:** Perfect prose is LLM prose. Human prose has wrinkles.

**CONSTRAINTS:**
- Change < 10% of text
- Preserve all good elements
- Make improvements feel natural, not forced
- Do not add unnecessary content

**CHAPTER TO POLISH:**
${context.chapterContent}

**OUTPUT:**
Return the polished chapter with light improvements.`;

  const systemPrompt = "You are a master editor who makes subtle improvements that elevate good writing to great.";
  
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
  
  const evaluationPrompt = `You are evaluating the quality of an edited chapter.

**ORIGINAL LENGTH:** ${original.length} characters
**REFINED LENGTH:** ${refined.length} characters

**CHAPTER PLAN REQUIREMENTS:**
- Moral Dilemma: ${context.chapterPlan.moralDilemma || 'Not specified'}
- Character Complexity: ${context.chapterPlan.characterComplexity || 'Not specified'}

**REFINED CHAPTER (first 3000 chars):**
${refined.substring(0, 3000)}...

**EVALUATE:**
1. Are plan elements (moral dilemma, character complexity) present? (0-30 points)
2. Is prose quality high (show don't tell, economy)? (0-30 points)
3. Is pacing appropriate? (0-20 points)
4. Are characters compelling? (0-20 points)

Provide quality score (0-100) and list of changes applied.`;

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
    
    const response = await generateText(evaluationPrompt, "You are a quality evaluator.", evaluationSchema, 0.3, 0.7, 20);
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
