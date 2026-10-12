import {structuredResponse, type NovelLLM} from './llm';
import {chapterBudget} from './sceneBudget';
import type {ProjectInput} from './types';

export interface ChapterDevelopment {
  chapter:number; start:string; goal:string;
  steps:{id:string; action:string; resistance:string; consequence:string; necessity:string}[];
  result:string; handoff:string; budget_rationale:string;
}
export interface DevelopmentReview {
  ready:boolean;
  issues:{chapter:number; problem:string; required_change:string}[];
}
export interface ChapterDevelopmentState {
  chapters:ChapterDevelopment[]; review?:DevelopmentReview; stalled?:number; unresolved?:boolean; revision?:string; previous_count?:number;
  response_candidate?:{stage:string;raw:string;error?:string};
}
const nonempty=(value:unknown):value is string=>typeof value==='string'&&!!value.trim();
const string={type:'string',minLength:1};
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const chapterSchema=object({chapter:{type:'integer',minimum:1},start:string,goal:string,
  steps:{type:'array',minItems:1,items:object({id:string,action:string,resistance:string,consequence:string,necessity:string})},
  result:string,handoff:string,budget_rationale:string});
export function readChapterDevelopment(raw:any,input:ProjectInput):ChapterDevelopment[] {
  if(!Array.isArray(raw?.chapters)||raw.chapters.length!==input.chapter_count)throw Error(`Development must have exactly ${input.chapter_count} chapters, 1 to ${input.chapter_count} in order; got ${Array.isArray(raw?.chapters)?raw.chapters.length:'no chapters array'}.`);
  const ids=new Set<string>();
  for(const [i,ch] of raw.chapters.entries()) {
    // Name the field: "chapter 2 needs its start, goal, steps…" sent a model round the same
    // answer five times without telling it which of the six was missing.
    if(ch?.chapter!==i+1)throw Error(`Entry ${i+1} of chapters must be chapter ${i+1}; it says ${JSON.stringify(ch?.chapter)}. Return the chapters in order.`);
    const empty=['start','goal','result','handoff','budget_rationale'].filter(key=>!nonempty(ch[key]));
    if(empty.length||!Array.isArray(ch.steps)||!ch.steps.length)throw Error(`Chapter ${i+1}: ${[empty.length?`missing or empty: ${empty.join(', ')}`:'',!Array.isArray(ch.steps)||!ch.steps.length?'steps must be a nonempty array':''].filter(Boolean).join('; ')}. Every chapter needs start, goal, steps, result, handoff and budget_rationale as nonempty text.`);
    for(const step of ch.steps) {
      const lacking=['id','action','resistance','consequence','necessity'].filter(key=>!nonempty(step?.[key]));
      if(lacking.length)throw Error(`Chapter ${i+1}, step ${nonempty(step?.id)?step.id:`number ${ch.steps.indexOf(step)+1}`}: missing or empty: ${lacking.join(', ')}.`);
      if(ids.has(step.id))throw Error(`Chapter ${i+1}: step ID ${step.id} is already used by another step in the development. Give this step an ID no other step has.`);
      ids.add(step.id);
    }
  }
  return raw.chapters;
}
/**
 * A finding is read for what it says, and refused only for what cannot be recovered — with
 * the finding and the field named. A reviewer that writes the chapter as "3", names it only
 * through a step ID, or puts "Required change: …" inside the problem has said everything
 * needed; refusing that with one sentence for three possible faults sent two models round
 * the same review five times.
 */
export function readDevelopmentIssues(raw:any,chapters:number):DevelopmentReview['issues'] {
  if(!Array.isArray(raw?.issues))throw Error('Return issues as an array; an empty array when the development has no defect.');
  return raw.issues.map((issue:any,index:number)=>{
    const at=`Issue ${index+1}`;
    let problem=nonempty(issue?.problem)?issue.problem.trim():'';
    let change=nonempty(issue?.required_change)?issue.required_change.trim():'';
    const inline=problem.match(/^([\s\S]*?)\s*Required change:\s*([\s\S]+)$/i);
    if(!change&&inline){problem=inline[1].trim();change=inline[2].trim();}
    const named=Number(issue?.chapter);
    const fromStep=Number((`${problem} ${change}`.match(/\bC(\d+)S\d+\b/)||[])[1]);
    const chapter=Number.isInteger(named)&&named>=1&&named<=chapters?named:Number.isInteger(fromStep)&&fromStep>=1&&fromStep<=chapters?fromStep:0;
    const lacking=[!problem?'problem is empty':'',!change?'required_change is empty (say what must change, in its own field)':'',
      !chapter?`chapter must be a whole number from 1 to ${chapters}; got ${JSON.stringify(issue?.chapter)} — give the chapter where the defect starts`:''].filter(Boolean);
    if(lacking.length)throw Error(`${at}: ${lacking.join('; ')}. Keep the finding; correct only these fields.`);
    return {chapter,problem,required_change:change};
  });
}
export function developmentContext(state:ChapterDevelopmentState|undefined,input:ProjectInput):string {
  if(!state)return '';
  return JSON.stringify(state.chapters.map(ch=>({...ch,target_words:chapterBudget(input,ch.chapter)})));
}
/** Develop events before choosing scene boundaries. The word target is code-owned,
 * never inferred from a model's word counts or a fixed desired scene count. */
export async function developChapters(input:ProjectInput,synopsis:string,system:string,llm:NovelLLM,
  state:ChapterDevelopmentState,onSave:(state:ChapterDevelopmentState)=>void):Promise<void> {
  const budgets=Array.from({length:input.chapter_count},(_,i)=>({chapter:i+1,target_words:chapterBudget(input,i+1)}));
  while(!state.review?.ready&&!state.unresolved) {
    // A finding names its chapter. Only the chapters with findings are written again; the
    // others stand as they are. One remark used to cost the whole development a second time.
    const cited=[...new Set((state.review?.issues||[]).map(issue=>issue.chapter))].sort((a,b)=>a-b);
    if(state.chapters.length&&state.review&&cited.length&&cited.length<input.chapter_count) {
      delete state.unresolved;
      const stage='thesis-chapter-development-repair';
      const repaired=await structuredResponse(
        `Author request: ${JSON.stringify(input)}\nCoarse synopsis: ${synopsis}\nCurrent development of every chapter, with USER budgets: ${developmentContext(state,input)}\nDefects to repair: ${JSON.stringify(state.review.issues)}\nRewrite ONLY chapter${cited.length>1?'s':''} ${cited.join(', ')} so that each defect is repaired. Return {chapters:[...]} holding exactly ${cited.length>1?'those chapters':'that chapter'} in the same shape: {chapter,start,goal,steps:[{id,action,resistance,consequence,necessity}],result,handoff,budget_rationale}. The other chapters are not returned and do not change, so a rewritten chapter must still open on what the chapter before it left and hand on what the chapter after it starts from. Keep the step IDs of steps you keep; give a new step a new ID not used anywhere in the development. Do NOT assign scene boundaries or word counts.`,
        system,llm,['chapters'],raw=>{
          if(!Array.isArray(raw?.chapters)||raw.chapters.length!==cited.length||raw.chapters.some((ch:any,i:number)=>ch?.chapter!==cited[i]))throw Error(`Return exactly chapter${cited.length>1?'s':''} ${cited.join(', ')}, in that order, and no other.`);
          return readChapterDevelopment({chapters:state.chapters.map(ch=>raw.chapters.find((r:any)=>r.chapter===ch.chapter)||ch)},input);
        },{stage,route:'validator',schema:object({chapters:{type:'array',minItems:cited.length,maxItems:cited.length,items:chapterSchema}}),maxTokens:Math.max(4096,cited.length*2400),deliberate:true});
      state.chapters=repaired;delete state.review;onSave(state);
    }
    else if(!state.chapters.length||state.review) {
      delete state.unresolved;
      const stage='thesis-chapter-development';
      const candidate=await structuredResponse(
        `Author request: ${JSON.stringify(input)}\nCoarse synopsis: ${synopsis}\nUser chapter budgets: ${JSON.stringify(budgets)}\nPrevious development: ${developmentContext(state,input)}\nConcrete defects to repair: ${JSON.stringify(state.review?.issues||[])}\nDevelop the dramatic progression of EVERY chapter before dividing it into scenes. Return {chapters:[{chapter,start,goal,steps:[{id,action,resistance,consequence,necessity}],result,handoff,budget_rationale}]}. Use globally unique step IDs. Start with the actual consequence of the preceding chapter. Each attempt or consequential choice faces resistance and changes the next action; a step is not a decorative description, repeated conversation or replay. necessity says exactly what the story loses if that step is removed. Let conflicting intentions drive the chain. Include earned discoveries, failed attempts or consequences only where this story needs them; do not impose a fixed formula or number of steps. Explain concretely why these events can sustain the USER's volume through action, dialogue and consequences. If there is too little material, develop the causal chain now instead of promising padded prose later. Preserve the premise and intended ending. Do NOT assign scene boundaries or word counts yet.`,
        system,llm,['chapters'],raw=>readChapterDevelopment(raw,input),{stage,route:'validator',schema:object({chapters:{type:'array',minItems:input.chapter_count,maxItems:input.chapter_count,items:chapterSchema}}),maxTokens:Math.max(4096,input.chapter_count*1200),deliberate:true,
          initialResponse:state.response_candidate?.stage===stage?state.response_candidate.raw:undefined,
          onCandidate:(raw,error)=>{state.response_candidate={stage,raw,error};onSave(state);}});
      state.chapters=candidate;delete state.response_candidate;delete state.review;onSave(state);
    }
    const stage='thesis-chapter-development-review';
    const review=await structuredResponse(
      `Author request: ${JSON.stringify(input)}\nSynopsis: ${synopsis}\nChapter development with USER budgets: ${developmentContext(state,input)}\nIndependently check the dramatic chain before scene planning. Does each action have a cause and a consequential result? Does that result affect the next action and the next chapter? What would be lost if each step were removed? Is there enough concrete dramatic material for the chapter's volume without repeated exposition, decorative filler or compressed crucial investigation? A numerical count of steps is NOT proof of sufficiency; do not impose a fixed structure or mandatory failed attempt. Check protagonist choices, opposition, setup and payoff. The synopsis is a sketch: this development exists to invent the intermediate events, people and evidence it leaves out, so an event or person absent from the synopsis is NOT a defect. Report an invented event only when nothing inside this development causes it, when it contradicts the author's premise, or when it does a job the protagonist's own choice should do. Judge the development as written, never as it would stand after your own requested change. Report each root cause once, in the chapter where it starts, and name the later steps that depend on it inside that one finding; do not list the dependants as findings of their own. Return {ready,issues:[{chapter,problem,required_change}]}. Report only concrete defects, with the responsible step IDs inside problem and a specific semantic correction. Empty issues means ready.`,
      system,llm,['ready','issues'],raw=>{
        const issues=readDevelopmentIssues(raw,input.chapter_count);
        return {ready:issues.length===0,issues} as DevelopmentReview;
      },{stage,route:'validator',schema:object({ready:{type:'boolean'},issues:{type:'array',items:object({chapter:{type:'integer',enum:budgets.map(b=>b.chapter)},problem:string,required_change:string})}}),maxTokens:4096,deliberate:true,
        initialResponse:state.response_candidate?.stage===stage?state.response_candidate.raw:undefined,
        onCandidate:(raw,error)=>{state.response_candidate={stage,raw,error};onSave(state);}});
    delete state.response_candidate;
    const revision=JSON.stringify(state.chapters);
    // Track progress against the prior verified defect count, not model ready flags.
    if(!review.ready&&state.revision!==undefined)state.stalled=state.revision!==revision&&state.previous_count!==undefined&&review.issues.length<state.previous_count?0:(state.stalled||0)+1;
    state.previous_count=review.issues.length;
    state.revision=revision;state.review=review;onSave(state);
    // This is a sketch for the scene outline, not the outline: what it leaves unresolved
    // goes to the planner as named weaknesses, and the plan reviews judge the result.
    if(!review.ready&&(state.stalled||0)>=2){state.unresolved=true;onSave(state);return;}
  }
}
