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

  it('renders a long chapter plan without cutting its text', () => {
    const longOutline = 'Grand Narrative Arc: ' + 'A'.repeat(500);
    const longPlan = 'Detailed Scene Plan: ' + 'B'.repeat(300);
    // The panel shows the chapter's own plan; the book blueprint is a different document.
    const chapters = [{ ...mockChapters[0], plan: longPlan }, ...mockChapters.slice(1)];

    const html = renderToStaticMarkup(
      <ThreeZoneGenerationView
        currentStep={GenerationStep.GeneratingChapters}
        currentChapterProcessing={1}
        totalChaptersToProcess={1}
        currentStoryOutline={longOutline}
        currentChapterPlan={'{"centralConflict":"blueprint, not a chapter plan"}'}
        generatedChapters={chapters}
        agentLogs={mockLogs}
      />
    );

    expect(html).toContain(longPlan);
    expect(html).not.toContain('blueprint, not a chapter plan');
  });

  it('shows a plan as labelled decisions rather than raw JSON', () => {
    const plan = JSON.stringify({
      title: 'The Loop', summary: 'Dale reviews the footage and sees himself.',
      sceneBreakdown: 'Kitchen, then the truck.', chapterEnding: 'He removes the dashcam.',
      plotAdvancement: 'The doubling becomes undeniable.',
    });
    const chapters = [{ ...mockChapters[0], plan }, ...mockChapters.slice(1)];

    const html = renderToStaticMarkup(
      <ThreeZoneGenerationView
        currentStep={GenerationStep.GeneratingChapters}
        currentChapterProcessing={1}
        totalChaptersToProcess={1}
        currentStoryOutline="outline"
        currentChapterPlan=""
        generatedChapters={chapters}
        agentLogs={mockLogs}
      />
    );

    expect(html).toContain('Dale reviews the footage and sees himself.');
    expect(html).toContain('Summary');
    expect(html).not.toContain('&quot;sceneBreakdown&quot;');
    // Fields beyond the digest stay one click away instead of filling the column.
    expect(html).toContain('Show full plan');
    expect(html).not.toContain('The doubling becomes undeniable.');
  });
});
