import { describe, expect, it } from 'vitest';
import { readSpeechMap, speechMapApplies, spokenBy, type SpeechMap } from '../utils/novel/speechMap';

describe('The speech map', () => {
  it('applies to English prose and not to a script its models cannot read', () => {
    expect(speechMapApplies('Maria handed the caretaker the address. She had written it on a receipt.')).toBe(true);
    expect(speechMapApplies('Марина посмотрела на окно напротив и не увидела там ни света, ни силуэта.')).toBe(false);
    expect(speechMapApplies('')).toBe(false);
  });

  it('is unavailable rather than empty when it cannot run', async () => {
    // A missing map must never read as a chapter with no dialogue in it.
    expect(await readSpeechMap('Марина посмотрела на окно напротив.')).toBeUndefined();
    expect(await readSpeechMap('Maria handed him the address.', '/nonexistent-root')).toBeUndefined();
  });

  it('reads back what one character said, in the order the chapter says it', () => {
    // The shape BookNLP produced on the first passage it was given, speakers and all.
    const map: SpeechMap = {
      characters: [{ id: 0, names: ['Maria'], mentions: 8 }, { id: 1, names: ['Alexei'], mentions: 6 }],
      quotes: [
        { speaker: 1, attributedTo: 'he', startToken: 90, text: '"I suspected."' },
        { speaker: 0, attributedTo: 'she', startToken: 18, text: '"Take it."' },
        { speaker: 0, attributedTo: 'Maria', startToken: 70, text: '"You knew."' },
      ],
      coreference: [['Alexei', 'He', 'he', 'I']],
    };
    expect(spokenBy(map, 0).map(line => line.text)).toEqual(['"Take it."', '"You knew."']);
    expect(spokenBy(map, 1).map(line => line.text)).toEqual(['"I suspected."']);
  });
});
