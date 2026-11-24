import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {addTokenUsage,emptyTokenTotals,providerTokenUsage,savedTokenTotals} from '../utils/tokenUsage';
import ThreeZoneGenerationView from '../components/ThreeZoneGenerationView';
import {GenerationStep} from '../types';
it('reads provider counts, including Gemini reasoning and cached input without double-counting',()=>{
 expect(providerTokenUsage('compatible',{usage:{prompt_tokens:100,completion_tokens:30,prompt_tokens_details:{cached_tokens:80}}})).toEqual({input:100,output:30});
 expect(providerTokenUsage('ollama',{prompt_eval_count:120,eval_count:40})).toEqual({input:120,output:40});
 expect(providerTokenUsage('gemini',{promptTokenCount:200,totalTokenCount:260,candidatesTokenCount:20,thoughtsTokenCount:40})).toEqual({input:200,output:60});
 expect(providerTokenUsage('gemini',{promptTokenCount:200,candidatesTokenCount:20,thoughtsTokenCount:40})).toEqual({input:200,output:60});
 expect(providerTokenUsage('ollama',{prompt_eval_count:null,eval_count:-1})).toEqual({});
});
it('accumulates separate attempts and resumes from a cumulative checkpoint',()=>{
 let totals=addTokenUsage(emptyTokenTotals(),{input:100,output:50});
 totals=addTokenUsage(totals,{input:120,output:70,estimatedOutput:true});
 const loaded=savedTokenTotals([{stage:'token_totals',detail:JSON.stringify(totals)},{stage:'usage',detail:'total: 2 call(s), sent 999 (x), received 999 (x), manuscript 12'}]);
 expect(loaded).toEqual(totals);expect(addTokenUsage(loaded,{input:20,output:10})).toMatchObject({input:240,output:130,calls:3,estimatedOutput:true});
});
it('restores older summary estimates without claiming provider accuracy',()=>{
 expect(savedTokenTotals([{stage:'usage',detail:'total: 2 call(s), sent 400 (no manuscript), received 200 (no manuscript), manuscript 0'},{stage:'usage',detail:'total: 1 call(s), sent 80 (2x), received 40 (1x), manuscript 40'}])).toMatchObject({input:120,output:60,calls:3,estimatedInput:true,estimatedOutput:true,historical:true});
 expect(savedTokenTotals([{stage:'token_totals',detail:'{"input":-1,"output":null,"calls":2}'}])).toEqual(emptyTokenTotals());
});
it('renders input and output beneath calls with estimates marked and exact totals formatted',()=>{
 const html=renderToStaticMarkup(<ThreeZoneGenerationView currentStep={GenerationStep.GeneratingChapters} currentChapterProcessing={1} totalChaptersToProcess={3} currentStoryOutline="" currentChapterPlan="" generatedChapters={[]} agentLogs={[{timestamp:Date.now(),chapterNumber:1,type:'execution',message:'Writing'}]} isLoading tokenTotals={{input:123456,output:7890,calls:2,estimatedOutput:true}}/>);
 expect(html).toContain('input tokens');expect(html).toContain('output tokens');expect(html).toContain('123,456');expect(html).toContain('~ 7,890');
 expect(html.indexOf('call')).toBeLessThan(html.indexOf('Total token usage'));
});
