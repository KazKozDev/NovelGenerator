import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import EditorialChatStudio from '../components/EditorialChatStudio';

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
  it('renders Studio Header with title and model badge', () => {
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
    expect(html).toContain('Check props &amp; invariants');
  });
});
