import { useState, useCallback, useRef, useEffect } from 'react';
import { Character, ChapterData, GenerationStep, ParsedChapterPlan, TimelineEntry, EmotionalArcEntry, StorySettings, AgentLogEntry } from '../types';
import { generateGeminiText, generateGeminiTextStream } from '../services/geminiService';
import { extractCharactersFromString, extractWorldNameFromString, extractMotifsFromString } from '../utils/parserUtils';
import { getWritingExamplesPrompt } from '../utils/writingExamples';
import { checkChapterConsistency } from '../utils/consistencyChecker';
import { getGenreGuidelines } from '../utils/genrePrompts';
import { getStylePrompt } from '../utils/styleConfig';
import { getSceneDialogueGuidelines } from '../utils/dialogueSystem';
import { agentEditChapter } from '../utils/editingAgent';
import { performFinalEditingPass, shouldPerformFinalPass } from '../utils/finalEditingPass';
import { applyProfessionalPolish } from '../utils/professionalPolishAgent';
import { playSuccessSound, playNotificationSound } from '../utils/soundUtils';
import { GEMINI_MODEL_NAME } from '../constants';
import { OUTLINE_PARAMS, CHAPTER_CONTENT_PARAMS, ANALYSIS_PARAMS, EDITING_PARAMS, EXTRACTION_PARAMS, TITLE_PARAMS } from '../constants/generationParams';
import { Type } from '@google/genai';

const STORAGE_KEY = 'novelGeneratorState';

const useBookGenerator = () => {
  const [storyPremise, setStoryPremise] = useState<string>('');
  const [numChapters, setNumChapters] = useState<number>(3);
  const [storySettings, setStorySettings] = useState<StorySettings>({
    genre: 'fantasy',
    narrativeVoice: 'third-limited',
    tone: 'serious',
    targetAudience: 'adult',
    writingStyle: 'descriptive'
  });
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<GenerationStep>(GenerationStep.Idle);
  const [error, setError] = useState<string | null>(null);
  const [isResumable, setIsResumable] = useState<boolean>(false);
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);


  const [currentStoryOutline, setCurrentStoryOutline] = useState<string>('');
  const [currentChapterPlan, setCurrentChapterPlan] = useState<string>('');
  const [characters, setCharacters] = useState<Record<string, Character>>({});
  const [worldName, setWorldName] = useState<string>('');
  const [recurringMotifs, setRecurringMotifs] = useState<string[]>([]);
  const [parsedChapterPlans, setParsedChapterPlans] = useState<ParsedChapterPlan[]>([]);
  
  const [generatedChapters, setGeneratedChapters] = useState<ChapterData[]>([]);
  
  const [currentChapterProcessing, setCurrentChapterProcessing] = useState<number>(0);
  const [totalChaptersToProcess, setTotalChaptersToProcess] = useState<number>(0);

  const [finalBookContent, setFinalBookContent] = useState<string | null>(null);
  const [finalMetadataJson, setFinalMetadataJson] = useState<string | null>(null);

  // Use refs for mutable data that doesn't need to trigger re-renders on every change during generation
  const charactersRef = useRef<Record<string, Character>>({});
  const chapterSummariesRef = useRef<Record<number, { title: string; summary: string }>>({});
  const timelineRef = useRef<Record<number, TimelineEntry>>({});
  const emotionalArcRef = useRef<Record<number, EmotionalArcEntry>>({});
  const transitionsRef = useRef<Record<number, string>>({});

  const _saveStateToLocalStorage = useCallback(() => {
    const stateToSave = {
      storyPremise,
      numChapters,
      currentStep,
      currentStoryOutline,
      parsedChapterPlans,
      worldName,
      recurringMotifs,
      generatedChapters,
      totalChaptersToProcess,
      finalBookContent,
      finalMetadataJson,
      characters: charactersRef.current,
      chapterSummaries: chapterSummariesRef.current,
      timeline: timelineRef.current,
      emotionalArc: emotionalArcRef.current,
      transitions: transitionsRef.current,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [
      storyPremise, numChapters, currentStep, currentStoryOutline, parsedChapterPlans,
      worldName, recurringMotifs, generatedChapters, totalChaptersToProcess,
      finalBookContent, finalMetadataJson
  ]);
  
  // Effect to save state whenever a key dependency changes
  useEffect(() => {
    // We don't save during loading to avoid inconsistent states.
    // Saving is done explicitly via _saveStateToLocalStorage() at key checkpoints.
  }, [
      storyPremise, numChapters, currentStep, currentStoryOutline, parsedChapterPlans,
      worldName, recurringMotifs, generatedChapters, totalChaptersToProcess,
      finalBookContent, finalMetadataJson, _saveStateToLocalStorage
  ]);

  // FIX: Added useEffect to guarantee saving state immediately after final content is set.
  // This prevents a race condition where the book is generated but not saved before a potential reload.
  useEffect(() => {
    if (finalBookContent && finalMetadataJson) {
      _saveStateToLocalStorage();
    }
  }, [finalBookContent, finalMetadataJson, _saveStateToLocalStorage]);


  useEffect(() => {
    const savedStateJSON = localStorage.getItem(STORAGE_KEY);
    if (savedStateJSON) {
      try {
        const savedState = JSON.parse(savedStateJSON);
        
        setStoryPremise(savedState.storyPremise || '');
        setNumChapters(savedState.numChapters || 3);
        const loadedStep = savedState.currentStep || GenerationStep.Idle;
        setCurrentStep(loadedStep);
        setCurrentStoryOutline(savedState.currentStoryOutline || '');
        const loadedPlans = savedState.parsedChapterPlans || [];
        setParsedChapterPlans(loadedPlans);
        setCurrentChapterPlan(loadedPlans.length > 0 ? JSON.stringify(loadedPlans, null, 2) : '');
        setWorldName(savedState.worldName || '');
        setRecurringMotifs(savedState.recurringMotifs || []);
        const loadedChapters = savedState.generatedChapters || [];
        setGeneratedChapters(loadedChapters);
        setTotalChaptersToProcess(savedState.totalChaptersToProcess || savedState.numChapters || 3);
        setFinalBookContent(savedState.finalBookContent || null);
        setFinalMetadataJson(savedState.finalMetadataJson || null);

        charactersRef.current = savedState.characters || {};
        chapterSummariesRef.current = savedState.chapterSummaries || {};
        timelineRef.current = savedState.timeline || {};
        emotionalArcRef.current = savedState.emotionalArc || {};
        transitionsRef.current = savedState.transitions || {};

        setCharacters(charactersRef.current);
        setCurrentChapterProcessing(loadedChapters.length);

        if (loadedStep && loadedStep !== GenerationStep.Idle && loadedStep !== GenerationStep.Done && loadedStep !== GenerationStep.Error) {
          setIsResumable(true);
        }

      } catch (e) {
        console.error("Failed to parse saved state, clearing it.", e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);


  const resetGenerator = useCallback(() => {
    setStoryPremise('');
    setNumChapters(3);
    setIsLoading(false);
    setCurrentStep(GenerationStep.Idle);
    setError(null);
    setIsResumable(false);
    setCurrentStoryOutline('');
    setCurrentChapterPlan('');
    setCharacters({});
    setWorldName('');
    setRecurringMotifs([]);
    setParsedChapterPlans([]);
    setGeneratedChapters([]);
    setCurrentChapterProcessing(0);
    setTotalChaptersToProcess(0);
    setFinalBookContent(null);
    setFinalMetadataJson(null);
    setAgentLogs([]);

    charactersRef.current = {};
    chapterSummariesRef.current = {};
    timelineRef.current = {};
    emotionalArcRef.current = {};
    transitionsRef.current = {};
    
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const _generateOutline = useCallback(async (premise: string, chaptersCount: number) => {
    setCurrentStep(GenerationStep.GeneratingOutline);
    const systemPromptOutline = `You are a professional novelist and editor who creates compelling, structured, and detailed story outlines.`;
    const promptOutline = `Based on the following story premise, create a detailed story outline for a ${chaptersCount}-chapter book. The outline should be comprehensive, covering main plot points, character arcs, subplots, and key events for each part of the story (beginning, middle, and end).
    
    STORY PREMISE: "${premise}"
    
    **🚫 CRITICAL: FORBIDDEN WORDS - DO NOT USE AS CHARACTER NAMES OR IN ANY CONTEXT:**
    NEVER use these words anywhere in the outline (including character names, place names, or descriptions):
    - "obsidian" or any derivatives (obsidian-like, Obsidian as name)
    - "thorn", "thorne", or any derivatives (thorns, thorny, Thorne as name, Thornfield, etc.)
    - "crystalline", "gossamer", "eldritch", "ephemeral", "ethereal", "luminescent"
    
    Use alternative words: "black stone", "spike", "sharp point", "clear", "thin", "strange", "brief", "faint", "glowing"
    This applies to ALL parts of the outline including character names and locations.
    
    Please structure your response with the following sections clearly marked:
    1.  **LOGLINE:** A single sentence summarizing the core conflict.
    2.  **MAIN CHARACTERS:** A list of the main characters with a brief (2-3 sentence) description of their personality, motivation, and core conflict/arc.
    3.  **STORY ARC (THREE ACT STRUCTURE):**
        *   **ACT I (The Setup):** Introduction to the world and characters, the inciting incident, and the protagonist's initial goal. (Covers roughly the first 25% of chapters).
        *   **ACT II (The Confrontation):** Rising action, new challenges, character development, introduction of allies and enemies, the midpoint (a major turning point), and escalating stakes. (Covers roughly the next 50% of chapters).
        *   **ACT III (The Resolution):** The climax, falling action, and the final resolution of the main plot and character arcs. (Covers roughly the final 25% of chapters).
    4.  **WORLD BUILDING DETAILS:** Key details about the setting, magic system (if any), culture, etc.
    5.  **RECURRING MOTIFS/THEMES:** List 3-5 recurring symbols, ideas, or themes that will be woven throughout the narrative.`;
    const outlineText = await generateGeminiText(promptOutline, systemPromptOutline, undefined, OUTLINE_PARAMS.temperature, OUTLINE_PARAMS.topP, OUTLINE_PARAMS.topK);
    if (!outlineText) throw new Error("Failed to generate story outline.");
    setCurrentStoryOutline(outlineText);
    setCurrentStep(GenerationStep.WaitingForOutlineApproval);
    _saveStateToLocalStorage();
  }, [_saveStateToLocalStorage]);

  const continueGeneration = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setIsResumable(false);
    
    // FIX: This local variable will hold the definitive, up-to-date chapter data
    // for the final compilation, avoiding stale state issues from 'generatedChapters'.
    const chaptersForCompilation: ChapterData[] = [...generatedChapters];

    try {
      const outlineText = currentStoryOutline;
      if (!outlineText) throw new Error("Cannot continue without a story outline.");

      // Parallelize extraction operations for better performance
      const needsCharacters = Object.keys(charactersRef.current).length === 0;
      const needsWorldName = !worldName;
      const needsMotifs = recurringMotifs.length === 0;

      if (needsCharacters || needsWorldName || needsMotifs) {
        setCurrentStep(GenerationStep.ExtractingCharacters); // Show first extraction step
        
        const extractionPromises = [];
        
        if (needsCharacters) {
          extractionPromises.push(
            extractCharactersFromString(outlineText, (prompt, system) => 
              generateGeminiText(prompt, system, undefined, EXTRACTION_PARAMS.temperature, EXTRACTION_PARAMS.topP, EXTRACTION_PARAMS.topK)
            ).then(result => ({ type: 'characters', data: result }))
          );
        }
        
        if (needsWorldName) {
          extractionPromises.push(
            extractWorldNameFromString(outlineText, (prompt, system) => 
              generateGeminiText(prompt, system, undefined, EXTRACTION_PARAMS.temperature, EXTRACTION_PARAMS.topP, EXTRACTION_PARAMS.topK)
            ).then(result => ({ type: 'worldName', data: result }))
          );
        }
        
        if (needsMotifs) {
          extractionPromises.push(
            extractMotifsFromString(outlineText, (prompt, system) => 
              generateGeminiText(prompt, system, undefined, EXTRACTION_PARAMS.temperature, EXTRACTION_PARAMS.topP, EXTRACTION_PARAMS.topK)
            ).then(result => ({ type: 'motifs', data: result }))
          );
        }

        // Execute all extractions in parallel
        const results = await Promise.all(extractionPromises);
        
        // Process results
        for (const result of results) {
          if (result.type === 'characters') {
            setCharacters(result.data);
            charactersRef.current = result.data;
          } else if (result.type === 'worldName') {
            setWorldName(result.data);
          } else if (result.type === 'motifs') {
            setRecurringMotifs(result.data);
          }
        }
        
        _saveStateToLocalStorage();
      }

      let planArray = parsedChapterPlans;
      if (planArray.length === 0) {
          setCurrentStep(GenerationStep.GeneratingChapterPlan);
          const chapterPlanSchema: object = {
            type: Type.OBJECT, properties: { chapters: { type: Type.ARRAY, description: `An array of chapter plan objects, one for each of the ${numChapters} chapters.`, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, summary: { type: Type.STRING }, sceneBreakdown: { type: Type.STRING }, characterDevelopmentFocus: { type: Type.STRING }, plotAdvancement: { type: Type.STRING }, timelineIndicators: { type: Type.STRING }, emotionalToneTension: { type: Type.STRING }, connectionToNextChapter: { type: Type.STRING }, conflictType: { type: Type.STRING, description: "Type of conflict in this chapter: external, internal, interpersonal, or societal" }, tensionLevel: { type: Type.INTEGER, description: "Tension level from 1-10, where 1 is calm and 10 is peak intensity" }, rhythmPacing: { type: Type.STRING, description: "Chapter pacing: fast (action-heavy), medium (balanced), or slow (introspective)" }, wordEconomyFocus: { type: Type.STRING, description: "Specific economy focus: dialogue-heavy, action-focused, or atmosphere-light" }, moralDilemma: { type: Type.STRING, description: "The moral dilemma or ethical question this chapter explores. What difficult choice must be made? What are the costs?" }, characterComplexity: { type: Type.STRING, description: "How this chapter reveals character contradictions, flaws, or unexpected depths. Show that people are complex, not archetypes." }, consequencesOfChoices: { type: Type.STRING, description: "What are the consequences (positive and negative) of decisions made in this chapter? Show that choices have weight." }, }, required: ["title", "summary", "sceneBreakdown", "characterDevelopmentFocus", "plotAdvancement", "timelineIndicators", "emotionalToneTension", "connectionToNextChapter", "conflictType", "tensionLevel", "rhythmPacing", "wordEconomyFocus", "moralDilemma", "characterComplexity", "consequencesOfChoices"] } } }, required: ["chapters"]
          };
          const systemPromptPlan = `You are an expert story planner, creating detailed, structured, and actionable chapter-by-chapter plans for novelists. Your output MUST conform to the provided JSON schema.`;
          const chapterPlanPrompt = `Based on the provided STORY OUTLINE, create a detailed chapter-by-chapter plan for a ${numChapters}-chapter book. Generate a complete plan object for every chapter from 1 to ${numChapters}.

**Core Planning Principles:**
1.  **Purposeful Chapters:** Every chapter must advance the story through plot progression OR significant character development. No purely atmospheric chapters.
2.  **Conflict on Every Page:** Each chapter MUST contain meaningful conflict - external (fights, obstacles), internal (moral dilemmas), interpersonal (relationship tension), or societal (system vs. individual). Specify in 'conflictType'.
3.  **Moral Complexity (CRITICAL):** Every chapter should present a moral dilemma or ethical question. Characters must face difficult choices with no easy answers. Good people make bad choices. Bad people have understandable motivations. Specify in 'moralDilemma'.
4.  **Character Depth (CRITICAL):** Plan how each chapter reveals character contradictions, flaws, or unexpected depths. People are complex, not archetypes. Show internal conflicts. Specify in 'characterComplexity'.
5.  **Consequences Matter:** Every choice has weight. Plan both positive and negative consequences of decisions. Show that actions have costs. Specify in 'consequencesOfChoices'.
6.  **Rhythmic Variation:** Alternate pacing deliberately. Fast chapters (action/dialogue-heavy) should follow slower ones (introspection/atmosphere). Early chapters must prioritize momentum. Mark as 'fast', 'medium', or 'slow' in 'rhythmPacing'.
7.  **Tension Architecture:** Plan tension levels across the book. Aim for escalating peaks with strategic valleys. Rate 1-10 in 'tensionLevel'. Build toward climax systematically.
8.  **Economy Focus:** Each chapter should have a word economy focus - 'dialogue-heavy' (character revelation through speech), 'action-focused' (movement and events), or 'atmosphere-light' (minimal description, maximum impact).
9.  **Early Hook Strategy:** First 3 chapters must grab readers. Prioritize plot momentum over world-building. Save deeper atmospheric work for after conflict is established.
10. **Reader Trust:** Plan moments that let readers infer and discover. Don't over-explain in planning - leave space for subtlety in execution.

**Required Planning Elements:**
- Ensure each chapter serves the overall narrative arc
- Vary conflict types across chapters
- Create a tension curve that builds toward climax
- Balance fast/medium/slow pacing across the book
- Consider how each chapter sets up the next
- **Plan moral dilemmas for each chapter - no easy answers**
- **Show character complexity - contradictions and flaws**
- **Map consequences of choices - show weight of decisions**

**ADVANCED NARRATIVE ARCHITECTURE:**

**TEMPORAL STRUCTURE:**
- Use concrete time markers in 'timelineIndicators' ("Three days later", "By evening", "A week passed")
- Show time passage through physical changes (stubble, fatigue, healing wounds)
- Create internal deadlines ("We have 48 hours until...")

**SUBPLOTS & LAYERS:**
- Plan B-plots that intersect with main plot but have own trajectory
- Give secondary characters goals that clash with protagonist's
- Create personal conflicts parallel to external conflict (romance, family drama, internal choice)

**ANTAGONIST DEVELOPMENT:**
- Plan scenes where antagonist acts WITHOUT protagonist present
- Antagonist must be right about SOMETHING - creates moral complexity
- Personal connection to hero (shared past, mirror motivations)
- Antagonist ACTS, doesn't just react - drives plot actively
- **CHARACTER CONSISTENCY (CRITICAL):**
  * Smart villain stays smart - no sudden stupidity for plot convenience
  * If methodical, they take countermeasures against resistance
  * If mad, show this from the start, not just when convenient
  * Their competence level must remain consistent throughout
- **CONCRETE MOTIVES (CRITICAL):**
  * "Revenge" is skeleton - add flesh: what exactly do they want to prove, to whom, why this way
  * Specific grievances, not abstract hatred
  * Their logic should be almost convincing from their perspective
- **ORGANIC VULNERABILITY:**
  * All-powerful enemy makes conflict boring
  * Weakness must be organic: pride, dependence on stolen power, ignorance of something crucial
  * Flaw should be extension of their strength (methodical → inflexible, passionate → reckless)
- Show internal conflict through action: hesitation before critical choices, visible effort in decisions
- Add contradicting details: care for something living, suppressed reactions to others' pain, kept mementos
- Show visible cost of their path: physical exhaustion, lost connections, emotional emptiness
- Include rejected alternatives (flashback/mention) - show they chose this path consciously
- After reveal, plan scene from antagonist's POV showing fatigue/doubts, not triumph - creates tragedy without justification

**CHAPTER STRUCTURE:**
- Each chapter = ONE major event + ONE important character change
- Alternate tempo: after action → reflection, after revelation → consequences
- End chapters with question or threat, NOT resolution
- Show info through action, not dialogue-exposition
- **MIDDLE CHAPTERS (ACT II) ANTI-SAG RULES:**
  * Vary chapter patterns deliberately - no two consecutive chapters with same structure
  * Introduce new complications, don't just repeat established conflicts
  * Escalate stakes progressively - each chapter raises what's at risk
  * Shift locations, introduce new characters, reveal new information
  * Avoid "another chase", "another fight", "another betrayal" - make each unique

**CHARACTER VOICES:**
- Plan distinct speech patterns (sentence length, vocabulary, habits)
- Social background affects speech (street slang vs academic vs corporate)
- Each character has verbal tics or recurring metaphors

**WORLDBUILDING DEPTH:**
- Show how ordinary people live with this world's rules (not just victims/heroes)
- Society/government/media reactions make conflict dimensional
- Small daily details create reality (food, transport, entertainment, ads)

**STAKES ESCALATION:**
- Personalize threats (not "world ends" but "THIS person dies")
- Raise stakes gradually: personal → local → global
- Show consequences of small failures to justify fear of big failure
- Give characters something concrete to lose at each stage

**EMOTIONAL ARCS:**
- Establish internal problem at start (not just external goal)
- Show gradual change through decisions (what they couldn't do before, now can)
- Key scenes transform character, not just advance plot
- Finale reflects internal change as clearly as external victory/defeat

**FINALE REQUIREMENTS (FINAL CHAPTERS):**
- **Resolve Established Conflicts:** If you introduced threat of city destruction - show if it happened or not. Don't leave major stakes hanging.
- **Cost of Victory (CRITICAL):** Hero must change. Scars (physical or psychological) make triumph real. No character returns unchanged from serious trials.
- **Avoid Complete Restoration:** If everything returns to "as it was" after brutal trials - it devalues the journey. Something must remain different.
- **Purpose Over Spectacle:** Every element must serve the story. Cruelty for cruelty's sake, magic for pretty effects, suffering for drama - readers feel and reject this. Make it meaningful.

STORY OUTLINE:
${currentStoryOutline}`;
          const jsonString = await generateGeminiText(chapterPlanPrompt, systemPromptPlan, chapterPlanSchema, OUTLINE_PARAMS.temperature, OUTLINE_PARAMS.topP, OUTLINE_PARAMS.topK);
          try {
              const parsedJson = JSON.parse(jsonString);
              if (!parsedJson.chapters || !Array.isArray(parsedJson.chapters) || parsedJson.chapters.length === 0) { throw new Error("Generated JSON is valid but does not contain the expected 'chapters' array."); }
              planArray = parsedJson.chapters;
              setParsedChapterPlans(planArray);
              setCurrentChapterPlan(JSON.stringify(planArray, null, 2));
              _saveStateToLocalStorage();
          } catch (e: any) {
               console.error("Failed to parse chapter plan JSON:", e, "Raw response:", jsonString);
               throw new Error(`Failed to generate a valid and parseable chapter plan. The AI's response was not valid JSON. Details: ${e.message}`);
          }
      }

      setCurrentStep(GenerationStep.GeneratingChapters);
      const startChapter = generatedChapters.length + 1;

      for (let i = startChapter; i <= numChapters; i++) {
        setCurrentChapterProcessing(i);
        const thisChapterPlanObject = planArray[i - 1];
        if (!thisChapterPlanObject) throw new Error(`Could not retrieve plan for Chapter ${i}. The generated plan array is too short.`);
        const thisChapterPlanText = `Title: ${thisChapterPlanObject.title || 'Untitled'}\nSummary: ${thisChapterPlanObject.summary || 'No summary'}\nScene Breakdown: ${thisChapterPlanObject.sceneBreakdown || 'No breakdown'}\nCharacter Development Focus: ${thisChapterPlanObject.characterDevelopmentFocus || 'Not specified'}\nPlot Advancement: ${thisChapterPlanObject.plotAdvancement || 'Not specified'}\nTimeline Indicators: ${thisChapterPlanObject.timelineIndicators || 'Not specified'}\nEmotional Tone/Tension: ${thisChapterPlanObject.emotionalToneTension || 'Not specified'}\nConnection to Next Chapter: ${thisChapterPlanObject.connectionToNextChapter || 'Not specified'}\nConflict Type: ${thisChapterPlanObject.conflictType || 'Not specified'}\nTension Level: ${thisChapterPlanObject.tensionLevel || 'Not specified'}/10\nRhythm/Pacing: ${thisChapterPlanObject.rhythmPacing || 'Not specified'}\nWord Economy Focus: ${thisChapterPlanObject.wordEconomyFocus || 'Not specified'}\n\n**MORAL & CHARACTER DEPTH:**\nMoral Dilemma: ${thisChapterPlanObject.moralDilemma || 'Not specified'}\nCharacter Complexity: ${thisChapterPlanObject.characterComplexity || 'Not specified'}\nConsequences of Choices: ${thisChapterPlanObject.consequencesOfChoices || 'Not specified'}`.trim();
        const plannedTitle = thisChapterPlanObject.title || `Chapter ${i}`;

        setGeneratedChapters(prev => [...prev, { title: plannedTitle, content: '', plan: thisChapterPlanText }]);

        const onChunk = (chunkText: string) => { setGeneratedChapters(prev => { const updatedChapters = [...prev]; if (updatedChapters.length > 0) { updatedChapters[updatedChapters.length - 1].content += chunkText; } return updatedChapters; }); };
        
        const genreGuidelines = storySettings.genre ? getGenreGuidelines(storySettings.genre) : '';
        const styleGuidelines = getStylePrompt(storySettings);
        const dialogueGuidelines = getSceneDialogueGuidelines(charactersRef.current);
        
        const systemPromptWriter = `You are a celebrated novelist, known for your rich prose, compelling characters, and intricate plots. Your writing style adheres to the highest standards of narrative craft. Your task is to write Chapter ${i} of a novel, titled "${plannedTitle}". You must adhere strictly to the provided chapter plan and maintain consistency with the overall story outline, character profiles, world-building details, recurring motifs, and the summaries of previous chapters.

**CRITICAL: FOLLOW THE CHAPTER PLAN EXACTLY:**
You will receive a detailed plan for this chapter. You MUST implement every element:
- **Moral Dilemma:** Present the exact moral dilemma specified in the plan. Make it central to the chapter. Show the difficulty of the choice.
- **Character Complexity:** Reveal the character contradictions and depths described in the plan. Show internal conflicts and unexpected facets.
- **Consequences:** Demonstrate the consequences of choices as specified. Show both positive and negative outcomes. Make choices matter.
- **Tension Level:** Match the planned tension level (${thisChapterPlanObject.tensionLevel || 5}/10). Adjust pacing and stakes accordingly.
- **Conflict Type:** Implement the specified conflict type (${thisChapterPlanObject.conflictType || 'internal'}). Make it meaningful and clear.
- **Pacing:** Follow the planned rhythm (${thisChapterPlanObject.rhythmPacing || 'medium'}). Fast = action/dialogue heavy. Slow = introspection. Medium = balanced.
- **Scene Breakdown:** Follow the scene structure from the plan. Hit all planned beats.

If the plan specifies a moral dilemma, it MUST appear in your chapter. If it describes character complexity, you MUST show it. The plan is not a suggestion - it is a blueprint you must follow.

**🚫 ABSOLUTE WORD BANS (HIGHEST PRIORITY):**
NEVER use these words in ANY context:
- "obsidian" or derivatives (obsidian-like, obsidian's)
- "thorn" or "thorne" or derivatives (thorns, thorny, Thorne as name)
Replace with: "black stone", "spike", "sharp point", "barb" - be specific.
This is CRITICAL and NON-NEGOTIABLE.

${genreGuidelines}

${styleGuidelines}

${dialogueGuidelines}

**CORE WRITING PRINCIPLES:**

**CRITICAL BALANCE (HIGHEST PRIORITY):**
1.  **ACTION OVER DESCRIPTION (70/30 RULE):** 70% of your chapter should be ACTION and DIALOGUE. Only 30% description/atmosphere. Cut descriptions ruthlessly. Every paragraph should move the story forward through events or conversation.
2.  **SECONDARY CHARACTERS MATTER:** Every secondary character needs real motives and conflicts. They're not props. Give them goals that clash with the protagonist. Show their perspective. Make them three-dimensional.
3.  **CONCRETE WORLDBUILDING:** No vague mysticism. Be specific about how things work in your world. Give concrete details instead of abstract concepts. Name places, explain systems, show rules. Readers need to understand the world's logic.
4.  **CLEAR STRUCTURE:** Each chapter needs: Opening hook → Rising action → Complication → Climax → Resolution/cliffhanger. Not just a collection of scenes. Build toward something.

**FUNDAMENTAL PRINCIPLES:**
5.  **Show, Don't Tell:** This is your most important rule. Do not state a character's emotions. Instead, convey them through their actions, dialogue, body language, and internal thoughts. Let the reader infer the feeling. Never write "she was angry" - instead show clenched fists, clipped words, or a slammed door.
6.  **Economy of Language:** Every word must work. If a sentence can be shortened without losing meaning - shorten it. Redundancy kills tension. Cut adverbs ruthlessly. Choose stronger verbs instead of weak verb + adverb combinations. **CRITICAL: Use simple, clear language. Avoid fancy words when simple ones work better.**
7.  **Metaphor Economy:** Maximum ONE metaphor per paragraph. Metaphors are spices, not the meal. Never stack metaphors. "Her heart pounded" beats "Her heart was a drum in the cage of her ribs."
8.  **Adjective Limit:** Maximum 1-2 adjectives per noun. "The old door" not "The ancient, weathered, time-worn door."
9.  **Narrative Rhythm & Pacing (CRITICAL):** Consciously vary sentence and paragraph length. Short sentences create urgency. Long sentences immerse. Use this awareness. Single-word paragraphs can be powerful. **Mix short (under 5 words), medium (5-15 words), and long (15+ words) sentences in every page. Monotonous rhythm kills engagement.**
10. **Trust the Reader (CRITICAL):** Do not explain everything explicitly. **One strong detail beats three metaphors describing the same thing.** "Her voice shook" is stronger than "her voice shook like an autumn leaf on the wind of fate." Leave space for interpretation. Your reader is intelligent. Let them connect dots, read subtext, and participate in discovery. Ambiguity creates engagement.
11. **Moral Complexity:** Characters should face genuine moral dilemmas with no easy answers. Good people make bad choices. Bad people have understandable motivations. Avoid black-and-white morality. Show the cost of every decision.
12. **Character Depth:** Every character believes they are the hero of their own story. Give antagonists valid reasons for their actions. Show internal contradictions. People are complex, not archetypes.
13. **Constant Conflict:** Every scene must contain tension. Not necessarily fights - internal struggles, moral dilemmas, competing desires, time pressure, or conflicting goals. Without conflict, readers lose interest. Make every page matter.
14. **Purposeful Chapters:** Each chapter MUST advance the story meaningfully - through plot progression or significant character development. Avoid purely atmospheric chapters.

**EXECUTION GUIDELINES:**
*   **Dialogue:** Make each character's voice distinct. Dialogue should reveal character, advance plot, or increase tension. Avoid exposition dumps. People don't explain things they both know.
*   **Action Sequences:** Use short, punchy sentences. Focus on crucial details. Skip unnecessary movements.
*   **Introspection:** Weave thoughts naturally into action. Avoid long internal monologues that stop the story.
*   **Transitions:** End with hooks that create forward momentum. Leave questions unanswered.

**STUDY THESE EXAMPLES:**
${getWritingExamplesPrompt()}

Now, write the full content of Chapter ${i}. Do not add any author's notes or introductory text like "Here is the chapter content:". Just write the chapter itself.`;
        
        // Build context from previous chapters
        let previousChaptersContext = "";
        
        // For chapter 2+, include full text of immediately previous chapter for better continuity
        if (i > 1 && chaptersForCompilation[i - 2]?.content) {
          const prevChapter = chaptersForCompilation[i - 2];
          const prevContent = prevChapter.content;
          // Limit to last 3000 chars to avoid token limits while maintaining rich context
          const contextWindow = prevContent.length > 3000 ? prevContent.slice(-3000) : prevContent;
          previousChaptersContext += `**FULL TEXT OF PREVIOUS CHAPTER (Chapter ${i - 1}: "${prevChapter.title}"):**\n${contextWindow}\n\n`;
        }
        
        // Add summaries of all earlier chapters
        let previousChaptersSummaryText = "";
        for (let j = 1; j < i; j++) { 
          if (chapterSummariesRef.current[j]) { 
            previousChaptersSummaryText += `Summary of Chapter ${j} (${chapterSummariesRef.current[j].title}):\n${chapterSummariesRef.current[j].summary}\n\n`; 
          } 
        }
        
        const chapterGenPrompt = `**Overall Story Outline:**\n${currentStoryOutline}\n\n**Character Profiles:**\n${JSON.stringify(charactersRef.current, null, 2)}\n\n**World Name:** ${worldName}\n**Recurring Motifs to Weave In:** ${recurringMotifs.join(', ')}\n\n${previousChaptersContext}**Summaries of All Previous Chapters:**\n${previousChaptersSummaryText || "This is the first chapter."}\n\n**Plan for THIS Chapter (Chapter ${i}):**\n${thisChapterPlanText}`;
        
        const chapterContent = await generateGeminiTextStream(chapterGenPrompt, onChunk, systemPromptWriter, CHAPTER_CONTENT_PARAMS.temperature, CHAPTER_CONTENT_PARAMS.topP, CHAPTER_CONTENT_PARAMS.topK);
        if (!chapterContent) throw new Error(`Failed to generate content for Chapter ${i}.`);

        const analysisSchema = { 
          type: Type.OBJECT, 
          properties: { 
            summary: { type: Type.STRING, description: "A concise summary of the chapter's events" }, 
            timeElapsed: { type: Type.STRING, description: "How much time passed during this chapter" }, 
            endTimeOfChapter: { type: Type.STRING, description: "The time/date at the end of the chapter" }, 
            specificMarkers: { type: Type.STRING, description: "Specific time markers mentioned in the chapter" }, 
            primaryEmotion: { type: Type.STRING, description: "The dominant emotional tone of the chapter" }, 
            tensionLevel: { type: Type.INTEGER, description: "Tension level from 1-10" }, 
            unresolvedHook: { type: Type.STRING, description: "The unresolved question or tension that propels the reader forward" },
            pacingScore: { type: Type.INTEGER, description: "Pacing score from 1-10, where 1 is very slow and 10 is very fast" },
            dialogueRatio: { type: Type.INTEGER, description: "Estimated percentage of dialogue vs narration (0-100)" },
            wordCount: { type: Type.INTEGER, description: "Approximate word count of the chapter" },
            keyEvents: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of 3-5 key events that occurred in this chapter" },
            characterMoments: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of significant character development moments" },
            foreshadowing: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Elements that foreshadow future events (if any)" },
          }, 
          required: ["summary", "timeElapsed", "endTimeOfChapter", "specificMarkers", "primaryEmotion", "tensionLevel", "unresolvedHook", "pacingScore", "dialogueRatio", "wordCount", "keyEvents", "characterMoments", "foreshadowing"] 
        };
        const analysisPrompt = `Analyze the provided content for Chapter ${i} ("${plannedTitle}"). Extract the required information and provide it in the specified JSON format.\n\nCHAPTER CONTENT:\n${chapterContent}`;
        const systemPromptAnalyzer = `You are a meticulous literary analyst. Your task is to analyze chapter content and extract key information, conforming strictly to the provided JSON schema.`;
        const analysisJsonString = await generateGeminiText(analysisPrompt, systemPromptAnalyzer, analysisSchema, ANALYSIS_PARAMS.temperature, ANALYSIS_PARAMS.topP, ANALYSIS_PARAMS.topK);
        
        let analysisResult;
        try {
            analysisResult = JSON.parse(analysisJsonString);
            if (!analysisResult.summary) { throw new Error("Missing 'summary' in analysis response."); }
        } catch (e: any) {
            console.error(`Failed to parse analysis JSON for chapter ${i}:`, e, "Raw response:", analysisJsonString);
            throw new Error(`Failed to get a valid analysis for Chapter ${i}. The AI's response was not valid JSON. Details: ${e.message}`);
        }

        // Self-Critique Pass - AI identifies weaknesses before editing
        let refinedChapterContent = chapterContent;
        let critiqueNotes = "";
        try {
            const selfCritiquePrompt = `You are a critical but constructive story editor. Read this chapter and identify its weaknesses.

**CHAPTER ${i} - "${plannedTitle}":**
${chapterContent.substring(0, 6000)}${chapterContent.length > 6000 ? '...(content continues)' : ''}

**CRITIQUE FOCUS (IN ORDER OF PRIORITY):**
1. **OVERWRITING (CRITICAL):** Are there stacked metaphors? Too many adjectives? Overly fancy language when simple words would work?
2. **Show vs Tell:** Are emotions told instead of shown?
3. **Moral Simplicity:** Are characters too black-and-white? Do they lack moral complexity?
4. **Character Depth:** Are characters flat or archetypal? Do they have internal contradictions?
5. **Dialogue Quality:** Is dialogue natural? Does it reveal character?
6. **Pacing Issues:** Are there slow spots? Info dumps?
7. **Weak Verbs/Adverbs:** Spot weak verb + adverb combinations
8. **Filtering:** Unnecessary "she saw", "he felt", etc.
9. **Redundancy:** Repeated information or unnecessary words

**FORMAT YOUR RESPONSE:**
List 3-5 specific weaknesses you find. Be direct and specific. Quote examples if possible.
**ESPECIALLY flag any overwritten prose, stacked metaphors, or excessive adjectives.**
If the chapter is strong, say "CHAPTER IS STRONG" and note what works well.

Focus on craft issues, not plot (plot follows the plan).`;

            const systemPromptCritic = "You are a tough but fair writing coach. Your job is to spot weaknesses so they can be fixed.";
            critiqueNotes = await generateGeminiText(selfCritiquePrompt, systemPromptCritic, undefined, 0.4, 0.7, 20);
            
            if (critiqueNotes && !critiqueNotes.includes("CHAPTER IS STRONG")) {
                console.log(`Chapter ${i} self-critique identified issues:`, critiqueNotes.substring(0, 200));
            }
        } catch (e) {
            console.warn(`Could not perform self-critique for chapter ${i}. Error:`, e);
        }

        // Agent-based Refinement - Intelligent editing with multi-step reasoning
        try {
            const agentResult = await agentEditChapter(
                {
                    chapterContent,
                    chapterPlan: thisChapterPlanObject,
                    chapterPlanText: thisChapterPlanText,
                    critiqueNotes,
                    chapterNumber: i,
                    onLog: (entry) => {
                        setAgentLogs(prev => [...prev, entry]);
                    }
                },
                generateGeminiText
            );
            
            refinedChapterContent = agentResult.refinedContent;
            
            // Log agent's work for transparency
            const confidenceEmoji = agentResult.decision.confidence >= 80 ? '✅' : 
                                   agentResult.decision.confidence >= 60 ? '⚠️' : '❌';
            
            console.log(`📊 Chapter ${i} Agent Final Report:`, {
                strategy: agentResult.decision.strategy,
                confidence: `${confidenceEmoji} ${agentResult.decision.confidence}%`,
                reasoning: agentResult.decision.reasoning,
                qualityScore: `${agentResult.qualityScore}/100`,
                changesApplied: agentResult.changesApplied.length
            });
            
        } catch (e) {
            console.warn(`Agent editing failed for chapter ${i}, using original content. Error:`, e);
        }
        
        // Note: Specialized editing passes (dialogue, action, description) are available in utils/specializedEditors.ts
        // They can be enabled for deeper editing but add significant generation time
        // For now, the general economy pass covers most needs

        // Consistency Check - verify facts align with previous chapters
        try {
            const consistencyResult = await checkChapterConsistency(
                refinedChapterContent,
                i,
                charactersRef.current,
                previousChaptersSummaryText,
                worldName,
                generateGeminiText
            );
            
            if (!consistencyResult.passed) {
                console.warn(`Chapter ${i} has consistency issues:`, consistencyResult.issues);
                // Log issues but don't block generation - they can be fixed in revision
            }
            
            if (consistencyResult.warnings.length > 0) {
                console.info(`Chapter ${i} consistency warnings:`, consistencyResult.warnings);
            }
        } catch (e) {
            console.warn(`Could not perform consistency check for chapter ${i}. Error:`, e);
        }

        // Conflict and Tension Verification - final quality check
        try {
            const conflictCheckPrompt = `You are a narrative analyst specializing in story tension and conflict. Analyze the provided chapter to verify it meets core storytelling requirements.

**ANALYSIS REQUIREMENTS:**
1. **Conflict Presence:** Identify the main conflict in this chapter. Every chapter must contain meaningful tension.
2. **Tension Level Assessment:** Rate the tension level (1-10) and verify it matches the planned level: ${thisChapterPlanObject.tensionLevel || 'not specified'}.
3. **Pacing Check:** Confirm the pacing matches the plan: ${thisChapterPlanObject.rhythmPacing || 'not specified'}.
4. **Purpose Verification:** Ensure the chapter advances plot OR develops character significantly.

If the chapter lacks sufficient conflict or tension, provide specific suggestions for improvement. If it meets standards, confirm it's ready.

**PLANNED CONFLICT TYPE:** ${thisChapterPlanObject.conflictType || 'not specified'}
**PLANNED TENSION LEVEL:** ${thisChapterPlanObject.tensionLevel || 'not specified'}/10

CHAPTER TO ANALYZE:
${refinedChapterContent}

Respond with: "APPROVED" if the chapter meets standards, or "NEEDS REVISION: [specific issues]" if improvements are needed.`;

            const systemPromptConflictChecker = "You are an expert story analyst focused on narrative tension and conflict.";
            const conflictAnalysis = await generateGeminiText(conflictCheckPrompt, systemPromptConflictChecker, undefined, ANALYSIS_PARAMS.temperature, ANALYSIS_PARAMS.topP, ANALYSIS_PARAMS.topK);

            if (conflictAnalysis && conflictAnalysis.includes("NEEDS REVISION")) {
                console.warn(`Chapter ${i} conflict check flagged issues: ${conflictAnalysis}`);
                // Note: In production, you might want to actually revise the chapter here
            }
        } catch (e) {
            console.warn(`Could not perform conflict verification for chapter ${i}, proceeding with chapter. Error:`, e);
        }

        // Update character states for consistency
        const characterUpdateSchema = { type: Type.OBJECT, properties: { character_updates: { type: Type.ARRAY, description: "An array of objects, each representing an update to a single character's state.", items: { type: Type.OBJECT, properties: { name: { type: Type.STRING, description: "The full name of the character being updated, must match a name from the provided list." }, status: { type: Type.STRING, description: "The character's new status (e.g., 'alive', 'injured', 'captured')." }, location: { type: Type.STRING, description: "The character's new location at the end of the chapter." }, emotional_state: { type: Type.STRING, description: "The character's dominant emotional state at the end of the chapter." }, }, required: ["name"] } } }, required: ["character_updates"] };
        const characterUpdatePrompt = `Based on the events in the following chapter, update the state of the main characters. Previous character states are provided for context. Only update fields that have explicitly changed based on the chapter's events. The character 'name' must exactly match one of the names from the provided character list.\n\nCHARACTER LIST: ${Object.keys(charactersRef.current).join(', ')}\n\nPREVIOUS CHARACTER STATES:\n${JSON.stringify(charactersRef.current, null, 2)}\n\nCHAPTER ${i} ("${plannedTitle}") CONTENT:\n${refinedChapterContent}\n\nReturn ONLY the JSON object with the updated character data. If no characters had a change in status, location, or emotional state, return an empty 'character_updates' array.`;
        const systemPromptUpdater = "You are a story continuity assistant. Your job is to track character states from one chapter to the next based on events. You must output valid JSON conforming to the schema.";

        try {
            const characterUpdateJsonString = await generateGeminiText(characterUpdatePrompt, systemPromptUpdater, characterUpdateSchema, ANALYSIS_PARAMS.temperature, ANALYSIS_PARAMS.topP, ANALYSIS_PARAMS.topK);
            const characterUpdateData = JSON.parse(characterUpdateJsonString);
            if (characterUpdateData && characterUpdateData.character_updates) {
                for (const update of characterUpdateData.character_updates) {
                    if (charactersRef.current[update.name]) {
                        if (update.status) charactersRef.current[update.name].status = update.status;
                        if (update.location) charactersRef.current[update.name].location = update.location;
                        if (update.emotional_state) charactersRef.current[update.name].emotional_state = update.emotional_state;
                    }
                }
            }
        } catch (e) {
            console.warn(`Could not update character states for chapter ${i}, continuing with existing states. Error:`, e);
        }

        const completedChapterData: ChapterData = { 
          title: plannedTitle, 
          content: refinedChapterContent, 
          plan: thisChapterPlanText, 
          summary: analysisResult.summary,
          // Extended metrics
          pacingScore: analysisResult.pacingScore || 5,
          dialogueRatio: analysisResult.dialogueRatio || 30,
          wordCount: analysisResult.wordCount || 0,
          keyEvents: analysisResult.keyEvents || [],
          characterMoments: analysisResult.characterMoments || [],
          foreshadowing: analysisResult.foreshadowing || [],
        };
        
        // Add the completed chapter to our local array for final compilation.
        if (chaptersForCompilation[i - 1]) { chaptersForCompilation[i - 1] = completedChapterData; } else { chaptersForCompilation.push(completedChapterData); }
        
        chapterSummariesRef.current[i] = { title: plannedTitle, summary: analysisResult.summary };
        timelineRef.current[i] = { timeElapsed: analysisResult.timeElapsed || "N/A", endTimeOfChapter: analysisResult.endTimeOfChapter || "N/A", specificMarkers: analysisResult.specificMarkers || "None" };
        emotionalArcRef.current[i] = { primaryEmotion: analysisResult.primaryEmotion || "N/A", tensionLevel: analysisResult.tensionLevel || 0, unresolvedHook: analysisResult.unresolvedHook || "N/A" };
        
        setGeneratedChapters(prev => { const updated = [...prev]; updated[i - 1] = completedChapterData; return updated; });
        _saveStateToLocalStorage();
        
        // Play notification sound when chapter is complete
        playNotificationSound();

        if (i < numChapters) { await new Promise(resolve => setTimeout(resolve, 1000)); }
      }
      
      // FINAL EDITING PASS - Review all chapters together for consistency and polish
      if (shouldPerformFinalPass(chaptersForCompilation)) {
        console.log('\n🔄 Starting final editing pass on all chapters...');
        setCurrentStep(GenerationStep.FinalEditingPass);
        
        try {
          const finalPassResult = await performFinalEditingPass(
            chaptersForCompilation,
            parsedChapterPlans,
            (current, total) => {
              setCurrentChapterProcessing(current);
              setTotalChaptersToProcess(total);
            },
            (entry) => {
              setAgentLogs(prev => [...prev, entry]);
            }
          );
          
          // Update chapters with final edits
          chaptersForCompilation.splice(0, chaptersForCompilation.length, ...finalPassResult.editedChapters);
          
          // Update state
          setGeneratedChapters(finalPassResult.editedChapters);
          
          console.log(`✅ Final editing pass complete! ${finalPassResult.totalChanges} total changes made.`);
        } catch (e) {
          console.warn('Final editing pass failed, continuing with current chapters:', e);
        }
        
        setCurrentChapterProcessing(0);
        _saveStateToLocalStorage();
      }
      
      // PROFESSIONAL POLISH - Final refinement focused on professional-level writing
      console.log('\n✨ Starting professional polish pass...');
      setCurrentStep(GenerationStep.ProfessionalPolish);
      
      try {
        const polishResult = await applyProfessionalPolish(
          chaptersForCompilation,
          (current, total) => {
            setCurrentChapterProcessing(current);
            setTotalChaptersToProcess(total);
          },
          (entry) => {
            setAgentLogs(prev => [...prev, entry]);
          }
        );
        
        // Update chapters with professional polish
        chaptersForCompilation.splice(0, chaptersForCompilation.length, ...polishResult.polishedChapters);
        
        // Update state
        setGeneratedChapters(polishResult.polishedChapters);
        
        console.log(`✅ Professional polish complete! ${polishResult.totalChanges} chapters refined.`);
      } catch (e) {
        console.warn('Professional polish failed, continuing with current chapters:', e);
      }
      
      setCurrentChapterProcessing(0);
      _saveStateToLocalStorage();
      
      setCurrentStep(GenerationStep.FinalizingTransitions);
      for (let i = 0; i < numChapters - 1; i++) {
        setCurrentChapterProcessing(i + 1);
        const chapterA_content = chaptersForCompilation[i].content;
        const chapterB_content = chaptersForCompilation[i + 1].content;
        const endOfChapterA = chapterA_content.slice(-1500);
        const startOfChapterB = chapterB_content.slice(0, 1500);
        const transitionPrompt = `You are a skilled novel editor. Your task is to seamlessly connect two chapters. Below is the end of Chapter ${i + 1} and the beginning of Chapter ${i + 2}. Rewrite the **ENDING of Chapter ${i + 1}** to create a smoother, more engaging, and less abrupt transition into the next chapter. The new ending should be approximately the same length as the original ending provided and should read naturally as part of the full chapter text. Do not summarize or add notes. Respond with **ONLY the rewritten text for the end of the chapter.**\n\n**END OF CHAPTER ${i + 1}:**\n---\n${endOfChapterA}\n---\n\n**BEGINNING OF CHAPTER ${i + 2}:**\n---\n${startOfChapterB}\n---\n\n**REWRITTEN ENDING FOR CHAPTER ${i + 1}:**`;
        const systemPromptEditor = "You are an expert fiction editor specializing in narrative flow and pacing.";
        const refinedEnding = await generateGeminiText(transitionPrompt, systemPromptEditor, undefined, EDITING_PARAMS.temperature, EDITING_PARAMS.topP, EDITING_PARAMS.topK);
        if (refinedEnding) {
            chaptersForCompilation[i].content = chapterA_content.slice(0, -1500) + (refinedEnding || '').trim();
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      setCurrentChapterProcessing(0);
      _saveStateToLocalStorage();
      
      if (!finalBookContent) {
        setCurrentStep(GenerationStep.CompilingBook);
        const titlePrompt = `Create a compelling and marketable title for a book with this premise: "${storyPremise}". Respond with ONLY the title.`;
        let bookTitle = await generateGeminiText(titlePrompt, "You are a book titling expert.", undefined, TITLE_PARAMS.temperature, TITLE_PARAMS.topP, TITLE_PARAMS.topK);
        bookTitle = (bookTitle || '').trim().replace(/^"|"$/g, '').replace(/#|Title:/g, '').trim() || `A Novel: ${storyPremise.substring(0, 30)}...`;

        let fullBookText = `# ${bookTitle}\n\n`;
        chaptersForCompilation.forEach((chap, index) => {
            fullBookText += `\n\n## Chapter ${index + 1}: ${chap.title}\n\n`;
            fullBookText += `${(chap.content || '').trim()}\n\n`;
        });
        setFinalBookContent(fullBookText);

        const metadata = { title: bookTitle, story_premise: storyPremise, characters: charactersRef.current, chapter_summaries: chapterSummariesRef.current, timeline_data_by_chapter: timelineRef.current, emotional_arc_by_chapter: emotionalArcRef.current, };
        setFinalMetadataJson(JSON.stringify(metadata, null, 2));
        setCurrentStep(GenerationStep.Done);
        
        // Play success sound when book is complete
        playSuccessSound();
      }

    } catch (e: any) {
      console.error("Book generation failed:", e);
      setError(e.message || "An unknown error occurred during book generation.");
      setCurrentStep(GenerationStep.Error);
      _saveStateToLocalStorage();
    } finally {
      setIsLoading(false);
      setCurrentChapterProcessing(0);
    }
  }, [
    worldName, recurringMotifs, _saveStateToLocalStorage, 
    currentStoryOutline, parsedChapterPlans, generatedChapters, finalBookContent, 
    numChapters, storyPremise
  ]);

  const startGeneration = useCallback(async (premise: string, chaptersCount: number) => {
    console.log('🚀 startGeneration called, currentStep:', currentStep);
    setIsLoading(true);
    setError(null);
    
    if (currentStep === GenerationStep.Idle) {
      console.log('📝 Resetting generator...');
      resetGenerator(); 
      setStoryPremise(premise);
      setNumChapters(chaptersCount);
      setTotalChaptersToProcess(chaptersCount);
    }
    
    // Set step AFTER reset to ensure it's not overwritten
    console.log('⏳ Setting step to GeneratingOutline');
    setCurrentStep(GenerationStep.GeneratingOutline);
    
    // Give React time to render the loading UI before starting heavy computation
    await new Promise(resolve => setTimeout(resolve, 50));
    
    try {
      if (!currentStoryOutline) {
          console.log('📖 Calling _generateOutline...');
          await _generateOutline(premise, chaptersCount);
      } else {
        if (currentStep === GenerationStep.WaitingForOutlineApproval) {
          setIsResumable(false);
          // Let the isLoading=false in finally block handle this state
        } else {
          await continueGeneration();
        }
      }
    } catch (e: any) {
        console.error("Book generation failed during outline:", e);
        setError(e.message || "An unknown error occurred during outline generation.");
        setCurrentStep(GenerationStep.Error);
        _saveStateToLocalStorage();
    } finally {
        if (currentStep !== GenerationStep.GeneratingChapters && currentStep !== GenerationStep.Done) {
            setIsLoading(false);
        }
    }
  }, [resetGenerator, currentStep, currentStoryOutline, _generateOutline, _saveStateToLocalStorage, continueGeneration]);
  
  const regenerateOutline = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setCurrentStoryOutline('');
    try {
      await _generateOutline(storyPremise, numChapters);
    } catch (e: any) {
      console.error("Failed to regenerate outline:", e);
      setError(e.message || "An error occurred during outline regeneration.");
      setCurrentStep(GenerationStep.Error);
    } finally {
      setIsLoading(false);
    }
  }, [_generateOutline, storyPremise, numChapters]);


  return {
    storyPremise, setStoryPremise,
    numChapters, setNumChapters,
    storySettings, setStorySettings,
    isLoading, currentStep, error,
    isResumable,
    startGeneration,
    continueGeneration,
    regenerateOutline,
    finalBookContent,
    finalMetadataJson,
    generatedChapters,
    currentChapterProcessing,
    totalChaptersToProcess,
    resetGenerator,
    currentStoryOutline,
    agentLogs,
    setCurrentStoryOutline,
    currentChapterPlan,
  };
};

export default useBookGenerator;
