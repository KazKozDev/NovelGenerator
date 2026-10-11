import {stableJson} from './contracts';
import {sceneRevision} from './stateTransitions';
import type {ThesisPlan,ThesisDraft,ThesisReview,RepairVerification} from './theses';
import type {TextBlock,TextEdit} from './manuscriptTools';

export interface RepairReport {
  at:string;package_id:string;revision:string;status:'rejected'|'verified'|'committed';
  resolved:{issue:number;problem:string;status:string;explanation:string}[];
  remaining:{issue:number;problem:string;explanation:string}[];
  introduced:ThesisReview['issues'];
}
export const repairRevision=(plan:ThesisPlan,blocks:TextBlock[])=>sceneRevision(stableJson({plan,blocks}));
export const issueIdentity=(issue:ThesisReview['issues'][number])=>stableJson({ids:[...issue.thesis_ids].sort(),kind:issue.kind||'',problem:issue.problem.trim().toLocaleLowerCase().replace(/\s+/g,' ')});
export function repairReport(id:string,plan:ThesisPlan,blocks:TextBlock[],originals:ThesisReview['issues'],verification:RepairVerification,known:ThesisReview['issues']=originals):RepairReport {
  const seen=new Set(known.map(issueIdentity));
  const findings=[...new Map(verification.issues.filter(i=>i.severity==='major').map(i=>[issueIdentity(i),i])).values()];
  const introduced=findings.filter(i=>!seen.has(issueIdentity(i)));
  const remaining=verification.checks.filter(c=>c.status==='unresolved').map(c=>({issue:c.issue,problem:originals[c.issue].problem,explanation:c.explanation}));
  for(const issue of findings.filter(i=>seen.has(issueIdentity(i))))if(!remaining.some(r=>r.problem===issue.problem))remaining.push({issue:originals.findIndex(i=>issueIdentity(i)===issueIdentity(issue)),problem:issue.problem,explanation:issue.required_change});
  return {at:new Date().toISOString(),package_id:id,revision:repairRevision(plan,blocks),status:verification.accepted?'verified':'rejected',
    resolved:verification.checks.filter(c=>c.status!=='unresolved'&&!remaining.some(r=>r.issue===c.issue)).map(c=>({issue:c.issue,problem:originals[c.issue].problem,status:c.status,explanation:c.explanation})),
    remaining,introduced};
}

/** Accepted state is untouched until the complete package has a fresh verdict.
 * All guards run before returning the replacement snapshot. Rejection needs no
 * undo: the saved staged candidate remains separate from accepted prose. */
export function commitRepairPackage(draft:ThesisDraft,plan:ThesisPlan,blocks:TextBlock[],edits:TextEdit[],verification:RepairVerification,baseRevision:string,verifiedRevision:string,validate:(raw:unknown)=>ThesisPlan):ThesisDraft {
  if(!draft.plan || repairRevision(draft.plan,draft.blocks.map(b=>({id:b.thesis_id,text:b.text})))!==baseRevision)throw new Error('Repair package base is stale; rebase and verify against the current accepted manuscript.');
  if(!verification.accepted || verification.checks.some(c=>c.status==='unresolved') || verification.issues.some(i=>i.severity==='major'))throw new Error('Repair package has unresolved defects; accepted plan and prose remain unchanged.');
  if(repairRevision(plan,blocks)!==verifiedRevision)throw new Error('Repair package changed after verification; review the current candidate before commit.');
  if(stableJson(blocks.map(b=>b.id))!==stableJson(draft.blocks.map(b=>b.thesis_id)) || blocks.some(b=>!b.text.trim()))throw new Error('Repair package must retain all existing blocks in order with nonempty prose.');
  const accepted=validate(plan);
  if(stableJson(accepted)!==stableJson(plan))throw new Error('Repair package normalization changed the verified plan; recheck the normalized candidate.');
  const next=structuredClone(draft);
  next.plan=accepted;
  next.blocks=next.blocks.map((block,index)=>({...block,text:blocks[index].text,
    review:block.text===blocks[index].text?block.review:{ready:false,issues:[]}}));
  if(edits.length)next.edits=[...(next.edits||[]),{at:new Date().toISOString(),phase:'rough-repair',edits:structuredClone(edits)}];
  return next;
}

export function packageDiff(before:ThesisPlan,after:ThesisPlan,blocks:ThesisDraft['blocks'],candidate:TextBlock[]) {
  return {plan_changed:stableJson(before)!==stableJson(after),changed_scenes:after.theses.filter(t=>stableJson(before.theses.find(b=>b.id===t.id))!==stableJson(t)).map(t=>t.id),
    changed_facts:(after.canon?.facts||[]).filter(f=>stableJson(before.canon?.facts.find(b=>b.id===f.id))!==stableJson(f)).map(f=>f.id),
    text_changes:candidate.filter(b=>blocks.find(p=>p.thesis_id===b.id)?.text!==b.text).map(b=>({id:b.id,before_characters:blocks.find(p=>p.thesis_id===b.id)?.text.length||0,after_characters:b.text.length})),
    rule:'Staged changes only. Whole-package verification must pass before accepted plan and prose change.'};
}
