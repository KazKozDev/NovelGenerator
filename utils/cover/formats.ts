/**
 * Cover formats cut from one master picture: where each crop falls (around the focus the author
 * set) and where the title and author's name go. Lettering is drawn by code, never by the model.
 * Sizes and covered zones follow COVER_SPECIFICATIONS.md.
 */

export interface Rect { x: number; y: number; w: number; h: number }

export type CoverMedium = 'online' | 'offline';
export type CoverCategory = 'books' | 'video' | 'social' | 'print_front' | 'print_wrap';

export interface CoverFormat {
  id: string;
  medium: CoverMedium;
  category: CoverCategory;
  categoryLabel: string;
  label: string;
  ratio: string;
  dpi?: number;
  width: number;
  height: number;
  file: string;
  mime: 'image/jpeg';
  description?: string;
  isWrap?: boolean;
  /** Parts of the picture a platform covers (fractions of the frame): kept clear of lettering, shown in the preview. */
  covered: { rect: Rect; why: string }[];
}

export const COVER_FORMATS: CoverFormat[] = [
  // ==========================================
  // ONLINE (SCREEN)
  // ==========================================

  // 1. Digital Books & Audio
  {
    id: 'ebook',
    medium: 'online',
    category: 'books',
    categoryLabel: 'Digital Books & Audio',
    label: 'eBook · Amazon KDP, Apple Books, Kobo, Google Play',
    ratio: '1:1.6',
    width: 1600,
    height: 2560,
    file: 'cover-ebook-1600x2560.jpg',
    mime: 'image/jpeg',
    description: 'Primary digital cover. Standard 1:1.6 ratio for e-readers and retail stores.',
    covered: [],
  },
  {
    id: 'audio',
    medium: 'online',
    category: 'books',
    categoryLabel: 'Digital Books & Audio',
    label: 'Audiobook · ACX / Audible, Google Play Books',
    ratio: '1:1',
    width: 3000,
    height: 3000,
    file: 'cover-audiobook-3000x3000.jpg',
    mime: 'image/jpeg',
    description: 'Square 1:1 format. Bottom-right corner reserved for the retailer badge.',
    covered: [
      { rect: { x: 0.72, y: 0.86, w: 0.28, h: 0.14 }, why: 'Audible / store badge' },
    ],
  },

  // 2. Video & YouTube
  {
    id: 'yt_thumb',
    medium: 'online',
    category: 'video',
    categoryLabel: 'Video & YouTube',
    label: 'YouTube Thumbnail · 16:9 Video Preview',
    ratio: '16:9',
    width: 1280,
    height: 720,
    file: 'cover-youtube-thumb-1280x720.jpg',
    mime: 'image/jpeg',
    description: 'Standard 16:9 video thumbnail. Bottom-right reserved for duration badge.',
    covered: [
      { rect: { x: 0.80, y: 0.78, w: 0.20, h: 0.22 }, why: 'Video timestamp badge' },
    ],
  },
  {
    id: 'yt_frame',
    medium: 'online',
    category: 'video',
    categoryLabel: 'Video & YouTube',
    label: 'YouTube Frame · Full HD 16:9 Title Card',
    ratio: '16:9',
    width: 1920,
    height: 1080,
    file: 'cover-youtube-frame-1920x1080.jpg',
    mime: 'image/jpeg',
    description: 'Full HD card for book trailers, video backdrops, and title screens.',
    covered: [],
  },

  // 3. Social Media & Marketing
  {
    id: 'post',
    medium: 'online',
    category: 'social',
    categoryLabel: 'Social Media & Promo',
    label: 'Social Post · 4:5 Vertical (Instagram, Facebook)',
    ratio: '4:5',
    width: 1080,
    height: 1350,
    file: 'cover-post-1080x1350.jpg',
    mime: 'image/jpeg',
    description: 'Vertical feed post. In Instagram profile grid, preview crops to 3:4.',
    covered: [
      { rect: { x: 0, y: 0, w: 0.031, h: 1 }, why: 'Profile grid 3:4 crop' },
      { rect: { x: 0.969, y: 0, w: 0.031, h: 1 }, why: 'Profile grid 3:4 crop' },
    ],
  },
  {
    id: 'post_square',
    medium: 'online',
    category: 'social',
    categoryLabel: 'Social Media & Promo',
    label: 'Square Post · 1:1 (Instagram, Facebook, X, Telegram)',
    ratio: '1:1',
    width: 1080,
    height: 1080,
    file: 'cover-post-square-1080x1080.jpg',
    mime: 'image/jpeg',
    description: 'Universal square format for social feeds, avatars, and messengers.',
    covered: [],
  },
  {
    id: 'stories',
    medium: 'online',
    category: 'social',
    categoryLabel: 'Social Media & Promo',
    label: 'Stories, Reels, Shorts, TikTok · 9:16 Vertical',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    file: 'cover-stories-1080x1920.jpg',
    mime: 'image/jpeg',
    description: 'Full-screen vertical story. Top, bottom, and right side reserved for app UI.',
    covered: [
      { rect: { x: 0, y: 0, w: 1, h: 0.13 }, why: 'Top UI safe zone' },
      { rect: { x: 0, y: 0.75, w: 1, h: 0.25 }, why: 'Bottom UI safe zone' },
      { rect: { x: 0.84, y: 0.45, w: 0.16, h: 0.30 }, why: 'Action buttons' },
    ],
  },
  {
    id: 'twitter',
    medium: 'online',
    category: 'social',
    categoryLabel: 'Social Media & Promo',
    label: 'X / Twitter · Feed Post 16:9 Banner',
    ratio: '16:9',
    width: 1600,
    height: 900,
    file: 'cover-twitter-1600x900.jpg',
    mime: 'image/jpeg',
    description: 'Horizontal preview card for posts and timeline links on X / Twitter.',
    covered: [],
  },
  {
    id: 'pinterest',
    medium: 'online',
    category: 'social',
    categoryLabel: 'Social Media & Promo',
    label: 'Pinterest Pin · 2:3 Vertical',
    ratio: '2:3',
    width: 1000,
    height: 1500,
    file: 'cover-pinterest-1000x1500.jpg',
    mime: 'image/jpeg',
    description: 'High-performing 2:3 vertical pin format for Pinterest feeds.',
    covered: [],
  },

  // ==========================================
  // OFFLINE (PRINT, 300 DPI)
  // ==========================================

  // 4. Print Front Covers
  {
    id: 'print_front_6x9',
    medium: 'offline',
    category: 'print_front',
    categoryLabel: 'KDP Paperback Front (300 DPI)',
    label: 'Paperback Front · 6 × 9" (with 0.125" bleed)',
    ratio: '6:9',
    dpi: 300,
    width: 1875,
    height: 2775,
    file: 'cover-print-front-6x9-300dpi.jpg',
    mime: 'image/jpeg',
    description: 'Front cover for 6×9" trade paperback with 0.125" (38 px) bleed on all edges.',
    covered: [
      { rect: { x: 0, y: 0, w: 1, h: 0.0137 }, why: 'Top bleed (38 px)' },
      { rect: { x: 0, y: 0.9863, w: 1, h: 0.0137 }, why: 'Bottom bleed (38 px)' },
      { rect: { x: 0, y: 0, w: 0.0203, h: 1 }, why: 'Left bleed (38 px)' },
      { rect: { x: 0.9797, y: 0, w: 0.0203, h: 1 }, why: 'Right bleed (38 px)' },
    ],
  },
  {
    id: 'print_front_55x85',
    medium: 'offline',
    category: 'print_front',
    categoryLabel: 'KDP Paperback Front (300 DPI)',
    label: 'Paperback Front · 5.5 × 8.5" (with 0.125" bleed)',
    ratio: '5.5:8.5',
    dpi: 300,
    width: 1725,
    height: 2625,
    file: 'cover-print-front-5.5x8.5-300dpi.jpg',
    mime: 'image/jpeg',
    description: 'Front cover for 5.5×8.5" trade paperback with 0.125" bleed.',
    covered: [
      { rect: { x: 0, y: 0, w: 1, h: 0.0145 }, why: 'Top bleed (38 px)' },
      { rect: { x: 0, y: 0.9855, w: 1, h: 0.0145 }, why: 'Bottom bleed (38 px)' },
      { rect: { x: 0, y: 0, w: 0.022, h: 1 }, why: 'Left bleed (38 px)' },
      { rect: { x: 0.978, y: 0, w: 0.022, h: 1 }, why: 'Right bleed (38 px)' },
    ],
  },
  {
    id: 'print_front_5x8',
    medium: 'offline',
    category: 'print_front',
    categoryLabel: 'KDP Paperback Front (300 DPI)',
    label: 'Paperback Front · 5 × 8" (with 0.125" bleed)',
    ratio: '5:8',
    dpi: 300,
    width: 1575,
    height: 2475,
    file: 'cover-print-front-5x8-300dpi.jpg',
    mime: 'image/jpeg',
    description: 'Front cover for 5×8" pocket paperback with 0.125" bleed.',
    covered: [
      { rect: { x: 0, y: 0, w: 1, h: 0.0153 }, why: 'Top bleed (38 px)' },
      { rect: { x: 0, y: 0.9847, w: 1, h: 0.0153 }, why: 'Bottom bleed (38 px)' },
      { rect: { x: 0, y: 0, w: 0.0241, h: 1 }, why: 'Left bleed (38 px)' },
      { rect: { x: 0.9759, y: 0, w: 0.0241, h: 1 }, why: 'Right bleed (38 px)' },
    ],
  },

  // 5. Full Paperback Wrap Spreads
  {
    id: 'print_wrap_6x9',
    medium: 'offline',
    category: 'print_wrap',
    categoryLabel: 'KDP Paperback Full Wrap (300 DPI)',
    label: 'KDP Paperback Wrap · 6 × 9" (300 page spread)',
    ratio: 'Full Wrap',
    dpi: 300,
    width: 3878,
    height: 2775,
    file: 'cover-print-wrap-6x9-300dpi.jpg',
    mime: 'image/jpeg',
    isWrap: true,
    description: 'Full spread for 6×9" paperback: back cover + 0.68" (203 px) spine + front cover + 0.125" bleed.',
    covered: [
      { rect: { x: 0, y: 0, w: 1, h: 0.0137 }, why: 'Top bleed (38 px)' },
      { rect: { x: 0, y: 0.9863, w: 1, h: 0.0137 }, why: 'Bottom bleed (38 px)' },
      { rect: { x: 0, y: 0, w: 0.0098, h: 1 }, why: 'Left bleed (38 px)' },
      { rect: { x: 0.9902, y: 0, w: 0.0098, h: 1 }, why: 'Right bleed (38 px)' },
      { rect: { x: 0.306, y: 0.838, w: 0.155, h: 0.130 }, why: 'ISBN Barcode zone 2"×1.2"' },
      { rect: { x: 0.474, y: 0.0137, w: 0.052, h: 0.9726 }, why: 'Book spine (203 px)' },
    ],
  },
  {
    id: 'print_wrap_55x85',
    medium: 'offline',
    category: 'print_wrap',
    categoryLabel: 'KDP Paperback Full Wrap (300 DPI)',
    label: 'KDP Paperback Wrap · 5.5 × 8.5" (300 page spread)',
    ratio: 'Full Wrap',
    dpi: 300,
    width: 3578,
    height: 2625,
    file: 'cover-print-wrap-5.5x8.5-300dpi.jpg',
    mime: 'image/jpeg',
    isWrap: true,
    description: 'Full spread for 5.5×8.5" paperback: back cover + 203 px spine + front cover + 0.125" bleed.',
    covered: [
      { rect: { x: 0, y: 0, w: 1, h: 0.0145 }, why: 'Top bleed (38 px)' },
      { rect: { x: 0, y: 0.9855, w: 1, h: 0.0145 }, why: 'Bottom bleed (38 px)' },
      { rect: { x: 0, y: 0, w: 0.0106, h: 1 }, why: 'Left bleed (38 px)' },
      { rect: { x: 0.9894, y: 0, w: 0.0106, h: 1 }, why: 'Right bleed (38 px)' },
      { rect: { x: 0.290, y: 0.825, w: 0.168, h: 0.137 }, why: 'ISBN Barcode zone 2"×1.2"' },
      { rect: { x: 0.472, y: 0.0145, w: 0.057, h: 0.971 }, why: 'Book spine (203 px)' },
    ],
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

export interface CoverText {
  title: string;
  author: string;
  tagline: string;
  badge?: string;
}

export interface CoverStyle {
  font: 'serif' | 'sans';
  uppercase: boolean;
  color: string;
  shade: number;
  youtubeLayout?: 'editorial_left' | 'classic';
  badgeColor?: string;
  badgeTextColor?: string;
  depthBehind?: boolean;
  depthThreshold?: number;
}

export const DEFAULT_STYLE: CoverStyle = {
  font: 'serif',
  uppercase: true,
  color: '#fdfbf7',
  shade: 0.55,
  youtubeLayout: 'editorial_left',
  badgeColor: '#e5a93c',
  badgeTextColor: '#18181b',
  depthBehind: false,
  depthThreshold: 150,
};

const FONT_FAMILY: Record<CoverStyle['font'], string> = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: '"Helvetica Neue", Arial, sans-serif',
};

/** Where the lettering goes in a frame: the title in the top quarter, the author's name above the covered bottom. */
export function textLayout(format: CoverFormat) {
  const margin = 0.07;
  // Check if any covered zone is near the bottom (excluding full-height side strips where c.rect.y === 0)
  const bottomCovered = Math.max(0, ...format.covered.filter(c => c.rect.y > 0.5 && c.rect.y + c.rect.h >= 0.95).map(c => c.rect.h));
  // Check if any covered zone is at the top
  const topCovered = Math.max(0, ...format.covered.filter(c => c.rect.y <= 0.05 && c.rect.w >= 0.7).map(c => c.rect.h));

  const isLandscape = format.width > format.height;
  const isTall = format.height / format.width >= 1.7; // 9:16 (Stories)

  const titleTop = topCovered > 0 ? topCovered + 0.03 : (isLandscape ? 0.08 : (format.id === 'ebook' ? 0.07 : 0.06));
  const titleStart = isLandscape ? 0.12 : (format.id === 'post' ? 0.11 : (isTall ? 0.075 : 0.1));
  const authorBottom = Math.max(isLandscape ? 0.08 : 0.06, bottomCovered + (bottomCovered > 0 ? 0.02 : 0));
  const authorSize = isLandscape ? 0.055 : (isTall ? 0.038 : 0.045);
  const taglineSize = isLandscape ? 0.035 : (isTall ? 0.025 : 0.03);

  return {
    maxWidth: 1 - margin * 2,
    titleTop,
    titleMaxLines: isLandscape ? 2 : 3,
    titleStart,
    authorBottom,
    authorSize,
    taglineSize,
  };
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Editorial Left layout designed specifically for YouTube 16:9 covers and thumbnails.
 * Features:
 * - Soft dark horizontal vignette on the left third
 * - Left-aligned bold editorial typography (Prefix + Main Title word-stack)
 * - Contrast amber pill badge (e.g. FULL AUDIOBOOK)
 * - Safe bottom-right area for video duration badges
 */
export function renderYouTubeEditorial(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  text: CoverText,
  style: CoverStyle,
  family: string,
  measureAt: (size: number, text: string) => number,
  cutout?: (CanvasImageSource & { width: number; height: number }) | null,
  crop?: Rect
) {
  // 1. Cinematic Left Vignette (soft horizontal shadow from left to right)
  const shadeAlpha = Math.min(0.96, Math.max(0.65, style.shade * 1.35));
  const leftGrad = ctx.createLinearGradient(0, 0, W * 0.65, 0);
  leftGrad.addColorStop(0, `rgba(0, 0, 0, ${shadeAlpha})`);
  leftGrad.addColorStop(0.32, `rgba(0, 0, 0, ${shadeAlpha * 0.78})`);
  leftGrad.addColorStop(0.62, `rgba(0, 0, 0, ${shadeAlpha * 0.28})`);
  leftGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, W * 0.75, H);

  // Subtle top & bottom edge shading for depth
  const topGrad = ctx.createLinearGradient(0, 0, 0, H * 0.22);
  topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
  topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, H * 0.22);

  const botGrad = ctx.createLinearGradient(0, H, 0, H * 0.78);
  botGrad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
  botGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, H * 0.78, W, H * 0.22);

  // 2. Geometry: Left Margin & Content Width
  const leftX = Math.round(W * 0.08);
  const maxTextW = Math.round(W * 0.44);

  // Parse title into prefix (e.g. "THE", "A", "AN", "О", "В") and main title words
  const rawTitle = text.title.trim();
  const prefixMatch = rawTitle.match(/^(THE|A|AN|О|В|НА|ИЗ)\s+(.+)$/i);
  let prefix = '';
  let mainTitle = rawTitle;
  if (prefixMatch) {
    prefix = prefixMatch[1].toUpperCase();
    mainTitle = prefixMatch[2];
  }

  // Split main title words into stacked dramatic lines (1-3 words per line, max 3 lines)
  const titleWords = mainTitle.trim().split(/\s+/).filter(Boolean);
  let titleLines: string[] = [];
  if (titleWords.length <= 2) {
    titleLines = titleWords;
  } else if (titleWords.length === 3) {
    titleLines = [titleWords[0], `${titleWords[1]} ${titleWords[2]}`];
  } else {
    titleLines = wrapLines(mainTitle, maxTextW, l => measureAt(Math.round(H * 0.12), l)).slice(0, 3);
  }

  // Size calculation
  const targetTitleSize = Math.round(H * (titleLines.length === 1 ? 0.18 : titleLines.length === 2 ? 0.15 : 0.12));
  const fit = fitText(
    titleLines.join(' '),
    maxTextW,
    Math.max(1, titleLines.length),
    targetTitleSize,
    Math.round(H * 0.075),
    measureAt
  );
  const titleSize = fit.size;
  const renderLines = fit.lines.length >= titleLines.length ? fit.lines : titleLines;
  const titleLineH = Math.round(titleSize * 1.05);

  const prefixSize = Math.round(H * 0.045);
  const badgeText = (text.badge !== undefined ? text.badge : 'FULL AUDIOBOOK').trim();
  const badgeH = Math.round(H * 0.068);

  // Total height for vertical centering in left zone (author omitted on YouTube thumbnails)
  const totalH =
    (prefix ? prefixSize * 1.6 : 0) +
    renderLines.length * titleLineH +
    (badgeText ? badgeH + Math.round(H * 0.04) : 0);

  let currentY = Math.max(Math.round(H * 0.12), Math.round((H - totalH) / 2));

  // Render Prefix (e.g. "T  H  E")
  if (prefix) {
    ctx.font = `600 ${prefixSize}px ${family}`;
    ctx.fillStyle = style.color || '#fdfbf7';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = Math.round(H * 0.008);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.round(H * 0.002);

    const spacedPrefix = prefix.split('').join('  ');
    ctx.fillText(spacedPrefix, leftX, currentY);
    currentY += Math.round(prefixSize * 1.6);
  }

  // Render Main Title
  ctx.font = `800 ${titleSize}px ${family}`;
  ctx.fillStyle = style.color || '#fdfbf7';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = Math.round(H * 0.015);
  ctx.shadowOffsetX = Math.round(H * 0.003);
  ctx.shadowOffsetY = Math.round(H * 0.004);

  for (const line of renderLines) {
    ctx.fillText(style.uppercase ? line.toUpperCase() : line, leftX, currentY);
    currentY += titleLineH;
  }

  // 3D Depth Layer: Draw foreground subject cutout over title if depthBehind is active
  if (style.depthBehind && cutout && crop) {
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cutout, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
    ctx.restore();
  }

  // Render Pill Badge (e.g. [ FULL AUDIOBOOK ])
  if (badgeText) {
    currentY += Math.round(H * 0.03);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    const badgeFontSize = Math.round(H * 0.032);
    ctx.font = `800 ${badgeFontSize}px ${family}`;
    const spacedBadge = badgeText.toUpperCase().split(' ').map(w => w.split('').join(' ')).join('   ');
    const badgeTextW = ctx.measureText(spacedBadge).width;

    const padX = Math.round(H * 0.035);
    const pillW = badgeTextW + padX * 2;
    const pillH = badgeH;
    const radius = Math.round(pillH * 0.18);

    // Pill background
    ctx.fillStyle = style.badgeColor || '#e5a93c';
    drawRoundedRect(ctx, leftX, currentY, pillW, pillH, radius);
    ctx.fill();

    // Pill text
    ctx.fillStyle = style.badgeTextColor || '#18181b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spacedBadge, leftX + pillW / 2, currentY + pillH / 2 + 1);
  }
}

/** Draws one format from the master: the crop, a soft shade behind the lettering, the title, tagline and author. */
export function renderCover(
  master: (CanvasImageSource & { width: number; height: number }) | null,
  format: CoverFormat,
  text: CoverText,
  style: CoverStyle,
  focus: { x: number; y: number },
  canvas = document.createElement('canvas'),
  cutout?: (CanvasImageSource & { width: number; height: number }) | null
): HTMLCanvasElement {
  const { width: W, height: H } = format;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const family = FONT_FAMILY[style.font];
  const measureAt = (size: number, line: string) => { ctx.font = `700 ${size}px ${family}`; return ctx.measureText(line).width; };

  if (format.isWrap) {
    const is6x9 = format.id.includes('6x9');
    const trimW = is6x9 ? 1800 : 1650;
    const spineW = 203;
    const bleed = 38;
    const frontX = bleed + trimW + spineW;
    const frontW = trimW + bleed;

    // Dark gray back cover / wrap canvas background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#3f3f46');
    bg.addColorStop(0.5, '#27272a');
    bg.addColorStop(1, '#18181b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Front cover image
    if (master) {
      const frontCrop = cropRect(master.width, master.height, frontW, H, focus);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(master, frontCrop.x, frontCrop.y, frontCrop.w, frontCrop.h, frontX, 0, frontW, H);
    } else {
      const frontBg = ctx.createLinearGradient(frontX, 0, frontX + frontW, H);
      frontBg.addColorStop(0, '#3f3f46');
      frontBg.addColorStop(1, '#27272a');
      ctx.fillStyle = frontBg;
      ctx.fillRect(frontX, 0, frontW, H);
    }

    // Front shade
    if (style.shade > 0) {
      const frontShade = ctx.createLinearGradient(0, 0, 0, 0.4 * H);
      frontShade.addColorStop(0, `rgba(0,0,0,${style.shade})`);
      frontShade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = frontShade;
      ctx.fillRect(frontX, 0, frontW, 0.4 * H);

      const bottomShade = ctx.createLinearGradient(0, H, 0, 0.78 * H);
      bottomShade.addColorStop(0, `rgba(0,0,0,${style.shade})`);
      bottomShade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bottomShade;
      ctx.fillRect(frontX, 0.78 * H, frontW, 0.22 * H);
    }

    // Spine border/fold marks
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 3;
    ctx.strokeRect(bleed + trimW, 0, spineW, H);

    // Spine title (rotated 90 degrees along spine)
    if (text.title.trim()) {
      ctx.save();
      ctx.translate(bleed + trimW + spineW / 2, H / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = style.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const spineFontSize = Math.min(Math.round(spineW * 0.22), 52);
      ctx.font = `600 ${spineFontSize}px ${family}`;
      ctx.fillText(style.uppercase ? text.title.toUpperCase() : text.title, 0, 0);
      ctx.restore();
    }

    // Back cover layout
    const backMargin = bleed + 100;
    const backW = trimW - 200;
    ctx.fillStyle = '#fafafa';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.round(H * 0.024)}px ${family}`;
    ctx.fillText(text.title.toUpperCase(), backMargin, bleed + 140);

    if (text.tagline.trim()) {
      ctx.font = `italic 400 ${Math.round(H * 0.015)}px ${family}`;
      ctx.fillStyle = '#a1a1aa';
      for (const line of wrapLines(text.tagline, backW, l => ctx.measureText(l).width).slice(0, 3)) {
        ctx.fillText(line, backMargin, bleed + 220);
      }
    }

    // ISBN Barcode box (2" x 1.2" = 600 x 360 px at 300 DPI) in bottom-right of back cover
    const isbnW = 600;
    const isbnH = 360;
    const isbnX = bleed + trimW - isbnW - 60;
    const isbnY = H - bleed - isbnH - 60;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(isbnX, isbnY, isbnW, isbnH);
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 3;
    ctx.strokeRect(isbnX, isbnY, isbnW, isbnH);
    ctx.fillStyle = '#18181b';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ISBN BARCODE AREA (2" × 1.2")', isbnX + isbnW / 2, isbnY + isbnH / 2 - 12);
    ctx.font = '16px monospace';
    ctx.fillStyle = '#71717a';
    ctx.fillText('600 × 360 px · 300 DPI', isbnX + isbnW / 2, isbnY + isbnH / 2 + 18);

    // Front cover lettering
    const frontCenterX = frontX + (frontW - bleed) / 2;
    const maxTitleW = (frontW - bleed) * 0.86;
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = Math.round(H * 0.008);

    let y = 0.08 * H;
    const title = style.uppercase ? text.title.toUpperCase() : text.title;
    if (title.trim()) {
      const fit = fitText(title, maxTitleW, 3, Math.round(0.09 * H), Math.round(0.035 * H), measureAt);
      ctx.font = `700 ${fit.size}px ${family}`;
      for (const line of fit.lines) { ctx.fillText(line, frontCenterX, y); y += fit.size * 1.08; }
    }
    if (text.tagline.trim()) {
      const size = Math.round(0.03 * H);
      ctx.font = `italic 400 ${size}px ${family}`;
      for (const line of wrapLines(text.tagline, maxTitleW, l => ctx.measureText(l).width).slice(0, 2)) {
        y += size * 0.4; ctx.fillText(line, frontCenterX, y); y += size * 1.1;
      }
    }
    if (style.depthBehind && cutout) {
      const frontCrop = cropRect(cutout.width, cutout.height, frontW, H, focus);
      ctx.save();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(cutout, frontCrop.x, frontCrop.y, frontCrop.w, frontCrop.h, frontX, 0, frontW, H);
      ctx.restore();
    }
    if (text.author.trim()) {
      const author = style.uppercase ? text.author.toUpperCase() : text.author;
      const fit = fitText(author, maxTitleW, 1, Math.round(0.045 * H), Math.round(0.025 * H), (size, line) => { ctx.font = `600 ${size}px ${family}`; return ctx.measureText(line).width; });
      ctx.font = `600 ${fit.size}px ${family}`;
      ctx.textBaseline = 'bottom';
      ctx.fillText(fit.lines[0] || author, frontCenterX, H - 0.08 * H);
    }

    return canvas;
  }

  let crop: Rect = { x: 0, y: 0, w: W, h: H };
  if (master) {
    crop = cropRect(master.width, master.height, W, H, focus);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(master, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
  } else {
    // Dark gray studio background for previewing template layout before image generation
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#3f3f46');
    gradient.addColorStop(0.5, '#27272a');
    gradient.addColorStop(1, '#18181b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = Math.round(Math.min(W, H) * 0.008);
    ctx.strokeRect(W * 0.04, H * 0.04, W * 0.92, H * 0.92);
  }

  // 16:9 and Video formats use the YouTube Editorial layout (Left-aligned + Badge) unless set to classic
  if ((format.ratio === '16:9' || format.category === 'video') && style.youtubeLayout !== 'classic') {
    renderYouTubeEditorial(ctx, W, H, text, style, family, measureAt, cutout, crop);
    return canvas;
  }

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

  // 3D Depth Layer: Draw foreground subject cutout over title if depthBehind is active
  if (style.depthBehind && cutout && crop) {
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cutout, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
    ctx.restore();
  }

  if (text.author.trim() && format.category !== 'video' && format.ratio !== '16:9') {
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
