export interface TokenUsage { input:number; output:number; estimatedInput?:boolean; estimatedOutput?:boolean }
export interface TokenTotals extends TokenUsage { calls:number; historical?:boolean }
export const emptyTokenTotals=():TokenTotals=>({input:0,output:0,calls:0});
const count=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
export function providerTokenUsage(provider:'qwen'|'ollama'|'gemini'|'huggingface'|'anthropic'|'compatible',metadata:any):Partial<TokenUsage>{
 const data=(provider==='qwen'||provider==='huggingface'||provider==='anthropic'||provider==='compatible')?metadata?.usage:metadata;
 const input=(provider==='qwen'||provider==='huggingface'||provider==='anthropic'||provider==='compatible')?data?.prompt_tokens:provider==='ollama'?data?.prompt_eval_count:data?.promptTokenCount;
 const output=(provider==='qwen'||provider==='huggingface'||provider==='anthropic'||provider==='compatible')?data?.completion_tokens:provider==='ollama'?data?.eval_count:
   count(data?.totalTokenCount)&&count(input)?Math.max(0,data.totalTokenCount-input):
   count(data?.candidatesTokenCount)?data.candidatesTokenCount+(count(data?.thoughtsTokenCount)?data.thoughtsTokenCount:0):undefined;
 return {...(count(input)?{input}:{}),...(count(output)?{output}:{})};
}
export function addTokenUsage(total:TokenTotals,usage:TokenUsage):TokenTotals{
 return {input:total.input+usage.input,output:total.output+usage.output,calls:total.calls+1,
  estimatedInput:!!(total.estimatedInput||usage.estimatedInput),estimatedOutput:!!(total.estimatedOutput||usage.estimatedOutput),historical:total.historical};
}
/** Cumulative checkpoints survive resume and log truncation. Older run summaries are estimates. */
export function savedTokenTotals(logs:{stage:string;detail:string}[]):TokenTotals{
 for(let i=logs.length-1;i>=0;i--)if(logs[i].stage==='token_totals'){
  try{const value=JSON.parse(logs[i].detail);if(count(value.input)&&count(value.output)&&count(value.calls))return value;}catch{}
 }
 let total=emptyTokenTotals();
 for(const log of logs)if(log.stage==='usage'){
  const m=log.detail.match(/^total: (\d+) call\(s\), sent (\d+).*received (\d+) /);
  if(m)total={...total,input:total.input+Math.ceil(Number(m[2])/4),output:total.output+Math.ceil(Number(m[3])/4),calls:total.calls+Number(m[1]),estimatedInput:true,estimatedOutput:true,historical:true};
 }
 return total;
}
