import { loadStudio } from '../cover/coverStore';
import { loadStudioFromFolder, newerStudio } from '../cover/coverFolder';
import { COVER_FORMATS, DEFAULT_STYLE, renderCover, type CoverStyle, type CoverText } from '../cover/formats';
import { fingerprint } from './publishStatus';

type Picture = CanvasImageSource & { width: number; height: number };

export interface CoverArt {
  /** The picture lettering is drawn over: the studio's master, or the finished book cover. */
  master: Picture;
  /** A cover already lettered, used as it is instead of lettering the master again. */
  frontArt: Picture | null;
  text: CoverText;
  style: CoverStyle;
  focus: { x: number; y: number };
  /** Where it came from, for the author to see. */
  source: 'studio' | 'book cover';
  /** Which cover this is, stable across loads: a redraw gives different bytes, a different design a different revision. */
  revision: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The cover image could not be read'));
    img.src = src;
  });
}

/**
 * What an edition's cover is drawn from: the Cover studio's chosen master with its lettering, at whatever size the
 * edition needs; without a studio, the finished book cover as it is.
 */
export async function loadCoverArt(studioKey: string, title: string, author: string, coverImage?: string | null): Promise<CoverArt | null> {
  const studio = newerStudio(await loadStudio(studioKey), await loadStudioFromFolder(title));
  const master = studio?.masters.find(m => m.id === studio.selected) || studio?.masters[0];
  if (studio && master) {
    const text = { ...studio.text, author: studio.text.author || author };
    return { master: await createImageBitmap(master.blob), frontArt: null, text, style: studio.style, focus: studio.focus, source: 'studio', revision: fingerprint('studio', master.id, text, studio.style, studio.focus) };
  }
  if (coverImage) {
    const image = await loadImage(coverImage);
    return { master: image, frontArt: image, text: { title, author, tagline: '' }, style: DEFAULT_STYLE, focus: { x: 0.5, y: 0.5 }, source: 'book cover', revision: fingerprint('book cover', coverImage) };
  }
  return null;
}

/** The ebook cover, 1600 × 2560: lettered from the studio's master, or the book cover as it is. */
export async function ebookCover(art: CoverArt): Promise<{ dataUrl: string; width: number; height: number; revision: string }> {
  if (art.frontArt) {
    const canvas = document.createElement('canvas');
    canvas.width = art.frontArt.width;
    canvas.height = art.frontArt.height;
    canvas.getContext('2d')!.drawImage(art.frontArt, 0, 0);
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, revision: art.revision };
  }
  const format = COVER_FORMATS.find(f => f.id === 'ebook')!;
  const canvas = renderCover(art.master, format, art.text, art.style, art.focus);
  return { dataUrl: canvas.toDataURL('image/png'), width: format.width, height: format.height, revision: art.revision };
}
