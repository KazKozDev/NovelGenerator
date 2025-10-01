/**
 * Utilities for exporting book content in different formats
 */

/**
 * Export book as plain text file
 */
export function exportAsText(content: string, filename: string = 'book.txt'): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, filename);
}

/**
 * Export book as Markdown file
 */
export function exportAsMarkdown(content: string, filename: string = 'book.md'): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
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
export async function exportAsEpub(content: string, metadata: any, filename: string = 'book.epub'): Promise<void> {
  // Dynamic import of JSZip
  const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
  
  const title = extractBookTitle(content);
  const author = metadata?.author || 'Unknown Author';
  const uuid = `urn:uuid:${crypto.randomUUID()}`;
  
  // Split content into chapters
  // Remove the main title first
  const contentWithoutTitle = content.replace(/^#\s+.+$/m, '').trim();
  
  // Split by chapter headers
  const chapterSections = contentWithoutTitle.split(/^## Chapter (\d+):/gm);
  const chapters: Array<{num: number, title: string, content: string}> = [];
  
  // Process pairs: [empty, num1, content1, num2, content2, ...]
  for (let i = 1; i < chapterSections.length; i += 2) {
    const num = parseInt(chapterSections[i]);
    const fullContent = chapterSections[i + 1] || '';
    
    // The title is on the same line as "Chapter N:" so extract it
    const firstLineMatch = fullContent.match(/^\s*(.+?)$/m);
    const title = firstLineMatch ? firstLineMatch[1].trim() : `Chapter ${num}`;
    
    // Content is everything after the first line
    const contentStart = fullContent.indexOf('\n');
    let content = contentStart >= 0 ? fullContent.substring(contentStart + 1).trim() : '';
    
    // Check if content starts with duplicate title (e.g., "## The Title")
    // Remove it if it matches the chapter title
    const duplicateTitlePattern = new RegExp(`^##\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\n`, 'm');
    content = content.replace(duplicateTitlePattern, '');
    
    if (content) {
      chapters.push({
        num,
        title,
        content
      });
    }
  }
  
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
  
  // 4. content.opf (package document)
  const manifestItems = chapters.map(ch => 
    `    <item id="chapter${ch.num}" href="chapter${ch.num}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n');
  
  const spineItems = chapters.map(ch => 
    `    <itemref idref="chapter${ch.num}"/>`
  ).join('\n');
  
  oebps.file('content.opf',
`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uuid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uuid">${uuid}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="stylesheet" href="stylesheet.css" media-type="text/css"/>
${manifestItems}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>`);
  
  // 5. nav.xhtml (navigation document)
  const navItems = chapters.map(ch => 
    `        <li><a href="chapter${ch.num}.xhtml">Chapter ${ch.num}: ${ch.title}</a></li>`
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
  <title>Chapter ${ch.num}: ${markdownToHtml(ch.title)}</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  <h2>Chapter ${ch.num}: ${markdownToHtml(ch.title)}</h2>
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
  
  downloadBlob(blob, filename);
}

/**
 * Export book as PDF using browser's print functionality
 */
export function exportAsPdf(content: string, metadata: any): void {
  const title = extractBookTitle(content);
  const author = metadata?.author || 'Unknown Author';
  
  // Create a new window with the book content
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow pop-ups to export PDF');
    return;
  }
  
  // Remove the main title from content (we'll add it separately)
  let contentWithoutTitle = content.replace(/^#\s+.+$/m, '').trim();
  
  // Remove duplicate chapter titles (e.g., "## Chapter 2: Title\n\n## Title")
  contentWithoutTitle = contentWithoutTitle.replace(/^## Chapter (\d+): (.+?)\s*\n+## \2\s*$/gm, '## Chapter $1: $2');
  
  // Convert markdown to HTML
  const htmlContent = contentWithoutTitle
    // First protect scene breaks with a unique marker
    .replace(/^\s*\*\*\*\s*$/gm, '\n\n___SCENE_BREAK___\n\n')
    .replace(/^## Chapter (\d+): (.+)$/gm, '<h2 class="chapter-title">Chapter $1: $2</h2>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.+)$/gm, '<p>$1</p>')
    // Now restore scene breaks as proper divs
    .replace(/<p>___SCENE_BREAK___<\/p>/g, '<div class="scene-break">* * *</div>');
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title} - ${author}</title>
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
      <h1>${title}</h1>
      <div class="author">by ${author}</div>
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
