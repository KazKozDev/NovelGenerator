import { QUALITY_KEYS } from '../utils/novel/v2/storyQuality';
import { describe, expect, it } from 'vitest';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { restoreSnapshot, snapshotProject } from '../utils/novel/v2/export';
import { readThesisPlan, readThesisReview, renderThesisBook, type ThesisPlan } from '../utils/novel/v2/theses';
import type { ProjectInput } from '../utils/novel/v2/types';
import type { NovelLLM } from '../utils/novel/v2/llm';
const input: ProjectInput = { generation_mode: 'theses', premise: 'A witness hides a letter to protect a sibling.', chapter_count: 2, genre: 'mystery', target_total_words: 1000, author_requirements: 'The witness has a reason to conceal evidence.' };
function outline(): ThesisPlan {
  return { title: 'The Concealed Letter', premise_givens: [input.premise], characters: [{ id: 'C01', name: 'Witness', goal: 'Protect sibling', initial_knowledge: ['Letter implicates sibling'], capabilities: ['Has letter'], limitations: ['Cannot control investigator'] }],
    theses: [1, 2, 3, 4].map((n, i) => ({ id: `T0${n}`, chapter: n <= 2 ? 1 : 2, pov_id: 'C01', participants: [{ character_id: 'C01', intention: 'Protect sibling', knows: ['Letter implicates sibling'] }], when: `Day ${n}`, where: 'Archive', state_before: 'The letter has not been disclosed', action: `Action ${n}`, why: 'Disclosure threatens sibling', resistance: 'Investigator demands the truth', outcome: `Consequence ${n}`, establishes: [`Condition ${n}`], reader_learns: [`Disclosure ${n}`], requires: i ? [`T0${n - 1}`] : [], writer_task: `Dramatize action ${n} and its cost`, target_words: 250 })), ending: 'Truth emerges at a cost' };
}
const clean = { ready: true, issues: [] };
const issue = { severity: 'major', thesis_ids: ['T02'], problem: 'A choice lacks a cause', required_change: 'Show the threatened sibling before the choice' };
function model(seen: string[] = []): NovelLLM {
  return async (prompt, _system, options) => {
    const stage = options?.stage || ''; seen.push(stage);
    if (stage === 'thesis-plan' || stage === 'thesis-plan-repair') return JSON.stringify(outline());
    if (stage === 'thesis-plan-review') {
      const schema=options?.schema as any;
      expect(schema.properties.issues.items.required).toContain('required_change');
      expect(schema.properties.issues.items.properties.thesis_ids.items.enum).toEqual(['T01','T02','T03','T04']);
      return JSON.stringify(clean);
    }
    if (stage === 'thesis-block-review') return JSON.stringify(clean);
    if (stage === 'thesis-final-audit') return JSON.stringify({ summary: 'Resolved', supported: true, findings: [], checks: { ...Object.fromEntries(QUALITY_KEYS.map(key => [key, { passed: true, evidence: 'Test fixture: letter discovery leads to sibling rescue' }])), transitions: { passed: true, evidence: 'Adjacent scenes connect' }, causality: { passed: true, evidence: 'Letter revealed to save sibling' }, repeated_events: { passed: true, evidence: 'Revelation occurs once' } } });
    const current = JSON.parse(prompt.split('CURRENT THESIS — WRITE DIRECTLY BENEATH THIS ONE:\n')[1].split('\n')[0]);
    if (current.id !== 'T01') expect(prompt).toContain(`PROSE:${current.requires[0]}`);
    if (stage === 'thesis-block-repair') return JSON.stringify({ tool: 'finish', text: 'No additional edits required' });
    return `PROSE:${current.id}. ${current.action}; ${current.why}; ${current.outcome}.`;
  };
}
describe('crystallized thesis outline filled block by block', () => {
  it('keeps explicit thesis mode as a reviewed outline followed by writer and thesis checks', async () => {
    const store = new MemoryProjectStore(); const seen: string[] = [];
    const result = await new Orchestrator(store).runBook(input, model(seen));
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(seen).toEqual(['thesis-plan', 'thesis-plan-review', ...Array.from({ length: 4 }, () => ['thesis-block-write', 'thesis-block-review']).flat(), 'thesis-final-audit']);
    expect(store.loadProgressive()).toBeNull();
    expect(store.loadTheses()?.blocks.map(b => b.thesis_id)).toEqual(['T01', 'T02', 'T03', 'T04']);
    expect(store.manuscript()).toHaveLength(2);
    expect(store.manuscript()[0].text).toContain('PROSE:T02');
    const artifact = renderThesisBook(store.loadTheses()!);
    expect(artifact.indexOf('**Action:** Action 1')).toBeLessThan(artifact.indexOf('PROSE:T01'));
    expect(artifact.indexOf('PROSE:T01')).toBeLessThan(artifact.indexOf('**Action:** Action 2'));
  });
  it('repairs the plan before the writer runs even when ready is incorrectly true', async () => {
    const store = new MemoryProjectStore(); const seen: string[] = []; const base = model(seen); let reviews = 0;
    const result = await new Orchestrator(store).runBook(input, async (...args) => {
      if (args[2]?.stage === 'thesis-plan-review' && ++reviews === 1) { seen.push('thesis-plan-review'); return JSON.stringify({ ready: true, issues: [issue] }); }
      if (args[2]?.stage === 'thesis-block-write') expect(store.loadTheses()?.plan_ready).toBe(true);
      return base(...args);
    });
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(seen.slice(0, 5)).toEqual(['thesis-plan', 'thesis-plan-review', 'thesis-plan-repair', 'thesis-plan-review', 'thesis-block-write']);
    expect(store.loadTheses()?.rounds).toHaveLength(2);
  });
  it('writes the book when a plan defect outlasts its repairs, and reports the defect with it', async () => {
    const store = new MemoryProjectStore(); const seen: string[] = []; const base = model(seen);
    const result = await new Orchestrator(store).runBook(input, async (...args) => {
      if (args[2]?.stage === 'thesis-plan-review') return JSON.stringify({ ready: true, issues: [issue] });
      return base(...args);
    });
    expect(result.status).toBe('COMPLETE_WITH_WARNINGS'); expect(seen).toContain('thesis-block-write');
    expect(seen.indexOf('thesis-block-write')).toBeGreaterThan(seen.lastIndexOf('thesis-plan-repair'));
    expect(store.loadTheses()!.carried_findings!.map(finding => finding.problem)).toContain(issue.problem);
    expect(store.loadReport()!.findings.some(finding => finding.reader_impact.includes('Repair did not converge earlier'))).toBe(true);
  });
  it('resumes the pending review without rewriting an already drafted block', async () => {
    const store = new MemoryProjectStore(); const base = model(); let reviews = 0;
    await new Orchestrator(store).runBook(input, async (...args) => {
      if (args[2]?.stage === 'thesis-block-review' && ++reviews >= 2) throw new Error('Network interruption');
      return base(...args);
    });
    expect(store.loadTheses()?.blocks).toHaveLength(1); expect(store.loadTheses()?.pending?.thesis_id).toBe('T02');
    expect(store.manuscript()[0].text).not.toContain('PROSE:T02');
    const restored = new MemoryProjectStore(); restoreSnapshot(restored, snapshotProject(store));
    const seen: string[] = [];
    const result = await new Orchestrator(restored).runBook(input, model(seen));
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(seen[0]).toBe('thesis-block-review'); expect(seen.filter(s => s === 'thesis-block-write')).toHaveLength(2);
    expect(seen).not.toContain('thesis-plan');
  });
  it('repairs only the offending block before advancing to the next thesis', async () => {
    const store = new MemoryProjectStore(); const seen: string[] = []; const base = model(seen); let charged = false;
    const result = await new Orchestrator(store).runBook(input, async (...args) => {
      if (args[2]?.stage === 'thesis-block-review' && store.loadTheses()?.pending?.thesis_id === 'T02' && !charged) {
        charged = true; seen.push('thesis-block-review'); return JSON.stringify({ ready: true, issues: [{ ...issue, kind: 'missing_event', evidence: store.loadTheses()!.pending!.text, consequence: 'The choice has no established cause in the supplied scene.' }] });
      }
      return base(...args);
    });
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(seen.filter(s => s === 'thesis-block-repair')).toHaveLength(1);
    expect(store.loadTheses()?.blocks).toHaveLength(4);
  });
  it('rejects future dependencies, unknown actors and missing causes', () => {
    const missing = outline(); delete (missing.theses[0] as any).resistance;
    expect(() => readThesisPlan(missing, input)).toThrow(/missing required fields: resistance/);
    for (const edit of [(p: ThesisPlan) => { p.theses[0].requires = ['T04']; }, (p: ThesisPlan) => { p.theses[0].participants[0].character_id = 'C99'; }, (p: ThesisPlan) => { p.theses[0].why = ''; }]) {
      const p = outline(); edit(p); expect(() => readThesisPlan(p, input)).toThrow('Invalid thesis');
    }
    expect(readThesisReview({ ready: true, issues: [issue] }, outline()).ready).toBe(false);
  });
  it('preserves the saved book when a different input is supplied', async () => {
    const store = new MemoryProjectStore(); await new Orchestrator(store).runBook(input, model());
    const before = snapshotProject(store);
    const result = await new Orchestrator(store).runBook({ ...input, premise: 'A different book' }, model());
    expect(result.status).toBe('FAILED'); expect(result.callsUsed).toBe(0);
    expect(store.loadInput()).toEqual(before.files.input);
    expect(store.loadTheses()).toEqual(before.files.thesis_draft);
  });
  it('resumes a finished snapshot without model calls', async () => {
    const store = new MemoryProjectStore(); await new Orchestrator(store).runBook(input, model());
    const restored = new MemoryProjectStore(); restoreSnapshot(restored, snapshotProject(store));
    const seen: string[] = [];
    expect((await new Orchestrator(restored).runBook(input, model(seen))).status).toBe('COMPLETE');
    expect(seen).toEqual([]); expect(restored.manuscript()).toEqual(store.manuscript());
  });
  it('validates imported evidence before clearing the live book', async () => {
    const store = new MemoryProjectStore(); await new Orchestrator(store).runBook(input, model());
    const snap = snapshotProject(store); (snap.files.thesis_draft as any).blocks[0].review = { ready: true, issues: [issue] };
    expect(() => restoreSnapshot(store, snap)).toThrow('unreviewed'); expect(store.manuscript()).toHaveLength(2);
  });
  it('retries the final audit without recreating accepted blocks', async () => {
    const store = new MemoryProjectStore(); const base = model();
    await new Orchestrator(store).runBook(input, async (...args) => {
      if (args[2]?.stage === 'thesis-final-audit') throw new Error('Audit unavailable');
      return base(...args);
    });
    expect(store.loadTheses()?.completed).toBe(true); expect(store.loadReport()).toBeNull();
    const seen: string[] = []; await new Orchestrator(store).runBook(input, model(seen)); expect(seen).toEqual(['thesis-final-audit']);
  });
});


it('keeps repairing a canonical plan beyond two rounds while individual defects resolve',async()=>{
  const store=new MemoryProjectStore();let checks=0;let repairs=0;let wrote=false;
  const p={...outline(),canon:{facts:[{id:'F1',truth:'The letter exists',established_in:'INITIAL',knowledge:[]}]},theses:outline().theses.map(t=>({...t,fact_ids:['F1']}))};
  const result=await new Orchestrator(store).runBook(input,async(_prompt,_system,options)=>{
    if(options?.stage==='thesis-plan')return JSON.stringify(p);
    if(options?.stage==='thesis-plan-repair'){repairs++;return JSON.stringify({...p,title:'Revision '+repairs});}
    if(options?.stage==='thesis-plan-review'){
      checks++;
      if(checks===1)return JSON.stringify({ready:false,issues:[issue]});
      return JSON.stringify({ready:checks===5,checks:[{issue:0,status:'repaired',evidence:checks===2?'An escaped JSON quotation from the answer':'@P0001',explanation:'The original defect is corrected in the candidate.'}],issues:checks===5?[]:[{...issue,problem:'New defect '+checks,kind:'contradiction',evidence:'@P0001',consequence:'The choice has no executable consequence.'}]});
    }
    if(options?.stage==='thesis-plan-review-evidence') return JSON.stringify({references:[{path:'checks.0',evidence:'@P0001',supported:true,explanation:'The repaired cause is in this plan.'}]});
    if(options?.stage==='thesis-block-write'){wrote=true;throw new Error('Call budget exhausted at writing boundary');}
    throw new Error('Unexpected stage '+options?.stage);
  });
  expect(repairs).toBe(4);expect(wrote).toBe(true);expect(store.loadTheses()!.plan_ready).toBe(true);
  expect(result.stoppedReason).toContain('budget exhausted');
});

it('ends a canonical planning loop after two independently verified stalled repairs and goes on to write',async()=>{
  const store=new MemoryProjectStore();let reviews=0;let repairs=0;let wrote=false;
  const p={...outline(),canon:{facts:[{id:'F1',truth:'The letter exists',established_in:'INITIAL',knowledge:[]}]},theses:outline().theses.map(t=>({...t,fact_ids:['F1']}))};
  const result=await new Orchestrator(store).runBook(input,async(_prompt,_system,options)=>{
    if(options?.stage==='thesis-plan')return JSON.stringify(p);
    if(options?.stage==='thesis-plan-repair'){repairs++;return JSON.stringify(p);}
    if(options?.stage==='thesis-plan-review'){
      if(++reviews===1)return JSON.stringify({ready:false,issues:[issue]});
      return JSON.stringify({ready:false,checks:[{issue:0,status:'unresolved',evidence:'@P0001',explanation:'The original cause is still absent.'}],issues:[]});
    }
    wrote=true;throw new Error('Stop at the first call after planning');
  });
  expect(repairs).toBe(2);expect(wrote).toBe(true);
  expect(result.stoppedReason).toContain('Stop at the first call after planning');
  expect(store.loadTheses()!.rounds).toHaveLength(3);
  expect(store.loadTheses()!.plan_ready).toBe(true);
  expect(store.loadTheses()!.carried_findings).toHaveLength(1);
});

it('uses read and exact plan field tools inside the real automatic repair pipeline',async()=>{
  const store=new MemoryProjectStore();let reviewed=0;let repaired=false;let wrote=false;let turns=0;
  const p={...outline(),canon:{facts:[{id:'F1',truth:'The letter exists',established_in:'INITIAL',knowledge:[]}]},theses:outline().theses.map(t=>({...t,fact_ids:['F1']}))};
  const result=await new Orchestrator(store).runBook(input,async(prompt,_system,options)=>{
    if(options?.stage==='thesis-plan')return JSON.stringify(p);
    if(options?.stage==='thesis-plan-review'){
      if(++reviewed===1)return JSON.stringify({ready:false,issues:[issue]});
      expect(store.loadTheses()!.plan!.theses[1].why).toBe('Sibling will lose their home if the letter is exposed');
      return JSON.stringify({ready:true,checks:[{issue:0,status:'repaired',evidence:'@P0001',explanation:'T02 now establishes the threatened sibling as the reason for concealment.'}],issues:[]});
    }
    if(options?.stage==='thesis-plan-repair'){
      expect(prompt).toContain('patch_plan');
      if(++turns===1)return '{"tool":"read_plan","section":"thesis","id":"T02","field":"why"}';
      if(turns===2)return JSON.stringify({tool:'patch_plan',edits:[{section:'thesis',id:'T02',field:'why',before:p.theses[1].why,after:'Sibling will lose their home if the letter is exposed'}]});
      repaired=true;return '{"tool":"finish"}';
    }
    if(options?.stage==='thesis-block-write'){wrote=true;throw new Error('Call budget exhausted at test boundary');}
    throw new Error('Unexpected stage '+options?.stage);
  });
  expect(repaired).toBe(true);expect(wrote).toBe(true);expect(turns).toBe(3);
  expect(result.stoppedReason).toContain('budget exhausted');
  expect(store.loadTheses()!.plan_tools).toBeUndefined();
  expect(store.loadTheses()!.plan!.theses[0]).toEqual(p.theses[0]);
});

it('persists a rejected initial plan and resumes by repairing that candidate',async()=>{
 const store=new MemoryProjectStore();const broken=outline();broken.characters[0].goal='';
 await new Orchestrator(store).runBook(input,async()=>JSON.stringify(broken));
 expect(store.loadTheses()!.plan).toBeNull();
 expect(JSON.parse(store.loadTheses()!.response_candidate!.raw).characters[0].goal).toBe('');
 const restored=new MemoryProjectStore();restoreSnapshot(restored,JSON.parse(JSON.stringify(snapshotProject(store))));
 let repaired=false;
 await new Orchestrator(restored).runBook(input,async(prompt,_system,options)=>{
  if(options?.stage==='thesis-plan'){
   expect(prompt).toContain('exact field edits');repaired=true;
   return JSON.stringify({edits:[{path:'/characters/0/goal',before:'',after:'Protect sibling'}]});
  }
  throw Error('Call budget of test exhausted');
 });
 expect(repaired).toBe(true);expect(restored.loadTheses()!.plan!.characters[0].goal).toBe('Protect sibling');
 expect(restored.loadTheses()!.response_candidate).toBeUndefined();
});

it('does not stop prose generation when a reviewer exhausts malformed field-edit repairs',async()=>{
 const store=new MemoryProjectStore();const base=model();let reviews=0,writes=0;
 const result=await new Orchestrator(store).runBook(input,async(prompt,system,options)=>{
  if(options?.stage==='thesis-block-review'){
   reviews++;
   if(reviews===1)return '{"ready":true,"issues":[{}]}';
   return '{"edits":[{"op":"replace","path":"/issues","value":[]}]}';
  }
  if(options?.stage==='thesis-block-write' && ++writes===2)throw Error('Call budget of test exhausted at next scene');
  return base(prompt,system,options);
 });
 expect(result.stoppedReason).toContain('budget of test');
 expect(writes).toBe(2);expect(reviews).toBe(4);
 expect(store.loadTheses()!.blocks[0].review).toMatchObject({ready:false,status:'unavailable'});
 expect(store.loadTheses()!.review_candidate!.thesis_id).toBe('T01');
 expect(store.loadTheses()!.review_failures!.at(-1)!.error).toContain('Response repair allowance exhausted');
 expect(store.manuscript()[0].text).toContain('PROSE:T01');
});

it('names the character and the field when a plan character is refused', () => {
  const broken = outline(); (broken.characters[0] as any).goal = ''; (broken.characters[0] as any).capabilities = [''];
  expect(() => readThesisPlan(broken, input)).toThrow(`Character ${broken.characters[0].id}: goal must be nonempty text; capabilities must be an array of nonempty strings`);
  const twice = outline(); twice.characters.push({ ...twice.characters[0] });
  expect(() => readThesisPlan(twice, input)).toThrow('this id is used by two characters');
});
