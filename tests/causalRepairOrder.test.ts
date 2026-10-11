import {it,expect} from 'vitest';
import {causalRepairOrder} from '../utils/novel/v2/causalRepairOrder';
import type {ThesisPlan,ThesisDraft,ThesisReview} from '../utils/novel/v2/theses';
it('visits a defective scene and what it directly requires, in outline order, and a scene whose contract changed',()=>{
  const before={theses:[{id:'SETUP',requires:[]},{id:'ACTION',requires:['SETUP']},{id:'PAYOFF',requires:['ACTION']}]} as unknown as ThesisPlan;
  const after=structuredClone(before);
  const blocks=before.theses.map(thesis=>({thesis_id:thesis.id,text:thesis.id,review:{ready:true,issues:[]}})) as ThesisDraft['blocks'];
  const issues=[{thesis_ids:['PAYOFF'],problem:'A reconciliation relies on an unknown promise',required_change:'Establish the promise'}] as ThesisReview['issues'];
  expect(causalRepairOrder(before,after,issues,blocks)).toEqual(['ACTION','PAYOFF']);
  (after.theses[0] as any).action='Changed';
  expect(causalRepairOrder(before,after,issues,blocks)).toEqual(['SETUP','ACTION','PAYOFF']);
});
