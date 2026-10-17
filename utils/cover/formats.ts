/**
 * Cover formats cut from one master picture: where each crop falls (around the focus the author
 * set) and where the title and author's name go. Lettering is drawn by code, never by the model.
 * Sizes and covered zones follow COVER_SPECIFICATIONS.md.
 */

export interface Rect { x: number; y: number; w: number; h: number }

export interface CoverFormat {
  id: 'ebook' | 'audio' | 'post';
  label: string;
  width: number;
  height: number;
  file: string;
  mime: 'image/jpeg';
  /** Parts of the picture a platform covers (fractions of the frame): kept clear of lettering, shown in the preview. */
  covered: { rect: Rect; why: string }[];
}

export const COVER_FORMATS: CoverFormat[] = [
  { id: 'ebook', label: 'eBook · Amazon KDP, Apple, Kobo', width: 1600, height: 2560, file: 'cover-ebook-1600x2560.jpg', mime: 'image/jpeg', covered: [] },
  {
    id: 'audio', label: 'Audiobook · ACX / Audible, Google Play', width: 3000, height: 3000, file: 'cover-audiobook-3000x3000.jpg', mime: 'image/jpeg',
    covered: [{ rect: { x: 0.72, y: 0.86, w: 0.28, h: 0.14 }, why: 'Audible badge' }],
  },
  {
    id: 'post', label: 'Post 4:5 · Instagram, Facebook', width: 1080, height: 1350, file: 'cover-post-1080x1350.jpg', mime: 'image/jpeg',
    covered: [{ rect: { x: 0, y: 0, w: 0.031, h: 1 }, why: 'profile grid crops to 3:4' }, { rect: { x: 0.969, y: 0, w: 0.031, h: 1 }, why: 'profile grid crops to 3:4' }],
  },
];

/** The largest part of the master with the format's proportions, centred on the focus as far as the edges allow. */
export function cropRect(masterWidth: number, masterHeight: number, width: number, height: number, focus = { x: 0.5, y: 0.5 }): Rect {
  const ratio = width / height;
  let w = masterWidth;
  let h = w / ratio;
  if (h > masterHeight) { h = masterHeight; w = h * ratio; }
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);
  const x = clamp(focus.x * masterWidth - w / 2, masterWidth - w);
  const y = clamp(focus.y * masterHeight - h / 2, masterHeight - h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Words into lines no wider than the limit, by the measure given (a canvas, or a stand-in in tests). */
export function wrapLines(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The largest size, from start down to min, at which the text fits the width in at most maxLines lines. */
export function fitText(text: string, maxWidth: number, maxLines: number, start: number, min: number, measureAt: (size: number, text: string) => number): { size: number; lines: string[] } {
  for (let size = start; size >= min; size = Math.floor(size * 0.94)) {
    const lines = wrapLines(text, maxWidth, line => measureAt(size, line));
    if (lines.length <= maxLines && lines.every(line => measureAt(size, line) <= maxWidth)) return { size, lines };
  }
  return { size: min, lines: wrapLines(text, maxWidth, line => measureAt(min, line)) };
}

export interface CoverText { title: string; author: string; tagline: string }
export interface CoverStyle { font: 'serif' | 'sans'; uppercase: boolean; color: string; shade: number }

export const DEFAULT_STYLE: CoverStyle = { font: 'serif', uppercase: true, color: '#ffffff', shade: 0.55 };

const FONT_FAMILY: Record<CoverStyle['font'], string> = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: '"Helvetica Neue", Arial, sans-serif',
};

/** Where the lettering goes in a frame: the title in the top quarter, the author's name above the covered bottom. */
export function textLayout(format: CoverFormat) {
  const margin = 0.07;
  const bottomCovered = Math.max(0, ...format.covered.filter(c => c.rect.y + c.rect.h >= 0.99 && c.rect.w < 0.5).map(c => c.rect.h));
  return {
    maxWidth: 1 - margin * 2,
    titleTop: format.id === 'ebook' ? 0.07 : 0.06,
    titleMaxLines: 3,
    titleStart: format.id === 'post' ? 0.11 : 0.1,
    authorBottom: Math.max(0.06, bottomCovered + 0.02),
    authorSize: 0.045,
    taglineSize: 0.03,
  };
}

/** Draws one format from the master: the crop, a soft shade behind the lettering, the title, tagline and author. */
export function renderCover(master: CanvasImageSource & { width: number; height: number }, format: CoverFormat, text: CoverText, style: CoverStyle, focus: { x: number; y: number }, canvas = document.createElement('canvas')): HTMLCanvasElement {
  const { width: W, height: H } = format;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const crop = cropRect(master.width, master.height, W, H, focus);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(master, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);

  const layout = textLayout(format);
  const shade = (from: number, to: number) => {
    const gradient = ctx.createLinearGradient(0, from * H, 0, to * H);
    // Dark at the frame's edge (from), clear towards its middle (to).
    gradient.addColorStop(0, `rgba(0,0,0,${style.shade})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, Math.min(from, to) * H, W, Math.abs(to - from) * H);
  };
  if (style.shade > 0) { shade(0, 0.38); shade(1, 0.8); }

  const family = FONT_FAMILY[style.font];
  const measureAt = (size: number, line: string) => { ctx.font = `700 ${size}px ${family}`; return ctx.measureText(line).width; };
  const maxWidth = layout.maxWidth * W;
  ctx.fillStyle = style.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = Math.round(H * 0.008);

  let y = layout.titleTop * H;
  const title = style.uppercase ? text.title.toUpperCase() : text.title;
  if (title.trim()) {
    const fit = fitText(title, maxWidth, layout.titleMaxLines, Math.round(layout.titleStart * H), Math.round(0.035 * H), measureAt);
    ctx.font = `700 ${fit.size}px ${family}`;
    for (const line of fit.lines) { ctx.fillText(line, W / 2, y); y += fit.size * 1.08; }
  }
  if (text.tagline.trim()) {
    const size = Math.round(layout.taglineSize * H);
    ctx.font = `italic 400 ${size}px ${family}`;
    for (const line of wrapLines(text.tagline, maxWidth, l => ctx.measureText(l).width).slice(0, 2)) { y += size * 0.4; ctx.fillText(line, W / 2, y); y += size * 1.1; }
  }
  if (text.author.trim()) {
    const author = style.uppercase ? text.author.toUpperCase() : text.author;
    const fit = fitText(author, maxWidth * (format.covered.length ? 0.7 : 1), 1, Math.round(layout.authorSize * H), Math.round(0.025 * H), (size, line) => { ctx.font = `600 ${size}px ${family}`; return ctx.measureText(line).width; });
    ctx.font = `600 ${fit.size}px ${family}`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(fit.lines[0] || author, W / 2, H - layout.authorBottom * H);
  }
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, mime = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not export the image.'))), mime, quality));
}
