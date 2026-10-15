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
  const imprint = metadata?.imprint?.enabled ? metadata.imprint : null;

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

  if (imprint) {
    const colophon = resolveImprintColophon(author, imprint);
    lines.push('\n---\n');
    lines.push('### Publishing Imprint\n');
    lines.push(colophon.plainText.split('\n').map(line => line.trim() ? `${line}  ` : '').join('\n'));
    lines.push('\n---\n');
  } else {
    lines.push('\n');
  }

  lines.push(body);
  return lines.join('\n');
}

/**
 * Formats plain text book content with Title, Author at the top, and optional colophon
 */
export function formatTextWithMetadata(content: string, metadata?: any): string {
  const title = extractBookTitle(content);
  const author = typeof metadata?.author === 'string' ? metadata.author.trim() : '';
  const imprint = metadata?.imprint?.enabled ? metadata.imprint : null;

  // Clean markdown headings from content
  const cleanBody = content.replace(/^#{1,6}\s+/gm, '').trim();

  const lines: string[] = [title];
  if (author) {
    lines.push(`by ${author}`);
  }
  lines.push('');

  if (imprint) {
    const colophon = resolveImprintColophon(author, imprint);
    lines.push('================================================================================');
    lines.push(colophon.plainText);
    lines.push('================================================================================');
    lines.push('');
  }

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
 * Export book as EPUB file (real EPUB 3.0 format)
 * Creates a proper EPUB with all required files and structure
 */
export async function buildEpub(content: string, metadata: any): Promise<Blob> {
  
  const title = extractBookTitle(content);
  const author = typeof metadata?.author === 'string' && metadata.author.trim() ? metadata.author.trim() : '';
  const imprint = metadata?.imprint?.enabled ? metadata.imprint : null;
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
  
  // Optional Imprint / Colophon file
  if (imprint) {
    const colophon = resolveImprintColophon(author, imprint);
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
    <p style="margin-bottom: 1.2em;">${xml(colophon.fictionDisclaimer)}</p>
    ${colophon.isbns.map(isbn => `<p style="margin-bottom: 0.3em; font-family: monospace;">${xml(isbn)}</p>`).join('\n    ')}
    <div style="margin-top: 2em; padding-top: 1em; border-top: 1px solid #ddd;">
      <p style="margin-bottom: 0.3em;">${xml(colophon.publisher)}</p>
      <p>${xml(colophon.editionLine)}</p>
    </div>
  </div>
</body>
</html>`);
  }

  // 4. content.opf (package document)
  const imprintManifest = imprint ? `    <item id="imprint" href="imprint.xhtml" media-type="application/xhtml+xml"/>\n` : '';
  const imprintSpine = imprint ? `    <itemref idref="imprint"/>\n` : '';
  
  const manifestItems = chapters.map(ch => 
    `    <item id="chapter${ch.num}" href="chapter${ch.num}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n');
  
  const spineItems = chapters.map(ch => 
    `    <itemref idref="chapter${ch.num}"/>`
  ).join('\n');
  
  const colophonMeta = imprint ? resolveImprintColophon(author, imprint) : null;
  const isbnIdentifier = imprint?.isbnEbook || imprint?.isbnPaperback;

  oebps.file('content.opf',
`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uuid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uuid">${uuid}</dc:identifier>
    ${isbnIdentifier ? `<dc:identifier id="isbn">urn:isbn:${xml(isbnIdentifier)}</dc:identifier>` : ''}
    <dc:title>${xml(title)}</dc:title>
    <dc:creator>${xml(author || 'Anonymous')}</dc:creator>
    ${colophonMeta ? `<dc:publisher>${xml(colophonMeta.publisher)}</dc:publisher>` : ''}
    ${colophonMeta ? `<dc:rights>${xml(`${colophonMeta.copyright}. ${colophonMeta.rights}`)}</dc:rights>` : ''}
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="stylesheet" href="stylesheet.css" media-type="text/css"/>
${imprintManifest}${manifestItems}
  </manifest>
  <spine>
${imprintSpine}${spineItems}
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
export function exportAsPdf(content: string, metadata: any): void {
  const title = extractBookTitle(content);
  const author = typeof metadata?.author === 'string' && metadata.author.trim() ? metadata.author.trim() : '';
  const imprint = metadata?.imprint?.enabled ? metadata.imprint : null;
  
  // Create a new window with the book content
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow pop-ups to export PDF');
    return;
  }
  
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const chapters = parseBookChapters(content);
  const htmlContent = chapters.map(ch => `<h2 class="chapter-title">${escape(chapterLabel(ch.num, ch.title))}</h2>` + ch.content.split(/\n\s*\n/).map(block => /^\s*(?:\*\s*){3,}\s*$/.test(block) ? '<div class="scene-break">* * *</div>' : `<p>${escape(block).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')}</p>`).join('')).join('');

  const imprintHtml = imprint ? (() => {
    const colophon = resolveImprintColophon(author, imprint);
    return `
    <div class="imprint-section" style="page-break-after: always; margin-top: 4em; font-size: 0.85em; color: #333; line-height: 1.6; max-width: 580px;">
      <p style="margin-bottom: 0.5em; font-weight: bold;">${escape(colophon.copyright)}</p>
      <p style="margin-bottom: 1.2em;">${escape(colophon.rights)}</p>
      <p style="margin-bottom: 1.2em; text-align: justify;">${escape(colophon.reproduction)}</p>
      <p style="margin-bottom: 1.2em; text-align: justify;">${escape(colophon.aiDisclaimer)}</p>
      <p style="margin-bottom: 1.2em; text-align: justify;">${escape(colophon.fictionDisclaimer)}</p>
      ${colophon.isbns.map(isbn => `<p style="margin-bottom: 0.3em; font-family: monospace;">${escape(isbn)}</p>`).join('')}
      <div style="margin-top: 2em; padding-top: 1em; border-top: 1px solid #ccc;">
        <p style="margin-bottom: 0.3em;">${escape(colophon.publisher)}</p>
        <p>${escape(colophon.editionLine)}</p>
      </div>
    </div>
  `;
  })() : '';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${escape(title)}${author ? ` - ${escape(author)}` : ''}</title>
      <style>
        @page {
          size: A4;
          margin: 2cm;
        }
        body {
          font-family: Georgia, serif;
          line-height: 1.6;
          color: #000;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 {
          text-align: center;
          font-size: 2.5em;
          margin-bottom: 0.5em;
          page-break-after: avoid;
        }
        .author {
          text-align: center;
          font-size: 1.2em;
          color: #666;
          margin-bottom: 3em;
        }
        h2.chapter-title {
          page-break-before: always;
          margin-top: 2em;
          margin-bottom: 1em;
          font-size: 1.8em;
        }
        p {
          text-align: justify;
          text-indent: 1.5em;
          margin: 0.5em 0;
          orphans: 3;
          widows: 3;
        }
        h2 + p {
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
        }
        @media print {
          body {
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      <h1>${escape(title)}</h1>
      ${author ? `<div class="author">by ${escape(author)}</div>` : ''}
      ${imprintHtml}
      ${htmlContent}
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 500);
        };
      </script>
    </body>
    </html>
  `);
  
  printWindow.document.close();
}
