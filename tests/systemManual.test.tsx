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

  it('App does not render bottom page footer element', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).not.toContain('<footer className="w-full');
    expect(html).not.toContain('<footer');
  });
});
