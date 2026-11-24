import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildEpub } from '../utils/exportUtils';
import {
  EBOOK_STORES,
  editionChecks,
  epubCoverSize,
  guessLanguage,
  normalizeIsbn13,
  stableBookId,
} from '../utils/publish/ebookStores';
import { readEpubCheckReport } from '../services/publishDevPlugin';

const store = (id: string) => EBOOK_STORES.find(s => s.id === id)!;
const manuscript = '# The Quiet House\n\n## Chapter 1: Doors\n\nThe house listened.\n\nIt always had.\n\n## Chapter 2: Keys\n\nShe found the key.\n';
const facts = { title: 'The Quiet House', author: 'A. Writer', language: 'en', hasText: true, cover: { width: 1600, height: 2560 } };

describe('ebook stores', () => {
  it('keeps the cover inside an Apple EPUB under four million pixels, and others at full size', () => {
    const apple = epubCoverSize(store('apple'));
    expect(apple.width * apple.height).toBeLessThanOrEqual(4_000_000);
    expect(apple.height / apple.width).toBeCloseTo(1.6, 2);
    expect(epubCoverSize(store('kindle'))).toEqual({ width: 1600, height: 2560 });
  });

  it('accepts a real ISBN-13 and refuses a wrong check digit', () => {
    expect(normalizeIsbn13('978-0-306-40615-7')).toBe('9780306406157');
    expect(normalizeIsbn13('978-0-306-40615-8')).toBeNull();
    expect(normalizeIsbn13('12345')).toBeNull();
  });

  it('gives the same book the same identifier on every build', () => {
    const id = stableBookId('The Quiet House', 'A. Writer');
    expect(id).toBe(stableBookId(' the quiet house ', 'a. writer'));
    expect(id).not.toBe(stableBookId('The Loud House', 'A. Writer'));
    expect(id).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('reads the language from the letters of the text', () => {
    expect(guessLanguage('Комната 412 держала жару')).toBe('ru');
    expect(guessLanguage('Room 412 held the heat')).toBe('en');
  });

  it('stops a store without a cover or an author, and warns of a cover of another proportion', () => {
    expect(editionChecks(store('google'), { ...facts, cover: undefined }).some(c => c.level === 'fail')).toBe(true);
    expect(editionChecks(store('kindle'), { ...facts, author: '' }).some(c => c.level === 'fail')).toBe(true);
    expect(editionChecks(store('apple'), { ...facts, cover: { width: 2000, height: 2000 } }).some(c => c.level === 'warn' && /1:1\.6/.test(c.text))).toBe(true);
    expect(editionChecks(store('kindle'), facts).every(c => c.level === 'ok')).toBe(true);
    // Each store's own minimum: a 980×1225 cover is enough for Kindle and Google (scaled up), not for Apple.
    const small = { ...facts, cover: { width: 980, height: 1225 } };
    expect(editionChecks(store('apple'), small).some(c => c.level === 'fail')).toBe(true);
    expect(editionChecks(store('kindle'), small).some(c => c.level === 'fail')).toBe(false);
    expect(editionChecks(store('google'), small).some(c => c.level === 'warn' && /scaled up/.test(c.text))).toBe(true);
    expect(editionChecks(store('kindle'), { ...facts, isbnEbook: '978-0-306-40615-8' }).some(c => c.level === 'fail')).toBe(true);
  });
});

describe('store EPUB', () => {
  it('carries the language, the stable identifier, the given cover and the landmarks', async () => {
    const id = stableBookId('The Quiet House', 'A. Writer');
    const epub = await buildEpub(manuscript, { author: 'A. Writer', imprint: { isbnPaperback: '9780306406157' } }, {
      language: 'ru', identifier: id, cover: { mime: 'image/jpeg', base64: btoa('jpeg') },
    });
    const zip = await JSZip.loadAsync(await epub.arrayBuffer());
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
    expect(opf).toContain('<dc:language>ru</dc:language>');
    expect(opf).toContain(`<dc:identifier id="uuid">${id}</dc:identifier>`);
    expect(opf).toContain('href="cover.jpg" media-type="image/jpeg" properties="cover-image"');
    // The paperback's ISBN belongs to the print edition and stays out of the ebook.
    expect(opf).not.toContain('9780306406157');
    expect(nav).toContain('epub:type="landmarks"');
    expect(nav).toContain('epub:type="bodymatter" href="chapter1.xhtml"');
    expect(await zip.file('OEBPS/chapter1.xhtml')!.async('string')).toContain('xml:lang="ru"');
  });
});

describe('EPUBCheck report', () => {
  it('keeps errors and warnings with where they are, and passes a file with warnings only', () => {
    const result = readEpubCheckReport({
      checker: { checkerVersion: '5.1.0' },
      messages: [
        { severity: 'WARNING', ID: 'OPF-085', message: 'uuid', locations: [{ path: 'OEBPS/content.opf', line: 4 }] },
        { severity: 'USAGE', ID: 'ACC-001', message: 'ignored', locations: [] },
      ],
    });
    expect(result).toMatchObject({ available: true, ok: true, version: '5.1.0' });
    expect(result.messages).toEqual([{ severity: 'WARNING', id: 'OPF-085', message: 'uuid', where: 'OEBPS/content.opf:4' }]);
    expect(readEpubCheckReport({ messages: [{ severity: 'ERROR', ID: 'RSC-005', message: 'bad', locations: [] }] }).ok).toBe(false);
  });
});

// The real EPUBCheck, when this machine has it: a store EPUB must come out with no errors.
const epubcheck = (() => { try { require('node:child_process').execFileSync('epubcheck', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
describe.skipIf(!epubcheck)('store EPUB through EPUBCheck', () => {
  it('passes with the language, identifier, cover and landmarks a store edition adds', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    // A real 1×1 JPEG, so the cover is an image EPUBCheck can read.
    const jpeg = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=';
    const epub = await buildEpub(manuscript, { author: 'A. Writer' }, { language: 'en', identifier: stableBookId('The Quiet House', 'A. Writer'), cover: { mime: 'image/jpeg', base64: jpeg } });
    const dir = await mkdtemp(path.join(tmpdir(), 'epub-test-'));
    try {
      await writeFile(path.join(dir, 'b.epub'), Buffer.from(await epub.arrayBuffer()));
      try { execFileSync('epubcheck', [path.join(dir, 'b.epub'), '--json', path.join(dir, 'r.json'), '--quiet'], { stdio: 'ignore' }); } catch { /* The report says why. */ }
      const result = readEpubCheckReport(JSON.parse(await readFile(path.join(dir, 'r.json'), 'utf8')));
      expect(result.messages.filter(m => m.severity !== 'WARNING')).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
