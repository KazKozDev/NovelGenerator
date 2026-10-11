import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { buildLiveRunConfig } from './live-book/config.mjs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let directory = resolve(process.argv[2] || '');
let runner = null;
if (!process.argv[2]) throw new Error('Usage: node scripts/live-book.mjs runs/<run> [port]');
const page = readFileSync(fileURLToPath(new URL('./live-book/index.html', import.meta.url)));
const port = Number(process.argv[3] || 4318);
createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(page); return; }
  if (req.url === '/project' && req.method === 'GET') {
    try { res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Disposition', 'attachment; filename="book-project.json"'); res.end(readFileSync(resolve(directory,'snapshot.json'))); }
    catch { res.writeHead(503); res.end('Snapshot not available'); } return;
  }
  if (req.url === '/resume' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.origin !== 'http://127.0.0.1:4320') { res.writeHead(403); res.end(JSON.stringify({error:'Resume must be requested from the local studio'})); return; }
    let requestBody='';req.on('data',chunk=>{if(requestBody.length<1000000)requestBody+=chunk});req.on('end',()=>{
    try {
      const config=JSON.parse(requestBody||'{}');
      const log = readFileSync(resolve(directory,'run.log'),'utf8');
      if (runner || !/DONE status=FAILED/.test(log)) { res.writeHead(409); res.end(JSON.stringify({error:'This run is active or already completed'})); return; }
      const snapshot=readFileSync(resolve(directory,'snapshot.json'),'utf8');
      const input=JSON.parse(snapshot).files.input;
      const next=resolve(directory+'-configured-'+Date.now());
      const resume=resolve(next,'snapshot.json');
      const launch=buildLiveRunConfig(config,input,next,resume);
      mkdirSync(next,{recursive:true});
      if(launch.compatible)writeFileSync(resume,snapshot);
      runner=spawn(resolve('node_modules/.bin/vite-node'),launch.args,{stdio:'ignore'});
      runner.on('error',()=>{runner=null}); runner.on('exit',()=>{runner=null}); directory=next;
      res.end(JSON.stringify({ok:true,mode:launch.compatible?'resume':'new'}));
    } catch (error) { res.writeHead(400); res.end(JSON.stringify({error:error instanceof Error?error.message:'Unable to apply main-page settings'})); } }); return;
  }
  if (req.url !== '/state' || req.method !== 'GET') { res.writeHead(404); res.end(); return; }
  try {
    const snapshot = JSON.parse(readFileSync(resolve(directory, 'snapshot.json'), 'utf8'));
    const draft = snapshot.files.thesis_draft;
    const log = readFileSync(resolve(directory, 'run.log'), 'utf8').trim().split('\n');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ repairProgress: draft?.repair_reports?.at(-1), synopsis: draft?.synopsis, planReady: draft?.plan_ready, chapterCount: snapshot.files.input?.chapter_count, title: draft?.plan?.title, plan: draft?.plan?.theses || [],
      blocks: draft?.blocks || [], edits: draft?.edits || [], phase: !draft?.plan_ready ? (draft?.plan ? 'plan-review' : 'plan') : draft?.manifestation?.phase || 'rough',
      next: draft?.manifestation?.next, completed: draft?.completed,
      savedAt: snapshot.exportedAt, startedAt: Date.parse(log[0]?.slice(0,24)),
      endedAt: Date.parse(log.findLast(line=>line.includes('DONE status='))?.slice(0,24)||'') || undefined,
      calls: log.filter(line=>/CALL#\d+ /.test(line)).length, report: snapshot.files.final_report,
      writerModel: log[0]?.match(/writer=ollama:([^ ]+)/)?.[1],
      editorModel: log[0]?.match(/editor=qwen:([^ ]+)/)?.[1],
      canResume: !runner && log.some(line=>line.includes('DONE status=FAILED')),
      status: snapshot.files.final_report?.status || (log.some(line => line.includes('DONE status=FAILED')) ? 'FAILED' : undefined),
      failure: log.findLast(line => line.includes('STOPPED:'))?.split('STOPPED:')[1]?.trim(),
      activity: log.slice(-6), run: directory.split('/').at(-1) }));
  } catch { res.writeHead(503); res.end(JSON.stringify({ error: 'Снимок обновляется. Повторяем чтение…' })); }
}).listen(port, '127.0.0.1', () => console.log(`Live book: http://127.0.0.1:${port}`));
