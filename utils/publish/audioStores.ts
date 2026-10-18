/**
 * Where an audiobook goes and what each place asks of the files. The audio is cut from the author's one finished
 * recording at the chapter timecodes (Audio stage, Timecodes tab), levelled and encoded by ffmpeg on the dev server
 * (services/audiobookDevPlugin.ts), then measured; the measurements are checked here against the store's limits.
 */
import type { ChapterTimecode } from '../audiobook/chapterTimecodes';

export type AudioStoreId = 'acx' | 'spotify' | 'google' | 'youtube';

/** What a file must measure, in dB (RMS and peak per file, noise floor as the quietest stretch). */
export interface LoudnessSpec {
  rmsMin?: number;
  rmsMax?: number;
  peakMax: number;
  noiseMax?: number;
  /** The level files are raised to: RMS dB for chapter files (what the store measures), LUFS for the video. */
  target: number;
  truePeak: number;
}

export interface AudioStore {
  id: AudioStoreId;
  name: string;
  where: string;
  /** One file per chapter (with credits files where asked for), or the whole book as one video. */
  layout: 'chapters' | 'video';
  container: 'mp3' | 'mp4';
  bitrateKbps: number;
  sampleRate: number;
  loudness: LoudnessSpec;
  /** Seconds of quiet before and after each file's speech. */
  head?: [number, number];
  tail?: [number, number];
  maxFileMinutes?: number;
  /** Opening and closing credits as their own files. */
  credits: boolean;
  /** Retail sample length in seconds, when the store asks the author for one. */
  sample?: [number, number];
  cover: { width: number; height: number; formatId: 'audio' | 'yt_frame' };
  requirements: string[];
  steps: string[];
}

const ACX_LOUDNESS: LoudnessSpec = { rmsMin: -23, rmsMax: -18, peakMax: -3, noiseMax: -60, target: -20, truePeak: -3.5 };

export const AUDIO_STORES: AudioStore[] = [
  {
    id: 'acx',
    name: 'ACX · Audible',
    where: 'Audible, Amazon and Apple Books through acx.com',
    layout: 'chapters',
    container: 'mp3',
    bitrateKbps: 192,
    sampleRate: 44100,
    loudness: ACX_LOUDNESS,
    head: [0.5, 1],
    tail: [1, 5],
    maxFileMinutes: 120,
    credits: true,
    sample: [60, 300],
    cover: { width: 3000, height: 3000, formatId: 'audio' },
    requirements: [
      'One MP3 per chapter, 192 kbps CBR, 44.1 kHz, all mono',
      'RMS −23…−18 dB, peaks ≤ −3 dB, noise floor ≤ −60 dB',
      '0.5–1 s of quiet at the head, 1–5 s at the tail, ≤ 120 min a file',
      'Opening and closing credits as their own files',
      'Retail sample 1–5 min · square cover ≥ 2400 px',
    ],
    steps: [
      'acx.com → Add your title → "I have this book in audio"',
      'Upload each file in order, credits first and last',
      'Upload the retail sample and the square cover',
      'Submit for review; ACX listens before it goes on sale',
    ],
  },
  {
    id: 'spotify',
    name: 'Spotify · Findaway',
    where: 'Spotify, Kobo, Apple, Google and 40+ stores through Spotify for Authors',
    layout: 'chapters',
    container: 'mp3',
    bitrateKbps: 192,
    sampleRate: 44100,
    loudness: ACX_LOUDNESS,
    head: [0.5, 1],
    tail: [1, 5],
    maxFileMinutes: 120,
    credits: true,
    cover: { width: 3000, height: 3000, formatId: 'audio' },
    requirements: [
      'One MP3 per chapter, 192 kbps CBR, 44.1 kHz',
      'RMS −23…−18 dB, peaks ≤ −3 dB, noise floor ≤ −60 dB',
      '0.5–1 s of quiet at the head, 1–5 s at the tail',
      'Opening and closing credits · square cover ≥ 2400 px',
    ],
    steps: [
      'authors.spotify.com → Audiobooks → Add audiobook',
      'Upload the chapter files in order and name each track',
      'Upload the square cover, set price and stores, submit',
    ],
  },
  {
    id: 'google',
    name: 'Google Play Books',
    where: 'Google Play audiobooks through the Partner Center',
    layout: 'chapters',
    container: 'mp3',
    bitrateKbps: 192,
    sampleRate: 44100,
    // Google takes the files as they are; the ACX level keeps the book even with other stores' copies.
    loudness: { ...ACX_LOUDNESS, noiseMax: undefined },
    head: [0.5, 2],
    tail: [1, 5],
    credits: false,
    cover: { width: 3000, height: 3000, formatId: 'audio' },
    requirements: [
      'MP3 per chapter (or one file with the chapter list)',
      'Peaks ≤ −3 dB keep it even with the other stores',
      'Square cover, at least 2400 px',
    ],
    steps: [
      'play.google.com/books/publish → Add book → Audiobook',
      'Content → upload the chapter files; the table of contents takes their names',
      'Add the square cover, set price, publish',
    ],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    where: 'The whole book as one video with the cover and chapter marks',
    layout: 'video',
    container: 'mp4',
    bitrateKbps: 192,
    sampleRate: 48000,
    loudness: { peakMax: -1, target: -14, truePeak: -1.5 },
    credits: false,
    cover: { width: 1920, height: 1080, formatId: 'yt_frame' },
    requirements: [
      'One MP4: H.264 still frame 1920×1080, AAC 192 kbps, 48 kHz',
      'Levelled to −14 LUFS, the level YouTube plays at; peaks ≤ −1 dB',
      'Chapter list in the description: from 00:00, ≥ 3 chapters, each ≥ 10 s',
    ],
    steps: [
      'studio.youtube.com → Create → Upload video',
      'Paste the saved description: its timecodes become the chapters',
      'Use the YouTube thumbnail from the Cover stage',
    ],
  },
];

export type AudioCheckLevel = 'ok' | 'warn' | 'fail';
export interface AudioCheck { level: AudioCheckLevel; text: string }

/** A cut file's place in the book: a chapter, the credits, or the retail sample. */
export interface AudioPart { kind: 'opening' | 'chapter' | 'closing' | 'sample' | 'video'; label: string; start: number; end: number }

/** What ffmpeg measured in a built file. */
export interface AudioMeasure {
  name: string;
  duration: number;
  rms: number;
  peak: number;
  /** The quietest 50 ms window, as RMS dB: the room's noise floor. */
  noise: number;
  head: number;
  tail: number;
  sampleRate: number;
  bitrateKbps: number;
  channels: number;
}

/**
 * The files a store gets from one recording: opening credits are whatever precedes chapter 1, each chapter runs to
 * the next one's start, closing credits are left to the author when the store asks for them. A cut starts a little
 * before the first word, so the narrator's own pause becomes the file's head.
 */
export function audioParts(store: AudioStore, timecodes: ChapterTimecode[], duration: number, lead = 0.75): AudioPart[] {
  if (store.layout === 'video') return [{ kind: 'video', label: 'YouTube video', start: 0, end: duration }];
  const found = timecodes.filter((t): t is ChapterTimecode & { start: number } => t.start !== null).sort((a, b) => a.start - b.start);
  if (!found.length) return [];
  const cut = (t: number) => Math.max(0, t - lead);
  const parts: AudioPart[] = [];
  if (store.credits && cut(found[0].start) >= 3) parts.push({ kind: 'opening', label: 'Opening Credits', start: 0, end: cut(found[0].start) });
  const firstFrom = parts.length ? cut(found[0].start) : 0;
  found.forEach((t, i) => parts.push({ kind: 'chapter', label: t.label, start: i === 0 ? firstFrom : cut(t.start), end: i + 1 < found.length ? cut(found[i + 1].start) : duration }));
  if (store.sample) {
    const first = parts.find(p => p.kind === 'chapter')!;
    const length = Math.min(store.sample[1] - 30, Math.max(store.sample[0] + 30, (first.end - first.start) / 2));
    parts.push({ kind: 'sample', label: 'Retail Sample', start: first.start, end: Math.min(first.end, first.start + length) });
  }
  return parts;
}

/** Before building: does the book have what the store needs? */
export function audioReadiness(store: AudioStore, facts: { title: string; author: string; timecodes: ChapterTimecode[]; chapters: number; hasCover: boolean; hasMaster: boolean }): AudioCheck[] {
  const found = facts.timecodes.filter(t => t.start !== null);
  const checks: AudioCheck[] = [];
  checks.push(facts.hasMaster ? { level: 'ok', text: 'Recording chosen' } : { level: 'fail', text: 'Choose the recording of the whole book' });
  if (!facts.timecodes.length) checks.push({ level: 'fail', text: 'Find the chapter timecodes first (Audio → Timecodes)' });
  else if (found.length < facts.chapters) checks.push({ level: store.layout === 'video' ? 'warn' : 'fail', text: `${facts.chapters - found.length} of ${facts.chapters} chapters not found in the recording` });
  else checks.push({ level: 'ok', text: `All ${facts.chapters} chapters have timecodes` });
  if (store.layout === 'video' && found.length > 0 && found.length < 3) checks.push({ level: 'warn', text: 'YouTube shows chapters only with three or more' });
  checks.push(facts.author.trim() ? { level: 'ok', text: `Author: ${facts.author}` } : { level: 'fail', text: 'Add the author name in Edition above' });
  checks.push(facts.hasCover ? { level: 'ok', text: `Cover ${store.cover.width}×${store.cover.height} from the Cover stage` } : { level: 'fail', text: 'Make a cover in the Cover stage first' });
  if (store.credits) {
    const first = Math.min(...found.map(t => t.start as number));
    checks.push(found.length && first - 0.75 >= 3
      ? { level: 'ok', text: `Opening credits: the ${Math.round(first)} s before chapter 1` }
      : { level: 'warn', text: 'Opening credits (title, author, narrator) need recording: the recording starts with chapter 1' });
    checks.push({ level: 'warn', text: 'Closing credits ("The end. … narrated by …") need recording' });
  }
  return checks;
}

const dB = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)} dB` : '−∞ dB');

/** After building: each measured file against the store's limits. */
export function measureChecks(store: AudioStore, part: AudioPart, m: AudioMeasure): AudioCheck[] {
  const l = store.loudness, checks: AudioCheck[] = [];
  const within = (ok: boolean, text: string, warn = false): AudioCheck => ({ level: ok ? 'ok' : warn ? 'warn' : 'fail', text });
  if (l.rmsMin !== undefined && l.rmsMax !== undefined) checks.push(within(m.rms >= l.rmsMin && m.rms <= l.rmsMax, `RMS ${dB(m.rms)} (${l.rmsMin}…${l.rmsMax})`));
  checks.push(within(m.peak <= l.peakMax, `Peak ${dB(m.peak)} (≤ ${l.peakMax})`));
  if (l.noiseMax !== undefined) checks.push(within(m.noise <= l.noiseMax, `Noise floor ${dB(m.noise)} (≤ ${l.noiseMax})`));
  if (store.head && part.kind !== 'sample') checks.push(within(m.head >= store.head[0] && m.head <= store.head[1], `Head ${m.head.toFixed(1)} s (${store.head[0]}–${store.head[1]})`));
  if (store.tail && part.kind !== 'sample') checks.push(within(m.tail >= store.tail[0] && m.tail <= store.tail[1], `Tail ${m.tail.toFixed(1)} s (${store.tail[0]}–${store.tail[1]})`));
  if (store.maxFileMinutes) checks.push(within(m.duration <= store.maxFileMinutes * 60, `Length ${Math.round(m.duration / 60)} min (≤ ${store.maxFileMinutes})`));
  if (store.sample && part.kind === 'sample') checks.push(within(m.duration >= store.sample[0] && m.duration <= store.sample[1], `Sample ${Math.round(m.duration)} s (${store.sample[0]}–${store.sample[1]})`));
  checks.push(within(m.sampleRate === store.sampleRate, `${(m.sampleRate / 1000).toFixed(1)} kHz`));
  checks.push(within(Math.abs(m.bitrateKbps - store.bitrateKbps) <= 8, `${Math.round(m.bitrateKbps)} kbps`));
  return checks;
}

/** "03 Chapter 2 - Duty to Warn": sorts in book order on every system. */
export function partFileName(part: AudioPart, index: number, store: AudioStore): string {
  if (part.kind === 'video') return `YouTube - audiobook.${store.container}`;
  if (part.kind === 'sample') return `Retail Sample.${store.container}`;
  return `${String(index + 1).padStart(2, '0')} ${part.label.replace(/[:/\\]/g, ' -').replace(/\s+/g, ' ')}.${store.container}`;
}
