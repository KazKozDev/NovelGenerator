import { describe, it, expect, vi } from 'vitest';
import {
  analyzeCoverImage,
  recommendCoverStyling,
  type ImageCompositionAnalysis,
} from '../utils/cover/artDirector';

describe('artDirector heuristics', () => {
  it('returns fallback analysis gracefully if canvas is unavailable or headless', () => {
    const analysis = analyzeCoverImage({} as any);
    expect(analysis).toBeDefined();
    expect(analysis.isDark).toBe(true);
    expect(analysis.saliency.recommendedLayout).toBe('editorial_left');
    expect(analysis.palette.badgeColor).toBe('#e5a93c');
    expect(analysis.palette.badgeTextColor).toBe('#18181b');
  });

  it('recommends editorial_left and warm badge when focal subject is on the right', () => {
    const mockAnalysis: ImageCompositionAnalysis = {
      brightness: 70,
      contrast: 35,
      isDark: true,
      recommendedTextColor: '#fdfbf7',
      saliency: {
        leftDensity: 200,
        centerDensity: 400,
        rightDensity: 900,
        focalPoint: { x: 0.75, y: 0.6 },
        recommendedLayout: 'editorial_left',
      },
      palette: {
        dominant: '#1c1917',
        accent: '#e5a93c',
        badgeColor: '#e5a93c',
        badgeTextColor: '#18181b',
      },
    };

    const rec = recommendCoverStyling(mockAnalysis, {
      title: 'The Thursday Room',
      genre: 'Erotic Thriller',
      author: 'Artem Kozlov',
    });

    expect(rec.youtubeLayout).toBe('editorial_left');
    expect(rec.focus.x).toBe(0.75);
    expect(rec.focus.y).toBe(0.6);
    expect(rec.badge).toBe('THRILLER AUDIOBOOK');
    expect(rec.badgeColor).toBe('#e5a93c');
    expect(rec.badgeTextColor).toBe('#18181b');
    expect(rec.color).toBe('#fdfbf7');
    expect(rec.reason).toContain('Detected focal subject on right');
  });

  it('recommends classic centered layout for balanced composition', () => {
    const mockAnalysis: ImageCompositionAnalysis = {
      brightness: 80,
      contrast: 30,
      isDark: true,
      recommendedTextColor: '#fdfbf7',
      saliency: {
        leftDensity: 500,
        centerDensity: 800,
        rightDensity: 500,
        focalPoint: { x: 0.5, y: 0.5 },
        recommendedLayout: 'classic',
      },
      palette: {
        dominant: '#18181b',
        accent: '#38bdf8',
        badgeColor: '#38bdf8',
        badgeTextColor: '#18181b',
      },
    };

    const rec = recommendCoverStyling(mockAnalysis, {
      title: 'Distant Stars',
      genre: 'Sci-Fi',
      author: 'A. K.',
    });

    expect(rec.youtubeLayout).toBe('classic');
    expect(rec.badge).toBe('FULL AUDIOBOOK');
    expect(rec.badgeColor).toBe('#38bdf8');
    expect(rec.reason).toContain('centered composition');
  });
});
