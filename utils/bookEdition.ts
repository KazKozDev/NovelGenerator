/**
 * The book's publication details in its folder: план/издание.json names the author, the imprint and the cover
 * file in обложки/. On reload they fill in what this browser no longer has.
 */
import type { ImprintData } from '../components/BookCoverUpload';

export const dataUrlExt = (url: string) => url.startsWith('data:image/jpeg') ? 'jpg' : url.startsWith('data:image/webp') ? 'webp' : 'png';

const fileUrl = (title: string, kind: string, name: string) => `/api/book-file?${new URLSearchParams({ title, kind, name })}`;

async function asDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/** What the book folder has that this browser lacks; `has` says what the browser already holds. */
export async function restoreEdition(title: string, has: { author: boolean; imprint: boolean; cover: boolean }): Promise<{ author?: string; imprint?: ImprintData; cover?: string }> {
  const found: { author?: string; imprint?: ImprintData; cover?: string } = {};
  let edition: { author?: string; imprint?: ImprintData | null; cover?: string | null } | null = null;
  try {
    const res = await fetch(fileUrl(title, 'blueprints', 'издание.json'));
    if (res.ok) edition = await res.json();
  } catch { /* No folder copy: the browser's state stands. */ }
  if (!has.author && typeof edition?.author === 'string' && edition.author.trim()) found.author = edition.author.trim();
  if (!has.imprint && edition?.imprint && typeof edition.imprint === 'object') found.imprint = edition.imprint;
  if (!has.cover && edition?.cover !== null) {
    // An earlier издание.json did not name its cover: try the names the cover was saved under.
    const names = typeof edition?.cover === 'string' ? [edition.cover] : ['обложка книги.jpg', 'обложка книги.png', 'обложка книги.webp'];
    for (const name of names) {
      try {
        const res = await fetch(fileUrl(title, 'covers', name));
        if (!res.ok) continue;
        const blob = await res.blob();
        if (blob.type.startsWith('image/')) { found.cover = await asDataUrl(blob); break; }
      } catch { /* Try the next name. */ }
    }
  }
  return found;
}
