import { fillTemplate } from '../prompts';
import habitsRaw from '../../../prompts/THESIS_HABITS.md?raw';
import { isStopWord, splitSentences } from '../analytics';
import { structuredResponse, type NovelLLM } from './llm';

/** A move the writer repeats. The editor names it; code finds and counts it. */
export interface Habit { device: string; markers: string[]; example: string; known?: boolean }
/** What a writer model did in earlier books. The host decides where it is kept. */
export interface HabitMemory { load(): Habit[]; save(habits: Habit[]): void }
type Block = { thesis_id: string; text: string };

const stem = (word: string) => word.toLowerCase().replace(/[^\p{L}]/gu, '').replace(/(ing|ed|es|s|e)$/, '');
const stems = (sentence: string) => new Set(sentence.split(/[^\p{L}]+/u).filter(Boolean).map(stem));
export const habitKey = (habit: Habit) => habit.markers.map(stem).sort().join('+');
/** The sentences of a text that make this move: every marker present, in any order and form. */
export function carriers(text: string, habit: Habit): string[] {
  const wanted = habit.markers.map(stem);
  return splitSentences(text).filter(sentence => { const present = stems(sentence); return wanted.every(marker => present.has(marker)); });
}

/** A named habit is kept only when its own markers find its own example in the scene. */
export function readHabits(raw: any, scene: string, existing: Habit[] = []): Habit[] {
  if (!Array.isArray(raw?.habits)) throw new Error('Return habits as an array; an empty array when the scene has none.');
  const taken = new Set(existing.map(habitKey));
  const kept: Habit[] = [];
  for (const item of raw.habits.slice(0, 5)) {
    if (!item || typeof item.device !== 'string' || !item.device.trim() || !Array.isArray(item.markers)) continue;
    const markers = [...new Set<string>(item.markers.filter((m: unknown) => typeof m === 'string').map((m: string) => m.trim().toLowerCase()))]
      .filter(m => /^\p{L}{3,}$/u.test(m) && !isStopWord(m) && stem(m).length >= 2);
    if (markers.length < 2 || markers.length > 3) continue;
    const habit: Habit = { device: item.device.trim(), markers, example: '' };
    const found = carriers(scene, habit)[0];
    if (!found || taken.has(habitKey(habit))) continue;
    taken.add(habitKey(habit));
    kept.push({ ...habit, example: found.trim().replace(/\s+/g, ' ') });
  }
  return kept;
}

export function habitUses(blocks: Block[], habits: Habit[]) {
  return habits.map(habit => ({ habit, uses: blocks.flatMap(block => carriers(block.text, habit).map(sentence => ({ thesis_id: block.thesis_id, sentence: sentence.trim().replace(/\s+/g, ' ') }))) }));
}

// A judgement, not a measurement: the body parts and involuntary verbs generated prose
// reaches for. It counts a sentence in which the body acts by itself.
const BODY = /\b(heart|pulse|stomach|chest|throat|breath|lungs?|ribs|hands?|fingers|knees|legs|skin|blood|spine|jaw|mouth|gut|nausea)\b/i;
const WORLD = /\b(floor|room|world|ground)\b[^.!?]{0,20}\b(tilt|spun|spin|sway|lurch|drop)/i;
const INVOLUNTARY = /\b(hammer|pound|rac(e|ed|ing)\b|thud|tighten|clench|lurch|trembl|shook|shak(e|ing)\b|shiver|froze|constrict|flutter|sank|sink|twist|knot|churn|spun|spin|went (cold|dry|numb)|ran cold|caught in|skipped|stopped breathing|did not breathe)/i;
export function somaticBeats(text: string): string[] {
  return splitSentences(text).filter(sentence => !/^["“‘']/.test(sentence) && (BODY.test(sentence) && INVOLUNTARY.test(sentence) || WORLD.test(sentence)));
}
export const somaticAllowance = (text: string) => Math.max(1, Math.round(text.trim().split(/\s+/).length / 600));

/** What the next scene's writer is told before writing: the device, not a list of banned strings. */
export function habitBrief(blocks: Block[], habits: Habit[], limit = 14): string {
  const listed = habitUses(blocks, habits).filter(entry => entry.uses.length || entry.habit.known)
    .sort((a, b) => b.uses.length - a.uses.length).slice(0, limit)
    .map(entry => `- ${entry.habit.device}${entry.uses.length ? ` (already written ${entry.uses.length} time${entry.uses.length > 1 ? 's' : ''}, e.g. "${entry.uses[0].sentence}")` : ` (this writer's habit in earlier books, e.g. "${entry.habit.example}")`}`);
  return '\nA bodily reaction standing in for a feeling (heart, pulse, stomach, breath, hands, the room tilting) may appear at most once in this scene. Let a feeling show in what the person does with the things and people in this place.'
    + (listed.length ? '\nMoves already spent. Do not make them again in these or in other words; a near synonym is the same move:\n' + listed.join('\n') : '');
}

export function mergeHabits(existing: Habit[], found: Habit[]): Habit[] {
  const keys = new Set(existing.map(habitKey));
  return [...existing, ...found.filter(habit => !keys.has(habitKey(habit)) && keys.add(habitKey(habit)))];
}
/** A move made three times in one book, or made again after an earlier book, is this writer's. */
export function confirmedHabits(blocks: Block[], habits: Habit[]): Habit[] {
  return habitUses(blocks, habits).filter(entry => entry.uses.length >= 3 || entry.habit.known && entry.uses.length).map(entry => ({ ...entry.habit, known: true }));
}

export async function nameHabits(scene: string, habits: Habit[], system: string, llm: NovelLLM): Promise<Habit[]> {
  return structuredResponse(fillTemplate('THESIS_HABITS', habitsRaw, { scene, known: JSON.stringify(habits.map(habit => habit.device)) }), system, llm, ['habits'],
    raw => readHabits(raw, scene, habits), { stage: 'thesis-habits', route: 'validator', maxTokens: 2048,
      schema: { type: 'object', required: ['habits'], additionalProperties: false, properties: { habits: { type: 'array', maxItems: 5, items: { type: 'object', required: ['device', 'markers', 'example'], additionalProperties: false, properties: { device: { type: 'string' }, markers: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string' } }, example: { type: 'string' } } } } } } });
}

/** Browser memory: one list per writer model, in this browser's storage. */
export function browserHabitMemory(writer: string): HabitMemory {
  const key = `novel-writer-habits:${writer}`;
  return {
    load: () => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } },
    save: habits => { try { localStorage.setItem(key, JSON.stringify(habits)); } catch { /* Memory is a convenience; the book does not depend on it. */ } },
  };
}
