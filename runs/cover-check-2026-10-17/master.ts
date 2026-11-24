// One real master for The Thursday Room: prompt from the book (deepseek via Ollama), picture from Gemini.
import { readFileSync, writeFileSync } from 'node:fs';
import { generateOllamaText } from '../../services/ollamaService';
import { generateGeminiImage } from '../../services/geminiDevPlugin';
import { buildCoverPromptRequest, masterPrompt } from '../../utils/cover/coverPrompt';

const dir = 'runs/cover-check-2026-10-17';
const book = JSON.parse(readFileSync('autosaves/latest.project.json', 'utf8')).files.author_draft.promptPlanning;
const input = book.brief.input;
const facts = { title: book.blueprint?.title || input.title, genre: input.genre, premise: input.premise, requirements: input.author_requirements, excerpt: book.story?.chapters?.[0]?.text?.slice(0, 3000) };
const { prompt, system } = buildCoverPromptRequest(facts);
const description = (await generateOllamaText(prompt, system, undefined, 0.8, 'deepseek-v4.1-flash:cloud', 'http://127.0.0.1:11434', 2000)).trim();
writeFileSync(`${dir}/prompt.txt`, masterPrompt(description));
console.log('PROMPT:\n' + description);

const key = (process.env.GEMINI_API_KEY || readFileSync('.env.local', 'utf8').split('\n').find(l => /^\s*GEMINI_API_KEY\s*=/.test(l))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')) || '';
const start = Date.now();
const image = await generateGeminiImage(key, { prompt: masterPrompt(description), model: process.env.MODEL || 'gemini-3-pro-image', aspectRatio: '2:3', imageSize: '4K' });
writeFileSync(`${dir}/master.${image.mimeType.split('/')[1] || 'png'}`, Buffer.from(image.data, 'base64'));
console.log(`IMAGE: ${image.mimeType}, ${Math.round(image.data.length * 0.75 / 1024)} KB, ${Math.round((Date.now() - start) / 1000)} s`);
