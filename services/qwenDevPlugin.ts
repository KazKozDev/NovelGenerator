import type { Plugin } from 'vite';
import { generateQwenText, listQwenModels } from './qwenService';

/** Development backend: never puts credentials in Vite's browser defines. */
export function qwenDevPlugin():Plugin {
  return {name:'qwen-local-gateway',configureServer(server){
    // The list of models comes first: the route below answers everything under /api/qwen.
    server.middlewares.use('/api/qwen/models',(req,res)=>{
      res.setHeader('Content-Type','application/json');
      try {const origin=new URL(req.headers.origin||`http://${req.headers.host}`);
        if(!['localhost','127.0.0.1'].includes(origin.hostname)||origin.host!==req.headers.host)throw Error();
      }catch{res.statusCode=403;res.end(JSON.stringify({error:'Local requests only'}));return;}
      listQwenModels().then(models=>res.end(JSON.stringify({models})),error=>{res.statusCode=502;res.end(JSON.stringify({error:error instanceof Error?error.message:'Model list failed'}));});
    });
    server.middlewares.use('/api/qwen',(req,res)=>{
      res.setHeader('Content-Type','application/json');
      if(req.method!=='POST'){res.statusCode=405;res.end(JSON.stringify({error:'POST required'}));return;}
      try {const origin=new URL(req.headers.origin||'');
        if(!['localhost','127.0.0.1'].includes(origin.hostname)||origin.host!==req.headers.host)throw Error();
      }catch{res.statusCode=403;res.end(JSON.stringify({error:'Qwen requests must originate from the local application'}));return;}
      let body='', oversized=false;
      req.on('data',chunk=>{if(oversized)return;body+=chunk;if(Buffer.byteLength(body)>8_000_000){oversized=true;res.statusCode=413;res.end(JSON.stringify({error:'Request too large'}));}});
      req.on('end',async()=>{
        if(oversized)return;
        let input;
        try{input=JSON.parse(body);if(typeof input.prompt!=='string'||!input.prompt.trim()||
          (input.system!==undefined&&typeof input.system!=='string')||
          (input.model!==undefined&&(typeof input.model!=='string'||!input.model.startsWith('qwen')))||
          (input.maxTokens!==undefined&&(!Number.isInteger(input.maxTokens)||input.maxTokens<1||input.maxTokens>131072))||
          (input.temperature!==undefined&&(!Number.isFinite(input.temperature)||input.temperature<0||input.temperature>2))||
          (input.schema!==undefined&&(!input.schema||typeof input.schema!=='object'||Array.isArray(input.schema))))throw Error();
        }catch{res.statusCode=400;res.end(JSON.stringify({error:'Invalid Qwen request'}));return;}
        let metadata:unknown;
        try{const text=await generateQwenText(input.prompt,input.system,input.maxTokens,input.model,input.temperature,value=>{metadata=value},input.schema);res.end(JSON.stringify({text,metadata}));}
        catch(error){res.statusCode=502;res.end(JSON.stringify({error:error instanceof Error?error.message:'Qwen request failed',metadata}));}
      });
    });
  }};
}
