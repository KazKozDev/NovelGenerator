import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CoherencePanel from '../components/CoherencePanel';
import LocalModelToggles from '../components/LocalModelToggles';
import ModelSwitch from '../components/ModelSwitch';
import PlanView from '../components/PlanView';

describe('CoherencePanel', () => {
  it('renders measured metrics for a finished manuscript', () => {
    const html = renderToStaticMarkup(
      <CoherencePanel content="Run! Mara shouted, grabbing the ledger as the alarm tore through the market. She closed the ledger and ran for the train." />,
    );
    expect(html).toContain('Phrasing originality');
    expect(html).toContain('Recurrent motifs');
    expect(html).toContain('Closing rhythm');
    expect(html).toContain('Opening hook');
  });

  it('renders nothing for empty content', () => {
    expect(renderToStaticMarkup(<CoherencePanel content="   " />)).toBe('');
  });
});

describe('LocalModelToggles', () => {
  it('offers the five opt-in models off, and the cross-encoder on, as each one actually defaults', () => {
    const html = renderToStaticMarkup(<LocalModelToggles />);
    for (const name of ['Contradiction scan', 'Language watch', 'Ledger compression', 'Genre check', 'Emotion scoring']) {
      expect(html).toContain(name);
    }
    // The five opt-in rows come first and none of them is checked; only the last row is.
    const rows = html.split('<label').slice(1);
    expect(rows).toHaveLength(6);
    expect(rows.slice(0, 5).join('')).not.toContain('checked');
    // On by default and the heaviest of them: a reader whose tab stops answering has to be able to
    // find this one, and it is the switch that says what turning it off costs.
    expect(rows[5]).toContain('Repetition cross-encoder');
    expect(rows[5]).toContain('checked');
    expect(rows[5]).toContain('the cosine then decides alone');
  });
});

describe('ModelSwitch', () => {
  it('offers a free-text Gemini model field for the writer', () => {
    const html = renderToStaticMarkup(<ModelSwitch />);
    expect(html).toContain('switchWriterGemini');
  });
});

describe('PlanView scenes', () => {
  it('shows staging and shape per scene instead of bare IDs', () => {
    const plan = JSON.stringify({
      title: 'The Ledger',
      summary: 'Mara takes the ledger.',
      detailedScenes: [{
        sceneId: 's1', location: 'market', participants: ['Mara'],
        objective: 'Take the ledger', conflict: 'The guard watches', outcome: 'She runs',
        keyMoments: ['the grab'], sceneShape: 'heist', staging: 'Mara by the stall, ledger on the counter',
      }],
    });
    const html = renderToStaticMarkup(<PlanView content={plan} />);
    expect(html).toContain('heist');
    expect(html).toContain('Mara by the stall');
    expect(html).toContain('Scenes');
  });
});
