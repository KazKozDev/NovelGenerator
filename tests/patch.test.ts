import { describe, expect, it } from 'vitest';
import type { ReviewIssue } from '../utils/novel/contracts';
import { applyPassages, passagesFor, repairableInPlace } from '../utils/novel/patch';

const chapter = [
  'The tuner set her case down on the step and listened to the water for a while.',
  'She had not opened a piano in this town before, and the keeper did not explain why he wanted it playable now.',
  'He already knew the make of her cello, though she had never told him what she used to play.',
  'The light went round twice before either of them said anything at all about the price.',
].join('\n\n');

const issue = (quote: string, id = 'k1', category: ReviewIssue['category'] = 'knowledge'): ReviewIssue =>
  ({ id, category, severity: 'major', description: 'He uses knowledge the chapter has not given him.', instruction: 'Take the knowledge away.', evidence: [{ chapter: 1, revision: 3, quote }] });

describe('Repairing the passage a finding names', () => {
  it('locates the paragraph and rewrites only that one', () => {
    const passages = passagesFor(chapter, [issue('He already knew the make of her cello')])!;
    expect(passages).toHaveLength(1);
    expect(passages[0].text).toContain('the make of her cello');
    const patched = applyPassages(chapter, passages, { f1: 'He guessed at the make of her cello, and guessed wrong.' });
    expect(patched).toContain('He guessed at the make of her cello');
    // Everything the finding did not name is the same text, not a reprint of it.
    expect(patched).toContain('The tuner set her case down on the step');
    expect(patched).toContain('The light went round twice');
    expect(patched).not.toContain('though she had never told him');
  });

  it('merges findings that fall in one paragraph, and keeps two apart as two', () => {
    const together = passagesFor(chapter, [issue('He already knew the make'), issue('never told him what she used to play', 'k2')])!;
    expect(together).toHaveLength(1);
    expect(together[0].issues).toHaveLength(2);
    const apart = passagesFor(chapter, [issue('He already knew the make'), issue('about the price', 'k2')])!;
    expect(apart).toHaveLength(2);
  });

  it('replaces by position, so a sentence that occurs twice keeps its other occurrence', () => {
    const doubled = `${chapter}\n\nHe already knew the make of her cello.`;
    const passages = passagesFor(doubled, [issue('He already knew the make of her cello')])!;
    const patched = applyPassages(doubled, passages, { f1: 'He asked what she played, and she did not answer.' });
    expect(patched).toContain('He asked what she played');
    // The repeat at the end was never the finding's subject and is left exactly as it was.
    expect(patched.trimEnd().endsWith('He already knew the make of her cello.')).toBe(true);
  });

  it('declines a finding it cannot place, rather than repairing something else', () => {
    expect(passagesFor(chapter, [issue('a sentence that is not in this chapter at all')])).toBeUndefined();
  });

  it('declines a defect that is a proportion, and one that would cover half the chapter', () => {
    // Editing the lines it quotes cannot change a share of the whole chapter.
    expect(repairableInPlace(chapter, [issue('He already knew the make', 'speech-tag-bloat', 'voice')], ['speech-tag-bloat'])).toBeUndefined();
    const everywhere = [issue('The tuner set her case'), issue('She had not opened a piano', 'k2'), issue('He already knew the make', 'k3')];
    expect(repairableInPlace(chapter, everywhere, [])).toBeUndefined();
    expect(repairableInPlace(chapter, [issue('He already knew the make')], [])).toHaveLength(1);
  });
});
