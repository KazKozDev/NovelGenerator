import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOCAL_EMBEDDER,
  createLocalEmbedder,
  meanPool,
  normalize,
  sharedLocalEmbedder,
} from '../utils/novel/localEmbedder';
import { contradictionFindings, createNLIScorer, scanChapterContradictions, softmax } from '../utils/novel/nli';
import { arcTravel, createEmotionScorer, dominantEmotion, emotionVariety, sigmoid, topEmotions } from '../utils/novel/emotion';
import { createZeroShotClassifier, rankEntailments } from '../utils/novel/zeroShot';
import { createLanguageIdentifier, languageMatches, shortCode } from '../utils/novel/languageId';
import { chunkForSummary, createSummarizer } from '../utils/novel/summarizer';
import { loadWithFallback, progressOptions } from '../utils/novel/modelProgress';

describe('local model math', () => {
  it('pools a mask the tokenizer returned as int64, which arrives as BigInt', () => {
    // A live run lost its repetition check to `Cannot mix BigInt and other types` one revision after
    // the check had finally started working; the mask is 0 and 1, so it is converted, not trusted.
    const pooled = meanPool([[[1, 2], [3, 4], [100, 100]]], [[1n, 1n, 0n] as never]);
    expect(pooled).toEqual([[2, 3]]);
  });

  it('mean-pools with the mask so padding never votes', () => {
    const pooled = meanPool(
      [[[1, 2], [3, 4], [100, 100]]],
      [[1, 1, 0]],
    );
    expect(pooled).toEqual([[2, 3]]);
  });

  it('normalizes to unit length and survives a zero vector', () => {
    const unit = normalize([3, 4]);
    expect(unit[0]).toBeCloseTo(0.6);
    expect(unit[1]).toBeCloseTo(0.8);
    expect(normalize([0, 0])).toEqual([0, 0]);
  });

  it('softmax is a distribution peaking at the largest logit', () => {
    const probs = softmax([2, 1, 0]);
    expect(probs.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(probs[0]).toBeGreaterThan(probs[1]);
    expect(softmax([])).toEqual([]);
  });

  it('sigmoid centers at one half', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5);
    expect(sigmoid(10)).toBeGreaterThan(0.99);
  });
});

/**
 * Every local model on the one worker. What is asserted is the division of labour: the worker is asked
 * for logits, vectors or text, and every label order, softmax, sigmoid, pooling and ranking rule is
 * still applied here — so moving inference off the page cannot quietly change a verdict.
 */
describe('every local model on the one worker', () => {
  const onWorker = async <T>(reply: (message: any) => object, body: () => Promise<T>): Promise<{ sent: any[]; result: T }> => {
    const sent: any[] = [];
    let listener: ((event: MessageEvent) => void) | undefined;
    class FakeWorker {
      addEventListener(type: string, handler: (event: MessageEvent) => void) { if (type === 'message') listener = handler; }
      postMessage(message: any) {
        sent.push(message);
        listener?.({ data: { id: message.id, ...reply(message) } } as MessageEvent);
      }
    }
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', FakeWorker);
    // The body imports the module under test, so the reset is what makes each case its own worker:
    // a graph held from before the stub would keep the previous case's client and its message log.
    vi.resetModules();
    try {
      return { sent, result: await body() };
    } finally {
      vi.unstubAllGlobals();
    }
  };

  it('scores contradictions from logits, keeping this checkpoint\'s label order on the page', async () => {
    const { sent, result } = await onWorker(() => ({ logits: [4, 1, 0] }), async () => {
      const { createNLIScorer: fresh } = await import('../utils/novel/nli');
      return fresh('nli-model')('The clerk is dead.', 'The clerk poured the tea.');
    });
    expect(sent[0]).toMatchObject({ task: 'pair-logits', model: 'nli-model', text: 'The clerk is dead.', pair: 'The clerk poured the tea.' });
    // contradiction, entailment, neutral — softmax of [4,1,0] applied here, not in the worker.
    expect(result.contradiction).toBeCloseTo(softmax([4, 1, 0])[0]);
    expect(result.contradiction).toBeGreaterThan(result.entailment);
    expect(result.neutral).toBeCloseTo(softmax([4, 1, 0])[2]);
  });

  it('ranks zero-shot labels by the entailment position BART uses, one pair per label', async () => {
    const { sent, result } = await onWorker(
      message => ({ logits: message.pair.includes('thriller') ? [0, 0, 5] : [5, 0, 0] }),
      async () => {
        const { createZeroShotClassifier: fresh } = await import('../utils/novel/zeroShot');
        return fresh('zs-model')('A body in the lighthouse.', ['romance', 'thriller']);
      },
    );
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ task: 'pair-logits', model: 'zs-model' });
    expect(sent[1].pair).toContain('thriller');
    expect(result[0].label).toBe('thriller');
    expect(result[0].score).toBeGreaterThan(0.9);
    expect(result[1].score).toBeLessThan(0.1);
  });

  it('reads the top language label out of the worker\'s own id2label', async () => {
    const { sent, result } = await onWorker(() => ({ logits: [0.1, 6], labels: ['en', 'ru'] }), async () => {
      const { createLanguageIdentifier: fresh } = await import('../utils/novel/languageId');
      const identify = fresh('lang-model');
      const guess = await identify('Она поставила чемодан на ступень.');
      // An empty text never starts an inference.
      expect((await identify('   ')).label).toBe('unknown');
      return guess;
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ task: 'text-logits', model: 'lang-model' });
    expect(result.label).toBe('ru');
    expect(result.score).toBeGreaterThan(0.9);
  });

  it('squashes emotions with a sigmoid on this side, and names them from the worker labels', async () => {
    const { sent, result } = await onWorker(() => ({ logits: [3, -3], labels: ['grief', 'joy'] }), async () => {
      const { createEmotionScorer: fresh } = await import('../utils/novel/emotion');
      return fresh('emotion-model')('He read it twice and said nothing.');
    });
    expect(sent[0]).toMatchObject({ task: 'text-logits', model: 'emotion-model' });
    expect(result.labels).toEqual(['grief', 'joy']);
    expect(result.scores[0]).toBeCloseTo(sigmoid(3));
    expect(dominantEmotion(result)).toBe('grief');
  });

  it('passes on what the worker says about itself, and ends it when it holds nothing', async () => {
    const said: string[] = [];
    let terminated = 0;
    let emit: ((message: object) => void) | undefined;
    class FakeWorker {
      addEventListener(type: string, handler: (event: MessageEvent) => void) {
        if (type === 'message') emit = message => handler({ data: message } as MessageEvent);
      }
      postMessage(message: { id: number }) { emit?.({ id: message.id, logits: [1] }); }
      terminate() { terminated++; }
    }
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', FakeWorker);
    vi.resetModules();
    try {
      const { localModelWorker, reportLocalModels } = await import('../utils/novel/modelProgress');
      reportLocalModels(message => said.push(message));
      const client = localModelWorker()!;
      await client.pairLogits('m', 'a', 'b');
      // id 0 is the worker speaking for itself: a device notice answers no question and rejects none.
      emit!({ id: 0, notice: 'm is running on the GPU' });
      emit!({ id: 0, notice: 'released an idle model after 130s' });
      expect(said).toEqual(['m is running on the GPU', 'released an idle model after 130s']);
      expect(terminated).toBe(0);
      // Nothing loaded and nothing pending: the heap goes back with the thread.
      emit!({ id: 0, idle: true });
      expect(terminated).toBe(1);
      // And the next question builds a new one rather than posting into a dead worker.
      await expect(client.pairLogits('m', 'a', 'b')).resolves.toEqual([1]);
      expect(terminated).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('embeds a whole batch in one question, and never starts a worker for nothing', async () => {
    const { sent, result } = await onWorker(message => ({ vectors: message.inputs.map(() => [1, 0]) }), async () => {
      const { createLocalEmbedder: fresh } = await import('../utils/novel/localEmbedder');
      const embed = fresh('embed-model');
      expect(await embed([])).toEqual([]);
      return embed(['a paragraph', 'another']);
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ task: 'embed', model: 'embed-model', inputs: ['a paragraph', 'another'] });
    expect(result).toEqual([[1, 0], [1, 0]]);
  });

  it('scores reranker pairs one at a time, at the precision its thresholds were fitted on', async () => {
    const { sent, result } = await onWorker(message => ({ logits: [message.text === 'first' ? 4.6 : 2.2] }), async () => {
      const { createReranker: fresh } = await import('../utils/novel/reranker');
      return fresh('rerank-model', 'fp32')([['first', 'earlier one'], ['second', 'earlier two']]);
    });
    expect(sent).toHaveLength(2);
    // Named, not negotiated: a silent fall back to int8 would move the line this check decides on.
    expect(sent[0]).toMatchObject({ task: 'pair-logits', model: 'rerank-model', text: 'first', pair: 'earlier one', dtype: 'fp32' });
    expect(result).toEqual([4.6, 2.2]);
  });

  it('summarizes chunk by chunk, and the chunking stays on the page', async () => {
    const long = ['a'.repeat(2500), 'b'.repeat(2500)].join('\n\n');
    const { sent, result } = await onWorker(message => ({ text: `summary of ${message.text[0]}` }), async () => {
      const { createSummarizer: fresh } = await import('../utils/novel/summarizer');
      return fresh('sum-model')(long, 64);
    });
    expect(chunkForSummary(long)).toHaveLength(2);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ task: 'generate', model: 'sum-model', maxNewTokens: 64 });
    expect(result).toBe('summary of a summary of b');
  });
});

describe('model factories', () => {
  it('builds embedders lazily and memoizes one per model', () => {
    expect(typeof createLocalEmbedder()).toBe('function');
    expect(sharedLocalEmbedder()).toBe(sharedLocalEmbedder());
    expect(sharedLocalEmbedder(DEFAULT_LOCAL_EMBEDDER)).toBe(sharedLocalEmbedder());
    expect(sharedLocalEmbedder('other-model')).not.toBe(sharedLocalEmbedder());
  });

  it('builds NLI and emotion scorers without loading weights', () => {
    expect(typeof createNLIScorer()).toBe('function');
    expect(typeof createEmotionScorer()).toBe('function');
    expect(typeof createZeroShotClassifier()).toBe('function');
    expect(typeof createLanguageIdentifier()).toBe('function');
    expect(typeof createSummarizer()).toBe('function');
  });

  it('forwards download progress only when observed', () => {
    expect(progressOptions()).toEqual({});
    const onProgress = () => {};
    expect(progressOptions(onProgress)).toEqual({ progress_callback: onProgress });
  });

  it('retries a broken quantized download in fp32 and names the model', async () => {
    const seen: string[] = [];
    const value = await loadWithFallback('test-model', async dtype => {
      seen.push(dtype);
      if (dtype === 'q8') throw new Error('Missing required scale');
      return 'fp32-ok';
    });
    expect(value).toBe('fp32-ok');
    expect(seen).toEqual(['q8', 'fp32']);
    await expect(loadWithFallback('test-model', async () => {
      throw new Error('Missing required scale');
    })).rejects.toThrow(/test-model/);
  });
});

describe('NLI contradiction findings', () => {
  const scorer = vi.fn(async (premise: string) => ({
    contradiction: premise.includes('Prague') ? 0.95 : 0.1,
    entailment: 0.05,
    neutral: 0.05,
  }));

  it('keeps hits above threshold, highest first, skipping blanks', async () => {
    const findings = await contradictionFindings(
      ['Thorne is in Prague', '', 'The letter is burned'],
      ['Thorne never left Paris', 'A quiet morning passes'],
      scorer,
      0.8,
    );
    expect(findings).toHaveLength(2);
    expect(findings.every(finding => finding.claim === 'Thorne is in Prague' && finding.contradiction === 0.95)).toBe(true);
    expect(scorer.mock.calls.every(([premise]) => premise.trim())).toBe(true);
    expect(scorer.mock.calls.some(([premise]) => premise === '')).toBe(false);
  });
});

describe('canon scan orchestration', () => {
  it('scores chapter sentences against short canon claims', async () => {
    const scorer = vi.fn(async (claim: string, sentence: string) => ({
      contradiction: claim.includes('Prague') && sentence.includes('Paris') ? 0.9 : 0.1,
      entailment: 0.05,
      neutral: 0.05,
    }));
    const findings = await scanChapterContradictions(
      ['Thorne is in Prague'],
      'Thorne swore he had never been to Paris in his entire life before. The harbor bell rang once across the cold water at dawn today.',
      scorer,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].claim).toBe('Thorne is in Prague');
    expect(scorer).toHaveBeenCalledTimes(2);
  });
});

describe('zero-shot ranking and language codes', () => {
  it('ranks labels by entailment without a labeled dataset', () => {
    expect(rankEntailments([
      { label: 'romance', score: 0.2 },
      { label: 'thriller', score: 0.7 },
    ])).toEqual([
      { label: 'thriller', score: 0.7 },
      { label: 'romance', score: 0.2 },
    ]);
  });

  it('reduces model labels to codes and compares with story language', () => {
    expect(shortCode('en_US')).toBe('en');
    expect(shortCode('eng')).toBe('en');
    expect(shortCode('English')).toBe('en');
    expect(languageMatches('en', 'English')).toBe(true);
    expect(languageMatches('ru', 'English')).toBe(false);
    expect(languageMatches('rus', 'ru')).toBe(true);
  });
});

describe('summary chunking', () => {
  it('packs paragraphs greedily and never emits empties', () => {
    const sentence = (seed: string, n: number) => `${Array.from({ length: 10 }, (_, i) => `${seed}${n}-${i}`).join(' ')}.`;
    const para = (seed: string) => Array.from({ length: 30 }, (_, n) => sentence(seed, n)).join(' ');
    const chunks = chunkForSummary(`${para('a')}\n\n${para('b')}`, 1200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.trim().length > 0 && chunk.length <= 1250)).toBe(true);
    expect(chunks.join(' ')).toContain('a0-0');
    expect(chunkForSummary('   ')).toEqual([]);
  });
});

describe('emotion metrics', () => {
  it('ranks emotions and measures whether a chapter feels anything', () => {
    const flat = { labels: ['joy', 'neutral'], scores: [0.1, 0.9] };
    const felt = { labels: ['joy', 'neutral'], scores: [0.8, 0.2] };
    expect(topEmotions(felt, 1)).toEqual([{ label: 'joy', score: 0.8 }]);
    expect(emotionVariety([])).toBe(0);
    expect(emotionVariety([flat, flat])).toBe(0);
    expect(emotionVariety([flat, felt])).toBeCloseTo(0.5);
    expect(emotionVariety([felt, felt])).toBe(1);
  });

  it('tracks whether the dominant emotion travels across chapters', () => {
    const grief = { labels: ['grief', 'joy'], scores: [0.9, 0.1] };
    const joy = { labels: ['grief', 'joy'], scores: [0.1, 0.9] };
    expect(dominantEmotion(grief)).toBe('grief');
    expect(arcTravel([grief, grief])).toEqual({ dominant: ['grief', 'grief'], traveled: false });
    expect(arcTravel([grief, joy])).toEqual({ dominant: ['grief', 'joy'], traveled: true });
    expect(arcTravel([])).toEqual({ dominant: [], traveled: false });
  });
});
