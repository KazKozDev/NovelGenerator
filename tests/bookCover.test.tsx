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
    expect(html).not.toContain('Saved in copyright, PDF, EPUB, and project metadata');
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

  it('renders the imprint metadata input fields directly under author', () => {
    const html = renderToStaticMarkup(
      <BookCoverUpload
        title="Shadows of the City"
        genre="noir"
        author="Arthur Conan"
      />
    );
    expect(html).not.toContain('Publishing imprint');
    expect(html).not.toContain('Included');
    expect(html).not.toContain('id="toggle-imprint-checkbox"');
    expect(html).toContain('id="imprint-edition-input"');
    expect(html).toContain('id="imprint-isbn-paperback-input"');
    expect(html).toContain('id="imprint-isbn-ebook-input"');
  });

  it('renders author field with required indicator and neutral styling', () => {
    const emptyAuthorHtml = renderToStaticMarkup(
      <BookCoverUpload
        title="Shadows of the City"
        genre="noir"
        author=""
      />
    );
    expect(emptyAuthorHtml).toContain('Required');
    expect(emptyAuthorHtml).not.toContain('border-amber-600');
    expect(emptyAuthorHtml).not.toContain('Saved in copyright, PDF, EPUB, and project metadata');

    const filledAuthorHtml = renderToStaticMarkup(
      <BookCoverUpload
        title="Shadows of the City"
        genre="noir"
        author="Arthur Conan"
      />
    );
    expect(filledAuthorHtml).toContain('Required');
    expect(filledAuthorHtml).not.toContain('Saved in copyright, PDF, EPUB, and project metadata');
  });

  it('renders imprint input fields without manual copyright card in UI', () => {
    const html = renderToStaticMarkup(
      <BookCoverUpload
        title="Shadows of the City"
        genre="noir"
        author="Иван Иванов"
        imprint={{
          enabled: true,
          edition: 'First edition',
          isbnPaperback: '978-1-234567-89-0',
          isbnEbook: '978-1-234567-89-1',
          year: '2026',
        }}
      />
    );
    expect(html).not.toContain('id="toggle-imprint-checkbox"');
    expect(html).toContain('id="imprint-edition-input"');
    expect(html).toContain('value="First edition"');
    expect(html).toContain('id="imprint-isbn-paperback-input"');
    expect(html).toContain('value="978-1-234567-89-0"');
    expect(html).toContain('id="imprint-isbn-ebook-input"');
    expect(html).toContain('value="978-1-234567-89-1"');
    
    // Verifies that copyright card and redundant messages are not rendered in the UI (added automatically on save)
    expect(html).not.toContain('Copyright © 2026 Иван Иванов');
    expect(html).not.toContain('Copyright, disclaimers, and NG Press colophon are automatically generated upon export');
  });
});

