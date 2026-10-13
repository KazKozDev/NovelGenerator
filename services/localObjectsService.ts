/**
 * A small network that runs on this machine: GLiNER, which picks the objects out of text. Hugging Face does not serve
 * it, so it is run here with Python — from .venv-nets in the project when that exists, else the system's python3.
 * Node only. When it is not set up the call fails, and the engine goes on without it.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FoundObject } from '../utils/novel/v3/newThings';

export function findObjectsLocally(model: string, texts: string[], labels: string[], threshold: number, root = process.cwd()): Promise<FoundObject[][]> {
  const own = join(root, '.venv-nets', 'bin', 'python'), python = existsSync(own) ? own : 'python3';
  return new Promise((resolve, reject) => {
    const child = spawn(python, [join(root, 'scripts', 'objects_gliner.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let answer = '', said = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('The local network took more than three minutes.')); }, 180_000);
    child.stdout.on('data', chunk => { answer += chunk; }); child.stderr.on('data', chunk => { said += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(new Error(`The local network could not be started: ${error.message}`)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error(/No module named 'gliner'/.test(said) ? 'GLiNER is not installed: python3 -m venv --system-site-packages .venv-nets && .venv-nets/bin/pip install gliner' : `The local network stopped: ${said.trim().split('\n').at(-1)?.slice(0, 200) || `exit ${code}`}`)); return; }
      try { resolve(JSON.parse(answer) as FoundObject[][]); } catch { reject(new Error('The local network gave an answer that could not be read.')); }
    });
    child.stdin.end(JSON.stringify({ model, texts, labels, threshold }));
  });
}
