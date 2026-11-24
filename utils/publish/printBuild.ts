import { buildCoverPdfHtml, buildPrintInteriorHtml, type InteriorInput } from './printInterior';
import { marginsFor, type PageMargins, type PrintTarget, type Trim } from './printSpecs';

/** An HTML page printed to PDF by the dev server's Chrome. */
export async function printPdf(html: string): Promise<{ pdf: Blob; pages: number }> {
  const res = await fetch('/api/publish/print-pdf', { method: 'POST', headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: html });
  if (!res.ok) {
    const reason = await res.json().catch(() => ({}));
    throw new Error(reason.error || `The PDF could not be printed (${res.status})`);
  }
  return { pdf: await res.blob(), pages: Number(res.headers.get('X-Page-Count')) || 0 };
}

export interface LaidOutInterior { pdf: Blob; pages: number; margins: PageMargins; blankAtEnd: boolean }

/**
 * The interior at its final page count: the gutter depends on the pages and the pages on the gutter, so it is laid
 * out again until the two agree, and once more with a blank last page when the count is odd.
 */
export async function layoutInterior(target: PrintTarget, trim: Trim, book: Omit<InteriorInput, 'trim' | 'margins' | 'blankAtEnd'>, print = printPdf): Promise<LaidOutInterior> {
  const words = book.content.split(/\s+/).filter(Boolean).length;
  let pages = Math.max(24, Math.round(words / (trim.width * trim.height * 6.5)) + 4);
  let blankAtEnd = false;
  for (let pass = 0; pass < 5; pass++) {
    const margins = marginsFor(target, pages);
    const result = await print(buildPrintInteriorHtml({ ...book, trim, margins, blankAtEnd }));
    if (marginsFor(target, result.pages).inside !== margins.inside) { pages = result.pages; continue; }
    if (result.pages % 2 === 1 && !blankAtEnd) { blankAtEnd = true; pages = result.pages + 1; continue; }
    return { ...result, margins, blankAtEnd };
  }
  throw new Error('The page count did not settle; the interior could not be laid out.');
}

/** A rendered cover (a canvas) as a PDF of exactly its size in inches. */
export async function coverPdf(canvas: HTMLCanvasElement, widthIn: number, heightIn: number, print = printPdf): Promise<Blob> {
  return (await print(buildCoverPdfHtml(canvas.toDataURL('image/jpeg', 0.95), widthIn, heightIn))).pdf;
}
