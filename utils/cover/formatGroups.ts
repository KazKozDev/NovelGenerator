import type { CoverFormat } from './formats';

/** Where a cover goes: ebook stores, audio (audiobook, podcast), the printed book, video, social media. */
export type FormatGroup = 'stores' | 'audio' | 'print' | 'video' | 'social';

export const FORMAT_GROUPS: { id: FormatGroup; name: string }[] = [
  { id: 'stores', name: 'Stores' },
  { id: 'audio', name: 'Audio' },
  { id: 'print', name: 'Print' },
  { id: 'video', name: 'Video' },
  { id: 'social', name: 'Social' },
];

export function formatGroup(format: CoverFormat): FormatGroup {
  if (format.id === 'audio' || format.id === 'podcast') return 'audio';
  if (format.category === 'books') return 'stores';
  if (format.category === 'video') return 'video';
  if (format.category === 'social') return 'social';
  return 'print';
}

/**
 * The formats of one group. A book is printed at one trim size, chosen on the Publish stage: Print shows the covers
 * for that trim, and the others only when asked for.
 */
export function formatsInGroup(formats: CoverFormat[], group: FormatGroup | 'all', trimId: string, otherTrims = false): CoverFormat[] {
  if (group === 'all') return formats;
  return formats.filter(f => formatGroup(f) === group && (group !== 'print' || otherTrims || f.trim === trimId));
}
