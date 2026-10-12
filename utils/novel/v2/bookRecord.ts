import { fillTemplate } from '../prompts';
import recordRaw from '../../../prompts/THESIS_RECORD.md?raw';
import { structuredResponse, type NovelLLM } from './llm';
import type { Thesis, ThesisPlan } from './theses';

/**
 * The book's memory, kept as a table. A writer invents small things as it goes — a title, a
 * brother's name, how long the couple have been coming, which drawer the key is in — and
 * they were written nowhere but in the prose, which the next scene's writer was not shown
 * whole. So Ms. Blake became Dr. Blake, Roger became Mark, a hiding place was described
 * twice and a June became a September. After each scene its particulars are copied out;
 * every later scene is written from the table. This copies; it does not review.
 */
export interface BookRecord { days: { scene: string; day: string }[]; facts: { scene: string; about: string; fact: string }[]; shown: { scene: string; line: string }[] }

const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
export const emptyRecord = (): BookRecord => ({ days: [], facts: [], shown: [] });

export function readRecord(raw: any): { day: string; facts: { about: string; fact: string }[]; shown: string[] } {
  if (!Array.isArray(raw?.facts) || !Array.isArray(raw?.shown)) throw new Error('facts and shown must be arrays (empty when there is nothing to take down).');
  return { day: text(raw.day) ? raw.day.trim().slice(0, 200) : '',
    facts: raw.facts.filter((fact: any) => text(fact?.about) && text(fact?.fact)).slice(0, 14).map((fact: any) => ({ about: fact.about.trim().slice(0, 80), fact: fact.fact.trim().slice(0, 240) })),
    shown: raw.shown.filter(text).slice(0, 5).map((line: string) => line.trim().slice(0, 200)) };
}

const sheet = (record: BookRecord, limit: number): string => {
  const by = new Map<string, string[]>();
  for (const fact of record.facts.slice(-limit)) by.set(fact.about, [...(by.get(fact.about) || []), fact.fact]);
  return [...by].map(([about, facts]) => `${about}: ${facts.join('; ')}`).join('\n');
};

/** One call after a scene is accepted. A scene that cannot be taken down is left out; the book goes on. */
export async function takeDown(record: BookRecord, thesis: Thesis, prose: string, system: string, llm: NovelLLM): Promise<BookRecord> {
  const taken = await structuredResponse(fillTemplate('THESIS_RECORD', recordRaw, { record: sheet(record, 120) || '(nothing yet)', id: thesis.id, when: thesis.when, where: thesis.where, text: prose }), system, llm, ['facts', 'shown'], readRecord,
    { stage: 'thesis-record', route: 'validator', maxTokens: 2048, maxAttempts: 3 });
  return { days: [...record.days.filter(day => day.scene !== thesis.id), ...(taken.day ? [{ scene: thesis.id, day: taken.day }] : [])],
    facts: [...record.facts.filter(fact => fact.scene !== thesis.id), ...taken.facts.map(fact => ({ scene: thesis.id, ...fact }))],
    shown: [...record.shown.filter(line => line.scene !== thesis.id), ...taken.shown.map(line => ({ scene: thesis.id, line }))] };
}

/** What the writer of the next scene is given: the calendar, the particulars, and what has been shown. */
export function recordBrief(record: BookRecord | undefined, plan: ThesisPlan, id: string): string {
  const index = plan.theses.findIndex(thesis => thesis.id === id);
  if (index < 1) return '';
  const earlier = plan.theses.slice(0, index);
  const calendar = earlier.map(thesis => `${thesis.id}: ${record?.days.find(day => day.scene === thesis.id)?.day || thesis.when}`);
  const facts = record ? sheet(record, 90) : '';
  const shown = (record?.shown || []).slice(-30).map(line => line.line);
  return '\nTHE BOOK SO FAR, AS ITS CONTINUITY SHEET. This is settled. Use these names, titles, dates and places exactly as written; do not give anything a second version, and where you need a particular that is not here, choose one that fits what is.'
    + `\nCalendar, scene by scene, to this one (${plan.theses[index].when}):\n${calendar.join('\n')}`
    + (facts ? `\nParticulars:\n${facts}` : '')
    + (shown.length ? `\nAlready shown to the reader in full. Refer to these in a phrase if you must; never describe or walk through them again, and do not open the scene by recalling the last one:\n- ${shown.join('\n- ')}` : '');
}
