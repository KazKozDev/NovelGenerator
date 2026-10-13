/**
 * The sealed envelope: the scene the reader is not shown until the end, written before the book is.
 *
 * An author who writes a mystery forward invents how the thing was done in the last chapter, and trips there on what
 * it fixed in the first: a key that "never left her neck" opens a drawer for somebody else. Here the deed is written
 * first, as a scene, and after each chapter the author gets back its own lines about the things that scene turns on,
 * set beside the envelope's and the earlier chapters'. Nothing judges them. Code finds the sentences that name a thing;
 * a small model, asked about one thing at a time, only says which of those fix a fact about it and which merely pass
 * it by, so that a door mentioned in passing does not bury the two lines that matter.
 */
export interface Thing { thing: string; words: string[] }
export interface Held { thing: string; line: string }

export const ENVELOPE = 'envelope.md';
/** The small model that sorts sentences, on Hugging Face: a second and a fraction of a cent for a whole chapter. */
export const HELPER_MODEL = 'google/gemma-3-12b-it';
const clip = (line: string, most = 230) => line.length > most ? line.slice(0, most).replace(/\s+\S*$/, '') + '…' : line;

export function sentencesOf(text: string): string[] {
  return text.replace(/^#.*$/gm, '').split(/\n+/).flatMap(part => part.split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/)).map(line => line.trim()).filter(line => line.split(/\s+/).length >= 4);
}

export const thingsPrompt = (envelope: string): string => `${envelope}\n\n---\nThat scene is what really happened in a novel; its reader is not shown it until the end. List the physical things it could not have happened without: whatever a hand picks up, uses, leaves behind or takes away; every door, lock, key, stair or lift by which someone comes in or goes out; every hour of the clock it names. Not the building, not the room as a whole, not people or their names, not feelings. At most 8. One to a line, in this form and nothing else:\nthe thing: the one or two single words a page would use to name it\nFor example:\nthe brass key: key\nthe side door of the hotel: door, entrance\nthe hour she left: 9:58, ten`;
export const THINGS_SYSTEM = 'You make short lists from a text. You answer with the list only.';

/** "the brass key: key, keys" a line; anything else in the answer is passed over. */
export function readThings(answer: string): Thing[] {
  const things: Thing[] = [];
  for (const raw of answer.split('\n')) {
    const line = raw.replace(/^[\s\-*•\d.)]+/, '').replace(/\*+/g, '');
    const at = line.indexOf(':'); if (at < 2) continue;
    const thing = line.slice(0, at).trim().toLowerCase(), words = [...new Set(line.slice(at + 1).split(/[,;]/).map(word => word.trim().toLowerCase().replace(/[^a-z0-9':. -]/g, '').replace(/^[.:\s]+|[.:\s]+$/g, '')).filter(word => word.length >= 3 && word.split(' ').length <= 3))];
    if (thing.length <= 60 && words.length && !things.some(known => known.thing === thing)) things.push({ thing, words: words.slice(0, 6) });
  }
  return things.slice(0, 8);
}

const names = (thing: Thing) => new RegExp(`\\b(?:${thing.words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:e?s)?\\b`, 'i');

/** Every sentence of a text that names the thing. Code alone: no judgment of what the sentence says. */
export function mentions(text: string, thing: Thing, most = 24): string[] {
  return sentencesOf(text).filter(line => names(thing).test(line)).slice(0, most);
}

export const holdPrompt = (thing: Thing, secret: string[], found: string[]): string => `In a novel, something was done in secret. The secret scene has this:\n${secret.map(line => `"${clip(line, 300)}"`).join('\n') || '(it names the thing only in passing)'}\n\nTHE THING: ${thing.thing}\n\nSENTENCES FROM A CHAPTER OF THE SAME NOVEL:\n${found.map((line, at) => `[${at + 1}] ${around(line, thing, 260)}`).join('\n')}\n\n---\nWhich of these sentences are about this very thing — not another thing of the same name, not a figure of speech — and fix a fact about it that the secret scene has to agree with: where it is, who has it, who can reach it, whether it is locked, open or missing, which one it is, at what hour? Answer with their numbers only, separated by commas, at most 3, the most binding first; or the word none.`;
export const HOLD_SYSTEM = 'You sort sentences. You answer with numbers only, or the word none.';

export const surePrompt = (thing: Thing, secret: string[], line: string): string => `THE THING: ${thing.thing}${secret.length ? `, of which a novel's secret scene says: "${clip(secret[0], 300)}"` : ''}\n\nWORDS FROM ANOTHER PAGE OF THE NOVEL: "${around(line, thing, 260)}"\n\n---\nDo those words speak of this very thing, and do they state something definite about it: where it is, who has it or can reach it, whether it is locked or open, which one it is, or when something was done with it? If the word is only a figure of speech, another thing of the same name, or mentioned with nothing said about it, the answer is no. Answer yes or no.`;
export const SURE_SYSTEM = 'You answer with one word: yes or no.';

/** The part of a long sentence where the thing is named: it is that clause the author needs to see, not the whole period. */
export function around(line: string, thing: Thing, most = 200): string {
  if (line.length <= most) return line;
  const at = Math.max(0, line.search(names(thing))), from = Math.max(0, at - most / 2), cut = line.slice(from, from + most);
  return (from ? '…' : '') + cut.replace(from ? /^\S*\s+/ : /^/, '').replace(/\s+\S*$/, '') + (from + most < line.length ? '…' : '');
}

export function readNumbers(answer: string, upTo: number, most = 3): number[] {
  const tail = answer.replace(/<think>[\s\S]*?<\/think>/gi, '');
  return [...new Set((tail.match(/\d+/g) || []).map(Number).filter(number => number >= 1 && number <= upTo))].slice(0, most);
}

/**
 * The author's own lines about each thing, set side by side: the envelope's, the earlier chapters', this chapter's.
 * `all` shows every thing the book has spoken of; otherwise only those this chapter speaks of.
 */
export function sideBySide(things: Thing[], held: Record<string, Held[]>, file: string, chapters: string[], all: boolean): string {
  const before = chapters.slice(0, Math.max(0, chapters.indexOf(file)));
  const blocks: string[] = [], shown = new Set<string>();
  for (const thing of things) {
    const of = (name: string, most: number) => (held[name] || []).filter(item => item.thing === thing.thing && (name === ENVELOPE || !shown.has(item.line))).slice(0, most)
      .map(item => { if (name !== ENVELOPE) shown.add(item.line); return `   ${name === file ? `${name}, just written` : name === ENVELOPE ? 'the envelope' : name}: "${around(item.line, thing)}"`; });
    const secret = of(ENVELOPE, 1); if (!secret.length) continue;
    const here = of(file, 2), earlier = before.flatMap(name => of(name, 1)).slice(-2);
    if (!here.length && !(all && earlier.length)) continue;
    blocks.push([`— ${thing.thing}`, ...secret, ...earlier, ...here].join('\n'));
  }
  return blocks.slice(0, all ? 6 : 4).join('\n');
}
