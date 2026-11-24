import { legacyStore } from './fixtures/legacyCraft';
import { cleanAuditJSON } from './fixtures/baselineAudit';
import { describe, expect, it } from 'vitest';
import { observeScene } from '../utils/novel/craft/observer';
import { runCraftBook } from '../utils/novel/craft/craftOrchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { authorKey } from '../utils/novel/author';

const broken = '{"event":{"status":"enacted","sources":["SC1-p1","SC1-p2","SC1-p3"';
const prose = 'Nora opened the door. ' + 'word '.repeat(390);
const receipt = { event: { status: 'enacted', sources: ['SC1-p1'], reason: 'Door opened.' }, tangibleActionEnacted: true, valueChargeTurned: true, facts: [], issues: [], wordCount: 0 };
const input = { premise: 'Nora escapes.', genre: 'thriller', author_requirements: '', chapter_count: 1, target_total_words: 1200 };
const packet = { names: { protagonist: 'Nora' }, initialProtagonistKnowledge: [], facts: [], scenes: [{ id: 'SC1', chapter: 1, order: 1, action: 'opens door', choice: 'escape', change: 'outside', purpose: 'escape', causalLink: 'therefore', conflict: { external: 'door', interpersonal: 'guard', internal: 'fear' }, valueCharge: { start: 'safe', end: 'danger', shift: '+ to -' }, dependsOn: [], povKnows: [], newFacts: [] }].flatMap(scene => Array.from({ length: 3 }, (_, i) => ({ ...scene, id: `SC${i + 1}`, order: i + 1 }))) };
const clean = cleanAuditJSON;

describe('observer protocol recovery', () => {
  it('retries the user-reported truncated JSON once with a compact schema and the same budget', async () => {
    let calls = 0;
    const result = await observeScene(async (prompt, _system, options) => {
      expect(options!.maxTokens).toBe(4000);
      expect((options!.schema as any).properties.event.properties.sources.maxItems).toBe(3);
      if (++calls === 1) return broken;
      expect(prompt).toContain('PROTOCOL RECOVERY');
      return JSON.stringify(receipt);
    }, 'Scene data', prose, 'SC1');
    expect(result.attempts).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.receipt!.event.status).toBe('enacted');
    expect(result.receipt!.wordCount).toBeGreaterThan(390);
  });
  it('does not manufacture a passing assessment after malformed replies or transport errors', async () => {
    let calls = 0;
    const result = await observeScene(async () => { if (++calls === 1) throw new Error('output limit'); return broken; }, 'Scene data', prose, 'SC1');
    expect(calls).toBe(2);
    expect(result.receipt).toBeUndefined();
    expect(result.failures).toHaveLength(2);
  });
  it('saves scene prose before observing and stops safely if recovery fails', async () => {
    const store = legacyStore(input, packet);
    let observed = 0, finalized = false;
    await expect(runCraftBook(input, store, async (_prompt, _system, options) => {
      switch (options!.stage) {
        case 'craft-preparation': return 'TITLE: The Door';
        case 'craft-cards': return JSON.stringify(packet);
        case 'craft-preflight': return '{"issues":[]}';
        case 'craft-write': return prose;
        case 'craft-observe':
          expect(store.manuscript()[0].text).toBe(prose);
          expect(store.loadAuthor()!.desk!.files['scene-1.md']).toBe(prose);
          observed++; return broken;
        case 'craft-beta-reader': finalized = true; return clean;
        default: return clean;
      }
    }, () => {})).rejects.toThrow('observer unavailable after recovery');
    expect(observed).toBe(2);
    expect(finalized).toBe(false);
    expect(store.loadReport()).toBeNull();
    expect(store.manuscript()[0].text).toBe(prose);
    expect(JSON.parse(store.loadAuthor()!.desk!.files['scene-1-state.json']).phase).toBe('written');
    expect(store.loadAuthor()!.desk!.files['scene-1-receipt.json']).toBeUndefined();
  });
  it('continues a saved pending scene without regenerating the plan or its prose', async () => {
    const store = legacyStore(input, packet);
    store.saveAuthor({ version: 1, input_key: authorKey(input), clock: '', plan: '', chapters: [{ text: prose, card: '', facts: '', reader: '' }], waiting: '', noticed: [], completed: false, desk: { files: { 'dossier.md': 'TITLE: The Door', 'packet.json': JSON.stringify(packet), 'scene-1.md': prose, 'scene-2.md': prose, 'scene-3.md': prose, 'scene-1-state.json': JSON.stringify({ sceneId: 'SC1', phase: 'written' }) }, answers: [], journal: [], step: 0, budget: 100, spent: 0, finished: false } });
    store.saveManuscript(1, prose);
    await runCraftBook(input, store, async (prompt, _system, options) => {
      if (['craft-preparation', 'craft-cards', 'craft-preflight', 'craft-write'].includes(options!.stage!)) throw new Error('Must reuse saved scene');
      return options!.stage === 'craft-observe' ? JSON.stringify({ ...receipt, event: { ...receipt.event, sources: [`${prompt.match(/"id":"(SC\d+)"/)![1]}-p1`] } }) : clean;
    }, () => {});
    expect(store.manuscript()[0].text).toBe([prose, prose, prose].join('\n\n'));
    expect(store.loadReport()!.status).toBe('COMPLETE');
  });
  it('defers unresolved observer findings after repair to whole-book revision and continues generation', async () => {
    const store = legacyStore(input, packet);
    let repaired = 0;
    const observationWithIssue = {
      event: { status: 'enacted', sources: ['SC1-p1'], reason: 'Door opened.' },
      tangibleActionEnacted: true,
      valueChargeTurned: false,
      facts: [],
      issues: [{ reason: 'Turn not fully tangible', sources: ['SC1-p1'] }],
      wordCount: 400
    };
    await runCraftBook(input, store, async (_prompt, _system, options) => {
      switch (options!.stage) {
        case 'craft-preparation': return 'TITLE: The Door';
        case 'craft-cards': return JSON.stringify(packet);
        case 'craft-preflight': return '{"issues":[]}';
        case 'craft-write': return prose;
        case 'craft-repair': repaired++; return prose;
        case 'craft-observe': {
          const id = _prompt.match(/"id":"(SC\d+)"/)?.[1] || 'SC1';
          return JSON.stringify({
            event: { status: 'enacted', sources: [`${id}-p1`], reason: 'Door opened.' },
            tangibleActionEnacted: true,
            valueChargeTurned: false,
            facts: [],
            issues: [{ reason: 'Turn not fully tangible', sources: [`${id}-p1`] }],
            wordCount: 400
          });
        }
        default: return clean;
      }
    }, () => {});
    expect(repaired).toBe(3);
    expect(store.loadAuthor()!.desk!.files['scene-1-unresolved.json']).toBeDefined();
    expect(store.loadAuthor()!.desk!.files['deferred-work.json']).toContain('Turn not fully tangible');
    expect(store.loadReport()!.status).toBe('COMPLETE');
  });
});
