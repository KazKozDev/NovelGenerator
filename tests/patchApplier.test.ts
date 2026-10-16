import { describe, it, expect } from 'vitest';
import {
  applySearchReplacePatch,
  pushUndoState,
  popUndoState,
} from '../utils/novel/patchApplier';

const TEST_MANUSCRIPT = `
## Chapter 1: The Descent

The pressurized air hissed against the sealed hatch. Clark adjusted the heavy oxygen canister.

Below them, the subterranean limestone stretched into absolute darkness.

## Chapter 2: The Fracture

Bruce stepped forward on the cold tile floor. His wrist throbbed.
`.trim();

describe('patchApplier', () => {
  it('applies exact search and replace in target chapter without touching other chapters', () => {
    const result = applySearchReplacePatch(
      TEST_MANUSCRIPT,
      2,
      'cold tile floor',
      'cold limestone slab'
    );

    expect(result.success).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.updatedManuscript).toContain('cold limestone slab');
    expect(result.updatedManuscript).not.toContain('cold tile floor');
    // Chapter 1 preserved verbatim
    expect(result.updatedManuscript).toContain('oxygen canister');
  });

  it('handles whitespace variations gracefully', () => {
    const result = applySearchReplacePatch(
      TEST_MANUSCRIPT,
      1,
      'Clark   adjusted  the heavy oxygen canister.',
      'Clark tightened the heavy oxygen cylinder.'
    );

    expect(result.success).toBe(true);
    expect(result.updatedManuscript).toContain('oxygen cylinder');
  });

  it('returns success: false with clear error if search target is absent', () => {
    const result = applySearchReplacePatch(
      TEST_MANUSCRIPT,
      1,
      'Non-existent text quote that never existed in ch 1',
      'replacement'
    );

    expect(result.success).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.error).toContain('Target text not found');
  });

  it('manages undo stack transitions cleanly', () => {
    let stack = pushUndoState([], TEST_MANUSCRIPT, 'Initial text', 1);
    expect(stack.length).toBe(1);

    const patchedText = TEST_MANUSCRIPT.replace('limestone', 'granite');
    stack = pushUndoState(stack, patchedText, 'Replaced limestone with granite', 1);
    expect(stack.length).toBe(2);

    const popped = popUndoState(stack);
    expect(popped).not.toBeNull();
    expect(popped?.previous.manuscript).toBe(patchedText);
    expect(popped?.updatedStack.length).toBe(1);
    expect(popped?.updatedStack[0].manuscript).toBe(TEST_MANUSCRIPT);
  });

  it('strips diff markers and trailing ellipsis gracefully', () => {
    const result = applySearchReplacePatch(
      TEST_MANUSCRIPT,
      1,
      '--Clark adjusted the heavy oxygen canister...',
      '+ Clark tightened the heavy oxygen tank.'
    );

    expect(result.success).toBe(true);
    expect(result.updatedManuscript).toContain('Clark tightened the heavy oxygen tank.');
  });

  it('automatically resolves target when model points to wrong chapter', () => {
    // 'cold tile floor' is actually in Chapter 2, but caller specifies Chapter 1
    const result = applySearchReplacePatch(
      TEST_MANUSCRIPT,
      1,
      'cold tile floor',
      'polished marble floor'
    );

    expect(result.success).toBe(true);
    expect(result.matchedChapter).toBe(2);
    expect(result.updatedManuscript).toContain('polished marble floor');
  });

  it('rejects no-op edits with identical search and replacement', () => {
    const result = applySearchReplacePatch(
      TEST_MANUSCRIPT,
      1,
      '--Clark adjusted the heavy oxygen canister',
      '++Clark adjusted the heavy oxygen canister'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('identical (no-op edit)');
  });
});

