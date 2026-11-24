import { describe, it, expect } from 'vitest';
import { fingerprint, platformStage, publishSummary, type BuildRecord } from '../utils/publish/publishStatus';

const ok = [{ level: 'ok' as const, text: 'Author: A' }];
const record = (source: string, okFlag: boolean | null, note?: string): BuildRecord => ({ at: 1, source, ok: okFlag, note, files: ['x.epub'] });

describe('platformStage', () => {
  it('walks an edition from blocked to live', () => {
    expect(platformStage({ checks: [{ level: 'fail', text: 'Needs a cover' }], source: 's' })).toEqual({ stage: 'blocked', note: 'Needs a cover' });
    expect(platformStage({ checks: ok, source: 's' }).stage).toBe('ready');
    expect(platformStage({ checks: ok, source: 's', record: record('s', null, 'EPUBCheck is not installed') })).toEqual({ stage: 'built', note: 'EPUBCheck is not installed' });
    expect(platformStage({ checks: ok, source: 's', record: record('s', true) }).stage).toBe('checked');
    expect(platformStage({ checks: ok, source: 's', record: record('s', false, '2 files outside the limits') })).toEqual({ stage: 'failed', note: '2 files outside the limits' });
    expect(platformStage({ checks: ok, source: 's', record: record('s', true), liveAt: 5 })).toEqual({ stage: 'live', note: undefined });
  });

  it('sends a build made from older text back to ready, and says so on a live edition', () => {
    expect(platformStage({ checks: ok, source: 'new', record: record('old', true) })).toEqual({ stage: 'ready', note: 'Changed since the last build' });
    expect(platformStage({ checks: ok, source: 'new', record: record('old', true), liveAt: 5 }).note).toMatch(/Changed since it went live/);
  });

  it('fingerprints what an edition is made from', () => {
    expect(fingerprint('text', 'Author', 3)).toBe(fingerprint('text', 'Author', 3));
    expect(fingerprint('text', 'Author', 3)).not.toBe(fingerprint('text.', 'Author', 3));
  });
});

describe('publishSummary', () => {
  it('counts editions and gathers what blocks them, once per reason', () => {
    const s = publishSummary([
      { id: 'ebook:kindle', name: 'Amazon Kindle', stage: 'live' },
      { id: 'ebook:apple', name: 'Apple Books', stage: 'checked' },
      { id: 'ebook:google', name: 'Google Play Books', stage: 'ready' },
      { id: 'audio:acx', name: 'ACX', stage: 'blocked', note: 'Choose the recording' },
      { id: 'audio:spotify', name: 'Spotify', stage: 'blocked', note: 'Choose the recording' },
      { id: 'print:kdp', name: 'KDP Paperback', stage: 'failed', note: '20 pages; needs at least 24' },
    ]);
    expect(s).toMatchObject({ live: 1, toUpload: 1, toBuild: 1 });
    expect(s.blockers).toEqual([
      { note: 'Choose the recording', names: ['ACX', 'Spotify'], firstId: 'audio:acx' },
      { note: '20 pages; needs at least 24', names: ['KDP Paperback'], firstId: 'print:kdp' },
    ]);
  });
});
