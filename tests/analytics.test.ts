import { describe, it, expect } from 'vitest';
import {
  bestsellerAdvisory,
  extractPremiseNames,
  hookScore,
  measureTexture,
  recurrentMotifs,
  rhythmDrift,
  sharedDistinctivePhrasing,
  tiredPhrases,
  uniqueNgramRatio,
} from '../utils/novel/analytics';

describe('analytics detectors', () => {
  it('flags a phrase circled across distinct sentences', () => {
    const text = [
      'The lamp room held its light through the storm.',
      'He saw the lamp room held its light.',
      'By midnight the lamp room held its light.',
      'She stared at the cold stairs in silence.',
    ].join(' ');
    const motifs = recurrentMotifs(text);
    expect(motifs.length).toBeGreaterThan(0);
    expect(motifs[0].sentences).toBe(3);
    expect(motifs[0].phrase).toContain('lamp room held its');
  });

  it('ignores ordinary glue repeated everywhere', () => {
    const text = 'He went to the door and then he went to the window and then he went to the stairs.';
    expect(recurrentMotifs(text)).toEqual([]);
  });

  it('extracts premise names and skips sentence-start common words', () => {
    expect(extractPremiseNames('A love triangle of Zor, Pax and someone else.'))
      .toEqual(['Zor', 'Pax']);
    expect(extractPremiseNames('After the lighthouse goes dark, keeper Zor Pax must relight it.'))
      .toEqual(['Zor Pax']);
    // Position alone never disqualifies: a name first is still a name.
    expect(extractPremiseNames('Zor wept.')).toEqual(['Zor']);
    // A capitalized common noun is still extracted — letting it pass is the
    // gaps filter's job, not the extractor's silence.
    expect(extractPremiseNames('Hope dies last in the garrison.')).toEqual(['Hope']);
  });

  it('flags tired phrases across finished prose for the writer watch', () => {
    const chapters = [
      'Vem set the dark blue mug on the counter and waited.',
      'Zor reached past Vem for the dark blue mug without thinking.',
      'Kex stared at the dark blue mug while the coffee cooled.',
      'The dark blue mug sat empty between the three of them.',
      'Zor climbed the tower stairs while the storm took the rail.',
    ];
    const tired = tiredPhrases(chapters);
    expect(tired.length).toBeGreaterThan(0);
    expect(tired[0].phrase).toContain('dark blue mug');
    expect(tiredPhrases(['Zor climbed the tower in silence.'])).toEqual([]);
  });

  it('holds rhythm on even prose and flags a collapse', () => {
    const even = Array.from({ length: 15 }, () => 'The old lighthouse keeper climbed the narrow winding stairs very slowly.').join(' ');
    expect(rhythmDrift(even).drifted).toBe(false);
    const collapse = [
      ...Array.from({ length: 10 }, () => 'The old lighthouse keeper climbed the narrow winding stairs very slowly each night without fail.'),
      ...['Dark and cold.', 'Gone by dawn.', 'Run and hide.', 'No way back.', 'Hold the line.', 'Now we wait.'],
    ].join(' ');
    const report = rhythmDrift(collapse);
    expect(report.sentences).toBeGreaterThanOrEqual(12);
    expect(report.drifted).toBe(true);
  });

  it('scores a hooked opening above a flat one', () => {
    expect(hookScore('"Run!" she shouted. The alarm tore through the station. Who had opened the gate?')).toBeGreaterThan(
      hookScore('It was a quiet morning in the village. There was bread on the table.'),
    );
  });

  it('rates varied phrasing above copy-paste', () => {
    const varied = 'The sea kept its counsel. Gulls argued over bright scraps. A bell counted the fog.';
    const repeated = 'The sea kept its counsel. The sea kept its counsel. The sea kept its counsel.';
    expect(uniqueNgramRatio(varied)).toBeGreaterThan(uniqueNgramRatio(repeated));
  });

  it('measures dialogue, paragraph length, comparisons and beats', () => {
    const text = [
      '"We leave at dawn," she said.',
      '',
      'He nodded like a man accepting winter.',
      '',
      '"Then we run."',
    ].join('\n');
    const texture = measureTexture(text);
    expect(texture.dialogueShare).toBeGreaterThan(0.2);
    expect(texture.medianParagraphWords).toBeGreaterThan(2);
    expect(texture.similesPer1000).toBeGreaterThan(0);
    expect(texture.taggedSpeechShare).toBeCloseTo(0.5, 1);
  });

  it('finds a staging about to be restaged, and stays quiet otherwise', () => {
    const chapter = 'The lamp room held its light through the storm. Zor watched the stairs.';
    const plan = 'Lamp room, night. The lamp room held its light while they waited.';
    const shared = sharedDistinctivePhrasing(plan, chapter);
    expect(shared.some(phrase => phrase.includes('lamp room held its'))).toBe(true);
    expect(sharedDistinctivePhrasing('A sunny platform above the roaring waterfall.', chapter)).toEqual([]);
    expect(sharedDistinctivePhrasing('He went to the door.', chapter)).toEqual([]);
  });

  it('advises on a weak hook and a recap ending', () => {
    const findings = bestsellerAdvisory('It was a quiet morning. There was bread. In summary, they had a fine day.');
    expect(findings.map(finding => finding.id)).toContain('weak-opening-hook');
  });
});
