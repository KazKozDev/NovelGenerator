import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import SaveBook from '../components/SaveBook';
import { resolveImprintColophon } from '../utils/imprintConstants';
import {
  formatMarkdownWithMetadata,
  formatTextWithMetadata,
  buildEpub,
  buildPdfHtml,
  resolveCoverImage,
} from '../utils/exportUtils';

describe('SaveBook author validation and colophon', () => {
  it('renders SaveBook with author requirement', () => {
    const htmlWithoutAuthor = renderToStaticMarkup(
      <SaveBook content="A dark and stormy night." metadata={{}} />
    );
    expect(htmlWithoutAuthor).toContain('Save ▾');
  });

  it('resolves colophon with exact legal disclaimers, author and optional ISBNs', () => {
    const colophon = resolveImprintColophon('Иван Иванов', {
      edition: 'First edition',
      year: '2026',
      isbnPaperback: '978-1-234567-89-0',
      isbnEbook: '978-1-234567-89-1',
    });

    expect(colophon.copyright).toBe('Copyright © 2026 Иван Иванов');
    expect(colophon.rights).toBe('All rights reserved.');
    expect(colophon.reproduction).toContain('No part of this book may be reproduced, distributed, or transmitted in any form');
    expect(colophon.aiDisclaimer).toBe(
      'This book was created with the assistance of the NovelGenerator tool and other artificial intelligence tools. The author who generated and published this book is solely and fully responsible for the entire content, including any inaccuracies, errors, intellectual property issues, or any other consequences arising from the use of AI tools or the final work.'
    );
    expect(colophon.liabilityDisclaimer).toBe(
      'The author is exclusively responsible for ensuring that the content does not infringe any third-party rights and for compliance with all applicable laws. NovelGenerator and its creators act solely as providers of software tools and disclaim all liability for the creation, publication, distribution, or content of this book.'
    );
    expect(colophon.fictionDisclaimer).toContain('This is a work of fiction.');
    expect(colophon.isbns).toEqual([
      'ISBN 978-1-234567-89-0 (paperback)',
      'ISBN 978-1-234567-89-1 (ebook)',
    ]);
    expect(colophon.publisher).toBe('Published by NG Press');
    expect(colophon.editionLine).toBe('First edition, 2026');
  });

  it('omits ISBN lines when they are not provided', () => {
    const colophon = resolveImprintColophon('Иван Иванов', {
      edition: 'Second revised edition',
      year: '2027',
    });

    expect(colophon.copyright).toBe('Copyright © 2027 Иван Иванов');
    expect(colophon.isbns).toEqual([]);
    expect(colophon.editionLine).toBe('Second revised edition, 2027');
  });

  it('formats Markdown with author and title at top', () => {
    const md = formatMarkdownWithMetadata(
      '# My Mystery Novel\n\n## Chapter 1\n\nThe detective arrived.',
      { author: 'Иван Иванов' }
    );
    expect(md.startsWith('# My Mystery Novel\n\n**Author:** Иван Иванов')).toBe(true);
    expect(md).toContain('## Chapter 1');
  });

  it('formats Markdown with author and mandatory publishing imprint colophon', () => {
    const md = formatMarkdownWithMetadata(
      '# My Mystery Novel\n\n## Chapter 1\n\nThe detective arrived.',
      {
        author: 'Иван Иванов',
        imprint: { edition: 'First edition', year: '2026' },
      }
    );
    expect(md).toContain('# My Mystery Novel');
    expect(md).toContain('**Author:** Иван Иванов');
    expect(md).toContain('### Publishing Imprint');
    expect(md).toContain('Copyright © 2026 Иван Иванов');
    expect(md).toContain('Published by NG Press');
    expect(md).toContain('The author who generated and published this book is solely and fully responsible for the entire content');
    expect(md).toContain('NovelGenerator and its creators act solely as providers of software tools and disclaim all liability');
  });

  it('formats Plain Text with author and mandatory publishing imprint colophon', () => {
    const txt = formatTextWithMetadata(
      '# My Mystery Novel\n\n## Chapter 1\n\nThe detective arrived.',
      {
        author: 'Иван Иванов',
      }
    );
    expect(txt.startsWith('My Mystery Novel\nby Иван Иванов')).toBe(true);
    expect(txt).toContain('Copyright © 2026 Иван Иванов');
    expect(txt).toContain('Published by NG Press');
    expect(txt).toContain('The author who generated and published this book is solely and fully responsible for the entire content');
    expect(txt).toContain('NovelGenerator and its creators act solely as providers of software tools and disclaim all liability');
    expect(txt).toContain('Chapter 1');
  });

  it('embeds cover image and cover page in EPUB when coverImage is provided', async () => {
    const fakeCoverBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const fakeCoverDataUrl = `data:image/png;base64,${fakeCoverBase64}`;

    const epubBlob = await buildEpub(
      '# The Weight of Rain\n\n## Chapter 1\n\nIt was raining.',
      {
        author: 'Artem KK',
        coverImage: fakeCoverDataUrl,
      }
    );
    const zip = await JSZip.loadAsync(await epubBlob.arrayBuffer());
    expect(zip.file('OEBPS/cover.png')).not.toBeNull();
    expect(zip.file('OEBPS/cover.xhtml')).not.toBeNull();

    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('id="cover-image"');
    expect(opf).toContain('properties="cover-image"');
    expect(opf).toContain('id="cover" href="cover.xhtml"');
    expect(opf).toContain('<itemref idref="cover"/>');
  });

  it('resolves cover image from metadata or localStorage', () => {
    expect(resolveCoverImage('My Book', { coverImage: 'data:image/png;base64,123' })).toBe('data:image/png;base64,123');
    expect(resolveCoverImage('My Book', { coverUrl: 'data:image/jpeg;base64,456' })).toBe('data:image/jpeg;base64,456');
    expect(resolveCoverImage('My Book', {})).toBeNull();
  });

  it('buildPdfHtml generates full-bleed cover, zero @page margin, dedicated title, colophon, and auto TOC', () => {
    const fakeCover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bookContent = `# The Weight of Rain

## Chapter 1: The Storm
It began with a whisper in the wind. The rain pelted against the glass.

## Chapter 2: The Aftermath
Morning arrived with gray skies and damp earth.`;

    const html = buildPdfHtml(bookContent, {
      author: 'Artem KK',
      coverImage: fakeCover,
      imprint: {
        edition: 'First Edition',
        isbnPaperback: '978-0-123456-47-2',
        isbnEbook: '978-0-123456-48-9',
        year: '2026',
      },
    });

    // Zero-margin @page to remove default browser headers and footers (about:blank, date/time)
    expect(html).toContain('margin: 0');
    expect(html).toContain('size: A4 portrait');

    // Full-bleed cover page
    expect(html).toContain('id="pdf-cover-page"');
    expect(html).toContain('class="page cover-page"');
    expect(html).toContain('object-fit: cover');
    expect(html).toContain(fakeCover);

    // Dedicated Title page
    expect(html).toContain('id="pdf-title-page"');
    expect(html).toContain('The Weight of Rain');
    expect(html).toContain('by Artem KK');
    expect(html).toContain('First Edition, 2026');

    // Dedicated Colophon page with centered card and legal clauses
    expect(html).toContain('id="pdf-colophon-page"');
    expect(html).toContain('colophon-card');
    expect(html).toContain('Copyright © 2026 Artem KK');
    expect(html).toContain('All rights reserved.');
    expect(html).toContain('ISBN 978-0-123456-47-2 (paperback)');
    expect(html).toContain('ISBN 978-0-123456-48-9 (ebook)');
    expect(html).toContain('Published by NG Press');

    // Automatic Table of Contents
    expect(html).toContain('id="pdf-toc-page"');
    expect(html).toContain('Table of Contents');
    expect(html).toContain('Chapter 1: The Storm');
    expect(html).toContain('Chapter 2: The Aftermath');

    // Chapters in separate containers with page-break-before
    expect(html).toContain('class="chapter-container"');
    expect(html).toContain('page-break-before: always');
    expect(html).toContain('It began with a whisper in the wind.');
    expect(html).toContain('Morning arrived with gray skies and damp earth.');
  });

  it('buildPdfHtml renders cleanly without cover page when no cover is uploaded', () => {
    const bookContent = `# Silent Whispers\n\n## Chapter 1\nAlone in the library.`;
    const html = buildPdfHtml(bookContent, { author: 'Elena Gray' });

    expect(html).not.toContain('id="pdf-cover-page"');
    expect(html).toContain('id="pdf-title-page"');
    expect(html).toContain('id="pdf-colophon-page"');
    expect(html).toContain('id="pdf-toc-page"');
    expect(html).toContain('Silent Whispers');
    expect(html).toContain('by Elena Gray');
  });
});
