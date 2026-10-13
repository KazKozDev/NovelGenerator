import { describe, expect, it } from 'vitest';
import { describeCall } from '../hooks/useBookGenerator';

describe('call labels', () => {
  it('names the author\'s own steps', () => {
    expect(describeCall('author-step', 'anything').title).toBe('The author at its desk');
    expect(describeCall('author-reader', 'anything').title).toBe('A reader reads this far');
    expect(describeCall(undefined, 'Compare three candidate plans').title).toBe('Compare three candidate plans');
  });
});
