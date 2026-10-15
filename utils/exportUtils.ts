import JSZip from 'jszip';
import { parseBookChapters, chapterLabel } from './novel/manuscript';
import { resolveImprintColophon } from './imprintConstants';

/**
 * Utilities for exporting book content in different formats
 */

/**
 * Formats Markdown book content with Title, Author at the top, and optional colophon
 */
export function formatMarkdownWithMetadata(content: string, metadata?: any): string {
  const title = extractBookTitle(content);
  const author = typeof metadata?.author === 'string' ? metadata.author.trim() : '';

  // Remove duplicate title heading from the start of content if present
  let body = content;
  const headingMatch = body.match(/^#\s+[^\n]+\n*/);
  if (headingMatch) {
    body = body.slice(headingMatch[0].length).trim();
  }

  const lines: string[] = [`# ${title}`];
  if (author) {
    lines.push(`\n**Author:** ${author}`);
  }

  const colophon = resolveImprintColophon(author, metadata?.imprint);
  lines.push('\n---\n');
  lines.push('### Publishing Imprint\n');
  lines.push(colophon.plainText.split('\n').map(line => line.trim() ? `${line}  ` : '').join('\n'));
  lines.push('\n---\n');

  lines.push(body);
  return lines.join('\n');
}

/**
 * Formats plain text book content with Title, Author at the top, and optional colophon
 */
export function formatTextWithMetadata(content: string, metadata?: any): string {
  const title = extractBookTitle(content);
  const author = typeof metadata?.author === 'string' ? metadata.author.trim() : '';

  // Clean markdown headings from content
  const cleanBody = content.replace(/^#{1,6}\s+/gm, '').trim();

  const lines: string[] = [title];
  if (author) {
    lines.push(`by ${author}`);
  }
  lines.push('');

  const colophon = resolveImprintColophon(author, metadata?.imprint);
  lines.push('================================================================================');
  lines.push(colophon.plainText);
  lines.push('================================================================================');
  lines.push('');

  lines.push(cleanBody);
  return lines.join('\n');
}

/**
 * Export book as plain text file with author at the top
 */
export function exportAsText(content: string, filename: string = 'book.txt', metadata?: any): void {
  const formatted = formatTextWithMetadata(content, metadata);
  const blob = new Blob([formatted], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, filename);
}

/**
 * Export book as Markdown file with author at the top
 */
export function exportAsMarkdown(content: string, filename: string = 'book.md', metadata?: any): void {
  const formatted = formatMarkdownWithMetadata(content, metadata);
  const blob = new Blob([formatted], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, filename);
}

/**
 * Export metadata as JSON file
 */
export function exportAsJSON(data: any, filename: string = 'metadata.json'): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, filename);
}

/**
 * Helper function to trigger download
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate filename from book title
 */
export function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50) || 'book';
}

/**
 * Get book title from content (first line after # symbol)
 */
export function extractBookTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Untitled Book';
}

/**
 * Resolves the book cover image data URL from metadata or localStorage
 */
export function resolveCoverImage(title?: string, metadata?: any): string | null {
  if (typeof metadata?.coverImage === 'string' && metadata.coverImage.trim()) {
    return metadata.coverImage.trim();
  }
  if (typeof metadata?.coverUrl === 'string' && metadata.coverUrl.trim()) {
    return metadata.coverUrl.trim();
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (title) {
        const cleanTitle = title.trim().toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '_');
        const savedByTitle = window.localStorage.getItem(`novel_cover_${cleanTitle}`);
        if (savedByTitle && savedByTitle.startsWith('data:image/')) {
          return savedByTitle;
        }
      }
      const generic = window.localStorage.getItem('novel_cover_image');
      if (generic && generic.startsWith('data:image/')) {
        return generic;
      }
    } catch {
      // localStorage restricted
    }
  }
  return null;
}

/**
 * Export book as EPUB file (real EPUB 3.0 format)
 * Creates a proper EPUB with all required files and structure
 */
export async function buildEpub(content: string, metadata: any): Promise<Blob> {
  
  const title = extractBookTitle(content);
  const author = typeof metadata?.author === 'string' && metadata.author.trim() ? metadata.author.trim() : '';
  const uuid = `urn:uuid:${crypto.randomUUID()}`;
  
  const chapters = parseBookChapters(content);
  if (!chapters.length) throw new Error('No chapter bodies found in the manuscript.');

  const zip = new JSZip();
  
  // 1. mimetype (must be first, uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  
  // 2. META-INF/container.xml
  zip.folder('META-INF')!.file('container.xml', 
`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
  
  // 3. OEBPS folder
  const oebps = zip.folder('OEBPS')!;
  
  const xml = (text: string) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  
  // Mandatory Imprint / Colophon file
  const colophon = resolveImprintColophon(author, metadata?.imprint);
  oebps.file('imprint.xhtml',
`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Publishing Imprint</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  <div style="margin-top: 3em; font-size: 0.85em; line-height: 1.6; color: #444; max-width: 580px;">
    <p style="margin-bottom: 0.5em; font-weight: bold;">${xml(colophon.copyright)}</p>
    <p style="margin-bottom: 1.2em;">${xml(colophon.rights)}</p>
    <p style="margin-bottom: 1.2em;">${xml(colophon.reproduction)}</p>
    <p style="margin-bottom: 1.2em;">${xml(colophon.aiDisclaimer)}</p>
    <p style="margin-bottom: 1.2em;">${xml(colophon.liabilityDisclaimer)}</p>
    <p style="margin-bottom: 1.2em;">${xml(colophon.fictionDisclaimer)}</p>
    ${colophon.isbns.map(isbn => `<p style="margin-bottom: 0.3em; font-family: monospace;">${xml(isbn)}</p>`).join('\n    ')}
    <div style="margin-top: 2em; padding-top: 1em; border-top: 1px solid #ddd;">
      <p style="margin-bottom: 0.3em;">${xml(colophon.publisher)}</p>
      <p>${xml(colophon.editionLine)}</p>
    </div>
  </div>
</body>
</html>`);

  // Optional Cover image & cover page
  const coverImage = resolveCoverImage(title, metadata);
  let coverMetaItem = '';
  let coverManifestItem = '';
  let coverSpineItem = '';

  if (coverImage && coverImage.startsWith('data:image/')) {
    const match = coverImage.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (match) {
      const coverMime = match[1];
      const base64Data = match[2];
      const ext = coverMime.includes('png') ? 'png' : coverMime.includes('webp') ? 'webp' : 'jpg';
      const coverFilename = `cover.${ext}`;

      // Add cover image binary to OEBPS
      oebps.file(coverFilename, base64Data, { base64: true });

      // Add cover.xhtml page
      oebps.file(
        'cover.xhtml',
`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Cover</title>
  <style>
    @page { margin: 0; padding: 0; }
    body { margin: 0; padding: 0; text-align: center; background-color: #000000; }
    .cover-container { text-align: center; height: 100vh; display: flex; justify-content: center; align-items: center; }
    img { max-width: 100%; max-height: 100vh; height: auto; object-fit: contain; }
  </style>
</head>
<body>
  <div class="cover-container">
    <img src="${coverFilename}" alt="${xml(title)} Cover" />
  </div>
</body>
</html>`);

      coverMetaItem = `    <meta name="cover" content="cover-image"/>\n`;
      coverManifestItem = `    <item id="cover-image" href="${coverFilename}" media-type="${coverMime}" properties="cover-image"/>\n    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>\n`;
      coverSpineItem = `    <itemref idref="cover"/>\n`;
    }
  }

  // 4. content.opf (package document)
  const imprintManifest = `    <item id="imprint" href="imprint.xhtml" media-type="application/xhtml+xml"/>\n`;
  const imprintSpine = `    <itemref idref="imprint"/>\n`;
  
  const manifestItems = chapters.map(ch => 
    `    <item id="chapter${ch.num}" href="chapter${ch.num}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n');
  
  const spineItems = chapters.map(ch => 
    `    <itemref idref="chapter${ch.num}"/>`
  ).join('\n');
  
  const isbnIdentifier = metadata?.imprint?.isbnEbook || metadata?.imprint?.isbnPaperback;

  oebps.file('content.opf',
`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uuid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uuid">${uuid}</dc:identifier>
    ${isbnIdentifier ? `<dc:identifier id="isbn">urn:isbn:${xml(isbnIdentifier)}</dc:identifier>` : ''}
    <dc:title>${xml(title)}</dc:title>
    <dc:creator>${xml(author || 'Anonymous')}</dc:creator>
    <dc:publisher>${xml(colophon.publisher)}</dc:publisher>
    <dc:rights>${xml(`${colophon.copyright}. ${colophon.rights}`)}</dc:rights>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
${coverMetaItem}  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="stylesheet" href="stylesheet.css" media-type="text/css"/>
${coverManifestItem}${imprintManifest}${manifestItems}
  </manifest>
  <spine>
${coverSpineItem}${imprintSpine}${spineItems}
  </spine>
</package>`);
  
  // 5. nav.xhtml (navigation document)
  const navItems = chapters.map(ch => 
    `        <li><a href="chapter${ch.num}.xhtml">${xml(chapterLabel(ch.num, ch.title))}</a></li>`
  ).join('\n');
  
  oebps.file('nav.xhtml',
`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Navigation</title>
</head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`);
  
  // 6. stylesheet.css
  oebps.file('stylesheet.css',
`body {
  font-family: Georgia, serif;
  line-height: 1.6;
  margin: 1em;
}
h1 {
  text-align: center;
  margin: 2em 0;
  font-size: 2em;
}
h2 {
  margin-top: 2em;
  page-break-before: always;
}
p {
  text-indent: 1.5em;
  margin: 0.5em 0;
  text-align: justify;
}
p:first-of-type {
  text-indent: 0;
}
strong {
  font-weight: bold;
}
em {
  font-style: italic;
}
del {
  text-decoration: line-through;
}
.scene-break {
  text-align: center;
  margin: 2em 0;
  letter-spacing: 0.5em;
}`);
  
  // Helper function to convert Markdown to HTML and escape
  const markdownToHtml = (text: string) => {
    return text
      // Escape HTML first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Convert Markdown formatting (scene breaks are handled separately)
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>') // ***bold italic***
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') // **bold**
      .replace(/\*(.+?)\*/g, '<em>$1</em>') // *italic*
      .replace(/_(.+?)_/g, '<em>$1</em>') // _italic_
      .replace(/~~(.+?)~~/g, '<del>$1</del>') // ~~strikethrough~~
      // Convert quotes
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
  
  // 7. Chapter files
  chapters.forEach(ch => {
    // Split content into blocks (paragraphs separated by blank lines)
    const blocks = ch.content.split(/\n\n+/);
    
    const htmlParagraphs = blocks.map(block => {
      const trimmed = block.trim();
      
      // Check if this block is just *** (scene break)
      if (/^\*\*\*$/.test(trimmed)) {
        return `    <div class="scene-break">* * *</div>`;
      }
      
      // Regular paragraph - convert markdown
      const cleaned = trimmed.replace(/\n/g, ' ');
      return `    <p>${markdownToHtml(cleaned)}</p>`;
    }).filter(p => p.trim()).join('\n');
    
    oebps.file(`chapter${ch.num}.xhtml`,
`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${markdownToHtml(chapterLabel(ch.num, ch.title))}</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  <h2>${markdownToHtml(chapterLabel(ch.num, ch.title))}</h2>
${htmlParagraphs}
</body>
</html>`);
  });
  
  // Generate EPUB
  const blob = await zip.generateAsync({ 
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
  
  return blob;
}

export async function exportAsEpub(content: string, metadata: any, filename = 'book.epub'): Promise<void> {
  downloadBlob(await buildEpub(content, metadata), filename);
}

/**
 * Export book as PDF using browser's print functionality
 */
/**
 * Builds the complete HTML document string for printing / saving as PDF.
 * Uses @page { margin: 0 } to suppress browser headers (time/date) and footers (about:blank),
 * while supplying internal margins on dedicated pages:
 * 1. Full-bleed cover page (if cover image present)
 * 2. Dedicated Title page
 * 3. Dedicated centered Colophon/Copyright page
 * 4. Automatic Table of Contents page
 * 5. Chapters (each starting on a new page)
 */
export function buildPdfHtml(content: string, metadata: any): string {
  const title = extractBookTitle(content);
  const author = typeof metadata?.author === 'string' && metadata.author.trim() ? metadata.author.trim() : '';
  const coverImage = resolveCoverImage(title, metadata);
  const colophon = resolveImprintColophon(author, metadata?.imprint);
  const chapters = parseBookChapters(content);

  const escape = (text: string) =>
    String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  // 1. Cover page HTML
  const coverHtml = coverImage ? `
    <div class="page cover-page" id="pdf-cover-page">
      <img src="${coverImage}" alt="${escape(title)} Cover" />
    </div>
  ` : '';

  // 2. Title page HTML
  const titlePageHtml = `
    <div class="page title-page" id="pdf-title-page">
      <div class="title-page-content">
        <h1 class="book-title">${escape(title)}</h1>
        <div class="title-divider"></div>
        ${author ? `<div class="book-author">by ${escape(author)}</div>` : ''}
        ${colophon.editionLine ? `<div class="book-edition-subtitle">${escape(colophon.editionLine)}</div>` : ''}
      </div>
    </div>
  `;

  // 3. Colophon / Copyright page HTML (classic publishing: bottom-left aligned)
  const colophonHtml = `
    <div class="page colophon-page" id="pdf-colophon-page">
      <div class="colophon-card">
        <div class="colophon-title">${escape(title)}</div>
        <div class="colophon-body">
          <p class="colophon-copyright">${escape(colophon.copyright)}</p>
          <p class="colophon-rights">${escape(colophon.rights)}</p>
          <p class="colophon-text">${escape(colophon.reproduction)}</p>
          <p class="colophon-text">${escape(colophon.aiDisclaimer)}</p>
          <p class="colophon-text">${escape(colophon.liabilityDisclaimer)}</p>
          <p class="colophon-text fiction-disclaimer">${escape(colophon.fictionDisclaimer)}</p>
          ${colophon.isbns.length > 0 ? `
            <div class="colophon-isbns">
              ${colophon.isbns.map(isbn => `<div class="colophon-isbn">${escape(isbn)}</div>`).join('')}
            </div>
          ` : ''}
          <div class="colophon-publisher">
            <div>${escape(colophon.publisher)}</div>
            ${colophon.editionLine ? `<div>${escape(colophon.editionLine)}</div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  // 4. Automatic Table of Contents HTML
  const tocHtml = chapters.length > 0 ? `
    <table class="toc-table page toc-page" id="pdf-toc-page">
      <thead>
        <tr>
          <td class="page-top-margin"></td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="toc-content-cell">
            <div class="toc-container">
              <h2 class="toc-heading">Table of Contents</h2>
              <div class="toc-divider"></div>
              <ul class="toc-list">
                ${chapters.map(ch => `
                  <li class="toc-item">
                    <span class="toc-title">${escape(chapterLabel(ch.num, ch.title))}</span>
                    <span class="toc-leader"></span>
                    <span class="toc-number">${ch.num}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td class="page-bottom-margin"></td>
        </tr>
      </tfoot>
    </table>
  ` : '';

  // 5. Chapters HTML (using thead/tfoot spacers to guarantee top and bottom margins on every printed page)
  const chapterBodiesHtml = chapters.length > 0
    ? chapters.map(ch => {
        const titleText = escape(chapterLabel(ch.num, ch.title));
        const paragraphsHtml = ch.content
          .split(/\n\s*\n/)
          .map(block => {
            const trimmed = block.trim();
            if (!trimmed) return '';
            if (/^\s*(?:\*\s*){3,}\s*$/.test(trimmed)) {
              return '<div class="scene-break">* * *</div>';
            }
            const formatted = escape(trimmed)
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.+?)\*/g, '<em>$1</em>');
            return `<p>${formatted}</p>`;
          })
          .filter(Boolean)
          .join('\n');

        return `
          <table class="chapter-table chapter-container">
            <thead>
              <tr>
                <td class="page-top-margin"></td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="chapter-content-cell">
                  <h2 class="chapter-title">${titleText}</h2>
                  ${paragraphsHtml}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td class="page-bottom-margin"></td>
              </tr>
            </tfoot>
          </table>
        `;
      }).join('\n')
    : `<table class="chapter-table chapter-container"><thead><tr><td class="page-top-margin"></td></tr></thead><tbody><tr><td class="chapter-content-cell">${content.split(/\n\s*\n/).map(b => `<p>${escape(b)}</p>`).join('')}</td></tr></tbody><tfoot><tr><td class="page-bottom-margin"></td></tr></tfoot></table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escape(title)}${author ? ` - ${escape(author)}` : ''}</title>
  <style>
    /* Suppress browser print header (date/time) and footer (about:blank) by zeroing @page margin */
    @page {
      size: A4 portrait;
      margin: 0;
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 0;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #111111 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page {
        page-break-after: always;
        break-after: page;
      }
      .chapter-table, .toc-table {
        page-break-before: always;
        break-before: page;
      }
      .chapter-table thead, .toc-table thead {
        display: table-header-group !important;
      }
      .chapter-table tfoot, .toc-table tfoot {
        display: table-footer-group !important;
      }
      .page-top-margin, .page-bottom-margin {
        height: 2.8cm !important;
      }
      .cover-page {
        page-break-after: always;
        break-after: page;
        margin: 0 !important;
        padding: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        min-height: 100vh !important;
        max-height: 100vh !important;
        overflow: hidden !important;
      }
      .cover-page img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
      }
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      background-color: #ffffff;
      color: #1a1a1a;
      font-family: 'Georgia', 'Garamond', 'Palatino Linotype', serif;
      font-size: 11pt;
      line-height: 1.65;
    }

    /* Page container base */
    .page {
      width: 100%;
      min-height: 100vh;
      page-break-after: always;
      break-after: page;
    }

    /* 1. Cover Page - Full bleed stretch */
    .cover-page {
      width: 100vw;
      height: 100vh;
      min-height: 100vh;
      max-height: 100vh;
      padding: 0;
      margin: 0;
      overflow: hidden;
      display: flex;
      justify-content: center;
      align-items: center;
      background-color: #000000;
    }
    .cover-page img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    /* 2. Title Page */
    .title-page {
      padding: 4.5cm 2.5cm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    .title-page-content {
      max-width: 600px;
      margin: auto;
    }
    .book-title {
      font-size: 2.8em;
      font-weight: 700;
      letter-spacing: 0.04em;
      line-height: 1.2;
      color: #111111;
      margin: 0 0 0.4em 0;
    }
    .title-divider {
      width: 60px;
      height: 2px;
      background-color: #333333;
      margin: 1.8em auto;
    }
    .book-author {
      font-size: 1.35em;
      font-style: italic;
      color: #444444;
      margin-bottom: 2.5em;
    }
    .book-edition-subtitle {
      font-size: 0.85em;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #777777;
    }

    /* 3. Colophon / Copyright Page - Classic publishing: bottom-left aligned */
    .colophon-page {
      padding: 3.5cm 2.8cm 2.5cm 2.8cm;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: flex-start;
    }
    .colophon-card {
      max-width: 520px;
      margin: 0;
      font-size: 8.5pt;
      line-height: 1.55;
      color: #333333;
      text-align: left;
    }
    .colophon-title {
      font-size: 1.05em;
      font-weight: 700;
      color: #111111;
      margin-bottom: 1.2em;
    }
    .colophon-copyright {
      font-weight: 600;
      color: #111111;
      margin-bottom: 0.25em;
    }
    .colophon-rights {
      color: #222222;
      margin-bottom: 0.9em;
    }
    .colophon-text {
      text-align: justify;
      margin-bottom: 0.8em;
      color: #444444;
      text-indent: 0;
    }
    .fiction-disclaimer {
      font-style: italic;
      color: #555555;
      margin-top: 1em;
      margin-bottom: 1em;
    }
    .colophon-isbns {
      margin: 0.9em 0;
      font-size: 0.95em;
      color: #222222;
    }
    .colophon-publisher {
      margin-top: 1.2em;
      font-size: 0.9em;
      color: #555555;
    }

    /* 4. Table of Contents */
    .toc-page {
      padding: 3.5cm 2.5cm;
    }
    .toc-container {
      max-width: 650px;
      margin: 0 auto;
    }
    .toc-heading {
      font-size: 1.8em;
      font-weight: 700;
      text-align: center;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #111111;
      margin: 0 0 0.5em 0;
    }
    .toc-divider {
      width: 50px;
      height: 2px;
      background: #333333;
      margin: 1.2em auto 2.5em auto;
    }
    .toc-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .toc-item {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 0.9em;
      font-size: 0.95em;
      color: #222222;
    }
    .toc-title {
      font-weight: 500;
    }
    .toc-leader {
      flex-grow: 1;
      margin: 0 0.8em;
      border-bottom: 1px dotted #888888;
      height: 1px;
    }
    .toc-number {
      font-variant-numeric: tabular-nums;
      font-feature-settings: 'tnum';
      color: #555555;
      font-weight: 600;
    }

    /* 5. Chapters & TOC Table-based Multi-page Margins */
    .chapter-table, .toc-table {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
      page-break-before: always;
      break-before: page;
    }
    .chapter-table thead, .toc-table thead {
      display: table-header-group;
    }
    .chapter-table tfoot, .toc-table tfoot {
      display: table-footer-group;
    }
    .page-top-margin {
      height: 2.8cm;
      padding: 0;
      margin: 0;
      border: none;
    }
    .page-bottom-margin {
      height: 2.8cm;
      padding: 0;
      margin: 0;
      border: none;
    }
    .chapter-content-cell, .toc-content-cell {
      padding: 0 2.6cm;
      border: none;
      vertical-align: top;
    }
    .chapter-title {
      text-align: center;
      font-size: 1.9em;
      font-weight: 700;
      letter-spacing: 0.04em;
      margin-top: 1.5em;
      margin-bottom: 2em;
      page-break-after: avoid;
      break-after: avoid;
      color: #111111;
    }
    p {
      text-align: justify;
      text-indent: 1.5em;
      margin: 0.6em 0;
      line-height: 1.65;
      orphans: 3;
      widows: 3;
    }
    .chapter-title + p {
      text-indent: 0;
    }
    strong {
      font-weight: bold;
    }
    em {
      font-style: italic;
    }
    .scene-break {
      text-align: center;
      margin: 2em 0;
      letter-spacing: 0.5em;
      color: #666666;
    }
  </style>
</head>
<body>
  ${coverHtml}
  ${titlePageHtml}
  ${colophonHtml}
  ${tocHtml}
  ${chapterBodiesHtml}
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>`;
}

/**
 * Export book as PDF via browser print window
 */
export function exportAsPdf(content: string, metadata: any): void {
  // Create a new window with the book content
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow pop-ups to export PDF');
    return;
  }

  const html = buildPdfHtml(content, metadata);
  printWindow.document.write(html);
  printWindow.document.close();
}

