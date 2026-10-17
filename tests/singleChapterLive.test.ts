import { it, expect } from 'vitest';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { snapshotProject, restoreSnapshot } from '../utils/novel/v2/export';
import { generateOllamaText } from '../services/ollamaService';
import { revision } from '../utils/novel/craft/state';
import type { NovelLLM } from '../utils/novel/v2/llm';
import type { ProjectInput } from '../utils/novel/v2/types';

it.skipIf(process.env.NOVEL_LIVE_CHAPTER!=='1')('runs one complete chapter through the real production engine and saves all evidence separately',async()=>{
 const directory=process.env.NOVEL_CHAPTER_DIR||'runs/single-chapter-continuity-2026-10-16';
 const model=process.env.NOVEL_LIVE_MODEL||'deepseek-v4.1-flash:cloud';
 const endpoint=process.env.NOVEL_LIVE_ENDPOINT||'http://127.0.0.1:3017/api/ollama';
 await mkdir(directory,{recursive:true});
 const store=new MemoryProjectStore();
 const input:ProjectInput={generation_mode:'author',planning_version:2,scene_layout:'classic-three-scenes',writing_method:'outliner',chapter_count:1,target_total_words:1200,genre:'realistic psychological thriller',premise:'During a flood at a municipal records station, engineer Nora and courier Ilya must retrieve the original maintenance ledger before the emergency pump shutdown. The archive has one brass key and a physically jammed gate. Nora must visibly obtain the key, enter with Ilya, overcome the gate at a material cost, compare the ledger to a dated incident sheet and expose a falsified maintenance signature by sending a photograph to the inspector. Her costly choice puts her own earlier negligence on record too. All decisive evidence must be acquired on page. End with the actual transmission, not a promise to act. Tell one complete short story in one chapter with three chronological causal scenes.',author_requirements:'Write ALL fiction prose in Russian. Third-person limited through Nora only, past tense. Approximately 1200 words in one chapter. Concrete physical actions and credible dialogue. No magic, no omniscient motives, no moralizing ending. Track who holds the key, the ledger, the incident sheet and phone; after the gate is opened do not open it again. Do not repeat entrances, discoveries or the act of sending the evidence. Preserve physical consequences and costs across scenes.'};
 try {restoreSnapshot(store,JSON.parse(await readFile(join(directory,'snapshot.project.json'),'utf8')));console.log('Resuming saved isolated test.');}catch {store.saveInput(input);}
 const log=async(text:string)=>{console.log(text);await appendFile(join(directory,'run.log'),`[${new Date().toISOString()}] ${text}\n`);};
 const persist=async()=>{
  await writeFile(join(directory,'snapshot.project.json'),JSON.stringify(snapshotProject(store),null,2));
  const files=store.loadAuthor()?.desk?.files||{};
  for(const [name,text] of Object.entries(files)) {const path=join(directory,'artifacts',name);await mkdir(dirname(path),{recursive:true});await writeFile(path,text);}
  const manuscript=store.manuscript();
  if(manuscript.length) await writeFile(join(directory,'chapter.md'),manuscript.map(c=>`## Chapter ${c.chapter}\n\n${c.text}`).join('\n\n'));
 };
 let calls=0;
 const llm:NovelLLM=async(prompt,system,options)=>{
  await persist();const id=++calls;const stage=options?.stage||'unknown';await log(`Call ${id}: ${stage}`);
  const start=Date.now();let usage:Record<string,unknown>={};
  const text=await generateOllamaText(prompt,system,options?.schema,options?.temperature??0.4,model,endpoint,options?.maxTokens||8192,undefined,undefined,undefined,value=>{usage=value;});
  await writeFile(join(directory,`call-${Date.now()}-${id}-${stage}.json`),JSON.stringify({model,stage,route:options?.route,prompt,system,text,durationMs:Date.now()-start,usage},null,2));
  await log(`Call ${id} finished: ${stage}, ${Date.now()-start}ms`);return text;
 };
 let result:any;
 try {
  result=await new Orchestrator(store,{maxCalls:150,maxTimeMs:12*60*1000},(stage,chapter)=>{console.log('Progress:',stage,chapter??'');}).runBook(store.loadInput()!,llm);
  await writeFile(join(directory,'result.json'),JSON.stringify(result,null,2));
 }catch(error){await writeFile(join(directory,'failure.json'),JSON.stringify({error:String(error),at:new Date().toISOString()},null,2));throw error;}
 finally {await persist();}
 const files=store.loadAuthor()!.desk!.files;
 const bindings=[];
 for(const [name,raw] of Object.entries(files)) {
  const match=name.match(/^scene-(\d+)-state\.json$/);if(!match)continue;
  const checkpoint=JSON.parse(raw),text=files[`scene-${match[1]}.md`],hash=await revision(text);
  bindings.push({scene:checkpoint.sceneId,phase:checkpoint.phase,textRevision:hash,observationMatches:checkpoint.observationRevision===hash,seamMatches:checkpoint.finalizedRevision===hash});
 }
 await writeFile(join(directory,'integrity.json'),JSON.stringify({model,calls,bindings,report:store.loadReport(),note:'The manuscript may have been revised after initial scene commits; archived scene hashes refer to their exact scene drafts, and enacted-state.stale identifies later whole-book edits.'},null,2));
 expect(store.manuscript()).toHaveLength(1);expect(store.manuscript()[0].text.trim().length).toBeGreaterThan(1000);
 expect(bindings).toHaveLength(3);expect(bindings.every(b=>b.observationMatches&&b.seamMatches&&b.phase==='complete')).toBe(true);
 console.log('Completed isolated chapter:',directory,result);
},900000);
