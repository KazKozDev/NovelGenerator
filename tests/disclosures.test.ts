import { describe, it, expect } from 'vitest';
import { DIGITAL_VOICE_LINE, narrationCheck, platformDisclosures } from '../utils/publish/disclosures';
import { AUDIO_STORES, audioReadiness } from '../utils/publish/audioStores';

const facts = { title: 'T', author: 'A', timecodes: [{ chapter: 1, label: 'Chapter 1', start: 0, score: 1 }], chapters: 1, hasCover: true, hasMaster: true };

describe('disclosures', () => {
  it('blocks ACX for a digital voice and lets the other audio stores through with a declaration', () => {
    const acx = AUDIO_STORES.find(s => s.id === 'acx')!, spotify = AUDIO_STORES.find(s => s.id === 'spotify')!;
    expect(audioReadiness(acx, { ...facts, narration: 'digital' }).find(c => c.level === 'fail')?.text).toMatch(/human narration only/);
    expect(audioReadiness(acx, { ...facts, narration: 'human' }).some(c => c.level === 'fail')).toBe(false);
    expect(audioReadiness(spotify, { ...facts, narration: 'digital' }).some(c => c.level === 'fail')).toBe(false);
    expect(narrationCheck('youtube', 'digital')).toBeNull();
  });

  it('tells each store what to declare, where', () => {
    const kdp = platformDisclosures('ebook:kindle', { narration: 'digital', aiCover: true });
    expect(kdp.every(d => d.where === 'KDP · Content tab')).toBe(true);
    expect(kdp[1].text).toMatch(/image model/);
    expect(platformDisclosures('audio:spotify', { narration: 'digital', aiCover: false }).find(d => d.paste)?.text).toBe(DIGITAL_VOICE_LINE);
    expect(platformDisclosures('video:youtube', { narration: 'human', aiCover: false })).toEqual([]);
  });
});
