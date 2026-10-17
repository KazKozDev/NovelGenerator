// One live check of the editorial chat's reading tools on a Nora book with three planted holes.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { generateOllamaText } from '../../services/ollamaService';
import { runEditorialTurn } from '../../utils/novel/editorialAgent';
import { withOllamaOutputRoom } from '../../utils/novel/v2/llm';

const dir = 'runs/editorial-tools-check-2026-10-17';
const source = 'runs/nora-simplified-6-20261014';
const lines = readFileSync(`${source}/book.md`, 'utf8').split('\n');
const plant = (at: number, text: string) => lines.splice(at, 0, text, '');

// Lines are 1-based in the source; plant from the end so earlier numbers hold.
// 2. An hour that disagrees: Hale says he was found about five; the narrator of chapter 6 says noon.
plant(297, 'Daniel had been found at noon on that Friday, by a housekeeper who had knocked three times and then let herself in.');
// 1. A scene told twice: chapter 2's arrival pasted into chapter 4, after Hale leaves.
const arrival = [51, 53, 55, 57].map(n => lines[n - 1]);
plant(202, arrival.join('\n\n'));
// 3. Knowledge before it is learned: Nora knows the wife's name before the email from "a name she did not recognize".
plant(26, "Daniel's wife, Claire, was at her sister's in Summerville until Sunday. Nora had heard a great deal about Claire.");

const bookContent = lines.join('\n');
writeFileSync(`${dir}/book-planted.md`, bookContent);
const metadata = { premise: readFileSync(`${source}/input.json`, 'utf8'), dossier: readFileSync(`${source}/dossier.md`, 'utf8') };
const button = process.env.BUTTON ? (await import('../../components/EditorialChatStudio')).QUICK_PROMPTS.find(q => q.label.includes(process.env.BUTTON!)) : undefined;
const userPrompt = button?.prompt || 'Проверь сюжет книги: логические дыры, кто что знает и откуда, время и даты, повторы. Правки пока не предлагай.';
const suffix = process.env.BUTTON ? `-${process.env.BUTTON.replace(/\W+/g, '-').toLowerCase()}` : '';

const calls: any[] = [];
const result = await runEditorialTurn({
  userPrompt, bookContent, metadata, history: [], provider: 'ollama', view: button?.view,
  callModel: async (prompt, system) => {
    const start = Date.now();
    const kind = system.includes('dry skeleton') ? `skeleton ${prompt.match(/CHAPTER (\d+)/)?.[1]}` : 'editor';
    let response: string;
    try {
      let partial = '';
      response = await withOllamaOutputRoom(maxTokens => { partial = ''; return generateOllamaText(prompt, system, undefined, 0.2, process.env.MODEL || 'deepseek-v4.1-flash:cloud', 'http://127.0.0.1:11434', maxTokens, undefined, undefined, chunk => { partial += chunk; (globalThis as any).partialNow = partial; }); }, 8192, 8192);
      (globalThis as any).lastPartial = partial;
    } catch (error) {
      writeFileSync(`${dir}/cut-reply${suffix}.md`, (globalThis as any).partialNow || '');
      appendFileSync(`${dir}/calls${suffix}.log`, `${kind} FAILED after ${Date.now() - start}ms: ${error}\n`);
      throw error;
    }
    appendFileSync(`${dir}/calls${suffix}.log`, `${kind} ok ${Date.now() - start}ms, ${response.length} chars\n`);
    if (kind !== 'editor') appendFileSync(`${dir}/skeletons${suffix}.md`, `\n\n===== ${kind} =====\n${response}`);
    if (kind === 'editor') appendFileSync(`${dir}/editor-replies${suffix}.md`, `\n\n===== editor reply (${response.length} chars) =====\n${response}`);
    calls.push({ system: system.slice(0, 80), prompt: prompt.slice(-6000), promptChars: prompt.length, ms: Date.now() - start, response });
    return response;
  },
});
writeFileSync(`${dir}/result${suffix}.json`, JSON.stringify({ userPrompt, result, calls }, null, 2));
writeFileSync(`${dir}/answer${suffix}.md`, `${result.executedTools.map(t => `- ${t.tool}: ${t.summary}`).join('\n')}\n\n${result.assistantMessage}\n`);
console.log(result.executedTools, '\n\n', result.assistantMessage);
