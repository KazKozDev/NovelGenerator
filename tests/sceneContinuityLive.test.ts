import { it, expect } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { generateOllamaText } from '../services/ollamaService';
import { CraftSession, revision } from '../utils/novel/craft/state';
import { acceptArchitecture } from '../utils/novel/craft/planning';
import { commitEnacted, emptyEnacted, executionBase, executionPrompt, prepareExecution } from '../utils/novel/craft/runtime';
import { DRAFT_WRITER_SYSTEM } from '../utils/novel/craft/prose';
import { smoothSceneTransition } from '../utils/novel/craft/craftRules';
import { observeScene } from '../utils/novel/craft/observer';
import type { NovelLLM } from '../utils/novel/v2/llm';
import { authorArchitecture } from './fixtures/authorArchitecture';

it.skipIf(process.env.NOVEL_LIVE_CONTINUITY!=='1')('checks two real-model scenes after seam editing with bound state and evidence',async()=>{
 const model=process.env.NOVEL_LIVE_MODEL||'deepseek-v4.1-flash:cloud';
 const endpoint=process.env.NOVEL_LIVE_ENDPOINT||'http://127.0.0.1:3017/api/ollama';
 const plan=authorArchitecture(),session=new CraftSession({},'live-continuity',()=>{}),calls:any[]=[];
 await acceptArchitecture(plan,session);
 const llm:NovelLLM=async(prompt,system,options)=>{
  const start=Date.now();console.log('Calling real model:',options?.stage);
  const text=await generateOllamaText(prompt,system,options?.schema as object,options?.temperature??0.2,model,endpoint,options?.maxTokens||8192);
  calls.push({stage:options?.stage,durationMs:Date.now()-start,prompt,text});return text;
 };
 let state=emptyEnacted();const prose:string[]=[];
 for(let index=0;index<2;index++) {
  const node=plan.graph.scenes[index];
  const execution=index===0?executionBase(plan,node,state):await prepareExecution(plan,node,state,'The reader expects Nora to enter using the key she actually obtained.',session,llm);
  if(index) {expect(execution.continuity?.[0].events.length).toBeGreaterThan(0);expect(execution.continuity?.[0].textRevision).toBe(await revision(prose[0]));}
  let text=await llm(executionPrompt(execution,prose),DRAFT_WRITER_SYSTEM,{stage:'craft-write',temperature:0.8,maxTokens:4000});
  if(index) text=await smoothSceneTransition(prose.at(-1)!,text,{locA:plan.graph.scenes[0].sceneContract.location,locB:node.sceneContract.location},llm);
  const prompt=`Verify this exact final scene after seam editing. REQUIRED CURRENT TASK:\n${JSON.stringify(execution.current)}\nPRIOR PROSE:\n${prose.join('\n\n')}\nCURRENT PARAGRAPHS:\n${JSON.stringify(text.split(/\n\s*\n/).filter(Boolean).map((text,i)=>({id:`${node.id}-p${i+1}`,text})))}\nReturn an observation JSON using supplied paragraph source IDs. Was the current physical event enacted, missing or contradicted? Check repetition and continuity against prior prose. Return event:{status,sources,reason}, tangibleActionEnacted, valueChargeTurned, isRepetitiveOrClichéd, facts:[], issues:[{reason,sources,kind:'factual|knowledge|causal|style|uncertain',status:'demonstrated|uncertain'}].`;
  const observation=await observeScene(llm,prompt,text,node.id,'draft');
  expect(observation.receipt).toBeDefined();
  expect(observation.receipt!.event.status).toBe('enacted');
  state=await commitEnacted(plan,node,text,state,session,llm);
  expect(state.scenes[index].textRevision).toBe(await revision(text));
  if (index===1) expect(state.scenes[index].resources.find(r=>r.resource==='R1')?.available).toBe(false);
  prose.push(text);
 }
 await writeFile('/tmp/novel-scene-continuity-live.json',JSON.stringify({model,prose,state,calls},null,2));
},240000);
