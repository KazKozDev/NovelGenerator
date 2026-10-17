import { it, expect } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { generateOllamaText } from '../services/ollamaService';
import { buildEditorialTasks, checkEditorialTask, proposeEditorialTask } from '../utils/novel/editorialTasks';

// Explicit opt-in: ordinary test runs never call a paid or local model.
it.skipIf(process.env.NOVEL_LIVE_EDITORIAL !== '1')('verifies real-model editorial proposal, resolution, undo and paraphrase', async () => {
 const model = process.env.NOVEL_LIVE_MODEL || 'deepseek-v4.1-flash:cloud';
 const endpoint = process.env.NOVEL_LIVE_ENDPOINT || 'http://127.0.0.1:3017/api/ollama';
 const manuscript = '## Chapter 1\n\nNora locked the archive door with the only key. She left that key on the table inside the archive and walked out through the self-locking door.\n\n## Chapter 2\n\nNora returned alone. Without a key or any other tool, she unlocked the archive door and entered. The lock was still intact and functioning normally.';
 const description = 'Nora unlocks a functioning locked archive door without a key or tool in Chapter 2, although Chapter 1 establishes the only key is locked inside. Repair this causal contradiction without introducing magic or changing the established functioning lock.';
 const task = buildEditorialTasks([{description,severity:'major',category:'Causality',evidence_refs:['chapter-1: She left that key on the table inside the archive and walked out through the self-locking door.','chapter-2: Without a key or any other tool, she unlocked the archive door and entered.']}],[])[0];
 const calls: {durationMs:number;response:string}[] = [];
 const callModel = async (prompt: string, system: string) => {
   const start = Date.now();
   const response = await generateOllamaText(prompt, system, undefined, 0.1, model, endpoint, 8192);
   calls.push({durationMs:Date.now()-start,response});
   console.log(`Real model call ${calls.length} completed in ${Date.now()-start}ms`);
   return response;
 };
 const author = 'Realistic contemporary fiction. Preserve the functioning lock. Nora is an ordinary human.';
 const before = await checkEditorialTask(task,manuscript,callModel,author);
 console.log('Before:',before);
 expect(before.status).toBe('open');
 const proposal = await proposeEditorialTask(task,manuscript,{author_requirements:author},callModel,'ollama');
 expect(proposal.cards.length).toBeGreaterThan(0);
 expect(proposal.updatedManuscript).not.toBe(manuscript);
 const after = await checkEditorialTask(task,proposal.updatedManuscript,callModel,author);
 console.log('After:',after);
 expect(after.status).toBe('resolved');
 const undo = await checkEditorialTask(task,proposal.baseline,callModel,author);
 expect(undo.status).toBe('open');
 const paraphrased = manuscript.replace('Without a key or any other tool, she unlocked the archive door and entered.', 'Carrying neither a key nor tools, she released the locked archive door and stepped inside.');
 const paraphrase = await checkEditorialTask(task,paraphrased,callModel,author);
 expect(paraphrase.status).toBe('open');
 await writeFile('/tmp/novel-editorial-live-result.json',JSON.stringify({model,before,proposal,after,undo,paraphrase,calls},null,2));
}, 240000);
