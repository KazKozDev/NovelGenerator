import { describe, expect, it } from 'vitest';
import {
  extractTitle,
  cleanFallbackTitle,
  AUDIT_STAGES,
  AUDIT_CALLS,
} from '../utils/novel/craft/craftOrchestrator';

describe('craftOrchestrator utilities', () => {
  it('extracts book title when properly formatted', () => {
    const text1 = 'Some notes\nTITLE: The Silent Watcher\nMore text';
    expect(extractTitle(text1)).toBe('The Silent Watcher');

    const text2 = 'BOOK TITLE: "Shadows in the Fog"\nGenre: Mystery';
    expect(extractTitle(text2)).toBe('Shadows in the Fog');

    const text3 = 'No title format here at all';
    expect(extractTitle(text3)).toBeUndefined();

    const text4 = 'TITLE: None';
    expect(extractTitle(text4)).toBeUndefined();
  });

  it('generates clean fallback title from premise', () => {
    expect(cleanFallbackTitle('')).toBe('Untitled Book');
    expect(cleanFallbackTitle('A lone detective in space')).toBe('A lone detective in space');
    expect(
      cleanFallbackTitle(
        'A very long premise that exceeds fifty characters and goes on describing a dark rainy city with shadows'
      )
    ).not.toBe('Untitled Book');
  });

  it('defines valid audit stages and audit call reservation', () => {
    expect(AUDIT_STAGES.has('craft-dev-review')).toBe(true);
    expect(AUDIT_STAGES.has('craft-lit-review')).toBe(true);
    expect(AUDIT_CALLS).toBeGreaterThan(0);
  });

  it('extracts book title from dossier with markdown header or explicit title key', () => {
    const dossier1 = '0. BOOK TITLE:\n   - BOOK TITLE: The Serpent and the Stone\n\n1. OBJECTIVE TRUTH...';
    expect(extractTitle(dossier1)).toBe('The Serpent and the Stone');

    const dossier2 = '# The Alchemist of Prague\n\nTITLE: The Alchemist of Prague\n\nObjective facts...';
    expect(extractTitle(dossier2)).toBe('The Alchemist of Prague');
  });
});
