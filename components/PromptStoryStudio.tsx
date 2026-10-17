import React,{useEffect,useMemo,useState} from 'react';
import {ThreeZoneGenerationView} from './ThreeZoneGenerationView';
import {GenerationStep,ChapterGenerationStage,type AgentLogEntry,type ChapterData} from '../types';
import type {TokenTotals} from '../utils/tokenUsage';
import type {PromptBook} from '../utils/novel/promptBook';
import {normalizeChapterBody} from '../utils/novel/manuscript';
import {withWritingStyle} from '../utils/novel/promptBook/style';
import {modelTimeMs,durationLabel} from '../utils/novel/promptBook/telemetry';
const words=(text:string)=>text.trim()?text.trim().split(/\s+/u).length:0;
export function PromptStoryStudio({book,running,writingChapter=0,liveText='',selectedChapter,onChapterSelect,logs=[],tokens,savedAt,saveStatus,onResume,error}:{book:PromptBook;running:boolean;writingChapter?:number;liveText?:string;selectedChapter:number;onChapterSelect:(chapter:number)=>void;logs?:AgentLogEntry[];tokens?:TokenTotals;savedAt?:number;saveStatus?:{state:'saving'|'saved'|'error';error?:string};onResume?:()=>void;error?:string|null}) {
 const [follow,setFollow]=useState(true),[now,setNow]=useState(Date.now);
 useEffect(()=>{if(!running)return;const tick=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(tick);},[running]);
 useEffect(()=>{if(follow&&running&&writingChapter)onChapterSelect(writingChapter);},[follow,running,writingChapter,onChapterSelect]);
 const chapters=useMemo<ChapterData[]>(()=>Array.from({length:book.brief.input.chapter_count},(_,i)=>{const n=i+1,p=book.prompts.find(p=>p.chapter===n),c=book.story?.chapters.find(c=>c.chapter===n),previous=book.storyEdits?.at(-1)?.before.chapters.find(c=>c.chapter===n);return {title:p?.title||`Chapter ${n}`,content:c?normalizeChapterBody(c.text,n):'',plan:p?.prompt||'No chapter prompt saved.',previousContent:previous?normalizeChapterBody(previous.text,n):undefined,generationStage:c?ChapterGenerationStage.Complete:ChapterGenerationStage.NotStarted,revisionStatus:c?'Saved draft · not reviewed':running&&n===writingChapter?'Live draft · not saved':'Pending'};}),[book.story,book.prompts,book.storyEdits,book.brief.input.chapter_count,running,writingChapter]);
 const completed=book.story?.chapters.length||0,savedWords=chapters.reduce((sum,c)=>sum+words(c.content),0);
 const liveWords=running&&!book.story?.chapters.some(c=>c.chapter===writingChapter)?words(liveText):0;
 const target=book.brief.input.target_total_words,actual=savedWords+liveWords,percent=target?Math.round(actual/target*100):0;
 const active=book.prompts.find(p=>p.chapter===selectedChapter);
 const tools=[{name:'Chapter prompt',count:active?1:0,text:active?`${withWritingStyle(active.system,book.style?.profile)}\n\n${active.prompt}`:''},...(book.style?[{name:'Writing style',count:1,text:book.style.profile}]:[])];
 const outline=book.blueprint?`# ${book.blueprint.title}\n\n${book.blueprint.overview}\n\n## Central conflict\n${book.blueprint.centralConflict}\n\n${book.blueprint.chapters.map(c=>`### Chapter ${c.chapter}: ${c.title}\n${c.goal}\n\nOutcome: ${c.outcome}\n\nHandoff: ${c.handoff}`).join('\n\n')}`:'';
 const recordedCalls=Math.max(tokens?.calls||0,logs.filter(log=>log.type==='execution'||log.type==='warning').length);
 const metrics=[['Chapters saved',`${completed}/${book.brief.input.chapter_count}`],['Saved words',savedWords.toLocaleString('en')],['Live words',liveWords.toLocaleString('en')],['Word target',`${actual.toLocaleString('en')}/${target.toLocaleString('en')} · ${percent}%`],['Read time',actual?`~${Math.ceil(actual/200)} min`:'—'],['Model calls',recordedCalls?String(recordedCalls):completed?'—':'0'],['Model time',durationLabel(modelTimeMs(logs,running,now))]];
 return <section aria-label="Story generation studio" className="space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 bg-zinc-900/40 border border-zinc-800 rounded text-xs text-zinc-400" aria-label="Story progress statistics">
   <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
    {metrics.map(([label,value], idx)=><React.Fragment key={label}>
     {idx > 0 && <span className="text-zinc-700 hidden sm:inline" aria-hidden="true">·</span>}
     <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">{label}</span>
      <span className="text-zinc-100 font-semibold tabular-nums font-mono">{value}</span>
     </div>
    </React.Fragment>)}
   </div>
  </div>
  <div className="flex items-center justify-between gap-3 text-xs text-zinc-500"><p>Live words are not saved until the chapter finishes. Model usage covers the whole project.</p><label className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)}/>Follow active chapter</label></div>
  <div className="h-auto lg:h-[calc(100dvh-340px)] lg:min-h-[650px]" aria-label="Writing workspace">
   <ThreeZoneGenerationView embedded selectedChapterNumber={selectedChapter} onChapterSelect={n=>{setFollow(false);onChapterSelect(n);}} followActiveChapter={false} targetWordsPerChapter={Math.round(target/book.brief.input.chapter_count)} currentStep={error?GenerationStep.Error:running?GenerationStep.GeneratingChapters:completed===book.brief.input.chapter_count?GenerationStep.Done:GenerationStep.Idle} currentChapterProcessing={running?writingChapter:0} totalChaptersToProcess={book.brief.input.chapter_count} currentStoryOutline={outline} currentChapterPlan={active?.prompt||''} tools={tools} generatedChapters={chapters} agentLogs={logs} liveDraft={running&&liveText?{label:`Chapter ${writingChapter}`,text:liveText}:null} tokenTotals={tokens} lastSavedAt={savedAt} autosaveStatus={saveStatus} isLoading={running} isResumable={completed>0&&completed<book.brief.input.chapter_count&&!!onResume} onResumeGeneration={onResume} developmentLabel={running?`Writing chapter ${writingChapter} of ${book.brief.input.chapter_count}`:completed===book.brief.input.chapter_count?'Story draft complete':completed?'Paused · ready to resume':'Ready to write'} />
  </div>
 </section>;
}
