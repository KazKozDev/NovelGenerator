import { copyFile, mkdir, readdir, readFile, rename, rmdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * One folder per book in ~/Documents/NovelGenerator/<Book title>/: the fresh text and the autosave on top,
 * everything else in a subfolder by kind, with names a person can read and sort.
 */
export const BOOK_FOLDERS = {
  manuscripts: 'текст',
  covers: 'обложки',
  reports: 'отчёты',
  blueprints: 'план',
  backups: 'копии',
} as const;
export type BookStorageCategory = keyof typeof BOOK_FOLDERS;
export const UNTITLED_BOOK = 'Без названия';

// Folders of the earlier layout; their files move into the new subfolders the first time a book is saved.
const OLD_FOLDERS: Record<string, BookStorageCategory> = { manuscripts: 'manuscripts', covers: 'covers', reports: 'reports', blueprints: 'blueprints', backups: 'backups' };

/** "2026-10-17 14.49": sorts by name, reads as a date, and has no characters a file system refuses. */
export function formatStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}`;
}

/** A name safe on every system that still reads as written: spaces, Cyrillic, and case stay. */
export function safeName(raw: unknown, fallback = ''): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s*[/\\:|]\s*/g, ' - ')
    .replace(/[*?"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s-]+|[.\s]+$/g, '');
  return cleaned.slice(0, 80).trim() || fallback;
}

export function bookFolderName(title?: string): string {
  return safeName(title, UNTITLED_BOOK);
}

/** Where all books live: ~/Documents/NovelGenerator, or NOVEL_DOCUMENTS_DIR. */
export function getDocumentsRoot(customBase?: string): string {
  if (customBase) return path.resolve(customBase);
  if (process.env.NOVEL_DOCUMENTS_DIR) return path.resolve(process.env.NOVEL_DOCUMENTS_DIR);
  return path.join(os.homedir(), 'Documents', 'NovelGenerator');
}

export function getBookDirectory(title?: string, customBase?: string): string {
  return path.join(getDocumentsRoot(customBase), bookFolderName(title));
}

/** "<what> <date>.<ext>", or "<what>.<ext>" for a file that is replaced each time. */
export function bookFileName(label: string, ext: string, stamp: boolean | number = true): string {
  const when = stamp === false ? '' : ` ${formatStamp(typeof stamp === 'number' ? new Date(stamp) : new Date())}`;
  return `${safeName(label, 'файл')}${when}.${ext.replace(/^\./, '')}`;
}

/** The name itself, or "<name> (2)" and on when a file of that name is already there: a save never replaces another. */
function freeName(dir: string, fileName: string): string {
  if (!existsSync(path.join(dir, fileName))) return fileName;
  const dot = fileName.indexOf('.', Math.max(0, fileName.lastIndexOf(' ')));
  const [base, ext] = dot > 0 ? [fileName.slice(0, dot), fileName.slice(dot)] : [fileName, ''];
  for (let n = 2; ; n++) if (!existsSync(path.join(dir, `${base} (${n})${ext}`))) return `${base} (${n})${ext}`;
}

async function writeAtomic(fullPath: string, content: string | Buffer, mode?: number): Promise<void> {
  const tmp = `${fullPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, content, mode ? { mode } : undefined);
  await rename(tmp, fullPath);
}

// What the earlier names' middle parts meant, in the words the new names use.
const OLD_LABELS: [RegExp, string][] = [
  [/^manuscript_complete_print$/, 'книга для печати'],
  [/^manuscript_draft_print$/, 'черновик для печати'],
  [/^manuscript_(?:complete|latest)$/, 'книга'],
  [/^manuscript_draft$/, 'черновик'],
  [/^project_latest$/, 'автосейв до переезда'],
  [/^project_(?:backup|snapshot)$/, 'копия проекта'],
  [/^blueprint_latest$/, 'план книги до переезда'],
  [/^editorial_report(?:_latest)?$/, 'редакторский отчёт'],
  [/^chapter_(\d+)$/, 'глава $1'],
];

/** "The_Thursday_Room_manuscript_draft_2026-10-17_144958.md" → "черновик 2026-10-17 14.49.md"; other names stay. */
export function renameOldFile(name: string): string {
  const m = name.match(/^.*?_((?:manuscript|project|blueprint|editorial|chapter)_[a-z0-9_]*?)(?:_(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})\d{2})?\.([a-z.]+)$/i);
  if (!m) return name;
  const [, middle, day, hh, mm, ext] = m;
  const rule = OLD_LABELS.find(([pattern]) => pattern.test(middle));
  if (!rule) return name;
  return `${middle.replace(rule[0], rule[1])}${day ? ` ${day} ${hh}.${mm}` : ''}.${ext}`;
}

/** Moves files of the earlier layout (manuscripts/, backups/, ...) into the new subfolders with readable names, once. */
async function moveOldLayout(bookDir: string): Promise<void> {
  for (const [old, category] of Object.entries(OLD_FOLDERS)) {
    const from = path.join(bookDir, old);
    let names: string[];
    try { names = await readdir(from); } catch { continue; }
    const to = path.join(bookDir, BOOK_FOLDERS[category]);
    if (names.length) await mkdir(to, { recursive: true });
    for (const name of names) await rename(path.join(from, name), path.join(to, freeName(to, renameOldFile(name))));
    await rmdir(from).catch(() => undefined);
  }
}

// Book folders already brought to the new layout by this process.
const tidied = new Set<string>();

/** Renames files a first move left with their earlier names. */
async function renameMovedFiles(bookDir: string): Promise<void> {
  for (const folder of Object.values(BOOK_FOLDERS)) {
    const dir = path.join(bookDir, folder);
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      const renamed = renameOldFile(name);
      if (renamed !== name) await rename(path.join(dir, name), path.join(dir, freeName(dir, renamed)));
    }
  }
}

/** The folder name the earlier layout gave a title ("The_Thursday_Room"). */
function oldFolderName(title?: string): string {
  const cleaned = String(title || '').replace(/[:|/\\]/g, ' - ').replace(/[?*"<>#%!@^&*+`~]/g, '').trim()
    .replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^[-_.]+|[-_.]+$/g, '');
  return cleaned.slice(0, 80) || 'Untitled_Book';
}

/** The book folder, and the subfolder for a kind of file when one is given. Made on first use only. */
export async function ensureBookFolder(title?: string, category?: BookStorageCategory, customBase?: string): Promise<{ bookDir: string; dir: string }> {
  const bookDir = getBookDirectory(title, customBase);
  const oldDir = path.join(getDocumentsRoot(customBase), oldFolderName(title));
  if (oldDir !== bookDir && existsSync(oldDir) && !existsSync(bookDir)) await rename(oldDir, bookDir);
  await mkdir(bookDir, { recursive: true });
  if (!tidied.has(bookDir)) {
    await moveOldLayout(bookDir);
    await renameMovedFiles(bookDir);
    tidied.add(bookDir);
  }
  const dir = category ? path.join(bookDir, BOOK_FOLDERS[category]) : bookDir;
  await mkdir(dir, { recursive: true });
  return { bookDir, dir };
}

/** Saves one file a person asked for (a Save button) into its book's subfolder. */
export async function saveBookFile(params: {
  title: string;
  category: BookStorageCategory;
  label: string;
  content: string | Buffer;
  ext?: string;
  stamp?: boolean | number;
  /** Replace a file of the same name: for a file the app keeps in step with one thing, such as a master picture. */
  replace?: boolean;
  customBase?: string;
}): Promise<{ fullPath: string; fileName: string; relativePath: string }> {
  const { title, category, label, content, ext = 'md', stamp = true, replace = false, customBase } = params;
  const { dir } = await ensureBookFolder(title, category, customBase);
  const name = bookFileName(label, ext, stamp);
  const fileName = replace ? name : freeName(dir, name);
  const fullPath = path.join(dir, fileName);
  await writeAtomic(fullPath, content);
  return { fullPath, fileName, relativePath: path.relative(path.dirname(getDocumentsRoot(customBase)), fullPath) };
}

/** The book's title in a project snapshot. */
export function extractTitleFromSnapshot(snapshot: any): string {
  const files = snapshot?.files;
  const candidates = [files?.input?.title, files?.author_draft?.title, files?.author_draft?.promptPlanning?.blueprint?.title, files?.author_draft?.promptPlanning?.story?.title];
  const title = candidates.find(t => typeof t === 'string' && t.trim());
  // A book without a title stays in "Без названия" until it gets one, not in a folder named after its premise.
  return title ? title.trim() : UNTITLED_BOOK;
}

/** The chapters of a snapshot: the written manuscript, or the Prompt Book's story when the manuscript is empty. */
export function snapshotChapters(snapshot: any): { chapter: number; title: string; text: string }[] {
  const files = snapshot?.files;
  const manuscript = Array.isArray(files?.manuscript) ? files.manuscript : [];
  const story = files?.author_draft?.promptPlanning?.story?.chapters;
  const source = manuscript.some((c: any) => typeof c?.text === 'string' && c.text.trim()) ? manuscript : Array.isArray(story) ? story : [];
  const prompts = files?.author_draft?.promptPlanning?.prompts;
  const titleOf = (n: number) => (Array.isArray(prompts) ? prompts.find((p: any) => p?.chapter === n)?.title : undefined);
  return source
    .filter((c: any) => Number.isInteger(c?.chapter) && typeof c?.text === 'string' && c.text.trim())
    .map((c: any) => ({ chapter: c.chapter, title: typeof c.title === 'string' && c.title.trim() ? c.title.trim() : titleOf(c.chapter) || '', text: c.text.trim() }))
    .sort((a: any, b: any) => a.chapter - b.chapter);
}

const AUTOSAVE_EXT = 'project.json';
const autosaveName = (title: string) => `${bookFolderName(title)}.${AUTOSAVE_EXT}`;

/**
 * The autosave of a project: "<Book>.project.json" and "<Book>.md" on top of the book folder, each chapter in текст/,
 * the editorial report in отчёты/, the plan in план/. A copy goes to копии/ before the autosave is replaced by
 * another book of the same title, or when the file there cannot be read.
 */
export async function saveProjectSnapshotToStorage(snapshot: any, options: { customBase?: string } = {}): Promise<{ savedAt: number; bookDir: string; mainBackupPath: string }> {
  const { customBase } = options;
  const title = extractTitleFromSnapshot(snapshot);
  const { bookDir } = await ensureBookFolder(title, undefined, customBase);
  const autosave = path.join(bookDir, autosaveName(title));
  const now = Date.now();

  let previous: any;
  try { previous = JSON.parse(await readFile(autosave, 'utf8')); } catch (error: any) {
    if (error instanceof SyntaxError) {
      const { dir } = await ensureBookFolder(title, 'backups', customBase);
      await copyFile(autosave, path.join(dir, freeName(dir, bookFileName('повреждённый автосейв', AUTOSAVE_EXT, now))));
    } else if (error?.code !== 'ENOENT') throw error;
  }
  if (previous?.files?.input && JSON.stringify(previous.files.input) !== JSON.stringify(snapshot?.files?.input)) {
    const { dir } = await ensureBookFolder(title, 'backups', customBase);
    await copyFile(autosave, path.join(dir, freeName(dir, bookFileName('перед новой книгой', AUTOSAVE_EXT, now))));
  }
  await writeAtomic(autosave, JSON.stringify(snapshot), 0o600);

  const chapters = snapshotChapters(snapshot);
  if (chapters.length) {
    const heading = (c: { chapter: number; title: string }) => `## Chapter ${c.chapter}${c.title ? `: ${c.title}` : ''}`;
    await writeAtomic(path.join(bookDir, `${bookFolderName(title)}.md`), `# ${title}\n\n${chapters.map(c => `${heading(c)}\n\n${c.text}`).join('\n\n\n')}\n`);
    const { dir } = await ensureBookFolder(title, 'manuscripts', customBase);
    for (const c of chapters) {
      const name = `глава ${String(c.chapter).padStart(2, '0')}${c.title ? ` — ${safeName(c.title)}` : ''}.md`;
      await writeAtomic(path.join(dir, name), `${heading(c)}\n\n${c.text}\n`);
    }
  }
  if (snapshot?.files?.final_report) {
    const { dir } = await ensureBookFolder(title, 'reports', customBase);
    await writeAtomic(path.join(dir, 'редакторский отчёт.json'), JSON.stringify(snapshot.files.final_report, null, 2));
  }
  const plan = snapshot?.files?.author_draft?.promptPlanning?.blueprint || snapshot?.files?.input;
  if (plan) {
    const { dir } = await ensureBookFolder(title, 'blueprints', customBase);
    await writeAtomic(path.join(dir, 'план книги.json'), JSON.stringify(plan, null, 2));
  }
  return { savedAt: now, bookDir, mainBackupPath: autosave };
}

async function newestFirst(files: string[]): Promise<string[]> {
  const dated = await Promise.all(files.map(async file => ({ file, at: (await stat(file).catch(() => null))?.mtimeMs ?? 0 })));
  return dated.sort((a, b) => b.at - a.at).map(d => d.file);
}

async function bookFolders(customBase?: string): Promise<string[]> {
  const root = getDocumentsRoot(customBase);
  try { return (await readdir(root, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => path.join(root, d.name)); } catch { return []; }
}

/** Every book's autosave, newest first. */
export async function listAutosaves(customBase?: string): Promise<string[]> {
  const found: string[] = [];
  for (const dir of await bookFolders(customBase)) {
    for (const name of await readdir(dir).catch(() => [] as string[])) if (name.endsWith(`.${AUTOSAVE_EXT}`)) found.push(path.join(dir, name));
  }
  return newestFirst(found);
}

/** Copies kept in every book's копии/, newest first. */
export async function listRecoveryCopies(customBase?: string, most = 5): Promise<string[]> {
  const found: string[] = [];
  for (const dir of await bookFolders(customBase)) {
    const copies = path.join(dir, BOOK_FOLDERS.backups);
    for (const name of await readdir(copies).catch(() => [] as string[])) if (name.endsWith(`.${AUTOSAVE_EXT}`)) found.push(path.join(copies, name));
  }
  return (await newestFirst(found)).slice(0, most);
}

/** The newest autosave across all books. */
export async function findLatestProjectSnapshot(customBase?: string): Promise<{ snapshot: any; path: string } | null> {
  const [newest] = await listAutosaves(customBase);
  if (!newest) return null;
  return { snapshot: JSON.parse(await readFile(newest, 'utf8')), path: newest };
}
