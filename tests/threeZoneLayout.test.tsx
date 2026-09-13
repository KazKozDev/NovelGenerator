import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ThreeZoneGenerationView from '../components/ThreeZoneGenerationView';
import { bookTitle, splitError, stepName } from '../hooks/useBookGenerator';
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

    // Zone 3: live chapter checks above the agent telemetry.
    expect(html).toContain('data-testid="zone-agent-inspector"');
    expect(html).toContain('Strategy: polish');
    expect(html).toContain('data-testid="zone-checks"');
    expect(html).toContain('Originality');
  });

  it('never doubles the chapter number in the prose heading', () => {
    // The v2 hook stores bare titles ("Chapter 1"); the view must not
    // prefix its own "Chapter N:" on top of one.
    const bare = [{ title: 'Chapter 1', content: 'Ann climbed while the storm took the rail.' }];
    const named = [{ title: 'Chapter 1: The Awakening', content: 'Ann climbed while the storm took the rail.' }];
    const render = (chapters: { title: string; content: string }[]) => renderToStaticMarkup(
      <ThreeZoneGenerationView
        currentStep={GenerationStep.GeneratingChapters}
        currentChapterProcessing={1}
        totalChaptersToProcess={1}
        currentStoryOutline=""
        currentChapterPlan=""
        generatedChapters={chapters}
        agentLogs={[]}
        isLoading={false}
      />,
    );
    expect(render(bare)).not.toContain('Chapter 1: Chapter 1');
    expect(render(bare)).toContain('Chapter 1');
    expect(render(named)).not.toContain('Chapter 1: Chapter 1');
    expect(render(named)).toContain('Chapter 1: The Awakening');
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

  it('renders a chapter map array as labelled cards instead of raw JSON', () => {
    const plan = JSON.stringify([
      { chapter: 1, function: 'Establish the dark lighthouse.', main_change: 'Ann faces the crisis.', event_ids: ['E01', 'E02'], pov_id: 'C01', target_words: 2500 },
      { chapter: 2, function: 'Escalate through the failed repair.', main_change: 'The lens resists.', event_ids: ['E05'], pov_id: 'C01', target_words: 2500 },
    ]);
    const chapters = [{ ...mockChapters[0], plan }, ...mockChapters.slice(1)];

    const html = renderToStaticMarkup(
      <ThreeZoneGenerationView
        currentStep={GenerationStep.GeneratingChapters}
        currentChapterProcessing={1}
        totalChaptersToProcess={2}
        currentStoryOutline="outline"
        currentChapterPlan=""
        generatedChapters={chapters}
        agentLogs={mockLogs}
      />
    );

    expect(html).toContain('Establish the dark lighthouse.');
    expect(html).toContain('Main Change');
    expect(html).toContain('E01 · E02');
    expect(html).toContain('>POV<');
    expect(html).not.toContain('&quot;function&quot;');
    expect(html).not.toContain('&quot;event_ids&quot;');
  });

  it('shows the measured texture of the chapter on screen, findings included', () => {
    const measured = [{
      title: 'Chapter 1: The Awakening',
      content: 'Elena opened her eyes to the dark room.',
      plan: 'Scene 1: Waking up in Neo-Veridia.',
      texture: {
        dialogueShare: 0.12, medianParagraphWords: 79, similesPer1000: 3.4, taggedSpeechShare: 1,
        findings: [{ id: 'speech-tag-bloat', description: '100% of spoken lines arrive with an attached gesture.' }],
      },
    }];
    const html = renderToStaticMarkup(
      <ThreeZoneGenerationView
        currentStep={GenerationStep.GeneratingChapters}
        currentChapterProcessing={1}
        totalChaptersToProcess={1}
        generatedChapters={measured}
        currentStoryOutline=""
        currentChapterPlan=""
        agentLogs={[]}
      />
    );
    expect(html).toContain('12%');
    expect(html).toContain('79w');
    expect(html).toContain('3.4');
    expect(html).toContain('speech-tag-bloat');
  });
});

describe('The agent log', () => {
  it('names the step instead of quoting its prompt', () => {
    expect(stepName('Prepare a compact book construction suitable for subsequent writing.')).toBe('Designing the book');
    expect(stepName('Check whether the provided plan is ready for writing.')).toBe('Reviewing the plan');
  });

  it('titles a book by its design, and cuts a fallback premise at a word', () => {
    expect(bookTitle('The Sorrow Light', 'A lighthouse keeper on a dying coast')).toBe('The Sorrow Light');
    expect(bookTitle('   ', 'A short premise')).toBe('A short premise');
    const premise = 'A lighthouse keeper on a dying coast discovers that the ships she guides home have been sinking for thirty years.';
    const fallback = bookTitle(undefined, premise);
    expect(fallback.length).toBeLessThanOrEqual(81);
    expect(fallback.endsWith('…')).toBe(true);
    expect(premise.startsWith(fallback.slice(0, -1))).toBe(true);
    expect(fallback.slice(0, -1).endsWith(' ')).toBe(false);
    expect(bookTitle(undefined, '   ')).toBe('Untitled book');
  });

  it('shows a failure as one line, with the reviewer prose behind a disclosure', () => {
    const refusal = 'Book design not executable after 3 attempts. Unresolved:\n[blocking] causal_map.E08: the plan never says why the magic cannot be regenerated. Required decision: clarify it.';
    const split = splitError(refusal);
    expect(split.headline).toBe('Book design not executable after 3 attempts.');
    expect(split.detail).toContain('causal_map.E08');
    const short = splitError('Time budget exhausted.');
    expect(short.headline).toBe('Time budget exhausted.');
    expect(short.detail).toBe('');
    expect(splitError('').headline).toBe('Generation failed.');
    expect(stepName('Plan only the current chapter, based on the actually written story.')).toBe('Planning the chapter');
    expect(stepName('Write a full literary scene for the manuscript.')).toBe('Writing a scene');
    expect(stepName('Extract the essential changes from the new scene.')).toBe('Updating story memory');
    expect(stepName('Refine the forward plan based on the actually written chapter.')).toBe('Reconciling the plan');
    expect(stepName('Check the integrity of the finished book.')).toBe('Auditing the finished book');
    // Anything unrecognised is shown as itself, shortened, rather than as nothing.
    expect(stepName('Some prompt nobody has mapped yet')).toBe('Some prompt nobody has mapped yet');
  });
});
