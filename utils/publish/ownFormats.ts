import {
  buildEpub,
  buildPdfHtml,
  exportAsPdf,
  extractBookTitle,
  formatMarkdownWithMetadata,
  formatTextWithMetadata,
  sanitizeFilename,
} from '../exportUtils';
import { saveOrDownload, saveToBookFolder } from '../saveToBookFolder';

/** The app's own formats: for reading, editing and keeping, not for a store's upload form. An EPUB to read is any of
 * the store EPUBs on the Publish stage; 'epub' stays for the export menu outside the prompt workflow. */
export type OwnFormat = 'epub' | 'md' | 'txt' | 'pdf' | 'report';

export const OWN_FORMATS: { id: OwnFormat; name: string; note: string }[] = [
  { id: 'md', name: 'Markdown', note: '.md · to edit anywhere' },
  { id: 'txt', name: 'Plain text', note: '.txt · no formatting' },
  { id: 'pdf', name: 'Reading PDF', note: 'A4 · through the print dialog' },
  { id: 'report', name: 'Editorial report', note: '.json · checks and metadata' },
];

/** Saves one format into the book folder (or downloads it without the dev server); the path it went to, or null. */
export async function exportOwnFormat(format: OwnFormat, content: string, metadata: Record<string, unknown>, draft = false): Promise<string | null> {
  const rawTitle = (typeof metadata?.title === 'string' && metadata.title.trim()) || extractBookTitle(content) || 'Book';
  const filename = sanitizeFilename(rawTitle);
  const label = draft ? 'черновик' : 'книга';
  const file = (kind: 'manuscripts' | 'reports', what: string, ext: string, body: string | Blob) => ({ title: rawTitle, kind, label: what, ext, content: body });
  if (format === 'txt') return saveOrDownload(file('manuscripts', label, 'txt', formatTextWithMetadata(content, metadata)), `${filename}.txt`, 'text/plain;charset=utf-8');
  if (format === 'md') return saveOrDownload(file('manuscripts', label, 'md', formatMarkdownWithMetadata(content, metadata)), `${filename}.md`, 'text/markdown;charset=utf-8');
  if (format === 'report') return saveOrDownload(file('reports', 'редакторский отчёт', 'json', JSON.stringify(metadata, null, 2)), `${filename}-report.json`, 'application/json;charset=utf-8');
  if (format === 'pdf') {
    // The print window makes the PDF; the page it prints is kept in the book folder to print again.
    exportAsPdf(content, metadata);
    return saveToBookFolder(file('manuscripts', `${label} для печати`, 'html', buildPdfHtml(content, metadata)));
  }
  return saveOrDownload(file('manuscripts', label, 'epub', await buildEpub(content, metadata)), `${filename}.epub`);
}
