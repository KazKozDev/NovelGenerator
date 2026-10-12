import { fillTemplate } from '../prompts';
import choiceRaw from '../../../prompts/THESIS_DRAFT_CHOICE.md?raw';
import { structuredResponse, isResponseContractError, type NovelLLM } from './llm';
import { habitUses, somaticAllowance, somaticBeats, type Habit, type HabitMemory } from './habits';
import { textFindings } from './storyQuality';

/**
 * Two writers, one scene. Code measures both drafts and drops one that failed outright; an
 * editor who is not told whose is whose chooses between the rest on two narrow questions;
 * only the winner is reviewed. The book remembers who wins which kind of scene, and once
 * one writer plainly leads a kind, writes those scenes with that writer alone.
 */
export type Author = 'writer' | 'writer2';
export type SceneKind = 'solitary' | 'peopled';
export type DuelRecord = Record<SceneKind, { writer: number; writer2: number }>;
export interface DuelMemory { load(): DuelRecord | undefined; save(record: DuelRecord): void }
/** What the host supplies when a second writer is configured. */
export interface SecondWriter { name: string; habits?: HabitMemory; record?: DuelMemory }
export interface Measured { words: number; target: number; bodily: number; spent: number; repeats: number; out: string }

export const emptyRecord = (): DuelRecord => ({ solitary: { writer: 0, writer2: 0 }, peopled: { writer: 0, writer2: 0 } });
export const sceneKind = (participants: unknown[]): SceneKind => participants.length > 1 ? 'peopled' : 'solitary';

/**
 * Who writes the next scene of this kind. Until five duels of a kind have been decided, or
 * while neither writer has four in five, both write. After that the leader writes alone and
 * the other is tried again on every fifth scene, so a lead is not kept past its truth.
 */
export function contenders(record: DuelRecord, kind: SceneKind, sceneNumber: number): Author[] {
  const { writer, writer2 } = record[kind];
  const total = writer + writer2;
  if (total < 5 || Math.max(writer, writer2) / total < 0.8 || sceneNumber % 5 === 0) return ['writer', 'writer2'];
  return [writer >= writer2 ? 'writer' : 'writer2'];
}

/** What code can say of a draft without reading it for meaning. */
export function measure(text: string, target: number, id: string, earlier: { thesis_id: string; text: string }[], habits: Habit[]): Measured {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const repeats = textFindings([...earlier, { thesis_id: id, text }]).filter(finding => finding.severity === 'major' && finding.thesis_ids.includes(id)).length;
  const out = !words ? 'empty' : words < target * 0.6 ? `only ${words} of ${target} words` : repeats ? 'repeats a sentence the book already has' : '';
  return { words, target, bodily: Math.max(0, somaticBeats(text).length - somaticAllowance(text)), spent: habitUses([{ thesis_id: id, text }], habits).reduce((sum, entry) => sum + entry.uses.length, 0), repeats, out };
}
const penalty = (m: Measured) => Math.max(0, m.target - m.words) / Math.max(1, m.target) + m.bodily * 0.5 + m.spent * 0.5 + m.repeats * 2;
const describe = (m: Measured) => `${m.words} words against a target of ${m.target}; ${m.bodily} bodily reaction(s) past the scene's allowance; ${m.spent} move(s) the book has already spent`;

export interface Draft { author: Author; text: string; measured: Measured }
export interface Verdict { winner: Author; by: 'only one drafted' | 'the other failed its measurements' | 'editor' | 'measurements'; because: string }

/** Choose between two drafts. `flip` puts the second writer first, so that position favours neither over a book. */
export async function chooseDraft(drafts: Draft[], scene: object, voice: string, flip: boolean, system: string, llm: NovelLLM, log: (line: string) => void): Promise<Verdict> {
  if (drafts.length === 1) return { winner: drafts[0].author, by: 'only one drafted', because: '' };
  const standing = drafts.filter(draft => !draft.measured.out);
  if (standing.length === 1) return { winner: standing[0].author, by: 'the other failed its measurements', because: drafts.find(draft => draft.measured.out)!.measured.out };
  const cleaner = [...drafts].sort((a, b) => penalty(a.measured) - penalty(b.measured))[0];
  const [a, b] = flip ? [drafts[1], drafts[0]] : drafts;
  try {
    return await structuredResponse(fillTemplate('THESIS_DRAFT_CHOICE', choiceRaw, { scene: JSON.stringify(scene), voice: voice || '(This is the first scene of the book.)',
      measured_a: describe(a.measured), draft_a: a.text, measured_b: describe(b.measured), draft_b: b.text }), system, llm, ['choose'],
      raw => { if (raw.choose !== 'A' && raw.choose !== 'B') throw new Error('choose must be "A" or "B".'); return { winner: (raw.choose === 'A' ? a : b).author, by: 'editor' as const, because: typeof raw.because === 'string' ? raw.because.slice(0, 300) : '' }; },
      { stage: 'thesis-draft-choice', route: 'validator', maxTokens: 512, maxAttempts: 3,
        schema: { type: 'object', required: ['outcome', 'voice', 'choose', 'because'], additionalProperties: false, properties: { outcome: { type: 'string', enum: ['A', 'B', 'same'] }, voice: { type: 'string', enum: ['A', 'B', 'same'] }, choose: { type: 'string', enum: ['A', 'B'] }, because: { type: 'string' } } } });
  } catch (error) {
    if (!isResponseContractError(error)) throw error;
    log(`Draft choice not obtained (${error.message.split('\n')[0]}); the draft code measured cleaner goes in.`);
    return { winner: cleaner.author, by: 'measurements', because: 'The editor gave no usable choice.' };
  }
}

/** Browser memory of who wins which kind of scene, for one pair of writer models. */
export function browserDuelMemory(pair: string): DuelMemory {
  const key = `novel-writer-duels:${pair}`;
  return {
    load: () => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value?.solitary && value?.peopled ? value : undefined; } catch { return undefined; } },
    save: record => { try { localStorage.setItem(key, JSON.stringify(record)); } catch { /* A convenience; the book does not depend on it. */ } },
  };
}
