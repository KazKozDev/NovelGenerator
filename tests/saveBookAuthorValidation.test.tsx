import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import SaveBook from '../components/SaveBook';
import { resolveImprintColophon } from '../utils/imprintConstants';

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
    expect(colophon.aiDisclaimer).toContain('NovelGenerator tool and other artificial intelligence tools');
    expect(colophon.aiDisclaimer).toContain('The author who generated and published this book is solely and fully responsible for the entire content');
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
});
