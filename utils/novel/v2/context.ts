import type { ThesisPlan, ThesisDraft } from './theses';
import { blockContract } from './blockContract';

/** Address a plan field, never the entire serialized book as one evidence paragraph. */
export function planEvidenceSource(plan: ThesisPlan): string {
  const paragraphs: string[] = [];
  const add = (prefix: string, row: object) => {
    for (const [field, value] of Object.entries(row)) paragraphs.push(`${prefix}.${field}: ${JSON.stringify(value)}`);
  };
  add('book', { title: plan.title, premise_givens: plan.premise_givens, ending: plan.ending });
  for (const character of plan.characters) add(`character:${character.id}`, character);
  for (const fact of plan.canon?.facts || []) add(`fact:${fact.id}`, fact);
  for (const thesis of plan.theses) add(`thesis:${thesis.id}`, thesis);
  return paragraphs.join('\n\n');
}

/** Prompt scope only. The full canonical plan remains in storage and global reviews. */
export function scenePlanContext(plan: ThesisPlan, id: string) {
  const index = plan.theses.findIndex(t => t.id === id);
  if (index < 0) throw new Error(`Unknown scene ${id}`);
  const current = plan.theses[index];
  const ids = new Set([id, ...current.requires, ...plan.theses.slice(Math.max(0,index-1),index+2).map(t=>t.id)]);
  const facts = (plan.canon?.facts || []).filter(f => (current.fact_ids || []).includes(f.id) || f.established_in === id || f.knowledge.some(k=>k.learned_in===id));
  for (const fact of facts) if (fact.established_in !== 'INITIAL') ids.add(fact.established_in);
  // The scene being worked on travels whole. Of its sources and neighbours a call needs
  // what happened and what it left, not who wanted what or how it was to be written.
  const brief = ({participants,why,resistance,writer_task,target_words,...rest}:ThesisPlan['theses'][number]) => ({...rest,participant_ids:participants.map(p=>p.character_id)});
  const selected = plan.theses.filter(t=>ids.has(t.id));
  const theses = selected.map(t=>t.id===id?t:brief(t)) as unknown as ThesisPlan['theses'];
  const characters = new Set(selected.flatMap(t=>t.participants.map(p=>p.character_id)));
  for (const fact of facts) for (const k of fact.knowledge) characters.add(k.character_id);
  return { title:plan.title, premise_givens:plan.premise_givens, ending:plan.ending,
    characters:plan.characters.filter(c=>characters.has(c.id)), theses,
    canon:plan.canon ? {resolution:plan.ending,facts} : undefined,
    scope:'Local scene, neighbors and explicit sources only. Other scenes are not supplied or re-reviewed here; search/read manuscript sources when needed. The independent package review receives the complete book.' };
}

/** beside_outline: the call also carries scenePlanContext, so what that already holds
 * (canon facts, the ending) is not sent a second time inside the contract. */
export function sceneContractContext(plan:ThesisPlan,id:string,blocks:ThesisDraft['blocks'],beside_outline=false) {
  const contract=blockContract(plan,id,blocks);
  const local=scenePlanContext(plan,id);
  const ids=new Set(local.theses.map(t=>t.id)), facts=new Set(local.canon?.facts.map(f=>f.id));
  return {...contract,
    canonical_story:contract.canonical_story ? {...contract.canonical_story,...(beside_outline?{resolution:undefined,facts:undefined,learned_here:contract.canonical_story.learned_here.map(f=>f.id)}:{facts:local.canon!.facts}),
      available_knowledge:contract.canonical_story.available_knowledge.filter(c=>local.characters.some(p=>p.id===c.character_id)).map(c=>({...c,facts:c.facts.filter(f=>facts.has(f))}))} : undefined,
    resolution_contract:{...contract.resolution_contract,...(beside_outline?{intended_answer:undefined}:{}),evidence_chain:contract.resolution_contract.evidence_chain.filter(t=>ids.has(t.owner))},
    already_written:contract.already_written.filter(t=>ids.has(t.owner)),
    // The previous scene's trace is already under already_written; it is not sent twice.
    continue_from:contract.continue_from.source&&ids.has(contract.continue_from.source)&&contract.already_written.some(t=>t.owner===contract.continue_from.source)
      ? {...contract.continue_from,actual_previous_changes:`already_written[${contract.continue_from.source}].actual_state_changes`} : contract.continue_from,
    earlier_block_ids:contract.already_written.map(t=>t.owner)};
}

/** Checkpoints keep full history. Prompts retain exact recent reads, not old replaced prose. */
export function toolHistoryContext(history:{command:unknown;result:unknown}[]) {
  const summarize=(entry:{command:any;result:any})=>{
    const c=entry.command;
    if (Array.isArray(c?.edits) && (entry.result?.applied || entry.result?.applied === true)) return {
      command:{tool:c.tool,edited:c.edits.map((e:any)=>({block_id:e.block_id,section:e.section,id:e.id,field:e.field,
        after:JSON.stringify(e.after)?.length<=512?e.after:undefined}))},result:entry.result,
      note:'Applied edits; old anchors omitted. Read the current value before another replacement.'};
    return entry;
  };
  const recent=history.slice(-8).map(summarize);
  let size=0;
  const kept:unknown[]=[];
  for(let i=recent.length-1;i>=0;i--){
    const entry=recent[i], length=JSON.stringify(entry).length;
    if(i===recent.length-1 || size+length<=18000){kept.unshift(entry);size+=length;}
    else kept.unshift({command:{tool:(entry.command as any)?.tool},note:'Older result omitted from prompt. Read/search again for exact current source.'});
  }
  return kept;
}

/** Legacy reviews can contain the complete plan as their quote. Preserve claims,
 * but require source lookup rather than forwarding that quote on every tool turn. */
export function findingsContext(value:unknown):string {
  return JSON.stringify(value,(key,item)=>key==='evidence' && typeof item==='string' && item.length>1600
    ? item.slice(0,1600)+'\n[Evidence excerpt only; use search/read for the complete current source. This excerpt is not a verification citation.]' : item);
}

/**
 * The plan as a whole-book call needs it: what each scene is and leaves, the canon, the
 * people. A reviewer of the finished text compares it with events and facts, not with who
 * was to want what or how each scene was to be staged; those fields are two thirds of a
 * plan, and a whole-book call was sending all of it beside the whole manuscript.
 */
export function wholeBookPlan(plan: ThesisPlan) {
  return { title: plan.title, premise_givens: plan.premise_givens, ending: plan.ending,
    characters: plan.characters.map(c => ({ id: c.id, name: c.name, goal: c.goal })), canon: plan.canon ? { facts: plan.canon.facts } : undefined,
    theses: plan.theses.map(t => ({ id: t.id, chapter: t.chapter, pov_id: t.pov_id, present: t.participants.map(p => p.character_id), when: t.when, where: t.where,
      state_before: t.state_before, action: t.action, outcome: t.outcome, requires: t.requires, fact_ids: t.fact_ids, ...(t.beneath ? { beneath: t.beneath } : {}), target_words: t.target_words })),
    scope: 'Events, facts and people. Intentions, staging notes and disclosure lists are in the full plan and are not needed to judge the written book.' };
}
