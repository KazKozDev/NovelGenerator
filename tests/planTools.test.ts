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

it('returns the current value with a stale anchor, and names an uneditable field', async () => {
  const { patchPlan } = await import('../utils/novel/v2/planTools');
  const plan = { title: 'T', premise_givens: [], ending: 'End', characters: [], theses: [{ id: 'T1', action: 'Jo hides the letter', outcome: 'Hidden' }] } as any;
  const attempt = (edit: object) => { try { patchPlan(plan, [edit as any], raw => raw as any); return ''; } catch (error) { return (error as Error).message; } };
  expect(attempt({ section: 'thesis', id: 'T1', field: 'action', before: 'Jo hides a letter', after: 'Jo burns it' })).toContain('Current value, to use as before exactly: "Jo hides the letter"');
  expect(attempt({ section: 'thesis', id: 'T1', field: 'chapter', before: 1, after: 2 })).toContain('thesis has no editable field "chapter"');
  expect(attempt({ section: 'scene', id: 'T1', field: 'action', before: '', after: 'x' })).toContain('section must be one of');
});
it('repairs a plan in one answer: everything is shown, no anchor is demanded, and the batch finishes the task',async()=>{
  const prompts:string[]=[];
  const result=await planAgent(async prompt=>{
    prompts.push(prompt);
    return JSON.stringify({tool:'patch_plan',finish:true,edits:[{section:'thesis',id:'T1',field:'action',after:'Opens the envelope'},{section:'thesis',id:'T2',field:'state_before',after:'The envelope lies open'}]});
  },plan,'Repair the cause','',{stage:'repair',key:'one-answer',validate,focus:['T1']});
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain('Repair the plan in ONE answer');
  expect(prompts[0]).toContain('CURRENT VALUES of the scenes the findings cite');
  expect(prompts[0]).toContain('EVERY SCENE IN BRIEF');
  expect(prompts[0]).toContain('EVERY FACT');
  expect(result.theses[0].action).toBe('Opens the envelope');
  expect(result.theses[1].state_before).toBe('The envelope lies open');
  expect(()=>patchPlan(plan,[{section:'thesis',id:'T1',field:'action',after:plan.theses[0].action}],validate)).toThrow('nothing changes');
  // An edit that restates a field is left out; the real edit beside it is applied.
  expect(patchPlan(plan,[{section:'thesis',id:'T1',field:'where',after:plan.theses[0].where},{section:'thesis',id:'T1',field:'action',after:'Burns it'}],validate).theses[0].action).toBe('Burns it');
  let turns=0;
  const untouched=await planAgent(async()=>{turns++;return '{"tool":"patch_plan","edits":[],"finish":true}';},plan,'Repair','',{stage:'repair',key:'empty-finish',validate});
  expect(turns).toBe(1);expect(untouched.theses[0].action).toBe(plan.theses[0].action);
  const joined=await planAgent(async()=>'{"tool":"patch_plan","edits":[{"section":"thesis","id":"T1","field":"action","after":"Opens it"}]} {"tool":"patch_plan","edits":[{"section":"thesis","id":"T2","field":"state_before","after":"It lies open"}],"finish":true}',plan,'Repair','',{stage:'repair',key:'joined',validate});
  expect(joined.theses[0].action).toBe('Opens it');expect(joined.theses[1].state_before).toBe('It lies open');
});

it('takes a batch as large as the repair needs, and does not ask a third time for a command refused twice', async () => {
  const many = Array.from({ length: 45 }, (_, at) => ({ section: 'thesis', id: at % 2 ? 'T1' : 'T2', field: 'why', after: `Reason ${at}` }));
  expect(patchPlan(plan, many as any, validate).theses[0].why).toBe('Reason 43');
  let turns = 0;
  const result = await planAgent(async () => { turns++; return '{"tool":"patch_plan","edits":[{"section":"thesis","id":"T1","field":"chapter","after":9}],"finish":true}'; }, plan, 'Repair', '', { stage: 'repair', key: 'refused-twice', validate });
  expect(turns).toBe(2);
  expect(result.theses[0].chapter).toBe(plan.theses[0].chapter);
});

it('lets a repair do what the checks ask of it: add a fact, and say when the reader learns one', () => {
  const added = patchPlan(plan, [{ section: 'fact', id: 'F9', field: 'new', after: { truth: 'The letter was forged.', established_in: 'T2', reader_learns_in: 'T2', knowledge: [{ character_id: 'C1', learned_in: 'T2' }] } },
    { section: 'fact', id: 'F1', field: 'reader_learns_in', after: 'T1' }] as any, validate);
  expect(added.canon!.facts.find(f => f.id === 'F9')).toMatchObject({ truth: 'The letter was forged.', established_in: 'T2' });
  expect(added.theses.find(t => t.id === 'T2')!.fact_ids).toContain('F9');
  expect(added.canon!.facts.find(f => f.id === 'F1')!.reader_learns_in).toBe('T1');
  expect(() => patchPlan(plan, [{ section: 'fact', id: 'F1', field: 'new', after: { truth: 'x', established_in: 'T1' } }] as any, validate)).toThrow('a new fact needs an id no fact has yet');
});
