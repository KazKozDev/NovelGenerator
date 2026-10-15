export interface ManuscriptChapter { chapter: number; text: string }
const heading = /^[ \t]*(?:(?:#{1,6}[ \t]+|\*\*)(?:(?:Chapter|Глава)[ \t]+)?(\d+)|(?:Chapter|Глава)[ \t]+(\d+))(?:[ \t]*[:.—–-][ \t]*(.*?)|[ \t]+([^\r\n*]+))?(?:\*\*)?[ \t]*$/i;

/** Presentation owns chapter headings; the prose never owns a second copy. */
export function normalizeChapterBody(text: string, chapter: number): string {
  const lines = text.split(/\r?\n/);
  if (!lines.some(line => {
    const m = line.match(heading);
    return Number(m?.[1] || m?.[2]) === chapter;
  })) return text;
  return lines.filter(line => {
    const m = line.match(heading);
    return Number(m?.[1] || m?.[2]) !== chapter;
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
export function foreignChapterHeadings(text: string, chapter: number): number[] {
  return [...new Set(text.split(/\r?\n/).map(line => {
    const m = line.match(heading);
    return Number(m?.[1] || m?.[2]);
  }).filter(n => n && n !== chapter))];
}
export function assembleManuscript(chapters: ManuscriptChapter[], title?: string): string {
  return [title ? `# ${title}` : '', ...chapters.map(c => `## Chapter ${c.chapter}\n\n${normalizeChapterBody(c.text, c.chapter)}`)].filter(Boolean).join('\n\n');
}
export function parseBookChapters(content: string): { num: number; title: string; content: string }[] {
  const headingRegex = /^[ \t]*(?:(?:#{1,6}[ \t]+|\*\*)(?:(?:Chapter|Глава)[ \t]+)?(\d+)|(?:Chapter|Глава)[ \t]+(\d+))(?:[ \t]*[:.—–-][ \t]*(.*?)|[ \t]+([^\r\n*]+))?(?:\*\*)?[ \t]*$/gim;
  const markers = [...content.matchAll(headingRegex)];
  const chapters: { num: number; title: string; content: string }[] = [];
  for (let at = 0; at < markers.length; at++) {
    const match = markers[at];
    const num = Number(match[1] || match[2]);
    const rawTitle = (match[3] || match[4] || '').trim();
    const body = normalizeChapterBody(content.slice(match.index! + match[0].length, markers[at + 1]?.index ?? content.length), num).trim();
    const previous = chapters.at(-1);
    if (previous?.num === num) { previous.content = [previous.content, body].filter(Boolean).join('\n\n'); continue; }
    chapters.push({ num, title: rawTitle, content: body });
  }
  const filtered = chapters.filter(c => c.content.trim());
  if (filtered.length > 0) return filtered;

  const bodyWithoutTitle = content.replace(/^#[ \t]+[^\r\n]+(?:\r?\n)*/, '').trim();
  if (bodyWithoutTitle) {
    return [{ num: 1, title: '', content: bodyWithoutTitle }];
  }
  return [];
}
export const chapterLabel = (num: number, title = '') => title && !new RegExp(`^Chapter\\s+${num}$`, 'i').test(title) ? `Chapter ${num}: ${title}` : `Chapter ${num}`;

/** Migrate existing books without touching their fictional paragraphs or losing the source. */
export function repairStoredFormatting(store: import('./v2/store').ProjectStore): void {
  const source = store.manuscript();
  const normalized = source.map(c => ({ ...c, text: normalizeChapterBody(c.text, c.chapter) }));
  if (!normalized.some((c, i) => c.text !== source[i].text)) return;
  const draft = store.loadAuthor();
  if (draft?.desk) {
    draft.desk.files[`formatting-source-${Date.now()}.json`] = JSON.stringify({ chapters: source, report: store.loadReport() });
    for (const c of normalized) {
      draft.desk.files[`chapter-${c.chapter}.md`] = c.text;
      if (draft.chapters[c.chapter - 1]) draft.chapters[c.chapter - 1].text = c.text;
    }
    draft.desk.files['book.md'] = assembleManuscript(normalized);
    store.saveAuthor(draft);
  }
  for (const c of normalized) store.saveManuscript(c.chapter, c.text);
  store.log('formatting', 'Removed duplicate chapter labels; original manuscript and report preserved. Chapter numbers and prose retained.');
}
