import React from 'react';
import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import MarkdownChangesView from '../components/MarkdownChangesView';
import {markdownRevision} from '../utils/markdownRevision';
import {MarkdownView} from '../components/common/MarkdownView';
it('keeps consecutive changed paragraphs separate instead of concatenating their raw tokens', () => {
  const html = renderToStaticMarkup(<MarkdownChangesView before={'First old.\n\nSecond old.'} after={'First new.\n\nSecond new.'} />);
  expect(html).toContain('<p>First new.</p>');
  expect(html).toContain('<p>Second new.</p>');
  expect(html).not.toContain('First new.Second new.');
  expect(html).toContain('manuscript-changes');
});
it('renders emphasis from exact inserted prose even when the following sentence has no separator', () => {
  const after = 'Mora read the lines. *Fantasy. Porch. Bourbon. Digoxin. Uncapped glass on the nightstand.*Nora watched. Claire whispered, *"uncapped, right next to the bottle. On the nightstand."*It was a rehearsal.';
  const html = renderToStaticMarkup(<MarkdownChangesView before={'Mora read the lines.'} after={after} />);
  expect(html).toContain('<em>Fantasy. Porch. Bourbon. Digoxin. Uncapped glass on the nightstand.</em> Nora watched.');
  expect(html).toContain('On the nightstand.&quot;</em> It was a rehearsal.');
});
it('does not repair literal emphasis markers inside code', () => {
  const html = renderToStaticMarkup(<MarkdownView content={'`*literal.*Next`\n\n```text\n*literal.*Next\n```'} />);
  expect(html).toContain('<code>*literal.*Next</code>');
  expect(html).not.toContain('<em>literal.</em>');
});
it('keeps headings, emphasis, lists and tables rendered in Changes', () => {
  const before = '# Chapter\n\n**Old clue**\n\n- First\n- Second\n\n| Time | Event |\n| --- | --- |\n| 8 | Entry |';
  const after = before.replace('Old clue','New clue').replace('8 |','9 |');
  const html = renderToStaticMarkup(<MarkdownChangesView before={before} after={after} />);
  expect(html).toContain('<h1>Chapter</h1>');
  expect(html).toContain('<strong>New clue</strong>');
  expect(html).toContain('<ul>'); expect(html).toContain('<table>');
  expect(html).toContain('revision-added'); expect(html).toContain('revision-removed');
  expect(html).not.toContain('**New clue**');
});
it('keeps word-level replacement in ordinary prose and unchanged intervening paragraphs', () => {
  const html = renderToStaticMarkup(<MarkdownChangesView before={'He closed the door.\n\nA quiet room.\n\nShe sat.'} after={'He opened the door.\n\nA quiet room.\n\nShe stood.'} />);
  expect(html).toContain('<del class="revision-removed">closed</del>');
  expect(html).toContain('<ins class="revision-added">opened</ins>');
  expect(markdownRevision('First.\n\nMiddle.\n\nLast.','Changed.\n\nMiddle.\n\nEnd.').filter(block=>!block.changed)).toHaveLength(1);
});
it('shows deletion and insertion as valid Markdown blocks',()=>{
  const removed=renderToStaticMarkup(<MarkdownChangesView before={'# Heading\n\nGone.'} after={'# Heading'} />);
  expect(removed).toContain('revision-removed'); expect(removed).not.toContain('revision-added');
  const added=renderToStaticMarkup(<MarkdownChangesView before={'# Heading'} after={'# Heading\n\n**Appeared.**'} />);
  expect(added).toContain('<strong>Appeared.</strong>');
});
