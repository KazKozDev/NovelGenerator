import { describe, expect, it } from 'vitest';
import { fillHeight } from '../utils/useFillHeight';

describe('a column that reaches the window bottom', () => {
  it('runs from its top to the window bottom, less what stays below it', () => {
    expect(fillHeight(133, 900, 20)).toBe(747);
  });
  it('never gets shorter than its minimum on a low window', () => {
    expect(fillHeight(600, 700, 20, 420)).toBe(420);
  });
});
