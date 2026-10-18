/**
 * NovelGenerator as an MCP server over stdio: every stage of the app as a tool an agent (Hermes,
 * OpenClaw, Claude Code…) can call, on the same book in the same folder the app uses.
 *
 *   npx vite-node mcp/server.ts
 *
 * stdout carries the protocol, so everything the pipeline prints goes to stderr.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

for (const level of ['log', 'info', 'debug', 'warn'] as const) console[level] = (...args: unknown[]) => console.error(...args);
// Keys are read from .env.local in the repository, whatever folder the agent started the server in.
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = await import('zod');
const { FolderProjectStore } = await import('./folderStore');
const { NovelDesk } = await import('./novelDesk');
const { modelLabel, modelsFromEnv, nodeLlm } = await import('./nodeLlm');
const { listBookFiles, readBookFolderFile, readScreenState } = await import('./screen');

const models = modelsFromEnv();
const store = new FolderProjectStore();
const desk = new NovelDesk(store, active => nodeLlm(store, models, active));
await desk.openBook().catch(error => console.error('No book opened:', error));

const server = new McpServer({ name: 'novel-generator', version: '1.1.0' }, {
  instructions: [
    'NovelGenerator writes a novel in stages: new_book → generate_style (optional) → plan_book (outline, then one prompt per chapter) → check_prompts / fix_prompt_issue (optional) → write_story → editing (get_manuscript, edit_chapter, save_manuscript).',
    'Between stages you may read and change the result: get_outline/set_outline, get_prompts/set_prompt, get_style/set_style.',
    'Stages that call a model run in the background, one at a time: they return at once, and book_status (with wait_seconds) shows when they finish and what to do next.',
    `The book is the one open in the app (its autosave in Documents/NovelGenerator); the person works on it in the app at the same time. Writer: ${modelLabel(models.writer)}${models.validator ? `, editor: ${modelLabel(models.validator)}` : ''}.`,
    '',
    'Seeing what happens in the app: every answer may end with "Since your last look, in the app: …" — then call whats_new. It lists each change with who made it: person (the human at the app), app-run (the app ran a model stage), app-editor (the app\'s editor model in the editorial chat). Your own actions are logged as agent and are never reported back to you. get_editorial_chat shows the whole chat, get_activity the log.',
    'To follow the book between requests, call watch: it returns as soon as something changes in the app.',
    'Seeing everything: see_app gives what the app\'s screen shows right now as text (the visible text, dialogs, errors, the field being typed in and what is typed, the selection, running work, the model and story settings kept in the browser); list_book_files and read_book_file give every file in the book\'s folder (manuscript, reports, plans, covers). When the person speaks of something "here" or "on screen", look with see_app first.',
    '',
    'When to speak up: whats_new and watch return attention items. "wait": the person is working; do not start stages or change what they are editing, keep remarks short. "warn": something failed; explain it plainly and offer the fix. "suggest": a moment where help is useful; make one concrete offer. With no attention item, a change needs no comment unless the person asked you to follow it.',
    'Never overwrite an edit the person has not saved: set_outline, set_prompt and set_style refuse it unless the person told you to (force).',
  ].join('\n'),
});

const text = (value: unknown, note?: string | null) => ({ content: [{ type: 'text' as const, text: (typeof value === 'string' ? value : JSON.stringify(value, null, 2)) + (note ? `\n\n${note}` : '') }] });
/**
 * Every tool reads the book again first, so the agent works on what the person sees, and its answer ends with
 * what happened in the app meanwhile. A tool that changes the book says what it did: that goes into the app's log as the agent's.
 */
const tool = <S extends Record<string, any>>(name: string, description: string, inputSchema: S, run: (args: any) => unknown, quiet = false) =>
  server.registerTool(name, { description, inputSchema }, (async (args: any) => {
    try {
      await desk.sync();
      const result = await run(args ?? {});
      return text(result, quiet ? null : desk.headsUp());
    } catch (error) {
      return { ...text(error instanceof Error ? error.message : String(error), desk.headsUp()), isError: true };
    }
  }) as any);
const started = async (job: { stage: string }) => { await desk.wrote(`started ${job.stage}`); return { started: job, next: 'Call book_status with wait_seconds to see it finish.' }; };

const settings = z.object({
  genre: z.string(), narrativeVoice: z.string(), tone: z.string(), targetAudience: z.string(), writingStyle: z.string(),
  tense: z.string(), ending: z.string(), intimacy: z.string(), targetWordsPerChapter: z.number().int().positive(),
  storyStructure: z.string(), seriesContext: z.string(), comparableBooks: z.string(), styleInstructions: z.string(), proseSamples: z.string(),
}).partial();
const force = z.boolean().optional().describe('Replace an edit the person has not saved yet. Only when they told you to.');

tool('book_status', 'The open book: its stage, what is done, the running stage, recent log, and the next step. wait_seconds waits for a running stage to finish (up to 600).',
  { wait_seconds: z.number().min(0).max(600).optional() },
  async ({ wait_seconds }) => { await desk.wait(wait_seconds || 0); await desk.sync(); return desk.status(); });
tool('whats_new', 'What happened in the app since you last asked, each change with who made it (person, app-run, app-editor), and attention items saying whether this is a moment to speak up, wait, or warn.',
  {}, () => desk.whatsNew(), true);
tool('watch', 'Wait until something happens in the app (the person edits, the app runs a stage, the editor answers in the chat) or a stage of yours finishes, up to timeout_seconds (max 600). Returns the same as whats_new.',
  { timeout_seconds: z.number().min(1).max(600).optional() }, ({ timeout_seconds }) => desk.watch(timeout_seconds || 300), true);
tool('get_editorial_chat', 'The editorial chat in the app: what the person said and what the app\'s editor answered, with the problems it raised and its proposed edits.',
  { last: z.number().int().positive().optional() }, ({ last }) => desk.editorialChat(last));
tool('get_activity', 'The book\'s log with who did each thing: the app\'s model runs, the agent\'s runs and actions, manuscript edits, stops.',
  { last: z.number().int().positive().optional() }, ({ last }) => desk.activity(last));
tool('see_app', 'What the app\'s screen shows right now, as text: visible text top to bottom, open dialogs, errors shown, the focused field and what is typed in it, the selected text, work in progress, and the settings kept in the browser (models, story settings, imprint). ageSeconds says how fresh it is; the app sends it while it is open.',
  {}, async () => (await readScreenState(store.customBase)) || 'The app has not described its screen: it is not open, or it runs without the dev server (npm run dev).');
const bookDir = () => { if (!store.path) throw new Error('No book is open.'); return path.dirname(store.path); };
tool('list_book_files', 'Every file in the open book\'s folder: manuscripts, chapters, reports, plans, the workspace state, covers, backups.', {}, () => listBookFiles(bookDir()));
server.registerTool('read_book_file', {
  description: 'One file of the open book\'s folder, by the path list_book_files gives: text files as text, pictures (covers) as pictures.',
  inputSchema: { path: z.string().min(1) },
}, (async ({ path: file }: { path: string }) => {
  try {
    const found = await readBookFolderFile(bookDir(), file);
    return { content: ['text' in found ? { type: 'text' as const, text: found.text } : { type: 'image' as const, data: found.data, mimeType: found.mimeType }] };
  } catch (error) {
    return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
  }
}) as any);
tool('list_books', 'Books in Documents/NovelGenerator, newest first, with the autosave path open_book takes.', {}, () => desk.listBooks());
tool('open_book', 'Open a book by its autosave path from list_books; without a path, the newest one (the one the app opens).',
  { path: z.string().optional() }, async ({ path }) => { await desk.openBook(path); return desk.status(); });
tool('new_book', 'Start a new book in the app\'s prompt workflow. Nothing is generated yet; plan_book does that. Settings default to the app\'s defaults.',
  { premise: z.string().min(1), chapters: z.number().int().min(3).max(100), title: z.string().optional(), settings: settings.optional() },
  async args => { desk.newBook(args); await desk.wrote(`new_book: ${args.title || args.premise.slice(0, 80)}`); return desk.status(); });

tool('generate_style', 'Stage: build the shared prose-style profile from style instructions and prose samples. Runs in the background.',
  { instructions: z.string().optional(), samples: z.string().optional() },
  ({ instructions, samples }) => started(desk.generateStyle(instructions !== undefined || samples !== undefined ? { instructions: instructions || '', samples: samples || '' } : undefined)));
tool('get_style', 'The shared prose-style profile, or null.', {}, () => desk.style());
tool('set_style', 'Replace the prose-style profile by hand (up to 6000 characters).',
  { profile: z.string(), instructions: z.string().optional(), samples: z.string().optional(), force },
  async ({ profile, instructions, samples, force }) => { desk.setStyle(profile, { instructions: instructions || '', samples: samples || '' }, force); await desk.wrote('set_style'); return desk.status(); });

tool('plan_book', 'Stage: plan the book — the outline first, then a writing prompt per chapter. Continues where it stopped. Runs in the background.', {}, () => started(desk.planBook()));
tool('get_outline', 'The book outline (title, characters, facts, one entry per chapter), as JSON set_outline takes back.', {}, () => desk.outline());
tool('set_outline', 'Replace the outline. Its chapter prompts must then be made again with plan_book.',
  { outline: z.record(z.string(), z.any()), force }, async ({ outline, force }) => { desk.setOutline(outline, force); await desk.wrote('set_outline'); return desk.status(); });
tool('get_prompts', 'Chapter prompts (system and prompt per chapter); one chapter or all.',
  { chapter: z.number().int().positive().optional() }, ({ chapter }) => desk.prompts(chapter));
tool('set_prompt', 'Replace one chapter\'s system and prompt by hand.',
  { chapter: z.number().int().positive(), system: z.string().min(1), prompt: z.string().min(1), force },
  async ({ chapter, system, prompt, force }) => { desk.setPrompt(chapter, system, prompt, force); await desk.wrote(`set_prompt ${chapter}`); return desk.prompts(chapter); });

tool('check_prompts', 'Stage: a model reads the chapter prompts together for contradictions. All chapters, or the ones named. Runs in the background.',
  { chapters: z.array(z.number().int().positive()).optional() }, ({ chapters }) => started(desk.checkPrompts(chapters)));
tool('get_reviews', 'Prompt reviews with their findings; current is false once the prompts changed after the review.', {}, () => desk.reviews());
tool('fix_prompt_issue', 'Stage: let a model fix one finding of a review in the prompts. review is its createdAt, index the finding\'s position. Runs in the background.',
  { review: z.string(), index: z.number().int().min(0) }, ({ review, index }) => started(desk.fixIssue(review, index)));

tool('write_story', 'Stage: write the chapters from their prompts, continuing where it stopped; restart writes them all again. Runs in the background.',
  { restart: z.boolean().optional() }, ({ restart }) => started(desk.writeStory(!!restart)));
tool('get_manuscript', 'The manuscript as Markdown, or one chapter.',
  { chapter: z.number().int().positive().optional() }, ({ chapter }) => desk.manuscript(chapter));
tool('edit_chapter', 'Replace one exact passage in one chapter. The passage must occur once in that chapter. The previous text is kept in the edit history.',
  { chapter: z.number().int().positive(), find: z.string().min(1), replace: z.string() },
  async ({ chapter, find, replace }) => { desk.editChapter(chapter, find, replace); await desk.wrote(`edit_chapter ${chapter}: "${find.slice(0, 60)}" → "${replace.slice(0, 60)}"`); return desk.manuscript(chapter); });
tool('save_manuscript', 'Replace the whole manuscript: every numbered chapter (## Chapter N: Title), in order. expected, when given, must equal the text get_manuscript returned, so a concurrent edit is not overwritten.',
  { content: z.string().min(1), expected: z.string().optional() },
  async ({ content, expected }) => { desk.saveManuscript(content, expected); await desk.wrote('save_manuscript'); return desk.status(); });

tool('set_stage', 'Switch the app\'s workspace tab: prompts, story, editing (needs every chapter written) or cover.',
  { stage: z.enum(['prompts', 'story', 'editing', 'cover']) }, async ({ stage }) => { desk.setStage(stage); await desk.wrote(`set_stage ${stage}`); return desk.status(); });
tool('stop_stage', 'Stop the running stage. What it finished stays.', {}, () => desk.stop());

await server.connect(new StdioServerTransport());
console.error(`novel-generator MCP ready · writer ${modelLabel(models.writer)} · book ${store.path || 'none'}`);
