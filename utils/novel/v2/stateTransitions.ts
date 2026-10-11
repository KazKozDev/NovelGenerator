import { proseReviewSchema } from './proseReviewSchema';
import { resolveProseEvidence, proseEvidence } from './proseEvidence';
import type {ThesisPlan,ThesisReview} from './theses';
export const TRANSITION_CHECKS=['state_chain','knowledge_sources','time','choice_consequence','outcome'] as const;
/** Review traces are invalidated by any edit to their scene. */
export function sceneRevision(text:string){
  let a=2166136261,b=5381;
  for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
  return `${text.length}:${a>>>0}:${b>>>0}`;
}
export interface StateTrace {
  source_revision:string;
  wording_mismatches?:{character_id:string;dimension:string;previous:string;before:string;evidence:string}[];
  events:{character_id:string;dimension:'posture'|'location'|'knowledge'|'object'|'activity';subject:string;before:string;after:string;evidence:string}[];
  checks:Partial<Record<typeof TRANSITION_CHECKS[number],{status:'supported'|'defect'|'not_applicable';evidence:string;explanation:string}>>;
  /** Entries left out because their character or citation could not be read. */
  skipped?:number;
}
export function transitionReviewSchema(ids:string[],references:string[]){
  const event={type:'object',required:['character_id','dimension','subject','before','after','evidence'],additionalProperties:false,properties:{character_id:{type:'string',enum:ids},dimension:{type:'string',enum:['posture','location','knowledge','object','activity']},subject:{type:'string',minLength:1},before:{type:'string',minLength:1},after:{type:'string',minLength:1},evidence:{type:'string',enum:references}}};
  const check={type:'object',required:['status','evidence','explanation'],additionalProperties:false,properties:{status:{type:'string',enum:['supported','defect','not_applicable']},evidence:{type:'string',enum:references},explanation:{type:'string',minLength:1}}};
  return { ...proseReviewSchema,required:[...proseReviewSchema.required,'state_trace'],properties:{...proseReviewSchema.properties,state_trace:{type:'object',required:['events','checks'],additionalProperties:false,properties:{events:{type:'array',minItems:1,items:event},checks:{type:'object',required:[...TRANSITION_CHECKS],additionalProperties:false,properties:Object.fromEntries(TRANSITION_CHECKS.map(key=>[key,check]))}}}}};
}
export const TRANSITION_INSTRUCTIONS=`
STATE TRANSITION REVIEW: Extract state_trace from ACTUAL current scene prose, in event order. Planned conditions are expectations, never evidence that an event occurred. Each event identifies character_id, dimension (posture, location, knowledge, object, activity), subject, before, after and ONE current paragraph evidence address. Use stable subject names for the same object/fact. For posture use standing, seated, lying, absent or unknown; include every actual sit/stand/lie transition, including repeated ones. Use unknown when the prose does not establish the prior state; do not guess. For a transition whose before state is contradicted by an earlier event, preserve that claimed before state so code can detect the mismatch. Use activity for consequential actions without a posture/location/object change. Extract current-scene events only, not retrieved earlier context.
Return five evidence-backed checks in state_trace.checks:
state_chain: replay changes in order; no second arrival/sitting down without a preceding departure/standing up. A recollection is not a second action.
knowledge_sources: for every consequential claim or action based on private information, identify who learned what, from which actual observation/disclosure, and when. Distinguish narrative truth, suspicion, deliberate lie and someone's allegation. Author-only canonical facts do not license character knowledge. If a character explains a threat/scheme, then dismisses it or behaves incompatibly, require an established motive or interpretation; report the specific missing causal bridge.
time: compare concrete appointment times, dates and elapsed time with supplied prior prose and the thesis; identify both competing values rather than saying 'timeline coherent'. A clearly signalled change is allowed.
choice_consequence: name the new choice or action and the actual resulting change/response; test it against that actor's established knowledge and intention. Repeated fear is not a new consequence. Do not require a new decision in every scene, but justify not_applicable.
outcome: quote the actual scene effect that implements the thesis outcome, distinguishing an observed consequence from a promise or intention.
Each check has status supported, defect or not_applicable, evidence ONE current source address, and a concrete explanation naming the states, sources or action/consequence being compared. Use defect when a necessary causal bridge is missing. Only checks about knowledge/time may cite retrieved context; state_chain, choice_consequence, outcome and events must cite CURRENT SCENE paragraphs. Do not approve by keywords or a generic 'consistent'. Structural trace checks and independent causal judgement are complementary. Literary style and optional staging remain advisory.`;

const POSTURES=['standing','seated','lying','absent','unknown'];
const POSTURE_WORDS:[RegExp,string][]=[[/\b(sit|sits|sitting|sat|seated|crouch\w*|kneel\w*|perched)\b/,'seated'],[/\b(stand|stands|standing|stood|upright|walking|pacing|on (his|her|their) feet)\b/,'standing'],[/\b(lie|lies|lying|lay|prone|supine|reclin\w*|in bed)\b/,'lying'],[/\b(absent|gone|left|away|not present|offstage)\b/,'absent']];
/** Replay grounded state changes; preserve every failed check as an actionable repair. */
export function readStateTrace(raw:any,plan:ThesisPlan,source:string,sceneId:string,currentScene:string):{trace:StateTrace;issues:ThesisReview['issues']} {
  const trace=raw?.state_trace;
  if(!trace||!Array.isArray(trace.events)||!trace.events.length||!trace.checks)throw new Error('State transition review requires events and all five evidence-backed checks');
  const nonempty=(s:unknown):s is string=>typeof s==='string'&&!!s.trim();
  const quote=(value:unknown,currentOnly=false)=>{
    const resolved=typeof value==='string'?resolveProseEvidence(value,source):undefined;
    if(!resolved||!source.includes(resolved)||currentOnly&&!currentScene.includes(resolved))throw new Error(`State transition evidence must cite the ${currentOnly?'current scene':'supplied source'} exactly. Current addresses: ${[...proseEvidence(source).references.keys()].join(', ')}`);
    return resolved;
  };
  const issues:ThesisReview['issues']=[];
  const issue=(kind:string,evidence:string,problem:string,consequence:string)=>issues.push({severity:'major',kind,evidence,thesis_ids:[sceneId],problem,consequence,required_change:'Reconcile the evidenced state/source and the subsequent action or consequence. Preserve sound events; patch only the causal inconsistency.'});
  const states=new Map<string,string>();
  const wording_mismatches:NonNullable<StateTrace["wording_mismatches"]>=[];
  const normalize=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
  // A reviewer writes "sitting" or "on her feet"; a posture outside the five is read as
  // unknown, which can never raise a defect, instead of costing the whole review.
  const posture=(s:string)=>{const v=normalize(s);return POSTURES.includes(v)?v:POSTURE_WORDS.find(([pattern])=>pattern.test(v))?.[1]||'unknown';};
  // One entry that names a walk-on or cites the scene before does not cost the rest: a
  // trace of fifteen entries was being discarded whole for one of them, scene after scene.
  let skipped=0;
  const events=trace.events.flatMap((e:any)=>{
    if(!e||!plan.characters.some(c=>c.id===e.character_id)||!['posture','location','knowledge','object','activity'].includes(e.dimension)||![e.subject,e.before,e.after].every(nonempty)){skipped++;return [];}
    let evidence:string;
    try{evidence=quote(e.evidence,true);}catch{skipped++;return [];}
    const read=e.dimension==='posture'?posture:normalize;
    const before=read(e.before),after=read(e.after);
    const key=e.character_id+':'+e.dimension+':'+(['posture','location'].includes(e.dimension)?'state':normalize(e.subject));
    const previous=states.get(key);
    if(!['activity','posture'].includes(e.dimension)&&before!=='unknown'&&previous&&previous!=='unknown'&&previous!==before) wording_mismatches.push({character_id:e.character_id,dimension:e.dimension,previous,before,evidence});
    // Only enum posture states support literal inequality as a deterministic defect.
    // Free-text locations/facts/objects require the evidence-backed semantic checks.
    if(e.dimension==='posture'&&before!=='unknown'&&previous&&previous!=='unknown'&&previous!==before)issue('continuity',evidence,`${e.character_id} ${e.dimension}: previous state was ${previous}, but the next transition starts from ${before}.`,`The transition to ${after} requires an intervening change which the extracted scene events do not establish.`);
    if(e.dimension==='posture'&&before===after&&before!=='unknown')issue('impossible_action',evidence,`${e.character_id} repeats a posture transition while already ${before}.`,'The scene repeats sitting/standing/lying as a new action without the required change of state.');
    states.set(key,after);return [{...e,evidence}];
  });
  if(!events.length)throw new Error('State transition review has no event with evidence in the current scene');
  const checks={} as StateTrace['checks'];
  const kinds:Record<typeof TRANSITION_CHECKS[number],string>={state_chain:'continuity',knowledge_sources:'unsupported_knowledge',time:'continuity',choice_consequence:'narrative_failure',outcome:'missing_event'};
  for(const key of TRANSITION_CHECKS){
    const check=trace.checks[key];
    if(!check||!['supported','defect','not_applicable'].includes(check.status)||!nonempty(check.explanation)){skipped++;continue;}
    let evidence:string;
    // A verdict that cannot point at its passage is not recorded, as support or as defect.
    try{evidence=quote(check.evidence,!['knowledge_sources','time'].includes(key));}catch{skipped++;continue;}
    checks[key]={...check,evidence};
    if(check.status==='defect')issue(kinds[key],evidence,`${key}: ${check.explanation}`,check.explanation);
  }
  return {trace:{events,checks,...(skipped?{skipped}:{}),source_revision:sceneRevision(currentScene),...(wording_mismatches.length?{wording_mismatches}:{})},issues};
}
