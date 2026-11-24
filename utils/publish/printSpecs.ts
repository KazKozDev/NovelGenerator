/**
 * Print editions: the interior page, its margins and the cover a printer asks for, from the page count of the laid-out
 * interior. Official figures (KDP Help, checked 2026-10): margins by page count and minimum outside margins
 * ("Set Trim Size, Bleed, and Margins"), spine width per page and 0.125" bleed ("Create a Paperback Cover"),
 * hardcover 75–550 pages, 0.51" wrap and 0.4" hinge ("Create a Hardcover Cover"), spine text from 79 pages.
 * KDP does not publish the hardcover spine width and IngramSpark publishes no spine formula at all: both come from
 * the printer's own cover template, so for them the spine is entered by the author and only estimated here.
 */

export type PrintTargetId = 'kdp_paperback' | 'kdp_hardcover' | 'ingram_paperback';
export type Paper = 'white' | 'cream';

export interface Trim { id: string; width: number; height: number; label: string }

export const TRIMS: Trim[] = [
  { id: '5x8', width: 5, height: 8, label: '5 × 8 in' },
  { id: '5.25x8', width: 5.25, height: 8, label: '5.25 × 8 in' },
  { id: '5.5x8.5', width: 5.5, height: 8.5, label: '5.5 × 8.5 in' },
  { id: '6x9', width: 6, height: 9, label: '6 × 9 in' },
];

export interface PrintTarget {
  id: PrintTargetId;
  name: string;
  where: string;
  trims: string[];
  pages: { min: number; max: number } | null;
  /** The edge the cover art runs past the trim: bleed for a paperback, the wrap around the board for a hardcover. */
  coverEdge: number;
  /** The spine is computed from the page count (true), or read from the printer's template (false). */
  spineFromPages: boolean;
  /** Pages from which the printer prints lettering on the spine. */
  spineTextFrom: number;
  /** Margins larger than the page-count table asks for, where the printer recommends them. */
  minMargin?: number;
  steps: string[];
}

export const PRINT_TARGETS: PrintTarget[] = [
  {
    id: 'kdp_paperback',
    name: 'KDP Paperback',
    where: 'kdp.amazon.com · Paperback',
    trims: ['5x8', '5.25x8', '5.5x8.5', '6x9'],
    pages: { min: 24, max: 828 },
    coverEdge: 0.125,
    spineFromPages: true,
    spineTextFrom: 79,
    steps: [
      'Paperback Content: choose the same trim size, "No bleed", and your paper.',
      'Upload the interior PDF as the manuscript.',
      'Upload the cover PDF ("Upload a cover you already have"). Leave the barcode to KDP.',
    ],
  },
  {
    id: 'kdp_hardcover',
    name: 'KDP Hardcover',
    where: 'kdp.amazon.com · Hardcover',
    trims: ['5.5x8.5', '6x9'],
    pages: { min: 75, max: 550 },
    coverEdge: 0.51,
    spineFromPages: false,
    spineTextFrom: 79,
    steps: [
      'Download the cover template for this trim, paper and page count from the KDP cover calculator.',
      'Enter its spine width here and build the cover again if it differs.',
      'Upload the interior PDF and the cover PDF.',
    ],
  },
  {
    id: 'ingram_paperback',
    name: 'IngramSpark Paperback',
    where: 'ingramspark.com · Paperback',
    trims: ['5x8', '5.25x8', '5.5x8.5', '6x9'],
    pages: null,
    coverEdge: 0.125,
    spineFromPages: false,
    spineTextFrom: 48,
    minMargin: 0.5,
    steps: [
      'Get the cover template from the IngramSpark Cover Template Generator with your ISBN, trim, paper and page count.',
      'Enter its spine width here; the barcode from the template goes on the back, bottom right.',
      'Upload the interior PDF and the cover PDF.',
    ],
  },
];

/** KDP's inside margin by page count. */
export function gutterFor(pages: number): number {
  if (pages <= 150) return 0.375;
  if (pages <= 300) return 0.5;
  if (pages <= 500) return 0.625;
  if (pages <= 700) return 0.75;
  return 0.875;
}

export interface PageMargins { inside: number; outside: number; top: number; bottom: number }

/** The interior's margins: KDP's gutter, and outside, top and bottom wide enough to read comfortably (minimum 0.25"). */
export function marginsFor(target: PrintTarget, pages: number): PageMargins {
  const floor = target.minMargin || 0;
  return {
    inside: Math.max(gutterFor(pages), floor),
    outside: Math.max(0.5, floor),
    top: Math.max(0.6, floor),
    bottom: Math.max(0.75, floor),
  };
}

/** Inches of spine per page: KDP's published figures for black-and-white interiors. */
export const SPINE_PER_PAGE: Record<Paper, number> = { white: 0.002252, cream: 0.0025 };

/** The spine from the page count, by KDP's paperback formula; for other printers only an estimate to start from. */
export function spineFromPages(pages: number, paper: Paper): number {
  return Math.round(pages * SPINE_PER_PAGE[paper] * 10000) / 10000;
}

export interface CoverGeometry {
  /** Whole cover in inches. */
  width: number;
  height: number;
  edge: number;
  spine: number;
  trim: Trim;
  /** Left edge of the spine and of the front panel, in inches from the left. */
  spineX: number;
  frontX: number;
}

/** The full cover: edge + back + spine + front + edge, and edge + trim height + edge. */
export function coverGeometry(target: PrintTarget, trim: Trim, spine: number): CoverGeometry {
  const edge = target.coverEdge;
  const width = round4(edge * 2 + trim.width * 2 + spine);
  const height = round4(edge * 2 + trim.height);
  return { width, height, edge, spine, trim, spineX: round4(edge + trim.width), frontX: round4(edge + trim.width + spine) };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export type PrintCheckLevel = 'ok' | 'warn' | 'fail';
export interface PrintCheck { level: PrintCheckLevel; text: string }

/** What a printer would refuse or print badly, from the laid-out interior and the cover's spine. */
export function printChecks(target: PrintTarget, facts: { pages: number; trimId: string; spine: number; spineConfirmed: boolean; author: string; title: string }): PrintCheck[] {
  const checks: PrintCheck[] = [];
  checks.push(facts.title.trim() ? { level: 'ok', text: `Title: ${facts.title.trim()}` } : { level: 'fail', text: 'The book has no title' });
  checks.push(facts.author.trim() ? { level: 'ok', text: `Author: ${facts.author.trim()}` } : { level: 'fail', text: 'Author name is missing' });
  if (!target.trims.includes(facts.trimId)) checks.push({ level: 'fail', text: `${target.name} does not print ${TRIMS.find(t => t.id === facts.trimId)?.label || facts.trimId}` });
  if (target.pages) {
    const { min, max } = target.pages;
    if (facts.pages < min) checks.push({ level: 'fail', text: `${facts.pages} pages; ${target.name} needs at least ${min}` });
    else if (facts.pages > max) checks.push({ level: 'fail', text: `${facts.pages} pages; ${target.name} prints at most ${max}` });
    else checks.push({ level: 'ok', text: `${facts.pages} pages (${min}–${max})` });
  } else {
    checks.push({ level: 'ok', text: `${facts.pages} pages` });
  }
  checks.push({ level: 'ok', text: `Inside margin ${marginsFor(target, facts.pages).inside}" for ${facts.pages} pages` });
  if (target.spineFromPages) checks.push({ level: 'ok', text: `Spine ${facts.spine.toFixed(3)}" from ${facts.pages} pages` });
  else if (!facts.spineConfirmed) checks.push({ level: 'fail', text: `Spine ${facts.spine.toFixed(3)}" is an estimate; enter the width from the ${target.name.split(' ')[0]} template and confirm it` });
  else checks.push({ level: 'ok', text: `Spine ${facts.spine.toFixed(3)}" from the template` });
  if (facts.pages < target.spineTextFrom) checks.push({ level: 'warn', text: `Under ${target.spineTextFrom} pages the spine is left without lettering` });
  return checks;
}

/** Pages in a PDF, from its page objects. */
export function pdfPageCount(pdf: Uint8Array | string): number {
  const text = typeof pdf === 'string' ? pdf : new TextDecoder('latin1').decode(pdf);
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
}
