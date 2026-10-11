import { expect,it } from 'vitest';
import { planAgent,readPlan,searchPlan,linkedPlan,patchPlan,type PlanSession } from '../utils/novel/v2/planTools';
import { readThesisPlan,type ThesisPlan } from '../utils/novel/v2/theses';
const input={premise:'Jo finds a letter',genre:'drama',chapter_count:1,target_total_words:1000,author_requirements:''};
const plan:ThesisPlan={title:'Letter',premise_givens:[],ending:'Jo stays',characters:[{id:'C1',name:'Jo',goal:'Choose',initial_knowledge:[],capabilities:[],limitations:[]}],canon:{resolution:'Jo stays',facts:[{id:'F1',truth:'The letter arrives',established_in:'T1',knowledge:[{character_id:'C1',learned_in:'T1'}]}]},theses:[1,2].map(n=>({id:`T${n}`,chapter:1,pov_id:'C1',participants:[{character_id:'C1',intention:'Choose',knows:[]}],when:'Morning',where:'Home',state_before:'Undecided',action:n===1?'Reads the letter':'Chooses to stay',why:'Needs an answer',resistance:'Fear',outcome:'Decision',fact_ids:['F1'],establishes:[],reader_learns:[],requires:n===2?['T1']:[],writer_task:'Show the choice',target_words:500}))};
const validate=(raw:unknown)=>readThesisPlan(raw,input);
const edit={section:'thesis' as const,id:'T1',field:'action',before:'Reads the letter',after:'Opens the envelope and reads the letter'};
it('reads exact fields and searches and follows canonical/dependency links without supplying the whole plan',()=>{
  expect(readPlan(plan,'thesis','T1','action').value).toBe('Reads the letter');
  expect(searchPlan(plan,'letter').some(row=>row.block_id==='fact:F1')).toBe(true);
  expect(linkedPlan(plan,'T1').related_theses.map(t=>t.id)).toEqual(['T1','T2']);
  expect(()=>readPlan(plan,'thesis','missing')).toThrow('Unknown');
});
it('applies exact field transactions without changing sound unrelated data',()=>{
  const changed=patchPlan(plan,[edit],validate);
  expect(changed.theses[0].action).toBe(edit.after);expect(plan.theses[0].action).toBe(edit.before);
  expect(changed.theses[1]).toEqual(plan.theses[1]);expect(changed.canon).toEqual(plan.canon);
});
it('rejects stale, immutable and structurally invalid batches atomically',()=>{
  expect(()=>patchPlan(plan,[edit,{...edit,id:'T2',before:'Wrong value'}],validate)).toThrow('Stale');
  expect(()=>patchPlan(plan,[{...edit,field:'id',before:'T1',after:'New'}],validate)).toThrow('immutable');
  expect(()=>patchPlan(plan,[edit,{...edit,field:'pov_id',before:'C1',after:'Missing'}],validate)).toThrow();
  expect(plan.theses[0].action).toBe(edit.before);
});
it('recovers from rejected tool commands and finishes a validated candidate for independent review',async()=>{
  const commands=[{tool:'read_plan',section:'thesis',id:'T1',field:'action'},{tool:'linked_plan',id:'T1'},{tool:'patch_plan',edits:[{...edit,before:'stale'}]},{tool:'patch_plan',edits:[edit]},{tool:'validate_plan'},{tool:'finish'}];
  let session:PlanSession|undefined;
  const result=await planAgent(async prompt=>{
    expect(prompt).not.toContain(JSON.stringify(plan));
    if(commands[0]?.tool==='validate_plan')expect(prompt).toContain('Stale plan anchor');
    return JSON.stringify(commands.shift());
  },plan,'Fix the missing envelope','',{stage:'repair',key:'test',validate,onCheckpoint:s=>{session=s;}});
  expect(result.theses[0].action).toBe(edit.after);expect(session!.edits).toHaveLength(1);
  expect(session!.history.some(h=>(h.result as any)?.approved===false)).toBe(true);
});
it('resumes persisted field edits after transport interruption without repeating them',async()=>{
  let session:PlanSession|undefined;let calls=0;
  await expect(planAgent(async()=>{
    if(++calls===1)return JSON.stringify({tool:'patch_plan',edits:[edit]});
    throw new Error('Disconnected');
  },plan,'Repair','',{stage:'repair',key:'test',validate,onCheckpoint:s=>{session=s;}})).rejects.toThrow('Disconnected');
  const result=await planAgent(async prompt=>{
    expect(prompt).toContain(edit.after);return '{"tool":"finish"}';
  },plan,'Repair','',{stage:'repair',key:'test',validate,session});
  expect(result.theses[0].action).toBe(edit.after);expect(session!.edits).toHaveLength(1);
});
it('yields to independent review rather than stopping the book at the local tool limit',async()=>{
  const result=await planAgent(async()=>'{"tool":"read_plan","section":"thesis","id":"T1"}',plan,'Repair','',{stage:'repair',key:'test',validate,maxSteps:1});
  expect(result).toEqual(plan);
});
