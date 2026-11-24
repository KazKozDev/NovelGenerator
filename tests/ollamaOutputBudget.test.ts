import { describe, expect, it, vi } from 'vitest';
import { withOllamaOutputRoom } from '../utils/novel/v2/llm';

describe('browser Ollama output budget', () => {
  it('raises small stage limits and retries only truncated answers with twice the room', async () => {
    const ask = vi.fn()
      .mockRejectedValueOnce(new Error('Ollama output reached its token limit; the incomplete response was rejected.'))
      .mockResolvedValueOnce('complete');
    expect(await withOllamaOutputRoom(ask, 8192)).toBe('complete');
    expect(ask.mock.calls).toEqual([[32768, false], [65536, true]]);
  });

  it('preserves larger budgets and never retries unrelated failures', async () => {
    const ask = vi.fn().mockRejectedValue(new Error('503 overloaded'));
    await expect(withOllamaOutputRoom(ask, 80000)).rejects.toThrow('503 overloaded');
    expect(ask.mock.calls).toEqual([[80000, false]]);
  });

  it('stops after one retry without accepting either incomplete answer', async () => {
    const ask = vi.fn().mockRejectedValue(new Error('Ollama output reached its token limit'));
    await expect(withOllamaOutputRoom(ask)).rejects.toThrow('token limit');
    expect(ask).toHaveBeenCalledTimes(2);
  });
});
