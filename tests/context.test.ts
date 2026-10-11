import {expect,it} from 'vitest';
import {planEvidenceSource,scenePlanContext,sceneContractContext,toolHistoryContext,findingsContext} from '../utils/novel/v2/context';
import {proseEvidence,resolveProseEvidence} from '../utils/novel/v2/proseEvidence';
import {manuscriptAgent} from '../utils/novel/v2/manuscriptTools';
import type {ThesisPlan} from '../utils/novel/v2/theses';

const plan:ThesisPlan={title:'Letter',premise_givens:['A letter changes a choice'],ending:'Jo stays',characters:[{id:'C1',name:'Jo',goal:'Choose',initial_knowledge:[],capabilities:[],limitations:[]}],canon:{resolution:'Jo stays',facts:[{id:'F1',truth:'The letter arrives',established_in:'T1',knowledge:[{character_id:'C1',learned_in:'T1'}]},{id:'F2',truth:'Distant unrelated fact',established_in:'T20',knowledge:[]}]},theses:Array.from({length:20},(_,i)=>({id:`T${i+1}`,chapter:1,pov_id:'C1',participants:[{character_id:'C1',intention:'Choose',knows:[]}],when:'Morning',where:'Home',state_before:'Undecided',action:i===19?'Distant unrelated action':'Reads the letter',why:'Needs an answer',resistance:'Fear',outcome:'Decision',fact_ids:[i===19?'F2':'F1'],establishes:[],reader_learns:['New clue'],requires:i?[`T${i}`]:[],writer_task:'Show the choice',target_words:500}))};

it('addresses individual plan fields without expanding an evidence citation into the entire plan',()=>{
  const source=planEvidenceSource(plan),evidence=proseEvidence(source);
  const ref=[...evidence.references].find(([,text])=>text.startsWith('fact:F1.truth:'))![0];
  expect(resolveProseEvidence(ref,source)).toBe('fact:F1.truth: "The letter arrives"');
  expect([...evidence.references.values()].every(p=>p.length<1000)).toBe(true);
  expect(source).toContain('thesis:T20.action: "Distant unrelated action"');
});

it('keeps neighbors, dependencies, source facts and ending while omitting unrelated scenes from local prompts',()=>{
  const local=scenePlanContext(plan,'T5');
  expect(local.theses.map(t=>t.id)).toEqual(['T1','T4','T5','T6']);
  expect(local.canon!.facts.map(f=>f.id)).toEqual(['F1']);
  expect(local.ending).toBe(plan.ending);
  expect(JSON.stringify(local)).not.toContain('Distant unrelated');
  const blocks=plan.theses.map(t=>({thesis_id:t.id,text:'Already written',review:{ready:true,issues:[]}}));
  const contract=sceneContractContext(plan,'T5',blocks);
  expect(contract.handoff.next_owner).toBe('T6');
  expect(contract.earlier_block_ids).toEqual(['T1','T2','T3','T4']);
  expect(contract.already_written.map(t=>t.owner)).toEqual(['T1','T4']);
  expect(JSON.stringify(contract)).not.toContain('Distant unrelated');
  expect(JSON.stringify(local).length).toBeLessThan(JSON.stringify(plan).length/2);
});

it('compacts applied edit history but preserves the newest exact read and the full checkpoint',()=>{
  const large='old source '.repeat(3000);
  const history=[{command:{tool:'replace',edits:[{block_id:'T1',before:large,after:'New source'}]},result:{applied:1,blocks:['T1']}},{command:{tool:'read',block_id:'T1'},result:{text:'Exact current source'}}];
  const context=JSON.stringify(toolHistoryContext(history));
  expect(context).not.toContain(large);
  expect(context).toContain('New source');
  expect(context).toContain('Exact current source');
  expect(history[0].command.edits![0].before).toBe(large);
  const bounded=toolHistoryContext(Array.from({length:8},(_,i)=>({command:{tool:'read',block_id:`T${i}`},result:{text:`${i}:`+'x'.repeat(6000)}})));
  expect(JSON.stringify(bounded).length).toBeLessThan(20000);
  expect(JSON.stringify(bounded)).toContain('7:'+'x'.repeat(6000));
});

it('shortens legacy oversized quotes in prompts without changing the saved defect or its consequence',()=>{
  const issue={problem:'Contradictory chronology',required_change:'Align source dates',evidence:'x'.repeat(50000)};
  const prompt=findingsContext([issue]);
  expect(prompt.length).toBeLessThan(2200);
  expect(prompt).toContain(issue.problem);
  expect(issue.evidence.length).toBe(50000);
});

it('lets the manuscript agent fetch omitted plan sources without replacing prose or counting as manuscript search',async()=>{
  const commands=[{tool:'read_plan',section:'fact',id:'F1'},{tool:'search',query:'letter'},{tool:'finish'}];
  let reads=0;
  await manuscriptAgent(async prompt=>{
    expect(prompt).toContain('Read-only plan tools');
    if(commands.length===2)expect(prompt).toContain('The letter arrives');
    return JSON.stringify(commands.shift());
  },[{id:'T1',text:'Jo reads the letter.'}],'Repair','',{stage:'edit',writable:['T1'],requireSearch:true,onPlanRead:()=>{reads++;return {truth:'The letter arrives'};}});
  expect(reads).toBe(1);
});
