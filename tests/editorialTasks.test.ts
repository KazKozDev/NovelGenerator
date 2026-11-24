import { describe, it, expect } from 'vitest';
import { buildEditorialTasks, reportEditorialFindings, checkEditorialTask, proposeEditorialTask, taskContext } from '../utils/novel/editorialTasks';
const manuscript = '## Chapter 1\n\nNora locked the door with the key.\n\n## Chapter 2\n\nNora opened the locked door without a key.';
const findings = [{ description: 'Key continuity contradicts Chapter 1 and Chapter 2.', severity: 'major', evidence_refs: ['chapter-1: Nora locked the door with the key.', 'chapter-2: Nora opened the locked door without a key.'] }];
const task = buildEditorialTasks(findings, [])[0];
describe('source-backed editorial tasks', () => {
 it('includes standalone unresolved promises without duplicating findings', () => {
   const notes = reportEditorialFindings({ findings, unresolved_major_promises: [findings[0].description, 'Resolve the missing ending.'] });
   expect(notes).toHaveLength(2);
   expect(notes[1].severity).toBe('major');
 });
 it('preserves every observation, original severity and all chapter references with stable IDs', () => {
   const source = [...findings, ...Array.from({length:3},(_,i)=>({description:`Other issue ${i}`,severity:i===2?'major':'minor',evidence_refs:[]}))];
   const tasks = buildEditorialTasks(source, []);
   expect(tasks).toHaveLength(4);
   expect(tasks.find(t=>t.problemSummary==='Other issue 2')?.priority).toBe('high');
   expect(task.chapterNumbers).toEqual([1,2]);
   expect(buildEditorialTasks([...source].reverse(), []).find(t=>t.problemSummary===task.problemSummary)?.id).toBe(task.id);
   expect(taskContext(task, manuscript)).toContain('without a key');
   expect(taskContext(task, manuscript)).toContain('locked the door with the key');
 });
 it('does not infer canon or dismiss pacing requests from character names', () => {
   const t = buildEditorialTasks([{description:'Cut first 250 words of atmosphere.'}], [{num:1,content:'Clark and Bruce met.'}])[0];
   expect(t.isDismissed).not.toBe(true);
   expect(t.canonicalDirective).not.toMatch(/super-speed|kryptonite|noir/);
 });
 it('requires current evidence to close, including after old quotes disappear', async () => {
   const raw = (evidence: unknown[]) => async () => JSON.stringify({status:'resolved',explanation:'The key is now used.',evidence});
   expect((await checkEditorialTask(task, manuscript,raw([]))).status).toBe('needs_author');
   expect((await checkEditorialTask(task, manuscript,raw([{chapter:2,quote:'Invented evidence from nowhere'}]))).status).toBe('needs_author');
   expect((await checkEditorialTask(task, manuscript,raw([{chapter:2,quote:'Nora opened the locked door without a key.'}]))).status).toBe('resolved');
   expect((await checkEditorialTask(task, manuscript,async()=> 'not json')).status).toBe('needs_author');
 });
 it('keeps open problems open and exposes author decisions', async () => {
   for (const status of ['open','needs_author'] as const) expect((await checkEditorialTask(task,manuscript,async()=>JSON.stringify({status,explanation:'The contradiction remains.'}))).status).toBe(status);
 });
 it('prepares linked multi-chapter edits atomically without mutating the source', async () => {
   const proposal = await proposeEditorialTask(task, manuscript, {author_requirements:'Keep Nora cautious'}, async prompt => {
     expect(prompt).toContain('Keep Nora cautious');
     return '```tool:propose_diff\n{"chapter":1,"search":"Nora locked the door with the key.","replace":"Nora locked the door and kept the key."}\n```\n```tool:propose_diff\n{"chapter":2,"search":"Nora opened the locked door without a key.","replace":"Nora used her key to open the door."}\n```';
   });
   expect(proposal.cards).toHaveLength(2);
   expect(proposal.updatedManuscript).toContain('kept the key');
   expect(proposal.updatedManuscript).toContain('used her key');
   expect(proposal.baseline).toBe(manuscript);
 });
 it('rejects overlapping patches as a whole', async () => {
   const tool = '```tool:propose_diff\n{"chapter":1,"search":"Nora locked the door with the key.","replace":"The door was locked."}\n```';
   await expect(proposeEditorialTask(task,manuscript,{},async()=>tool+'\n'+tool)).rejects.toThrow();
 });
});
