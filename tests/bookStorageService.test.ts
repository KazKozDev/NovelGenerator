import { describe, expect, it, afterEach } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  bookFileName,
  bookFolderName,
  formatStamp,
  saveBookFile,
  saveProjectSnapshotToStorage,
  findLatestProjectSnapshot,
  listRecoveryCopies,
  renameOldFile,
} from '../services/bookStorageService';

const snapshot = (title: string, premise = 'Путешественник во времени спасает мир.') => ({
  version: 1,
  exportedAt: new Date().toISOString(),
  files: {
    input: { title, premise, chapter_count: 2 },
    manuscript: [
      { chapter: 1, text: 'Первая глава началась.' },
      { chapter: 2, text: 'Вторая глава завершилась.' },
    ],
    final_report: { status: 'CLEAN' },
    author_draft: { promptPlanning: { blueprint: { title, overview: 'План книги' } } },
  },
});

describe('bookStorageService', () => {
  let base: string | null = null;
  afterEach(async () => { if (base) await rm(base, { recursive: true, force: true }); base = null; });

  it('names folders and files the way a person reads them', () => {
    expect(bookFolderName('Война и Мир: Том 1')).toBe('Война и Мир - Том 1');
    expect(bookFolderName('Shadows / Part 2?')).toBe('Shadows - Part 2');
    expect(bookFolderName('???')).toBe('Без названия');
    expect(bookFolderName('')).toBe('Без названия');
    const at = new Date(2026, 9, 17, 14, 49).getTime();
    expect(formatStamp(new Date(at))).toBe('2026-10-17 14.49');
    expect(bookFileName('черновик', 'md', at)).toBe('черновик 2026-10-17 14.49.md');
    expect(bookFileName('план книги', 'json', false)).toBe('план книги.json');
  });

  it('saves a file into its kind of subfolder and never replaces another of the same name', async () => {
    base = await mkdtemp(path.join(tmpdir(), 'novel-storage-'));
    const first = await saveBookFile({ title: 'Chronicles of Solitude', category: 'manuscripts', label: 'книга', content: '# One', ext: 'md', stamp: false, customBase: base });
    const second = await saveBookFile({ title: 'Chronicles of Solitude', category: 'manuscripts', label: 'книга', content: '# Two', ext: 'md', stamp: false, customBase: base });
    expect(first.fullPath).toBe(path.join(base, 'Chronicles of Solitude', 'текст', 'книга.md'));
    expect(second.fileName).toBe('книга (2).md');
    expect(await readFile(first.fullPath, 'utf8')).toBe('# One');
    expect(first.relativePath).toBe(path.join(path.basename(base), 'Chronicles of Solitude', 'текст', 'книга.md'));
  });

  it('replaces a file of the same name when asked, for files kept in step with one thing', async () => {
    base = await mkdtemp(path.join(tmpdir(), 'novel-storage-'));
    const save = (content: string) => saveBookFile({ title: 'Остров', category: 'covers', label: 'мастер 2026-10-17 15.40.07', content, ext: 'png', stamp: false, replace: true, customBase: base! });
    await save('first');
    const second = await save('enhanced');
    expect(await readdir(path.join(base, 'Остров', 'обложки'))).toEqual(['мастер 2026-10-17 15.40.07.png']);
    expect(await readFile(second.fullPath, 'utf8')).toBe('enhanced');
  });

  it('autosaves the project and its text into the book folder, and finds it again', async () => {
    base = await mkdtemp(path.join(tmpdir(), 'novel-storage-'));
    await saveProjectSnapshotToStorage(snapshot('Властелин Времени'), { customBase: base });
    const bookDir = path.join(base, 'Властелин Времени');
    expect((await readdir(bookDir)).sort()).toEqual(['Властелин Времени.md', 'Властелин Времени.project.json', 'отчёты', 'план', 'текст']);
    expect(await readdir(path.join(bookDir, 'текст'))).toEqual(['глава 01.md', 'глава 02.md']);
    expect(await readFile(path.join(bookDir, 'Властелин Времени.md'), 'utf8')).toContain('## Chapter 2\n\nВторая глава завершилась.');
    expect(await readdir(path.join(bookDir, 'отчёты'))).toEqual(['редакторский отчёт.json']);
    expect(await readdir(path.join(bookDir, 'план'))).toEqual(['план книги.json']);
    expect((await findLatestProjectSnapshot(base))?.snapshot.files.input.title).toBe('Властелин Времени');
  });

  it('writes the Prompt Book story with chapter titles when the manuscript is empty', async () => {
    base = await mkdtemp(path.join(tmpdir(), 'novel-storage-'));
    const book = { version: 1, exportedAt: new Date().toISOString(), files: { input: null, manuscript: [], author_draft: { title: 'The Thursday Room', promptPlanning: { story: { chapters: [{ chapter: 1, title: 'No Names', text: 'Room 412 held the heat.' }] } } } } };
    await saveProjectSnapshotToStorage(book, { customBase: base });
    expect(await readdir(path.join(base, 'The Thursday Room', 'текст'))).toEqual(['глава 01 — No Names.md']);
    expect(await readFile(path.join(base, 'The Thursday Room', 'The Thursday Room.md'), 'utf8')).toContain('## Chapter 1: No Names');
  });

  it('keeps a copy before another book of the same title replaces the autosave', async () => {
    base = await mkdtemp(path.join(tmpdir(), 'novel-storage-'));
    await saveProjectSnapshotToStorage(snapshot('Остров', 'Первая версия'), { customBase: base });
    await saveProjectSnapshotToStorage(snapshot('Остров', 'Первая версия'), { customBase: base });
    expect(await listRecoveryCopies(base)).toEqual([]);
    await saveProjectSnapshotToStorage(snapshot('Остров', 'Совсем другая книга'), { customBase: base });
    const [copy] = await listRecoveryCopies(base);
    expect(path.basename(copy)).toMatch(/^перед новой книгой \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.project\.json$/);
    expect(JSON.parse(await readFile(copy, 'utf8')).files.input.premise).toBe('Первая версия');
  });

  it('turns the earlier names into readable ones', () => {
    expect(renameOldFile('The_Thursday_Room_project_latest.project.json')).toBe('автосейв до переезда.project.json');
    expect(renameOldFile('Мастер_и_Маргарита_manuscript_draft_2026-10-17_143005.epub')).toBe('черновик 2026-10-17 14.30.epub');
    expect(renameOldFile('Book_chapter_03.md')).toBe('глава 03.md');
    expect(renameOldFile('глава 01 — No Names.md')).toBe('глава 01 — No Names.md');
  });

  it('moves a book saved in the earlier layout into the new one', async () => {
    base = await mkdtemp(path.join(tmpdir(), 'novel-storage-'));
    await mkdir(path.join(base, 'The_Thursday_Room', 'manuscripts'), { recursive: true });
    await writeFile(path.join(base, 'The_Thursday_Room', 'manuscripts', 'The_Thursday_Room_manuscript_complete_print_2026-10-17_144958.md'), 'old');
    await mkdir(path.join(base, 'The_Thursday_Room', 'reports'));
    await saveBookFile({ title: 'The Thursday Room', category: 'covers', label: 'обложка', content: 'x', ext: 'jpg', stamp: false, customBase: base });
    expect((await readdir(base))).toEqual(['The Thursday Room']);
    expect(await readdir(path.join(base, 'The Thursday Room', 'текст'))).toEqual(['книга для печати 2026-10-17 14.49.md']);
    expect((await readdir(path.join(base, 'The Thursday Room'))).sort()).toEqual(['обложки', 'текст']);
  });
});
