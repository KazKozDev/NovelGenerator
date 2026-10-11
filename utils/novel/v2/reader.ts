import { renderPrompt, systemContract } from '../prompts';
import { structuredResponse, withRoom, type NovelLLM } from './llm';
import type { BookDesign, ReaderBeat, ReaderReading, ReaderSimulation, PlanIssue } from './types';
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

export function readReaderBeats(raw: any, design: BookDesign): ReaderBeat[] {
  if (!Array.isArray(raw?.beats) || raw.beats.length !== design.chapter_map.length) throw new Error('Every chapter needs a reader beat.');
  const ids = new Set<string>();
  const chapters = [...design.chapter_map].sort((a, b) => a.chapter - b.chapter);
  return raw.beats.map((beat: any, index: number) => {
    const chapter = chapters[index];
    const available = new Set(chapters.slice(0, index + 1).flatMap(item => item.event_ids));
    if (beat.chapter !== chapter.chapter || !nonempty(beat.price) || !nonempty(beat.new_difficulty) ||
      !Array.isArray(beat.traces) || !beat.traces.length) throw new Error('Invalid or out-of-order reader beat.');
    // A trace that cites nothing on the map, an event no chapter has reached, or no
    // way of coming upon it is left out rather than refusing the whole answer: the
    // reader then sees less, which is the safe side of a check on what can be seen.
    const traces = beat.traces.filter((trace: any) => {
      const event = design.causal_map.find(item => item.id === trace?.source_event_id);
      const sound = !!event && (event.before_story || available.has(event.id)) && nonempty(trace.id) && !ids.has(trace.id) &&
        nonempty(trace.visible_fact) && nonempty(trace.discovery_route);
      if (sound) ids.add(trace.id);
      return sound;
    });
    if (!traces.length) throw new Error(`Chapter ${beat.chapter} has no trace that cites an event reached by then with a discovery route.`);
    return { chapter: beat.chapter, traces: traces.map((trace: any) => ({ id: trace.id,
      source_event_id: trace.source_event_id, visible_fact: trace.visible_fact, discovery_route: trace.discovery_route })),
      price: beat.price, new_difficulty: beat.new_difficulty };
  });
}

/** Only observable evidence up to this chapter; no author truth, ending or future beats. */
export function readerPacket(beats: ReaderBeat[], readings: ReaderReading[], index: number) {
  return { chapter: beats[index].chapter, evidence: beats.slice(0, index + 1).flatMap(beat =>
    beat.traces.map(trace => ({ id: trace.id, fact: trace.visible_fact }))), previous_readings: readings };
}
export function readReaderReading(raw: any, packet: ReturnType<typeof readerPacket>): ReaderReading {
  if (raw?.chapter !== packet.chapter ||
    ['interpretation', 'alternative', 'changed_understanding', 'next_question'].some(key => !nonempty(raw[key])) ||
    raw.interpretation === raw.alternative || ['support_ids', 'alternative_support_ids'].some(key =>
      !Array.isArray(raw[key]) || !raw[key].length || raw[key].some((id: string) => !packet.evidence.some(trace => trace.id === id)))) {
    throw new Error('Reader interpretations must use available evidence only.');
  }
  return Object.fromEntries(['chapter', 'interpretation', 'support_ids', 'alternative', 'alternative_support_ids',
    'changed_understanding', 'next_question'].map(key => [key, raw[key]])) as unknown as ReaderReading;
}
export function readReaderReview(raw: any, beats: ReaderBeat[], readings: ReaderReading[]): ReaderSimulation {
  const ids = beats.flatMap(beat => beat.traces.map(trace => trace.id));
  if (!Array.isArray(raw?.retrospective) || raw.retrospective.length !== ids.length ||
    new Set(raw.retrospective.map((item: any) => item.trace_id)).size !== ids.length ||
    raw.retrospective.some((item: any) => !ids.includes(item.trace_id) || !nonempty(item.ending_explanation) || typeof item.earned !== 'boolean') ||
    !Array.isArray(raw.issues) || raw.issues.some((issue: any) => !['blocking', 'major', 'optional'].includes(issue?.severity) ||
      !/^(characters|causal_map|world_rules|dramatic_core|ending|chapter_map):.+/.test(issue.target_ref) ||
      !nonempty(issue.problem) || !nonempty(issue.required_decision))) throw new Error('Invalid retrospective reader review.');
  const finalQuestion = readings.at(-1)?.next_question;
  if (!Array.isArray(raw.closure) || (finalQuestion && !raw.closure.some((item: any) => item.question === finalQuestion)) ||
    raw.closure.some((item: any) => !nonempty(item.question) || !nonempty(item.answer) || typeof item.resolved !== 'boolean' ||
      typeof item.intentionally_open !== 'boolean' || !Array.isArray(item.support_ids) ||
      item.support_ids.some((id: string) => !ids.includes(id)) || (item.resolved && !item.support_ids.length))) {
    throw new Error('Final reader questions need explicit evidence-based closure.');
  }
  const issues: PlanIssue[] = [...raw.issues];
  // An omitted visible action belongs to its chapter, not automatically to the
  // frozen ending. Respect explicit author-plan defects reported by the judge.
  const targetFor = (traceIds: string[], fallbackChapter: number): string =>
    raw.issues.find((issue: PlanIssue) => issue.severity !== 'optional' &&
      issue.evidence_refs?.some(id => traceIds.includes(id)))?.target_ref || `chapter_map:${fallbackChapter}`;
  for (const item of raw.closure) if (!item.resolved && !item.intentionally_open) issues.push({
    id: `READER:CLOSURE:${issues.length}`, severity: 'major', target_ref: targetFor(item.support_ids, beats.at(-1)!.chapter), category: 'reader-understanding',
    problem: `The reader still cannot answer: ${item.question}`, evidence_refs: item.support_ids,
    consequence_for_writing: item.answer, required_decision: 'Earn an answer through observable evidence or explicitly justify leaving this question open.',
    suggested_adjustment: item.answer,
  });
  for (const item of raw.retrospective) if (!item.earned) issues.push({
    id: `READER:${item.trace_id}`, severity: 'major', target_ref: targetFor([item.trace_id], beats.find(beat => beat.traces.some(trace => trace.id === item.trace_id))!.chapter), category: 'reader-understanding',
    problem: item.ending_explanation, evidence_refs: [item.trace_id], consequence_for_writing: 'The final explanation is not earned by earlier evidence.',
    required_decision: 'Repair how this earlier trace supports the final explanation.', suggested_adjustment: item.ending_explanation,
  });
  return { beats, readings, retrospective: raw.retrospective, closure: raw.closure,
    review: { ready: !issues.some(issue => issue.severity === 'major' || issue.severity === 'blocking'), issues } };
}
export async function simulateReader(design: BookDesign, llm: NovelLLM): Promise<ReaderSimulation> {
  const { planning_history, reader_understanding, ...construction } = design;
  const plan = JSON.stringify({ ...construction, chapter_map: [...construction.chapter_map].sort((a, b) => a.chapter - b.chapter) });
  const beats = await structuredResponse(renderPrompt('P01_READER_TRACES', { plan }), systemContract(), llm,
    ['beats'], raw => readReaderBeats(raw, design), { stage: 'design-reader-traces', deliberate: true, temperature: 0.2, maxTokens: 8192 });
  const readings: ReaderReading[] = [];
  for (let index = 0; index < beats.length; index++) {
    const packet = readerPacket(beats, readings, index);
    readings.push(await withRoom(maxTokens => structuredResponse(renderPrompt('P01_READER_INFER', { packet: JSON.stringify(packet) }), systemContract(), llm,
      ['chapter', 'interpretation', 'support_ids', 'alternative', 'alternative_support_ids', 'changed_understanding', 'next_question'],
      raw => readReaderReading(raw, packet), { stage: 'design-reader-infer', temperature: 0.3, maxTokens }), 2048));
  }
  return reviewReader(design, beats, readings, llm);
}
export async function reviewReader(design: BookDesign, beats: ReaderBeat[], readings: ReaderReading[], llm: NovelLLM): Promise<ReaderSimulation> {
  readReaderBeats({ beats }, design);
  if (readings.length !== beats.length) throw new Error('Every chapter needs one independent reading.');
  readings.forEach((reading, index) => readReaderReading(reading, readerPacket(beats, readings.slice(0, index), index)));
  const { planning_history, reader_understanding, ...construction } = design;
  const plan = JSON.stringify(construction);
  return structuredResponse(renderPrompt('P01_READER_REVIEW', { plan, beats: JSON.stringify(beats), readings: JSON.stringify(readings) }),
    systemContract(), llm, ['ready', 'issues', 'retrospective', 'closure'], raw => readReaderReview(raw, beats, readings),
    { stage: 'design-reader-review', deliberate: true, temperature: 0.1, maxTokens: 8192 });
}
