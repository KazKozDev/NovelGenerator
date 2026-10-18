import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { BOOK_FOLDERS, listAutosaves } from '../services/bookStorageService';
import { snapshotProject } from '../utils/novel/v2/export';
import { attention, describeChanges, WORKSPACE_FILE, type BookView, type Change, type WorkspaceState } from './activity';
import { readScreenState } from './screen';
import { screenStateFile } from '../services/screenStatePlugin';
import { buildProjectInput, DEFAULT_GENERATION_SETTINGS } from '../utils/generationSettings';
import { editBlueprint, editChapterPrompt, generatePromptBook, initializePromptBook, type BookBlueprint, type PromptBook } from '../utils/novel/promptBook';
import { fixPromptIssue, promptsReady, storyIsCurrent, writePromptStory } from '../utils/novel/promptBook/actions';
import { canEditPromptStory, promptStoryContent, savePromptStoryManuscript, setPromptWorkspaceStage, type PromptWorkspaceStage } from '../utils/novel/promptBook/editing';
import { checkPromptConsistency, reviewIsCurrent } from '../utils/novel/promptBook/review';
import { prepareWritingStyle, saveWritingStyle } from '../utils/novel/promptBook/style';
import type { NovelLLM } from '../utils/novel/v2/llm';
import type { ProjectInput } from '../utils/novel/v2/types';
import type { StorySettings } from '../types';
import type { FolderProjectStore } from './folderStore';

export interface Job {
  id: number;
  stage: string;
  status: 'running' | 'done' | 'failed' | 'stopped';
  startedAt: string;
  finishedAt?: string;
  chapter?: number;
  error?: string;
}

/**
 * The app's stages, each one a step an agent can take: the same functions the page calls, on the same
 * book in the same folder. A stage that asks a model runs in the background, one at a time; the agent
 * asks for the status to see it finish. Reading and editing wait for nothing.
 */
export class NovelDesk {
  job: Job | null = null;
  private jobs = 0;
  private epoch = 0;
  private done: Promise<void> = Promise.resolve();
  /** The book as the agent last saw it, and what happened in the app since that it has not been told. */
  private seen: BookView | null = null;
  private unseen: Change[] = [];
  /** Errors the app's screen showed when the agent last looked: a new one is news, the same one is not. */
  private screenErrors: string[] = [];

  constructor(readonly store: FolderProjectStore, private readonly makeLlm: (active: () => void) => NovelLLM) {}

  private get running(): boolean { return this.job?.status === 'running'; }

  private book(): PromptBook {
    const book = this.store.loadAuthor()?.promptPlanning;
    if (!book) throw new Error(this.store.loadInput() ? 'This book was made before the prompt workflow; the agent tools work with prompt books. Start one with new_book.' : 'No book is open. Start one with new_book, or open one with list_books and open_book.');
    return book;
  }

  private workspaceFile(): string | null {
    return this.store.path ? path.join(path.dirname(this.store.path), BOOK_FOLDERS.blueprints, WORKSPACE_FILE) : null;
  }

  private async workspace(): Promise<WorkspaceState | null> {
    const file = this.workspaceFile();
    if (!file) return null;
    try { const raw = JSON.parse(await readFile(file, 'utf8')); return raw?.version === 1 && raw.entries ? raw : null; } catch { return null; }
  }

  async view(): Promise<BookView> {
    const files = snapshotProject(this.store).files;
    return { project: files.input ? files as BookView['project'] : null, workspace: await this.workspace() };
  }

  /**
   * Read the book again and note what happened in the app since the agent last looked. While a stage of
   * ours is writing the book it is not read back: the stage's copy is the newer one.
   */
  async sync(): Promise<void> {
    if (this.running) return;
    await this.store.open(this.store.path || undefined);
    const now = await this.view();
    // A change found in the folder is dated when it was found, unless it carries its own time.
    if (this.seen) this.unseen.push(...describeChanges(this.seen, now).map(c => (c.at ? c : { ...c, at: new Date().toISOString() })));
    this.seen = now;
    await this.noteScreen();
  }

  /** An error the app's screen shows now that it did not show before. A description older than ten minutes is not the screen any more. */
  private async noteScreen(): Promise<void> {
    const screen = await readScreenState(this.store.customBase);
    const errors = screen && screen.ageSeconds < 600 ? screen.errors : [];
    for (const error of errors.filter(e => !this.screenErrors.includes(e))) this.unseen.push({ who: 'app', what: 'An error is shown on the app screen', detail: error, at: screen!.at });
    this.screenErrors = errors;
  }

  /** The agent's own change: written to the app's log under "agent", saved, and known without being reported back. */
  async wrote(action: string): Promise<void> {
    this.store.log('agent', action);
    await this.store.flush();
    this.seen = await this.view();
  }

  /** What happened in the app since the agent last asked, and whether this is a moment to speak up. */
  async whatsNew(): Promise<{ changes: Change[]; attention: ReturnType<typeof attention> }> {
    const changes = this.unseen.splice(0);
    return { changes, attention: this.seen ? attention(this.seen, changes, Date.now(), await readScreenState(this.store.customBase)) : [] };
  }

  /** A line for every tool's answer while something in the app is still untold. */
  headsUp(): string | null {
    if (!this.unseen.length) return null;
    return `Since your last look, in the app: ${this.unseen.map(c => `[${c.who}] ${c.what}`).join('; ')}. Call whats_new for the details.`;
  }

  /** Wait until something changes in the app, a stage of ours finishes, or `seconds` pass. */
  async watch(seconds: number): Promise<Awaited<ReturnType<NovelDesk['whatsNew']>> & { timedOut: boolean }> {
    const stamp = async () => (await Promise.all([this.store.path, this.workspaceFile(), screenStateFile(this.store.customBase)].map(file => (file ? stat(file).then(s => s.mtimeMs, () => 0) : 0)))).join(':');
    const until = Date.now() + Math.min(Math.max(seconds, 1), 600) * 1000;
    const wasRunning = this.running;
    let before = await stamp();
    while (Date.now() < until && !this.unseen.length) {
      if (wasRunning && !this.running) break;
      await new Promise(resolve => setTimeout(resolve, 2000));
      const after = await stamp();
      if (after === before) continue;
      // Let a burst of saves settle before reading: a person types, a run logs call after call.
      await new Promise(resolve => setTimeout(resolve, 2000));
      before = await stamp();
      await this.sync();
    }
    const timedOut = !this.unseen.length && !(wasRunning && !this.running);
    return { ...(await this.whatsNew()), timedOut };
  }

  /** The person's unsaved edit of the same thing comes first, unless they asked the agent to go ahead. */
  private guardDraft(key: string, force?: boolean): void {
    if (force || !this.seen?.workspace?.entries[key]) return;
    const name = key === 'outline' ? 'the outline' : key === 'style' ? 'the writing style' : `the prompt of chapter ${key.slice(7)}`;
    throw new Error(`The person is editing ${name} in the app and has not saved it. Ask them first; pass force: true only if they told you to replace it.`);
  }

  /** The editorial chat in the app: who said what, and where its proposed edits stand. */
  async editorialChat(last = 20) {
    const chat = (this.seen?.workspace?.entries.chat?.value || null) as { messages?: { role: string; text: string; timestamp: number; problems?: { title: string; places: string[] }[]; diffCards?: unknown[] }[]; statuses?: Record<string, string>; applied?: string[]; rejected?: string[] } | null;
    if (!chat?.messages?.length) return { messages: [], note: 'Nothing has been said in the editorial chat of this book.' };
    const statuses = Object.values(chat.statuses || {});
    return {
      messages: chat.messages.slice(-Math.max(1, last)).map(m => ({ who: m.role === 'user' ? 'person' : 'app-editor', at: new Date(m.timestamp).toISOString(), text: m.text, ...(m.problems?.length ? { problems: m.problems.map(p => `${p.title} (${p.places.join(', ')})`) } : {}), ...(m.diffCards?.length ? { proposedEdits: m.diffCards.length } : {}) })),
      total: chat.messages.length,
      edits: { applied: chat.applied?.length || 0, rejected: chat.rejected?.length || 0 },
      tasks: statuses.reduce<Record<string, number>>((all, status) => ({ ...all, [status]: (all[status] || 0) + 1 }), {}),
    };
  }

  /** The book's log with who did each thing: the app's runs, the agent's runs and actions, stops. */
  activity(last = 40) {
    return this.store.runLog().slice(-Math.max(1, last)).flatMap(e => {
      if (e.stage === 'model_result') return [];
      if (e.stage === 'model_call') {
        try { const message: string = JSON.parse(e.detail).entry?.message || ''; return [{ at: e.at, who: message.includes('· agent') ? 'agent' : 'app-run', what: `model call: ${message}` }]; } catch { return []; }
      }
      const agent = e.stage === 'agent' || e.detail.startsWith('agent ');
      return [{ at: e.at, who: agent ? 'agent' : e.stage === 'story-edit' ? 'person' : 'app', what: `${e.stage}: ${e.detail.slice(0, 400)}` }];
    });
  }

  private idle(): void {
    if (this.running) throw new Error(`Stage ${this.job!.stage} is still running. Wait for it with book_status, or stop it with stop_stage.`);
  }

  private start(stage: string, work: (llm: NovelLLM, active: () => void, chapter: (n: number) => void) => Promise<unknown>): Job {
    this.idle();
    const token = ++this.epoch;
    const job: Job = { id: ++this.jobs, stage, status: 'running', startedAt: new Date().toISOString() };
    this.job = job;
    const active = () => { if (this.epoch !== token) throw new Error('This stage was stopped.'); };
    this.done = (async () => {
      try {
        await work(this.makeLlm(active), active, n => { job.chapter = n; });
        active();
        job.status = 'done';
      } catch (error) {
        job.status = this.epoch === token ? 'failed' : 'stopped';
        job.error = error instanceof Error ? error.message : String(error);
        this.store.log('stopped', `agent ${stage}: ${job.error}`);
      } finally {
        job.finishedAt = new Date().toISOString();
        await this.store.flush().catch(error => { job.error = `${job.error ? `${job.error}; ` : ''}save failed: ${String(error)}`; });
        // What the stage wrote is the agent's own doing, not news from the app.
        this.seen = await this.view();
      }
    })();
    return job;
  }

  /** Stop the running stage: what it finished stays, the call in flight is dropped when it returns. */
  stop(): Job | null {
    if (this.running) { this.epoch++; this.job!.status = 'stopped'; this.job!.finishedAt = new Date().toISOString(); }
    return this.job;
  }

  /** Wait up to `seconds` for the running stage to finish. */
  async wait(seconds: number): Promise<void> {
    if (!this.running || seconds <= 0) return;
    await Promise.race([this.done, new Promise(resolve => setTimeout(resolve, Math.min(seconds, 600) * 1000))]);
  }

  async listBooks(): Promise<{ path: string; title: string }[]> {
    return (await listAutosaves()).map(path => ({ path, title: path.split(/[\\/]/).at(-2) || path }));
  }

  async openBook(path?: string): Promise<void> {
    this.idle();
    await this.store.open(path);
    // A book the agent chose to open: what is in it now is where its knowledge starts.
    this.seen = await this.view();
    this.unseen = [];
  }

  status() {
    const input = this.store.loadInput();
    const book = this.store.loadAuthor()?.promptPlanning;
    const next = !book ? 'new_book'
      : !promptsReady(book) ? (book.blueprint ? 'plan_book (finishes the chapter prompts)' : 'plan_book')
      : !book.story || book.story.chapters.length < book.brief.input.chapter_count ? 'write_story'
      : !storyIsCurrent(book) ? 'write_story with restart: the outline, prompts or style changed after the story was written'
      : 'edit the manuscript (get_manuscript, edit_chapter) or check prompts';
    return {
      book: input ? { title: book?.blueprint?.title || input.title || null, premise: input.premise, chapters: input.chapter_count, autosave: this.store.path } : null,
      stage: book ? {
        workspace: book.workspaceStage || 'prompts',
        planning: book.phase,
        style: book.style ? `${book.style.profile.length} characters${book.style.edited ? ', edited by hand' : ''}` : 'none',
        outline: !!book.blueprint,
        prompts: `${book.prompts.filter(p => p.sourceRevision === book.revision).length}/${book.brief.input.chapter_count} current`,
        reviews: (book.reviews || []).length,
        story: book.story ? `${book.story.chapters.length}/${book.brief.input.chapter_count} chapters${storyIsCurrent(book) ? '' : ', written from an older outline or prompts'}` : 'not written',
        editable: canEditPromptStory(book),
      } : null,
      next,
      job: this.job,
      recent: this.store.runLog().filter(e => e.stage !== 'model_call' && e.stage !== 'model_result').slice(-8).map(e => `${e.at} ${e.stage}: ${e.detail.slice(0, 300)}`),
    };
  }

  newBook(params: { premise: string; chapters: number; title?: string; settings?: Partial<StorySettings> }): PromptBook {
    this.idle();
    const settings: StorySettings = { ...DEFAULT_GENERATION_SETTINGS, ...(params.settings || {}) };
    const input: ProjectInput = { ...buildProjectInput(params.premise, params.chapters, settings, params.title), generation_mode: 'prompts' };
    this.store.clearAll();
    return initializePromptBook(input, settings, this.store);
  }

  // Stages that ask a model.
  generateStyle(inputs?: { instructions: string; samples: string }): Job {
    return this.start('style', (llm, active) => prepareWritingStyle(this.store, llm, active, true, inputs));
  }
  planBook(): Job { this.book(); return this.start('plan', (llm, active) => generatePromptBook(this.store, llm, active)); }
  checkPrompts(chapters?: number[]): Job {
    const book = this.book();
    const selection = chapters?.length ? chapters : book.prompts.map(p => p.chapter);
    return this.start('check-prompts', (llm, active) => checkPromptConsistency(this.store, llm, selection, active));
  }
  fixIssue(review: string, index: number): Job {
    this.book();
    return this.start('fix-prompt', (llm, active) => fixPromptIssue(this.store, llm, review, index, active));
  }
  writeStory(restart = false): Job {
    this.book();
    return this.start('write-story', (llm, active, chapter) => writePromptStory(this.store, llm, active, chapter, restart));
  }

  // Reading and editing.
  outline(): BookBlueprint | null { return this.book().blueprint || null; }
  setOutline(blueprint: BookBlueprint, force?: boolean): void { this.idle(); this.guardDraft('outline', force); editBlueprint(this.store, blueprint); }
  prompts(chapter?: number) {
    const book = this.book();
    return book.prompts.filter(p => chapter === undefined || p.chapter === chapter).map(p => ({ ...p, current: p.sourceRevision === book.revision }));
  }
  setPrompt(chapter: number, system: string, prompt: string, force?: boolean): void { this.idle(); this.guardDraft(`prompt:${chapter}`, force); editChapterPrompt(this.store, chapter, system, prompt); }
  style(): string | null { return this.book().style?.profile || null; }
  setStyle(profile: string, inputs: { instructions: string; samples: string }, force?: boolean): void { this.idle(); this.guardDraft('style', force); saveWritingStyle(this.store, profile, inputs); }
  reviews() {
    const book = this.book();
    return (book.reviews || []).map(r => ({ ...r, current: reviewIsCurrent(book, r) }));
  }
  manuscript(chapter?: number): string {
    const book = this.book();
    if (!book.story?.chapters.length) throw new Error('No chapter is written yet: run write_story.');
    if (chapter === undefined) return promptStoryContent(book);
    const found = book.story?.chapters.find(c => c.chapter === chapter);
    if (!found) throw new Error(`Chapter ${chapter} is not written.`);
    return `## Chapter ${found.chapter}: ${found.title}\n\n${found.text}`;
  }
  saveManuscript(content: string, expected?: string): void { this.idle(); savePromptStoryManuscript(this.store, content, expected); }
  /** One exact passage replaced in one chapter; the rest of the book is left as it is. */
  editChapter(chapter: number, find: string, replace: string): void {
    this.idle();
    const book = this.book();
    const before = promptStoryContent(book);
    const at = book.story?.chapters.findIndex(c => c.chapter === chapter) ?? -1;
    if (at < 0) throw new Error(`Chapter ${chapter} is not written.`);
    const text = book.story!.chapters[at].text;
    if (text.split(find).length !== 2) throw new Error(text.includes(find) ? 'The passage occurs more than once in this chapter; quote more of it.' : 'The passage is not in this chapter; quote it exactly as get_manuscript shows it.');
    const patched = text.replace(find, () => replace);
    const chapters = book.story!.chapters.map((c, i) => (i === at ? { ...c, text: patched } : c));
    const after = promptStoryContent({ ...book, story: { ...book.story!, chapters } });
    savePromptStoryManuscript(this.store, after, before);
  }
  setStage(stage: PromptWorkspaceStage): void { this.idle(); setPromptWorkspaceStage(this.store, stage); }
}
