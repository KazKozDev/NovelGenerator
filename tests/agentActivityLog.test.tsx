import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import AgentActivityLog from '../components/AgentActivityLog';

it('shows what a call did and how it ended, not only that it ran', () => {
  const html = renderToStaticMarkup(<AgentActivityLog logs={[
    { timestamp: 1, chapterNumber: 1, type: 'execution', message: 'Scene T05 · writing · Claude:claude-3-7-sonnet', details: 'd', finished: true, outcome: '14s · sent 52K · received 6K' },
    { timestamp: 2, chapterNumber: 1, type: 'warning', message: 'Scene plan · writing · Claude:claude-3-7-sonnet', details: 'd', finished: true, outcome: 'Failed after 3s: token limit' },
    { timestamp: 3, chapterNumber: 1, type: 'execution', message: 'Scene T06 · review · Ollama:deepseek', details: 'd' },
  ]} />);
  expect(html).toContain('Scene T05 · writing');
  expect(html).toContain('14s · sent 52K · received 6K');
  expect(html).toMatch(/>Done<[\s\S]*>Failed<[\s\S]*>Running</);
});
