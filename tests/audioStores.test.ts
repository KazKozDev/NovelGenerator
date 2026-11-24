import { describe, it, expect } from 'vitest';
import { AUDIO_STORES, audioParts, audioReadiness, measureChecks, partFileName, type AudioMeasure } from '../utils/publish/audioStores';
import type { ChapterTimecode } from '../utils/audiobook/chapterTimecodes';

const store = (id: string) => AUDIO_STORES.find(s => s.id === id)!;
const timecodes: ChapterTimecode[] = [
  { chapter: 1, label: 'Chapter 1: No Names', start: 12, score: 0.9 },
  { chapter: 2, label: 'Chapter 2: Duty to Warn', start: 900, score: 0.9 },
  { chapter: 3, label: 'Chapter 3: Room 412', start: 1800, score: 0.8 },
];

describe('audioParts', () => {
  it('cuts ACX files: opening credits before chapter 1, chapters to the next start, a retail sample', () => {
    const parts = audioParts(store('acx'), timecodes, 2700);
    expect(parts.map(p => [p.kind, p.label, p.start, p.end])).toEqual([
      ['opening', 'Opening Credits', 0, 11.25],
      ['chapter', 'Chapter 1: No Names', 11.25, 899.25],
      ['chapter', 'Chapter 2: Duty to Warn', 899.25, 1799.25],
      ['chapter', 'Chapter 3: Room 412', 1799.25, 2700],
      ['sample', 'Retail Sample', 11.25, 11.25 + 270],
    ]);
    expect(partFileName(parts[1], 1, store('acx'))).toBe('02 Chapter 1 - No Names.mp3');
  });

  it('gives Google chapter files without credits, and YouTube one video of the whole book', () => {
    expect(audioParts(store('google'), timecodes, 2700).map(p => p.kind)).toEqual(['chapter', 'chapter', 'chapter']);
    expect(audioParts(store('google'), timecodes, 2700)[0].start).toBe(0);
    expect(audioParts(store('youtube'), timecodes, 2700)).toEqual([{ kind: 'video', label: 'YouTube video', start: 0, end: 2700 }]);
  });

  it('blocks a chapter store while a chapter has no timecode', () => {
    const missing = [...timecodes.slice(0, 2), { ...timecodes[2], start: null, score: 0 }];
    const checks = audioReadiness(store('acx'), { title: 'T', author: 'A', timecodes: missing, chapters: 3, hasCover: true, hasMaster: true });
    expect(checks.find(c => c.text.includes('not found'))?.level).toBe('fail');
    expect(audioReadiness(store('youtube'), { title: 'T', author: 'A', timecodes: missing, chapters: 3, hasCover: true, hasMaster: true }).some(c => c.level === 'fail')).toBe(false);
  });
});

describe('measureChecks', () => {
  const measure: AudioMeasure = { name: '02 Chapter 1.mp3', duration: 880, rms: -20.4, peak: -3.6, noise: -72, head: 0.75, tail: 2, sampleRate: 44100, bitrateKbps: 192, channels: 1 };
  const chapter = { kind: 'chapter' as const, label: 'Chapter 1', start: 0, end: 880 };

  it('passes a file within the ACX limits', () => {
    expect(measureChecks(store('acx'), chapter, measure).every(c => c.level === 'ok')).toBe(true);
  });

  it('fails a file that is too quiet, peaks too high or is too long', () => {
    const failing = measureChecks(store('acx'), chapter, { ...measure, rms: -24.6, peak: -1.2, duration: 130 * 60 }).filter(c => c.level === 'fail').map(c => c.text.split(' ')[0]);
    expect(failing).toEqual(['RMS', 'Peak', 'Length']);
  });
});
