import type { Plugin } from 'vite';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface EpubCheckMessage { severity: string; id: string; message: string; where?: string }
export interface EpubCheckResult { available: boolean; ok?: boolean; version?: string; messages: EpubCheckMessage[] }

/** The JSON report EPUBCheck writes, reduced to what a person reads: errors and warnings with where they are. */
export function readEpubCheckReport(report: any): EpubCheckResult {
  const messages: EpubCheckMessage[] = (Array.isArray(report?.messages) ? report.messages : [])
    .filter((m: any) => ['FATAL', 'ERROR', 'WARNING'].includes(m?.severity))
    .map((m: any) => ({
      severity: m.severity,
      id: String(m.ID || ''),
      message: String(m.message || ''),
      where: Array.isArray(m.locations) && m.locations[0] ? `${m.locations[0].path}${m.locations[0].line > 0 ? `:${m.locations[0].line}` : ''}` : undefined,
    }));
  return {
    available: true,
    ok: !messages.some(m => m.severity !== 'WARNING'),
    version: report?.checker?.checkerVersion,
    messages,
  };
}

/** Pages in a PDF, from its page objects. */
export function pdfPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
}

/** The Chrome that prints the PDFs: CHROME_PATH, or the usual places on macOS and Linux. */
function chromePath(): string | null {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  return candidates.find(c => c && existsSync(c)) || null;
}

/** Prints an HTML page to PDF with headless Chrome: the page's own @page rules set the size and margins. */
export async function printHtmlToPdf(html: string): Promise<Buffer> {
  const chrome = chromePath();
  if (!chrome) throw Object.assign(new Error('Google Chrome is needed to lay out print PDFs; set CHROME_PATH to its binary'), { code: 'NO_CHROME' });
  const dir = await mkdtemp(path.join(tmpdir(), 'novel-print-'));
  try {
    const page = path.join(dir, 'page.html');
    const out = path.join(dir, 'out.pdf');
    await writeFile(page, html);
    await new Promise<void>((resolve, reject) => {
      // Headless Chrome on macOS often stays up after writing the PDF: the finished file, ending in %%EOF and no
      // longer growing, is the signal to stop it.
      const child = spawn(chrome, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--use-mock-keychain',
        '--password-store=basic', '--disable-background-networking', '--disable-component-update', '--disable-sync',
        '--disable-extensions', `--user-data-dir=${path.join(dir, 'profile')}`,
        '--no-pdf-header-footer', '--generate-pdf-document-outline', `--print-to-pdf=${out}`, `file://${page}`,
      ], { stdio: 'ignore' });
      let lastSize = -1;
      const started = Date.now();
      const done = (error?: Error) => { clearInterval(poll); child.kill('SIGKILL'); error ? reject(error) : resolve(); };
      const poll = setInterval(async () => {
        if (Date.now() - started > 180_000) { done(new Error('Chrome took more than 3 minutes to print the PDF')); return; }
        if (!existsSync(out)) return;
        const size = (await stat(out)).size;
        if (size > 0 && size === lastSize) {
          const tail = (await readFile(out)).subarray(-32).toString('latin1');
          if (tail.includes('%%EOF')) { done(); return; }
        }
        lastSize = size;
      }, 250);
      child.on('error', error => done(error));
      child.on('exit', code => { if (!existsSync(out)) done(new Error(`Chrome exited (${code}) without a PDF`)); });
    });
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The checks the stores run, run here first: an EPUB posted to /api/publish/epubcheck goes through the EPUBCheck
 * installed on this machine (`brew install epubcheck`). Without it the answer says so, and the app does not pretend.
 */
export function publishDevPlugin(): Plugin {
  const middleware = (server: { middlewares: { use: Function } }) => {
    // An HTML page in, its PDF out, with the page count in X-Page-Count.
    server.middlewares.use('/api/publish/print-pdf', (req: any, res: any) => {
      if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const pdf = await printHtmlToPdf(Buffer.concat(chunks).toString('utf8'));
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('X-Page-Count', String(pdfPages(pdf)));
          res.end(pdf);
        } catch (error: any) {
          res.statusCode = error?.code === 'NO_CHROME' ? 501 : 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error?.message || 'The PDF could not be printed' }));
        }
      });
    });
    server.middlewares.use('/api/publish/epubcheck', (req: any, res: any) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'POST required' })); return; }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'novel-epubcheck-'));
        try {
          const epub = path.join(dir, 'book.epub');
          const out = path.join(dir, 'report.json');
          await writeFile(epub, Buffer.concat(chunks));
          const result = await new Promise<EpubCheckResult>(resolve => {
            execFile(process.env.EPUBCHECK || 'epubcheck', [epub, '--json', out, '--quiet'], { timeout: 120_000 }, async (error: any) => {
              if (error?.code === 'ENOENT') { resolve({ available: false, messages: [] }); return; }
              try { resolve(readEpubCheckReport(JSON.parse(await readFile(out, 'utf8')))); }
              catch { resolve({ available: true, ok: false, messages: [{ severity: 'FATAL', id: 'RUN', message: String(error?.message || 'EPUBCheck gave no report') }] }); }
            });
          });
          res.statusCode = 200;
          res.end(JSON.stringify(result));
        } catch (error: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error?.message || 'EPUBCheck failed' }));
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      });
    });
  };
  return { name: 'publish-checks', configureServer: middleware, configurePreviewServer: middleware };
}
