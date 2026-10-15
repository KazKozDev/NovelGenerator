import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import BookStatistics from '../components/BookStatistics';

describe('BookStatistics compact metadata bar', () => {
  it('renders stats in a clean horizontal strip without bulky grid tiles', () => {
    const content = '# Test Novel\n\n## Chapter 1\n\n"Hello," she said.\n\n## Chapter 2\n\n"Goodbye," he replied.';
    const html = renderToStaticMarkup(
      <BookStatistics
        bookContent={content}
        metadata={{
          emotional_arc_by_chapter: {
            '1': { tensionLevel: 6 },
            '2': { tensionLevel: 8 },
          },
        }}
      />
    );

    // Verify no grid tiles container
    expect(html).not.toContain('grid-cols-2');
    expect(html).not.toContain('grid-cols-4');

    // Verify it renders the compact horizontal bar
    expect(html).toContain('Chapters');
    expect(html).toContain('2');
    expect(html).toContain('Words');
    expect(html).toContain('Read Time');
    expect(html).toContain('Dialogue');
    expect(html).toContain('Avg Tension');
    expect(html).toContain('7.0 / 10');
  });

  it('supports Russian chapter headers and dialogue em-dashes', () => {
    const russianContent = '# Книга\n\n## Глава 1\n\n— Привет, — сказала она.\n\n## Глава 2\n\n— До встречи, — ответил он.';
    const html = renderToStaticMarkup(
      <BookStatistics
        bookContent={russianContent}
        metadata={{}}
      />
    );

    expect(html).toContain('Chapters');
    expect(html).toContain('2');
    expect(html).toContain('Dialogue');
  });
});
