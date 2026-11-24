import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { projectAutosavePlugin } from '../services/projectAutosavePlugin';
import { snapshotProject } from '../utils/novel/v2/export';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import * as idb from '../utils/novel/v2/idb';
import { PersistentProjectStore } from '../utils/novel/v2/persistent';

function snapshot(premise = 'Test story premise') {
  const store = new MemoryProjectStore();
  store.saveInput({premise,chapter_count:3,genre:'mystery',target_total_words:10200,author_requirements:''});
  store.saveManuscript(1, 'Completed scene.');
  return snapshotProject(store);
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('repository autosave', () => {
  it('saves into the book folder, restores, keeps copies, and rejects cross-origin writes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'novel-autosave-'));
    let handler: any;
    const plugin = projectAutosavePlugin(root);
    (plugin.configureServer as Function)({middlewares:{use: (route: string, value: any) => {if(route==='/api/project-autosave')handler=value}}});
    const server = createServer((req,res)=>handler(req,res));
    await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
    const url = `http://127.0.0.1:${(server.address() as any).port}`;
    const books = path.join(root,'Documents','NovelGenerator');
    const titled = (premise: string) => { const s: any = snapshot(premise); s.files.input.title = 'Тест'; return s; };
    try {
      const save = (value: unknown, origin=url) => fetch(`${url}/api/project-autosave`, {method:'PUT',headers:{origin,'content-type':'application/json'},body:JSON.stringify(value)});
      expect((await save(titled('Test story premise'), 'http://evil.test')).status).toBe(403);
      expect((await save({version:1})).status).toBe(400);
      expect((await save(titled('Test story premise'))).status).toBe(200);
      expect(JSON.parse(await readFile(path.join(books,'Тест','Тест.project.json'),'utf8')).files.manuscript[0].text).toBe('Completed scene.');
      expect(await readdir(root)).toEqual(['Documents']);
      expect((await (await fetch(`${url}/api/project-autosave`)).json()).snapshot.files.input.premise).toBe('Test story premise');
      expect((await save(titled('Another book'))).status).toBe(200);
      expect((await readdir(path.join(books,'Тест','копии'))).filter(name=>name.startsWith('перед новой книгой'))).toHaveLength(1);
      await writeFile(path.join(books,'Тест','Тест.project.json'),'broken JSON');
      const recovered=await (await fetch(`${url}/api/project-autosave`)).json();
      expect(recovered.snapshot).toBeNull();expect(recovered.recoveries[0].files.input.premise).toBe('Test story premise');
      expect((await save(titled('Another book'))).status).toBe(200);
      expect((await readdir(path.join(books,'Тест','копии'))).some(name=>name.startsWith('повреждённый автосейв'))).toBe(true);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); await rm(root,{recursive:true,force:true}); }
  });
  it('reports failed disk saves instead of claiming success, then can retry', async () => {
    vi.stubGlobal('window', {});
    const fetcher=vi.fn().mockResolvedValueOnce({ok:false}).mockResolvedValue({ok:true,json:async()=>({savedAt:123})});
    vi.stubGlobal('fetch',fetcher);
    const store=new PersistentProjectStore();
    store.saveInput(snapshot().files.input as any);
    await expect(store.flush()).rejects.toThrow('Cannot save');
    expect(store.saveStatus.state).toBe('error');
    await store.flush();
    expect(store.saveStatus).toEqual({state:'saved',savedAt:123});
  });
  it('saves pending manuscript edits before a clean slate snapshot', async () => {
    vi.stubGlobal('window', {});
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({savedAt:123})});
    vi.stubGlobal('fetch',fetcher);
    const store=new PersistentProjectStore();
    store.saveInput(snapshot().files.input as any);
    store.saveManuscript(1,'Latest edit before reset');
    await store.flush();
    store.clearAll();
    await store.flush();
    const saves=fetcher.mock.calls.map(call=>JSON.parse(call[1].body));
    expect(saves[0].files.manuscript[0].text).toBe('Latest edit before reset');
    expect(saves[1].files.input).toBeNull();
    expect(saves[1].files.manuscript).toEqual([]);
  });
  it('opens the disk project even with no browser slot', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({snapshot:snapshot()})}).mockResolvedValue({ok:true,json:async()=>({savedAt:123})}));
    const store=await PersistentProjectStore.open();
    expect(store.manuscript()[0].text).toBe('Completed scene.');
    expect(store.saveStatus.state).toBe('saved');
  });
});

it('tries a valid browser backup after the newest disk snapshot fails validation',async()=>{
 vi.stubGlobal('window',{});const valid=snapshot();
 vi.spyOn(idb,'idbGet').mockResolvedValue(valid);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({snapshot:{...valid,exportedAt:'2099-01-01T00:00:00Z',files:{input:{premise:2},manuscript:[]}}})}).mockResolvedValue({ok:true,json:async()=>({savedAt:123})}));
 const store=await PersistentProjectStore.open();
 expect(store.manuscript()[0].text).toBe('Completed scene.');
 expect(store.runLog().some(entry=>entry.stage==='recovery')).toBe(true);
});
it('restores an archive when both active copies are invalid',async()=>{
 vi.stubGlobal('window',{});vi.spyOn(idb,'idbGet').mockResolvedValue({version:3});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({snapshot:{version:3},recoveries:[snapshot()]})}).mockResolvedValue({ok:true,json:async()=>({savedAt:123})}));
 expect((await PersistentProjectStore.open()).manuscript()[0].text).toBe('Completed scene.');
});
it('reports failed recovery instead of claiming a corrupt file is an intentional reset',async()=>{
 vi.stubGlobal('window',{});vi.spyOn(idb,'idbGet').mockResolvedValue(null);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({snapshot:{exportedAt:'2099-01-01',files:{}}})}));
 const store=await PersistentProjectStore.open();
 expect(store.saveStatus.state).toBe('error');expect(store.saveStatus.error).toContain('Project recovery failed');
});
