import type { NovelRun } from './contracts';

export interface RunStore {
  load(): Promise<NovelRun | undefined>;
  save(run: NovelRun): Promise<void>;
  clear(): Promise<void>;
}

/** IndexedDB stores the full revision history without localStorage's small synchronous quota. */
export class BrowserRunStore implements RunStore {
  private database?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    if (!this.database) this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open('novel-generator-runs', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('runs');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Cannot open manuscript storage.'));
    });
    return this.database;
  }

  async load(): Promise<NovelRun | undefined> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('runs', 'readonly');
      const request = transaction.objectStore('runs').get('active');
      let run: NovelRun | undefined;
      request.onsuccess = () => { run = request.result; };
      transaction.oncomplete = () => {
        if (run && run.schemaVersion !== 1) reject(new Error('Unsupported manuscript checkpoint version.'));
        else resolve(run);
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Manuscript read was aborted.'));
    });
  }

  async save(run: NovelRun): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('runs', 'readwrite');
      transaction.objectStore('runs').put(structuredClone(run), 'active');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Manuscript checkpoint was not saved.'));
    });
  }

  async clear(): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('runs', 'readwrite');
      transaction.objectStore('runs').delete('active');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Manuscript reset was aborted.'));
    });
  }
}

export class MemoryRunStore implements RunStore {
  private run?: NovelRun;
  async load() { return this.run ? structuredClone(this.run) : undefined; }
  async save(run: NovelRun) { this.run = structuredClone(run); }
  async clear() { this.run = undefined; }
}
