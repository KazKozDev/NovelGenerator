import { afterEach, expect, it, vi } from 'vitest';
import { getWordsPerChapter, readGenerationSettings, saveGenerationSettings, buildProjectInput, saveMainForm, readMainForm } from '../utils/generationSettings';
afterEach(()=>vi.unstubAllGlobals());
it('reads the same saved main-page target after reload',()=>{
 const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v)});
 saveGenerationSettings({targetWordsPerChapter:2100});
 expect(getWordsPerChapter()).toBe(2100);
 expect(readGenerationSettings({targetWordsPerChapter:4000}).targetWordsPerChapter).toBe(2100);
 expect(getWordsPerChapter()*4).toBe(8400);
});
it('uses a valid default when saved data cannot be read',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>'{broken'});expect(getWordsPerChapter()).toBe(4000);
});
it('includes every narrative field from the form and persists the premise and count',()=>{
 const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v)});
 saveMainForm('A missing witness',4);
 expect(readMainForm()).toEqual({premise:'A missing witness',chapters:4});
 const input=buildProjectInput(readMainForm().premise,readMainForm().chapters,{genre:'thriller',targetWordsPerChapter:2100,narrativeVoice:'first-person',tone:'tense',writingStyle:'spare',targetAudience:'adult',tense:'present',ending:'open'});
 expect(input).toEqual({planning_version:2,premise:'A missing witness',chapter_count:4,genre:'thriller',target_total_words:8400,author_requirements:'Voice: first-person. Tone: tense. Style: spare. Audience: adult. Tense: present. Ending: open.'});
});
it('rejects an empty premise instead of replacing it with the previous story',()=>{
 expect(()=>buildProjectInput('',4,{targetWordsPerChapter:2100})).toThrow('Story premise');
});
it('enforces third-limited and past tense as absolute standard defaults when omitted',()=>{
 const input = buildProjectInput('A stranger arrives', 3, {});
 expect(input.author_requirements).toContain('Voice: third-limited.');
 expect(input.author_requirements).toContain('Tense: past.');
 const settings = readGenerationSettings({});
 expect(settings.narrativeVoice).toBe('third-limited');
 expect(settings.tense).toBe('past');
});

