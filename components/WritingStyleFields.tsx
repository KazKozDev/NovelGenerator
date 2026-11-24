import React from 'react';
import {TextArea} from './common/TextArea';
import type {StyleInputs} from '../utils/novel/promptBook/style';
import {STYLE_LIMITS} from '../utils/novel/promptBook/style';
export function WritingStyleFields({id,inputs,onChange,disabled=false}:{id:string;inputs:StyleInputs;onChange:(inputs:StyleInputs)=>void;disabled?:boolean}) {
 return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div><label htmlFor={`${id}-instructions`} className="block text-xs font-medium text-zinc-300 mb-1.5">Style instructions</label><TextArea id={`${id}-instructions`} value={inputs.instructions} onChange={e=>onChange({...inputs,instructions:e.target.value})} disabled={disabled} maxLength={STYLE_LIMITS.instructions} rows={7} placeholder="Short, varied sentences. Tense dialogue with subtext. Concrete details through the viewpoint character. Avoid explaining emotions twice."/><p className="mt-1 text-xs text-zinc-500">Describe the traits you want. Your chosen POV, tense and story language stay in control.</p></div>
  <div><label htmlFor={`${id}-samples`} className="block text-xs font-medium text-zinc-300 mb-1.5">Prose samples</label><TextArea id={`${id}-samples`} value={inputs.samples} onChange={e=>onChange({...inputs,samples:e.target.value})} disabled={disabled} maxLength={STYLE_LIMITS.samples} rows={7} placeholder="Paste excerpts you like. Separate them with blank lines, and optionally say which traits you like in each."/><p className="mt-1 text-xs text-zinc-500">Try 2–3 excerpts of 300–600 words: dialogue, action and description. Craft traits are extracted; characters, events and phrases are not reused. {inputs.samples.trim()?`${inputs.samples.trim().split(/\s+/).length.toLocaleString('en')} words · `:''}{inputs.samples.length.toLocaleString('en')}/{STYLE_LIMITS.samples.toLocaleString('en')} characters.</p></div>
 </div>;
}
