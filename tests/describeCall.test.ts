import { describe, expect, it } from 'vitest';
import { describeCall } from '../hooks/useBookGenerator';

describe('what the inspector says a call is doing', () => {
  const request = 'Author request: {"planning_version":2,"premise":"Nora Blake is a counselor"}\n';
  it('names the step instead of repeating the author request', () => {
    expect(describeCall('thesis-chapter-development', request + 'Develop the dramatic progression').title).toBe('Chapter development · writing');
    expect(describeCall('thesis-chapter-development-review', request).title).toBe('Chapter development · review');
    expect(describeCall('thesis-plan-stress', request).title).toBe('Scene plan · stress test of the mechanism');
    expect(describeCall('thesis-final-audit', request).title).toBe('Final audit');
  });
  it('names the scene a scene call concerns', () => {
    expect(describeCall('thesis-block-write', request + 'CURRENT THESIS — WRITE DIRECTLY BENEATH THIS ONE:\n{"id":"T05","chapter":2}').title).toBe('Scene T05 · writing');
    expect(describeCall('thesis-block-review', request + 'MATERIAL TO CHECK:\n{"thesis":"T07 (whole in the outline above)"}').title).toBe('Scene T07 · review');
    expect(describeCall('thesis-expand', request + 'Phase: expand. Current thesis: {"id":"T02","chapter":1}').title).toBe('Scene T02 · expanding to length');
    expect(describeCall('thesis-state', 'SCENE T03:\nNora left.').title).toBe('Scene T03 · where things are, and who has learned what');
    expect(describeCall('thesis-rough-repair', request + 'Writable blocks: ["T09"]').title).toBe('Scene T09 · Whole-book repair · patching');
    expect(describeCall('thesis-block-review-evidence', 'Repair only invalid evidence citations').title).toBe('Scene ? · review · locating the cited passages');
  });
  it('says when a call is the repair of a refused answer, and what it was refused for', () => {
    const call = describeCall('thesis-plan', 'Repair this response contract with exact field edits, not a new complete response. Validation defect: Error: Invalid thesis. T12: requires names T14, which is not an earlier thesis.\nOriginal task and requirements:\n' + request);
    expect(call.title).toBe('Scene plan · writing · fixing a refused answer');
    expect(call.reason).toBe('Invalid thesis. T12: requires names T14, which is not an earlier thesis');
    expect(describeCall('thesis-plan', request).reason).toBe('');
  });
  it('falls back to the stage name, then to the old prompt matching', () => {
    expect(describeCall('develop-story', request).title).toBe('develop-story');
    expect(describeCall(undefined, 'Compare three candidate plans').title).toBe('Choosing the book plan');
  });
});
