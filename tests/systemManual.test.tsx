import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { SystemManualModal } from '../components/SystemManualModal';
import App from '../App';

describe('SystemManualModal and copyright placement', () => {
  it('renders copyright and KazKozDev link inside SystemManualModal', () => {
    const html = renderToStaticMarkup(
      <SystemManualModal isOpen={true} onClose={() => {}} />
    );
    expect(html).toContain('NovelGenerator · Craft 2.0 Engine');
    expect(html).toContain('https://github.com/KazKozDev');
    expect(html).toContain('KazKozDev');
  });

  it('does not render copyright or KazKozDev link when modal is closed', () => {
    const html = renderToStaticMarkup(
      <SystemManualModal isOpen={false} onClose={() => {}} />
    );
    expect(html).toBe('');
  });

  it('App renders 4-column footer on main view', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('id="app-page-footer"');
    expect(html).toContain('Craft 2.0 Engine');
    expect(html).toContain('Formats &amp; Export');
    expect(html).toContain('Privacy &amp; Offline');
    expect(html).toContain('Colophon &amp; Rights');
    expect(html).toContain('KazKozDev');
  });
});
