import { expect, it } from 'vitest';
import { stableJson } from '../utils/novel/v2/contracts';
import { parseObject, structuredResponse, patchResponse, ResponseContractError } from '../utils/novel/v2/llm';
import { manuscriptAgent } from '../utils/novel/v2/manuscriptTools';
import { allocateThesisWords, readThesisReview, readRepairVerification, validateThesisDraft, type ThesisPlan } from '../utils/novel/v2/theses';
import { planReviewSchema } from '../utils/novel/v2/proseReviewSchema';
import { inputKey } from '../utils/novel/v2/progressive';
import { accountFromPlan, canonicalRepairSchema } from '../utils/novel/v2/causalAccount';
import { validateCanon } from '../utils/novel/v2/storyCanon';

const input = { premise:'A letter changes Jo’s decision.', genre:'drama', chapter_count:1, target_total_words:500, author_requirements:'' };
const plan:ThesisPlan = {
  title:'Letter', premise_givens:[], ending:'Jo chooses to stay',
  characters:[{id:'C1',name:'Jo',goal:'Choose',initial_knowledge:[],capabilities:[],limitations:[]}],
  canon:{resolution:'Jo chooses to stay',facts:[{id:'F1',truth:'Jo reads the letter',established_in:'T1',knowledge:[{character_id:'C1',learned_in:'T1'}]}]},
  theses:[{id:'T1',chapter:1,pov_id:'C1',participants:[{character_id:'C1',intention:'Choose',knows:[]}],when:'Morning',where:'Home',state_before:'Undecided',action:'Reads the letter',why:'Needs an answer',resistance:'Fear',outcome:'Chooses to stay',fact_ids:['F1'],establishes:['Letter read'],reader_learns:[],requires:[],writer_task:'Show the decision',target_words:500}],
};

it('switches from broken field-edit commands to the original response schema instead of repeating eight invalid patches',async()=>{
  let calls=0;
  const schema={type:'object',required:['value','sound'],properties:{value:{type:'number'},sound:{type:'string'}}};
  const result=await structuredResponse('Correct value','',async(prompt,_system,options)=>{
    calls++;
    if(calls===1)return '{"value":0,"sound":"keep"}';
    if(calls<=3)return '{"edits":[{"op":"replace","path":"/value","value":1}]}';
    expect(options?.schema).toEqual(schema);
    expect(prompt).toContain('Field-edit protocol failed twice');
    expect(prompt).toContain('"sound":"keep"');
    return '{"value":1,"sound":"keep"}';
  },['value','sound'],raw=>{if(!raw.value)throw Error('Missing value');return raw;},{schema,maxAttempts:4});
  expect(calls).toBe(4);expect(result.sound).toBe('keep');
});

it('classifies response contract exhaustion separately from provider and budget failures',async()=>{
  let thrown:unknown;
  try{await structuredResponse('Review','',async()=>'{"ready":true,"issues":[],"state_trace":{}}',['ready','issues','state_trace'],()=>{throw Error('Bad trace');},{maxAttempts:2,stage:'review'});}catch(error){thrown=error;}
  expect(thrown).toBeInstanceOf(ResponseContractError);
  expect((thrown as ResponseContractError).code).toBe('RESPONSE_CONTRACT');
  expect((thrown as Error).message).toContain('response remains unverified');
});

it('repairs pre-existing canonical knowledge by exact source field edit without rewriting the story',async()=>{
  const original=structuredClone(plan);
  original.canon!.facts[0]={id:'F02',truth:'Jo has owned the letter for seven months before the opening.',established_in:'T1',knowledge:[{character_id:'C1',learned_in:'INITIAL'}]};
  original.theses[0].fact_ids=['F02'];
  let calls=0;
  const repaired=await structuredResponse('Build the story plan','',async prompt=>{
    calls++;
    expect(prompt).toContain('/canon/facts/0/established_in = "T1"');
    expect(prompt).toContain('/canon/facts/0/knowledge/0/learned_in = "INITIAL"');
    return JSON.stringify({edits:[{path:'/canon/facts/0/established_in',before:'T1',after:'INITIAL'}]});
  },['title','canon','theses','ending'],raw=>{validateCanon(raw);return raw;},{initialResponse:JSON.stringify(original)});
  expect(calls).toBe(1);
  expect(repaired.canon.facts[0].established_in).toBe('INITIAL');
  expect(repaired.theses).toEqual(original.theses);
  expect(original.canon!.facts[0].established_in).toBe('T1');
});

it('keeps future knowledge blocked and supplies both field addresses for repair',()=>{
  const future=structuredClone(plan);
  future.canon!.facts[0].knowledge[0].learned_in='INITIAL';
  expect(()=>validateCanon(future)).toThrow('/canon/facts/0/knowledge/0/learned_in');
  future.canon!.facts[0].knowledge[0].learned_in='T1';
  expect(()=>validateCanon(future)).not.toThrow();
});

it('constrains plan-review findings and repairs an invalid address without discarding the defect',async()=>{
  const schema=planReviewSchema(['T1']);
  expect(schema.properties.issues.items.required).toEqual(['severity','thesis_ids','problem','required_change']);
  expect(schema.properties.issues.items.properties.thesis_ids.items.enum).toEqual(['T1']);
  let calls=0;
  const issue={severity:'major',thesis_ids:['C1'],problem:'The choice lacks a cause',required_change:'Show why the letter changes the decision'};
  const review=await structuredResponse('Review plan','System',async(prompt,_system,options)=>{
    if(!calls)expect(options?.schema).toEqual(schema);
    if(++calls===1)return JSON.stringify({ready:false,issues:[issue]});
    expect(prompt).toContain('unknown thesis_ids: C1');
    expect(prompt).toContain('Valid thesis IDs: T1');
    return JSON.stringify({ready:false,issues:[{...issue,thesis_ids:['T1']}]});
  },['ready','issues'],raw=>readThesisReview(raw,plan),{schema});
  expect(review.ready).toBe(false);
  expect(review.issues[0].problem).toBe(issue.problem);
  expect(calls).toBe(2);
});

it('names missing review fields rather than returning a generic contract failure',()=>{
  expect(()=>readThesisReview({issues:[{severity:'major',problem:'Cause missing',thesis_ids:['T1']}]},plan)).toThrow('required_change must state the correction');
  expect(()=>readThesisReview({issues:[null]},plan)).toThrow('Invalid review issue 1');
});

it('ignores object-key order but preserves meaningful array order and values',()=>{
  expect(stableJson({a:1,b:[2,3]})).toBe(stableJson({b:[2,3],a:1}));
  expect(stableJson({a:1,b:[2,3]})).not.toBe(stableJson({a:1,b:[3,2]}));
  expect(parseObject('{"a":1,"b":2} {"b":2,"a":1}')).toEqual({a:1,b:2});
  expect(()=>parseObject('{"a":1} {"a":2}')).toThrow('Ambiguous');
  const reordered=Object.fromEntries(Object.entries(plan).reverse());
  const draft={version:1,input_key:inputKey(input),plan,plan_ready:true,rounds:[{plan:reordered,review:{ready:true,issues:[]}}],blocks:[],pending:null,completed:false};
  expect(()=>validateThesisDraft(draft,input)).not.toThrow();
  expect(()=>validateThesisDraft({...draft,rounds:[{plan:{...plan,ending:'Different ending',canon:{...plan.canon!,resolution:'Different ending'}},review:{ready:true,issues:[]}}]},input)).toThrow('not passed');
});

it('computes repair readiness from evidence and verdicts instead of a conflicting flag',()=>{
  const prose='Jo reads the letter.';
  const verdict={issue:0,status:'unresolved',evidence:'@P0001',explanation:'The decision is still missing.'};
  expect(readRepairVerification({ready:true,checks:[verdict],issues:[]},plan,prose,1).accepted).toBe(false);
  expect(readRepairVerification({ready:false,checks:[{...verdict,status:'repaired'}],issues:[]},plan,prose,1).accepted).toBe(true);
  expect(()=>readRepairVerification({ready:true,checks:[{...verdict,evidence:'Invented quote'}],issues:[]},plan,prose,1)).toThrow('exact evidence');
});

it('derives reverse source references and explanatory notes from the plan, without inventing story data',()=>{
  const raw={...plan,theses:[{...plan.theses[0],fact_ids:[]}]};
  const normalized=allocateThesisWords(raw,input);
  expect(normalized.theses[0].fact_ids).toEqual(['F1']);
  expect(raw.theses[0].fact_ids).toEqual([]);
  expect(canonicalRepairSchema.required).toEqual(['plan']);
  const account=accountFromPlan(normalized);
  expect(JSON.parse(account.evidence)).toEqual(normalized.canon!.facts);
  expect(JSON.parse(account.protagonist_choice).ending).toBe(plan.ending);
});

it('accepts an omitted editing completion note only after verification; writing still needs prose',async()=>{
  let verified=false;
  expect(await manuscriptAgent(async()=>'{"tool":"finish"}',[{id:'T1',text:'Original'}],'Edit','',{
    stage:'edit',writable:['T1'],onFinish:async()=>{verified=true;return {accepted:true};},
  })).toContain('independent review');
  expect(verified).toBe(true);
  let call=0;
  expect(await manuscriptAgent(async prompt=>{
    if(++call===1)return '{"tool":"finish"}';
    expect(prompt).toContain('Finish requires nonempty text');
    return '{"tool":"finish","text":"Written prose"}';
  },[],'Write','',{stage:'write'})).toBe('Written prose');
});

it('keeps the tool’s current manuscript unchanged when the edit callback refuses a transaction',async()=>{
  const commands=[{tool:'replace',edits:[{block_id:'T1',before:'Original',after:'Changed'}]},{tool:'finish'}];
  await manuscriptAgent(async()=>JSON.stringify(commands.shift()),[{id:'T1',text:'Original'}],'Edit','',{
    stage:'edit',writable:['T1'],onEdit:async()=>{throw new Error('Transaction refused');},
    onFinish:async blocks=>{expect(blocks[0].text).toBe('Original');return {accepted:true};},
  });
});


it('automatically repairs progressing response contracts beyond two attempts',async()=>{
  let calls=0;
  const value=await structuredResponse('Repair','',async()=>JSON.stringify({value:++calls}),['value'],raw=>{
    if(raw.value===1)throw new Error('Missing chronology');
    if(raw.value===2)throw new Error('Missing evidence source');
    return raw.value;
  });
  expect(value).toBe(3);
  expect(calls).toBe(3);
});

it('does not retry an exhausted overall budget while repairing a response',async()=>{
  let calls=0;
  await expect(structuredResponse('Repair','',async()=>{
    if(++calls===1)return '{"value":1}';
    throw new Error('Call budget of 20 calls exhausted');
  },['value'],()=>{throw new Error('Missing chronology');})).rejects.toThrow('budget of 20 calls exhausted');
  expect(calls).toBe(2);
});

it('repairs repeated field defects with patches and preserves unrelated data',async()=>{
 let calls=0;const saved:string[]=[];
 const result=await structuredResponse('Plan','',async(prompt)=>{
  calls++;
  if(calls===1)return JSON.stringify({value:0,keep:{text:'Sound material'}});
  expect(prompt).toContain('exact field edits');
  return JSON.stringify({edits:[{path:'/value',before:calls-2,after:calls-1}]});
 },['value','keep'],raw=>{if(raw.value<2)throw Error('Need a valid value');return raw;},{onCandidate:(raw)=>saved.push(raw)});
 expect(calls).toBe(3);expect(result.keep.text).toBe('Sound material');expect(result.value).toBe(2);
 expect(saved.some(raw=>JSON.parse(raw).value===1)).toBe(true);
});
it('resumes a rejected candidate without requesting the complete plan again',async()=>{
 const result=await structuredResponse('Plan','',async(prompt)=>{expect(prompt).toContain('exact field edits');return JSON.stringify({edits:[{path:'/value',before:0,after:1}]});},['value'],raw=>{if(!raw.value)throw Error('Missing value');return raw;},{initialResponse:'{"value":0}'});
 expect(result.value).toBe(1);
});
it('rejects stale, unsafe and nonexistent response patch paths transactionally',()=>{
 const raw={rows:[{value:1}]};
 expect(()=>patchResponse(raw,[{path:'/rows/0/value',before:2,after:3}])).toThrow('Stale');
 expect(()=>patchResponse(raw,[{path:'/__proto__/polluted',after:true}])).toThrow('Unsafe');
 expect(()=>patchResponse(raw,[{path:'/rows/9',after:3}])).toThrow('array index');
 expect(raw.rows[0].value).toBe(1);
});
