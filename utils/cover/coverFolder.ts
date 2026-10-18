/**
 * The cover studio in the book's обложки/ folder: "студия обложек.json" holds everything but the pictures,
 * each master picture sits beside it as "мастер <date>.png" with its prompt, its original before enhancing
 * and its depth mask, and the current covers and YouTube A/B/C thumbnails are kept as JPEGs a person can open.
 * Every file here is replaced in place, so the folder always shows the studio as it was last left.
 */
import { saveToBookFolder } from '../saveToBookFolder';
import type { CoverMaster, CoverStudioState } from './coverStore';

export const STUDIO_LABEL = 'студия обложек';
export const STUDIO_FILE = `${STUDIO_LABEL}.json`;

/** "2026-10-17 15.40.07": seconds too, so two pictures made in one minute keep their own files. */
export function masterStamp(at: number): string {
  const d = new Date(at || Date.now());
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}

export const imageExt = (blob: Blob) => blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';

/** The labels of a master's files: the picture, its prompt, its original and its depth mask. */
export function masterLabels(m: Pick<CoverMaster, 'createdAt'>) {
  const label = `мастер ${masterStamp(m.createdAt)}`;
  return { picture: label, prompt: `${label} — промпт`, original: `${label} — оригинал`, depth: `${label} — глубина` };
}

export interface StudioManifest extends Omit<CoverStudioState, 'masters'> {
  version: 1;
  savedAt: number;
  masters: { id: string; prompt: string; model: string; createdAt: number; file: string; original?: string; depth?: string }[];
}

/** The studio without its pictures, naming the file of each one. */
export function studioManifest(state: CoverStudioState, savedAt = state.savedAt ?? Date.now()): StudioManifest {
  const { masters, ...rest } = state;
  return {
    ...rest,
    version: 1,
    savedAt,
    masters: masters.map(m => {
      const labels = masterLabels(m);
      return {
        id: m.id, prompt: m.prompt, model: m.model, createdAt: m.createdAt,
        file: `${labels.picture}.${imageExt(m.blob)}`,
        ...(m.original ? { original: `${labels.original}.${imageExt(m.original)}` } : {}),
        ...(m.depth ? { depth: `${labels.depth}.${imageExt(m.depth)}` } : {}),
      };
    }),
  };
}

export function bookFileUrl(title: string, name: string, kind = 'covers'): string {
  return `/api/book-file?${new URLSearchParams({ title, kind, name })}`;
}

async function fetchBlob(title: string, name: string | undefined): Promise<Blob | undefined> {
  if (!name) return undefined;
  try {
    const res = await fetch(bookFileUrl(title, name));
    return res.ok ? await res.blob() : undefined;
  } catch { return undefined; }
}

/** The studio as the book folder last kept it, pictures included; undefined when the folder has none. */
export async function loadStudioFromFolder(title: string): Promise<CoverStudioState | undefined> {
  let manifest: StudioManifest;
  try {
    const res = await fetch(bookFileUrl(title, STUDIO_FILE));
    if (!res.ok) return undefined;
    manifest = await res.json();
    if (manifest?.version !== 1 || !Array.isArray(manifest.masters)) return undefined;
  } catch { return undefined; }
  const masters: CoverMaster[] = [];
  for (const m of manifest.masters) {
    const blob = await fetchBlob(title, m.file);
    if (!blob) continue; // A picture removed from the folder by hand leaves the studio, not a broken tile.
    const [original, depth] = await Promise.all([fetchBlob(title, m.original), fetchBlob(title, m.depth)]);
    masters.push({ id: m.id, blob, prompt: m.prompt, model: m.model, createdAt: m.createdAt, ...(original ? { original } : {}), ...(depth ? { depth } : {}) });
  }
  const { version: _version, masters: _masters, ...rest } = manifest;
  return { ...rest, masters, selected: masters.some(m => m.id === manifest.selected) ? manifest.selected : masters[0]?.id };
}

/** Writes the studio's state file; true when the book folder took it. */
export async function saveStudioManifest(title: string, state: CoverStudioState): Promise<boolean> {
  const saved = await saveToBookFolder({ title, kind: 'covers', label: STUDIO_LABEL, ext: 'json', content: JSON.stringify(studioManifest(state), null, 2), stamp: false, replace: true });
  return saved !== null;
}

/** The newer of two saved states; the browser's when neither says when it was saved. */
export function newerStudio(browser?: CoverStudioState, folder?: CoverStudioState): CoverStudioState | undefined {
  if (!browser) return folder;
  if (!folder) return browser;
  return (folder.savedAt ?? 0) > (browser.savedAt ?? 0) ? folder : browser;
}
