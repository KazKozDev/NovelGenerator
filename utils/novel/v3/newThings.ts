/**
 * Things the last chapter names that no earlier chapter has.
 *
 * One book ended on a box that had never been in it; another had a woman carry in "a small paper bag" on its last pages
 * to settle the plot. A reader meets such a thing at the moment it is needed, and feels the author's hand. The envelope
 * does not catch these: they are the things the author did not think of until the end.
 *
 * Who does what. A small local network (GLiNER) only picks the objects out of the last chapter: it is given text and
 * hands back the words it takes for objects, with a number. Code does the rest: it looks each one up in every earlier
 * chapter, drops what was there before, and hands the author one line naming what is new. Nothing says it is wrong:
 * a letter that arrives in the last chapter is new because it arrives.
 */
import { sentencesOf } from './envelope';

/** The network that finds objects. It runs on this machine; Hugging Face does not serve it. */
export const OBJECTS_MODEL = 'urchade/gliner_medium-v2.1';
/** What the host is asked: pieces of text in, and for each the objects found in it. */
export interface ObjectsRequest { texts: string[]; labels: string[]; threshold: number }
export interface FoundObject { text: string; score: number }
export interface NewThing { name: string; score: number; line: string }

/**
 * A chapter in pieces the network can take at once: whole sentences, about four hundred characters. In pieces of nine
 * hundred it passed over a paper bag and a box of tissues that it found in pieces of four hundred.
 */
export function piecesOf(text: string, most = 400): string[] {
  const pieces: string[] = []; let piece = '';
  for (const line of sentencesOf(text)) { if (piece && piece.length + line.length > most) { pieces.push(piece); piece = line; } else piece = piece ? `${piece} ${line}` : line; }
  if (piece) pieces.push(piece);
  return pieces;
}

const bare = (text: string) => text.toLowerCase().replace(/[^a-z0-9' -]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:(?:the|a|an|his|her|their|its|my|your|our|that|this|those|these|some|two|three)\s+)+/, '');
/** The word a thing goes by: the last word of its name, "bag" for "a small paper bag". */
const headOf = (text: string) => bare(text).replace(/\s+(?:of|in|on|at|from|to|with)\s+.*$/, '').split(' ').at(-1) || '';
const named = (head: string) => new RegExp(`\\b${head.replace(/(?:es|s)$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:e?s)?\\b`, 'i');

/**
 * Of the objects found in the last chapter, those whose word stands in no earlier chapter; each with the sentence it
 * first stands in here. Code alone decides this: a word is either on an earlier page or it is not.
 */
export function firstSeenHere(last: string, earlier: string[], found: FoundObject[], most = 6): NewThing[] {
  const before = earlier.join('\n'), lines = sentencesOf(last), seen = new Set<string>(), fresh: NewThing[] = [];
  for (const item of [...found].sort((one, other) => other.score - one.score)) {
    const head = headOf(item.text);
    if (head.length < 3 || seen.has(head) || /^(?:thing|things|something|anything|nothing|everything|one|ones|way|room|place|hand|hands|eyes|face|voice|door|floor|street|house|city|day|night|time)$/.test(head)) continue;
    seen.add(head);
    if (named(head).test(before)) continue;
    const whole = new RegExp(`\\b${item.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const line = lines.find(sentence => whole.test(sentence)) || lines.find(sentence => named(head).test(sentence)) || '';
    if (line) fresh.push({ name: bare(item.text), score: item.score, line });
  }
  return fresh.slice(0, most);
}
