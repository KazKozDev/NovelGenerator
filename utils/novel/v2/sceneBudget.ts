import type {ProjectInput} from './types';
import type {ThesisPlan,ThesisDraft} from './theses';

// A planning granularity, not a user's chapter target. Each scene owns a new event.
export const SCENE_WORD_CAP = 1100;
export function chapterBudget(input:Pick<ProjectInput,'target_total_words'|'chapter_count'>, chapter:number):number {
  const base=Math.floor(input.target_total_words/input.chapter_count);
  return base+(chapter<=input.target_total_words%input.chapter_count?1:0);
}
export function sceneRequirements(input:ProjectInput) {
  return Array.from({length:input.chapter_count},(_,index)=>{
    const target=chapterBudget(input,index+1);
    return {chapter:index+1,target_words:target,minimum_scenes:Math.max(1,Math.ceil(target/SCENE_WORD_CAP))};
  });
}
export function sceneCoverage(plan:ThesisPlan,input:ProjectInput) {
  return sceneRequirements(input).filter(requirement=>{
    const scenes=plan.theses.filter(thesis=>thesis.chapter===requirement.chapter);
    return scenes.length<requirement.minimum_scenes || scenes.some(scene=>scene.target_words>SCENE_WORD_CAP);
  });
}
/** Preserve all supplied prose; division does not claim that new contracts are fulfilled. */
export function repartitionProse(before:ThesisPlan,after:ThesisPlan,blocks:ThesisDraft['blocks']):ThesisDraft['blocks'] {
  const result:ThesisDraft['blocks']=[];
  for(const chapter of [...new Set(before.theses.filter(t=>blocks.some(b=>b.thesis_id===t.id)).map(t=>t.chapter))]) {
    const source=before.theses.filter(t=>t.chapter===chapter).flatMap(t=>blocks.filter(b=>b.thesis_id===t.id).map(b=>b.text)).join('\n\n');
    const scenes=after.theses.filter(t=>t.chapter===chapter);
    const boundaries=[...source.matchAll(/\n\s*\n/g)].map(match=>match.index!+match[0].length);
    const cuts:number[]=[0];
    const total=scenes.reduce((sum,t)=>sum+t.target_words,0);
    let weight=0;
    for(let i=0;i<scenes.length-1;i++) {
      weight+=scenes[i].target_words;
      const desired=Math.round(source.length*weight/total);
      const remaining=scenes.length-i-2;
      const available=boundaries.filter(cut=>cut>cuts.at(-1)!&&cut<source.length);
      const options=available.slice(0,Math.max(0,available.length-remaining));
      const cut=options.sort((a,b)=>Math.abs(a-desired)-Math.abs(b-desired))[0];
      if(cut===undefined) throw new Error(`Cannot safely divide chapter ${chapter}: not enough paragraph boundaries. Original text is retained.`);
      cuts.push(cut);
    }
    cuts.push(source.length);
    for(let i=0;i<scenes.length;i++) result.push({thesis_id:scenes[i].id,text:source.slice(cuts[i],cuts[i+1]),review:{ready:false,issues:[{severity:'major',thesis_ids:[scenes[i].id],problem:'Preserved prose needs alignment with the new scene contract.',required_change:'Check and repair this scene against the approved plan before expansion.'}]}});
  }
  return result;
}
