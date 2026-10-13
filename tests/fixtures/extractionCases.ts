import type { Passage } from '../../utils/novel/v3/continuityEval';
import type { ClaimSource } from '../../utils/novel/v3/continuityLedger';
import { continuityCases } from './continuityCases';

export interface ExtractionTarget {
  anchor: string; entities: string[]; sources: ClaimSource[]; holders: string[];
}
export interface ExtractionCase { id: string; passages: Passage[]; targets: ExtractionTarget[] }
const target = (anchor: string, entities: string[], sources: ClaimSource[], holders = ['narrator']): ExtractionTarget => ({ anchor, entities, sources, holders });
const example = (id: string, text: string, targets: ExtractionTarget[]): ExtractionCase => ({ id, passages: [{ id: 'A', text }], targets });

/** Fixed targets before inference. This tests attribution/provenance, not every assertion's meaning. */
export const extractionCases: ExtractionCase[] = [
  example('event-and-alibi', 'Nora entered the garage at noon. Nora told Vega, "I was in the office at noon."', [
    target('Nora entered the garage at noon.', ['nora'], ['event', 'narration']),
    target('"I was in the office at noon."', ['nora'], ['speech'], ['nora']),
  ]),
  example('two-speakers', 'Nora said, "I own the house." Claire said, "I own the hotel."', [
    target('"I own the house."', ['nora', 'house', 'the house'], ['speech'], ['nora']),
    target('"I own the hotel."', ['claire', 'hotel', 'the hotel'], ['speech'], ['claire']),
  ]),
  example('belief-and-event', 'Nora believed Paul was in Paris. Paul was in Madrid that morning.', [
    target('Nora believed Paul was in Paris.', ['paul'], ['thought'], ['nora']),
    target('Paul was in Madrid that morning.', ['paul'], ['narration', 'event']),
  ]),
  example('document', 'The letter stated that Nora sold the house on Monday. Claire forged the letter on Sunday.', [
    target('The letter stated that Nora sold the house on Monday.', ['nora', 'house', 'the house'], ['document'], ['letter', 'the letter']),
    target('Claire forged the letter on Sunday.', ['claire', 'letter', 'the letter'], ['event', 'narration']),
  ]),
  example('memory', 'Nora remembered leaving the key in the kitchen. The key was in the garage at noon.', [
    target('Nora remembered leaving the key in the kitchen.', ['key', 'the key'], ['thought'], ['nora']),
    target('The key was in the garage at noon.', ['key', 'the key'], ['event', 'narration']),
  ]),
  example('explicit-transfer', 'Claire took the scarf from the chair. Claire put the scarf in her bag.', [
    target('Claire took the scarf from the chair.', ['scarf', 'the scarf'], ['event', 'narration']),
    target('Claire put the scarf in her bag.', ['scarf', 'the scarf'], ['event', 'narration']),
  ]),
  example('same-name-pronouns', 'Nora met Claire. Claire said, "Nora has the key." Nora said, "Claire has the key."', [
    target('"Nora has the key."', ['key', 'the key', 'nora'], ['speech'], ['claire']),
    target('"Claire has the key."', ['key', 'the key', 'claire'], ['speech'], ['nora']),
  ]),
  example('later-admission', 'Nora said, "I left on Monday." Nora later said, "I lied about Monday."', [
    target('"I left on Monday."', ['nora'], ['speech'], ['nora']),
    target('"I lied about Monday."', ['nora'], ['speech'], ['nora']),
  ]),
  example('distinct-objects', 'The blue key was in the kitchen. The red key was in the garage.', [
    target('The blue key was in the kitchen.', ['blue key', 'the blue key'], ['event', 'narration']),
    target('The red key was in the garage.', ['red key', 'the red key'], ['event', 'narration']),
  ]),
  example('question-not-fact', 'Nora asked, "Did Paul take the key?" Paul left the hotel at noon.', [
    target('Paul left the hotel at noon.', ['paul'], ['event', 'narration']),
  ]),
  { id: 'saved-book-departure', passages: [continuityCases.find(c => c.id === 'nora-alibi-admitted')!.passages[0]], targets: [
    target('She left at five forty.', ['nora', 'she'], ['event', 'narration']),
    target('She was home by six fifteen.', ['nora', 'she'], ['event', 'narration']),
  ] },
  { id: 'saved-book-alibi', passages: [continuityCases.find(c => c.id === 'nora-alibi-admitted')!.passages[1]], targets: [
    target('*Monday,* Nora said.', ['nora'], ['speech'], ['nora']),
  ] },
];
