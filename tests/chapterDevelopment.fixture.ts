export function developmentFixture(chapter:number) {
  return {chapter,start:'The letter is hidden',goal:'Protect the sibling',steps:[{id:`D${chapter}`,action:'Read the letter and choose to reveal it',resistance:'Disclosure endangers the sibling',consequence:'The letter exposes the risk and earns a new choice',necessity:'The choice would otherwise lack evidence'}],result:'A costly decision is made',handoff:'The next event follows the decision',budget_rationale:'Reading, opposition and the consequential choice carry the action and dialogue'};
}
export function developmentResponse(prompt:string) {
  const budgets=JSON.parse(prompt.split('User chapter budgets: ')[1].split('\n')[0]);
  return JSON.stringify({chapters:budgets.map((b:{chapter:number})=>developmentFixture(b.chapter))});
}
