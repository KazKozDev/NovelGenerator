import { legacyStore } from './fixtures/legacyCraft';
import { describe, expect, it } from 'vitest';
import { blindWriterContext, readBlind } from '../utils/novel/craft/blindContext';
import { bookLayout } from '../utils/novel/craft/metrics';
import { validatePacket } from '../utils/novel/craft/projection';
import { runCraftBook, type Packet } from '../utils/novel/craft/craftOrchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { authorKey } from '../utils/novel/author';
import { cleanAuditJSON } from './fixtures/baselineAudit';

const packet = (): Packet => ({ names: { protagonist: 'Nora' }, initialProtagonistKnowledge: ['Her front door is locked.'], facts: [
  { id: 'F0', text: 'VISIBLE_INITIAL', learnsAt: 0, kind: 'knowledge', source: 'SECRET_PROVENANCE' },
  { id: 'F1', text: 'VISIBLE_ACQUIRED', learnsAt: 1, kind: 'knowledge', source: 'SECRET_PROVENANCE' },
  { id: 'F3', text: 'SECRET_FINAL_REVEAL', learnsAt: 3, kind: 'knowledge', source: 'plan' },
], scenes: Array.from({ length: 3 }, (_, i) => ({ id: `SC${i + 1}`, chapter: 1, order: i + 1, time: 'noon', location: 'porch', causalLink: 'therefore',
  purpose: 'SECRET_AUTHOR_PURPOSE', readerBefore: 'SECRET_READER_BEFORE', readerAfter: 'SECRET_READER_AFTER',
  writerDirectives: 'Use restrained English prose.', action: 'opens door', choice: 'leave', change: 'outside', cost: 'key', goal: 'escape', rhythm: 'action', dialogueAims: {}, props: ['key'],
  valueCharge: { start: 'safe', end: 'danger', shift: '+ to -' }, conflict: { external: 'lock', interpersonal: 'guard', internal: 'fear' },
  dependsOn: i ? [`SC${i}`] : [], povKnows: ['F0'], newFacts: i === 0 ? ['F1'] : i === 2 ? ['F3'] : [],
})) });
const input = { premise: 'SECRET_PREMISE_ENDING', genre: 'thriller', author_requirements: 'SECRET_AUTHOR_ENDING', chapter_count: 1, target_total_words: 1200 };

describe('restored phased blind architecture', () => {
  it('fixes three chronological scenes per chapter while scaling word budgets', () => {
    expect(bookLayout(5, 10000).scenes).toBe(15);
    expect(bookLayout(30, 90000)).toMatchObject({ scenes: 90, wordsPerScene: 1000 });
    const p = packet();
    validatePacket(p, 1, 3);
    expect(() => validatePacket({ ...p, scenes: p.scenes.slice(0, 2) }, 1, 3)).toThrow('scene count');
    const two = { ...p, scenes: [...p.scenes, ...p.scenes.map(s => ({ ...s, id: `${s.id}b`, order: s.order + 3, chapter: 2, newFacts: [] }))] };
    two.scenes[2].chapter = 2;
    expect(() => validatePacket(two, 2, 6)).toThrow('three consecutive scenes');
  });
  it('rejects future knowledge, missing conflict layers and absent value turns', () => {
    for (const change of [
      (p: Packet) => { p.scenes[0].povKnows.push('F3'); },
      (p: Packet) => { p.scenes[0].conflict!.internal = ''; },
      (p: Packet) => { p.scenes[0].valueCharge.shift = 'flat' as any; },
    ]) {
      const p = packet(); change(p);
      expect(() => validatePacket(p, 1, 3)).toThrow();
    }
  });
  it('allows only current knowledge and scene directives into the blind writer input', () => {
    const p = packet(); p.dossierClarifications = 'SECRET_CLARIFICATIONS';
    p.preflight = { issues: [{ status: 'uncertain', reason: 'SECRET_REVIEW', sources: ['SC3'] }], failures: [] };
    const text = blindWriterContext(p, p.scenes[0], p.facts, p.facts, ['Already published paragraph.'], 'thriller');
    expect(text).toContain('VISIBLE_INITIAL');
    expect(text).toContain('VISIBLE_ACQUIRED');
    expect(text).toContain('Use restrained English prose.');
    expect(text).toContain('Already published paragraph.');
    expect(text).not.toContain('SECRET_');
  });
  it('invokes the blind reader before every writer call and preserves the two audit systems', async () => {
    const calls: string[] = [], store = legacyStore(input, packet());
    const prose = 'Nora left the porch. ' + 'word '.repeat(390);
    await runCraftBook(input, store, async (prompt, _system, options) => {
      calls.push(options!.stage!);
      if (options!.stage === 'craft-preparation') return 'SECRET_DOSSIER';
      if (options!.stage === 'craft-cards') return JSON.stringify(packet());
      if (options!.stage === 'craft-preflight') return '{"issues":[]}';
      if (options!.stage === 'craft-reader') {
        expect(prompt).not.toContain('SECRET_');
        if (!calls.includes('craft-write')) expect(prompt).toContain('No prose yet');
        return '{"hypotheses":[],"expectations":[]}';
      }
      if (options!.stage === 'craft-write') {
        expect(calls.at(-2)).toBe('craft-reader');
        const scene = calls.filter(s => s === 'craft-write').length;
        if (scene < 3) expect(prompt).not.toContain('SECRET_');
        else {
          expect(prompt).toContain('SECRET_FINAL_REVEAL');
          expect(prompt).not.toContain('SECRET_PREMISE_ENDING');
          expect(prompt).not.toContain('SECRET_AUTHOR_ENDING');
          expect(prompt).not.toContain('SECRET_PROVENANCE');
        }
        return prose;
      }
      if (options!.stage === 'craft-observe') {
        const id = prompt.match(/"id":"(SC\d+)"/)![1];
        return JSON.stringify({ event: { status: 'enacted', sources: [`${id}-p1`], reason: 'Left.' }, tangibleActionEnacted: true, valueChargeTurned: true, facts: [], issues: [], wordCount: 394 });
      }
      return cleanAuditJSON;
    }, () => {});
    expect(calls.filter(s => s === 'craft-write')).toHaveLength(3);
    expect(calls.filter(s => s === 'craft-reader')).toHaveLength(4); // three before-scene + original chapter reader
    expect(calls).toContain('craft-dev-review');
    const reviews = store.loadAuthor()!.desk!.answers.map(a => a.text).join('\n');
    expect(reviews).toContain('baseline-developmental');
    expect(reviews).toContain('baseline-literary');
    expect(reviews).toContain('reader-promises');
  });
  it('preserves an existing incompatible manuscript instead of regenerating over it', async () => {
    const store = new MemoryProjectStore(), p = packet(); p.scenes = p.scenes.slice(0, 1);
    store.saveManuscript(1, 'Existing book must survive.');
    store.saveAuthor({ version: 1, input_key: authorKey(input), clock: '', plan: '', chapters: [], waiting: '', noticed: [], completed: false, desk: { files: { 'packet.json': JSON.stringify(p), 'dossier.md': 'Saved dossier' }, answers: [], journal: [], step: 0, budget: 100, spent: 0, finished: false } });
    await expect(runCraftBook(input, store, async () => { throw new Error('Must not call model'); }, () => {})).rejects.toThrow('different scene layout');
    expect(store.manuscript()[0].text).toBe('Existing book must survive.');
  });
  it('gives the reader only already-published prose', async () => {
    await readBlind(['One visible paragraph.'], async (prompt, system) => {
      expect(prompt).toContain('One visible paragraph.');
      expect(system).toContain('blind reader');
      return '{}';
    });
  });
  it('supports dynamic conflict allocation for Swain Action vs Sequel scenes', () => {
    const pAction = packet();
    pAction.scenes[0].sceneType = 'scene';
    pAction.scenes[0].conflict = { external: 'raging fire', interpersonal: 'hostile guard' }; // internal omitted
    expect(() => validatePacket(pAction, 1, 3)).not.toThrow();

    const pSequel = packet();
    pSequel.scenes[0].sceneType = 'sequel';
    pSequel.scenes[0].conflict = { internal: 'paralyzing guilt over betrayal' }; // external omitted
    expect(() => validatePacket(pSequel, 1, 3)).not.toThrow();
  });
  it('delivers dramatic irony and prop camouflage directives into blind writer context', () => {
    const p = packet();
    p.scenes[0].dramaticIrony = { detail: 'A armed tracker waits behind the curtain.', readerVisible: true, characterAware: false };
    p.scenes[0].propAnchors = [{ name: 'brother passport', role: 'setup', camouflage: ['scissors', 'wool scarf'], focusInstruction: 'rule of three' }];
    const text = blindWriterContext(p, p.scenes[0], p.facts, p.facts, ['Recent page.'], 'suspense');
    expect(text).toContain('DRAMATIC IRONY');
    expect(text).toContain('A armed tracker waits behind the curtain.');
    expect(text).toContain('POV Barrier');
    expect(text).toContain('CHEKHOV PROP FOCUS & CAMOUFLAGE');
    expect(text).toContain('brother passport');
    expect(text).toContain('scissors, wool scarf');
  });
});
