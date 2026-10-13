import { describe, expect, it } from 'vitest';
import { discoverContinuity, discoveryPrompt, manuscriptPassages, readDiscovery } from '../utils/novel/v3/continuityDiscovery';

const passages = manuscriptPassages([{ chapter: 2, text: 'The key was in the bag.' }, { chapter: 1, text: 'The key stayed in the box.\n\nNora went out.' }]);
const finding = { verdict: 'error', evidence: [{ passage: 'ch1:p1', quote: 'key stayed in the box', source: 'narration' }, { passage: 'ch2:p1', quote: 'key was in the bag', source: 'narration' }], reason: 'The key is in incompatible locations.' };

describe('blind full-manuscript discovery', () => {
  it('supplies every chapter in order with stable paragraph references and no marked suspect', async () => {
    expect(passages.map(p => p.id)).toEqual(['ch1:p1', 'ch1:p2', 'ch2:p1']);
    await discoverContinuity(passages, async (prompt, _system, options) => {
      expect(prompt).toBe(discoveryPrompt(passages));
      expect(prompt).toContain(JSON.stringify(passages));
      expect(prompt).not.toContain('expected');
      expect(options?.stage).toBe('continuity-discovery');
      return '{"findings":[]}';
    });
  });
  it('retains valid findings and explicitly rejects hallucinated or shortened quotes', () => {
    const report = readDiscovery(JSON.stringify({ findings: [finding, { ...finding, evidence: [finding.evidence[0], { ...finding.evidence[1], quote: 'key was...bag' }] }] }), passages);
    expect(report.findings).toEqual([finding]);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0].index).toBe(1);
  });
  it('accepts an empty result but not a missing assessment or invalid source inventory', () => {
    expect(readDiscovery('{"findings":[]}', passages)).toEqual({ findings: [], dropped: [], rejected: [] });
    expect(() => readDiscovery('{}', passages)).toThrow('findings');
    expect(() => manuscriptPassages([{ chapter: 1, text: '' }])).toThrow();
    expect(() => manuscriptPassages([{ chapter: 1, text: 'One.' }, { chapter: 1, text: 'Other.' }])).toThrow();
  });
  it('does not retry a failed reading or turn it into an empty finding list', async () => {
    let calls = 0;
    await expect(discoverContinuity(passages, async () => { calls++; throw new Error('token limit'); })).rejects.toThrow('token limit');
    expect(calls).toBe(1);
  });
});
