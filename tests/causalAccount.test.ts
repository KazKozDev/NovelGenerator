import {expect, it} from 'vitest';
import {ACCOUNT_KEYS, causalRepairSchema, readCausalAccount} from '../utils/novel/v2/causalAccount';
const valid = Object.fromEntries(ACCOUNT_KEYS.map(key => [key, 'Nora reads the dated entry before making her accusation.']));
it('provides the transport a complete nested account contract', () => {
  expect(causalRepairSchema.properties.account.required).toEqual([...ACCOUNT_KEYS]);
  expect(causalRepairSchema.properties.plan.required).toContain('ending');
});
it('preserves structured explanations rather than rejecting their representation', () => {
  const account = readCausalAccount({...valid, timeline: ['Tuesday: David dies.', 'Thursday: Nora learns of the death.'], evidence: {source:'Dated log',proves:'Entry using David’s card'}});
  expect(JSON.parse(account.timeline)).toHaveLength(2);
  expect(JSON.parse(account.evidence).source).toBe('Dated log');
});
it('reports exactly which facts need repair and never fills them in', () => {
  expect(()=>readCausalAccount({...valid,knowledge:undefined,framing:[]})).toThrow('knowledge, framing');
  expect(()=>readCausalAccount({...valid,timeline:{events:[]}})).toThrow('timeline');
  expect(()=>readCausalAccount('A vague summary')).toThrow('timeline, evidence, knowledge, framing, protagonist_choice');
});
