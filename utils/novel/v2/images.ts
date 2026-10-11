import { contentWords, splitSentences } from '../analytics';
import { matchKey } from './normalize';
import { bandsFor } from './profile';
import type { ProjectStore } from './store';
import type { BookProfile, WornImage } from './types';

/**
 * Worn images: the repetition a phrase count cannot see.
 *
 * The phrase ledger counts word runs, and a writer who returns to one picture
 * never uses the same run twice. A measured book carried one image in nine
 * sentences, no two of them sharing three words, and the only thing that
 * noticed was the final audit, when nothing could be done about it.
 *
 * Meaning and counting are split the way they are everywhere else here. Which
 * recurring picture is an image, rather than an object the story is about, is
 * a reading, so the editor names it at the chapter check and gives the plain
 * words that mark it. Whether it is overused is arithmetic: the sentences that
 * carry at least two of those words, counted over the whole accepted text.
 *
 * And the count is acted on rather than reported. The image goes on the
 * writer's ban list with its number, a new scene is searched for it before the
 * scene is tracked, and the sentences that carry it are rewritten without it —
 * by the same call, and the same splice-or-nothing rule, that rewrites a
 * duplicated sentence (repair.ts), followed by the same count, so what is
 * claimed fixed is what was measured fixed.
 */

/** Plural and a trailing e folded, so a noun and its plural meet. Crude on purpose, and only ever compared with itself. */
function fold(word: string): string {
  const singular = word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
  return singular.length > 3 && singular.endsWith('e') ? singular.slice(0, -1) : singular;
}

function anchorKeys(image: WornImage): string[] {
  return [...new Set((image.anchors || []).flatMap(anchor => contentWords(String(anchor))).map(fold))];
}

/** Images as code will count them: a label and at least two distinct marking words. */
export function readWornImages(raw: unknown, limit = 3): WornImage[] {
  const images: WornImage[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const image = typeof item.image === 'string' ? item.image.trim() : '';
    const anchors = [...new Set((Array.isArray(item.anchors) ? item.anchors : [])
      .filter((anchor): anchor is string => typeof anchor === 'string')
      .flatMap(anchor => contentWords(anchor)))];
    // One word marks a subject, not an image: a single noun is every sentence
    // of a book set where that noun is.
    if (image && new Set(anchors.map(fold)).size >= 2 && images.length < limit) images.push({ image, anchors });
  }
  return images;
}

/** The sentences of a text that carry the image: at least two of its marking words together. */
export function imageSentences(prose: string, image: WornImage): string[] {
  const keys = anchorKeys(image);
  if (keys.length < 2) return [];
  return splitSentences(prose).filter(sentence => {
    const words = new Set(contentWords(sentence).map(fold));
    return keys.filter(key => words.has(key)).length >= 2;
  });
}

/** Every image a chapter check has named so far, one entry per set of marking words. */
export function knownImages(store: ProjectStore, throughChapter: number): WornImage[] {
  const seen = new Map<string, WornImage>();
  for (let chapter = 1; chapter <= throughChapter; chapter++) {
    for (const image of store.loadChapterPlan(chapter)?.worn_images || []) {
      const key = anchorKeys(image).sort().join('+');
      if (key && !seen.has(key)) seen.set(key, image);
    }
  }
  return [...seen.values()];
}

/** How many times the book may use an image: its declared refrain budget when it is one, the phrase tolerance otherwise. */
export function imageAllowance(image: WornImage, profile: BookProfile): number {
  const keys = anchorKeys(image);
  const motif = profile.declared_motifs.find(entry => {
    const words = new Set(contentWords(matchKey(entry.motif)).map(fold));
    return keys.filter(key => words.has(key)).length >= 2;
  });
  return motif ? motif.allowed_uses : bandsFor(profile).phraseTolerance;
}

export interface ImageUse {
  image: WornImage;
  uses: number;
  allowance: number;
}

/** Each known image with how often the given text uses it. */
export function countImages(images: WornImage[], prose: string, profile: BookProfile): ImageUse[] {
  return images.map(image => ({ image, uses: imageSentences(prose, image).length, allowance: imageAllowance(image, profile) }));
}

/** The text the book has accepted up to and including the chapter being written. */
export function proseThrough(store: ProjectStore, chapter: number): string {
  const finished = store.manuscript().filter(item => item.chapter < chapter)
    .sort((first, second) => first.chapter - second.chapter).map(item => item.text);
  return [...finished, ...store.chapterScenes(chapter).map(record => record.prose)].filter(Boolean).join('\n\n');
}
