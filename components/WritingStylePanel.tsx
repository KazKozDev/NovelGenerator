import React,{useEffect,useState} from 'react';
import {WritingStyleFields} from './WritingStyleFields';
import {STYLE_LIMITS,styleInputs,styleNeedsGeneration,type StyleInputs} from '../utils/novel/promptBook/style';
import type {PromptBook} from '../utils/novel/promptBook';
import {useWorkspaceEntry} from '../utils/workspaceState';
const button='rounded border border-zinc-700 px-3 py-2 text-xs hover:bg-zinc-800 disabled:opacity-40';
export function WritingStylePanel({bookTitle,book,busy,onSave,onGenerate,onDirty,blocked=false}:{bookTitle:string;book:PromptBook;busy:boolean;onSave?:(profile:string,inputs:StyleInputs)=>Promise<void>;onGenerate?:(inputs:StyleInputs)=>Promise<void>;onDirty:(dirty:boolean)=>void;blocked?:boolean}) {
 const saved=styleInputs(book.brief.settings),savedProfile=book.style?.profile||'';
 // An unsaved style edit is kept in the book's workspace state, so a reload brings it back still unsaved.
 const [draft,setDraft]=useWorkspaceEntry<{inputs:StyleInputs;profile:string}>(bookTitle,'style',JSON.stringify([saved.instructions,saved.samples,savedProfile]));
 const inputs=draft?.inputs??saved,profile=draft?.profile??savedProfile,[generating,setGenerating]=useState(false),[message,setMessage]=useState('');
 const edit=(next:{inputs:StyleInputs;profile:string})=>setDraft(next.inputs.instructions===saved.instructions&&next.inputs.samples===saved.samples&&next.profile===savedProfile?undefined:next);
 const setInputs=(next:StyleInputs)=>edit({inputs:next,profile}),setProfile=(text:string)=>edit({inputs,profile:text});
 const dirty=inputs.instructions!==saved.instructions||inputs.samples!==saved.samples||profile!==savedProfile;
 useEffect(()=>onDirty(dirty),[dirty,onDirty]);
 const discard=()=>{setDraft(undefined);setMessage('Changes discarded');};
 return <details className="rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden text-left" aria-label="Writing style settings">
  <summary className="cursor-pointer text-sm font-medium px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between text-zinc-200"><span>Writing style</span><span className="text-xs text-zinc-400 font-normal">{dirty?'Unsaved changes':styleNeedsGeneration(book)?'Profile needs updating':book.style?'Shared profile saved':'Optional · no profile'}</span></summary>
  <div className="p-4 space-y-4"><p className="text-xs text-zinc-400">Use a different set of references for each book. Generate a profile, review it, then edit and save it. The same saved profile is added to every chapter writer request and copied prompt.</p>
   {blocked&&<p className="text-xs text-amber-200">Save or discard chapter and outline edits before changing writing style.</p>}
   <WritingStyleFields id="project-style" inputs={inputs} onChange={setInputs} disabled={busy||blocked}/>
   <button className={button} disabled={busy||blocked||(!inputs.instructions.trim()&&!inputs.samples.trim())||!onGenerate} onClick={async()=>{setGenerating(true);setMessage('');try{await onGenerate?.(inputs);}catch(e){setMessage(String(e));}finally{setGenerating(false);}}}>{generating?'Creating style profile…':book.style?'Regenerate style profile':'Generate style profile'}</button>
   <label htmlFor="project-style-profile" className="block text-xs font-medium text-zinc-300">Shared style profile<textarea id="project-style-profile" value={profile} onChange={e=>setProfile(e.target.value)} disabled={busy||blocked} maxLength={STYLE_LIMITS.profile} rows={10} placeholder="Generate a profile from your references, or write your own reusable style instructions here." className="mt-2 block w-full rounded border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400 disabled:opacity-60"/></label>
   <div className="flex flex-wrap gap-2"><button className={button} disabled={busy||blocked||!dirty||!onSave||(!profile.trim()&&!!(inputs.instructions.trim()||inputs.samples.trim()))} onClick={async()=>{try{await onSave?.(profile,inputs);setMessage('Style profile saved for all chapters');}catch(e){setMessage(String(e));}}}>Save style profile</button><button className={button} disabled={busy||blocked||!dirty} onClick={discard}>Discard style changes</button><button className={button} disabled={busy||blocked||(!savedProfile&&!saved.instructions&&!saved.samples)||!onSave} onClick={async()=>{try{await onSave?.('',{instructions:'',samples:''});setInputs({instructions:'',samples:''});setProfile('');setMessage('Writing style cleared');}catch(e){setMessage(String(e));}}}>Clear writing style</button></div>
   {message&&<p role="status" className="text-xs text-zinc-400">{message}</p>}
  </div>
 </details>;
}
