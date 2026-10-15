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

  it('renders BookDisplay with 3-column layout containing Editorial Review, Manuscript and Book Cover', () => {
    const html = renderToStaticMarkup(
      <BookDisplay
        bookContent="# My Novel\n\n## Chapter 1\n\nIt was a dark night."
        metadataJson={JSON.stringify({
          title: 'My Novel',
          genre: 'thriller',
          audit: { findings: [] },
        })}
        onReset={() => {}}
        onEdit={() => {}}
        onManualSave={() => true}
      />
    );
    expect(html).toContain('lg:grid-cols-[40%_40%_20%]');
    expect(html).toContain('Editorial Review');
    expect(html).toContain('Manuscript');
    expect(html).toContain('Book Cover');
  });
});
