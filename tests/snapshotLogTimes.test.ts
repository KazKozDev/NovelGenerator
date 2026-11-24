import { describe, expect, it } from 'vitest';
import { restoreSnapshot, snapshotProject } from '../utils/novel/v2/export';
import { MemoryProjectStore } from '../utils/novel/v2/store';

describe('restoreSnapshot', () => {
  it('keeps the time of each run log entry, so opening a book changes nothing in it', () => {
    const store = new MemoryProjectStore();
    store.saveInput({ title: 'Тихий дом', premise: 'Дом слушает.', chapter_count: 1 } as any);
    store.log('models', 'deepseek', '2026-10-01T10:00:00.000Z');
    const saved = snapshotProject(store);
    const reopened = new MemoryProjectStore();
    restoreSnapshot(reopened, saved);
    expect(reopened.runLog()[0].at).toBe('2026-10-01T10:00:00.000Z');
    expect(snapshotProject(reopened).files).toEqual(saved.files);
  });
});
