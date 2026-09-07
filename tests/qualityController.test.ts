import { describe, it, expect } from 'vitest';
import { QualityController } from '../utils/qualityController';

describe('QualityController', () => {
  it('instantiates successfully', () => {
    const qc = new QualityController();
    expect(qc).toBeDefined();
  });

  it('analyzes chapter quality without crashing', async () => {
    const qc = new QualityController();
    const sampleText = `
      The bright light cast a dark shadow across the old room. 
      She looked at him with quiet fear. 
      Her heart raced. Her breathing slowed.
      Suddenly, a sharp noise echoed in the stillness.
    `;

    const result = qc.analyzeChapter(sampleText, 'emotional');

    expect(result).toBeDefined();
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.repetition).toBeDefined();
    expect(Array.isArray(result.repetition.overusedWords)).toBe(true);
    expect(result.pacing).toBeDefined();
    expect(result.showVsTell).toBeDefined();
  });
});
