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
import { agentCoordinator, ChapterGenerationInput } from '../utils/agentCoordinator';
import { playSuccessSound, playNotificationSound } from '../utils/soundUtils';
import { getFormattedPrompt, PromptNames, formatPrompt } from '../utils/promptLoader';
import { GEMINI_MODEL_NAME } from '../constants';
import { OUTLINE_PARAMS, CHAPTER_CONTENT_PARAMS, ANALYSIS_PARAMS, EDITING_PARAMS, EXTRACTION_PARAMS, TITLE_PARAMS } from '../constants/generationParams';
import { SchemaType } from '@google/generative-ai';

const STORAGE_KEY = 'novelGeneratorState';

/**
 * Creates an expanded chapter planning schema with detailed narrative elements
 * Includes comprehensive planning fields for scenes, dialogue, character arcs, and structure
 */
const createExpandedChapterPlanSchema = (numChapters: number): object => {
  return {
    type: SchemaType.OBJECT,
    properties: {
      chapters: {
        type: SchemaType.ARRAY,
        description: `An array of chapter plan objects, one for each of the ${numChapters} chapters.`,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            // CORE EXISTING FIELDS
            title: { type: SchemaType.STRING, description: "Chapter title" },
            summary: { type: SchemaType.STRING, description: "Brief chapter summary" },
            sceneBreakdown: { type: SchemaType.STRING, description: "Overview of scenes in the chapter" },
            characterDevelopmentFocus: { type: SchemaType.STRING, description: "Which characters develop and how" },
            plotAdvancement: { type: SchemaType.STRING, description: "How the plot moves forward" },
            timelineIndicators: { type: SchemaType.STRING, description: "Time passage and chronological markers" },
            emotionalToneTension: { type: SchemaType.STRING, description: "Emotional atmosphere and tension level" },
            connectionToNextChapter: { type: SchemaType.STRING, description: "How this chapter leads to the next" },
            conflictType: {
              type: SchemaType.STRING,
              description: "Type of conflict in this chapter: external, internal, interpersonal, or societal"
            },
            tensionLevel: {
              type: SchemaType.INTEGER,
              description: "Tension level from 1-10, where 1 is calm and 10 is peak intensity"
            },
            rhythmPacing: {
              type: SchemaType.STRING,
              description: "Chapter pacing: fast (action-heavy), medium (balanced), or slow (introspective)"
            },
            wordEconomyFocus: {
              type: SchemaType.STRING,
              description: "Specific economy focus: dialogue-heavy, action-focused, or atmosphere-light"
            },
            moralDilemma: {
              type: SchemaType.STRING,
              description: "The moral dilemma or ethical question this chapter explores. What difficult choice must be made? What are the costs?"
            },
            characterComplexity: {
              type: SchemaType.STRING,
              description: "How this chapter reveals character contradictions, flaws, or unexpected depths. Show that people are complex, not archetypes."
            },
            consequencesOfChoices: {
              type: SchemaType.STRING,
              description: "What are the consequences (positive and negative) of decisions made in this chapter? Show that choices have weight."
            },

            // DETAILED SCENE PLANNING
            detailedScenes: {
              type: SchemaType.ARRAY,
              description: "3-5 detailed scenes that make up the chapter",
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  sceneId: { type: SchemaType.STRING, description: "Unique identifier for the scene" },
                  location: { type: SchemaType.STRING, description: "Where the scene takes place" },
                  participants: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: "Characters involved in this scene"
                  },
                  objective: { type: SchemaType.STRING, description: "What the scene is trying to accomplish" },
                  conflict: { type: SchemaType.STRING, description: "Main tension or obstacle in the scene" },
                  outcome: { type: SchemaType.STRING, description: "How the scene resolves" },
                  duration: { type: SchemaType.STRING, description: "Estimated time span (e.g., '10 minutes', 'several hours')" },
                  mood: { type: SchemaType.STRING, description: "Emotional atmosphere of the scene" },
                  keyMoments: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: "Specific beats or events within the scene"
                  }
                },
                required: ["sceneId", "location", "participants", "objective", "conflict", "outcome", "duration", "mood", "keyMoments"]
              }
            },

            // NARRATIVE EVENTS
            chapterEvents: {
              type: SchemaType.ARRAY,
              description: "Specific events that drive the narrative forward",
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  eventId: { type: SchemaType.STRING, description: "Unique identifier" },
                  eventType: {
                    type: SchemaType.STRING,
                    description: "Type of event: dialogue, action, revelation, conflict, internal, or transition"
                  },
                  description: { type: SchemaType.STRING, description: "What happens in this event" },
                  participants: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: "Who is involved"
                  },
                  consequences: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: "What this event leads to"
                  },
                  emotionalImpact: {
                    type: SchemaType.INTEGER,
                    description: "1-10 scale of emotional intensity"
                  },
                  plotSignificance: { type: SchemaType.STRING, description: "How this advances the overall story" },
                  sceneId: { type: SchemaType.STRING, description: "Which scene this event belongs to" }
                },
                required: ["eventId", "eventType", "description", "participants", "consequences", "emotionalImpact", "plotSignificance"]
              }
            },

            // DIALOGUE PLANNING
            dialogueBeats: {
              type: SchemaType.ARRAY,
              description: "Planned dialogue moments with subtext and purpose",
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  beatId: { type: SchemaType.STRING, description: "Unique identifier" },
                  purpose: { type: SchemaType.STRING, description: "What this dialogue accomplishes" },
                  participants: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: "Who is speaking"
                  },
                  subtext: { type: SchemaType.STRING, description: "What's really being communicated beneath the words" },
                  revelations: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: "Information revealed through this dialogue"
                  },
                  tensions: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: "Conflicts or tensions exposed"
                  },
                  emotionalShifts: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: "How characters' feelings change"
                  },
                  sceneId: { type: SchemaType.STRING, description: "Which scene this belongs to" }
                },
                required: ["beatId", "purpose", "participants", "subtext", "revelations", "tensions", "emotionalShifts"]
              }
            },

            // CHARACTER EMOTIONAL ARCS
            characterArcs: {
              type: SchemaType.ARRAY,
              description: "Character emotional journeys through the chapter",
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  character: { type: SchemaType.STRING, description: "Character name" },
                  startState: { type: SchemaType.STRING, description: "Emotional state at chapter beginning" },
                  keyMoments: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: "Specific moments that affect this character"
                  },
                  endState: { type: SchemaType.STRING, description: "Emotional state at chapter end" },
                  internalConflicts: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: "Inner struggles the character faces"
                  },
                  growth: { type: SchemaType.STRING, description: "How the character changes or develops" },
                  relationships: {
                    type: SchemaType.STRING,
                    description: "How relationships with other characters evolve (comma-separated list)"
                  }
                },
                required: ["character", "startState", "keyMoments", "endState", "internalConflicts", "growth", "relationships"]
              }
            },

            // ACTION SEQUENCES
            actionSequences: {
              type: SchemaType.ARRAY,
              description: "Physical action and movement sequences",
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  sequenceId: { type: SchemaType.STRING, description: "Unique identifier" },
                  description: { type: SchemaType.STRING, description: "What physical action occurs" },
                  participants: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: "Who is involved in the action"
                  },
                  stakes: { type: SchemaType.STRING, description: "What's at risk during this action" },
                  outcome: { type: SchemaType.STRING, description: "How the action resolves" },
                  pacing: {
                    type: SchemaType.STRING,
                    description: "Speed of the action: slow, medium, fast, or frantic"
                  },
                  sceneId: { type: SchemaType.STRING, description: "Which scene this belongs to" }
                },
                required: ["sequenceId", "description", "participants", "stakes", "outcome", "pacing"]
              }
            },

            // PACING AND STRUCTURE
            targetWordCount: {
              type: SchemaType.INTEGER,
              description: "Estimated word count for this chapter (typically 4000-8000)"
            },
            climaxMoment: {
              type: SchemaType.STRING,
              description: "The peak emotional/tension moment of the chapter"
            },
            openingHook: {
              type: SchemaType.STRING,
              description: "How the chapter begins to engage readers"
            },
            chapterEnding: {
              type: SchemaType.STRING,
              description: "How the chapter concludes and leads to the next"
            },

            // THEMATIC ELEMENTS
            symbolism: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
              description: "Symbolic elements to weave through the chapter"
            },
            foreshadowing: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
              description: "Elements that hint at future events"
            },
            callbacks: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
              description: "References to earlier events or chapters"
            },

            // TECHNICAL REQUIREMENTS
            complexityLevel: {
              type: SchemaType.STRING,
              description: "Chapter complexity: simple, moderate, complex, or intricate"
            },
            generationPriority: {
              type: SchemaType.STRING,
              description: "How much attention this chapter needs: standard, high, or critical"
            }
          },
          required: [
            "title", "summary", "sceneBreakdown", "characterDevelopmentFocus",
            "plotAdvancement", "timelineIndicators", "emotionalToneTension",
            "connectionToNextChapter", "conflictType", "tensionLevel",
            "rhythmPacing", "wordEconomyFocus", "moralDilemma",
            "characterComplexity", "consequencesOfChoices", "detailedScenes",
            "chapterEvents", "dialogueBeats", "characterArcs", "actionSequences",
            "targetWordCount", "climaxMoment", "openingHook", "chapterEnding",
            "symbolism", "foreshadowing", "callbacks", "complexityLevel",
            "generationPriority"
          ]
        }
      }
    },
    required: ["chapters"]
  };
};

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
    // Note: currentStep is already set to GeneratingOutline by startGeneration()
    const { systemPrompt, userPrompt } = getFormattedPrompt(PromptNames.STORY_OUTLINE, {
      chapters_count: chaptersCount,
      story_premise: premise
    });
    const outlineText = await generateGeminiText(userPrompt, systemPrompt, undefined, OUTLINE_PARAMS.temperature, OUTLINE_PARAMS.topP, OUTLINE_PARAMS.topK);
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
          const chapterPlanSchema: object = createExpandedChapterPlanSchema(numChapters);
          const { systemPrompt: systemPromptPlan, userPrompt: chapterPlanPrompt } = getFormattedPrompt(PromptNames.CHAPTER_PLANNING, {
            num_chapters: numChapters,
            story_outline: currentStoryOutline
          });
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
        // Create comprehensive chapter plan text with all expanded fields
        const formatArrayField = (arr: any[], label: string) => {
          if (!arr || arr.length === 0) return `${label}: None specified`;
          return `${label}:\n${arr.map((item, index) => `  ${index + 1}. ${typeof item === 'string' ? item : JSON.stringify(item, null, 2)}`).join('\n')}`;
        };

        const thisChapterPlanText = `
**CORE CHAPTER DETAILS:**
Title: ${thisChapterPlanObject.title || 'Untitled'}
Summary: ${thisChapterPlanObject.summary || 'No summary'}
Scene Breakdown: ${thisChapterPlanObject.sceneBreakdown || 'No breakdown'}
Character Development Focus: ${thisChapterPlanObject.characterDevelopmentFocus || 'Not specified'}
Plot Advancement: ${thisChapterPlanObject.plotAdvancement || 'Not specified'}
Timeline Indicators: ${thisChapterPlanObject.timelineIndicators || 'Not specified'}
Emotional Tone/Tension: ${thisChapterPlanObject.emotionalToneTension || 'Not specified'}
Connection to Next Chapter: ${thisChapterPlanObject.connectionToNextChapter || 'Not specified'}

**STRUCTURE & PACING:**
Conflict Type: ${thisChapterPlanObject.conflictType || 'Not specified'}
Tension Level: ${thisChapterPlanObject.tensionLevel || 'Not specified'}/10
Rhythm/Pacing: ${thisChapterPlanObject.rhythmPacing || 'Not specified'}
Word Economy Focus: ${thisChapterPlanObject.wordEconomyFocus || 'Not specified'}
Target Word Count: ${thisChapterPlanObject.targetWordCount || 'Not specified'}
Complexity Level: ${thisChapterPlanObject.complexityLevel || 'Not specified'}
Generation Priority: ${thisChapterPlanObject.generationPriority || 'Not specified'}

**MORAL & CHARACTER DEPTH:**
Moral Dilemma: ${thisChapterPlanObject.moralDilemma || 'Not specified'}
Character Complexity: ${thisChapterPlanObject.characterComplexity || 'Not specified'}
Consequences of Choices: ${thisChapterPlanObject.consequencesOfChoices || 'Not specified'}

**CHAPTER STRUCTURE:**
Opening Hook: ${thisChapterPlanObject.openingHook || 'Not specified'}
Climax Moment: ${thisChapterPlanObject.climaxMoment || 'Not specified'}
Chapter Ending: ${thisChapterPlanObject.chapterEnding || 'Not specified'}

**DETAILED SCENES:**
${formatArrayField(thisChapterPlanObject.detailedScenes, 'Scenes')}

**CHAPTER EVENTS:**
${formatArrayField(thisChapterPlanObject.chapterEvents, 'Events')}

**DIALOGUE BEATS:**
${formatArrayField(thisChapterPlanObject.dialogueBeats, 'Dialogue Beats')}

**CHARACTER ARCS:**
${formatArrayField(thisChapterPlanObject.characterArcs, 'Character Emotional Arcs')}

**ACTION SEQUENCES:**
${formatArrayField(thisChapterPlanObject.actionSequences, 'Action Sequences')}

**THEMATIC ELEMENTS:**
${formatArrayField(thisChapterPlanObject.symbolism, 'Symbolism')}
${formatArrayField(thisChapterPlanObject.foreshadowing, 'Foreshadowing')}
${formatArrayField(thisChapterPlanObject.callbacks, 'Callbacks')}
`.trim();
        const plannedTitle = thisChapterPlanObject.title || `Chapter ${i}`;

        setGeneratedChapters(prev => [...prev, { title: plannedTitle, content: '', plan: thisChapterPlanText }]);

        const onChunk = (chunkText: string) => { setGeneratedChapters(prev => { const updatedChapters = [...prev]; if (updatedChapters.length > 0) { updatedChapters[updatedChapters.length - 1].content += chunkText; } return updatedChapters; }); };
        
        const genreGuidelines = storySettings.genre ? getGenreGuidelines(storySettings.genre) : '';
        const styleGuidelines = getStylePrompt(storySettings);
        const dialogueGuidelines = getSceneDialogueGuidelines(charactersRef.current);
        
        const finaleRequirements = i >= Math.floor(numChapters * 0.75) ? `**⚠️ FINALE CHAPTER REQUIREMENTS (THIS IS A FINAL CHAPTER):**
- **Resolve Established Conflicts:** If earlier chapters introduced major threats (city destruction, character death, etc.) - show the outcome. Don't leave major stakes unresolved.
- **Cost of Victory (CRITICAL):** Hero must be changed by their journey. Show scars (physical or psychological). Victory without cost feels hollow.
- **No Complete Restoration:** If everything returns to "as it was" after brutal trials - it devalues the journey. Something permanent must change.
- **Purpose Over Spectacle:** Every element must serve the story. Make cruelty, magic, suffering meaningful - not just dramatic.
- **Emotional Resolution:** Address the internal problem established at the start, not just external goal.

` : '';

        const middleChapterVariation = i >= Math.floor(numChapters * 0.33) && i < Math.floor(numChapters * 0.75) ? `
5.  **MIDDLE CHAPTER VARIATION (ACT II):** Vary patterns - no two consecutive chapters with same structure. Introduce new complications, escalate stakes, shift locations. Avoid "another chase/fight/betrayal" - make each unique.` : '';

        const { systemPrompt: systemPromptWriter, userPrompt: chapterWritingPromptTemplate } = getFormattedPrompt(PromptNames.CHAPTER_WRITING, {
          chapter_number: i,
          chapter_title: plannedTitle,
          tension_level: thisChapterPlanObject.tensionLevel || 5,
          conflict_type: thisChapterPlanObject.conflictType || 'internal',
          rhythm_pacing: thisChapterPlanObject.rhythmPacing || 'medium',
          finale_requirements: finaleRequirements,
          genre_guidelines: genreGuidelines,
          style_guidelines: styleGuidelines,
          dialogue_guidelines: dialogueGuidelines,
          middle_chapter_variation: middleChapterVariation,
          writing_examples: getWritingExamplesPrompt()
        });
        
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
        
        const chapterGenPrompt = formatPrompt(chapterWritingPromptTemplate, {
          // Chapter specifications
          chapter_number: i,
          target_length: thisChapterPlanObject.targetWordCount ? `${thisChapterPlanObject.targetWordCount}` : "4000-6000",
          word_density: "500-800", // Keep as fallback
          time_span: thisChapterPlanObject.timelineIndicators || "Several hours",
          scene_type: thisChapterPlanObject.wordEconomyFocus || "balanced",
          emotion_start: "neutral", // Keep as fallback since not in new schema
          emotion_end: thisChapterPlanObject.emotionalToneTension || "heightened",
          tension_level: thisChapterPlanObject.tensionLevel || 5,

          // Chapter setting
          primary_location: "Current setting", // Keep as fallback since primaryLocation is optional
          secondary_locations: "None", // Keep as fallback
          environmental_details: "Standard environment", // Keep as fallback
          time_context: "Present time", // Keep as fallback

          // Core content
          chapter_plan: thisChapterPlanText,
          active_characters: Object.keys(charactersRef.current).join(', '),

          // World context
          world_name: worldName,
          world_rules: "Standard world rules apply", // Keep as fallback
          recurring_motifs: recurringMotifs.join(', '),

          // Story context
          previous_chapters_context: previousChaptersContext,
          previous_chapters_summaries: previousChaptersSummaryText || "This is the first chapter.",
          story_outline: currentStoryOutline,

          // Visual/symbolic elements - use new schema fields
          key_images: "Scene-appropriate imagery", // Keep as fallback
          symbolic_elements: thisChapterPlanObject.symbolism ? thisChapterPlanObject.symbolism.join(', ') : "None specified",
          sensory_focus: "Visual and auditory" // Keep as fallback
        });
        
        // 🚀 HYBRID MULTI-AGENT CHAPTER GENERATION
        const hybridInput: ChapterGenerationInput = {
          chapterNumber: i,
          chapterPlan: thisChapterPlanObject,
          characters: charactersRef.current,
          previousChapterEnd: i > 1 && chaptersForCompilation[i - 2]?.content ?
            chaptersForCompilation[i - 2].content.slice(-500) : undefined,
          storyOutline: currentStoryOutline,
          targetLength: thisChapterPlanObject.targetWordCount || 5000 // Use expanded schema field
        };

        // Update UI during hybrid generation
        const onHybridChunk = (chunkText: string) => {
          setGeneratedChapters(prev => {
            const updatedChapters = [...prev];
            if (updatedChapters.length > 0) {
              updatedChapters[updatedChapters.length - 1].content += chunkText;
            }
            return updatedChapters;
          });
        };

        console.log(`🚀 Starting hybrid generation for Chapter ${i}: "${plannedTitle}"`);
        const hybridResult = await agentCoordinator.generateChapter(hybridInput);

        if (!hybridResult.success) {
          throw new Error(`Hybrid generation failed for Chapter ${i}: ${hybridResult.phases.find(p => !p.success)?.errors?.join(', ')}`);
        }

        const chapterContent = hybridResult.chapterData.content;
        if (!chapterContent) throw new Error(`Failed to generate content for Chapter ${i}.`);

        // Log hybrid system performance
        console.log(`✅ Hybrid generation complete for Chapter ${i}:`, {
          totalTime: hybridResult.metadata.totalTime + 'ms',
          phases: hybridResult.phases.map(p => `${p.phaseName}: ${p.success ? '✅' : '❌'}`),
          qualityScore: `${hybridResult.metadata.qualityMetrics.coherenceScore}/100`
        });

        const analysisSchema = { 
          type: SchemaType.OBJECT, 
          properties: { 
            summary: { type: SchemaType.STRING, description: "A concise summary of the chapter's events" }, 
            timeElapsed: { type: SchemaType.STRING, description: "How much time passed during this chapter" }, 
            endTimeOfChapter: { type: SchemaType.STRING, description: "The time/date at the end of the chapter" }, 
            specificMarkers: { type: SchemaType.STRING, description: "Specific time markers mentioned in the chapter" }, 
            primaryEmotion: { type: SchemaType.STRING, description: "The dominant emotional tone of the chapter" }, 
            tensionLevel: { type: SchemaType.INTEGER, description: "Tension level from 1-10" }, 
            unresolvedHook: { type: SchemaType.STRING, description: "The unresolved question or tension that propels the reader forward" },
            pacingScore: { type: SchemaType.INTEGER, description: "Pacing score from 1-10, where 1 is very slow and 10 is very fast" },
            dialogueRatio: { type: SchemaType.INTEGER, description: "Estimated percentage of dialogue vs narration (0-100)" },
            wordCount: { type: SchemaType.INTEGER, description: "Approximate word count of the chapter" },
            keyEvents: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "List of 3-5 key events that occurred in this chapter" },
            characterMoments: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "List of significant character development moments" },
            foreshadowing: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Elements that foreshadow future events (if any)" },
          }, 
          required: ["summary", "timeElapsed", "endTimeOfChapter", "specificMarkers", "primaryEmotion", "tensionLevel", "unresolvedHook", "pacingScore", "dialogueRatio", "wordCount", "keyEvents", "characterMoments", "foreshadowing"] 
        };
        const { systemPrompt: systemPromptAnalyzer, userPrompt: analysisPrompt } = getFormattedPrompt(PromptNames.CHAPTER_ANALYSIS, {
          chapter_number: i,
          chapter_title: plannedTitle,
          chapter_content: chapterContent
        });
        const analysisJsonString = await generateGeminiText(analysisPrompt, systemPromptAnalyzer, analysisSchema, ANALYSIS_PARAMS.temperature, ANALYSIS_PARAMS.topP, ANALYSIS_PARAMS.topK);
        
        let analysisResult;
        try {
            analysisResult = JSON.parse(analysisJsonString);
            if (!analysisResult.summary) { throw new Error("Missing 'summary' in analysis response."); }
        } catch (e: any) {
            console.error(`Failed to parse analysis JSON for chapter ${i}:`, e, "Raw response:", analysisJsonString);
            throw new Error(`Failed to get a valid analysis for Chapter ${i}. The AI's response was not valid JSON. Details: ${e.message}`);
        }

        // 🎨 LIGHT POLISH PASS (Hybrid System)
        // Since specialist agents already created quality content, we only need minimal refinement
        let refinedChapterContent = chapterContent;
        let critiqueNotes = "";

        try {
            console.log(`🎨 Starting light polish for Chapter ${i} (Hybrid-generated content)`);

            // Light critique - only look for minor integration issues
            const { systemPrompt: systemPromptCritic, userPrompt: selfCritiquePrompt } = getFormattedPrompt(PromptNames.SELF_CRITIQUE, {
              chapter_number: i,
              chapter_title: plannedTitle,
              chapter_content_preview: chapterContent.substring(0, 6000) + (chapterContent.length > 6000 ? '...(content continues)' : '')
            });
            critiqueNotes = await generateGeminiText(selfCritiquePrompt, systemPromptCritic, undefined, 0.4, 0.7, 20);

            // Light polish using existing editing agent in light mode
            const agentResult = await agentEditChapter(
                {
                    chapterContent,
                    chapterPlan: thisChapterPlanObject,
                    chapterPlanText: thisChapterPlanText,
                    critiqueNotes: `HYBRID SYSTEM LIGHT POLISH: Specialist agents already created this content. Only apply minimal improvements. ${critiqueNotes}`,
                    chapterNumber: i,
                    onLog: (entry) => {
                        setAgentLogs(prev => [...prev, entry]);
                    }
                },
                generateGeminiText
            );

            refinedChapterContent = agentResult.refinedContent;

            // Log light polish results
            const confidenceEmoji = agentResult.decision.confidence >= 80 ? '✅' :
                                   agentResult.decision.confidence >= 60 ? '⚠️' : '❌';

            console.log(`🎨 Chapter ${i} Light Polish Report:`, {
                strategy: agentResult.decision.strategy,
                confidence: `${confidenceEmoji} ${agentResult.decision.confidence}%`,
                reasoning: agentResult.decision.reasoning,
                qualityScore: `${agentResult.qualityScore}/100`,
                lightChanges: agentResult.changesApplied.length,
                hybridQuality: `${hybridResult.metadata.qualityMetrics.coherenceScore}/100`
            });

        } catch (e) {
            console.warn(`Light polish failed for chapter ${i}, using hybrid content. Error:`, e);
            refinedChapterContent = chapterContent; // Use hybrid content as-is
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

        // Note: Conflict verification removed - agent editing already handles this comprehensively

        // Update character states for consistency
        const characterUpdateSchema = { type: SchemaType.OBJECT, properties: { character_updates: { type: SchemaType.ARRAY, description: "An array of objects, each representing an update to a single character's state.", items: { type: SchemaType.OBJECT, properties: { name: { type: SchemaType.STRING, description: "The full name of the character being updated, must match a name from the provided list." }, status: { type: SchemaType.STRING, description: "The character's new status (e.g., 'alive', 'injured', 'captured')." }, location: { type: SchemaType.STRING, description: "The character's new location at the end of the chapter." }, emotional_state: { type: SchemaType.STRING, description: "The character's dominant emotional state at the end of the chapter." }, }, required: ["name"] } } }, required: ["character_updates"] };
        const { systemPrompt: systemPromptUpdater, userPrompt: characterUpdatePrompt } = getFormattedPrompt(PromptNames.CHARACTER_UPDATES, {
          character_list: Object.keys(charactersRef.current).join(', '),
          previous_character_states: JSON.stringify(charactersRef.current, null, 2),
          chapter_number: i,
          chapter_title: plannedTitle,
          chapter_content: refinedChapterContent
        });

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
        const { systemPrompt: systemPromptEditor, userPrompt: transitionPrompt } = getFormattedPrompt(PromptNames.TRANSITION_WRITING, {
          chapter_a_number: i + 1,
          chapter_b_number: i + 2,
          end_of_chapter_a: endOfChapterA,
          start_of_chapter_b: startOfChapterB
        });
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
        const { systemPrompt: titleSystemPrompt, userPrompt: titlePrompt } = getFormattedPrompt(PromptNames.TITLE_GENERATION, {
          story_premise: storyPremise
        });
        let bookTitle = await generateGeminiText(titlePrompt, titleSystemPrompt, undefined, TITLE_PARAMS.temperature, TITLE_PARAMS.topP, TITLE_PARAMS.topK);
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
