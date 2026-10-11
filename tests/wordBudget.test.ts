import {expect,it} from 'vitest';
import {wordBudget} from '../utils/novel/v2/wordBudget';
it('rejects 1500 words against a 3400-word chapter target',()=>{
  expect(wordBudget(Array(1500).fill('word').join(' '),3400)).toEqual({words:1500,target:3400,minimum:3060,missing:1560,ready:false});
  expect(wordBudget(Array(3060).fill('word').join('\n'),3400).ready).toBe(true);
});
