import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FolderProjectStore } from '../mcp/folderStore';
import { NovelDesk } from '../mcp/novelDesk';
import { modelsFromEnv } from '../mcp/nodeLlm';
import { savePromptBook } from '../utils/novel/promptBook';
import { saveProjectSnapshotToStorage } from '../services/bookStorageService';
import { snapshotProject } from '../utils/novel/v2/export';
import type { NovelLLM } from '../utils/novel/v2/llm';

const prose = (n: number) => `Scene ${n}. ` + 'A person makes a decision and pays the cost. '.repeat(30);
let base = '';
beforeEach(async () => { base = await mkdtemp(path.join(tmpdir(), 'novel-mcp-')); });
afterEach(async () => { await rm(base, { recursive: true, force: true }); });

/** A desk on a book whose prompts are ready, as plan_book leaves it. */
async function readyDesk(llm: NovelLLM) {
  const store = new FolderProjectStore(base);
  const desk = new NovelDesk(store, () => llm);
  const book = desk.newBook({ premise: 'A missing key', chapters: 3, title: 'The Key' });
  book.phase = 'ready';
  book.prompts = [1, 2, 3].map(chapter => ({ chapter, title: `C${chapter}`, system: 'Write English prose only.', prompt: `Chapter ${chapter} prompt.`, sourceRevision: book.revision }));
  savePromptBook(store, book);
  await store.flush();
  return { store, desk };
}

it('keeps the book in its folder: a second server, like the app, reads what the first one wrote', async () => {
  const { store } = await readyDesk(vi.fn());
  expect(store.path?.startsWith(base)).toBe(true);
  const other = new FolderProjectStore(base);
  await other.open();
  expect(other.loadAuthor()?.promptPlanning?.prompts).toHaveLength(3);
  expect(other.loadInput()?.title).toBe('The Key');
});

it('runs a model stage in the background, reports it done and saves the story to the folder', async () => {
  const llm = vi.fn(async (prompt: string) => prose(Number(prompt.match(/Chapter (\d)/)?.[1] || 1)));
  const { desk } = await readyDesk(llm as NovelLLM);
  const job = desk.writeStory();
  expect(job.status).toBe('running');
  expect(() => desk.setStage('cover')).toThrow('still running');
  await desk.wait(5);
  expect(desk.job?.status).toBe('done');
  const reader = new FolderProjectStore(base);
  await reader.open();
  expect(reader.loadAuthor()?.promptPlanning?.story?.chapters).toHaveLength(3);
  expect(desk.status().next).toContain('edit the manuscript');
});

it('replaces one exact passage of one chapter and refuses an ambiguous or missing one', async () => {
  const { desk, store } = await readyDesk(vi.fn(async () => prose(1)) as NovelLLM);
  desk.writeStory(); await desk.wait(5);
  expect(() => desk.editChapter(2, 'makes a decision', 'x')).toThrow('more than once');
  expect(() => desk.editChapter(2, 'not in the book', 'x')).toThrow('not in this chapter');
  desk.editChapter(2, 'Scene 1. A person', 'Scene 2. A stranger');
  expect(desk.manuscript(2)).toContain('A stranger makes a decision');
  expect(desk.manuscript(1)).not.toContain('stranger');
  expect(store.loadAuthor()?.promptPlanning?.storyEdits).toHaveLength(1);
});

it('sees what the person changed in the app before the next tool call', async () => {
  const { desk, store } = await readyDesk(vi.fn());
  const app = new FolderProjectStore(base);
  await app.open();
  const book = app.loadAuthor()!.promptPlanning!;
  book.prompts[0] = { ...book.prompts[0], prompt: 'Edited in the app.', edited: true };
  savePromptBook(app, book);
  await saveProjectSnapshotToStorage(snapshotProject(app), { customBase: base });
  await desk.sync();
  expect(desk.prompts(1)[0].prompt).toBe('Edited in the app.');
  expect(store.path).toBe(app.path);
});

it('stops a running stage and keeps what it finished', async () => {
  let release!: () => void;
  const llm = vi.fn().mockResolvedValueOnce(prose(1)).mockImplementationOnce(() => new Promise<string>(resolve => { release = () => resolve(prose(2)); }));
  const { desk, store } = await readyDesk(llm as NovelLLM);
  desk.writeStory();
  await vi.waitFor(() => expect(llm).toHaveBeenCalledTimes(2));
  expect(desk.stop()?.status).toBe('stopped');
  release();
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(store.loadAuthor()?.promptPlanning?.story?.chapters).toHaveLength(1);
});

it('takes the writer and the editor from the environment', () => {
  expect(modelsFromEnv({}).writer.provider).toBe('anthropic');
  expect(modelsFromEnv({ NOVEL_PROVIDER: 'ollama', NOVEL_MODEL: 'llama3.1', NOVEL_VALIDATOR_MODEL: 'claude-haiku-5-5' })).toEqual({
    writer: { provider: 'ollama', model: 'llama3.1' }, validator: { provider: 'anthropic', model: 'claude-haiku-5-5' },
  });
  expect(() => modelsFromEnv({ NOVEL_PROVIDER: 'ollama' })).toThrow('Name the ollama model');
  expect(() => modelsFromEnv({ NOVEL_PROVIDER: 'gemini', NOVEL_MODEL: 'x' })).toThrow('Unknown provider');
});

/** What the app writes when the person works: the project autosave and, beside it, the workspace state. */
async function appSaves(change: (book: NonNullable<ReturnType<FolderProjectStore['loadAuthor']>>['promptPlanning'] & object) => void, workspace?: object) {
  const app = new FolderProjectStore(base);
  await app.open();
  const book = app.loadAuthor()!.promptPlanning!;
  change(book);
  savePromptBook(app, book);
  await saveProjectSnapshotToStorage(snapshotProject(app), { customBase: base });
  if (workspace) {
    const dir = path.join(path.dirname(app.path!), 'план');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'рабочее состояние.json'), JSON.stringify({ version: 1, savedAt: Date.now(), entries: workspace }));
  }
}

it('tells the agent what the person did in the app, by whom, and never its own changes', async () => {
  const { desk } = await readyDesk(vi.fn());
  await desk.sync();
  desk.setPrompt(2, 'Write English prose only.', 'Agent rewrote this.');
  await desk.wrote('set_prompt 2');
  await desk.sync();
  expect(desk.headsUp()).toBeNull();
  await appSaves(book => { book.prompts[0] = { ...book.prompts[0], prompt: 'The person rewrote this.', edited: true }; book.workspaceStage = 'story'; });
  await desk.sync();
  expect(desk.headsUp()).toContain('[person] The prompt of chapter 1 changed by hand');
  const news = await desk.whatsNew();
  expect(news.changes.map(c => `${c.who}: ${c.what}`)).toEqual(['person: Switched the app to the story tab', 'person: The prompt of chapter 1 changed by hand']);
  expect(news.attention.map(a => a.level)).toContain('wait');
  expect(desk.headsUp()).toBeNull();
  expect(desk.activity().some(e => e.who === 'agent' && e.what.includes('set_prompt 2'))).toBe(true);
});

it('reads the editorial chat, flags an unanswered message and an unsaved draft, and will not overwrite the draft', async () => {
  const { desk } = await readyDesk(vi.fn());
  await desk.sync();
  const chat = { messages: [
    { id: 'a', role: 'user', text: 'Is chapter 2 too slow?', timestamp: 1 },
    { id: 'b', role: 'assistant', text: 'Yes: the middle repeats.', timestamp: 2, problems: [{ id: 'p', title: 'Repeated argument', places: ['2:4'], ways: [] }] },
    { id: 'c', role: 'user', text: 'Then cut it, but keep the letter.', timestamp: 3 },
  ] };
  await appSaves(() => {}, { chat: { value: chat }, 'prompt:3': { value: ['s', 'p'], base: 'x' } });
  await desk.sync();
  const news = await desk.whatsNew();
  expect(news.changes.filter(c => c.what === 'Said in the editorial chat').map(c => c.detail)).toEqual(['Is chapter 2 too slow?', 'Then cut it, but keep the letter.']);
  expect(news.changes.find(c => c.who === 'app-editor')?.what).toContain('Repeated argument');
  expect(news.changes.some(c => c.what === 'Started editing the prompt of chapter 3 (not saved yet)')).toBe(true);
  expect(news.attention.find(a => a.level === 'suggest')?.why).toContain('no answer');
  expect(news.attention.find(a => a.level === 'wait')?.why).toContain('the prompt of chapter 3');
  expect(() => desk.setPrompt(3, 'sys', 'mine')).toThrow('has not saved it');
  expect(() => desk.setPrompt(3, 'sys', 'mine', true)).not.toThrow();
  const read = await desk.editorialChat();
  expect(read.messages.map(m => m.who)).toEqual(['person', 'app-editor', 'person']);
});

it('watch returns as soon as the app changes the book', async () => {
  const { desk } = await readyDesk(vi.fn());
  await desk.sync();
  const watching = desk.watch(30);
  await new Promise(resolve => setTimeout(resolve, 300));
  await appSaves(book => { book.prompts[1] = { ...book.prompts[1], prompt: 'Changed while watched.', edited: true }; });
  const result = await watching;
  expect(result.timedOut).toBe(false);
  expect(result.changes.map(c => c.what)).toContain('The prompt of chapter 2 changed by hand');
}, 20_000);

it('sees errors on the app screen once, and waits while the person types', async () => {
  const { desk } = await readyDesk(vi.fn());
  await desk.sync();
  const screen = (errors: string[], focus?: object) => writeFile(path.join(base, '.screen.json'), JSON.stringify({ version: 1, at: new Date().toISOString(), url: '/', visible: true, viewport: { width: 1, height: 1 }, text: '', dialogs: [], errors, busy: [], settings: {}, ...(focus ? { focus } : {}) }));
  await screen(['Error: Anthropic request failed [400]: limit reached']);
  await desk.sync();
  const news = await desk.whatsNew();
  expect(news.changes).toEqual([expect.objectContaining({ who: 'app', what: 'An error is shown on the app screen', detail: 'Error: Anthropic request failed [400]: limit reached' })]);
  expect(news.attention.find(a => a.level === 'warn')?.why).toContain('limit reached');
  await desk.sync();
  expect((await desk.whatsNew()).changes).toEqual([]);
  await screen([], { what: 'textarea "Ask editor"', value: 'Is chapter 3' });
  await desk.sync();
  expect((await desk.whatsNew()).attention.find(a => a.level === 'wait')?.why).toContain('typing in textarea "Ask editor"');
});

it('lists and reads the book folder, and nothing outside it', async () => {
  const { store } = await readyDesk(vi.fn());
  const { listBookFiles, readBookFolderFile } = await import('../mcp/screen');
  const dir = path.dirname(store.path!);
  const files = await listBookFiles(dir);
  expect(files.map(f => f.path)).toContain(path.basename(store.path!));
  expect('text' in await readBookFolderFile(dir, path.basename(store.path!))).toBe(true);
  await expect(readBookFolderFile(dir, '../../.screen.json')).rejects.toThrow('inside the book');
});

it('keeps secrets and pictures out of the settings the agent sees', async () => {
  const { browserSettings } = await import('../utils/screenReport');
  const entries: Record<string, string> = {
    novelGenerator_llm_config: JSON.stringify({ provider: 'anthropic', anthropicModel: 'claude-opus-5-5', apiKey: 'sk-secret' }),
    novelGenerator_api_token: 'sk-other', novel_author_name: 'Artem', novel_cover_image: 'data:image/png;base64,AAAA', unrelated: 'x',
  };
  const keys = Object.keys(entries);
  const seen = browserSettings({ length: keys.length, key: i => keys[i], getItem: k => entries[k] });
  expect(seen).toEqual({ novelGenerator_llm_config: { provider: 'anthropic', anthropicModel: 'claude-opus-5-5' }, novel_author_name: 'Artem' });
});
