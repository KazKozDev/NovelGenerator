import type {ThesisPlan} from './theses';
export interface StoryCanon {
  resolution:string;
  facts:{id:string;truth:string;established_in:string;reader_learns_in?:string;knowledge:{character_id:string;learned_in:string}[]}[];
}
export function validateCanon(plan:ThesisPlan):void {
  const canon=plan.canon;
  if(!canon) return; // Existing exported projects remain readable.
  if(!Array.isArray(canon.facts)||!canon.facts.length) throw new Error('Story canon requires a nonempty facts array. Return concrete facts with id, truth, established_in and knowledge, and reference them in scene fact_ids.');
  if(typeof canon.resolution!=='string'||!canon.resolution.trim()||canon.resolution!==plan.ending) throw new Error('Saved canonical resolution must match the plan ending.');
  // Every defect is reported in one pass: a planner told of one conflict at a time spends a
  // whole repair call on each and runs out of calls with the rest still unseen.
  const defects:string[]=[];
  const ids=new Set<string>();
  const nonempty=(value:unknown):value is string=>typeof value==='string'&&!!value.trim();
  for(const [factIndex,fact] of canon.facts.entries()) {
    if(!fact||!nonempty(fact.id)||ids.has(fact.id)||!nonempty(fact.truth)||!Array.isArray(fact.knowledge)) throw new Error(`Invalid canonical fact ${fact?.id||'(missing id)'}: require unique string id, nonempty truth and a knowledge array.`);
    const scene=plan.theses.findIndex(t=>t.id===fact.established_in);
    if(scene<0&&fact.established_in!=='INITIAL') defects.push(`Canonical fact ${fact.id} has unknown source ${fact.established_in}. Use INITIAL or an existing scene ID: ${plan.theses.map(t=>t.id).join(', ')}.`);
    if(fact.reader_learns_in!==undefined&&!['INITIAL','NEVER'].includes(fact.reader_learns_in)&&!plan.theses.some(t=>t.id===fact.reader_learns_in)) defects.push(`Canonical fact ${fact.id}: reader_learns_in ${JSON.stringify(fact.reader_learns_in)} is not INITIAL, NEVER or an existing scene ID.`);
    ids.add(fact.id);
    const unplaced=scene<0&&fact.established_in!=='INITIAL';
    for(const [knowledgeIndex,knowledge] of fact.knowledge.entries()) {
      if(!knowledge||!plan.characters.some(c=>c.id===knowledge.character_id)) throw new Error(`Canonical fact ${fact.id} names unknown character ${knowledge?.character_id}. Use an existing character ID: ${plan.characters.map(c=>c.id).join(', ')}.`);
      const learned=plan.theses.findIndex(t=>t.id===knowledge.learned_in);
      if(learned<0&&knowledge.learned_in!=='INITIAL') {defects.push(`Canonical knowledge ${fact.id} has unknown learning scene ${knowledge.learned_in}. Use INITIAL or an existing scene ID.`);continue;}
      if(!unplaced&&learned<scene) defects.push(`Canonical knowledge ${fact.id} for ${knowledge.character_id} in ${knowledge.learned_in} precedes its established source ${fact.established_in}. Conflicting fields: /canon/facts/${factIndex}/established_in = ${JSON.stringify(fact.established_in)}; /canon/facts/${factIndex}/knowledge/${knowledgeIndex}/learned_in = ${JSON.stringify(knowledge.learned_in)}. Read truth and the source scene before choosing a repair: if the fact already exists before the opening, correct established_in to INITIAL (reader discovery is not fact creation); if the event actually occurs later, correct learned_in to that scene or a later supported learning scene. Do not grant future knowledge or delete the fact to pass validation. Establish the fact before using it, or use INITIAL for a fact already true before the opening.`);
    }
  }
  for(const thesis of plan.theses) {
    if(!Array.isArray(thesis.fact_ids)||thesis.fact_ids.some(id=>!ids.has(id))) defects.push(`Scene ${thesis.id} needs valid canonical fact references.`);
  }
  for(const fact of canon.facts) if(fact.established_in!=='INITIAL' && !plan.theses.find(t=>t.id===fact.established_in)?.fact_ids?.includes(fact.id)) defects.push(`Canonical fact ${fact.id} must be implemented in its source scene.`);
  if(defects.length) throw new Error(defects.length>1?`${defects.length} canon defects; repair all of them in one answer.\n`+defects.map((defect,index)=>`${index+1}. ${defect}`).join('\n'):defects[0]);
}
export function canonContext(plan:ThesisPlan,id:string) {
  if(!plan.canon) return undefined;
  const index=plan.theses.findIndex(t=>t.id===id);
  return {resolution:plan.canon.resolution,facts:plan.canon.facts,
    available_knowledge:plan.characters.map(character=>({character_id:character.id,facts:plan.canon!.facts.filter(fact=>fact.knowledge.some(k=>k.character_id===character.id&&plan.theses.findIndex(t=>t.id===k.learned_in)<index)).map(f=>f.id)})),
    learned_here:plan.canon.facts.filter(f=>f.knowledge.some(k=>k.learned_in===id)),
    rule:'Canonical truth is author knowledge, not automatically character knowledge. Implement source events before using acquired knowledge. Revise the canonical plan transactionally before changing a fact.'};
}
