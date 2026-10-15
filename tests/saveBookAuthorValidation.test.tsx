import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import SaveBook from '../components/SaveBook';
import { resolveImprintColophon } from '../utils/imprintConstants';
import { formatMarkdownWithMetadata, formatTextWithMetadata } from '../utils/exportUtils';

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
});
