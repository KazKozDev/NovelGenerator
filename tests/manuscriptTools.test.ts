import {developmentResponse} from './chapterDevelopment.fixture';
import { QUALITY_KEYS } from '../utils/novel/v2/storyQuality';
import { describe, expect, it } from 'vitest';
import { manuscriptAgent, patchManuscript, readManuscript, searchManuscript } from '../utils/novel/v2/manuscriptTools';
import { Orchestrator } from '../utils/novel/v2/orchestrator';
import { MemoryProjectStore } from '../utils/novel/v2/store';
import { restoreSnapshot, snapshotProject } from '../utils/novel/v2/export';
import type { NovelLLM } from '../utils/novel/v2/llm';
import { allocateThesisWords, readProseReview, readRepairVerification, readCausalPlanReview, validateThesisDraft } from '../utils/novel/v2/theses';
const blocks = [{ id: 'T01', text: 'Марта спрятала письмо.\n\nЕй двадцать лет.' }, { id: 'T02', text: 'Прошло тридцать лет. Марте пятьдесят.' }];
describe('manuscript search and exact editing', () => {
  it('requires a search before editing only when the text to edit is too long to be shown', async () => {
    const long = [{ id: 'T01', text: 'Марта спрятала письмо. ' + 'слово '.repeat(16000) }, blocks[1]];
    const commands = [{ tool: 'finish', text: 'Premature' }, { tool: 'replace', edits: [{ block_id: 'T01', before: 'Марта', after: 'Анна' }] }, { tool: 'search', query: 'письмо' }, { tool: 'finish', text: 'Checked' }];
    let step = 0; let mutations = 0; const prompts: string[] = [];
    const note = await manuscriptAgent(async prompt => { prompts.push(prompt); return JSON.stringify(commands[step++]); }, long, 'Polish', 'System', { stage: 'polish', requireSearch: true, writable: ['T01'], onEdit: () => { mutations++; } });
    expect(note).toBe('Checked'); expect(mutations).toBe(0); expect(step).toBe(4);
    expect(prompts[0]).toContain('Read a writable block before editing it.');
    expect(prompts[0]).not.toContain('CURRENT TEXT OF T01');
  });
  it('does an edit in one answer when the text is shown: no read, no search, patch and finish together', async () => {
    const prompts: string[] = []; let edited = '';
    const note = await manuscriptAgent(async prompt => { prompts.push(prompt); return JSON.stringify({ tool: 'replace', finish: true, edits: [{ block_id: 'T01', before: 'Марта', after: 'Анна' }, { block_id: 'T02', before: 'Марте', after: 'Анне' }] }); },
      blocks, 'Repair the seam', 'System', { stage: 'seam', requireSearch: true, writable: ['T01', 'T02'], onEdit: next => { edited = next.map(block => block.text).join('|'); } });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('Do this task in ONE answer');
    expect(prompts[0]).toContain('CURRENT TEXT OF T01'); expect(prompts[0]).toContain('CURRENT TEXT OF T02');
    expect(prompts[0]).not.toContain('Required first: search');
    expect(edited).toContain('Анна спрятала письмо'); expect(edited).toContain('Анне пятьдесят');
    expect(note).toContain('Editing finished');
  });
  it('asks a writing task for its prose in one answer', async () => {
    const prompts: string[] = [];
    expect(await manuscriptAgent(async prompt => { prompts.push(prompt); return JSON.stringify({ tool: 'finish', text: 'The scene.' }); }, blocks, 'Write', 'System', { stage: 'write' })).toBe('The scene.');
    expect(prompts[0]).toContain('Return what the task asks for in ONE answer');
  });
  it('finds Russian phrases and returns bounded references without sending unrelated blocks', () => {
    expect(searchManuscript(blocks, 'двадцать лет')[0].block_id).toBe('T01');
    expect(searchManuscript(blocks, 'неизвестное')).toEqual([]);
    expect(readManuscript(blocks, 'T01', 0, 10).text).toBe(blocks[0].text.slice(0, 10));
  });
  it('applies atomic insertion, replacement and deletion without touching other text', () => {
    const changed = patchManuscript(blocks, [{ block_id: 'T01', before: 'письмо.', after: 'письмо. Она боялась за брата.' }, { block_id: 'T01', before: 'двадцать', after: 'тридцать' }], ['T01']);
    expect(changed[1]).toEqual(blocks[1]); expect(blocks[0].text).not.toContain('боялась');
    expect(() => patchManuscript(blocks, [{ block_id: 'T01', before: 'Марта', after: 'Анна' }, { block_id: 'T02', before: 'Прошло', after: '' }], ['T01'])).toThrow('block T02 is not writable in this task. Writable: T01');
    expect(() => patchManuscript([{ id: 'T', text: 'a a' }], [{ block_id: 'T', before: 'a', after: 'b' }], ['T'])).toThrow('ambiguous');
    expect(() => patchManuscript(blocks, [{ block_id: 'T01', before: 'stale', after: 'new' }], ['T01'])).toThrow('missing');
  });
  it('rejects empty edits instead of reporting progress', () => {
    expect(() => patchManuscript(blocks, [{ block_id: 'T01', before: 'Марта', after: 'Марта' }], ['T01'])).toThrow('No-op');
  });
  it('reads several commands sent in one answer as one answer, instead of refusing them and paying for another turn', async () => {
    let step = 0; let changed = false;
    const nothing = await manuscriptAgent(async () => { step++; return '{"tool":"replace","edits":[]} {"tool":"finish","text":"Done"}'; },
      blocks, 'Edit', '', { stage: 'edit', onEdit: () => { changed = true; } });
    expect(nothing).toBe('Done'); expect(changed).toBe(false); expect(step).toBe(1);
    let text = '';
    await manuscriptAgent(async () => { step++; return '{"tool":"replace","edits":[{"block_id":"T01","before":"Марта","after":"Анна"}]}\n{"tool":"replace","edits":[{"block_id":"T01","before":"двадцать","after":"тридцать"}]}\n{"tool":"finish"}'; },
      blocks, 'Edit', '', { stage: 'edit', writable: ['T01'], onEdit: next => { text = next[0].text; } });
    expect(text).toContain('Анна спрятала'); expect(text).toContain('тридцать лет'); expect(step).toBe(2);
  });
  it('explicitly ends open-ended editing before the step budget expires', async () => {
    let turns = 0;
    const result = await manuscriptAgent(async prompt => {
      turns++;
      return JSON.stringify(prompt.includes('FINAL TURN') ? { tool: 'finish', text: 'Reviewed' } : { tool: 'read', block_id: 'T01' });
    }, blocks, 'Inspect manuscript', '', { stage: 'polish', maxSteps: 4 });
    expect(result).toBe('Reviewed'); expect(turns).toBe(3);
  });
  it('lets the model search, read and replace with saved history', async () => {
    const commands = [{ tool: 'search', query: 'двадцать' }, { tool: 'read', block_id: 'T01' }, { tool: 'replace', edits: [{ block_id: 'T01', before: 'двадцать', after: 'тридцать' }] }, { tool: 'finish', text: 'Исправлено' }];
    let applied = '';
    await manuscriptAgent(async prompt => { expect(prompt).not.toContain('Прошло тридцать лет'); return JSON.stringify(commands.shift()); }, blocks, 'Correct age', '', { stage: 'edit', writable: ['T01'], onEdit: next => { applied = next[0].text; } });
    expect(applied).toContain('тридцать лет');
  });
});
// These protocol fixtures intentionally contain four-word scenes; length behavior
// is exercised separately with an actual 200-word target below.
const input = { generation_mode: 'progressive' as const, premise: 'A letter is hidden and found.', chapter_count: 1, genre: 'mystery', target_total_words: 4, author_requirements: 'A causal story' };
const thesis = { id: 'T01', chapter: 1, pov_id: 'C', participants: [{ character_id: 'C', intention: 'Protect sibling', knows: ['Letter exists'] }], when: 'Today', where: 'Room', state_before: 'Letter hidden', action: 'Reveal letter', why: 'Save sibling', resistance: 'Fear', outcome: 'Letter revealed', establishes: ['Truth'], reader_learns: ['Motive'], requires: [], writer_task: 'Show choice', target_words: 200 };
describe('code-assigned thesis budgets', () => {
  const plan = { title: 'Letter', premise_givens: [], characters: [{ id: 'C', name: 'Marta', goal: 'Save sibling', initial_knowledge: [], capabilities: [], limitations: [] }], theses: [{ ...thesis, target_words: 1000 }, { ...thesis, id: 'T02', target_words: 2000 }], ending: 'Revealed' };
  it('assigns the exact requested sum without changing events or source data', () => {
    const result = allocateThesisWords(plan, { ...input, target_total_words: 4500 });
    expect(result.theses.map(t => t.target_words)).toEqual([1500, 3000]);
    expect(result.theses[0].action).toBe(thesis.action);
    expect(plan.theses[0].target_words).toBe(1000);
  });
  it('rounds deterministically, remains positive and is idempotent', () => {
    const result = allocateThesisWords(plan, { ...input, target_total_words: 3 });
    expect(result.theses.map(t => t.target_words)).toEqual([1, 2]);
    expect(allocateThesisWords(result, { ...input, target_total_words: 3 })).toEqual(result);
    expect(() => allocateThesisWords({ ...plan, theses: [{ ...thesis, target_words: 0 }] }, input)).toThrow();
    expect(() => allocateThesisWords({ ...plan, ending: '' }, input)).toThrow();
  });
});
function progressiveModel(seen: string[], interrupt = false): NovelLLM {
  let edits = 0;
  let polishTurn = 0;
  return async (_prompt, _system, options) => {
    const stage = options?.stage || ''; seen.push(stage);
    if (stage === 'thesis-chapter-development') return developmentResponse(_prompt);
    if (stage === 'thesis-synopsis') return 'Letter hidden; later revealed to save sibling.';
    if (stage === 'thesis-plan') return JSON.stringify({ title: 'Letter', premise_givens: [input.premise], characters: [{ id: 'C', name: 'Marta', goal: 'Save sibling', initial_knowledge: ['Letter'], capabilities: ['Has letter'], limitations: ['Fear'] }], theses: [thesis], ending: 'Letter revealed' });
    if (stage === 'thesis-rough-reconcile') return JSON.stringify({plan: JSON.parse(_prompt.split('Current plan: ')[1].split('\nCurrent short book:')[0]), account: {timeline:'Letter discovered before rescue',evidence:'Letter proves location',knowledge:'Marta reads letter',framing:'No false accusation',protagonist_choice:'Marta reveals letter to save sibling'}});
    if (stage === 'thesis-rough-verify') {
      const defects = JSON.parse(_prompt.split('Original defects (zero-based issue indices): ')[1].split('\nCURRENT MANUSCRIPT:')[0]);
      return JSON.stringify({ready:true,checks:defects.map((_:unknown,issue:number)=>({issue,status:'repaired',evidence:'@P0001',explanation:'Letter supplies the causal evidence'})),issues:[]});
    }
    if (stage.endsWith('review')) return JSON.stringify({ ready: true, issues: [] });
    if (stage === 'thesis-block-write') return JSON.stringify({ tool: 'finish', text: 'Marta revealed the letter.' });
    if (stage === 'thesis-expand') {
      if (++edits === 1) return JSON.stringify({ tool: 'replace', edits: [{ block_id: 'T01', before: 'revealed', after: 'carefully revealed' }] });
      if (interrupt) throw new Error('Disconnected');
      return JSON.stringify({ tool: 'finish', text: 'Expanded' });
    }
    if (stage === 'thesis-polish' || stage === 'thesis-audit-repair') return JSON.stringify(++polishTurn % 2 ? { tool: 'search', query: 'letter' } : { tool: 'finish', text: 'No further edits needed' });
    return JSON.stringify({ summary: 'Resolved', supported: true, findings: [], checks: { ...Object.fromEntries(QUALITY_KEYS.map(key => [key, { passed: true, evidence: 'Test fixture: letter discovery leads to sibling rescue' }])), transitions: { passed: true, evidence: 'Adjacent scenes connect' }, causality: { passed: true, evidence: 'Letter revealed to save sibling' }, repeated_events: { passed: true, evidence: 'Revelation occurs once' } } });
  };
}
describe('progressive manifestation through exact patches', () => {
  it('delivers a book whose scene stayed short with the shortfall in its report, never as a clean book', async () => {
    const store = new MemoryProjectStore(); const target = {...input,target_total_words:200};
    const base = progressiveModel([]);
    const premature: NovelLLM = async (...args) => args[2]?.stage === 'thesis-expand'
      ? JSON.stringify({tool:'finish',text:'Done'}) : base(...args);
    const first = await new Orchestrator(store).runBook(target,premature);
    expect(first.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(store.runLog().some(entry => entry.detail.includes('T01 stayed short after expansion: 4/200 words'))).toBe(true);
    expect(store.loadReport()!.findings.some(finding => finding.severity === 'major' && finding.reader_impact.includes('has 4 words; target 200'))).toBe(true);
  });
  it('returns final defects to the writer, persists local patches on interruption and re-audits on resume', async () => {
    const store = new MemoryProjectStore(); const seen: string[] = []; const base = progressiveModel(seen);
    let searched = false, patched = false, interrupted = false, audits = 0;
    const duplicate = 'Marta revealed the letter. Marta revealed the letter.';
    const llm: NovelLLM = async (prompt, system, options) => {
      const stage = options?.stage;
      if (stage === 'thesis-block-write') return JSON.stringify({ tool: 'finish', text: duplicate });
      if (stage === 'thesis-expand') return JSON.stringify({ tool: 'finish', text: 'Done' });
      if (stage === 'thesis-final-audit') {
        audits++; const audit = JSON.parse(await base(prompt, system, options));
        if (store.loadTheses()!.blocks[0].text === duplicate) {
          audit.findings = [{ severity: 'major', description: 'The same revelation happens twice.' }];
          audit.checks.repeated_events = { passed: false, evidence: 'Marta reveals the letter twice.' };
        }
        return JSON.stringify(audit);
      }
      if (stage === 'thesis-audit-repair') {
        if (!searched) { searched = true; return JSON.stringify({ tool: 'search', query: 'revealed' }); }
        if (!patched) { patched = true; return JSON.stringify({ tool: 'replace', edits: [{ block_id: 'T01', before: duplicate, after: 'Marta revealed the letter.' }] }); }
        if (!interrupted) { interrupted = true; searched = false; throw new Error('Disconnected after audit patch'); }
        return JSON.stringify({ tool: 'finish', text: 'Duplicate removed' });
      }
      return base(prompt, system, options);
    };
    expect((await new Orchestrator(store).runBook(input, llm)).status).toBe('FAILED');
    expect(store.loadTheses()!.final_repair?.phase).toBe('write');
    expect(store.loadTheses()!.blocks[0].text).toBe('Marta revealed the letter.');
    expect(store.loadTheses()!.edits!.at(-1)!.phase).toBe('audit-repair');
    const result = await new Orchestrator(store).runBook(input, llm);
    expect(result.status, result.stoppedReason).toBe('COMPLETE');
    expect(audits).toBe(2);
    expect(store.loadTheses()!.final_repair?.attempts).toBe(1);
    expect(store.loadTheses()!.final_checks!.repeated_events.passed).toBe(true);
  });
  it('repairs both sides of a seam after expansion and before polish, preserving unrelated text', async () => {
    const store = new MemoryProjectStore(); const stages: string[] = []; let repaired = false;
    const base = progressiveModel([]);
    let interrupted = false;
    const llm: NovelLLM = async (prompt, system, options) => {
      const stage = options?.stage || ''; stages.push(stage);
      if (stage === 'thesis-plan') {
        const plan = JSON.parse(await base(prompt, system, options));
        plan.theses.push({ ...thesis, id: 'T02', requires: ['T01'] });
        return JSON.stringify(plan);
      }
      if (stage === 'thesis-block-write') return JSON.stringify({ tool: 'finish', text: store.loadTheses()!.blocks.length ? 'She was on the roof. Unrelated sentence.' : 'Marta was in the street.' });
      if (stage === 'thesis-expand') return JSON.stringify({ tool: 'finish', text: 'Done' });
      if (stage === 'thesis-seam-review') return JSON.stringify({ ready: false, issues: store.loadTheses()!.blocks[1].text.startsWith('She was on the roof.') ? [{ severity: 'major', kind: 'continuity', evidence: 'She was on the roof.', consequence: 'Her change of location has no transition.', thesis_ids: ['T01', 'T02'], problem: 'Missing transition', required_change: 'Connect street to roof' }] : [] });
      if (stage === 'thesis-seam-repair') {
        if (repaired) {
          if (!interrupted) { interrupted = true; throw new Error('Disconnected after saved seam patch'); }
          return JSON.stringify({ tool: 'finish', text: 'Connected' });
        }
        repaired = true;
        expect(prompt).toContain('Writable blocks: ["T01","T02"]');
        return JSON.stringify({ tool: 'replace', edits: [{ block_id: 'T01', before: 'Marta was in the street.', after: 'Marta was in the street. She entered the stairwell.' }, { block_id: 'T02', before: 'She was on the roof.', after: 'She climbed the stairs and reached the roof.' }] });
      }
      if (stage === 'thesis-polish') {
        expect(prompt).toContain('has been counted by code and is listed below');
        return base(prompt, system, options);
      }
      return base(prompt, system, options);
    };
    const first = await new Orchestrator(store).runBook({ ...input, target_total_words: 8 }, llm);
    expect(first.status).toBe('FAILED');
    expect(store.loadTheses()!.seams!.next).toBe(0);
    expect(store.loadTheses()!.blocks[1].text).toContain('climbed the stairs');
    const restored = new MemoryProjectStore(); restoreSnapshot(restored, snapshotProject(store));
    // Use the original store for fixture observations; restore verification above exercises import.
    expect(() => validateThesisDraft(restored.loadTheses(), { ...input, target_total_words: 8 })).not.toThrow();
    const result = await new Orchestrator(store).runBook({ ...input, target_total_words: 8 }, llm);
    expect(result.status, result.stoppedReason).toBe('COMPLETE');
    expect(stages.indexOf('thesis-seam-review')).toBeGreaterThan(stages.lastIndexOf('thesis-expand'));
    expect(stages.indexOf('thesis-polish')).toBeGreaterThan(stages.lastIndexOf('thesis-seam-review'));
    const draft = store.loadTheses()!;
    expect(draft.seams!.next).toBe(1);
    expect(draft.blocks[1].text).toBe('She climbed the stairs and reached the roof. Unrelated sentence.');
    expect(draft.edits!.some(e => e.phase === 'seam' && e.edits.length === 2)).toBe(true);
    expect(stages.filter(s => s === 'thesis-block-write')).toHaveLength(2);
    expect(stages.filter(s => s === 'thesis-expand')).toHaveLength(2);
    expect(() => validateThesisDraft(draft, { ...input, target_total_words: 8 })).not.toThrow();
  });
  it('does not issue a clean report when a separate final check fails despite supported=true', async () => {
    const store = new MemoryProjectStore(); const base = progressiveModel([]);
    const result = await new Orchestrator(store).runBook(input, async (prompt, system, options) => {
      const raw = await base(prompt, system, options);
      if (options?.stage !== 'thesis-final-audit') return raw;
      const audit = JSON.parse(raw); audit.checks.transitions = { passed: false, evidence: 'Unexplained jump to roof' };
      return JSON.stringify(audit);
    });
    expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(store.runLog().some(entry => entry.detail.includes('Final repair stopped making progress'))).toBe(true);
    expect(store.loadReport()!.findings.some(finding => finding.reader_impact.includes('transitions: Unexplained jump to roof'))).toBe(true);
    expect(store.loadReport()!.central_resolution.supported).toBe(false);
    expect(store.loadTheses()!.final_checks!.transitions.passed).toBe(false);
  });
  it('records malformed reviews, continues prose and retries failed checks before delivery', async () => {
    const store = new MemoryProjectStore(); const seen: string[] = []; const base = progressiveModel(seen);
    const llm: NovelLLM = async (prompt, system, options) => {
      if (options?.stage === 'thesis-expand-review' || options?.stage === 'thesis-polish-review') return JSON.stringify({ issues: [{ severity: 'major', thesis_ids: ['T01'], problem: 'Unsupported claim', required_change: 'Repair' }] });
      return base(prompt, system, options);
    };
    const result = await new Orchestrator(store).runBook(input, llm);
    expect(result.status, result.stoppedReason).toBe('COMPLETE');
    expect(seen).toContain('thesis-final-recheck-review');
    expect(store.loadTheses()!.review_failures).toHaveLength(2);
    expect(store.loadTheses()!.blocks[0].review.ready).toBe(true);
    expect(() => validateThesisDraft(store.loadTheses(), input)).not.toThrow();
  });
  it('cannot approve a book with a persistently unavailable checker', async () => {
    const store = new MemoryProjectStore(); const base = progressiveModel([]);
    const result = await new Orchestrator(store).runBook(input, async (prompt, system, options) => {
      if (/thesis-(expand|polish|final-recheck)-review/.test(options?.stage || '')) return 'not JSON';
      return base(prompt, system, options);
    });
    expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(store.loadTheses()!.blocks[0].review.status).toBe('unavailable');
    expect(store.loadReport()!.findings.some(finding => finding.severity === 'major' && finding.reader_impact.includes('Review not completed'))).toBe(true);
    expect(store.loadTheses()!.final_repair!.findings.some(f=>f.description.includes('Review not completed'))).toBe(true);
    expect(() => validateThesisDraft(store.loadTheses(), input)).not.toThrow();
  });
  it('does not hide transport errors as malformed assessments', async () => {
    const store = new MemoryProjectStore(); const base = progressiveModel([]);
    const result = await new Orchestrator(store).runBook(input, async (prompt, system, options) => {
      if (options?.stage === 'thesis-expand-review') throw new Error('Ollama request failed [503]');
      return base(prompt, system, options);
    });
    expect(result.status).toBe('FAILED');
    expect(store.loadTheses()!.review_failures).toBeUndefined();
  });
  it('continues after exhausted logical repairs, preserves findings and cannot report a clean book', async () => {
    const store = new MemoryProjectStore(); const seen: string[] = [];
    const base = progressiveModel(seen);
    const llm: NovelLLM = async (prompt, system, options) => {
      if (options?.stage === 'thesis-expand-review' || options?.stage === 'thesis-polish-review') return JSON.stringify({ ready: false, issues: [{ severity: 'major', kind: 'contradiction', evidence: 'Marta carefully revealed the letter.', consequence: 'The scene contradicts the established concealment requirement.', thesis_ids: ['T01'], problem: 'Unresolved logical defect', required_change: 'Resolve the contradiction' }] });
      return base(prompt, system, options);
    };
    const result = await new Orchestrator(store).runBook(input, llm);
    expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(seen).toContain('thesis-polish');
    expect(store.loadTheses()!.deferred).toHaveLength(2);
    expect(store.loadReport()!.findings.some(finding => finding.severity === 'major')).toBe(true);
    expect(store.loadTheses()!.final_repair!.findings.some(f=>f.severity==='major')).toBe(true);
    expect(() => validateThesisDraft(store.loadTheses(), input)).not.toThrow();
  });
  it('treats style as advice and requires actual evidence for blocking claims', () => {
    const plan = allocateThesisWords({ title: 'Letter', premise_givens: [], characters: [{ id: 'C', name: 'Marta', goal: 'Save sibling', initial_knowledge: [], capabilities: [], limitations: [] }], theses: [thesis], ending: 'Revealed' }, input);
    const issue = { severity: 'major', thesis_ids: ['T01'], problem: 'Use another gesture', required_change: 'Change gesture', kind: 'style' };
    expect(readProseReview({ issues: [issue] }, plan, 'Prose').ready).toBe(true);
    expect(() => readProseReview({ issues: [{ ...issue, kind: 'contradiction', evidence: 'Invented quote', consequence: 'Breaks timing' }] }, plan, 'Prose')).toThrow(/exact quote/);
  });
  it('writes the whole rough story before expanding, preserving versions and edit history', async () => {
    const store = new MemoryProjectStore(); const seen: string[] = [];
    const result = await new Orchestrator(store).runBook(input, progressiveModel(seen));
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(seen.slice(0, 5)).toEqual(['thesis-synopsis', 'thesis-chapter-development', 'thesis-chapter-development-review', 'thesis-plan', 'thesis-plan-review']);
    const draft = store.loadTheses()!;
    expect(draft.manifestation?.versions.map(v => v.phase)).toEqual(['rough', 'expand', 'polish']);
    expect(draft.manifestation?.versions[0].blocks[0].text).toBe('Marta revealed the letter.');
    expect(draft.blocks[0].text).toBe('Marta carefully revealed the letter.');
    expect(draft.edits).toHaveLength(1); expect(draft.completed).toBe(true);
    expect(store.loadProgressive()).toBeNull();
  });
  it('persists patches on interruption and resumes without regenerating scenes', async () => {
    const store = new MemoryProjectStore(); await new Orchestrator(store).runBook(input, progressiveModel([], true));
    expect(store.loadTheses()!.blocks[0].text).toContain('carefully');
    const restored = new MemoryProjectStore(); restoreSnapshot(restored, snapshotProject(store));
    const stages: string[] = [];
    const delegate = progressiveModel(stages);
    const result = await new Orchestrator(restored).runBook(input, async (...args) => args[2]?.stage === 'thesis-expand' ? JSON.stringify({ tool: 'finish', text: 'Already expanded' }) : delegate(...args));
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(stages).not.toContain('thesis-block-write'); expect(restored.loadTheses()!.edits).toHaveLength(1);
  });
  it('checks causal thesis changes before accepting them and preserves the previous plan round', async () => {
    const store = new MemoryProjectStore(); const delegate = progressiveModel([]); let requests = 0;
    const result = await new Orchestrator(store).runBook(input, async (...args) => {
      if (args[2]?.stage === 'thesis-expand') return JSON.stringify(++requests === 1
        ? { tool: 'revise_thesis', thesis: { ...thesis, why: 'Only revealing the letter can save sibling' }, reason: 'Make the causal necessity explicit' }
        : { tool: 'finish', text: 'Cause clarified' });
      if (args[2]?.stage === 'thesis-causal-review') return JSON.stringify({ ready: true, issues: [] });
      return delegate(...args);
    });
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(store.loadTheses()!.plan!.theses[0].why).toContain('Only revealing');
    expect(store.loadTheses()!.rounds[0].plan.theses[0].why).toBe('Save sibling');
    expect(store.loadTheses()!.rounds).toHaveLength(2);
  });
  it('uses progressive manifestation by default for a fresh book', async () => {
    const store = new MemoryProjectStore(); const stages: string[] = [];
    const { generation_mode, ...fresh } = input;
    const result = await new Orchestrator(store).runBook(fresh, progressiveModel(stages));
    expect(result.status, result.stoppedReason || '').toBe('COMPLETE');
    expect(stages[0]).toBe('thesis-synopsis'); expect(store.loadInput()!.generation_mode).toBe('progressive');
  });

});

describe('short-book gate before expansion', () => {
  it('checks the complete short draft before expanding any block', async () => {
    const store = new MemoryProjectStore(); const seen: string[] = [];
    await new Orchestrator(store).runBook(input, progressiveModel(seen));
    expect(seen.indexOf('thesis-rough-review')).toBeGreaterThan(seen.indexOf('thesis-block-review'));
    expect(seen.indexOf('thesis-rough-review')).toBeLessThan(seen.indexOf('thesis-expand'));
    expect(store.loadTheses()!.rough_gate!.review!.ready).toBe(true);
  });
  it('carries a causal defect its repair could not resolve into expansion and the final report', async () => {
    const store = new MemoryProjectStore(); const seen: string[] = []; const base = progressiveModel(seen);
    let tools = 0;
    const result = await new Orchestrator(store).runBook(input, async (prompt, system, options) => {
      if (options?.stage === 'thesis-rough-review') return JSON.stringify({ ready: false, issues: [{ severity: 'major', kind: 'narrative_failure', thesis_ids: ['T01'], evidence: 'Marta revealed the letter.', consequence: 'No causal evidence connects the letter to the rescue.', problem: 'Unsupported resolution', required_change: 'Establish and test the decisive clue.' }] });
      if (options?.stage === 'thesis-rough-repair') return JSON.stringify(++tools % 2 ? { tool: 'search', query: 'letter' } : { tool: 'finish', text: 'No repair made' });
      return base(prompt, system, options);
    });
    expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
    expect(seen).toContain('thesis-expand');
    expect(store.loadTheses()!.rough_gate!.attempts).toBe(2);
    expect(store.loadTheses()!.carried_findings).toHaveLength(1);
    expect(store.loadTheses()!.manifestation!.versions[0].blocks[0].text).toBe('Marta revealed the letter.');
    expect(store.loadReport()!.findings.some(finding => finding.reader_impact.includes('Repair did not converge earlier (T01)'))).toBe(true);
  });
});

it('asks the rough reviewer to repair the specific invalid evidence field and retains strict validation', async () => {
  const store = new MemoryProjectStore(); const seen: string[] = []; const base = progressiveModel(seen);
  let calls = 0;
  const result = await new Orchestrator(store).runBook(input, async (prompt, system, options) => {
    if (options?.stage === 'thesis-rough-review') {
      if (!calls) expect(options.schema).toHaveProperty('properties.issues.items.required');
      else expect(options.schema).toHaveProperty('properties.edits');
      if (++calls === 1) return JSON.stringify({ ready: false, issues: [{ severity: 'major', kind: 'narrative_failure', thesis_ids: ['T01'], evidence: 'A paraphrase absent from the manuscript', consequence: 'Unproven rescue', problem: 'Missing causal step', required_change: 'Test the clue' }] });
      expect(prompt).toContain('evidence is not a verbatim substring');
      return JSON.stringify({ ready: true, issues: [] });
    }
    return base(prompt, system, options);
  });
  expect(result.status).toBe('COMPLETE'); expect(calls).toBe(2);
});

it('supports a coordinated plan proposal without editing prose implicitly', async () => {
  let accepted: unknown;
  const commands = [{ tool: 'revise_plan', plan: { ending: 'A timestamped log proves entry; possession alone does not' }, reason: 'Two theses rely on the same invalid inference' }, { tool: 'finish', text: 'Plan proposal complete' }];
  await manuscriptAgent(async prompt => {
    expect(prompt).toContain('revise_plan');
    return JSON.stringify(commands.shift());
  }, blocks, 'Repair the causal chain', 'System', { stage: 'test', onPlan: async plan => { accepted = plan; return { accepted: true }; } });
  expect(accepted).toEqual({ ending: 'A timestamped log proves entry; possession alone does not' });
  expect(blocks[0].text).toContain('Марта');
});

it('resolves review paragraph addresses to verbatim manuscript evidence without approving the defect', () => {
  const plan = { title: 'Letter', premise_givens: [input.premise], characters: [{ id: 'C', name: 'Marta', goal: 'Save sibling', initial_knowledge: [], capabilities: [], limitations: [] }], theses: [thesis], ending: 'Letter revealed' };
  const prose = 'Marta left the key card in the door.\n\nPolice called possession of the card proof she had returned.';
  const issue = { severity: 'major', kind: 'contradiction', thesis_ids: ['T01'], evidence: '@P0002', consequence: 'Possession cannot establish a time-specific visit.', problem: 'Invalid proof of entry', required_change: 'Make the accusation tentative or establish independent timed evidence.' };
  const review = readProseReview({ ready: true, issues: [issue] }, plan, prose);
  expect(review.ready).toBe(false);
  expect(review.issues[0].evidence).toBe('Police called possession of the card proof she had returned.');
  expect(() => readProseReview({ ready: true, issues: [{ ...issue, evidence: '@P9999' }] }, plan, prose)).toThrow('blocking prose issue');
  expect(issue.evidence).toBe('@P0002');
});

it('yields bounded edits to review and resumes with saved search history', async () => {
  let session: import('../utils/novel/v2/manuscriptTools').ManuscriptSession | undefined;
  let saved = blocks;
  const commands = [{ tool: 'search', query: 'письмо' }, { tool: 'replace', edits: [{ block_id: 'T01', before: 'спрятала', after: 'нашла' }] }];
  const note = await manuscriptAgent(async () => JSON.stringify(commands.shift()), blocks, 'Repair', '', {
    stage: 'repair', writable: ['T01'], requireSearch: true, maxSteps: 2,
    onCheckpoint: state => { session = state; }, onEdit: next => { saved = next; },
  });
  expect(note).toContain('does not declare the task complete');
  expect(saved[0].text).toContain('нашла');
  expect(session?.exhausted).toBe(true);
  const completed = await manuscriptAgent(async prompt => {
    expect(prompt).toContain('нашла'); expect(prompt).toContain('"tool":"search"');
    return JSON.stringify({ tool: 'finish', text: 'Done after inspecting saved edits' });
  }, saved, 'Repair', '', { stage: 'repair', writable: ['T01'], requireSearch: true, session, maxSteps: 1 });
  expect(completed).toBe('Done after inspecting saved edits');
});

it('never substitutes a budget note for missing newly written prose', async () => {
  let session: import('../utils/novel/v2/manuscriptTools').ManuscriptSession | undefined;
  await expect(manuscriptAgent(async () => JSON.stringify({ tool: 'search', query: 'письмо' }), blocks,
    'Write a new scene', '', { stage: 'write', maxSteps: 1, onCheckpoint: state => { session = state; } })).rejects.toThrow('tool-step limit');
  expect(session?.history).toHaveLength(1); expect(session?.searched).toBe(true);
});

it('resumes an interrupted connected repair and handles related defects together', async () => {
  const store = new MemoryProjectStore(); const base = progressiveModel([]);
  let reviews = 0, interrupted = false; let reconciliations = 0;
  const completedFocus: number[] = [];
  const llm: NovelLLM = async (prompt, system, options) => {
    if (options?.stage === 'thesis-rough-reconcile') reconciliations++;
    if (options?.stage === 'thesis-rough-review' && ++reviews === 1) return JSON.stringify({ ready: false, issues: [1, 2].map(n => ({ severity: 'major', kind: 'missing_event', thesis_ids: ['T01'], evidence: '@P0001', consequence: `Missing necessary causal step ${n}`, problem: `Defect ${n}`, required_change: `Establish step ${n}` })) });
    if (options?.stage === 'thesis-rough-repair') {
      const queue = store.loadTheses()!.rough_gate!.repair!;
      if (!prompt.includes('Required first: search') && !interrupted) { interrupted = true; throw new Error('Connection interrupted during connected repair'); }
      if (prompt.includes('Required first: search')) return JSON.stringify({ tool: 'search', query: 'letter' });
      completedFocus.push(queue.next);
      return JSON.stringify({ tool: 'finish', text: 'Focus repaired; independent review follows' });
    }
    return base(prompt, system, options);
  };
  const stopped = await new Orchestrator(store).runBook(input, llm);
  expect(stopped.status).toBe('FAILED');
  expect(store.loadTheses()!.rough_gate!.repair!.next).toBe(0);
  const resumed = await new Orchestrator(store).runBook(input, llm);
  expect(resumed.status).toBe('COMPLETE');
  expect(completedFocus).toEqual([0]);
  expect(reconciliations).toBe(1);
  expect(store.loadTheses()!.rough_gate!.repair).toBeUndefined();
});

it('continues beyond two repair rounds while blocking defects decrease', async () => {
  const store = new MemoryProjectStore(); const base = progressiveModel([]);
  let reviews = 0, repairs = 0;
  const result = await new Orchestrator(store).runBook(input, async (prompt, system, options) => {
    if (options?.stage === 'thesis-rough-review') {
      const count = Math.max(0, 4 - reviews++);
      return JSON.stringify({ ready: count === 0, issues: Array.from({length: count}, (_, n) => ({
        severity: 'major', kind: 'missing_event', thesis_ids: ['T01'], evidence: '@P0001',
        consequence: 'Required causal step missing', problem: `Missing step ${n}`, required_change: `Establish step ${n}`
      })) });
    }
    if (options?.stage === 'thesis-rough-repair') {
      if (prompt.includes('Required first: search')) return JSON.stringify({tool:'search',query:'letter'});
      if (!prompt.includes('\"applied\"')) {
        const old = store.loadTheses()!.blocks[0].text;
        return JSON.stringify({tool:'replace',edits:[{block_id:'T01',before:old,after:old+` Step ${reviews} established.`}]});
      }
      repairs++;
      return JSON.stringify({tool:'finish',text:'Chain repaired'});
    }
    return base(prompt, system, options);
  });
  expect(result.status, result.stoppedReason).toBe('COMPLETE');
  expect(repairs).toBe(4);
  expect(store.loadTheses()!.rough_gate!.progress!.counts).toEqual([4,3,2,1]);
});

it('patches setup, action and payoff in order, resumes the scene cursor, and commits only after package verification', async()=>{
  const store=new MemoryProjectStore(); const base=progressiveModel([]);
  const target={...input,target_total_words:12};
  const originals=['Setup original words here.','Action original words here.','Payoff original words here.'];
  const revised=originals.map(text=>text.replace('original','revised'));
  const patched:string[]=[];let interrupted=false,verified=false;
  const llm:NovelLLM=async(prompt,system,options)=>{
    const stage=options?.stage;
    if(stage==='thesis-plan') {
      const plan=JSON.parse(await base(prompt,system,options));
      plan.theses=[0,1,2].map(index=>({...thesis,id:`T0${index+1}`,requires:index?[`T0${index}`]:[],action:`Action ${index+1}`}));
      return JSON.stringify(plan);
    }
    if(stage==='thesis-block-write')return JSON.stringify({tool:'finish',text:originals[store.loadTheses()!.blocks.length]});
    if(stage==='thesis-rough-review')return JSON.stringify({ready:verified,issues:verified?[]:[{severity:'major',kind:'missing_event',thesis_ids:['T01','T02','T03'],evidence:'@P0003',consequence:'Payoff has no established setup',problem:'Missing shared promise',required_change:'Establish and use the promise'}]});
    if(stage==='thesis-rough-repair') {
      const id=JSON.parse(prompt.match(/Writable blocks: (\[[^\n]+?\])/)![1])[0];
      const index=Number(id.slice(1))-1;
      expect(prompt).toContain('CURRENT SCENE ONLY');
      expect(store.loadTheses()!.blocks.map(block=>block.text)).toEqual(originals);
      if(prompt.includes('Required first: search'))return JSON.stringify({tool:'search',query:'words'});
      const candidate=store.loadTheses()!.rough_gate!.repair!.prepared!.candidate!;
      if(candidate.blocks[index].text===originals[index]){
        patched.push(id);
        return JSON.stringify({tool:'replace',edits:[{block_id:id,before:originals[index],after:revised[index]}]});
      }
      if(id==='T02'&&!interrupted){interrupted=true;throw new Error('Disconnected after second-scene patch');}
      return JSON.stringify({tool:'finish',text:'Scene patched'});
    }
    if(stage==='thesis-rough-verify') {
      expect(store.loadTheses()!.rough_gate!.repair!.prepared!.candidate!.blocks.map(block=>block.text)).toEqual(revised);
      verified=true;
      return JSON.stringify({ready:true,checks:[{issue:0,status:'repaired',evidence:'@P0001',explanation:'Setup precedes action and payoff'}],issues:[]});
    }
    if(stage==='thesis-expand')return JSON.stringify({tool:'finish',text:'Expanded'});
    return base(prompt,system,options);
  };
  const first=await new Orchestrator(store).runBook(target,llm);
  expect(first.status).toBe('FAILED');
  expect(store.loadTheses()!.rough_gate!.repair!.prepared!.order!.next).toBe(1);
  expect(verified).toBe(false);
  const restored=new MemoryProjectStore();restoreSnapshot(restored,snapshotProject(store));
  expect(()=>validateThesisDraft(restored.loadTheses(),target)).not.toThrow();
  const result=await new Orchestrator(store).runBook(target,llm);
  expect(result.status,result.stoppedReason).toBe('COMPLETE');
  expect(patched).toEqual(['T01','T02','T03']);
  expect(store.loadTheses()!.blocks.map(block=>block.text)).toEqual(revised);
});
it('reviews a candidate plan without obsolete prose and refines the last rejected proposal', async()=>{
  const store=new MemoryProjectStore(); const base=progressiveModel([]); let reviews=0,proposals=0;
  const defect={severity:'major',kind:'missing_event',thesis_ids:['T01'],evidence:'@P0001',consequence:'No clue source',problem:'Missing clue',required_change:'Establish clue'};
  const result=await new Orchestrator(store).runBook(input,async(prompt,system,options)=>{
    if(options?.stage==='thesis-rough-review')return JSON.stringify({ready:store.loadTheses()!.blocks[0].text.includes('found'),issues:store.loadTheses()!.blocks[0].text.includes('found')?[]:[defect]});
    if(options?.stage==='thesis-rough-reconcile'){
      if(++proposals===2){expect(prompt).toContain('Last proposed causal plan to refine');expect(prompt).toContain('Clue origin needs support');expect(store.loadTheses()!.rough_gate!.causal_candidate).toBeDefined();}
      return base(prompt,system,options);
    }
    if(options?.stage==='thesis-causal-review'){
      expect(prompt).not.toContain('actual_short_book');
      expect(prompt).not.toContain('Marta revealed the letter.');
      return JSON.stringify(++reviews===1?{ready:false,issues:[{...defect,problem:'Clue origin needs support'}]}:{ready:true,issues:[]});
    }
    if(options?.stage==='thesis-rough-repair'){
      if(prompt.includes('Required first: search'))return JSON.stringify({tool:'search',query:'letter'});
      if(!prompt.includes('"applied"'))return JSON.stringify({tool:'replace',edits:[{block_id:'T01',before:'Marta revealed the letter.',after:'Marta found and revealed the letter.'}]});
      return JSON.stringify({tool:'finish',text:'Repaired'});
    }
    if(options?.stage==='thesis-expand')return JSON.stringify({tool:'finish',text:'Expanded'});
    return base(prompt,system,options);
  });
  expect(result.status,result.stoppedReason).toBe('COMPLETE');expect(proposals).toBe(2);
  expect(store.loadTheses()!.rough_gate!.causal_candidate).toBeUndefined();
});
it('never patches prose when the reconciled causal plan is rejected', async () => {
  const store = new MemoryProjectStore(); const base = progressiveModel([]); let patches = 0;
  const result = await new Orchestrator(store).runBook(input, async (prompt, system, options) => {
    if (options?.stage === 'thesis-rough-review' || options?.stage === 'thesis-causal-review') return JSON.stringify({ready:false, issues:[{severity:'major',kind:'missing_event',thesis_ids:['T01'],evidence:'@P0001',consequence:'Rescue cannot follow',problem:'Missing clue',required_change:'Establish clue'}]});
    if (options?.stage === 'thesis-rough-repair') patches++;
    return base(prompt, system, options);
  });
  expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
  expect(store.runLog().some(entry => entry.detail.includes('did not converge') && entry.detail.includes('no reduction'))).toBe(true);
  expect(patches).toBe(0);
  expect(store.loadTheses()!.manifestation!.versions[0].blocks[0].text).toBe('Marta revealed the letter.');
});

it('returns a rejected finish to the writer and verifies the subsequent patch', async () => {
  const commands = [{tool:'finish',text:'Done'}, {tool:'replace',edits:[{block_id:'T01',before:'Ей двадцать лет.',after:'Ей тридцать лет.'}]}, {tool:'finish',text:'Corrected'}];
  let turn = 0, checks = 0;
  const result = await manuscriptAgent(async prompt => {
    if (turn === 1) expect(prompt).toContain('Age is still wrong');
    return JSON.stringify(commands[turn++]);
  }, blocks, 'Correct age', '', {stage:'repair',writable:['T01'],onFinish:async current => {
    checks++;
    return {accepted:current[0].text.includes('тридцать'),feedback:'Age is still wrong'};
  }});
  expect(result).toBe('Corrected'); expect(checks).toBe(2); expect(turn).toBe(3);
});
it('rejects a causal-plan review citing obsolete manuscript paragraphs',()=>{
  const plan={title:'Letter',premise_givens:[input.premise],characters:[{id:'C',name:'Marta',goal:'Save sibling',initial_knowledge:['Letter'],capabilities:['Has letter'],limitations:['Fear']}],theses:[thesis],ending:'Letter revealed'};
  const source=JSON.stringify(plan)+'\n\nThe letter was found before the rescue.';
  const issue={severity:'major',kind:'contradiction',thesis_ids:['T01'],problem:'Unsupported timing',required_change:'Align timing',consequence:'Rescue cannot follow',evidence:'@P0181'};
  expect(()=>readCausalPlanReview({ready:false,issues:[issue]},plan,source)).toThrow('Invalid causal-plan review');
  expect(readCausalPlanReview({ready:false,issues:[{...issue,evidence:'@P0002'}]},plan,source).ready).toBe(false);
});
it('requires exact proof and complete distinct coverage for repair acceptance', () => {
  const plan = {title:'Letter', premise_givens:[input.premise],characters:[{id:'C',name:'Marta',goal:'Save sibling',initial_knowledge:['Letter'],capabilities:['Has letter'],limitations:['Fear']}],theses:[thesis],ending:'Letter revealed'};
  const check = {issue:0,status:'repaired',evidence:'@P0001',explanation:'The clue is now shown'};
  expect(readRepairVerification({ready:true,checks:[check],issues:[]},plan,'Marta read the letter.',1).accepted).toBe(true);
  expect(()=>readRepairVerification({ready:true,checks:[],issues:[]},plan,'Marta read the letter.',1)).toThrow('every original');
  expect(()=>readRepairVerification({ready:true,checks:[check,check],issues:[]},plan,'Marta read the letter.',2)).toThrow('Repair verdict 2: defect 0 already has a verdict');
  expect(()=>readRepairVerification({ready:true,checks:[{...check,evidence:'Imaginary evidence'}],issues:[]},plan,'Marta read the letter.',1)).toThrow('exact evidence');
  expect(readRepairVerification({ready:true,checks:[{...check,status:'unresolved'}],issues:[]},plan,'Marta read the letter.',1).accepted).toBe(false);
});
it('checks connected repairs before accepting finish and feeds unresolved evidence back into patching', async () => {
  const store = new MemoryProjectStore(); const base = progressiveModel([]);
  let reviews = 0, verifications = 0, commands = 0;
  const defect = {severity:'major',kind:'missing_event',thesis_ids:['T01'],evidence:'@P0001',consequence:'No prior reading supports the decision',problem:'Reading is missing',required_change:'Show Marta reading the letter'};
  const result = await new Orchestrator(store).runBook(input, async (prompt, system, options) => {
    if (options?.stage === 'thesis-rough-review' && reviews++ === 0) return JSON.stringify({ready:false,issues:[defect]});
    if (options?.stage === 'thesis-rough-verify') {
      const accepted = ++verifications > 1;
      return JSON.stringify({ready:accepted,checks:[{issue:0,status:accepted?'repaired':'unresolved',evidence:'@P0001',explanation:accepted?'Marta reads before revealing':'Reading is still absent'}],issues:accepted?[]:[defect]});
    }
    if (options?.stage === 'thesis-rough-repair') {
      const commandsList = [{tool:'search',query:'letter'},{tool:'finish',text:'Done'},
        {tool:'search',query:'letter'},{tool:'replace',edits:[{block_id:'T01',before:'Marta revealed the letter.',after:'Marta read the letter. Marta revealed the letter.'}]},{tool:'finish',text:'Repaired'}];
      if (commands === 2) expect(prompt).toContain('Reading is still absent');
      return JSON.stringify(commandsList[commands++]);
    }
    return base(prompt, system, options);
  });
  expect(result.status,result.stoppedReason).toBe('COMPLETE');
  expect(verifications).toBe(2);
  expect(store.loadTheses()!.manifestation!.versions[0].blocks[0].text).toContain('Marta read the letter.');
});
it('keeps a package out of the main manuscript when its verification finds a contradiction in the text it wrote', async () => {
  const store = new MemoryProjectStore(); const base=progressiveModel([]); let turn=0;
  const defect={severity:'major',kind:'contradiction',thesis_ids:['T01'],evidence:'@P0001',consequence:'No grounded clue',problem:'Unsupported letter',required_change:'Show the clue'};
  const result=await new Orchestrator(store).runBook(input, async(prompt,system,options)=>{
    if(options?.stage==='thesis-rough-review') return JSON.stringify({ready:false,issues:[defect]});
    if(options?.stage==='thesis-rough-verify') return JSON.stringify({ready:false,checks:[{issue:0,status:'repaired',evidence:'@P0001',explanation:'The clue is now on the page'}],issues:[defect]});
    if(options?.stage==='thesis-rough-repair') {
      // The staged plan must not be committed during patching.
      expect(store.loadTheses()!.blocks[0].text).toBe('Marta revealed the letter.');
      const next=turn++%3;
      if(next===0)return JSON.stringify({tool:'search',query:'letter'});
      if(next===1)return JSON.stringify({tool:'replace',edits:[{block_id:'T01',before:turn<=3?'Marta revealed the letter.':'Marta invented a clue.',after:turn<=3?'Marta invented a clue.':'Marta invented another clue.'}]});
      return JSON.stringify({tool:'finish',text:'Done'});
    }
    return base(prompt,system,options);
  });
  expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
  expect(store.loadTheses()!.manifestation!.versions[0].blocks[0].text).toBe('Marta revealed the letter.');
  expect(store.loadTheses()!.rough_gate!.last_candidate).toBeDefined();
  expect(store.loadTheses()!.rough_gate!.repair).toBeUndefined();
});
it('continues improving a staged repair after a tool batch without regenerating its plan or discarding partial edits', async()=>{
  const store=new MemoryProjectStore(); const base=progressiveModel([]);
  let turns=0,proposals=0;
  const partial='Marta found the letter.';
  const final='Marta found the letter and rescued her sibling.';
  const defects=[0,1].map(index=>({severity:'major',kind:'missing_event',thesis_ids:['T01'],evidence:'@P0001',consequence:'The rescue lacks evidence',problem:`Missing step ${index}`,required_change:`Establish step ${index}`}));
  const result=await new Orchestrator(store).runBook(input,async(prompt,system,options)=>{
    const stage=options?.stage;
    if(stage==='thesis-rough-reconcile') proposals++;
    if(stage==='thesis-rough-review') return JSON.stringify({ready:store.loadTheses()!.blocks[0].text===final,issues:store.loadTheses()!.blocks[0].text===final?[]:defects});
    if(stage==='thesis-rough-repair') {
      turns++;
      if(turns===1||turns===4)return JSON.stringify({tool:'search',query:'letter'});
      if(turns===2)return JSON.stringify({tool:'replace',edits:[{block_id:'T01',before:'Marta revealed the letter.',after:partial}]});
      if(turns===5) {
        expect(store.loadTheses()!.blocks[0].text).toBe('Marta revealed the letter.');
        expect(store.loadTheses()!.rough_gate!.repair!.prepared!.candidate!.blocks[0].text).toBe(partial);
        expect(prompt).toContain('Latest package verification');
        return JSON.stringify({tool:'replace',edits:[{block_id:'T01',before:partial,after:final}]});
      }
      return JSON.stringify({tool:'finish',text:'Repaired'});
    }
    if(stage==='thesis-rough-verify') {
      const ready=store.loadTheses()!.rough_gate!.repair!.prepared!.candidate!.blocks[0].text===final;
      return JSON.stringify({ready,checks:[{issue:0,status:'repaired',evidence:'@P0001',explanation:'The letter is found'},{issue:1,status:ready?'repaired':'unresolved',evidence:'@P0001',explanation:ready?'The letter enables rescue':'The rescue is still missing'}],issues:ready?[]:[defects[1]]});
    }
    if(stage==='thesis-expand')return JSON.stringify({tool:'finish',text:'Already expanded'});
    return base(prompt,system,options);
  });
  expect(result.status,result.stoppedReason).toBe('COMPLETE');
  expect(proposals).toBe(1);
  expect(store.loadTheses()!.blocks[0].text).toBe(final);
  expect(store.loadTheses()!.edits!.filter(edit=>edit.phase==='rough-repair').flatMap(edit=>edit.edits)).toHaveLength(2);
});
it('does not treat fluctuating reviews of unchanged text as repair progress', async()=>{
  const store=new MemoryProjectStore(); const base=progressiveModel([]); let reviews=0;
  const result=await new Orchestrator(store).runBook(input,async(prompt,system,options)=>{
    if(options?.stage==='thesis-rough-review') {
      const count=Math.max(1,4-reviews++);
      return JSON.stringify({ready:false,issues:Array.from({length:count},(_,index)=>({severity:'major',kind:'missing_event',thesis_ids:['T01'],evidence:'@P0001',consequence:'Missing grounded clue',problem:`Defect ${index}`,required_change:'Establish clue'}))});
    }
    if(options?.stage==='thesis-rough-repair') return JSON.stringify(prompt.includes('Required first: search')?{tool:'search',query:'letter'}:{tool:'finish',text:'No changes needed'});
    return base(prompt,system,options);
  });
  expect(result.status).toBe('COMPLETE_WITH_WARNINGS');
  expect(store.runLog().some(entry => entry.detail.includes('did not converge') && entry.detail.includes('4 → 3 → 2'))).toBe(true);
  expect(store.loadTheses()!.rough_gate!.progress!.stalled).toBe(2);
});


it('saves and checks a patch to the first pending scene before any accepted blocks exist',async()=>{
  const store=new MemoryProjectStore();const base=progressiveModel([]);let reviews=0;let patched=false;
  const result=await new Orchestrator(store).runBook(input,async(prompt,system,options)=>{
    if(options?.stage==='thesis-block-review' && ++reviews===1)return JSON.stringify({ready:false,issues:[{severity:'major',kind:'missing_event',evidence:'@P0001',consequence:'The discovery has no source.',thesis_ids:['T01'],problem:'Letter source absent',required_change:'Show opening the envelope'}]});
    if(options?.stage==='thesis-block-repair'){
      if(!patched){patched=true;return JSON.stringify({tool:'replace',edits:[{block_id:'T01',before:'Marta revealed the letter.',after:'Marta opened the envelope. Marta revealed the letter.'}]});}
      return JSON.stringify({tool:'finish'});
    }
    return base(prompt,system,options);
  });
  expect(result.status,result.stoppedReason).toBe('COMPLETE');
  expect(store.loadTheses()!.blocks[0].text).toContain('opened the envelope');
  expect(store.loadTheses()!.edits!.some(edit=>edit.phase==='repair')).toBe(true);
});
