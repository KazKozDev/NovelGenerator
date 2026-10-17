/**
 * The cover studio's state per book, kept in the browser's IndexedDB: master pictures are several
 * megabytes each, too large for the project autosave or localStorage.
 */
import { DEFAULT_STYLE, type CoverStyle, type CoverText } from './formats';

export interface CoverMaster { id: string; blob: Blob; prompt: string; model: string; createdAt: number }

export interface CoverStudioState {
  description: string;
  model: string;
  masters: CoverMaster[];
  selected?: string;
  focus: { x: number; y: number };
  text: CoverText;
  style: CoverStyle;
}

export const emptyStudio = (text: CoverText): CoverStudioState => ({
  description: '', model: 'gemini-3-pro-image', masters: [], focus: { x: 0.5, y: 0.5 }, text, style: DEFAULT_STYLE,
});

const DB = 'novel-cover-studio';
const STORE = 'studios';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadStudio(key: string): Promise<CoverStudioState | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result as CoverStudioState | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}

export async function saveStudio(key: string, state: CoverStudioState): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(state, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
