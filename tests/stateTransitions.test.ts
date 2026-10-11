import {premiseReply} from './premiseReplies';
import {expect,it} from 'vitest';
import {readStateTrace,TRANSITION_CHECKS,transitionReviewSchema} from '../utils/novel/v2/stateTransitions';
import {blockContract} from '../utils/novel/v2/blockContract';
import {repairReviewEvidence} from '../utils/novel/v2/reviewEvidenceRepair';
import type {ThesisPlan} from '../utils/novel/v2/theses';
const plan:ThesisPlan={title:'Visit',premise_givens:[],characters:[{id:'C',name:'Jo',goal:'Learn',initial_knowledge:[],capabilities:[],limitations:[]}],ending:'Answer',theses:['T1','T2'].map(id=>({id,chapter:1,pov_id:'C',participants:[{character_id:'C',intention:'Learn',knows:[],does:'Sets the cup on the sill'}],when:'Evening',where:'Room',state_before:'Standing',action:'Talk',why:'Learn',resistance:'Distrust',outcome:'An answer',establishes:[],reader_learns:[],requires:[],writer_task:'Show',target_words:500}))};
const scene='Jo sits down.\n\nJo sits down again.';
const event=(before:string,after:string,evidence='@P0001')=>({character_id:'C',dimension:'posture',subject:'body',before,after,evidence});
function reply(events=[event('standing','seated')]){return {ready:true,issues:[],state_trace:{events,checks:Object.fromEntries(TRANSITION_CHECKS.map(key=>[key,{status:'supported',evidence:'@P0001',explanation:'Jo sits and talks from the chair.'}]))}};}
it('replays an impossible second sitting despite the reviewer claiming everything is supported',()=>{
 const result=readStateTrace(reply([event('standing','seated'),event('standing','seated','@P0002')]),plan,scene,'T1',scene);
 expect(result.issues).toHaveLength(1);expect(result.issues[0]).toMatchObject({severity:'major',kind:'continuity',evidence:'Jo sits down again.',thesis_ids:['T1']});
});
it('allows a second sitting after an evidenced standing transition',()=>{
 const source='Jo sits.\n\nJo stands.\n\nJo sits again.';
 const result=readStateTrace(reply([event('standing','seated'),event('seated','standing','@P0002'),event('standing','seated','@P0003')]),plan,source,'T1',source);
 expect(result.issues).toEqual([]);
});
it('does not invent an entry state when it is unknown, but catches explicit no-op posture actions',()=>{
 expect(readStateTrace(reply([event('unknown','seated')]),plan,scene,'T1',scene).issues).toEqual([]);
 expect(readStateTrace(reply([event('seated','seated')]),plan,scene,'T1',scene).issues[0].kind).toBe('impossible_action');
});
it('turns missing knowledge, incompatible times and missing consequences into addressed repairs',()=>{
 const raw=reply();
 for(const key of ['knowledge_sources','time','choice_consequence'])raw.state_trace.checks[key]={status:'defect',evidence:'@P0001',explanation:`Missing concrete ${key} bridge`};
 const result=readStateTrace(raw,plan,scene,'T1',scene);
 expect(result.issues.map(i=>i.kind)).toEqual(['unsupported_knowledge','continuity','narrative_failure']);
 expect(result.issues.every(i=>i.evidence==='Jo sits down.'&&!!i.required_change)).toBe(true);
});
it('requires all concrete checks and rejects fabricated or context-only current event evidence',()=>{
 const raw=reply();delete raw.state_trace.checks.outcome;
 const partial=readStateTrace(raw,plan,scene,'T1',scene);
 expect(partial.trace.checks.outcome).toBeUndefined();expect(partial.trace.skipped).toBe(1);expect(partial.trace.checks.state_chain!.status).toBe('supported');
 expect(()=>readStateTrace(reply([event('standing','seated','Invented quote')]),plan,scene,'T1',scene)).toThrow('evidence');
 expect(()=>readStateTrace(reply([event('standing','seated','@P0003')]),plan,scene+'\n\nEarlier Jo sat.','T1',scene)).toThrow('current scene');
});
it('passes actual transitions forward and suppresses stale traces after an edit',()=>{
 const result=readStateTrace(reply(),plan,scene,'T1',scene);
 const blocks=[{thesis_id:'T1',text:scene,review:{ready:true,issues:[],state_trace:result.trace}}];
 expect(blockContract(plan,'T2',blocks).continue_from.actual_previous_changes).toEqual(result.trace.events);
 blocks[0].text+='\n\nJo stands.';
 expect(blockContract(plan,'T2',blocks).continue_from.actual_previous_changes).toEqual([]);
});
it('repairs transition citations using current-scene addresses without approving an unsupported check',async()=>{
 const raw=reply();raw.state_trace.checks.outcome.evidence='Paraphrase';
 await expect(repairReviewEvidence(raw,scene+'\n\nEarlier Jo sat.',async(prompt)=>{
  expect(prompt).toContain('allowed_addresses');
  return JSON.stringify({references:[{path:'state_trace.checks.outcome',evidence:'@P0001',supported:false,explanation:'No actual answer occurs.'}]});
 },'','review',scene)).rejects.toThrow('Unverified review evidence');
 expect(raw.state_trace.checks.outcome.status).toBe('supported');
});
it('does not let the citation locator fabricate an extracted state event',async()=>{
 const raw=reply([event('standing','seated','Old quote')]);
 await expect(repairReviewEvidence(raw,scene,async()=>JSON.stringify({references:[{path:'state_trace.events.0',evidence:'@P0001',supported:false,explanation:'This action is absent.'}]}),'','review',scene)).rejects.toThrow('Unverified review evidence');
 const schema=transitionReviewSchema(['C'],['@P0001']);
 expect(schema.required).toContain('state_trace');
 expect(schema.properties.state_trace.properties.checks.required).toEqual([...TRANSITION_CHECKS]);
});

import {Orchestrator} from '../utils/novel/v2/orchestrator';
import {MemoryProjectStore} from '../utils/novel/v2/store';
it('routes a replay-detected defect into the existing writer repair even when the model returned ready:true',async()=>{
 const store=new MemoryProjectStore();let repairing=false;
 const outline={...plan,theses:plan.theses.map(t=>({...t,fact_ids:t.id==='T1'?['F1']:[],target_words:8})),canon:{resolution:plan.ending,facts:[{id:'F1',truth:'Jo sits.',established_in:'T1',knowledge:[]}]}};
 const result=await new Orchestrator(store).runBook({premise:'Jo questions a witness.',author_requirements:'',genre:'mystery',chapter_count:1,target_total_words:16,generation_mode:'theses',planning_version:2},async(prompt,_system,options)=>{
  {const premise=premiseReply(options);if(premise)return premise;}
  if(options?.stage==='thesis-synopsis')return 'A witness interview.';
  if(options?.stage==='thesis-plan')return JSON.stringify(outline);
  if(options?.stage==='thesis-plan-review')return JSON.stringify({ready:true,issues:[]});
  if(options?.stage==='thesis-block-write')return scene;
  if(options?.stage==='thesis-block-review')return JSON.stringify(reply([event('standing','seated'),event('standing','seated','@P0002')]));
  if(options?.stage==='thesis-block-repair'){
   repairing=true;expect(prompt).toContain('previous state was seated');
   throw new Error('Test stops at verified writer repair boundary');
  }
  throw new Error(`Unexpected stage ${options?.stage}`);
 });
 expect(repairing,result.stoppedReason).toBe(true);expect(result.stoppedReason).toContain('verified writer repair boundary');
 expect(store.loadTheses()!.pending!.review).toMatchObject({ready:false,state_trace:{events:expect.any(Array)}});
 expect(store.loadTheses()!.pending!.review!.issues[0].kind).toBe('continuity');
});

it('does not turn free-text wording differences into mechanical story defects',()=>{
 const raw:any=reply();raw.state_trace.events=[
 {character_id:'C',dimension:'location',subject:'place',before:'street',after:'office',evidence:'@P0001'},
 {character_id:'C',dimension:'location',subject:'place',before:'her office',after:'hallway',evidence:'@P0002'},
 ];
 const result=readStateTrace(raw,plan,scene,'T1',scene);
 expect(result.issues).toEqual([]);expect(result.trace.wording_mismatches).toHaveLength(1);
 raw.state_trace.checks.state_chain.status='defect';
 raw.state_trace.checks.state_chain.explanation='Jo is in a different building with no transition.';
 expect(readStateTrace(raw,plan,scene,'T1',scene).issues[0].kind).toBe('continuity');
});
it('keeps the scene review when its state trace cannot be read',async()=>{
 const store=new MemoryProjectStore();
 const outline={...plan,theses:plan.theses.map(t=>({...t,fact_ids:t.id==='T1'?['F1']:[],target_words:8})),canon:{resolution:plan.ending,facts:[{id:'F1',truth:'Jo sits.',established_in:'T1',knowledge:[]}]}};
 const broken:any=reply();broken.state_trace.events.forEach((e:any)=>{e.character_id='WALK_ON';});
 await new Orchestrator(store).runBook({premise:'Jo questions a witness.',author_requirements:'',genre:'mystery',chapter_count:1,target_total_words:16,generation_mode:'theses',planning_version:2},async(_prompt,_system,options)=>{
  {const premise=premiseReply(options);if(premise)return premise;}
  if(options?.stage==='thesis-plan')return JSON.stringify(outline);
  if(options?.stage==='thesis-plan-review')return JSON.stringify({ready:true,issues:[]});
  if(options?.stage==='thesis-block-write')return scene;
  if(options?.stage==='thesis-block-review')return JSON.stringify(broken);
  throw new Error(`Stop at ${options?.stage}`);
 });
 const draft=store.loadTheses()!;
 expect(draft.blocks.length).toBeGreaterThan(0);
 expect(draft.blocks[0].review).toEqual({ready:true,issues:[]});
 expect(draft.review_failures![0]).toMatchObject({thesis_id:'T1',phase:'block-trace'});
});
it('tells the writer what this model repeated before, and remembers a move it makes again',async()=>{
 const store=new MemoryProjectStore();const prompts:string[]=[];let saved:any[]=[];
 const outline={...plan,theses:plan.theses.map(t=>({...t,fact_ids:t.id==='T1'?['F1']:[],target_words:8})),canon:{resolution:plan.ending,facts:[{id:'F1',truth:'Jo sits.',established_in:'T1',knowledge:[]}]}};
 const memory={load:()=>[{device:'Heart pounding for fear',markers:['hammered','ribs'],example:'Her heart hammered against her ribs.'}],save:(habits:any[])=>{saved=habits;}};
 await new Orchestrator(store,undefined,null,()=>{},memory).runBook({premise:'Jo questions a witness.',author_requirements:'',genre:'mystery',chapter_count:1,target_total_words:16,generation_mode:'theses',planning_version:2},async(prompt,_system,options)=>{
  if(options?.stage==='thesis-habits')return JSON.stringify({habits:[{device:'Smile that fails',markers:['reach','eyes'],example:''}]});
  {const premise=premiseReply(options);if(premise)return premise;}
  if(options?.stage==='thesis-plan')return JSON.stringify(outline);
  if(options?.stage==='thesis-plan-review')return JSON.stringify({ready:true,issues:[]});
  if(options?.stage==='thesis-block-write'){prompts.push(prompt);return 'Jo sat down, and her heart hammered against her ribs.\n\nThe smile did not reach his eyes.';}
  if(options?.stage==='thesis-block-review')return JSON.stringify(reply([event('standing','seated')]));
  throw new Error(`Stop at ${options?.stage}`);
 });
 expect(prompts[0]).toContain("Heart pounding for fear (this writer's habit in earlier books");
 expect(prompts[1]).toContain('Heart pounding for fear (already written 1 time,');
 expect(prompts[1]).toContain('Smile that fails (already written 1 time,');
 expect(saved.map(habit=>habit.device)).toContain('Heart pounding for fear');
 expect(store.loadTheses()!.habits!.map(habit=>habit.device)).toEqual(['Heart pounding for fear','Smile that fails']);
});

it('keeps the entries of a trace that can be read when one names a walk-on or cites another scene',()=>{
 const source=scene+'\n\nEarlier Jo sat.';
 const other=`@P${String(source.split(/\n\s*\n/).length).padStart(4,'0')}`;
 const raw:any=reply([event('standing','seated'),{...event('standing','seated'),character_id:'CLERK'},event('seated','standing',other)]);
 raw.state_trace.checks.outcome.evidence='A paraphrase, not a passage';
 const result=readStateTrace(raw,plan,source,'T1',scene);
 expect(result.trace.events).toHaveLength(1);
 expect(result.trace.skipped).toBe(3);
 expect(result.trace.checks.outcome).toBeUndefined();
 expect(result.trace.checks.state_chain!.status).toBe('supported');
 expect(result.issues).toEqual([]);
});
