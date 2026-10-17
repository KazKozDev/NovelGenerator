import {PromptStoryStudio} from './PromptStoryStudio';
import type {AgentLogEntry} from '../types';
import type {TokenTotals} from '../utils/tokenUsage';
import BookDisplay from './BookDisplay';
import SaveBook from './SaveBook';
import {canEditPromptStory,promptStoryContent,promptStoryMetadata,type PromptWorkspaceStage} from '../utils/novel/promptBook/editing';
import {WritingStylePanel} from './WritingStylePanel';
import {withWritingStyle,styleNeedsGeneration,type StyleInputs} from '../utils/novel/promptBook/style';
import React, {useEffect,useState} from 'react';
import CoverStudio from './CoverStudio';
import type {BookBlueprint,ChapterPrompt,PromptBook} from '../utils/novel/promptBook';
import {promptsReady,storyIsCurrent} from '../utils/novel/promptBook/actions';
import {reviewIsCurrent} from '../utils/novel/promptBook/review';
import {saveOrDownload} from '../utils/saveToBookFolder';

const field='w-full rounded border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400 disabled:opacity-60';
const button='rounded border border-zinc-700 px-3 py-2 text-xs hover:bg-zinc-800 disabled:opacity-40';
function PromptEditor({value,stale,busy,onSave,onDirty,styleProfile,disableCopy}:{value:ChapterPrompt;stale:boolean;busy:boolean;onSave:(chapter:number,system:string,prompt:string)=>Promise<void>;onDirty:(chapter:number,dirty:boolean)=>void;styleProfile?:string;disableCopy?:boolean}) {
 const [system,setSystem]=useState(value.system),[prompt,setPrompt]=useState(value.prompt),[message,setMessage]=useState('');
 useEffect(()=>{setSystem(value.system);setPrompt(value.prompt);setMessage('');},[value.chapter,value.system,value.prompt]);
 const dirty=system!==value.system||prompt!==value.prompt;
 useEffect(()=>{onDirty(value.chapter,dirty);},[dirty,value.chapter,onDirty]);
 return <div className="rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden text-left flex flex-col">
  <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
   <h2 className="text-sm font-medium text-zinc-200">Chapter {value.chapter}. {value.title}</h2>
   <span className="text-xs text-zinc-400">{stale?'Outdated after outline change':value.edited?'Edited manually':'Based on current outline'}</span>
  </div>
  <div className="p-4 space-y-3">
   {styleProfile&&<p className="text-xs text-zinc-400">The shared writing style profile is added automatically. Edit it under Writing style.</p>}
   <label className="block text-xs">Writer instructions<textarea aria-label={`Chapter instructions ${value.chapter}`} value={system} onChange={e=>setSystem(e.target.value)} disabled={busy||stale} rows={4} className={`${field} mt-2`}/></label>
   <label className="block text-xs">Full prompt<textarea aria-label={`Chapter prompt ${value.chapter}`} value={prompt} onChange={e=>setPrompt(e.target.value)} disabled={busy||stale} rows={30} className={`${field} mt-2`}/></label>
   <div className="flex flex-wrap gap-2">
    <button className={button} disabled={busy||stale||!dirty||!system.trim()||!prompt.trim()} onClick={async()=>{try{await onSave(value.chapter,system,prompt);setMessage('Saved');}catch(e){setMessage(String(e));}}}>Save prompt changes</button>
    <button className={button} disabled={!dirty||busy} onClick={()=>{setSystem(value.system);setPrompt(value.prompt);setMessage('Changes discarded');}}>Discard changes</button>
    <button className={button} disabled={stale||dirty||disableCopy} onClick={async()=>{try{await navigator.clipboard.writeText(`${withWritingStyle(system,styleProfile)}\n\n${prompt}`);setMessage('Copied');}catch{setMessage('Could not copy. Select the text in the field to copy it manually.');}}}>Copy</button>
    {message&&<p className="text-xs self-center" role="status">{message}</p>}
   </div>
  </div>
 </div>;
}
export default function PromptBookWorkspace({value,busy,label,error,onContinue,onSaveBlueprint,onSavePrompt,onExport,onSettings,saveStatus,onCheck,onFix,onGenerateStory,onStop,writingChapter,liveText,onSaveStyle,onGenerateStyle,onStageChange,onSaveStory,onReset,publication,agentLogs,tokenTotals,lastSavedAt,autosaveStatus}:{
 value:PromptBook;agentLogs?:AgentLogEntry[];tokenTotals?:TokenTotals;lastSavedAt?:number;autosaveStatus?:{state:'saved'|'saving'|'error';error?:string};busy:boolean;label?:string;error?:string|null;onContinue:()=>void;
 onSaveBlueprint:(plan:BookBlueprint)=>Promise<void>;onSavePrompt:(chapter:number,system:string,prompt:string)=>Promise<void>;
 onExport:()=>void;onSettings:()=>void;saveStatus?:string;onCheck?:(chapters:number[])=>Promise<void>;onFix?:(review:string,index:number)=>Promise<void>;onGenerateStory?:(restart?:boolean)=>Promise<void>;onStop?:()=>void;writingChapter?:number;liveText?:string;onStageChange?:(stage:PromptWorkspaceStage)=>void;onSaveStory?:(content:string,expected:string)=>boolean;onReset?:()=>void;publication?:Pick<React.ComponentProps<typeof BookDisplay>,'author'|'onAuthorChange'|'imprint'|'onImprintChange'|'coverImage'|'onCoverChange'>;onSaveStyle?:(profile:string,inputs:StyleInputs)=>Promise<void>;onGenerateStyle?:(inputs:StyleInputs)=>Promise<void>;
}) {
 const [plan,setPlan]=useState<BookBlueprint|undefined>(value.blueprint),[editing,setEditing]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{setPlan(value.blueprint);setEditing(false);},[value.revision,value.blueprint]);
 const [active,setActive]=useState<number|'plan'>(value.prompts[0]?.chapter??'plan');
 const [selected,setSelected]=useState<number[]>([]),[dirty,setDirty]=useState<Record<number,boolean>>({});
 const trackDirty=React.useCallback((chapter:number,isDirty:boolean)=>setDirty(old=>old[chapter]===isDirty?old:{...old,[chapter]:isDirty}),[]);
 const [styleDirty,setStyleDirty]=useState(false);
 const [editorDirty,setEditorDirty]=useState(false);
 const unsaved=editorDirty||styleDirty||Object.values(dirty).some(Boolean)||editing;
 const ordered=[...value.prompts].sort((a,b)=>a.chapter-b.chapter);
 const review=value.reviews?.at(-1);
 const reviewDraftChanged=!!review&&review.chapters.some(n=>dirty[n]);
 const [checking,setChecking]=useState(false),[fixing,setFixing]=useState<number|null>(null),[writing,setWriting]=useState(false);
 const [view,setView]=useState<PromptWorkspaceStage>(value.workspaceStage||'prompts');
 useEffect(()=>{if(value.workspaceStage)setView(value.workspaceStage);},[value.workspaceStage]);
 const changeView=(next:PromptWorkspaceStage)=>{setView(next);if(next==='story'&&active==='plan')setActive(1);onStageChange?.(next);};
 const editableStory=canEditPromptStory(value);
 const [editorOpened,setEditorOpened]=useState(false);
 useEffect(()=>{if(view==='editing'&&editableStory)setEditorOpened(true);},[view,editableStory]);
 const [coverOpened,setCoverOpened]=useState(false);
 useEffect(()=>{if(view==='cover')setCoverOpened(true);},[view]);
 const coverTitle=value.blueprint?.title||value.brief.input.title||'';
 const coverFacts=React.useMemo(()=>({title:coverTitle,genre:value.brief.input.genre,premise:value.brief.input.premise,requirements:value.brief.input.author_requirements,excerpt:value.story?.chapters?.[0]?.text?.slice(0,3000)}),[coverTitle,value.brief,value.story]);
 const manuscript=React.useMemo(()=>promptStoryContent(value),[value.story,value.blueprint?.title]);
 const editorialMetadata=React.useMemo(()=>JSON.stringify(promptStoryMetadata(value)),[value.story,value.blueprint,value.style?.profile,value.brief]);
 const storyCount=value.story?.chapters.length||0;

 const storyCurrent=storyIsCurrent(value);
 const storyComplete=storyCount===value.brief.input.chapter_count&&storyCurrent;
 const saved=(where:string|null)=>{if(where)setMessage(`Сохранено в ${where}`);};
 const downloadStory=async()=>saved(await saveOrDownload({title:coverTitle,kind:'manuscripts',label:'книга',ext:'md',content:manuscript},'story.md','text/markdown;charset=utf-8'));
 const valid=value.prompts.filter(p=>p.sourceRevision===value.revision).length;
 const ready=value.phase==='ready'&&valid===value.brief.input.chapter_count;
 const update=(key:'title'|'overview'|'centralConflict'|'ending',text:string)=>setPlan(p=>p?{...p,[key]:text}:p);
 return <section aria-label="Book outline and prompts" className="space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-zinc-800/80">
   <div className="min-w-0 flex flex-col justify-center">
    <div className="flex items-center gap-2.5 flex-wrap">
     <h1 className="text-base md:text-lg font-bold text-zinc-100 truncate max-w-sm sm:max-w-md md:max-w-lg" title={value.story?.title||value.blueprint?.title||value.brief.input.title||'Book outline'}>
      {value.story?.title||value.blueprint?.title||value.brief.input.title||'Book outline'}
     </h1>
     <span className="hidden sm:inline text-zinc-700">|</span>
     <span className="text-xs text-zinc-400">
      {busy?writing?`Writing chapter ${writingChapter||storyCount+1}…`:fixing!==null?'Fixing issue and verifying…':label||'Preparing…':view==='editing'?'Editing the story':storyComplete?'Story draft ready':ready?'Outline and prompts ready':value.blueprint?'Outline saved':'Incomplete'}
     </span>
    </div>
    <p className="text-[11px] text-zinc-500 mt-0.5">
     Prompts: {valid}/{value.brief.input.chapter_count} · Chapters: {storyCount}/{value.brief.input.chapter_count} {saveStatus==='saved'?'· Project saved':saveStatus==='saving'?'· Saving…':saveStatus==='error'?'· Autosave failed':''}
    </p>
   </div>
   <div className="flex flex-wrap items-center gap-2.5">
    <nav aria-label="Book workflow stages" className="inline-flex p-0.5 bg-zinc-900 border border-zinc-800 rounded-lg">
     <button className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${view==='prompts'?'bg-zinc-800 text-zinc-100 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200'}`} disabled={unsaved} onClick={()=>changeView('prompts')}>1. Prompts</button>
     <button className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${view==='story'?'bg-zinc-800 text-zinc-100 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200'}`} disabled={unsaved} onClick={()=>changeView('story')}>2. Story</button>
     <button className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${view==='editing'?'bg-zinc-800 text-zinc-100 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200'}`} disabled={busy||unsaved||!editableStory} onClick={()=>changeView('editing')} title={!editableStory?'Editing unlocks after all chapters are written':undefined}>3. Editing</button>
     <button className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${view==='cover'?'bg-zinc-800 text-zinc-100 font-semibold shadow-sm':'text-zinc-400 hover:text-zinc-200'}`} disabled={busy||unsaved||!value.blueprint} onClick={()=>changeView('cover')} title={!value.blueprint?'The cover unlocks once the outline exists':undefined}>4. Cover</button>
    </nav>
    {busy&&onStop&&<button className={button} onClick={onStop}>Stop</button>}
    {view!=='editing'&&!storyComplete&&(
      <button className={`${button} bg-zinc-200 text-zinc-950 font-semibold`} disabled={busy||unsaved||!promptsReady(value)||styleNeedsGeneration(value)||!storyCurrent||!onGenerateStory} onClick={async()=>{changeView('story');setActive(storyCount+1);setWriting(true);try{await onGenerateStory?.();}finally{setWriting(false);}}}>{storyCount?'Resume story':'Generate story'}</button>
    )}
    {view==='prompts'&&<button className={button} disabled={!ready||busy||unsaved||styleNeedsGeneration(value)} onClick={async()=>saved(await saveOrDownload({title:coverTitle,kind:'blueprints',label:'промпты глав',ext:'json',content:JSON.stringify({brief:value.brief,blueprint:value.blueprint,style:value.style,prompts:value.prompts.map(p=>({...p,system:withWritingStyle(p.system,value.style?.profile)}))},null,2)},'chapter-prompts.json','application/json'))}>Download all prompts</button>}
    {storyCount>0&&<SaveBook draft={!storyComplete} content={manuscript} metadata={{...promptStoryMetadata(value),author:publication?.author,imprint:publication?.imprint,coverImage:publication?.coverImage}} onExportProject={onExport}/>}
    {view==='story'&&storyCount===0&&<button className={button} disabled={busy} onClick={onExport}>Download project</button>}
   </div>
  </div>
  {!editableStory&&view!=='editing'&&<p className="text-xs text-zinc-500">Editing unlocks after all chapters are written.</p>}
  {editorDirty&&<p className="text-xs text-amber-200 bg-amber-950/40 border border-amber-900/60 px-3 py-1.5 rounded">Save or cancel manuscript changes before switching stages.</p>}
  {!storyCurrent&&<p className="text-sm text-amber-200 bg-amber-950/40 border border-amber-900/60 px-3 py-1.5 rounded">Prompts or writing style used by the saved story have changed. Reset the project to generate a fresh story from the updated prompts, or continue editing the current draft.</p>}
  {error&&<p role="alert" className="rounded border border-red-900 p-2.5 text-xs text-red-300 whitespace-pre-wrap">{error}</p>}
  {!ready&&<div className="rounded border border-amber-900/50 p-3 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
   <span>{value.prompts.some(p=>p.sourceRevision!==value.revision)?'Outline changed. Existing prompts are outdated; regeneration will replace them, including manual edits.':'Completed steps will be preserved when you continue.'}</span>
   <button disabled={busy} className={`${button} shrink-0`} onClick={onContinue}>{busy?'Preparing…':'Continue preparing prompts'}</button>
  </div>}
  {/* Once opened, the editor stays mounted and is only hidden, so its chat and a running review survive switching stages. */}
  {editableStory&&(view==='editing'||editorOpened)&&<div hidden={view!=='editing'}><BookDisplay {...publication} bookContent={manuscript} metadataJson={editorialMetadata} onManualSave={onSaveStory?(content=>onSaveStory(content,manuscript)):undefined} onEditingStateChange={setEditorDirty} onReset={onReset||onSettings} onExportProject={onExport}/></div>}
  {/* Kept mounted once opened, like the editor, so a picture being drawn survives switching stages. */}
  {(view==='cover'||coverOpened)&&value.blueprint&&<div hidden={view!=='cover'}><CoverStudio bookKey={coverTitle||value.brief.input.premise.slice(0,80)} facts={coverFacts} author={publication?.author||''} onUseAsCover={publication?.onCoverChange?(url=>publication.onCoverChange!(url)):undefined}/></div>}
  {view==='cover'||(view==='editing'&&editableStory)?null:view==='story'?<PromptStoryStudio book={value} running={busy&&!!writingChapter} writingChapter={writingChapter} liveText={liveText} selectedChapter={active==='plan'?1:active} onChapterSelect={setActive} logs={agentLogs} tokens={tokenTotals} savedAt={lastSavedAt} saveStatus={autosaveStatus} error={error} onResume={!busy&&!unsaved&&storyCurrent&&!styleNeedsGeneration(value)?async()=>{setWriting(true);try{await onGenerateStory?.();}finally{setWriting(false);}}:undefined}/>:<>
  <WritingStylePanel book={value} busy={busy} onSave={onSaveStyle} onGenerate={onGenerateStyle} onDirty={setStyleDirty} blocked={editing||Object.values(dirty).some(Boolean)}/>
  {styleNeedsGeneration(value)&&<p className="text-sm text-amber-200">Generate or save a style profile before writing the story.</p>}
  <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)] items-start">
  <aside aria-label="Chapters and review" className="rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden text-left flex flex-col lg:sticky lg:top-4 max-h-[85vh]">
   <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80 shrink-0 flex items-center justify-between">
    <h2 className="text-sm font-medium text-zinc-200">Chapters & Consistency</h2>
   </div>
   <div className="p-3 space-y-4 overflow-y-auto flex-1">
    <button className={`${button} w-full text-left`} onClick={()=>setActive('plan')}>Outline and project settings</button>
    <div><h3 className="text-sm font-semibold mb-2 text-zinc-200">Chapter prompts</h3><p className="text-xs text-zinc-500 mb-3">Open a chapter to edit it. Use checkboxes to select chapters for review.</p>
    {ordered.map(p=><div key={p.chapter} className={`flex gap-2 items-start rounded p-2 ${active===p.chapter?'bg-zinc-800':'hover:bg-zinc-900'}`}>
     <input type="checkbox" className="mt-1" aria-label={`Review chapter ${p.chapter}`} disabled={busy||p.sourceRevision!==value.revision} checked={selected.includes(p.chapter)} onChange={e=>setSelected(old=>e.target.checked?[...old,p.chapter]:old.filter(n=>n!==p.chapter))}/>
     <button className="text-left text-sm flex-1" aria-current={active===p.chapter?'page':undefined} onClick={()=>setActive(p.chapter)}>{p.chapter}. {p.title}<span className="block text-xs text-zinc-500">{p.sourceRevision!==value.revision?'Outdated after outline change':dirty[p.chapter]?'Unsaved':p.edited?'Edited manually':'Ready'}{value.story?.chapters.some(c=>c.chapter===p.chapter)?' · Written':''}</span></button>
    </div>)}</div>
    <div className="border-t border-zinc-800 pt-4 space-y-3"><h2 className="text-sm font-semibold text-zinc-200">Consistency review</h2>
     <div className="flex gap-2"><button className={button} disabled={busy} onClick={()=>setSelected(ordered.filter(p=>p.sourceRevision===value.revision).map(p=>p.chapter))}>Select all</button><button className={button} disabled={busy} onClick={()=>setSelected([])}>Clear selection</button></div>
     <p className="text-xs text-zinc-400">Selected: {selected.length}. Other full prompts are excluded. The model receives the shared outline as context. Select at least two chapters to compare.</p>
     {unsaved&&<p className="text-xs text-amber-200">Save or discard your changes before starting a review.</p>}
     <button className={`${button} w-full`} disabled={busy||unsaved||selected.length<2||!onCheck} onClick={async()=>{setChecking(true);try{await onCheck?.(selected);}finally{setChecking(false);}}}>{checking?'Checking consistency…':busy?'Running…':'Review selected prompts'}</button>
     {review&&<div aria-label="Review result" className="space-y-3 text-xs"><p className={reviewIsCurrent(value,review)?'text-emerald-300':'text-amber-200'}>{reviewDraftChanged?'Unsaved changes — this review covers the saved version':reviewIsCurrent(value,review)?'Review is current':'Review is outdated — prompts or outline changed'}</p><p className="text-zinc-500">Chapters: {review.chapters.join(', ')} · {new Date(review.createdAt).toLocaleString('en')}</p><p className="whitespace-pre-wrap">{review.summary}</p>{review.findings.length===0&&<p>No supported contradictions were found in this selection.</p>}{review.findings.map((f,i)=><details key={i} className="border-t border-zinc-800 pt-2"><summary className="cursor-pointer">{f.severity==='major'?'Major issue':'Minor issue'}: {f.description}</summary><div className="space-y-2 mt-2">{f.evidence.map((e,j)=><button key={j} className="block text-left text-zinc-400" onClick={()=>setActive(e.chapter)}>Chapter {e.chapter}: «{e.quote}»</button>)}<p>{f.suggestion}</p><button className={button} disabled={busy||unsaved||!reviewIsCurrent(value,review)||!onFix} onClick={async()=>{setFixing(i);try{await onFix?.(review.createdAt,i);}finally{setFixing(null);}}}>{fixing===i?'Fixing and verifying…':'Fix issue'}</button></div></details>)}</div>}
    </div>
   </div>
  </aside>
  <div className="min-w-0">
  <div hidden={view!=='prompts'}>
  <div hidden={active!=='plan'} className="space-y-4">
  <details className="rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden text-left"><summary className="cursor-pointer text-sm font-medium px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800 text-zinc-200">Original author requirements</summary><div className="p-4 text-sm whitespace-pre-wrap text-zinc-300">{value.brief.input.premise}<p className="mt-3 text-zinc-400">{value.brief.input.author_requirements}</p><p className="mt-2 text-zinc-400">{value.brief.input.chapter_count} chapters · about {Math.round(value.brief.input.target_total_words/value.brief.input.chapter_count)} words per chapter · {value.brief.input.genre}</p>{value.brief.input.series_context&&<p className="mt-2">Series context: {value.brief.input.series_context}</p>}{value.brief.input.comparable_books&&<p className="mt-2">References: {value.brief.input.comparable_books}</p>}{value.brief.input.story_structure&&<p className="mt-2">Structure: {value.brief.input.story_structure}</p>}</div></details>
  {plan&&<div className="rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden text-left flex flex-col space-y-0">
   <div className="flex justify-between items-center px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80 shrink-0"><h2 className="text-sm font-medium text-zinc-200">Shared book outline</h2><button className={button} disabled={busy} onClick={()=>{setEditing(!editing);setPlan(value.blueprint);setMessage('');}}>{editing?'Discard changes':'Edit outline'}</button></div>
   <div className="p-4 space-y-4">
   {(['title','overview','centralConflict','ending'] as const).map((key,i)=><div key={key}><label className="text-xs text-zinc-400">{['Title','Premise','Central conflict','Resolution'][i]}</label>{editing?<textarea aria-label={['Outline title','Outline premise','Outline conflict','Outline ending'][i]} disabled={key==='title' && !!value.brief.input.title} rows={key==='title'?1:3} value={plan[key]} onChange={e=>update(key,e.target.value)} className={`${field} mt-1`}/>:<p className="mt-1 text-sm whitespace-pre-wrap">{plan[key]}</p>}</div>)}
   <details><summary className="text-sm cursor-pointer">Characters and planned revelations</summary><div className="mt-3 space-y-3 text-sm">{plan.characters.map((c,index)=><div key={c.id}>{editing?<div className="space-y-2">{(['name','motivation','voice'] as const).map(key=><label key={key} className="block text-xs">{key==='name'?'Name':key==='motivation'?'Motivation':'Voice'}<textarea className={field} value={c[key]} onChange={e=>setPlan(p=>p?{...p,characters:p.characters.map((v,j)=>j===index?{...v,[key]:e.target.value}:v)}:p)}/></label>)}<label className="block text-xs">Initial knowledge before the book begins (one item per line)<textarea className={field} value={(c.initialKnowledge||[]).join('\n')} onChange={e=>setPlan(p=>p?{...p,characters:p.characters.map((v,j)=>j===index?{...v,initialKnowledge:e.target.value.split('\n').filter(s=>s.trim())}:v)}:p)}/></label></div>:<p><strong>{c.name}</strong>: {c.motivation}<br/><span className="text-zinc-400">Voice: {c.voice}<br/>Already knows: {(c.initialKnowledge||[]).join('; ')||'not specified'}</span></p>}</div>)}{plan.facts.map((f,index)=><div key={f.id}>{editing?<label className="block text-xs">Revelation in chapter {f.introducedIn}<textarea className={field} value={f.description} onChange={e=>setPlan(p=>p?{...p,facts:p.facts.map((v,j)=>j===index?{...v,description:e.target.value}:v)}:p)}/></label>:<p>Chapter {f.introducedIn}: {f.description}</p>}</div>)}</div></details>
   {plan.additions.length>0&&<details><summary className="text-sm cursor-pointer">Model additions to your premise</summary><ul className="list-disc pl-5 mt-2 text-sm space-y-1">{plan.additions.map((s,i)=><li key={i}>{s}</li>)}</ul></details>}
   <div className="space-y-3">{plan.chapters.map((c,index)=><details key={c.chapter} className="border-t border-zinc-800 pt-3"><summary className="cursor-pointer text-sm">Chapter {c.chapter}. {c.title}</summary><div className="mt-3 space-y-2">{(['title','goal','conflict','startingSituation','outcome','handoff'] as const).map((key,i)=><div key={key}><label className="text-xs text-zinc-500">{['Title','Character goal','Resistance','Starting situation','Outcome','Handoff to next chapter'][i]}</label>{editing?<textarea aria-label={`Chapter ${c.chapter}: ${key}`} rows={2} value={c[key]} onChange={e=>setPlan(p=>p?{...p,chapters:p.chapters.map((v,j)=>j===index?{...v,[key]:e.target.value}:v)}:p)} className={field}/>:<p className="text-sm whitespace-pre-wrap">{c[key]}</p>}</div>)}<p className="text-xs text-zinc-500">Depends on chapters: {c.dependsOn.join(', ')||'start of the book'}</p></div></details>)}</div>
   {editing&&<div><p className="text-xs text-amber-200 mb-2">Changing the shared outline requires regenerating all prompts. Manual edits remain visible as outdated until regeneration.</p><button className={button} disabled={busy} onClick={async()=>{try{await onSaveBlueprint(plan);setEditing(false);setMessage('Outline saved. Regenerate prompts from the updated outline.');}catch(e){setMessage(String(e));}}}>Save outline and mark prompts as outdated</button></div>}
   {message&&<p role="status" className="text-sm">{message}</p>}
  </div></div>}
  </div>
  {ordered.map(p=><div key={`${p.chapter}-${p.sourceRevision}`} hidden={active!==p.chapter}><PromptEditor value={p} stale={p.sourceRevision!==value.revision} busy={busy||editing} onSave={onSavePrompt} onDirty={trackDirty} styleProfile={value.style?.profile} disableCopy={styleDirty||styleNeedsGeneration(value)}/></div>)}
  </div></div></div>
  </>}
 </section>;
}
