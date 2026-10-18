import { parseBookChapters, chapterLabel } from '../novel/manuscript';
import { resolveImprintColophon, type ImprintData } from '../imprintConstants';
import type { PageMargins, Trim } from './printSpecs';

export interface InteriorInput {
  content: string;
  title: string;
  author: string;
  language: string;
  imprint?: Partial<ImprintData>;
  trim: Trim;
  margins: PageMargins;
  /** A blank page after the last one, to make the count even. */
  blankAtEnd?: boolean;
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Typewriter quotes as a printed book sets them: “ ” and ’ in English, « » in Russian. */
export function smartQuotes(text: string, language = 'en'): string {
  const [open, close] = language === 'ru' ? ['«', '»'] : ['\u201C', '\u201D'];
  return text
    .replace(/(^|[\s([{\u2014\u2013-])"/g, `$1${open}`)
    .replace(/"/g, close)
    .replace(/(^|[\s([{\u2014\u2013-])'/g, '$1\u2018')
    .replace(/'/g, '\u2019');
}

/** The manuscript's inline Markdown as HTML: bold, italic and struck text, everything else escaped. */
function inline(text: string): string {
  return escape(text)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>');
}

/**
 * The book's interior as one HTML page Chrome prints to PDF: the trim as the page size, the inside margin on the
 * binding side of each page (right pages are odd), page numbers in the bottom margin of the text pages only,
 * a title page and a copyright page in front, each chapter from a new page.
 */
export function buildPrintInteriorHtml(input: InteriorInput): string {
  const { trim, margins: m } = input;
  const chapters = parseBookChapters(input.content);
  if (!chapters.length) throw new Error('No chapter bodies found in the manuscript.');
  // A print edition names its own ISBN; the ebook's belongs to the ebook.
  const colophon = resolveImprintColophon(input.author, { ...input.imprint, isbnEbook: undefined });
  const inch = (n: number) => `${n}in`;

  const body = chapters.map(ch => {
    const blocks = ch.content.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    const paragraphs = blocks.map(block => /^(\*\s*){3,}$|^-{3,}$|^#$/.test(block)
      ? '<p class="scene" aria-hidden="true">*</p>'
      : `<p>${inline(smartQuotes(block.replace(/\n/g, ' '), input.language))}</p>`).join('\n');
    return `<section class="chapter"><h2>${inline(chapterLabel(ch.num, ch.title))}</h2>\n${paragraphs}\n</section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="${escape(input.language)}">
<head>
<meta charset="utf-8">
<title>${escape(input.title)}</title>
<style>
@page {
  size: ${inch(trim.width)} ${inch(trim.height)};
  margin: ${inch(m.top)} ${inch(m.outside)} ${inch(m.bottom)} ${inch(m.inside)};
  @bottom-center { content: counter(page); font-family: Charter, "Iowan Old Style", Georgia, serif; font-size: 9pt; color: #000; }
}
@page :left { margin-left: ${inch(m.outside)}; margin-right: ${inch(m.inside)}; }
@page :right { margin-left: ${inch(m.inside)}; margin-right: ${inch(m.outside)}; }
@page front { @bottom-center { content: none; } }
html { font-family: Charter, "Iowan Old Style", Georgia, serif; font-size: 10.5pt; line-height: 1.4; color: #000; hyphens: auto; -webkit-hyphens: auto; }
body { margin: 0; }
.front { page: front; }
.title-page { break-after: page; text-align: center; padding-top: 32%; }
.title-page h1 { font-size: 22pt; font-weight: normal; letter-spacing: 0.04em; margin: 0 0 0.35in; line-height: 1.2; }
.title-page .author { font-size: 12pt; letter-spacing: 0.12em; text-transform: uppercase; }
.copyright { break-after: page; font-size: 7.5pt; line-height: 1.45; padding-top: 38%; }
.copyright p { margin: 0 0 0.6em; text-indent: 0; text-align: left; }
.chapter { break-before: page; }
.chapter h2 { font-size: 15pt; font-weight: normal; text-align: center; margin: 1.1in 0 0.45in; line-height: 1.25; break-after: avoid; }
p { margin: 0; text-indent: 1.4em; text-align: justify; orphans: 2; widows: 2; }
h2 + p, .scene + p { text-indent: 0; }
.scene { text-align: center; text-indent: 0; margin: 0.7em 0; letter-spacing: 0.5em; }
.blank { break-before: page; page: front; }
</style>
</head>
<body>
<div class="front">
  <div class="title-page"><h1>${escape(input.title)}</h1><div class="author">${escape(input.author)}</div></div>
  <div class="copyright">
    <p>${escape(colophon.copyright)}<br>${escape(colophon.rights)}</p>
    <p>${escape(colophon.reproduction)}</p>
    <p>${escape(colophon.fictionDisclaimer)}</p>
    <p>${escape(colophon.aiDisclaimer)}</p>
    ${colophon.isbns.map(isbn => `<p>${escape(isbn)}</p>`).join('\n    ')}
    <p>${escape(colophon.publisher)}<br>${escape(colophon.editionLine)}</p>
  </div>
</div>
${body}
${input.blankAtEnd ? '<div class="blank">&nbsp;</div>' : ''}
</body>
</html>`;
}

/** A cover image as a one-page PDF of exactly the cover's size, for Chrome to print. */
export function buildCoverPdfHtml(imageDataUrl: string, widthIn: number, heightIn: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${widthIn}in ${heightIn}in; margin: 0; }
html, body { margin: 0; padding: 0; }
img { display: block; width: ${widthIn}in; height: ${heightIn}in; }
</style></head><body><img src="${imageDataUrl}" alt=""></body></html>`;
}
