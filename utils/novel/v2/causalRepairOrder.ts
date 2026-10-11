import type {ThesisPlan, ThesisDraft, ThesisReview} from './theses';

/** Derive repair scope from this book's contracts, never from genre or names.
 * The outline already orders prerequisites before their consequences. */
export function causalRepairOrder(before:ThesisPlan, after:ThesisPlan, issues:ThesisReview['issues'], blocks:ThesisDraft['blocks']):string[] {
  const ids=new Set(issues.flatMap(issue=>issue.thesis_ids));
  for(const thesis of after.theses) {
    const previous=before.theses.find(item=>item.id===thesis.id);
    if(JSON.stringify(previous)!==JSON.stringify(thesis)) ids.add(thesis.id);
  }
  if(JSON.stringify(before.canon)!==JSON.stringify(after.canon)) {
    const facts=[...(before.canon?.facts||[]),...(after.canon?.facts||[])].filter(fact=>
      JSON.stringify(before.canon?.facts.find(f=>f.id===fact.id))!==JSON.stringify(after.canon?.facts.find(f=>f.id===fact.id)));
    for(const fact of facts) {
      ids.add(fact.established_in);
      for(const knowledge of fact.knowledge) ids.add(knowledge.learned_in);
      for(const thesis of after.theses) if(thesis.fact_ids?.includes(fact.id)) ids.add(thesis.id);
    }
  }
  // A visit costs a model call, and the closure of everything that depends on a cited scene
  // is, in a connected book, the book: a run visited all twelve scenes for one defect, three
  // rounds running. Visit the scenes the defects cite, the scenes whose contract changed, and
  // what those directly require. The whole package is reviewed afterwards against the whole
  // manuscript, and anything it finds elsewhere is cited then and visited then.
  for(const thesis of after.theses) if(ids.has(thesis.id)) for(const dependency of thesis.requires) ids.add(dependency);
  const affected=ids;
  return after.theses.filter(thesis=>affected.has(thesis.id)&&blocks.some(block=>block.thesis_id===thesis.id)).map(thesis=>thesis.id);
}
