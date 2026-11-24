/**
 * What each ebook store asks of the files it is given, and the checks a book passes before they are made.
 * Sources (checked 2026-10): KDP Help (EPUB per Kindle Publishing Guidelines, cover 2560×1600, JPEG/TIFF RGB < 50 MB),
 * Apple Books publisher guide (latest EPUBCheck, images inside the EPUB ≤ 4 000 000 px, cover art ≥ 1400 px on its
 * shorter side), Google Play Books file guidelines (EPUB with the front cover inside, EpubCheck, cover 640–7200 px).
 */

export type EbookStoreId = 'kindle' | 'apple' | 'google';

export interface EbookStore {
  id: EbookStoreId;
  name: string;
  /** Where the files are uploaded. */
  where: string;
  /** Most pixels an image inside the EPUB may have; the cover is scaled down to fit. */
  maxImagePixels?: number;
  /** The cover the store takes as its own upload, beside the EPUB. */
  uploadCover: { width: number; height: number };
  /** The smallest shorter side of a cover the store accepts. */
  minCoverSide: number;
  /** The store refuses an EPUB without a cover inside it. */
  coverInsideRequired: boolean;
  /** What to do with the files, in the order the store's upload form asks for them. */
  steps: string[];
}

export const EBOOK_STORES: EbookStore[] = [
  {
    id: 'kindle',
    name: 'Amazon Kindle',
    where: 'kdp.amazon.com',
    uploadCover: { width: 1600, height: 2560 },
    minCoverSide: 625,
    coverInsideRequired: false,
    steps: [
      'Kindle eBook Content: upload the EPUB as the manuscript.',
      'Kindle eBook Cover: upload the JPEG cover.',
      'Preview it in Kindle Previewer before publishing.',
    ],
  },
  {
    id: 'apple',
    name: 'Apple Books',
    where: 'Apple Books for Authors / iTunes Connect',
    maxImagePixels: 4_000_000,
    uploadCover: { width: 1600, height: 2560 },
    minCoverSide: 1400,
    coverInsideRequired: true,
    steps: ['Upload the EPUB as the book file.', 'Upload the JPEG as the cover art.'],
  },
  {
    id: 'google',
    name: 'Google Play Books',
    where: 'play.google.com/books/publish',
    uploadCover: { width: 1600, height: 2560 },
    minCoverSide: 640,
    coverInsideRequired: true,
    steps: ['Content: upload the EPUB.', 'Cover: upload the JPEG; it becomes the store thumbnail.'],
  },
];

/** The cover inside the EPUB: the store's limit on pixels, keeping the 1.6 proportion of an ebook cover. */
export function epubCoverSize(store: EbookStore, base = { width: 1600, height: 2560 }): { width: number; height: number } {
  const pixels = base.width * base.height;
  if (!store.maxImagePixels || pixels <= store.maxImagePixels) return base;
  const scale = Math.sqrt(store.maxImagePixels / pixels);
  // Rounded down to even numbers, so the result is under the limit and not just at it.
  const even = (n: number) => Math.floor(n * scale / 2) * 2;
  return { width: even(base.width), height: even(base.height) };
}

/** A valid ISBN-13 (hyphens and spaces allowed) in its bare digits, or null. */
export function normalizeIsbn13(raw: string | undefined): string | null {
  const digits = (raw || '').replace(/[\s-]/g, '');
  if (!/^97[89]\d{10}$/.test(digits)) return null;
  const sum = [...digits.slice(0, 12)].reduce((total, d, i) => total + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[12]) ? digits : null;
}

/** The same urn:uuid for the same book on every build, so a store sees an update and not a new book. */
export function stableBookId(title: string, author: string): string {
  // Two FNV-1a passes give 64 bits each; laid out as a version-5-shaped UUID.
  const fnv = (text: string, seed: number) => {
    let h1 = 0x811c9dc5 ^ seed, h2 = 0x01000193 + seed;
    for (const ch of text) {
      h1 = Math.imul(h1 ^ ch.codePointAt(0)!, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ ch.codePointAt(0)!, 0x5bd1e995) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  };
  const key = `${title.trim().toLowerCase()}\u0000${author.trim().toLowerCase()}`;
  const hex = fnv(key, 1) + fnv(key, 2);
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${'89ab'[parseInt(hex[16], 16) % 4]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The language a manuscript is written in, as far as its letters tell: Cyrillic is Russian, otherwise English. */
export function guessLanguage(text: string): string {
  const sample = text.slice(0, 20000);
  const cyrillic = (sample.match(/[Ѐ-ӿ]/g) || []).length;
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  return cyrillic > latin ? 'ru' : 'en';
}

export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Russian' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'uk', name: 'Ukrainian' },
];

export type CheckLevel = 'ok' | 'warn' | 'fail';
export interface EditionCheck { level: CheckLevel; text: string }

export interface EditionFacts {
  title: string;
  author: string;
  language: string;
  hasText: boolean;
  /** The book cover's size in pixels, when there is one. */
  cover?: { width: number; height: number };
  isbnEbook?: string;
}

/** What stands between the book and the store's upload form; a "fail" stops the files from being made. */
export function editionChecks(store: EbookStore, facts: EditionFacts): EditionCheck[] {
  const checks: EditionCheck[] = [];
  checks.push(facts.hasText ? { level: 'ok', text: 'Manuscript has chapters' } : { level: 'fail', text: 'No chapter is written yet' });
  checks.push(facts.title.trim() ? { level: 'ok', text: `Title: ${facts.title.trim()}` } : { level: 'fail', text: 'The book has no title' });
  checks.push(facts.author.trim() ? { level: 'ok', text: `Author: ${facts.author.trim()}` } : { level: 'fail', text: 'Author name is missing' });
  checks.push({ level: 'ok', text: `Language: ${LANGUAGES.find(l => l.code === facts.language)?.name || facts.language}` });

  if (!facts.cover) {
    checks.push({ level: 'fail', text: `${store.name} needs a cover; make one on the Cover stage` });
  } else {
    const { width, height } = facts.cover;
    const shorter = Math.min(width, height);
    const ratio = height / width;
    const fix = 'Cover stage → "Use eBook cover for book" gives a 1600×2560 one';
    if (shorter < store.minCoverSide) checks.push({ level: 'fail', text: `Cover is ${width}×${height}; ${store.name} needs at least ${store.minCoverSide} px on the shorter side. ${fix}` });
    else if (width < store.uploadCover.width) checks.push({ level: 'warn', text: `Cover is ${width}×${height}; it will be scaled up to ${store.uploadCover.width}×${store.uploadCover.height} and look softer. ${fix}` });
    else checks.push({ level: 'ok', text: `Cover ${width}×${height}` });
    if (Math.abs(ratio - 1.6) > 0.05) checks.push({ level: 'warn', text: `Cover is not 1:1.6; its edges will be cropped to fit` });
    if (store.maxImagePixels) {
      const inside = epubCoverSize(store);
      checks.push({ level: 'ok', text: `Cover inside the EPUB scaled to ${inside.width}×${inside.height} (under ${(store.maxImagePixels / 1e6).toFixed(0)} MP)` });
    }
  }

  if (facts.isbnEbook?.trim()) {
    checks.push(normalizeIsbn13(facts.isbnEbook)
      ? { level: 'ok', text: `eBook ISBN ${facts.isbnEbook.trim()}` }
      : { level: 'fail', text: `eBook ISBN ${facts.isbnEbook.trim()} is not a valid ISBN-13` });
  } else if (store.id === 'kindle') {
    checks.push({ level: 'ok', text: 'No ISBN: Amazon assigns its own ASIN' });
  } else {
    checks.push({ level: 'warn', text: `No eBook ISBN: ${store.name} can publish without one, but other stores will not know it is the same book` });
  }
  return checks;
}

/** The file names a store's edition is saved under: "<store> — <what>.<ext>". */
export function editionFileLabel(store: EbookStore, what: 'книга' | 'обложка'): string {
  return `${store.name} — ${what}`;
}
