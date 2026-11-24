import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import EditorialChatStudio, { QUICK_PROMPTS } from '../components/EditorialChatStudio';
import { asksForEdit } from '../utils/novel/editorialAgent';

const SAMPLE_MANUSCRIPT = `
## Chapter 1: The Vault

Clark placed the heavy oxygen canister on the floor.
`.trim();

const SAMPLE_METADATA = {
  audit: {
    findings: [
      {
        finding: 'Clarify oxygen timer in Chapter 1',
        chapter: 1,
        quote: 'oxygen canister',
        recommendation: 'Specify exact remaining time'
      }
    ]
  }
};

describe('EditorialChatStudio', () => {
  it('renders Studio Header with title and model badge button', () => {
    const html = renderToStaticMarkup(
      <EditorialChatStudio
        bookContent={SAMPLE_MANUSCRIPT}
        metadata={SAMPLE_METADATA}
        onApplyPatch={vi.fn()}
        onUndoPatch={vi.fn()}
        canUndo={false}
      />
    );

    expect(html).toContain('Editorial Review');
    expect(html).toContain('Assistant');
    expect(html).toContain('title="Change assistant provider and model"');
  });

  it('renders System Audit Accordion Card with findings count', () => {
    const html = renderToStaticMarkup(
      <EditorialChatStudio
        bookContent={SAMPLE_MANUSCRIPT}
        metadata={SAMPLE_METADATA}
        onApplyPatch={vi.fn()}
        onUndoPatch={vi.fn()}
        canUndo={false}
      />
    );

    expect(html).toContain('System Editorial Tasks');
  });

  it('renders input bar with quick prompt chips', () => {
    const html = renderToStaticMarkup(
      <EditorialChatStudio
        bookContent={SAMPLE_MANUSCRIPT}
        metadata={SAMPLE_METADATA}
        onApplyPatch={vi.fn()}
        onUndoPatch={vi.fn()}
        canUndo={false}
      />
    );

    expect(html).toContain('Ask editor');
    expect(html).toContain('01 · Plot holes');
    expect(html).toContain('02 · Repeats');
    expect(html).toContain('03 · Pacing');
  });

  it('review buttons ask for findings, not changes', () => {
    for (const { prompt } of QUICK_PROMPTS) expect(asksForEdit(prompt)).toBe(false);
    expect(QUICK_PROMPTS[0].view).toBe('skeletons');
    expect(QUICK_PROMPTS[1].view).toBe('repeats');
    expect(QUICK_PROMPTS[2].view).toBe('pacing');
    expect(asksForEdit('Исправь главу 3')).toBe(true);
  });
});
