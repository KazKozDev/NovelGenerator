import { structuredResponse, type NovelLLM } from './llm';
import { proseEvidence, resolveProseEvidence } from './proseEvidence';

/** Repair citation fields, never generate story facts or approve unsupported verdicts. */
/** With dropUnsupportedEvents, a trace event the locator cannot ground is an extraction
 * error and is left out; it does not discard the reviewer's findings with it. */
export async function repairReviewEvidence(raw:any, source:string, llm:NovelLLM, system:string, stage:string, currentScene?:string, dropUnsupportedEvents=false):Promise<any> {
  const valid=(value:unknown)=>typeof value==='string' && !!resolveProseEvidence(value,source) && source.includes(resolveProseEvidence(value,source)!);
  const missing:{path:string;claim:unknown}[]=[];
  if(Array.isArray(raw?.checks)) raw.checks.forEach((check:any,index:number)=>{
    if(check && typeof check==='object' && !valid(check.evidence)) missing.push({path:`checks.${index}`,claim:check});
  });
  if(Array.isArray(raw?.issues)) raw.issues.forEach((issue:any,index:number)=>{
    if(issue && typeof issue==='object' && issue.severity==='major' && issue.kind!=='style' && !valid(issue.evidence)) missing.push({path:`issues.${index}`,claim:issue});
  });
  const currentValid=(value:unknown)=>valid(value) && (currentScene===undefined || currentScene.includes(resolveProseEvidence(value as string,source)!));
  if(Array.isArray(raw?.state_trace?.events))raw.state_trace.events.forEach((event:any,index:number)=>{
    if(event && !currentValid(event.evidence))missing.push({path:`state_trace.events.${index}`,claim:event});
  });
  if(raw?.state_trace?.checks)for(const [key,check] of Object.entries(raw.state_trace.checks) as [string,any][]){
    const isValid=['knowledge_sources','time'].includes(key)?valid:currentValid;
    if(check && !isValid(check.evidence))missing.push({path:`state_trace.checks.${key}`,claim:check});
  }
  if(!missing.length)return raw;
  const references=[...proseEvidence(source).references.keys()];
  const paths=missing.map(item=>item.path);
  const allowed=(path:string)=>path.startsWith('state_trace.') && !['state_trace.checks.knowledge_sources','state_trace.checks.time'].includes(path) && currentScene!==undefined
    ? references.filter(ref=>currentScene.includes(resolveProseEvidence(ref,source)!)):references;
  const repaired=await structuredResponse(
    `Repair only invalid evidence citations in a review. This is a formatting/source-location task, not permission to rewrite the source or approve a claim.\nCURRENT REVIEW SOURCE (plan or manuscript):\n${proseEvidence(source).annotated}\nInvalid citation fields and their unchanged claims:\n${JSON.stringify(missing.map(item=>({...item,allowed_addresses:allowed(item.path)})))}\nReturn references for every listed path exactly once. evidence must be ONE address from ${JSON.stringify(references)}. Select the passage that grounds the claim; for a missing step select the passage where the omission matters. supported is true only if the original verdict is actually grounded in this source. If not, return supported:false and explain the mismatch; code will keep the defect unresolved. Never cite an old version, escape/reconstruct quotations, or invent a fact.`,
    system,llm,['references'],value=>{
      // The locator supplies citations, not approval. Recover partial/malformed locator
      // output conservatively instead of letting an auxiliary format error kill the review.
      const entries=Array.isArray(value.references)?value.references:[];
      return paths.map(path=>{
        const matches=entries.filter((item:any)=>item?.path===path);
        const item=matches.length===1?matches[0]:undefined;
        const quote=typeof item?.evidence==='string'?resolveProseEvidence(item.evidence,source):undefined;
        const evidence=allowed(path).find(ref=>ref===item?.evidence || quote && resolveProseEvidence(ref,source)===quote);
        const supported=!!evidence && item?.supported===true;
        return {path,evidence,supported,
          explanation:typeof item?.explanation==='string' && item.explanation.trim() ? item.explanation.trim()
            : supported ? 'The locator selected a current source passage for this unchanged verdict.'
            : 'The citation locator did not substantiate this verdict with a unique current source passage. Recheck the claim against the source.'};
      });
    },{stage:`${stage}-evidence`,schema:{type:'object',required:['references'],additionalProperties:false,properties:{references:{type:'array',minItems:paths.length,maxItems:paths.length,items:{type:'object',required:['path','evidence','supported','explanation'],additionalProperties:false,properties:{path:{type:'string',enum:paths},evidence:{type:'string',enum:references},supported:{type:'boolean'},explanation:{type:'string',minLength:1}}}}}},maxTokens:Math.max(4096,paths.length*512),deliberate:true});
  const result=structuredClone(raw);
  const dropped=new Set<number>();
  for(const item of repaired){
    if(dropUnsupportedEvents && !item.supported && item.path.startsWith('state_trace.events.')) {dropped.add(Number(item.path.split('.')[2]));continue;}
    const parts=item.path.split('.');
    const collection=parts[0];
    const target=parts.reduce((value:any,key)=>value[key],result);
    if (!item.supported && (collection === 'issues' || collection === 'state_trace')) {
      throw new Error(`Unverified review evidence at ${item.path}: ${item.explanation}. Re-assess the review against current prose; this is a reviewer failure, not a confirmed manuscript defect.`);
    }
    target.evidence=item.evidence;
    if(!item.supported && collection==='checks') {target.status='unresolved';target.explanation=item.explanation;}
  }
  if(dropped.size) result.state_trace.events=result.state_trace.events.filter((_:unknown,index:number)=>!dropped.has(index));
  return result;
}
