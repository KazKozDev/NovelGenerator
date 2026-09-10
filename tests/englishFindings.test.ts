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

describe('The silent-failure shapes, in Cyrillic and mixed text', () => {
  const leak = (description: string, quote = description): ReviewIssue =>
    ({ id: 'k', category: 'knowledge', severity: 'critical', description, instruction: 'Fix.', evidence: [{ chapter: 3, revision: 7, quote }] });

  it('reads a Russian hedge, which an ASCII word boundary could not', () => {
    // The exact failure: \b is a Latin word boundary in JavaScript and matches nothing beside Cyrillic,
    // so this rule once existed and did nothing at all on the books it was written for.
    expect(demoteHedgedKnowledge([leak('Марина посмотрела на фигуру, возможно, того самого журналиста.')])[0].severity).toBe('minor');
    expect(demoteHedgedKnowledge([leak('Алексей предполагает, что за этим стоит сенатор.')])[0].severity).toBe('minor');
    expect(demoteHedgedKnowledge([leak('Алексей набрал номер Марии Соколовой, дочери журналиста.')])[0].severity).toBe('critical');
  });

  it('reads a hedge at the very edges of a sentence, where a boundary rule is easiest to get wrong', () => {
    expect(demoteHedgedKnowledge([leak('Возможно, он знал её имя.')])[0].severity).toBe('minor');
    expect(demoteHedgedKnowledge([leak('Он знал её имя — по крайней мере')])[0].severity).toBe('minor');
    // A word that merely contains a hedge inside it is not a hedge: "невозможно" is not "возможно".
    expect(demoteHedgedKnowledge([leak('Невозможное стало фактом: он знал её имя.')])[0].severity).toBe('critical');
  });

  it('reads a mixed-script sentence, where half the words are Latin', () => {
    expect(demoteHedgedKnowledge([leak('Elias seemed to recognise то самое имя, которого ему никто не называл.')])[0].severity).toBe('minor');
    expect(demoteSuggestions([{ ...leak('Мотивация Елены недостаточна for the scene to land.'), category: 'character', severity: 'major' }])[0].severity).toBe('minor');
  });

  it('matches inflected forms, which exact comparison could not', () => {
    // "Колонне" against "Колонна", "убийстве" against "убийства": the same word to a reader.
    const canon = { ...emptyStoryState(), facts: [{ id: 'c', subject: 'Колонна №305', predicate: 'содержит', value: 'запись убийства журналиста', knownBy: ['Алексей'], evidence: { chapter: 1, revision: 1, quote: 'q' } }] };
    expect(demoteKnownCanon([leak('Алексей использует знание о Колонне №305 и убийстве журналиста.')], canon)[0].severity).toBe('minor');
  });
});
