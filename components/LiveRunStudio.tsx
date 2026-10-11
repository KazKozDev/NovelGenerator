import type {RepairReport} from '../utils/novel/v2/repairPackage';
import React, { useEffect, useRef, useState } from 'react';
import ThreeZoneGenerationView from './ThreeZoneGenerationView';
import SaveBook from './SaveBook';
import { GenerationStep, ChapterGenerationStage } from '../types';
import type { Thesis, ThesisReview } from '../utils/novel/v2/theses';
import { getStoredProviderConfig, getStoredValidatorConfig } from '../services/llmService';
import type { TextEdit } from '../utils/novel/v2/manuscriptTools';
import { readMainForm, readGenerationSettings, buildProjectInput, DEFAULT_GENERATION_SETTINGS } from '../utils/generationSettings';

interface LiveState {
  repairProgress?:RepairReport;
  title?: string; synopsis?: string; planReady?: boolean; phase: string; status?: string; failure?: string;
  plan: Thesis[]; blocks: { thesis_id: string; text: string; review: ThesisReview }[];
  edits: { at: string; phase: string; edits: TextEdit[] }[]; activity: string[]; run: string; chapterCount?:number; savedAt?:string; startedAt?:number; endedAt?:number; calls?:number; canResume?:boolean; report?:Record<string,unknown>;
}
const phases: Record<string,string> = { plan:'Preparing the plan', 'plan-review':'Checking the plan', rough:'Rough draft', expand:'Expanding scenes', polish:'Polishing', done:'Final review', seam:'Scene transition', 'audit-repair':'Audit repair', repair:'Repair' };
const control = 'text-xs px-3 py-1.5 border border-zinc-700 rounded hover:bg-zinc-800';

function ChangedText({ text, edit, enabled }: {text:string; edit?:TextEdit; enabled:boolean}) {
  if (!enabled || !edit) return <>{text}</>;
  const at = edit.after ? text.indexOf(edit.after) : -1;
  if (at < 0 || text.indexOf(edit.after, at + 1) >= 0) return <><p className="text-xs font-sans text-zinc-500 mb-4">This earlier edit has been changed again. Its comparison remains in the inspector.</p>{text}</>;
  let prefix=0, suffix=0; const a=edit.before, b=edit.after;
  while(prefix<a.length && prefix<b.length && a[prefix]===b[prefix]) prefix++;
  while(suffix<a.length-prefix && suffix<b.length-prefix && a[a.length-1-suffix]===b[b.length-1-suffix]) suffix++;
  return <>{text.slice(0,at)+b.slice(0,prefix)}<span data-edit-anchor>
    <del className="revision-removed">{a.slice(prefix,a.length-suffix)}</del>
    <ins className="revision-added">{b.slice(prefix,b.length-suffix)}</ins>
  </span>{b.slice(b.length-suffix)+text.slice(at+b.length)}</>;
}

export default function LiveRunStudio() {
  const [state,setState]=useState<LiveState|null>(null), [error,setError]=useState(''), [actionError,setActionError]=useState('');
  const [paused,setPaused]=useState(false), [follow,setFollow]=useState(false), [diff,setDiff]=useState(true);
  const [resuming,setResuming]=useState(false), [chapter,setChapter]=useState(1);
  const [selected,setSelected]=useState(''), [edit,setEdit]=useState<TextEdit>();
  const manuscript=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(paused)return;let disposed=false, timer:ReturnType<typeof setTimeout>; const abort=new AbortController();
    const refresh=async()=>{try{const r=await fetch('/api/live-book/state',{signal:abort.signal});if(!r.ok)throw Error('Waiting for the run snapshot');const data=await r.json();if(!disposed){setState(data);setError('');}}
      catch(e){if(!disposed)setError(e instanceof Error?e.message:'Unable to connect');}
      finally{if(!disposed)timer=setTimeout(refresh,1000);}};
    refresh();return()=>{disposed=true;abort.abort();clearTimeout(timer)};
  },[paused]);
  useEffect(()=>{if(follow&&state){const last=state.edits.at(-1)?.edits.at(-1);setSelected(last?.block_id||state.blocks.at(-1)?.thesis_id||'');setEdit(last);}},[state,follow]);
  useEffect(()=>{manuscript.current?.querySelector('[data-edit-anchor]')?.scrollIntoView({block:'center'});},[edit]);
  const active=state?.plan.find(t=>t.id===selected)||state?.plan.find(t=>t.chapter===chapter);
  const block=state?.blocks.find(b=>b.thesis_id===(active?.id||selected));
  const latestEdit=edit?.block_id===block?.thesis_id?edit:state?.edits.flatMap(batch=>batch.edits).filter(e=>e.block_id===block?.thesis_id).at(-1);
  const words=state?.blocks.reduce((n,b)=>n+(b.text.trim()?b.text.trim().split(/\s+/).length:0),0)||0;
  const choose=(id:string)=>{setChapter(state?.plan.find(t=>t.id===id)?.chapter||1);setSelected(id);setEdit(undefined);setFollow(false);if(manuscript.current)manuscript.current.scrollTop=0;};
  const chapterText=state?.plan.filter(t=>t.chapter===(active?.chapter||chapter)).map(t=>state.blocks.find(b=>b.thesis_id===t.id)?.text||'').filter(Boolean).join('\n\n')||'';

  const bookText=state?.blocks.length?'# '+(state.title||'Book')+'\n\n'+Array.from({length:state.chapterCount||Math.max(...state.plan.map(t=>t.chapter))},(_,i)=>'## Chapter '+(i+1)+'\n\n'+state.plan.filter(t=>t.chapter===i+1).map(t=>state.blocks.find(b=>b.thesis_id===t.id)?.text||'').filter(Boolean).join('\n\n')).join('\n\n'):'';
  const resume=async()=>{setResuming(true);setActionError('');try{const r=await fetch('/api/live-book/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:buildProjectInput(readMainForm().premise,readMainForm().chapters,readGenerationSettings(DEFAULT_GENERATION_SETTINGS)),writer:getStoredProviderConfig(),editor:getStoredValidatorConfig()||null})});const result=await r.json();if(!r.ok)throw Error(result.error||'Unable to resume');setPaused(false);setError('');}catch(e){setActionError(e instanceof Error?e.message:String(e))}finally{setResuming(false)}};

  const step=state?.status==='FAILED'?GenerationStep.Error:state?.status?GenerationStep.Done:state?.planReady?GenerationStep.GeneratingChapters:GenerationStep.GeneratingOutline;
  const banner=<p className="text-xs text-zinc-500">{state?.savedAt?'Snapshot saved '+new Date(state.savedAt).toLocaleTimeString('en-GB'):'Waiting for saved state'}</p>;
  const prose=<>

        <div className="px-4 sm:px-6 py-3 border-b border-zinc-800 flex flex-wrap gap-2 justify-between items-center shrink-0"><h2 className="text-sm">{active?`Chapter ${active.chapter} · ${active.id}`:`Chapter ${chapter}`}</h2><button className={control} aria-pressed={diff} onClick={()=>setDiff(!diff)}>{diff?'Clean text':'Show changes'}</button></div>
        <div ref={manuscript} className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
          {block?<div className="font-serif text-prose whitespace-pre-wrap max-w-[62ch] mx-auto"><ChangedText text={block.text} edit={latestEdit} enabled={diff}/></div>:<div className="max-w-[62ch] mx-auto text-zinc-500 font-serif text-prose">{state?.status==='FAILED'?'The run stopped before this scene was written. See the error above.':state?.planReady?'The writer will develop this thesis here.':'The plan is being crystallized and checked. Scenes will appear here once it is approved.'}</div>}
        </div>
  </>;
  const inspector=<>
    {actionError&&<p role="alert" className="text-xs text-red-400 border border-red-500/30 p-3 mb-3 rounded">{actionError}</p>}
    {error&&<p role="status" className="text-xs text-amber-400 border border-amber-500/30 p-3 mb-3 rounded">{error}</p>}
    {state?.failure&&<div role="alert" className="text-xs text-red-400 border border-red-500/30 p-3 mb-3 rounded break-words"><p className="font-semibold mb-2">Generation stopped</p><p>{state.failure}</p></div>}

        <p className="text-xs mb-4">{state?.status||phases[state?.phase||'plan']}</p>
        {block?.review.issues.map((issue,i)=><button key={i} className="block w-full text-left border border-amber-500/30 p-3 mb-2 rounded text-xs" onClick={()=>choose(block.thesis_id)}><span className="text-amber-400">{issue.severity} · {block.thesis_id}</span><p className="mt-2">{issue.problem}</p><p className="mt-2 text-zinc-500">{issue.required_change}</p></button>)}
        <h3 className="text-xs uppercase text-zinc-500 my-3">Edits · newest first</h3>
        {!state?.edits.length&&<p className="text-xs text-zinc-500">Applied replacements will appear here.</p>}
        {[...(state?.edits||[])].reverse().flatMap((batch,bi)=>[...batch.edits].reverse().map((e,ei)=><div key={`${bi}-${ei}`} className="p-3 mb-3 border border-zinc-800 rounded text-xs"><p className="text-zinc-500 mb-2">{e.block_id} · {phases[batch.phase]||batch.phase} · {new Date(batch.at).toLocaleTimeString('en-GB')}</p>{e.before&&<details><summary>Removed</summary><del className="whitespace-pre-wrap revision-removed">{e.before}</del></details>}{e.after&&<details><summary>Added</summary><ins className="whitespace-pre-wrap revision-added">{e.after}</ins></details>}<button className={`${control} mt-3`} onClick={()=>{setFollow(false);setSelected(e.block_id);setEdit(e);setDiff(true)}}>Go to edit</button></div>))}
        <details className="text-xs text-zinc-500"><summary>Run activity</summary><pre className="whitespace-pre-wrap break-words mt-2">{state?.activity.join('\n')}</pre></details>
  </>;
  const chapters=Array.from({length:state?.chapterCount||0},(_,i)=>({title:`Chapter ${i+1}`,content:state?.plan.filter(t=>t.chapter===i+1).map(t=>state.blocks.find(b=>b.thesis_id===t.id)?.text||'').filter(Boolean).join('\n\n')||'',plan:state?.plan.filter(t=>t.chapter===i+1).map(t=>`### ${t.id}\n${t.action}\n\nPurpose: ${t.why}\n\nOutcome: ${t.outcome}`).join('\n\n')||'Waiting for the chapter plan.',generationStage:state?.status&&state.status!=='FAILED'?ChapterGenerationStage.Complete:ChapterGenerationStage.FirstDraft}));
  const logs=(state?.activity||[]).map(line=>({timestamp:Date.parse(line.slice(0,24))||Date.now(),chapterNumber:chapter,type:(/FAILED|STOPPED|\[failed\]/.test(line)?'warning':/DONE status=COMPLETE/.test(line)?'success':/CALL#/.test(line)?'execution':'decision') as 'warning'|'success'|'execution'|'decision',message:line.slice(25)}));
  const actions=<><details className="relative"><summary className="text-xs cursor-pointer border border-zinc-800 rounded px-2 py-1">Project</summary><div className="fixed left-4 right-4 mt-2 sm:mt-0 sm:absolute sm:left-auto sm:right-0 sm:top-8 z-20 bg-zinc-950 border border-zinc-800 rounded p-3 flex flex-col gap-3 sm:w-64 max-w-[calc(100vw-2rem)]"><SaveBook content={bookText} metadata={state?.report||{}} draft={!state?.status||state.status==='FAILED'}/><a className={control} href="/api/live-book/project">Export project</a><a className={control} href="/">Main window</a></div></details><button className={control} aria-pressed={follow} onClick={()=>setFollow(!follow)}>{follow?'Following agent':'Follow agent'}</button><button className={control} onClick={()=>setPaused(!paused)}>{paused?'Resume view':'Pause view'}</button></>;
  return <div className="studio-viewport h-screen max-h-screen bg-zinc-950 p-3 flex flex-col overflow-hidden">{banner}<ThreeZoneGenerationView repairProgress={state?.repairProgress} version="v4.2" targetWordsPerChapter={state?.plan.filter(t=>t.chapter===chapter).reduce((sum,t)=>sum+t.target_words,0)} developmentLabel={state?.status||phases[state?.phase||'plan']} currentStep={step} currentChapterProcessing={follow?chapter:0} totalChaptersToProcess={state?.chapterCount||0} currentStoryOutline={state?.synopsis||''} currentChapterPlan="" generatedChapters={chapters} agentLogs={logs} lastSavedAt={state?.savedAt?Date.parse(state.savedAt):undefined} selectedChapterNumber={chapter} followActiveChapter={follow} onChapterSelect={n=>{setChapter(n);setSelected(state?.plan.find(t=>t.chapter===n)?.id||'');setEdit(undefined);setFollow(false);}} proseContent={()=>prose} inspectorContent={inspector} headerActions={actions} isResumable={state?.canResume} onResumeGeneration={resume} isLoading={resuming || Boolean(state && !state.status)}/></div>;
}
