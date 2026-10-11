import { expect, it } from 'vitest';
import { buildLiveRunConfig } from '../scripts/live-book/config.mjs';
const input={premise:'A missing witness',chapter_count:4,genre:'thriller',target_total_words:8400,author_requirements:'Voice: first-person. Tense: present. Ending: open.'};
const writer={provider:'ollama',ollamaModel:'custom-writer',ollamaEndpoint:'/api/ollama'};
it('passes full main-page input and the selected editor model without a hardcoded override',()=>{
 const launch=buildLiveRunConfig({input,writer,editor:{provider:'qwen',qwenModel:'qwen3.7-flash'}},input,'/tmp/new','/tmp/snapshot.json');
 expect(launch.compatible).toBe(true);
 const value=(name:string)=>launch.args[launch.args.indexOf(name)+1];
 expect(value('--writer')).toBe('custom-writer');expect(value('--editor')).toBe('qwen3.7-flash');
 expect(value('--author-requirements')).toBe(input.author_requirements);
 expect(value('--genre')).toBe('thriller');expect(value('--chapters')).toBe('4');expect(value('--words-per-chapter')).toBe('2100');
 expect(value('--endpoint')).toBe('http://127.0.0.1:11434');expect(value('--resume')).toBe('/tmp/snapshot.json');
});
it('uses the writer as editor when separate editor is disabled',()=>{
 const launch=buildLiveRunConfig({input,writer,editor:null},input,'/tmp/new','/tmp/snapshot');
 expect(launch.args[launch.args.indexOf('--editor')+1]).toBe('custom-writer');
 expect(launch.args[launch.args.indexOf('--editor-provider')+1]).toBe('ollama');
});
it('starts a separate run for changed narrative requirements and retains resume for budget changes',()=>{
 expect(buildLiveRunConfig({input:{...input,author_requirements:'Tone: comic.'},writer},input,'/tmp/new','/tmp/snapshot').args).not.toContain('--resume');
 expect(buildLiveRunConfig({input:{...input,target_total_words:16000},writer},input,'/tmp/new','/tmp/snapshot').args).toContain('--resume');
});
it('rejects incomplete configuration before starting a model call',()=>{
 expect(()=>buildLiveRunConfig({input:{...input,premise:''},writer},input,'/tmp/new','/tmp/snapshot')).toThrow('main page');
});
