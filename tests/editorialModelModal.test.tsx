import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import EditorialModelModal from '../components/EditorialModelModal';

describe('EditorialModelModal', () => {
  it('renders modal with providers and controls when isOpen is true', () => {
    const html = renderToStaticMarkup(
      <EditorialModelModal
        isOpen={true}
        onClose={vi.fn()}
        currentConfig={{
          provider: 'gemini',
          ollamaEndpoint: '/api/ollama',
          ollamaModel: 'qwen2.5:32b',
          geminiModel: 'gemini-2.5-flash',
        }}
        onSave={vi.fn()}
      />
    );

    expect(html).toContain('Assistant Model &amp; Provider');
    expect(html).toContain('Gemini');
    expect(html).toContain('Ollama');
    expect(html).toContain('Qwen');
    expect(html).toContain('Hugging Face');
    expect(html).toContain('Anthropic');
    expect(html).toContain('API compatible');
    expect(html).toContain('Apply model');
  });

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <EditorialModelModal
        isOpen={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(html).toBe('');
  });
});
