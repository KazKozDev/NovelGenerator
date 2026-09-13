/**
 * Minimal promise-based key-value over IndexedDB for the project slot.
 * localStorage caps at ~5MB; a finished book with its log no longer fits, so
 * the durable copy lives here while memory stays the source of truth.
 * Every function degrades to a no-op (get: null) where IndexedDB is missing.
 */
const DB_NAME = 'novelgen-v2';
const STORE_NAME = 'slot';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function run<T>(mode: IDBTransactionMode, task: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(db => {
    if (!db) return null;
    return new Promise<T | null>(resolve => {
      try {
        const tx = db.transaction(STORE_NAME, mode);
        const request = task(tx.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
        tx.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

export function idbGet(key: string): Promise<unknown> {
  return run('readonly', store => store.get(key));
}

export function idbSet(key: string, value: unknown): Promise<void> {
  return run('readwrite', store => store.put(value, key)).then(() => undefined);
}

export function idbDel(key: string): Promise<void> {
  return run('readwrite', store => store.delete(key)).then(() => undefined);
}
