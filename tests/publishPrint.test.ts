import { describe, expect, it } from 'vitest';
import {
  PRINT_TARGETS,
  TRIMS,
  coverGeometry,
  gutterFor,
  marginsFor,
  pdfPageCount,
  printChecks,
  spineFromPages,
} from '../utils/publish/printSpecs';
import { buildPrintInteriorHtml, smartQuotes } from '../utils/publish/printInterior';
import { layoutInterior } from '../utils/publish/printBuild';
import { printWrapFormat } from '../utils/cover/formats';

const target = (id: string) => PRINT_TARGETS.find(t => t.id === id)!;
const trim = (id: string) => TRIMS.find(t => t.id === id)!;
const book = { content: '# Book\n\n## Chapter 1: One\n\n"Drawer," she said. It\'s late.\n\n***\n\nNext.\n', title: 'Book', author: 'A. Writer', language: 'en' };

describe('print specs', () => {
  it('follows KDP\'s gutter table at its boundaries', () => {
    expect([24, 150, 151, 300, 301, 500, 501, 700, 701, 828].map(gutterFor)).toEqual([0.375, 0.375, 0.5, 0.5, 0.625, 0.625, 0.75, 0.75, 0.875, 0.875]);
    expect(marginsFor(target('ingram_paperback'), 100).inside).toBe(0.5);
  });

  it('measures the paperback spine by KDP\'s published figures, and sizes the cover around it', () => {
    expect(spineFromPages(300, 'cream')).toBe(0.75);
    expect(spineFromPages(300, 'white')).toBe(0.6756);
    const g = coverGeometry(target('kdp_paperback'), trim('6x9'), 0.75);
    expect(g).toMatchObject({ width: 13, height: 9.25, spineX: 6.125, frontX: 6.875 });
    expect(coverGeometry(target('kdp_hardcover'), trim('6x9'), 1).width).toBe(14.02);
  });

  it('stops a book a printer will not print, and a hardcover whose spine is not from the template', () => {
    const facts = { pages: 40, trimId: '6x9', spine: 0.1, spineConfirmed: true, author: 'A', title: 'B' };
    expect(printChecks(target('kdp_paperback'), facts).some(c => c.level === 'fail')).toBe(false);
    expect(printChecks(target('kdp_hardcover'), facts).find(c => c.level === 'fail')?.text).toMatch(/at least 75/);
    expect(printChecks(target('kdp_hardcover'), { ...facts, pages: 120, spineConfirmed: false }).some(c => /estimate/.test(c.text) && c.level === 'fail')).toBe(true);
    expect(printChecks(target('kdp_hardcover'), { ...facts, pages: 120, trimId: '5x8' }).some(c => /does not print/.test(c.text))).toBe(true);
    expect(printChecks(target('kdp_paperback'), facts).some(c => c.level === 'warn' && /spine is left without lettering/.test(c.text))).toBe(true);
  });

  it('counts the pages of a PDF, not its page tree', () => {
    expect(pdfPageCount('<< /Type /Pages /Count 2 >> << /Type /Page /Parent 1 0 R >> << /Type/Page >>')).toBe(2);
  });
});

describe('interior', () => {
  it('sets the trim as the page and puts the inside margin on the binding side of each page', () => {
    const html = buildPrintInteriorHtml({ ...book, trim: trim('6x9'), margins: marginsFor(target('kdp_paperback'), 100) });
    expect(html).toContain('size: 6in 9in;');
    expect(html).toContain('@page :right { margin-left: 0.375in; margin-right: 0.5in; }');
    expect(html).toContain('@page :left { margin-left: 0.5in; margin-right: 0.375in; }');
    expect(html).toContain('“Drawer,” she said. It’s late.');
    expect(html).toContain('class="scene"');
  });

  it('names the print ISBN on the copyright page and leaves the ebook\'s out', () => {
    const html = buildPrintInteriorHtml({ ...book, imprint: { isbnPaperback: '9780306406157', isbnEbook: '9781234567897' }, trim: trim('6x9'), margins: marginsFor(target('kdp_paperback'), 100) });
    expect(html).toContain('9780306406157');
    expect(html).not.toContain('9781234567897');
  });

  it('sets Russian quotes for a Russian book', () => {
    expect(smartQuotes('"Да," сказала она.', 'ru')).toBe('«Да,» сказала она.');
  });

  it('lays out again until the gutter fits the page count, and evens an odd count with a blank page', async () => {
    const calls: { gutter: string; blank: boolean }[] = [];
    // A book that comes to 151 pages with the narrow gutter and 161 with the wider one.
    const print = async (html: string) => {
      const gutter = html.match(/@page :right \{ margin-left: ([\d.]+)in/)![1];
      const blank = html.includes('class="blank"');
      calls.push({ gutter, blank });
      return { pdf: new Blob(['%PDF']), pages: (gutter === '0.375' ? 151 : 161) + (blank ? 1 : 0) };
    };
    const result = await layoutInterior(target('kdp_paperback'), trim('6x9'), { ...book, content: book.content.repeat(1) }, print);
    expect(result.pages).toBe(162);
    expect(result.margins.inside).toBe(0.5);
    expect(result.blankAtEnd).toBe(true);
    expect(calls.at(-1)).toEqual({ gutter: '0.5', blank: true });
  });
});

describe('print cover formats', () => {
  it('lays out a wrap at the spine it is given, with the barcode zone on the back and the spine marked', () => {
    const format = printWrapFormat(target('kdp_paperback'), trim('6x9'), { spine: 0.1, pages: 40, source: 'pages' });
    expect(format.id).toBe('print_wrap_6x9');
    expect(format.width).toBe(Math.round(12.35 * 300));
    expect(format.height).toBe(Math.round(9.25 * 300));
    expect(format.wrap).toMatchObject({ spine: 0.1, spineText: false, spineSource: 'pages' });
    expect(format.covered.map(c => c.why)).toContain('Barcode 2" × 1.2"');
    expect(printWrapFormat(target('kdp_hardcover'), trim('6x9')).wrap).toMatchObject({ edge: 0.51, spineSource: 'estimate' });
  });
});

describe('cover format groups', () => {
  it('groups by where the cover goes, and shows Print at the trim the book is laid out at', async () => {
    const { COVER_FORMATS } = await import('../utils/cover/formats');
    const { formatsInGroup } = await import('../utils/cover/formatGroups');
    const ids = (group: Parameters<typeof formatsInGroup>[1], trimId = '6x9', other = false) => formatsInGroup(COVER_FORMATS, group, trimId, other).map(f => f.id);
    expect(ids('stores')).toEqual(['ebook']);
    expect(ids('audio')).toEqual(['audio', 'podcast']);
    expect(ids('video')).toEqual(['yt_thumb', 'yt_frame']);
    expect(ids('social')).toHaveLength(5);
    expect(ids('print')).toEqual(['print_front_6x9', 'print_wrap_6x9', 'hardcover_wrap_6x9', 'ingram_wrap_6x9']);
    // KDP prints no 5 × 8 hardcover, so that trim has three covers.
    expect(ids('print', '5x8')).toEqual(['print_front_5x8', 'print_wrap_5x8', 'ingram_wrap_5x8']);
    expect(ids('print', '6x9', true)).toHaveLength(14);
    expect(ids('all')).toHaveLength(COVER_FORMATS.length);
  });
});
