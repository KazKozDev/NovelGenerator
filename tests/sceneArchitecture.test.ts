import {premiseReply} from './premiseReplies';
import {developmentResponse} from './chapterDevelopment.fixture';
import {expect,it} from 'vitest';
import {TRANSITION_CHECKS} from '../utils/novel/v2/stateTransitions';
const transitionReply=()=>JSON.stringify({ready:true,issues:[],state_trace:{events:[{character_id:'C1',dimension:'activity',subject:'choice',before:'unknown',after:'choice recorded',evidence:'@P0001'}],checks:Object.fromEntries(TRANSITION_CHECKS.map(key=>[key,{status:'supported',evidence:'@P0001',explanation:'The supplied scene records the choice and its response.'}]))}});
import {chapterBudget,sceneRequirements,sceneCoverage,repartitionProse} from '../utils/novel/v2/sceneBudget';
import {validateCanon,canonContext} from '../utils/novel/v2/storyCanon';
import {allocateThesisWords,validateThesisDraft,type ThesisPlan} from '../utils/novel/v2/theses';
import type {ProjectInput} from '../utils/novel/v2/types';
const input:ProjectInput={premise:'An estranged pair rebuilds trust.',genre:'romance',chapter_count:2,target_total_words:6800,generation_mode:'progressive',author_requirements:''};
function plan():ThesisPlan {
 return {title:'Trust',premise_givens:[],characters:[{id:'C1',name:'Jo',goal:'Reconcile',initial_knowledge:[],capabilities:[],limitations:[]}],ending:'A mutual choice',canon:{resolution:'A mutual choice',facts:[{id:'F1',truth:'Jo receives the letter.',established_in:'S1',knowledge:[{character_id:'C1',learned_in:'S1'}]}]},theses:Array.from({length:8},(_,i)=>({id:`S${i+1}`,chapter:i<4?1:2,pov_id:'C1',fact_ids:['F1'],participants:[{character_id:'C1',intention:'Find trust',knows:[],does:'Folds the letter into the drawer'}],when:`Day ${i+1}`,where:'Home',state_before:'Trust damaged',action:`Choice ${i+1}`,why:'Trust matters',resistance:'Fear',outcome:`Consequence ${i+1}`,establishes:['Action occurs'],reader_learns:[],requires:i?[`S${i}`]:[],writer_task:'Show the choice',target_words:i<4?100:1000}))};
}
it('allocates the interface target to each chapter despite unequal model weights',()=>{
 const allocated=allocateThesisWords(plan(),input);
 expect([1,2].map(ch=>allocated.theses.filter(t=>t.chapter===ch).reduce((sum,t)=>sum+t.target_words,0))).toEqual([3400,3400]);
 expect(sceneCoverage(allocated,input)).toEqual([]);
 const skewed=plan();skewed.theses[0].target_words=100000;
 const bounded=allocateThesisWords(skewed,input);
 expect(bounded.theses.every(t=>t.target_words<=1100)).toBe(true);
 expect(allocateThesisWords(bounded,input)).toEqual(bounded);
 expect(sceneRequirements(input).map(r=>r.minimum_scenes)).toEqual([4,4]);
 expect(Array.from({length:3},(_,i)=>chapterBudget({...input,chapter_count:3,target_total_words:1001},i+1)).reduce((a,b)=>a+b,0)).toBe(1001);
});
it('rejects future character knowledge and missing source-scene references',()=>{
 const p=plan();expect(()=>validateCanon(p)).not.toThrow();
 p.canon!.facts[0].established_in='S4';expect(()=>validateCanon(p)).toThrow('precedes');
 p.canon!.facts[0].established_in='S1';p.theses[0].fact_ids=[];expect(()=>validateCanon(p)).toThrow('source scene');
});
it('derives the stored resolution from the single model ending without losing fact checks',()=>{
 const raw=plan();delete (raw.canon as any).resolution;
 const normalized=allocateThesisWords(raw,input);
 expect(normalized.canon!.resolution).toBe(raw.ending);
 expect((raw.canon as any).resolution).toBeUndefined();
 const stale=plan();stale.canon!.resolution='An obsolete duplicate wording';
 expect(allocateThesisWords(stale,input).canon!.resolution).toBe(stale.ending);
 raw.canon!.facts=[];
 expect(()=>allocateThesisWords(raw,input)).toThrow('nonempty facts array');
 const contradiction=plan();contradiction.canon!.facts[0].established_in='S4';
 expect(()=>allocateThesisWords(contradiction,input)).toThrow('precedes');
});
it('gives the writer canonical facts and only knowledge earned earlier',()=>{
 expect(canonContext(plan(),'S1')!.available_knowledge[0].facts).toEqual([]);
 expect(canonContext(plan(),'S2')!.available_knowledge[0].facts).toEqual(['F1']);
 const initial=plan();initial.canon!.facts[0].established_in='INITIAL';initial.canon!.facts[0].knowledge[0].learned_in='INITIAL';
 expect(()=>validateCanon(initial)).not.toThrow();expect(canonContext(initial,'S1')!.available_knowledge[0].facts).toEqual(['F1']);
 initial.canon!.facts[0].established_in='S4';expect(()=>validateCanon(initial)).toThrow('precedes');
});
it('divides legacy chapters without deleting or inventing any manuscript text',()=>{
 const before=plan();before.theses=[before.theses[0],{...before.theses[4],id:'OLD2'}];
 const first=Array.from({length:20},(_,i)=>`Paragraph ${i} carries a distinct event.`).join('\n\n');
 const second=Array.from({length:20},(_,i)=>`Later paragraph ${i} has a consequence.`).join('\n\n');
 const migrated=repartitionProse(before,plan(),[{thesis_id:'S1',text:first,review:{ready:true,issues:[]}},{thesis_id:'OLD2',text:second,review:{ready:true,issues:[]}}]);
 expect(migrated.slice(0,4).map(b=>b.text).join('')).toBe(first);
 expect(migrated.slice(4).map(b=>b.text).join('')).toBe(second);
 expect(migrated.every(b=>!b.review.ready&&b.text.trim())).toBe(true);
});

import {Orchestrator} from '../utils/novel/v2/orchestrator';
import {MemoryProjectStore} from '../utils/novel/v2/store';
import {QUALITY_KEYS} from '../utils/novel/v2/storyQuality';
import type {NovelLLM} from '../utils/novel/v2/llm';
it('refines the same original defects, then commits canonical plan and prose together',async()=>{
 const store=new MemoryProjectStore();
 const request={...input,planning_version:2 as const,chapter_count:1,target_total_words:8};
 const outline=plan();outline.theses=[{...outline.theses[0],target_words:8}];
 const old='Jo chooses reconciliation without reading the crucial letter.';
 const fixed='Jo reads the letter then chooses mutual reconciliation.';
 const defects=[0,1].map(index=>({severity:'major',kind:'missing_event',thesis_ids:['S1'],evidence:'@P0001',consequence:'The choice has no established cause',problem:`Missing step ${index}`,required_change:`Establish step ${index}`}));
 let reviews=0,proposals=0,approvals=0,searched=false,patched=false;
 const llm:NovelLLM=async(prompt,_system,options)=>{
  const stage=options?.stage;
  {const premise=premiseReply(options);if(premise)return premise;}
  if(stage==='thesis-chapter-development')return developmentResponse(prompt);
  if(stage==='thesis-synopsis')return 'A letter changes a choice.';
  if(stage==='thesis-plan')return JSON.stringify(outline);
  if(stage==='thesis-rough-review') {reviews++;return JSON.stringify({ready:patched,issues:patched?[]:defects});}
  if(stage==='thesis-rough-reconcile') {proposals++;return JSON.stringify({plan:{...outline,theses:[{...outline.theses[0],action:`Jo reads the letter and makes choice, proposal ${proposals}`}]}});}
  if(stage==='thesis-causal-review') {
   approvals++;expect(store.loadTheses()!.blocks[0].text).toBe(old);
   const ready=approvals>=3;
   return JSON.stringify({ready,checks:[0,1].map(issue=>({issue,status:ready||approvals===2&&issue===0?'repaired':'unresolved',evidence:'@P0001',explanation:'Candidate scene must earn the choice'})),issues:ready?[]:[{...defects[1],problem:'Candidate choice still lacks its prerequisite'}]});
  }
  if(stage==='thesis-rough-repair') {
   expect(store.loadTheses()!.blocks[0].text).toBe(old);
   if(!searched){searched=true;return JSON.stringify({tool:'search',query:'letter'});}
   if(!patched){patched=true;return JSON.stringify({tool:'replace',edits:[{block_id:'S1',before:old,after:fixed}]});}
   return JSON.stringify({tool:'finish',text:'Scene aligned'});
  }
  if(stage==='thesis-rough-verify')return JSON.stringify({ready:true,checks:[0,1].map(issue=>({issue,status:'repaired',evidence:'@P0001',explanation:'The letter precedes the choice in the actual text'})),issues:[]});
  if(stage==='thesis-block-write')return JSON.stringify({tool:'finish',text:old});
  if(stage==='thesis-expand'||stage==='thesis-polish')return JSON.stringify(prompt.includes('Required first: search')?{tool:'search',query:'letter'}:{tool:'finish',text:'Complete'});
  if(stage?.endsWith('review')) return (options?.schema as any)?.properties?.state_trace ? transitionReply():JSON.stringify({ready:true,issues:[]});
  if(stage==='thesis-final-audit')return JSON.stringify({summary:'The letter earns the choice',supported:true,findings:[],checks:Object.fromEntries([...QUALITY_KEYS,'transitions','causality','repeated_events'].map(key=>[key,{passed:true,evidence:'Jo reads the letter before choosing reconciliation'}]))});
  throw new Error(`Unexpected stage ${stage}`);
 };
 const result=await new Orchestrator(store).runBook(request,llm);
 expect(result.status,result.stoppedReason).toBe('COMPLETE');
 expect(proposals).toBe(3);expect(reviews).toBe(2);
 expect(store.loadTheses()!.blocks[0].text).toBe(fixed);
 expect(store.loadTheses()!.plan!.theses[0].action).toContain('proposal 3');
 expect(store.loadTheses()!.repair_reports!.at(-1)!.status).toBe('committed');
 expect(store.loadTheses()!.repair_reports!.at(-1)!.resolved).toHaveLength(2);
 expect(store.runLog().some(log=>log.stage==='repair_progress')).toBe(true);
});

import {inputKey} from '../utils/novel/v2/progressive';
it('upgrades an existing coarse book to multiple scenes and reaches the user chapter targets without rewriting its rough draft',async()=>{
 const store=new MemoryProjectStore();const request={...input,planning_version:2 as const,target_total_words:2400};
 const designed=plan();designed.theses=[designed.theses[0],designed.theses[1],{...designed.theses[4],id:'S3'},{...designed.theses[5],id:'S4'}].map((t,i)=>({...t,requires:i?[`S${i}`]:[],target_words:600}));
 const coarse={...designed,canon:undefined,theses:[{...designed.theses[0],target_words:1200},{...designed.theses[2],target_words:1200,requires:['S1']} ]};
 const original=coarse.theses.map((t,i)=>({thesis_id:t.id,text:Array.from({length:10},(_,p)=>`Chapter ${i+1} existing paragraph ${p} records a choice.`).join('\n\n'),review:{ready:true,issues:[]}}));
 store.saveInput(request);store.saveTheses({version:1,input_key:inputKey(request),plan:coarse,plan_ready:false,budget_replan:true,rounds:[{plan:coarse,review:null}],blocks:original,pending:null,completed:false,manifestation:{phase:'rough',next:0,versions:[]}});
 let redesigned=0,coverageRepairs=0;const expanded=new Set<string>();
 const llm:NovelLLM=async(prompt,_system,options)=>{
  const stage=options?.stage;
  {const premise=premiseReply(options);if(premise)return premise;}
  if(stage==='thesis-scene-design'){redesigned++;return JSON.stringify({...designed,theses:designed.theses.slice(0,3)});}
  if(stage==='thesis-scene-coverage'){coverageRepairs++;expect(prompt).toContain('ONLY chapter 2 is underplanned');return JSON.stringify({theses:designed.theses.slice(2),canon:designed.canon});}
  if(stage==='thesis-block-write')throw new Error('Must preserve, not regenerate existing rough prose');
  if(stage==='thesis-expand') {
   const thesis=JSON.parse(prompt.split('Current thesis: ')[1].split('\nEvent ownership')[0]);
   if(!expanded.has(thesis.id)) {
    expanded.add(thesis.id);const before=store.loadTheses()!.blocks.find(b=>b.thesis_id===thesis.id)!.text;
    return JSON.stringify({tool:'replace',edits:[{block_id:thesis.id,before,after:Array(600).fill(`event-${thesis.id}`).join(' ')}]});
   }
   return JSON.stringify({tool:'finish',text:'Scene complete'});
  }
  if(stage==='thesis-polish')return JSON.stringify(prompt.includes('Required first: search')?{tool:'search',query:'event'}:{tool:'finish',text:'No further edits'});
  if(stage?.endsWith('review'))return (options?.schema as any)?.properties?.state_trace ? transitionReply():JSON.stringify({ready:true,issues:[]});
  if(stage==='thesis-final-audit')return JSON.stringify({summary:'Choices lead to reconciliation',supported:true,findings:[],checks:Object.fromEntries([...QUALITY_KEYS,'transitions','causality','repeated_events'].map(key=>[key,{passed:true,evidence:'Distinct scenes own setup, choice and consequences'}]))});
  throw new Error(`Unexpected stage ${stage}`);
 };
 const result=await new Orchestrator(store).runBook(request,llm);
 expect(result.status,result.stoppedReason).toBe('COMPLETE');expect(redesigned).toBe(1);expect(coverageRepairs).toBe(1);
 expect(store.loadTheses()!.manifestation!.versions.find(v=>v.phase==='before-scene-design')!.blocks).toEqual(original);
 expect(store.manuscript().map(chapter=>chapter.text.match(/\S+/g)!.length)).toEqual([1200,1200]);
 expect(store.loadTheses()!.plan!.theses).toHaveLength(4);
 expect(()=>validateThesisDraft(store.loadTheses(),request)).not.toThrow();
});

 it('derives missing source-scene fact links without inventing sources',()=>{
 const raw=plan();for(const thesis of raw.theses) delete thesis.fact_ids;
 const normalized=allocateThesisWords(raw,input);
 expect(normalized.theses[0].fact_ids).toEqual(['F1']);
 expect(normalized.theses[1].fact_ids).toEqual([]);
 expect(raw.theses[0].fact_ids).toBeUndefined();
 const unknown=plan();unknown.canon!.facts[0].established_in='UNKNOWN';
 expect(()=>allocateThesisWords(unknown,input)).toThrow('unknown source');
 });
 it('allows initial background facts without forcing a new scene event',()=>{
 const raw=plan();raw.canon!.facts[0].established_in='INITIAL';raw.canon!.facts[0].knowledge[0].learned_in='INITIAL';
 for(const thesis of raw.theses) thesis.fact_ids=[];
 expect(()=>validateCanon(raw)).not.toThrow();
 expect(canonContext(raw,'S1')!.available_knowledge[0].facts).toEqual(['F1']);
 });
