import { describe, expect, it } from 'vitest';
import type { ReviewIssue } from '../utils/novel/contracts';
import { confirmedFindings, demoteHedgedKnowledge, demoteKnownCanon, demoteSuggestions, mergeFindings, sameFindingSet } from '../utils/novel/review';
import { emptyStoryState } from '../utils/novel/storyState';

/**
 * Every filter these checks are made of was calibrated on Russian prose, because that is what the
 * first runs produced. Most books will be in English, and a rule that quietly matches nothing is the
 * failure mode this file exists to catch: a word boundary that does not fit Cyrillic was one such bug,
 * and a stem length that does not fit English would be its mirror image.
 */
const issue = (description: string, category: ReviewIssue['category'] = 'knowledge', severity: ReviewIssue['severity'] = 'major'): ReviewIssue =>
  ({ id: 'x', category, severity, description, instruction: 'Fix it.', evidence: [{ chapter: 3, revision: 7, quote: description }] });

describe('The finding filters, on English prose', () => {
  it('reads a hedge as a guess and a plain assertion as a leak', () => {
    expect(demoteHedgedKnowledge([issue('The figure resembled someone missing, possibly a journalist whose face had been in the news.')])[0].severity).toBe('minor');
    expect(demoteHedgedKnowledge([issue('He assumes the senator is behind the murder, which the chapter never established.')])[0].severity).toBe('minor');
    expect(demoteHedgedKnowledge([issue('Alexei dials Maria Sokolova, the daughter of the journalist in Column 305.')])[0].severity).toBe('major');
  });

  it('reads a wish as a wish and a structural defect as a defect', () => {
    expect(demoteSuggestions([issue("Elena's betrayal lacks sufficient motivation.", 'character')])[0].severity).toBe('minor');
    expect(demoteSuggestions([issue('Elena agrees too quickly for the tension the scene has built.', 'character')])[0].severity).toBe('minor');
    expect(demoteSuggestions([issue('The plan is introduced in Chapter 4 without prior setup or foreshadowing.', 'plot')])[0].severity).toBe('major');
  });

  it('recognises one finding through a rewording, and two findings as two', () => {
    const earlier = [issue('Alexei uses knowledge of the exact mechanism of the light acceleration, which the text never established.')];
    expect(sameFindingSet([issue('Alexei relies on specific knowledge about the mechanism that accelerated the light, not established earlier.')], earlier)).toBe(true);
    expect(sameFindingSet([issue('Elena knows about the rest room, though nobody gave her the floor plans.')], earlier)).toBe(false);
    expect(mergeFindings([issue('Alexei uses the name of the victim before it is available to him.'),
      issue('Alexei uses the victim name although it was not yet available to him.')])).toHaveLength(1);
  });

  it('finds the fact the canon already holds, in the case the complaint happens to use', () => {
    const canon = { ...emptyStoryState(), facts: [{ id: 'c', subject: 'Column 305', predicate: 'contains', value: 'the record of the journalist murder', knownBy: ['Alexei'], evidence: { chapter: 1, revision: 1, quote: 'q' } }] };
    expect(demoteKnownCanon([issue('Alexei uses knowledge of Column 305 and the murdered journalist without confirmation.')], canon)[0].severity).toBe('minor');
    expect(demoteKnownCanon([issue('Alexei names the address of Maria Sokolova, which nobody gave him.')], canon)[0].severity).toBe('major');
  });

  it('waits for a second sighting before a judgement of taste blocks a chapter', () => {
    const first = confirmedFindings([issue('Elena accepts the terms without showing any struggle of her own.', 'character')]);
    expect(first[0].severity).toBe('minor');
    expect(confirmedFindings([issue('Elena accepts his terms without showing an inner struggle of her own.', 'character')], first)[0].severity).toBe('major');
  });
});
