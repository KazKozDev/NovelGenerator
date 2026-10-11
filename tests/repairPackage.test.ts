import {it,expect} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import RepairProgressView from '../components/RepairProgressView';
import {factDependencies,planAgent} from '../utils/novel/v2/planTools';
import {commitRepairPackage,repairRevision,repairReport,packageDiff} from '../utils/novel/v2/repairPackage';
import {causalRepairOrder} from '../utils/novel/v2/causalRepairOrder';
import {manuscriptAgent} from '../utils/novel/v2/manuscriptTools';
import type {ThesisPlan,ThesisDraft,RepairVerification,ThesisReview} from '../utils/novel/v2/theses';

const plan:ThesisPlan={title:'Letter',premise_givens:[],ending:'Jo stays',characters:[{id:'C',name:'Jo',goal:'Choose',initial_knowledge:[],capabilities:[],limitations:[]}],canon:{resolution:'Jo stays',facts:[{id:'F1',truth:'The letter arrived',established_in:'T1',knowledge:[{character_id:'C',learned_in:'T2'}]},{id:'F2',truth:'Unrelated history',established_in:'INITIAL',knowledge:[]}]},theses:[1,2,3,4].map(n=>({id:`T${n}`,chapter:1,pov_id:'C',participants:[{character_id:'C',intention:'Choose',knows:[]}],when:'Morning',where:'Home',state_before:'Undecided',action:'Read',why:'Choose',resistance:'Fear',outcome:'Choice',establishes:[],reader_learns:[],requires:n===3?['T2']:[],fact_ids:n===1?['F1']:n===4?['F2']:[],writer_task:'Show the choice',target_words:100}))};
const original:ThesisReview['issues']=[{severity:'major',thesis_ids:['T1'],problem:'Missing letter',required_change:'Show the letter'}];
const verification:RepairVerification={accepted:true,checks:[{issue:0,status:'repaired',evidence:'Jo reads the letter.',explanation:'The source is shown'}],issues:[]};
const draft=():ThesisDraft=>({version:1,input_key:'test',plan:structuredClone(plan),plan_ready:true,rounds:[],blocks:plan.theses.map(t=>({thesis_id:t.id,text:'Original '+t.id,review:{ready:true,issues:[]}})),pending:null,completed:false});
const validate=(raw:unknown)=>raw as ThesisPlan;

it('finds sources, knowledge acquisition and transitive consequences without including unrelated facts',()=>{
  const links=factDependencies(plan,'F1',[{id:'T2',text:'Jo reads the letter.'}],'letter');
  expect(links.scenes.map(s=>s.id)).toEqual(['T1','T2','T3']);
  expect(links.scenes[1].reasons).toContain('learned_by:C');
  expect(links.scenes[2].reasons).toContain('depends_on:T2');
  expect(links.prose_matches[0].block_id).toBe('T2');
  expect(()=>factDependencies(plan,'MISSING')).toThrow('Unknown');
});

it('makes dependency and repair inspection tools available to both agents',async()=>{
  const commands=[{tool:'fact_dependencies',id:'F1'},{tool:'repair_status'},{tool:'package_diff'},{tool:'finish'}];
  await planAgent(async prompt=>{if(commands.length===3)expect(prompt).toContain('learned_by:C');return JSON.stringify(commands.shift());},plan,'Repair','',{stage:'repair',key:'tools',validate,onRepairRead:()=>({remaining:1})});
  const reads:string[]=[];
  const manuscriptCommands=[{tool:'fact_dependencies',id:'F1'},{tool:'repair_status'},{tool:'package_diff'},{tool:'finish'}];
  await manuscriptAgent(async()=>JSON.stringify(manuscriptCommands.shift()),[{id:'T1',text:'Original'}],'Repair','',{stage:'repair',writable:['T1'],onPlanRead:(command,current)=>{reads.push(command.tool);expect(current[0].text).toBe('Original');return factDependencies(plan,command.id,current);},onRepairRead:command=>{reads.push(command.tool);return {remaining:1};}});
  expect(reads).toEqual(['fact_dependencies','repair_status','package_diff']);
});

it('commits the entire verified plan and prose snapshot without mutating the accepted base',()=>{
  const before=draft(),candidate=before.blocks.map(b=>({id:b.thesis_id,text:b.thesis_id==='T1'?'Jo reads the letter.':b.text}));
  const nextPlan=structuredClone(plan);nextPlan.theses[0].action='Open and read';
  const next=commitRepairPackage(before,nextPlan,candidate,[{block_id:'T1',before:'Original T1',after:'Jo reads the letter.'}],verification,repairRevision(plan,before.blocks.map(b=>({id:b.thesis_id,text:b.text}))),repairRevision(nextPlan,candidate),validate);
  expect(next.plan!.theses[0].action).toBe('Open and read');expect(next.blocks[0].text).toBe('Jo reads the letter.');expect(next.blocks[0].review.ready).toBe(false);
  expect(before.blocks[0].text).toBe('Original T1');expect(before.plan!.theses[0].action).toBe('Read');
  expect(next.blocks[1]).toEqual(before.blocks[1]);
  expect(packageDiff(plan,nextPlan,before.blocks,candidate).text_changes.map(c=>c.id)).toEqual(['T1']);
});

it('rejects unresolved, stale and altered-after-review packages without changing accepted prose',()=>{
  const before=draft(),blocks=before.blocks.map(b=>({id:b.thesis_id,text:b.text})),revision=repairRevision(plan,blocks);
  const commit=(v=verification,base=revision,verified=revision,rows=blocks)=>commitRepairPackage(before,plan,rows,[],v,base,verified,validate);
  expect(()=>commit({...verification,accepted:false})).toThrow('unresolved');
  expect(()=>commit({...verification,issues:original})).toThrow('unresolved');
  expect(()=>commit(verification,'old base')).toThrow('stale');
  expect(()=>commit(verification,revision,revision,[{...blocks[0],text:'Changed'},...blocks.slice(1)])).toThrow('after verification');
  expect(()=>commit(verification,revision,repairRevision(plan,blocks.slice(1)),blocks.slice(1))).toThrow('retain');
  expect(before).toEqual(draft());
});

it('reports resolved originals and new defects separately rather than counting edits as progress',()=>{
  const newIssue={...original[0],problem:'New timeline contradiction',thesis_ids:['T3']};
  const report=repairReport('package',plan,[{id:'T1',text:'Changed'}],original,{...verification,accepted:false,issues:[newIssue,newIssue]});
  expect(report.resolved).toHaveLength(1);expect(report.remaining).toHaveLength(0);expect(report.introduced).toHaveLength(1);expect(report.status).toBe('rejected');
  const repeated=repairReport('package',plan,[],original,{...verification,accepted:false,issues:original});
  expect(repeated.remaining).toHaveLength(1);expect(repeated.introduced).toHaveLength(0);
  const html=renderToStaticMarkup(React.createElement(RepairProgressView,{report}));
  expect(html).toContain('Returned for repair');expect(html).toContain('New defects');expect(html).toContain(newIssue.problem);
});

it('does not expand repair scope through every unchanged canonical fact',()=>{
  const after=structuredClone(plan);after.canon!.facts[0].truth='The sealed letter arrived';
  const blocks=draft().blocks;
  const order=causalRepairOrder(plan,after,[],blocks);
  expect(order).toContain('T1');expect(order).not.toContain('T4');
});
