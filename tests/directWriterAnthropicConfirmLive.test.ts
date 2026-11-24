import {it} from 'vitest';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {generateAnthropicText} from '../services/anthropicService';
it.skipIf(process.env.NOVEL_LIVE_DIRECT_ANTHROPIC_CONFIRM!=='1')('confirms the leading direct-writer candidate and a sibling model',async()=>{
 const root='runs/direct-chapter-claude-2026-10-16';
 const original=JSON.parse(await readFile(`${root}/opus-1/request.json`,'utf8'));
 const available=JSON.parse(await readFile(`${root}/available-models.json`,'utf8'));
 for(const [id,model] of [['opus-3',original.model],['sonnet-1','claude-sonnet-5-5']]){
  if(!available.includes(model))throw new Error('Requested model not in the verified available list');
  const path=`${root}/${id}`;await mkdir(path,{recursive:true});const request={...original,model};
  await writeFile(`${path}/request.json`,JSON.stringify(request,null,2));const start=Date.now();console.log('Starting',id,model);
  try{const text=await generateAnthropicText(request.prompt,request.system,request.maxTokens,model,true);await writeFile(`${path}/chapter.md`,text.trim()+'\n');await writeFile(`${path}/result.json`,JSON.stringify({status:'complete',model,words:text.trim().split(/\s+/).length,durationMs:Date.now()-start,writerCalls:1,reviewerCalls:0},null,2));console.log('Completed',id,text.trim().split(/\s+/).length,'words');}catch(error){await writeFile(`${path}/result.json`,JSON.stringify({status:'failed',error:String(error),durationMs:Date.now()-start},null,2));console.log('Failed',id,String(error));}
 }
},1200000);
