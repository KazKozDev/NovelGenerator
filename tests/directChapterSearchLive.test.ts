import {it,expect} from 'vitest';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {generateOllamaText,readOllamaCompletion,ollamaContextWindow} from '../services/ollamaService';
it.skipIf(process.env.NOVEL_LIVE_DIRECT_SEARCH!=='1')('runs configured direct chapter candidates with recoverable samples',async()=>{
 const dir=process.env.NOVEL_DIRECT_SEARCH_DIR!;
 const config=JSON.parse(await readFile(`${dir}/design.json`,'utf8'));
 for(let sample=1;sample<=config.replicates;sample++)for(const arm of sample%2?config.arms:[...config.arms].reverse()){
  const path=`${dir}/${arm.id}-${sample}`;await mkdir(path,{recursive:true});
  const request={model:arm.model||config.model,system:arm.system||config.system,prompt:arm.prompt,temperature:arm.temperature,maxTokens:arm.maxTokens||16000,thinking:arm.thinking===true};
  try{const previous=JSON.parse(await readFile(`${path}/result.json`,'utf8'));const saved=JSON.parse(await readFile(`${path}/request.json`,'utf8'));if(previous.status==='complete'&&JSON.stringify(saved)===JSON.stringify(request)){console.log('Reused',arm.id,sample);continue;}}catch{}
  await writeFile(`${path}/request.json`,JSON.stringify(request,null,2));
  let text='',usage:Record<string,unknown>={};const start=Date.now();console.log('Starting',arm.id,sample);
  try{
   if(request.thinking){
    const response=await fetch('http://127.0.0.1:3017/api/ollama/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(600000),body:JSON.stringify({model:request.model,messages:[{role:'system',content:request.system},{role:'user',content:request.prompt}],stream:true,think:true,options:{temperature:request.temperature,num_ctx:ollamaContextWindow(request.model,request.system+request.prompt,request.maxTokens),num_predict:request.maxTokens}})});
    text=await readOllamaCompletion(response,chunk=>{text+=chunk;},meta=>{usage=meta;});
   }else text=await generateOllamaText(request.prompt,request.system,undefined,request.temperature,request.model,'http://127.0.0.1:3017/api/ollama',request.maxTokens,undefined,undefined,chunk=>{text+=chunk;},meta=>{usage=meta;});
   await writeFile(`${path}/chapter.md`,text.trim()+'\n');
   await writeFile(`${path}/result.json`,JSON.stringify({status:'complete',words:text.trim().split(/\s+/).length,durationMs:Date.now()-start,usage,writerCalls:1,reviewerCalls:0},null,2));console.log('Completed',arm.id,sample,text.trim().split(/\s+/).length,'words');
  }catch(error){await writeFile(`${path}/partial.md`,text);await writeFile(`${path}/result.json`,JSON.stringify({status:'failed',error:String(error),durationMs:Date.now()-start,usage},null,2));console.log('Failed',arm.id,sample,String(error));}
 }
 expect(config.arms.length).toBeGreaterThan(0);
},1800000);
