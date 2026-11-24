import {parseObject,type NovelLLM} from '../v2/llm';
import type {ProjectStore} from '../v2/store';
import {savePromptBook,type PromptBook} from './index';
export interface PromptReview {
 createdAt:string; chapters:number[]; signature:string; summary:string;
 findings:{severity:'major'|'minor';description:string;suggestion:string;evidence:{chapter:number;source:'system'|'prompt';quote:string}[]}[];
}
export function reviewSignature(book:PromptBook,chapters:number[]):string {
 return JSON.stringify([book.revision,book.blueprint,chapters.map(n=>book.prompts.find(p=>p.chapter===n))]);
}
export const reviewIsCurrent=(book:PromptBook,review:PromptReview)=>review.signature===reviewSignature(book,review.chapters);
export function reviewRequest(book:PromptBook,selection:number[]) {
 const chapters=[...new Set(selection)].sort((a,b)=>a-b);
 if(chapters.length<2)throw new Error('Select at least two prompts to compare.');
 const prompts=chapters.map(n=>book.prompts.find(p=>p.chapter===n));
 if(prompts.some(p=>!p||p.sourceRevision!==book.revision))throw new Error('Regenerate selected prompts from the current outline first.');
 const context=book.blueprint && {overview:book.blueprint.overview,centralConflict:book.blueprint.centralConflict,ending:book.blueprint.ending,characters:book.blueprint.characters,facts:book.blueprint.facts,chapters:book.blueprint.chapters.map(c=>({chapter:c.chapter,title:c.title,outcome:c.outcome,dependsOn:c.dependsOn}))};
 const prompt=JSON.stringify({context,selectedPrompts:prompts});
 if(prompt.length>120000)throw new Error('The selection exceeds 120 000 characters. Select fewer chapters.');
 return {chapters,prompt};
}
export async function checkPromptConsistency(store:ProjectStore,llm:NovelLLM,selection:number[],active=()=>{}) {
 const book=store.loadAuthor()?.promptPlanning;
 if(!book)throw new Error('No prompts available for review.');
 const {chapters,prompt}=reviewRequest(book,selection),signature=reviewSignature(book,chapters);
 const raw=parseObject(await llm(prompt,`Проверь согласованность ТОЛЬКО selectedPrompts между собой: причинность, переходы, хронологию, знания персонажей, раскрытия, повторные события и противоречащие инструкции. context — справочный план, НЕ доказательство ошибки в непереданных промптах. Не путай знание героя с раскрытием для читателя. Пропущенные главы могут объяснять переход: не объявляй это противоречием без доказательства. Не переписывай промпты и не пиши прозу. Верни JSON {"summary":"вывод и ограничения выборки","findings":[{"severity":"major или minor","description":"конкретное противоречие","suggestion":"как согласовать","evidence":[{"chapter":1,"source":"prompt или system","quote":"точная непустая цитата из выбранного текста"}]}]}. Каждое замечание подтверждай точными цитатами из минимум двух разных выбранных chapters. Если доказанных противоречий нет, findings: []. Write summary, descriptions and suggestions in English. Keep evidence quotes exactly in their original language.`,{stage:'prompt-consistency',route:'writer',json:true,temperature:0.2,maxTokens:8000}));
 active();
 if(typeof raw.summary!=='string'||!raw.summary.trim()||!Array.isArray(raw.findings))throw new Error('The review returned an invalid format; no result was saved.');
 for(const f of raw.findings){
  if(!f||!['major','minor'].includes(f.severity)||typeof f.description!=='string'||!f.description.trim()||typeof f.suggestion!=='string'||!f.suggestion.trim()||!Array.isArray(f.evidence)||new Set(f.evidence.map((e:any)=>e?.chapter)).size<2)throw new Error('A finding lacks evidence from two chapters; no result was saved.');
  for(const e of f.evidence){const p=book.prompts.find(p=>p.chapter===e?.chapter);if(!chapters.includes(e?.chapter)||!p||!['system','prompt'].includes(e.source)||typeof e.quote!=='string'||e.quote.trim().length<6||!p[e.source as 'system'|'prompt'].includes(e.quote))throw new Error('The model cited an unverified quotation; no result was saved.');}
 }
 const current=store.loadAuthor()!.promptPlanning!;
 if(signature!==reviewSignature(current,chapters))throw new Error('Prompts changed during the review. Run it again.');
 const review:PromptReview={createdAt:new Date().toISOString(),chapters,signature,summary:raw.summary,findings:raw.findings};
 current.reviews=[...(current.reviews||[]).slice(-9),review];savePromptBook(store,current);return review;
}
