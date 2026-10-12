/**
 * What the author's tools hold, as text a person can read: one tab per tool.
 * Not a log of what happened — the words themselves: what the author asked, and what it was told.
 */
import type { DeskState } from './authorDesk';

export type DeskTab = { name: string; count: number; text: string };

const quote = (text: string) => text.trim().split('\n').map(line => `> ${line}`).join('\n');

export function deskTabs(desk: DeskState): DeskTab[] {
  const readers = desk.answers.filter(answer => /^a (reader|listener)\b/.test(answer.who));
  const keeper = desk.answers.filter(answer => answer.who === 'the keeper');
  const people = desk.answers.filter(answer => !readers.includes(answer) && !keeper.includes(answer));
  const none = (what: string) => `*${what}*`;
  const tabs: DeskTab[] = [
    { name: 'Reader', count: readers.length, text: readers.map(answer => `### Step ${answer.step} · ${answer.who}${answer.about ? `, through ${answer.about}` : ''}\n\n${answer.asked?.trim() ? `**The author asked**\n\n${quote(answer.asked)}\n\n` : ''}**${answer.who.startsWith('a listener') ? 'The listener' : 'The reader'}**\n\n${answer.text.trim()}${answer.stale ? `\n\n*The author has changed ${answer.about} since this was said.*` : ''}`).join('\n\n---\n\n') || none('The author has not asked a reader yet, and nobody has read the book.') },
    { name: 'Characters', count: people.length, text: people.map(answer => `### Step ${answer.step} · the author to ${answer.who}\n\n${answer.asked?.trim() ? `${quote(answer.asked)}\n\n` : ''}**${answer.who}**\n\n${answer.text.trim()}`).join('\n\n---\n\n') || none('The author has not spoken to any of its people yet.') },
    { name: 'Keeper', count: keeper.length, text: keeper.map(answer => { const [, question = '', said = answer.text] = answer.text.match(/^Q: ([\s\S]*?)\nA: ([\s\S]*)$/) || []; return `### Step ${answer.step} · the author to the keeper of the book's facts\n\n${quote(answer.asked?.trim() || question)}\n\n**The keeper**\n\n${said.trim()}`; }).join('\n\n---\n\n') || none('The author has not looked anything up in the book yet.') },
    { name: 'Set in', count: desk.inserts?.length || 0, text: (desk.inserts || []).map(insert => `### Step ${insert.step} · ${insert.kind === 'unfold' ? 'a told passage unfolded into a scene' : 'one thing set down'} in ${insert.file}\n\n**${insert.kind === 'unfold' ? 'In place of' : 'After'}**\n\n${quote(insert.at)}\n\n**${insert.kind === 'unfold' ? 'The scene' : 'What was set down'}**\n\n${insert.text.trim()}`).join('\n\n---\n\n') || none('Nothing has been set into a finished chapter.') },
    { name: 'Notebook', count: ['notebook.md', 'plan.md', 'dossier.md'].filter(name => desk.files[name]?.trim()).length, text: [['notebook.md', 'The notebook'], ['plan.md', 'The plan'], ['dossier.md', 'The dossier']].filter(([name]) => desk.files[name]?.trim()).map(([name, title]) => `## ${title}\n\n${desk.files[name].trim()}`).join('\n\n---\n\n') || none('The author has not written anything down yet.') },
  ];
  return tabs;
}

export type DeskFocus = { /** The tab the author is working in now; null when it is writing a chapter. */ tab: string | null; label: string; text: string };

/**
 * Where the author is working at this moment, read from the answer as it arrives, so that the screen can
 * follow it: into its notebook, to a reader, to one of its people — and back to the chapter when it writes one.
 * Returns nothing while that cannot be told yet.
 */
export function deskFocus(stage: string, arrived: string, last: string | null): DeskFocus | undefined {
  if (stage === 'author-reader') return { tab: 'Reader', label: 'A reader is answering', text: arrived };
  if (stage === 'author-character') return last === 'Keeper' ? { tab: 'Keeper', label: 'The keeper is looking it up', text: arrived } : { tab: 'Characters', label: 'Answering the author', text: arrived };
  if (stage !== 'author-step') return undefined;
  // One answer may hold several steps: the one now arriving is the last that names a tool.
  const now = arrived.slice(Math.max(0, ...[...arrived.matchAll(/^\**TOOL\**\s*:/gmi)].map(found => found.index ?? 0)));
  const tool = now.match(/^\**TOOL\**\s*:\**\s*`?([a-z_]+)/mi)?.[1].toLowerCase() || '';
  const target = now.match(/^\**(?:FILE|NAME)\**\s*:\**\s*[`"']?([^`"'\n]+)/mi)?.[1].trim() || '';
  const body = now.split(/\n-{3,}[ \t]*\n/)[1] || '';
  if (tool === 'ask_reader') return { tab: 'Reader', label: 'The author is asking a reader', text: body };
  if (tool === 'ask_keeper') return { tab: 'Keeper', label: 'The author is asking the keeper', text: body };
  if (tool === 'ask_character') return { tab: 'Characters', label: `The author is asking ${target || 'one of its people'}`, text: body };
  if (tool === 'plant' && target) return { tab: 'Set in', label: `The author is setting one thing into ${target}`, text: body };
  if ((tool === 'write' || tool === 'append') && target) {
    if (/^chapter-\d+/i.test(target)) return { tab: null, label: '', text: '' };
    return { tab: 'Notebook', label: `The author is writing in ${target}`, text: body };
  }
  return undefined;
}
