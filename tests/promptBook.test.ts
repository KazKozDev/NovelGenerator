import {expect,it,vi} from 'vitest';
import {MemoryProjectStore} from '../utils/novel/v2/store';
import {snapshotProject,restoreSnapshot} from '../utils/novel/v2/export';
import {buildProjectInput} from '../utils/generationSettings';
import {initializePromptBook,generatePromptBook,editBlueprint,editChapterPrompt,validateBlueprint,type BookBlueprint} from '../utils/novel/promptBook';

const settings={genre:'thriller',targetWordsPerChapter:3000,narrativeVoice:'first-person',tense:'present',seriesContext:'An existing lighthouse town',comparableBooks:'Reference A',storyStructure:'Four linked decisions',sceneLayout:'flexible',writingMethod:'hybrid'} as const;
function blueprint(count=4):BookBlueprint{return {title:'Proposed title',overview:'A keeper follows a missing log',centralConflict:'Duty versus concealment',ending:'The true log is submitted',additions:['The keeper has a sister'],characters:[{id:'P1',name:'Ada',motivation:'Keep her post',voice:'Clipped'}],facts:[{id:'F1',description:'The log is false',introducedIn:2}],chapters:Array.from({length:count},(_,i)=>({chapter:i+1,title:`Decision ${i+1}`,goal:'Find a reliable account',conflict:'The witness refuses',startingSituation:'At the end of the prior decision',outcome:`Consequence ${i+1}`,handoff:i===count-1?'The central dispute ends':`Requires decision ${i+2}`,dependsOn:i?[i]:[],reveals:i===1?['F1']:[]}))};}
function briefs(numbers:number[]){return {chapters:numbers.map(chapter=>({chapter,dramaticTask:'Make a costly choice',initialState:'The keeper knows only what she has witnessed',interests:'Witness wants to leave',causalRoute:['Ask for help and be refused','Negotiate a limited agreement'],ending:'Register the evidence',freedom:'Invent dialogue and tactics'}))};}
function setup(count=4){const store=new MemoryProjectStore();const input={...buildProjectInput('A lighthouse keeper finds a false log',count,settings,'Author title'),generation_mode:'prompts' as const};initializePromptBook(input,settings,store);return {store,input};}
it('builds one shared plan then all prompts, preserving author input and producing no prose or report',async()=>{
 const {store,input}=setup();const llm=vi.fn().mockResolvedValueOnce(JSON.stringify(blueprint())).mockResolvedValueOnce(JSON.stringify(briefs([1,2,3,4])));
 const result=await generatePromptBook(store,llm);
 expect(llm).toHaveBeenCalledTimes(2);expect(result.phase).toBe('ready');expect(result.blueprint?.title).toBe('Author title');
 expect(result.prompts).toHaveLength(4);expect(store.manuscript()).toEqual([]);expect(store.loadReport()).toBeNull();
 expect(llm.mock.calls[0][0]).toContain(JSON.stringify({input,settings}));
 for(const p of result.prompts){expect(p.prompt).toContain('3000');expect(p.prompt).toContain('Four linked decisions');expect(p.system).toContain('first-person');expect(p.system).toContain('present');}
 expect(result.prompts[0].prompt).not.toContain('The log is false');expect(result.prompts[1].prompt).toContain('The log is false');
 expect(llm.mock.calls.every(c=>c[2].route==='writer')).toBe(true);
});
it('resumes after a failed prompt stage from the saved blueprint, including snapshot round trip',async()=>{
 const {store}=setup();const failure=vi.fn().mockResolvedValueOnce(JSON.stringify(blueprint())).mockRejectedValueOnce(new Error('Network failed'));
 await expect(generatePromptBook(store,failure)).rejects.toThrow('Network failed');expect(store.loadAuthor()?.promptPlanning?.blueprint).toBeTruthy();
 const restored=new MemoryProjectStore();restoreSnapshot(restored,snapshotProject(store));
 const resumed=vi.fn().mockResolvedValue(JSON.stringify(briefs([1,2,3,4])));await generatePromptBook(restored,resumed);expect(resumed).toHaveBeenCalledTimes(1);
});
it('rejects incomplete or future-linked plans instead of making up missing chapters',()=>{
 const p=blueprint();p.chapters[1].dependsOn=[3];expect(()=>validateBlueprint(p,4)).toThrow('future events');
 const short=blueprint();short.chapters.pop();expect(()=>validateBlueprint(short,4)).toThrow('4 chapters');
 const badFact=blueprint();badFact.chapters[0].reveals=['F1'];expect(()=>validateBlueprint(badFact,4)).toThrow('revelations');
});
it('invalidates every prompt on a plan edit and preserves stale manual changes until regeneration',async()=>{
 const {store}=setup();await generatePromptBook(store,vi.fn().mockResolvedValueOnce(JSON.stringify(blueprint())).mockResolvedValueOnce(JSON.stringify(briefs([1,2,3,4]))));
 editChapterPrompt(store,1,'My system','My manual prompt');const p=store.loadAuthor()!.promptPlanning!.blueprint!;p.chapters[1].outcome='A different consequence';
 const edited=editBlueprint(store,p);expect(edited.phase).toBe('prompts');expect(edited.revision).toBe(2);expect(edited.prompts[0].prompt).toBe('My manual prompt');expect(edited.prompts.every(p=>p.sourceRevision===1)).toBe(true);
 expect(()=>editChapterPrompt(store,1,'x','y')).toThrow('Regenerate');
 const llm=vi.fn().mockResolvedValue(JSON.stringify(briefs([1,2,3,4])));const fresh=await generatePromptBook(store,llm);expect(llm).toHaveBeenCalledTimes(1);expect(fresh.prompts.every(p=>p.sourceRevision===2&&!p.edited)).toBe(true);
});
it('saves valid batches and resumes only missing batches in a larger book',async()=>{
 const {store}=setup(6);const llm=vi.fn().mockResolvedValueOnce(JSON.stringify(blueprint(6))).mockResolvedValueOnce(JSON.stringify(briefs([1,2,3,4]))).mockResolvedValueOnce(JSON.stringify(briefs([6,5])));
 await expect(generatePromptBook(store,llm)).rejects.toThrow('order');expect(store.loadAuthor()?.promptPlanning?.prompts).toHaveLength(4);
 const resumed=vi.fn().mockResolvedValue(JSON.stringify(briefs([5,6])));expect((await generatePromptBook(store,resumed)).prompts).toHaveLength(6);expect(resumed).toHaveBeenCalledTimes(1);
});
it('does not commit an in-flight result after cancellation',async()=>{
 const {store}=setup();let cancelled=false;const llm=vi.fn(async()=>{cancelled=true;return JSON.stringify(blueprint());});
 await expect(generatePromptBook(store,llm,()=>{if(cancelled)throw new Error('Cancelled');})).rejects.toThrow('Cancelled');expect(store.loadAuthor()?.promptPlanning?.blueprint).toBeUndefined();
});
