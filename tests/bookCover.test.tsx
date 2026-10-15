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
    expect(html).toContain('Saved in copyright, PDF, EPUB, and project metadata');
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

  it('renders author field with required indicator', () => {
    const emptyAuthorHtml = renderToStaticMarkup(
      <BookCoverUpload
        title="Shadows of the City"
        genre="noir"
        author=""
      />
    );
    expect(emptyAuthorHtml).toContain('Required');
    expect(emptyAuthorHtml).toContain('Author name is required to save the book');

    const filledAuthorHtml = renderToStaticMarkup(
      <BookCoverUpload
        title="Shadows of the City"
        genre="noir"
        author="Arthur Conan"
      />
    );
    expect(filledAuthorHtml).toContain('Required');
    expect(filledAuthorHtml).toContain('Saved in copyright, PDF, EPUB, and project metadata');
  });

  it('renders imprint input fields and fixed colophon when enabled', () => {
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
    expect(html).toContain('id="toggle-imprint-checkbox"');
    expect(html).toContain('checked=""');
    expect(html).toContain('id="imprint-edition-input"');
    expect(html).toContain('value="First edition"');
    expect(html).toContain('id="imprint-isbn-paperback-input"');
    expect(html).toContain('value="978-1-234567-89-0"');
    expect(html).toContain('id="imprint-isbn-ebook-input"');
    expect(html).toContain('value="978-1-234567-89-1"');
    
    // Verifies fixed legal text & colophon
    expect(html).toContain('Copyright © 2026 Иван Иванов');
    expect(html).toContain('All rights reserved.');
    expect(html).toContain('No part of this book may be reproduced');
    expect(html).toContain('NovelGenerator tool and other artificial intelligence tools');
    expect(html).toContain('The author takes complete and exclusive responsibility for all aspects of this book.');
    expect(html).toContain('This is a work of fiction.');
    expect(html).toContain('ISBN 978-1-234567-89-0 (paperback)');
    expect(html).toContain('ISBN 978-1-234567-89-1 (ebook)');
    expect(html).toContain('Published by NG Press');
    expect(html).toContain('First edition, 2026');
  });
});

