import { expect, it } from 'vitest';
import { repairReviewEvidence } from '../utils/novel/v2/reviewEvidenceRepair';
import { repairVerificationSchema } from '../utils/novel/v2/proseReviewSchema';
import { structuredResponse } from '../utils/novel/v2/llm';

const check={issue:0,status:'repaired',evidence:'Reconstructed quote',explanation:'The required event is now planned.'};
it('repairs an invalid JSON quotation with a current address while preserving the verdict and source',async()=>{
  const source=JSON.stringify({action:'She says "yes".'});
  const original={ready:true,checks:[check],issues:[]};let calls=0;
  const result=await repairReviewEvidence(original,source,async(prompt,_system,options)=>{
    calls++;expect(options?.stage).toBe('plan-review-evidence');
    expect(prompt).toContain(source);expect(prompt).toContain('Reconstructed quote');
    expect((options?.schema as any).properties.references.items.properties.evidence.enum).toEqual(['@P0001']);
    return JSON.stringify({references:[{path:'checks.0',evidence:'@P0001',supported:true,explanation:'The quoted action is in this candidate.'}]});
  },'','plan-review');
  expect(calls).toBe(1);expect(result.checks[0]).toEqual({...check,evidence:'@P0001'});
  expect(original.checks[0].evidence).toBe('Reconstructed quote');
});
it('keeps a verdict unresolved when the locator cannot substantiate its claimed repair',async()=>{
  const result=await repairReviewEvidence({ready:true,checks:[check],issues:[]},'The cause is still missing.',async()=>JSON.stringify({references:[{path:'checks.0',evidence:'@P0001',supported:false,explanation:'The claimed setup is absent.'}]}),'','review');
  expect(result.checks[0].status).toBe('unresolved');expect(result.checks[0].explanation).toBe('The claimed setup is absent.');
});
it('does not spend another call on valid current evidence or discard unsupported blocking findings',async()=>{
  const valid={checks:[{...check,evidence:'@P0001'}],issues:[]};
  expect(await repairReviewEvidence(valid,'Current scene',async()=>{throw new Error('Unnecessary call');},'','review')).toBe(valid);
  const issue={severity:'major',kind:'missing_event',evidence:'Old quotation',problem:'No cause',consequence:'Unmotivated decision',required_change:'Establish cause',thesis_ids:['T1']};
  await expect(repairReviewEvidence({checks:[],issues:[issue]},'Current scene',async()=>JSON.stringify({references:[{path:'issues.0',evidence:'@P0001',supported:false,explanation:'Reconcile the claim against the new source.'}]}),'','review')).rejects.toThrow('Unverified review evidence');
});
it('constrains evidence in both repair verdicts and newly discovered issues',()=>{
  const schema=repairVerificationSchema(2,['@P0001','@P0002']);
  expect(schema.properties.checks.items.properties.evidence.enum).toEqual(['@P0001','@P0002']);
  expect(schema.properties.issues.items.properties.evidence).toEqual({type:'string',enum:['@P0001','@P0002']});
});
it('catches asynchronous validation failures and automatically requests a corrected response',async()=>{
  let calls=0;
  const result=await structuredResponse('Review','',async()=>JSON.stringify({value:++calls}),['value'],async raw=>{
    if(raw.value===1)throw new Error('Invalid asynchronous verdict');return raw.value;
  });
  expect(result).toBe(2);expect(calls).toBe(2);
});
it('retains unresolved verdicts instead of stopping on malformed or duplicate locator entries',async()=>{
 const raw={ready:true,checks:[check],issues:[]};
 for(const references of [[],[{path:'checks.0',evidence:'@P9999'}],[{path:'checks.0',evidence:'@P0001',supported:true},{path:'checks.0',evidence:'@P0001',supported:true}]]){
  const result=await repairReviewEvidence(raw,'The actual scene.',async()=>JSON.stringify({references}),'','review');
  expect(result.checks[0].status).toBe('unresolved');
  expect(result.checks[0].evidence).toBeUndefined();
  expect(result.checks[0].explanation).toContain('did not substantiate');
 }
});
it('accepts an exact source quotation and supplies a source-location explanation without inventing evidence',async()=>{
 const result=await repairReviewEvidence({ready:true,checks:[check],issues:[]},'The actual scene.',async()=>JSON.stringify({references:[{path:'checks.0',evidence:'The actual scene.',supported:true}]}),'','review');
 expect(result.checks[0].evidence).toBe('@P0001');expect(result.checks[0].status).toBe('repaired');
 expect(result.checks[0].explanation).toBe(check.explanation);
});
