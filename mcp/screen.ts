import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { screenStateFile } from '../services/screenStatePlugin';
import type { ScreenState } from '../utils/screenReport';

/** The app's last description of its screen, and how old it is; null when the app has not sent one. */
export async function readScreenState(customBase?: string): Promise<(ScreenState & { ageSeconds: number }) | null> {
  try {
    const state = JSON.parse(await readFile(screenStateFile(customBase), 'utf8')) as ScreenState;
    return state?.version === 1 ? { ...state, ageSeconds: Math.round((Date.now() - Date.parse(state.at)) / 1000) } : null;
  } catch { return null; }
}

const TEXT = /\.(md|txt|json|log|csv)$/i;
const IMAGE: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** Every file in the book's folder, with its size and age. */
export async function listBookFiles(bookDir: string): Promise<{ path: string; bytes: number; modified: string }[]> {
  const out: { path: string; bytes: number; modified: string }[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else { const s = await stat(full); out.push({ path: path.relative(bookDir, full), bytes: s.size, modified: s.mtime.toISOString() }); }
    }
  };
  await walk(bookDir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** One file of the book's folder: text as text, a picture as a picture. Nothing outside the folder. */
export async function readBookFolderFile(bookDir: string, relative: string, most = 200_000): Promise<{ text: string } | { data: string; mimeType: string }> {
  const full = path.resolve(bookDir, relative);
  if (!full.startsWith(path.resolve(bookDir) + path.sep)) throw new Error('Only files inside the book\'s folder can be read.');
  const ext = path.extname(full).toLowerCase();
  if (IMAGE[ext]) {
    const data = await readFile(full);
    if (data.length > 8_000_000) throw new Error('The picture is larger than 8 MB.');
    return { data: data.toString('base64'), mimeType: IMAGE[ext] };
  }
  if (!TEXT.test(full)) throw new Error(`Not a text or picture file (${ext || 'no extension'}).`);
  const text = await readFile(full, 'utf8');
  return { text: text.length > most ? `${text.slice(0, most)}\n… (${text.length} characters in all)` : text };
}
