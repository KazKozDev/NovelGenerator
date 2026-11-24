// Plot holes on the user's own project, read from the app's autosave the way the editing stage builds it.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { generateOllamaText } from '../../services/ollamaService';
import { runEditorialTurn } from '../../utils/novel/editorialAgent';
import { withOllamaOutputRoom } from '../../utils/novel/v2/llm';
import { codeSuspects } from '../../utils/novel/editorialAgent';
import { cachedRecords } from '../../utils/novel/editorialTools';
import { indexManuscriptBlocks } from '../../utils/novel/hybridSearch';
import { QUICK_PROMPTS } from '../../components/EditorialChatStudio';
import { promptStoryContent, promptStoryMetadata } from '../../utils/novel/promptBook/editing';

const dir = 'runs/editorial-tools-check-2026-10-17/project';
const value = JSON.parse(readFileSync('autosaves/latest.project.json', 'utf8')).files.author_draft.promptPlanning;
const bookContent = promptStoryContent(value);
const metadata = promptStoryMetadata(value);
writeFileSync(`${dir}/book.md`, bookContent);
const button = QUICK_PROMPTS.find(q => q.label.includes('Plot holes'))!;

const callModel = async (prompt: string, system: string) => {
  const start = Date.now();
  const kind = system.includes('dry skeleton') ? `skeleton ${prompt.match(/CHAPTER (\d+)/)?.[1]}` : 'editor';
  const response = await withOllamaOutputRoom(maxTokens => generateOllamaText(prompt, system, undefined, 0.2, process.env.MODEL || 'deepseek-v4.1-flash:cloud', 'http://127.0.0.1:11434', maxTokens), 8192, 8192);
  appendFileSync(`${dir}/calls.log`, `${kind} ok ${Date.now() - start}ms, ${response.length} chars\n`);
  appendFileSync(`${dir}/${kind === 'editor' ? 'editor-replies' : 'skeletons'}.md`, `\n\n===== ${kind} =====\n${response}`);
  return response;
};
const result = await runEditorialTurn({ userPrompt: button.prompt, bookContent, metadata, history: [], provider: 'ollama', view: button.view, callModel });
writeFileSync(`${dir}/code-suspects.json`, JSON.stringify(codeSuspects(indexManuscriptBlocks(bookContent)), null, 2));
writeFileSync(`${dir}/answer.md`, `${result.executedTools.map(t => `- ${t.tool}: ${t.summary}`).join('\n')}\n\n${result.assistantMessage}\n\n## Cards\n${result.problems.map(p => `- ${p.title} (${p.places.join(', ')})\n${p.ways.map(w => `  - ${w}`).join('\n')}`).join('\n')}\n`);
console.log('problems:', result.problems.map(p => p.title));
