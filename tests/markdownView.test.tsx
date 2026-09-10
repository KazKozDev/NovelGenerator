import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownView from '../components/common/MarkdownView';

describe('MarkdownView', () => {
  it('renders markdown headings, bold, italic, and lists correctly', () => {
    const markdown = `# Chapter 1: The Descent

Elena was **determined** to find the *truth*.

- Key clue discovered
- Perimeter breach detected

> "Knowledge is a dangerous currency."
`;

    const html = renderToStaticMarkup(
      <MarkdownView content={markdown} />
    );

    expect(html).toContain('<h1>Chapter 1: The Descent</h1>');
    expect(html).toContain('<strong>determined</strong>');
    expect(html).toContain('<em>truth</em>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Key clue discovered</li>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('&quot;Knowledge is a dangerous currency.&quot;');
  });

  it('renders streaming indicator when isStreaming is true', () => {
    const html = renderToStaticMarkup(
      <MarkdownView content="Streaming in progress..." isStreaming={true} />
    );

    expect(html).toContain('animate-pulse');
  });

  it('sanitizes script tags from content', () => {
    const malicious = `Safe text <script>alert('xss')</script> end text`;
    const html = renderToStaticMarkup(
      <MarkdownView content={malicious} />
    );

    expect(html).not.toContain('<script>');
    expect(html).not.toContain("alert('xss')");
    expect(html).toContain('Safe text');
  });
});
