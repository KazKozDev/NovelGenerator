import { describe, it, expect } from 'vitest';
import { readReaderBeats, readerPacket, readReaderReading, readReaderReview } from '../utils/novel/v2/reader';
import type { BookDesign, ReaderBeat } from '../utils/novel/v2/types';
const design = { chapter_map: [{ chapter: 1, event_ids: ['E1'] }, { chapter: 2, event_ids: ['E2'] }],
  causal_map: [{ id: 'E0', before_story: true }, { id: 'E1' }, { id: 'E2' }] } as BookDesign;
const beats = (): ReaderBeat[] => [1, 2].map(chapter => ({ chapter, traces: [{ id: `R${chapter}`, source_event_id: `E${chapter}`,
  visible_fact: `Physical trace ${chapter}`, discovery_route: 'Inspection exposes the mark' }], price: 'Lost trust', new_difficulty: 'The witness refuses help' }));
const reading = () => ({ chapter: 1, interpretation: 'Someone concealed a mistake', support_ids: ['R1'], alternative: 'Someone protected a friend',
  alternative_support_ids: ['R1'], changed_understanding: 'The damage was deliberate', next_question: 'Who benefited?' });
const verdict = () => ({ ready: true, issues: [], closure: [{ question: 'Who benefited?', answer: 'The visible action identifies the beneficiary',
  support_ids: ['R1'], resolved: true, intentionally_open: false }], retrospective: [1, 2].map(i => ({ trace_id: `R${i}`, ending_explanation: 'An earlier choice explains this trace', earned: true })) });
describe('Reader understanding crystallization', () => {
  it('does not supply the ending, hidden history or future evidence to the independent reader', () => {
    const packet = readerPacket(beats(), [], 0);
    expect(packet.evidence).toEqual([{ id: 'R1', fact: 'Physical trace 1' }]);
    expect(packet).not.toHaveProperty('ending');
    expect(JSON.stringify(packet)).not.toContain('E2');
    expect(JSON.stringify(packet)).not.toContain('discovery_route');
  });
  it('uses chapter numbers rather than storage order for evidence availability', () => {
    const shuffled = { ...design, chapter_map: [...design.chapter_map].reverse() };
    expect(readReaderBeats({ beats: beats() }, shuffled)).toHaveLength(2);
    const future = beats(); future[0].traces[0].source_event_id = 'E2';
    expect(() => readReaderBeats({ beats: future }, shuffled)).toThrow();
  });
  it('rejects future sources, duplicate trace IDs and omitted chapters', () => {
    const future = beats(); future[0].traces[0].source_event_id = 'E2';
    expect(() => readReaderBeats({ beats: future }, design)).toThrow();
    const duplicate = beats(); duplicate[1].traces[0].id = 'R1';
    expect(() => readReaderBeats({ beats: duplicate }, design)).toThrow();
    expect(() => readReaderBeats({ beats: beats().slice(0, 1) }, design)).toThrow();
  });
  it('permits a hidden-past trace with an explicit discovery route, subject to semantic review', () => {
    const past = beats(); past[0].traces[0].source_event_id = 'E0';
    expect(readReaderBeats({ beats: past }, design)).toHaveLength(2);
    past[0].traces[0].discovery_route = '';
    expect(() => readReaderBeats({ beats: past }, design)).toThrow();
  });
  it('rejects hypotheses citing unseen evidence and strips extra author fields', () => {
    const packet = readerPacket(beats(), [], 0);
    expect(() => readReaderReading({ ...reading(), support_ids: ['R2'] }, packet)).toThrow();
    expect(readReaderReading({ ...reading(), ending: 'Secret ending' }, packet)).not.toHaveProperty('ending');
  });
  it('requires an explanation for every earlier trace and blocks unearned explanations despite ready true', () => {
    expect(() => readReaderReview({ ...verdict(), retrospective: [] }, beats(), [])).toThrow();
    const raw = verdict(); raw.retrospective[0].earned = false;
    const result = readReaderReview(raw, beats(), []);
    expect(result.review.ready).toBe(false);
    expect(result.review.issues[0].target_ref).toBe('chapter_map:1');
    expect(raw.issues).toEqual([]);
  });
  it('keeps synthetic findings on the explicitly identified repair section', () => {
    const raw: any = verdict(); raw.retrospective[1].earned = false;
    raw.issues = [{ severity: 'major', target_ref: 'chapter_map:2', evidence_refs: ['R2'],
      problem: 'The trace omitted the rejection already present in the ending', required_decision: 'Show the rejection' }];
    expect(readReaderReview(raw, beats(), []).review.issues.map(issue => issue.target_ref)).toEqual(['chapter_map:2', 'chapter_map:2']);
    raw.issues[0].target_ref = 'ending:central_resolution';
    expect(readReaderReview(raw, beats(), []).review.issues.at(-1)?.target_ref).toBe('ending:central_resolution');
  });
  it('blocks an unresolved central question even when the judge returns ready true', () => {
    const raw = verdict(); raw.closure[0].resolved = false;
    expect(readReaderReview(raw, beats(), [reading()]).review.ready).toBe(false);
    raw.closure[0].intentionally_open = true;
    expect(readReaderReview(raw, beats(), [reading()]).review.ready).toBe(true);
    expect(() => readReaderReview({ ...verdict(), closure: [] }, beats(), [reading()])).toThrow();
  });
  it('does not equate a reader guessing correctly with a defective story', () => {
    expect(readReaderReview(verdict(), beats(), [reading()]).review.ready).toBe(true);
  });
});
