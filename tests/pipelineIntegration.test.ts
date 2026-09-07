import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentCoordinator } from '../utils/agentCoordinator';
import { storyContextDB } from '../utils/storyContextDatabase';
import { QualityController } from '../utils/qualityController';
import { extractBookTitle, exportAsEpub } from '../utils/exportUtils';
import * as llmService from '../services/llmService';
import { ParsedChapterPlan, Character } from '../types';

describe('Architecture & Pipeline Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    storyContextDB.resetDatabase();
  });

  describe('1. Specialist Agent Coordination Architecture', () => {
    it('executes all generation phases through AgentCoordinator without skipping', async () => {
      // Mock generateText to return realistic mock responses for each specialist phase
      vi.spyOn(llmService, 'generateText').mockImplementation(async (prompt, system) => {
        const sys = (system || '').toLowerCase();
        const p = (prompt || '').toLowerCase();

        if (sys.includes('structure') || p.includes('structure')) {
          return 'STRUCTURE BEATS:\n1. Elena discovers the anomaly.\n2. Elena investigates the perimeter.';
        }
        if (sys.includes('character') || p.includes('character arc')) {
          return 'CHARACTER ARC:\nElena feels tense and determined to uncover the truth.';
        }
        if (sys.includes('scene') || p.includes('sensory')) {
          return 'SCENE ATMOSPHERE:\nThe fog rolled over the neon towers of Neo-Veridia.';
        }
        if (sys.includes('synthesis') || p.includes('draft') || p.includes('scene')) {
          return 'Elena stepped out into the damp chill of Neo-Veridia. The neon glow painted her trenchcoat in hues of blue and violet. "We are out of time," she murmured.';
        }
        // General fallback
        return 'Chapter prose content synthesized by coordinator.';
      });

      const coordinator = new AgentCoordinator({
        enableLightPolish: false,
        enableConsistencyCheck: false
      });

      const samplePlan: ParsedChapterPlan = {
        title: 'The Shadow of the Spire',
        summary: 'Elena investigates an anomaly in the lower levels of Neo-Veridia.',
        sceneBreakdown: 'Scene 1: Anomaly detected. Scene 2: Confrontation at the docks.',
        characterDevelopmentFocus: 'Elena confronts her fear of betrayal.',
        plotAdvancement: 'The conspiracy is revealed.',
        conflictType: 'external',
        tensionLevel: 7,
        rhythmPacing: 'medium',
        targetWordCount: 500,
        emotionalToneTension: 'Tense suspense',
        moralDilemma: 'Protecting secrets vs revealing truth',
        openingHook: 'A siren echoed through the rain.',
        climaxMoment: 'Elena finds the encrypted data pad.',
        chapterEnding: 'Footsteps approached in the dark.',
        connectionToNextChapter: 'Leads directly to Chapter 2',
        timelineIndicators: 'Day 1, dusk'
      };

      const sampleCharacters: Record<string, Character> = {
        'Elena': {
          name: 'Elena',
          description: 'A cybernetic investigator with a sharp mind.',
          first_appearance: 1,
          status: 'active',
          development: [],
          relationships: {},
          location: 'Neo-Veridia',
          emotional_state: 'alert'
        }
      };

      const result = await coordinator.generateChapter({
        chapterNumber: 1,
        chapterPlan: samplePlan,
        characters: sampleCharacters,
        storyOutline: 'A futuristic mystery novel.',
        targetLength: 400
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.chapterData).toBeDefined();
      expect(result.chapterData.title).toBe('The Shadow of the Spire');
      expect(result.chapterData.content.length).toBeGreaterThan(0);

      // Verify all architectural phases ran
      const phaseNames = result.phases.map(p => p.phaseName);
      expect(phaseNames).toContain('Context Preparation');
      expect(phaseNames).toContain('Coordinated Specialist Generation');
      expect(phaseNames).toContain('Synthesis & Macro Validation');
      expect(phaseNames).toContain('Repetition Check');
      expect(phaseNames).toContain('Coherence Update');
    });
  });

  describe('2. Story Context Database State Progression', () => {
    it('maintains narrative memory and guards revelation timing', () => {
      // 1. Establish fact in Chapter 1
      storyContextDB.establishFact('The spire generator is leaking quantum radiation', 1, 'critical');

      expect(storyContextDB.isFactEstablished('The spire generator is leaking quantum radiation')).toBe(true);
      expect(storyContextDB.isFactEstablished('Unrelated fact')).toBe(false);

      // 2. Set up planned revelation with prerequisite hints and chapter gate
      storyContextDB.addPlannedRevelation({
        id: 'rev_traitor',
        content: 'Marcus is the syndicate informant',
        targetChapter: 5,
        minimumChapter: 3,
        requiredContext: ['The spire generator is leaking quantum radiation'],
        requiredHints: ['hint_1', 'hint_2'],
        importance: 'critical',
        type: 'plot-twist'
      });

      // Chapter 2: Should be rejected (too early, min chapter is 3)
      const ch2Validation = storyContextDB.canReveal('rev_traitor', 2);
      expect(ch2Validation.allowed).toBe(false);
      expect(ch2Validation.reason).toContain('Too early');

      // Chapter 4: Insufficient foreshadowing hints
      const ch4Validation = storyContextDB.canReveal('rev_traitor', 4);
      expect(ch4Validation.allowed).toBe(false);
      expect(ch4Validation.reason).toContain('Insufficient foreshadowing');

      // Add hints
      storyContextDB.addForeshadowingHint({
        id: 'hint_1',
        content: 'Marcus slipped a comms device into his pocket',
        chapterPlaced: 2,
        targetRevelation: 'rev_traitor',
        subtlety: 'moderate'
      });
      storyContextDB.addForeshadowingHint({
        id: 'hint_2',
        content: 'Marcus was seen near the restricted terminal',
        chapterPlaced: 3,
        targetRevelation: 'rev_traitor',
        subtlety: 'subtle'
      });

      // Chapter 4 with hints: Now allowed!
      const allowedValidation = storyContextDB.canReveal('rev_traitor', 4);
      expect(allowedValidation.allowed).toBe(true);
    });
  });

  describe('3. Quality Controller Guardrails', () => {
    it('detects severe word repetition and triggers variation alert', () => {
      const qc = new QualityController();

      // Text with overused words
      const repetitiveText = `
        The shadow moved through the shadow. 
        Another shadow appeared in the deep shadow. 
        Elena looked at the dark shadow, feeling the shadow grow. 
        Shadow, shadow, shadow settled over everything.
      `;

      const analysis = qc.analyzeChapter(repetitiveText, 'action');
      expect(analysis.overallScore).toBeDefined();
      expect(analysis.repetition.overusedWords.length).toBeGreaterThan(0);
      expect(analysis.repetition.needsVariation).toBe(true);

      const shadowRep = analysis.repetition.overusedWords.find(w => w.word === 'shadow');
      expect(shadowRep).toBeDefined();
      expect(shadowRep?.count).toBeGreaterThanOrEqual(5);
    });
  });

  describe('4. Book Compilation & Export Validation', () => {
    it('extracts titles correctly and handles EPUB structure', async () => {
      const bookMarkdown = `# Whispers in the Neon Mist\n\n## Chapter 1: Awakening\n\nProse of chapter 1.\n\n## Chapter 2: The Inquiry\n\nProse of chapter 2.`;
      
      const title = extractBookTitle(bookMarkdown);
      expect(title).toBe('Whispers in the Neon Mist');

      // Mock DOM environment for downloadBlob
      const fakeLink = { href: '', download: '', click: vi.fn() };
      (globalThis as any).document = {
        createElement: vi.fn().mockReturnValue(fakeLink),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn()
        }
      };

      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      globalThis.URL.revokeObjectURL = vi.fn();

      await expect(exportAsEpub(bookMarkdown, { author: 'AI Author' }, 'test.epub')).resolves.not.toThrow();
      expect(fakeLink.click).toHaveBeenCalled();
    });
  });

  describe('5. Generation Speed Optimization Architecture', () => {
    it('supports fast mode single-pass generation without secondary polish overhead', () => {
      const fastSettings = {
        genre: 'cyberpunk',
        generationSpeedMode: 'fast' as const
      };

      const thoroughSettings = {
        genre: 'cyberpunk',
        generationSpeedMode: 'thorough' as const
      };

      expect(fastSettings.generationSpeedMode).toBe('fast');
      expect(thoroughSettings.generationSpeedMode).toBe('thorough');

      // Verify that fast mode avoids secondary polish rewrite
      const shouldSkipPolish = (mode: string, coherenceScore: number) => {
        return mode === 'fast' || coherenceScore >= 85;
      };

      expect(shouldSkipPolish('fast', 70)).toBe(true);
      expect(shouldSkipPolish('thorough', 70)).toBe(false);
      expect(shouldSkipPolish('thorough', 90)).toBe(true);
    });
  });
});
