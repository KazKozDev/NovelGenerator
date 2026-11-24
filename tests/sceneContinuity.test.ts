import { describe, it, expect } from 'vitest';
import { CraftSession, revision } from '../utils/novel/craft/state';
import { commitEnacted, emptyEnacted, executionBase, executionPrompt } from '../utils/novel/craft/runtime';
import { runCraftBook } from '../utils/novel/craft/craftOrchestrator';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { authorArchitecture, authorProse, scriptedAuthorLLM } from './fixtures/authorArchitecture';
const input={premise:'Nora exposes a forgery.',genre:'thriller',author_requirements:'',chapter_count:1,target_total_words:1200};
describe('evidence-backed scene continuation',()=>{
 it.each(['resources','relationships'] as const)('rejects invented evidence for %s without committing state',async kind=>{
  const plan=authorArchitecture(),session=new CraftSession({},'audit',()=>{});
  const value={events:[{event:'E1',quote:'Nora took the key.',outcome:'Key taken.'}],acquisitions:[],resources:[],relationships:[],options:[],summary:'Key acquired.',deferred:[],deviations:[],[kind]:kind==='resources'?[{resource:'R1',available:false,quote:'This evidence does not exist.'}]:[{characters:['C1','C2'],change:'Trust vanished.',quote:'This evidence does not exist.'}]};
  await expect(commitEnacted(plan,plan.graph.scenes[0],authorProse(1),emptyEnacted(),session,async()=>JSON.stringify(value))).rejects.toThrow('State change requires exact prose evidence');
  expect(session.files['enacted-state.json']).toBeUndefined();
 });
 it('gives state extraction resource identities and previous availability, not opaque IDs',async()=>{
  const plan=authorArchitecture(),session=new CraftSession({},'audit',()=>{}),base=scriptedAuthorLLM(plan);
  const previous=emptyEnacted();
  previous.scenes.push({id:'SC1',textRevision:'prior',events:[],acquisitions:[],resources:[{resource:'R1',available:false,quote:'The key was lost.'}],relationships:[],options:[],summary:'Lost key.',deferred:[],deviations:[]});
  await commitEnacted(plan,plan.graph.scenes[1],authorProse(2),previous,session,async(prompt,system,options)=>{
   expect(prompt).toContain('The only brass key.');
   expect(prompt).toContain('"availableBefore":false');
   expect(prompt).toContain('"name":"Nora"');
   return base(prompt,system,options);
  });
 });
 it('passes evidenced past events and losses directly to the writer without future state',async()=>{
  const plan=authorArchitecture(),session=new CraftSession({},'audit',()=>{});
  const state=await commitEnacted(plan,plan.graph.scenes[0],authorProse(1),emptyEnacted(),session,scriptedAuthorLLM(plan));
  const execution=executionBase(plan,plan.graph.scenes[1],state);
  expect(execution.continuity?.[0].events[0].quote).toBe('Nora took the key.');
  const prompt=executionPrompt(execution,['EARLY_CURRENT_CHAPTER_ACTION','SECOND_PROSE','THIRD_PROSE']);
  expect(prompt).toContain('EARLY_CURRENT_CHAPTER_ACTION');
  expect(prompt).toContain('CONTINUITY LOCK');
  expect(prompt).toContain('Nora took the key.');
  expect(prompt).not.toContain(plan.concept.ending.externalOutcome);
 });
 it('observes and commits the final smoothed text, and reuses it unchanged on Continue',async()=>{
  const store=new MemoryProjectStore(),calls:{stage:string;prompt:string}[]=[];
  const base=scriptedAuthorLLM(authorArchitecture(),calls);
  let seams=0;
  const llm:typeof base=async(p,s,o)=>{
   if(o?.stage==='craft-seam') {
    seams++;
    const text=p.split('[HEAD_B] (Target to edit — first paragraph of Scene B):\n')[1].split('\n\n[ANCHOR_B]')[0];
    return text+' Her sleeve brushed the frame.';
   }
   return base(p,s,o);
  };
  await runCraftBook(input,store,llm,()=>{});
  const files=store.loadAuthor()!.desk!.files;
  const state=JSON.parse(files['enacted-state.json']);
  for(let n=1;n<=3;n++) {
   const text=files[`scene-${n}.md`],checkpoint=JSON.parse(files[`scene-${n}-state.json`]);
   expect(state.scenes[n-1].textRevision).toBe(await revision(text));
   expect(checkpoint.observationRevision).toBe(await revision(text));
   expect(checkpoint.finalizedRevision).toBe(await revision(text));
  }
  const smoothed=files['scene-2.md'];expect(smoothed).toContain('Her sleeve brushed the frame.');
  expect(calls.find(c=>c.stage==='craft-observe' && c.prompt.includes('"id":"SC2"'))?.prompt).toContain('Her sleeve brushed the frame.');
  const writer=calls.find(c=>c.stage==='craft-write' && c.prompt.includes('"sceneId":"SC3"'))!.prompt;
  expect(writer).toContain('Nora took the key.');
  expect(writer).toContain('"resource":"R1","available":false');
  const previousSeams=seams,previousWrites=calls.filter(c=>c.stage==='craft-write').length;
  await runCraftBook(input,store,llm,()=>{});
  expect(seams).toBe(previousSeams);
  expect(calls.filter(c=>c.stage==='craft-write')).toHaveLength(previousWrites);
  expect(store.loadAuthor()!.desk!.files['scene-2.md']).toBe(smoothed);
 });
 it('preserves the author engine across an interrupted orchestrator run and Continue',async()=>{
  const store=new MemoryProjectStore(),calls:{stage:string;prompt:string}[]=[],base=scriptedAuthorLLM(authorArchitecture(),calls);
  const authored={...input,generation_mode:'author' as const};
  const first=await new Orchestrator(store,{maxCalls:250,maxTimeMs:60000}).runBook(authored,async(p,s,o)=>{
   if(o?.stage==='craft-author-execution' && p.includes('"sceneId":"SC2"')) throw new Error('Simulated interruption');
   return base(p,s,o);
  });
  expect(first.status).toBe('FAILED');
  expect(store.loadInput()!.generation_mode).toBe('author');
  const complete=await new Orchestrator(store,{maxCalls:250,maxTimeMs:60000}).runBook(store.loadInput()!,base);
  expect(complete.status).not.toBe('FAILED');
  expect(store.loadInput()!.generation_mode).toBe('author');
  expect(JSON.parse(store.loadAuthor()!.desk!.files['enacted-state.json']).scenes).toHaveLength(3);
 });
 it('retains finalized prose when observation fails and retries only validation on Continue',async()=>{
  const store=new MemoryProjectStore(),calls:{stage:string;prompt:string}[]=[],base=scriptedAuthorLLM(authorArchitecture(),calls);
  let fail=true,seams=0;
  const llm:typeof base=async(p,s,o)=>{
   if(o?.stage==='craft-seam') {
    seams++;
    return p.split('[HEAD_B] (Target to edit — first paragraph of Scene B):\n')[1].split('\n\n[ANCHOR_B]')[0]+' Her sleeve brushed the frame.';
   }
   if(fail && o?.stage==='craft-observe' && p.includes('"id":"SC2"')) return '{';
   return base(p,s,o);
  };
  await expect(runCraftBook(input,store,llm,()=>{})).rejects.toThrow('observer unavailable');
  const files=store.loadAuthor()!.desk!.files;
  const saved=files['scene-2.md'];expect(saved).toContain('Her sleeve brushed the frame.');
  expect(JSON.parse(files['scene-2-state.json']).phase).toBe('written');
  expect(JSON.parse(files['enacted-state.json']).scenes).toHaveLength(1);
  fail=false;
  await runCraftBook(input,store,llm,()=>{});
  expect(store.loadAuthor()!.desk!.files['scene-2.md']).toBe(saved);
  expect(calls.filter(c=>c.stage==='craft-write')).toHaveLength(3);
  expect(seams).toBe(2);
 });

});
