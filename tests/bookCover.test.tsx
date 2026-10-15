import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import BookCoverUpload from '../components/BookCoverUpload';
import BookDisplay from '../components/BookDisplay';

describe('BookCoverUpload and three-zone layout', () => {
  it('renders the book cover upload card with mockup', () => {
    const html = renderToStaticMarkup(
      <BookCoverUpload
        title="Shadows of the City"
        genre="noir"
        author="John Doe"
      />
    );
    expect(html).toContain('Book Cover');
    expect(html).toContain('Shadows of the City');
    expect(html).toContain('noir');
    expect(html).toContain('John Doe');
    expect(html).toContain('Upload cover');
    expect(html).toContain('Click or drag image here');
  });

  it('renders the author input field under the book cover and reflects author name', () => {
    const html = renderToStaticMarkup(
      <BookCoverUpload
        title="Shadows of the City"
        genre="noir"
        author="Arthur Conan"
      />
    );
    expect(html).toContain('id="book-author-input"');
    expect(html).toContain('value="Arthur Conan"');
    expect(html).toContain('Saved in PDF, EPUB, and project metadata');
  });

  it('renders BookDisplay with 3-column layout containing Editorial Review, Manuscript and Book Cover', () => {
    const html = renderToStaticMarkup(
      <BookDisplay
        bookContent="# My Novel\n\n## Chapter 1\n\nIt was a dark night."
        metadataJson={JSON.stringify({
          title: 'My Novel',
          genre: 'thriller',
          author: 'Jane Austen',
          audit: { findings: [] },
        })}
        onReset={() => {}}
        onEdit={() => {}}
        onManualSave={() => true}
      />
    );
    expect(html).toContain('lg:grid-cols-[33%_47%_1fr]');
    expect(html).toContain('Editorial Review');
    expect(html).toContain('Manuscript');
    expect(html).toContain('Book Cover');
    expect(html).toContain('id="book-author-input"');
    expect(html).toContain('value="Jane Austen"');
  });

  it('renders the publishing imprint toggle and default state', () => {
    const html = renderToStaticMarkup(
      <BookCoverUpload
        title="Shadows of the City"
        genre="noir"
        author="Arthur Conan"
      />
    );
    expect(html).toContain('Publishing imprint');
    expect(html).toContain('id="toggle-imprint-checkbox"');
  });

  it('renders imprint input fields when enabled', () => {
    const html = renderToStaticMarkup(
      <BookCoverUpload
        title="Shadows of the City"
        genre="noir"
        author="Arthur Conan"
        imprint={{
          enabled: true,
          date: 'October 2026',
          models: 'Qwen 2.5 72B & Claude 3.5 Sonnet',
          publisher: 'Studio Press',
          disclaimer: 'This is a work of fiction.',
        }}
      />
    );
    expect(html).toContain('id="toggle-imprint-checkbox"');
    expect(html).toContain('checked=""');
    expect(html).toContain('id="imprint-date-input"');
    expect(html).toContain('value="October 2026"');
    expect(html).toContain('id="imprint-models-input"');
    expect(html).toContain('value="Qwen 2.5 72B &amp; Claude 3.5 Sonnet"');
    expect(html).toContain('id="imprint-publisher-input"');
    expect(html).toContain('value="Studio Press"');
    expect(html).toContain('id="imprint-disclaimer-input"');
    expect(html).toContain('This is a work of fiction.');
  });
});
