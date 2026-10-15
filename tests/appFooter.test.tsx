import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import AppFooter from '../components/AppFooter';

describe('AppFooter component', () => {
  it('renders 4 informative feature columns on normal page layout', () => {
    const html = renderToStaticMarkup(<AppFooter isStudioLayout={false} finalBookContent={false} />);
    
    // Column 1
    expect(html).toContain('Craft 2.0 Engine');
    expect(html).toContain('Autonomous Multi-Agent Cycle');
    expect(html).toContain('Causal Architecture');
    expect(html).toContain('Strict POV Barrier');

    // Column 2
    expect(html).toContain('Formats &amp; Export');
    expect(html).toContain('Professional Distribution');
    expect(html).toContain('EPUB 3.0');
    expect(html).toContain('Print-Ready PDF');

    // Column 3
    expect(html).toContain('Privacy &amp; Offline');
    expect(html).toContain('Author Sovereignty');
    expect(html).toContain('Zero Telemetry');
    expect(html).toContain('Local Ollama Support');

    // Column 4
    expect(html).toContain('Colophon &amp; Rights');
    expect(html).toContain('Legal &amp; Imprint Standards');
    expect(html).toContain('Automated Colophon');
    expect(html).toContain('Dual ISBN Registration');

    // Bottom bar
    expect(html).toContain('https://github.com/KazKozDev');
    expect(html).toContain('KazKozDev');
    expect(html).toContain('System Manual');
  });

  it('renders nothing when isStudioLayout is true to maximize writing workspace', () => {
    const html = renderToStaticMarkup(<AppFooter isStudioLayout={true} />);
    expect(html).toBe('');
  });

  it('adjusts max-width for book display when finalBookContent is true', () => {
    const html = renderToStaticMarkup(<AppFooter isStudioLayout={false} finalBookContent={true} />);
    expect(html).toContain('max-w-[1700px]');
  });
});
