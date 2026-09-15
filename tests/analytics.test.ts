import { describe, it, expect } from 'vitest';
import {
  bestsellerAdvisory,
  wornPhrases,
  extractPremiseNames,
  hookScore,
  measureTexture,
  recurrentMotifs,
  rhythmDrift,
  sharedDistinctivePhrasing,
  uniqueNgramRatio,
} from '../utils/novel/analytics';

describe('analytics detectors', () => {
  it('flags a phrase circled across distinct sentences', () => {
    const text = [
      'The upper room held its light through the storm.',
      'He saw the upper room held its light.',
      'By midnight the upper room held its light.',
      'She stared at the cold stairs in silence.',
    ].join(' ');
    const motifs = recurrentMotifs(text);
    expect(motifs.length).toBeGreaterThan(0);
    expect(motifs[0].sentences).toBe(3);
    expect(motifs[0].phrase).toContain('room held its light');
  });

  it('ignores ordinary glue repeated everywhere', () => {
    const text = 'He went to the door and then he went to the window and then he went to the stairs.';
    expect(recurrentMotifs(text)).toEqual([]);
  });

  it('extracts premise names and skips sentence-start common words', () => {
    expect(extractPremiseNames('A love triangle of Aren, Miro and someone else.'))
      .toEqual(['Aren', 'Miro']);
    expect(extractPremiseNames('After the lighthouse goes dark, keeper Aren Miro must relight it.'))
      .toEqual(['Aren Miro']);
    // Position alone never disqualifies: a name first is still a name.
    expect(extractPremiseNames('Aren wept.')).toEqual(['Aren']);
    // A capitalized common noun is still extracted — letting it pass is the
    // gaps filter's job, not the extractor's silence.
    expect(extractPremiseNames('Hope dies last in the garrison.')).toEqual(['Hope']);
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
    const chapter = 'The upper room held its light through the storm. Aren watched the stairs.';
    const plan = 'Upper room, night. The upper room held its light while they waited.';
    const shared = sharedDistinctivePhrasing(plan, chapter);
    expect(shared.some(phrase => phrase.includes('room held its light'))).toBe(true);
    expect(sharedDistinctivePhrasing('A sunny platform above the roaring waterfall.', chapter)).toEqual([]);
    expect(sharedDistinctivePhrasing('He went to the door.', chapter)).toEqual([]);
  });

  it('advises on a weak hook and a recap ending', () => {
    const findings = bestsellerAdvisory('It was a quiet morning. There was bread. In summary, they had a fine day.');
    expect(findings.map(finding => finding.id)).toContain('weak-opening-hook');
  });
});

describe('wornPhrases', () => {
  // One sentence carrying the tic, repeated with different surroundings, the way
  // a generated book actually wears a somatic beat out.
  const filler = 'The room held its shapes in the grey afternoon and nobody moved through them. ';
  const tic = (n: number) => Array.from({ length: n }, (_, i) => `On the ${i + 1} day his shoulder tightened against the cold air. `).join('');

  it('reports a two-word beat that returns at a rate, with its count', () => {
    const text = tic(7) + filler.repeat(120);
    const found = wornPhrases(text);
    const tightened = found.find(item => item.phrase === 'shoulder tightened');
    expect(tightened?.uses).toBe(7);
    expect(tightened!.per1000).toBeGreaterThan(0.5);
  });

  it('says nothing about a book that repeats its own subject by name', () => {
    // A capitalized invented term is the book's own device, not a tic:
    // capitalized spans are skipped.
    const text = 'The Kindral flared between them. '.repeat(12) + filler.repeat(120);
    expect(wornPhrases(text).some(item => item.phrase.includes('echo'))).toBe(false);
  });

  it('does not report contractions or short books', () => {
    const text = "She didn't know what he didn't say. ".repeat(10) + filler.repeat(120);
    expect(wornPhrases(text).some(item => item.phrase.includes('didn'))).toBe(false);
    expect(wornPhrases(tic(9))).toEqual([]);
  });
});
