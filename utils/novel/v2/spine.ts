import { fillTemplate } from '../prompts';
import spineRaw from '../../../prompts/THESIS_SPINE.md?raw';
import opponentRaw from '../../../prompts/THESIS_VOICE_OPPONENT.md?raw';
import protagonistRaw from '../../../prompts/THESIS_VOICE_PROTAGONIST.md?raw';
import { structuredResponse, type NovelLLM } from './llm';

/** How the story works, settled before its scenes and binding on the outline. */
export interface Spine {
  in_two_sentences: string;
  ending: string;
  turns: { who: string; does: string; because: string; costs: string }[];
  deeds: { who: string; deed: string; when: string; on_the_page: string; safer_way: string }[];
  proofs: { thing: string; shows: string; alone_is_not_enough_because: string; made_decisive_by: string; obtained_by: string }[];
  first_question: { asked_by: string; question: string; answer: string };
  chapters: { chapter: number; events: { where: string; what: string }[]; worse_because: string }[];
}
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

export function readSpine(raw: any, chapters: number): Spine {
  const wrong: string[] = [];
  const rows = (key: string, fields: string[], minimum: number) => {
    if (!Array.isArray(raw?.[key])) { wrong.push(`${key} must be an array`); return; }
    if (raw[key].length < minimum) wrong.push(`${key} needs at least ${minimum} entries, got ${raw[key].length}`);
    raw[key].forEach((row: any, at: number) => { for (const field of fields) if (!text(row?.[field])) wrong.push(`${key}[${at}].${field} is empty`); });
  };
  if (!text(raw?.in_two_sentences)) wrong.push('in_two_sentences is empty');
  if (!text(raw?.ending)) wrong.push('ending is empty');
  rows('turns', ['who', 'does', 'because', 'costs'], 3);
  rows('deeds', ['who', 'deed', 'when', 'on_the_page', 'safer_way'], 0);
  rows('proofs', ['thing', 'shows', 'alone_is_not_enough_because', 'made_decisive_by', 'obtained_by'], 0);
  for (const field of ['asked_by', 'question', 'answer']) if (!text(raw?.first_question?.[field])) wrong.push(`first_question.${field} is empty`);
  if (!Array.isArray(raw?.chapters)) wrong.push('chapters must be an array');
  else {
    const numbers = raw.chapters.map((chapter: any) => chapter?.chapter);
    for (let chapter = 1; chapter <= chapters; chapter++) if (!numbers.includes(chapter)) wrong.push(`chapters has no entry for chapter ${chapter}`);
    raw.chapters.forEach((chapter: any, at: number) => {
      if (!Array.isArray(chapter?.events) || !chapter.events.length || chapter.events.some((event: any) => !text(event?.where) || !text(event?.what))) wrong.push(`chapters[${at}].events must be a nonempty list of {where, what}`);
      if (!text(chapter?.worse_because)) wrong.push(`chapters[${at}].worse_because is empty`);
    });
  }
  if (wrong.length) throw new Error(`The mechanism is incomplete: ${wrong.join('; ')}. Keep everything else; fill only these.`);
  return raw as Spine;
}

export interface OpponentVoice { who: string; protagonist: string; i_want: string; i_know: string; my_steps: { where: string; i_do: string; she_could_see: string }[]; i_count_on: string; if_she_does_not: string; the_easier_way: string; what_i_cannot_control: string }

export function readOpponent(raw: any): OpponentVoice {
  const wrong = ['who', 'protagonist', 'i_want', 'i_know', 'i_count_on', 'if_she_does_not', 'the_easier_way', 'what_i_cannot_control'].filter(field => !text(raw?.[field])).map(field => `${field} is empty`);
  if (!Array.isArray(raw?.my_steps) || raw.my_steps.length < 3) wrong.push(`my_steps needs at least 3 steps, got ${Array.isArray(raw?.my_steps) ? raw.my_steps.length : 'none'}`);
  else raw.my_steps.forEach((step: any, at: number) => { for (const field of ['where', 'i_do', 'she_could_see']) if (!text(step?.[field])) wrong.push(`my_steps[${at}].${field} is empty`); });
  if (wrong.length) throw new Error(`Your account is incomplete: ${wrong.join('; ')}. Keep everything else; fill only these.`);
  return raw as OpponentVoice;
}

export function readProtagonist(raw: any, seen: number): Record<string, unknown> {
  const wrong = ['who', 'i_stand_to_lose', 'the_thing_they_did_not_expect'].filter(field => !text(raw?.[field])).map(field => `${field} is empty`);
  if (!Array.isArray(raw?.my_moves) || raw.my_moves.length < Math.min(3, seen)) wrong.push(`my_moves needs at least ${Math.min(3, seen)} moves, got ${Array.isArray(raw?.my_moves) ? raw.my_moves.length : 'none'}`);
  else raw.my_moves.forEach((move: any, at: number) => { for (const field of ['where', 'i_do', 'because', 'it_costs']) if (!text(move?.[field])) wrong.push(`my_moves[${at}].${field} is empty`); });
  for (const field of ['where', 'against', 'i_do', 'i_pay']) if (!text(raw?.my_last_stand?.[field])) wrong.push(`my_last_stand.${field} is empty`);
  if (wrong.length) throw new Error(`Your account is incomplete: ${wrong.join('; ')}. Keep everything else; fill only these.`);
  return raw;
}

/**
 * The mechanism is not written by an author and then tested. It is said, first, by the
 * people in it. The opponent answers alone: what I want, what my hands do, what I count on.
 * The protagonist answers alone, shown only what would come in front of her eyes, and not
 * the plan behind it. The author then builds the story where the two accounts collide.
 * Three calls, each of them writing; nothing is reviewed and nothing is rewritten. A version
 * that was attacked and rewritten came back worse than the first — a thumbprint in dust on a
 * key where there had been a key in a drawer — because an objection is answered by a clause.
 */
export async function settleSpine(request: string, synopsis: string, chapters: number, system: string, llm: NovelLLM, log: (line: string) => void): Promise<Spine> {
  const opponent = await structuredResponse(fillTemplate('THESIS_VOICE_OPPONENT', opponentRaw, { input: request }), system, llm, ['who', 'protagonist', 'my_steps'], readOpponent,
    { stage: 'thesis-voice-opponent', route: 'validator', maxTokens: 4096, temperature: 0.8 });
  const seen = opponent.my_steps.map(step => step.she_could_see.trim()).filter(trace => !/^"?nothing"?\.?$/i.test(trace));
  const protagonist = await structuredResponse(fillTemplate('THESIS_VOICE_PROTAGONIST', protagonistRaw, { input: request, protagonist: opponent.protagonist, seen: seen.map((trace, at) => `${at + 1}. ${trace}`).join('\n') || '1. Nothing yet: only your own life as the author describes it.' }),
    system, llm, ['who', 'my_moves', 'my_last_stand'], raw => readProtagonist(raw, seen.length), { stage: 'thesis-voice-protagonist', route: 'validator', maxTokens: 4096, temperature: 0.8 });
  const spine = await structuredResponse(fillTemplate('THESIS_SPINE', spineRaw, { input: request, synopsis: synopsis || '(none)', voices: JSON.stringify({ [opponent.who]: opponent, [String(protagonist.who)]: protagonist }) }), system, llm,
    ['in_two_sentences', 'ending', 'turns', 'deeds', 'proofs', 'first_question', 'chapters'], raw => readSpine(raw, chapters), { stage: 'thesis-spine', route: 'validator', maxTokens: 8192, temperature: 0.7 });
  log(`How the story works, said by its people before any scene: ${opponent.who} wants "${opponent.i_want.slice(0, 160)}"; ${String(protagonist.who)} did what was not expected: "${String(protagonist.the_thing_they_did_not_expect).slice(0, 200)}". In two sentences: ${spine.in_two_sentences.slice(0, 400)}`);
  return spine;
}

export const spineBrief = (spine: Spine): string =>
  '\nHOW THIS STORY WORKS — settled and tested before the outline, and binding on it. Every turn, deed and proof below is owned by a scene as its action; names and particulars are used as written here; nothing below is replaced by another mechanism. Each event listed under chapters becomes a scene, in that order and in that place; an event is split in two only when the length of the chapter needs it, and no scene is added that sits in a room and discusses the others. The action of a scene is one or two plain sentences saying who does what to whom:\n' + JSON.stringify(spine);
