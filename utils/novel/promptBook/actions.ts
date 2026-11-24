import {prepareWritingStyle,writingStyleSignature,withWritingStyle,planningBrief} from './style';
import {parseObject,stripThinking,type NovelLLM} from '../v2/llm';
import type {ProjectStore} from '../v2/store';
import {savePromptBook,type PromptBook} from './index';
import {checkPromptConsistency,reviewIsCurrent} from './review';

export interface PromptFix {
 createdAt:string;reviewCreatedAt:string;findingIndex:number;
 changes:{chapter:number;source:'system'|'prompt';before:string;after:string}[];
}
export interface PromptStory {
 revision:number;title?:string;styleSignature?:string;
 chapters:{chapter:number;title:string;text:string;system:string;prompt:string;createdAt:string}[];
}
const getBook=(store:ProjectStore)=>{const book=store.loadAuthor()?.promptPlanning;if(!book)throw new Error('Prompt project not found.');return book;};
export function promptsReady(book:PromptBook):boolean {
 return book.phase==='ready'&&book.prompts.length===book.brief.input.chapter_count&&Array.from({length:book.brief.input.chapter_count},(_,i)=>i+1).every(n=>book.prompts.some(p=>p.chapter===n&&p.sourceRevision===book.revision&&p.system.trim()&&p.prompt.trim()));
}
export function storyIsCurrent(book:PromptBook):boolean {
 return !book.story||book.story.revision===book.revision&&(book.story.styleSignature||'')===writingStyleSignature(book)&&book.story.chapters.every(c=>{const p=book.prompts.find(p=>p.chapter===c.chapter);return p?.system===c.system&&p.prompt===c.prompt&&p.title===c.title;});
}
/** Apply a narrowly scoped exact patch atomically; keep the original text in the project. */
export async function fixPromptIssue(store:ProjectStore,llm:NovelLLM,reviewCreatedAt:string,index:number,active=()=>{}) {
 const book=getBook(store),review=book.reviews?.at(-1),finding=review?.findings[index];
 if(!review||review.createdAt!==reviewCreatedAt||!Number.isInteger(index)||!finding||!reviewIsCurrent(book,review))throw new Error('This review is outdated. Review the prompts again before fixing an issue.');
 const editableChapters=[...new Set(finding.evidence.map(e=>e.chapter))];
 const request={editableChapters,authorRequirements:planningBrief(book),outline:book.blueprint,finding,prompts:book.prompts.filter(p=>review.chapters.includes(p.chapter))};
 if(JSON.stringify(request).length>120000)throw new Error('This repair exceeds 120 000 characters. Review a smaller selection first.');
 const raw=parseObject(await llm(JSON.stringify(request),`Fix only the supplied consistency issue in the existing chapter prompts. Preserve the author's requirements, language, plot, timing of revelations, and all unrelated instructions. The outline is context, not permission to rewrite the story. Prefer the smallest change in the chapter that needs the missing setup. Return JSON {"patches":[{"chapter":2,"source":"prompt","before":"exact unique passage from the original prompt","after":"replacement passage"}]}. source must be prompt or system. Each before must occur exactly once. Do not return whole rewritten prompts, prose, or changes outside editableChapters.`,{stage:'prompt-fix',route:'writer',json:true,temperature:0.2,maxTokens:8000}));
 active();
 const current=getBook(store);
 if(!reviewIsCurrent(current,review)||current.reviews?.at(-1)?.createdAt!==review.createdAt)throw new Error('Prompts or review changed during the repair. Nothing was applied.');
 if(!Array.isArray(raw.patches)||!raw.patches.length||raw.patches.length>12)throw new Error('The repair returned no valid patches. Nothing was applied.');
 const next=structuredClone(current),changes:PromptFix['changes']=[];
 for(const patch of raw.patches){
  const p=next.prompts.find(p=>p.chapter===patch?.chapter);
  if(!p||!editableChapters.includes(patch.chapter)||!['system','prompt'].includes(patch.source)||typeof patch.before!=='string'||patch.before.trim().length<6||typeof patch.after!=='string'||!patch.after.trim()||patch.after===patch.before)throw new Error('The repair contains an invalid patch. Nothing was applied.');
  const source=patch.source as 'system'|'prompt',before=p[source];
  if(before.split(patch.before).length!==2)throw new Error('A repair passage is missing or ambiguous. Nothing was applied.');
  const after=before.replace(patch.before,()=>patch.after);changes.push({chapter:p.chapter,source,before,after});p[source]=after;p.edited=true;
 }
 next.fixes=[...(next.fixes||[]),{createdAt:new Date().toISOString(),reviewCreatedAt,findingIndex:index,changes}];savePromptBook(store,next);
 store.log('prompt-fix',`Applied issue repair to chapters ${[...new Set(changes.map(c=>c.chapter))].join(', ')}. Original text retained.`);
 // A changed quote does not prove resolution: ask the checker again, using exactly the same scope.
 try{return await checkPromptConsistency(store,llm,review.chapters,active);}catch(error){active();throw new Error(`Fix saved, but verification did not finish: ${error instanceof Error?error.message:String(error)} Review the prompts again.`);}
}

/** All chapter prompts are prepared first. Writing consumes them unchanged, one chapter per call. */
export async function writePromptStory(store:ProjectStore,llm:NovelLLM,active=()=>{},progress=(chapter:number)=>{},restart=false) {
 let book=getBook(store);
 if(!promptsReady(book))throw new Error('Prepare and save all current chapter prompts before generating the story.');
 book=await prepareWritingStyle(store,llm,active);
 if(restart&&book.story){book.storyHistory=[...(book.storyHistory||[]),book.story];book.story=undefined;}
 if(!storyIsCurrent(book))throw new Error('Prompts or writing style used by the existing draft have changed. Start a new draft to keep the previous one.');
 book.story ||= {revision:book.revision,styleSignature:writingStyleSignature(book),chapters:[]};book.workspaceStage='story';active();savePromptBook(store,book);
 const ordered=[...book.prompts].sort((a,b)=>a.chapter-b.chapter);
 for(const p of ordered){
  if(book.story.chapters.some(c=>c.chapter===p.chapter))continue;
  active();progress(p.chapter);
  const previous=book.story.chapters.at(-1);
  // Full previous chapter for the seam, bounded tails for older continuity. No future chapter prompts.
  const earlier=book.story.chapters.slice(0,-1).map(c=>({chapter:c.chapter,ending:c.text.slice(-1800)}));
  const continuity=previous?`\n\nACTUAL PREVIOUS CHAPTER (established events, do not repeat or rewrite):\n${previous.text}\n\nEARLIER CHAPTER ENDINGS (partial context):\n${JSON.stringify(earlier)}\nContinue from the actual previous ending. Do not replay its resolution. If a planned starting detail differs, bridge it plausibly without changing established events.`:'';
  const prompt=p.prompt+continuity;
  const writerSystem=withWritingStyle(p.system,book.style?.profile);
  if(prompt.length+writerSystem.length>160000)throw new Error('Chapter context exceeds 160 000 characters. Writing paused without truncating the previous chapter.');
  const text=stripThinking(await llm(prompt,writerSystem,{stage:'prompt-story',route:'writer',temperature:0.7,maxTokens:Math.min(32000,Math.max(8000,Math.ceil(book.brief.input.target_total_words/book.brief.input.chapter_count*4))),json:false}));
  active();
  if(!text.trim()||text.trim().split(/\s+/).length<80)throw new Error(`Chapter ${p.chapter} returned an empty or very short response. It was not saved; resume to try again.`);
  const current=getBook(store),currentPrompt=current.prompts.find(c=>c.chapter===p.chapter);
  if(!storyIsCurrent(current)||JSON.stringify(currentPrompt)!==JSON.stringify(p)||JSON.stringify(current.story)!==JSON.stringify(book.story))throw new Error('The draft or prompts changed during writing. The response was not applied.');
  current.story!.chapters.push({chapter:p.chapter,title:p.title,text,system:p.system,prompt:p.prompt,createdAt:new Date().toISOString()});savePromptBook(store,current);store.checkpoint(`Story chapter ${p.chapter} saved`);book=current;
 }
 store.log('prompt-story',`Story complete: ${book.story!.chapters.length} chapters. No editors were run.`);return book;
}
