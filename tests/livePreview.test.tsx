import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { livePreview } from '../utils/livePreview';
import StreamingContentView from '../components/StreamingContentView';

describe('an answer shown while it is still arriving', () => {
  it('reads the prose out of a writer\'s unfinished tool command', () => {
    expect(livePreview('{"tool":"finish","text":"Nora closed the file.\\n\\n\\"We\'ll be here,\\" said Cla')).toBe('Nora closed the file.\n\n"We\'ll be here," said Cla');
    expect(livePreview('{"tool":"finish","text":"A whole scene of more than forty characters, finished."}')).toBe('A whole scene of more than forty characters, finished.');
  });
  it('shows the replacements of an edit, and nothing of its anchors', () => {
    const raw = '{"tool":"replace","edits":[{"block_id":"T01","before":"old sentence one","after":"New sentence one."},{"block_id":"T01","before":"old two","after":"New sent';
    expect(livePreview(raw)).toBe('New sentence one.\n\n· · ·\n\nNew sent');
    expect(livePreview(raw)).not.toContain('old sentence');
  });
  it('leaves plain prose as it is and shows nothing of a command that has no prose yet', () => {
    expect(livePreview('Nora closed the file.')).toBe('Nora closed the file.');
    expect(livePreview('{"tool":"sea')).toBe('');
    expect(livePreview('{"tool":"finish","text":"Caf\\u00e9 at d')).toBe('Café at d');
  });
  it('puts the scene in flight under the accepted text, marked as not yet reviewed', () => {
    const html = renderToStaticMarkup(<StreamingContentView title="Chapter 1" content="Accepted scene text." live={{ label: 'Scene T02 · writing', text: 'A sentence still arriving' }} />);
    expect(html.indexOf('Accepted scene text.')).toBeGreaterThan(-1);
    expect(html.indexOf('A sentence still arriving')).toBeGreaterThan(html.indexOf('Accepted scene text.'));
    expect(html).toContain('Being written now · Scene T02 · writing · not yet reviewed');
    const first = renderToStaticMarkup(<StreamingContentView title="Chapter 1" content="" live={{ label: 'Scene T01 · writing', text: 'First words' }} />);
    expect(first).toContain('First words'); expect(first).not.toContain('Its prose appears here as it arrives');
  });
});
