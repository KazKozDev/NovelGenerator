/**
 * The sealed envelope: the scene the reader is not shown until the end, written before the book is.
 *
 * An author who writes a mystery forward invents how the thing was done in the last chapter, and trips there on what
 * it fixed in the first: a key that "never left her neck" opens a drawer for somebody else. Here the deed is written
 * first, as a scene, and after each chapter the author gets back its own lines about the things that scene turns on,
 * set beside the envelope's and the earlier chapters'. Nothing judges them.
 *
 * Who does what. The author names the things, at the foot of its envelope: it is its book. Code finds every sentence
 * that names one, sets the lines side by side and decides what is shown. A small network only helps the code: it puts
 * one of three labels on a sentence — a fact about the thing, a figure of speech, something else — with a number, and
 * code keeps what passes its own mark. It is a classifier, not a model that talks: the same sentence always gets the
 * same number, and it cannot write, choose or decide anything. A model that talks did this work first, and it also
 * made the list of things, which was doing the code's work for it.
 */
export interface Thing { thing: string; words: string[] }
export interface Held { thing: string; line: string }

export const ENVELOPE = 'envelope.md';
/** The small network that labels sentences: a zero-shot classifier on Hugging Face, not a model that talks. */
export const HELPER_MODEL = 'MoritzLaurer/deberta-v3-large-zeroshot-v2.0';
const clip = (line: string, most = 230) => line.length > most ? line.slice(0, most).replace(/\s+\S*$/, '') + '…' : line;

export function sentencesOf(text: string): string[] {
  return text.replace(/^#.*$/gm, '').split(/\n+/).flatMap(part => part.split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/)).map(line => line.trim()).filter(line => line.split(/\s+/).length >= 4);
}

/** The things the author listed at the foot of its envelope, under a line that says THINGS: one to a line, optionally "the thing: the word a page names it by". */
export function listedThings(envelope: string): Thing[] {
  const at = envelope.search(/^[#* \t]*THINGS\b.*$/im); if (at < 0) return [];
  const first = envelope.slice(at).split('\n')[0].replace(/^[#* \t]*THINGS\b[\s:*—–-]*/i, '');
  const things: Thing[] = [];
  for (const raw of [...first.split(/[;,]/), ...envelope.slice(at).split('\n').slice(1)]) {
    const line = raw.replace(/^[\s\-*•\d.)]+/, '').replace(/[*_`"“”]+/g, '').trim(); if (!line || line.split(/\s+/).length > 12) continue;
    const [name, said = ''] = line.split(/\s*[:—–]\s+|\s*:\s*$/), thing = name.trim().toLowerCase().replace(/[.,;]+$/, '');
    // Without a word of its own, a thing is named on the page by its last word: "the brass key" by "key".
    const own = said.split(/[,;]/).map(word => word.trim().toLowerCase().replace(/[^a-z0-9':. -]/g, '').replace(/^[.:\s]+|[.:\s]+$/g, '')).filter(word => word.length >= 3 && word.split(' ').length <= 3);
    // The head of the name is what comes before "of the hotel", "that will not close", or a comma.
    const words = [...new Set(own.length ? own : [thing.replace(/,.*$|\s+(?:of|in|on|at|from|to|that|which|who|where|with)\s+.*$/, '').split(/\s+/).at(-1) || ''])].filter(word => word.length >= 3);
    if (thing.length >= 3 && thing.length <= 60 && words.length && !things.some(known => known.thing === thing)) things.push({ thing, words: words.slice(0, 4) });
  }
  // Two things named by one word — the side door and the balcony door — are told apart by the word before it.
  const shared = things.flatMap(thing => thing.words).filter((word, at, all) => all.indexOf(word) !== at);
  for (const thing of things) if (thing.words.length === 1 && shared.includes(thing.words[0])) {
    const before = thing.thing.split(/\s+/), at = before.lastIndexOf(thing.words[0]);
    if (at > 0 && !/^(the|a|an|his|her|their|its)$/.test(before[at - 1])) thing.words = [`${before[at - 1]} ${thing.words[0]}`];
  }
  return things.slice(0, 8);
}

/** The scene itself, without the list at its foot. */
export const sceneOf = (envelope: string): string => { const at = envelope.search(/^[#* \t]*THINGS\b.*$/im); return at < 0 ? envelope : envelope.slice(0, at); };

const names = (thing: Thing) => new RegExp(`\\b(?:${thing.words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:e?s)?\\b`, 'i');

/** Every sentence of a text that names the thing. Code alone: no judgment of what the sentence says. */
export function mentions(text: string, thing: Thing, most = 16): string[] {
  return sentencesOf(text).filter(line => names(thing).test(line)).slice(0, most);
}

/**
 * What the network is asked about a sentence, and the mark code keeps it at. Of five ways of putting the question, tried
 * on thirty sentences marked by hand, this one sorted twenty-six right; a long label that spelled out "where it is, who
 * has it" sorted thirteen, dropping "The brass lamp was on the nightstand".
 */
export const labelsFor = (thing: Thing): string[] => [`a fact about the ${thing.words[0]}`, 'a figure of speech', 'something else'];
export const LABEL_TEMPLATE = 'This sentence is about {}.';
export const KEEP_AT = 0.5;
/** A request to the network, as the host receives it: sentences in, and for each the score of the first label out. */
export interface LabelRequest { inputs: string[]; labels: string[]; template: string }

/** The part of a long sentence where the thing is named: it is that clause the author needs to see, not the whole period. */
export function around(line: string, thing: Thing, most = 200): string {
  if (line.length <= most) return line;
  const at = Math.max(0, line.search(names(thing))), from = Math.max(0, at - most / 2), cut = line.slice(from, from + most);
  return (from ? '…' : '') + cut.replace(from ? /^\S*\s+/ : /^/, '').replace(/\s+\S*$/, '') + (from + most < line.length ? '…' : '');
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
