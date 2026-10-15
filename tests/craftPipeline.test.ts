import { legacyStore } from './fixtures/legacyCraft';
import { cleanAuditJSON } from './fixtures/baselineAudit';
import { describe, expect, it } from 'vitest';
import { runCraftBook } from '../utils/novel/craft/craftOrchestrator';
import { preflightPacket, validatePacket, projectPacket, parsePreflightAssessment } from '../utils/novel/craft/projection';
import { bookLayout, projectionMetrics, wordPositions, openingWindow } from '../utils/novel/craft/metrics';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { reviewManuscript } from '../utils/novel/craft/editorial';
import { authorKey } from '../utils/novel/author';

const packet = () => ({ names: { protagonist: 'Nora' }, initialProtagonistKnowledge: [], facts: [], scenes: [{ id: 'SC1', chapter: 1, order: 1, time: 'noon', location: 'house', causalLink: 'therefore' as const, conflict: { external: 'locked door', interpersonal: 'guard', internal: 'fear' }, valueCharge: { start: 'safety', end: 'danger', shift: '+ to -' as const }, purpose: 'escape', action: 'opens door', choice: 'escape', cost: 'key', change: 'danger', dialogueAims: {}, rhythm: 'action', readerBefore: 'why', readerAfter: 'who', dependsOn: [], povKnows: [], newFacts: [], props: [], openLoopsIntroduced: ['who'], propAnchors: [{ name: 'key', role: 'setup' as const }] }].flatMap(scene => Array.from({ length: 3 }, (_, i) => ({ ...scene, id: `SC${i + 1}`, order: i + 1 }))) });
const input = { premise: 'Nora escapes.', genre: 'thriller', author_requirements: '', chapter_count: 1, target_total_words: 1200 };
describe('craft production contracts', () => {
  it('repairs a preflight problem and audits the corrected packet before drafting', async () => {
    let audits = 0;
    const result = await preflightPacket(packet(), input.premise, '', 1, async (prompt, _s, options) => {
      if (options?.stage === 'craft-preflight-repair') { const p = packet(); p.scenes[0].action = 'takes key and opens door'; return JSON.stringify({ sceneChanges: p.scenes, factChanges: [] }); }
      audits++;
      return JSON.stringify({ issues: prompt.includes('takes key') ? [] : [{ status: 'demonstrated', reason: 'Missing key', sources: ['SC1'] }] });
    }, () => {});
    expect(audits).toBe(2);
    expect(result.scenes[0].action).toContain('takes key');
  });
  it('rejects invalid packets and stops on demonstrated contradictions after repair', async () => {
    const p = packet(); p.scenes[0].povKnows = ['future'];
    expect(() => validatePacket(p, 1)).toThrow('knowledge');
    expect(() => validatePacket(packet(), 2)).toThrow('Every chapter');
    await expect(preflightPacket(packet(), '', '', 1, async (_p, _s, options) => options?.stage === 'craft-preflight-repair' ? JSON.stringify(packet()) : JSON.stringify({ issues: [{ status: 'demonstrated', reason: 'Unexplained access', sources: ['SC1'] }] }), () => {})).rejects.toThrow('Preflight remains unresolved');
  });
  it('can repair initial knowledge and persists the actual corrected packet', async () => {
    const saved: any[] = [];
    const result = await preflightPacket(packet(), '', '', 1, async (prompt, _s, options) => {
      if (options?.stage === 'craft-preflight-repair') return JSON.stringify({ sceneChanges: [], factChanges: [], initialProtagonistKnowledge: ['The desk issued two separately logged credentials.'], dossierClarifications: 'Each visitor needs their own credential.' });
      return JSON.stringify({ issues: prompt.includes('separately logged') ? [] : [{ status: 'uncertain', reason: 'Access not specified', sources: ['initialProtagonistKnowledge'] }] });
    }, (_raw, candidate) => saved.push(candidate));
    expect(result.initialProtagonistKnowledge[0]).toContain('separately logged');
    expect(saved.at(-1).initialProtagonistKnowledge).toEqual(result.initialProtagonistKnowledge);
    expect(result.preflight!.issues).toEqual([]);
  });
  it('keeps the last valid plan when preflight or its repair is unavailable', async () => {
    const saved: any[] = [];
    await expect(preflightPacket(packet(), '', '', 1, async () => { throw new Error('offline'); }, (_r, p) => saved.push(p))).rejects.toThrow('Preflight unavailable');
    expect(saved.at(-1).scenes).toEqual(packet().scenes);
    expect(saved.at(-1).preflight.failures[0]).toContain('offline');
    await expect(preflightPacket(packet(), '', '', 1, async (_p, _s, options) => options?.stage === 'craft-preflight-repair' ? '{}' : JSON.stringify({ issues: [{ status: 'uncertain', reason: 'Access', sources: ['SC1'] }] }), (_r, p) => saved.push(p))).rejects.toThrow('repair unavailable');
    expect(saved.at(-1).scenes).toEqual(packet().scenes);
  });
  it('continues a saved plan after preflight objections without regenerating it', async () => {
    const store = legacyStore(input, packet());
    store.saveAuthor({ version: 1, input_key: authorKey(input), clock: '', plan: '', chapters: [], waiting: '', noticed: [], completed: false, desk: { files: { 'dossier.md': 'TITLE: Saved Story', 'packet.json': JSON.stringify(packet()) }, answers: [], journal: [], step: 0, budget: 100, spent: 0, finished: false } });
    let written = false;
    await runCraftBook(input, store, async (prompt, _s, options) => {
      if (['craft-preparation', 'craft-cards'].includes(options?.stage || '')) throw new Error('Must reuse saved plan');
      if (options?.stage === 'craft-preflight') return JSON.stringify({ issues: [{ status: 'uncertain', reason: 'Access needs clarification', sources: ['SC1'] }] });
      if (options?.stage === 'craft-preflight-repair') return '{"sceneChanges":[],"factChanges":[]}';
      if (options?.stage === 'craft-write') { expect(prompt).not.toContain('Access needs clarification'); written = true; return 'Repaired scene. ' + 'word '.repeat(390); }
      if (options?.stage === 'craft-observe') return JSON.stringify({ event: { status: 'enacted', sources: [`${prompt.match(/"id":"(SC\d+)"/)![1]}-p1`], reason: 'yes' }, tangibleActionEnacted: true, valueChargeTurned: true, facts: [], issues: [], wordCount: 392 });
      return cleanAuditJSON;
    }, () => {});
    expect(written).toBe(true);
    expect(store.manuscript()).toHaveLength(1);
    expect(store.loadAuthor()!.desk!.files['preflight.json']).toContain('Access needs clarification');
  });
  it('rechecks repaired scene prose and runs final editorial audits on the saved revision', async () => {
    const store = legacyStore(input, packet());
    const original = 'Original scene. ' + 'word '.repeat(390);
    const repaired = 'Repaired scene. ' + 'word '.repeat(390);
    const observerTexts: string[] = [];
    await runCraftBook(input, store, async (prompt, _s, options) => {
      switch (options?.stage) {
        case 'craft-preparation': return 'TITLE: The Door';
        case 'craft-cards': return JSON.stringify(packet());
        case 'craft-preflight': return '{"issues":[]}';
        case 'craft-write': return original;
        case 'craft-repair': return repaired;
        case 'craft-observe': { const id = prompt.match(/"id":"(SC\d+)"/)![1]; observerTexts.push(prompt); return JSON.stringify({ event: { status: 'enacted', sources: [`${id}-p1`], reason: '' }, tangibleActionEnacted: true, valueChargeTurned: id !== 'SC1' || prompt.includes('Repaired scene.'), facts: [], issues: [], wordCount: 392 }); }
        case 'craft-reader': return '{}';
        default: return cleanAuditJSON;
      }
    }, () => {});
    expect(observerTexts).toHaveLength(4);
    expect(observerTexts[0]).toContain('Original scene.');
    expect(observerTexts[1]).toContain('Repaired scene.');
    expect(observerTexts[1]).not.toContain('Original scene.');
    expect(store.manuscript()[0].text).toBe([repaired, original, original].join('\n\n'));
    expect(store.loadReport()!.status).toBe('COMPLETE');
    expect(store.loadAuthor()!.desk!.files['scene-1-receipt.json']).toContain('"valueChargeTurned":true');
  });
  it('scales scene sizes with the requested book rather than capping them at 650 words', () => {
    const layout = bookLayout(30, 90000);
    expect(layout.wordsPerScene).toBeGreaterThan(650);
    expect(layout.scenes * layout.wordsPerScene).toBeCloseTo(90000, -2);
    expect(projectionMetrics(packet()).unresolvedLoops).toEqual(['who']);
    const positions = wordPositions([{ chapter: 1, text: 'a b' }, { chapter: 2, text: 'c d e f g h' }]);
    expect(positions.chapters[1].fromPercent).toBe(25);
    const sample = openingWindow([{ chapter: 1, text: 'word '.repeat(1000) }]);
    expect(sample.firstPage.split(' ')).toHaveLength(250);
    expect(sample.firstTenPercent.split(' ')).toHaveLength(100);
  });
  it('batches full-novel projections without losing chapters or scenes', async () => {
    let batches = 0;
    const projected = await projectPacket('plan', 'system', 56, 30, async (prompt, _s, options) => {
      expect(options!.maxTokens).toBeLessThanOrEqual(12000);
      const [_, first, last] = prompt.match(/ONLY scene orders (\d+)\.\.(\d+)/)!;
      batches++;
      return JSON.stringify({ ...packet(), scenes: Array.from({ length: Number(last) - Number(first) + 1 }, (_, i) => {
        const order = Number(first) + i;
        return { ...packet().scenes[0], id: `SC${order}`, order, chapter: Math.floor((order - 1) * 30 / 56) + 1 };
      }) });
    });
    validatePacket(projected, 30, 56);
    expect(batches).toBe(7);
    expect(new Set(projected.scenes.map(s => s.chapter)).size).toBe(30);
  });
  it('locates structural beats from exact source words and rejects invented landmarks', async () => {
    const r = await reviewManuscript(input, [{ chapter: 1, text: 'one two three four' }], 'structure', async () => JSON.stringify({ issues: [], landmarks: [{ name: 'midpoint', chapter: 1, quote: 'three' }, { name: 'climax', chapter: 1, quote: 'invented' }] }));
    expect(r.landmarks![0].percent).toBe(50);
    expect(r.failures).toHaveLength(1);
  });
  it('resiliently normalizes diverse preflight assessment formats without throwing', () => {
    const p = packet();
    // Handles array directly, string source, capitalized status, extra source names
    const raw = JSON.stringify([
      { status: 'Demonstrated', reason: 'SC1 causal break', sources: ['SC1', 'arbitrary_tag'] },
      { status: 'Warning', description: 'SC2 minor ambiguity', source: 'SC2' },
      { status: 'uncertain', reason: 'general note with SC3 in text', sources: ['unknown_tag'] }
    ]);
    const res = parsePreflightAssessment(raw, p);
    expect(res.issues).toHaveLength(3);
    expect(res.issues[0].status).toBe('demonstrated');
    expect(res.issues[0].sources).toEqual(['SC1']);
    expect(res.issues[1].status).toBe('uncertain');
    expect(res.issues[1].sources).toEqual(['SC2']);
    expect(res.issues[2].sources).toEqual(['SC3']);

    // Handles { status: "ok" }
    expect(parsePreflightAssessment('{"status":"ok"}', p).issues).toEqual([]);
  });
});
