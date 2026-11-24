import {it} from 'vitest';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {listAnthropicModels,generateAnthropicText} from '../services/anthropicService';
it.skipIf(process.env.NOVEL_LIVE_DIRECT_ANTHROPIC!=='1')('checks configured Claude models and drafts without editors',async()=>{
 const dir='runs/direct-chapter-claude-2026-10-16';await mkdir(dir,{recursive:true});
 const ids=await listAnthropicModels();await writeFile(`${dir}/available-models.json`,JSON.stringify(ids,null,2));console.log('Available models:',ids);
 const model=ids.find(x=>x==='claude-opus-5-5')||ids.find(x=>x.includes('opus'));
 if(!model)throw new Error('No Opus model available to the configured key');
 const config=JSON.parse(await readFile('runs/direct-chapter-pro-2026-10-16/design.json','utf8'));
 for(let sample=1;sample<=2;sample++){
  const path=`${dir}/opus-${sample}`;await mkdir(path,{recursive:true});
  const request={model,system:config.system,prompt:config.arms[0].prompt,maxTokens:16000,deliberate:true};
  await writeFile(`${path}/request.json`,JSON.stringify(request,null,2));const start=Date.now();console.log('Starting',model,sample);
  try{const text=await generateAnthropicText(request.prompt,request.system,request.maxTokens,model,true);await writeFile(`${path}/chapter.md`,text.trim()+'\n');await writeFile(`${path}/result.json`,JSON.stringify({status:'complete',model,words:text.trim().split(/\s+/).length,durationMs:Date.now()-start,writerCalls:1,reviewerCalls:0},null,2));console.log('Completed',sample,text.trim().split(/\s+/).length,'words');}catch(error){await writeFile(`${path}/result.json`,JSON.stringify({status:'failed',error:String(error),durationMs:Date.now()-start},null,2));throw error;}
 }
},1200000);
