import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ThreeZoneGenerationView from '../components/ThreeZoneGenerationView';
import { GenerationStep } from '../types';

describe('ThreeZoneGenerationView', () => {
  const mockChapters = [
    {
      title: 'Chapter 1: The Awakening',
      content: 'Elena opened her eyes to the dark room.',
      plan: 'Scene 1: Waking up in Neo-Veridia.'
    },
    {
      title: 'Chapter 2: The Inquiry',
      content: '',
      plan: 'Scene 1: Arriving at the docks.'
    }
  ];

  const mockLogs = [
    {
      timestamp: Date.now(),
      chapterNumber: 2,
      type: 'decision' as const,
      message: 'Strategy: polish - smoothing transitions'
    },
    {
      timestamp: Date.now() + 100,
      chapterNumber: 2,
      type: 'success' as const,
      message: 'Fast Mode: Single-pass synthesis accepted'
    }
  ];

  it('renders all 3 distinct zones for the generation workflow', () => {
    const html = renderToStaticMarkup(
      <ThreeZoneGenerationView
        currentStep={GenerationStep.GeneratingChapters}
        currentChapterProcessing={2}
        totalChaptersToProcess={2}
        currentStoryOutline="The grand cyberpunk outline."
        currentChapterPlan="Scene 1: Arriving at the docks. High tension."
        generatedChapters={mockChapters}
        agentLogs={mockLogs}
        lastSavedAt={Date.now()}
        isResumable={false}
        isLoading={true}
      />
    );

    // Zone 1: Pipeline & Outline
    expect(html).toContain('data-testid="zone-pipeline"');
    expect(html).toContain('Chapter 1: The Awakening');

    // Zone 2: Live Prose Stream
    expect(html).toContain('data-testid="zone-prose"');

    // Zone 3: Agent Activity & Telemetry
    expect(html).toContain('data-testid="zone-agent-inspector"');
    expect(html).toContain('Strategy: polish');
  });

  it('renders unclipped chapter outline and plans without cutting text', () => {
    const longOutline = 'Grand Narrative Arc: ' + 'A'.repeat(500);
    const longPlan = 'Detailed Scene Plan: ' + 'B'.repeat(300);

    const html = renderToStaticMarkup(
      <ThreeZoneGenerationView
        currentStep={GenerationStep.GeneratingChapters}
        currentChapterProcessing={1}
        totalChaptersToProcess={1}
        currentStoryOutline={longOutline}
        currentChapterPlan={longPlan}
        generatedChapters={mockChapters}
        agentLogs={mockLogs}
      />
    );

    // Verify long plan is present without truncation
    expect(html).toContain(longPlan);
  });
});
