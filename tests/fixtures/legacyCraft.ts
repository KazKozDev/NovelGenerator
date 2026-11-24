import { MemoryProjectStore } from '../../utils/novel/v2/store';
import { authorKey } from '../../utils/novel/author';
import type { ProjectInput } from '../../utils/novel/v2/types';
/** Explicit compatibility fixture: pre-author-engine projects retain their pipeline. */
export function legacyStore(input: ProjectInput, packet: unknown): MemoryProjectStore {
  const store = new MemoryProjectStore();
  store.saveAuthor({ version: 1, input_key: authorKey(input), clock: '', plan: '', chapters: [], waiting: '', noticed: [], completed: false, desk: { files: { 'dossier.md': 'TITLE: Preserved Story', 'packet.json': JSON.stringify(packet) }, answers: [], journal: [], step: 0, budget: 100, spent: 0, finished: false } });
  return store;
}
