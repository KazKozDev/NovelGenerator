/** Pure CLI argument mapping. All creative choices come from the main form. */
export function buildLiveRunConfig(config,saved,out,resumePath) {
  const input=config?.input;
  if(!input||typeof input.premise!=='string'||!input.premise.trim()||
    !Number.isSafeInteger(input.chapter_count)||input.chapter_count<3||input.chapter_count>100||
    typeof input.genre!=='string'||!input.genre.trim()||typeof input.author_requirements!=='string'||
    !Number.isSafeInteger(input.target_total_words)||input.target_total_words<input.chapter_count||input.target_total_words%input.chapter_count!==0)
    throw new Error('Complete all generation settings on the main page.');
  const role=value=>{
    if(!value||!['ollama','qwen','gemini'].includes(value.provider))throw new Error('Select a valid provider on the main page.');
    const model=value.provider==='ollama'?value.ollamaModel:value.provider==='qwen'?(value.qwenModel||'qwen3.8-flash'):(value.geminiModel||'gemini-3.6-flash');
    if(typeof model!=='string'||!model.trim())throw new Error('Select a model on the main page.');
    return {provider:value.provider,model:model.trim(),endpoint:value.ollamaEndpoint};
  };
  const writer=role(config.writer), editor=config.editor?role(config.editor):writer;
  const endpoint=[writer,editor].find(r=>r.provider==='ollama')?.endpoint;
  const directEndpoint=endpoint==='/api/ollama'?'http://127.0.0.1:11434':endpoint;
  if(directEndpoint){let url;try{url=new URL(directEndpoint)}catch{throw new Error('Set a valid Ollama endpoint.')}if(!['http:','https:'].includes(url.protocol))throw new Error('Set an HTTP Ollama endpoint.');}
  const compatible=Boolean(saved&&['premise','chapter_count','genre','author_requirements'].every(k=>saved[k]===input[k]));
  const args=['scripts/run-book.ts','--writer-provider',writer.provider,'--writer',writer.model,'--editor-provider',editor.provider,'--editor',editor.model,
    '--chapters',String(input.chapter_count),'--genre',input.genre,'--words-per-chapter',String(input.target_total_words/input.chapter_count),
    '--author-requirements',input.author_requirements,'--premise',input.premise,'--out',out,'--max-calls','240','--max-minutes','100'];
  if(directEndpoint)args.push('--endpoint',directEndpoint);
  if(compatible)args.push('--resume',resumePath);
  return {args,compatible};
}
