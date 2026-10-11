import { renderPrompt, systemContract } from '../prompts';
import { contentWords, paragraphsOf, repeatedSpans, splitSentences, type RepeatedSpan } from '../analytics';
import { rerankRepetitionScore, sharedReranker, type Reranker } from '../reranker';
import { structuredResponse, type NovelLLM } from './llm';
import { currentGateMode } from './semanticGate';
import { imageSentences } from './images';
import { paragraphsWithIds } from './tracker';
import type { BookDesign, ScenePlan, StateDelta, WornImage } from './types';

/**
 * Span repair: the last line, and deliberately the smallest one.
 *
 * When a scene turns out to repeat prose the book already wrote, the expensive
 * answer is to write the scene again. That costs a full writing call, a full
 * tracking call, and — worse — a different scene, whose delta, handoff and tail
 * differ from the one the following scenes were planned against. One repetition
 * becomes a cascade.
 *
 * So nothing is rewritten but the sentences that actually duplicate. The
 * detector hands over exact spans; those spans are mapped to the sentences
 * holding them; only those sentences travel to the model, and only those
 * sentences come back. The result is spliced by exact string replacement, which
 * means a replacement that does not apply cleanly simply does not apply — the
 * scene is never left in a state nobody chose.
 *
 * The rule that makes this safe is in the prompt and enforced by the shape of
 * the call: a replacement carries the same information as the sentence it
 * replaces. Nothing happens that did not happen, so memory is untouched and the
 * repair can run before the scene is ever tracked.
 *
 * Two detectors feed it, and they see different things. Word runs catch a
 * sentence carried over intact and cost nothing. A cross-encoder catches the
 * paragraph retold in fresh words, which no amount of string matching reaches —
 * and it is the same model, at the same fitted threshold, that the pre-write
 * gate already uses on scene plans. It runs only when the local models are
 * switched on; with them off the repair is exactly what it was.
 */

export interface RepairOutcome {
  prose: string;
  /** Sentences actually replaced, oldest first. */
  repaired: { from: string; to: string }[];
  /** Duplications left standing, with the reason. */
  left: string[];
}

interface Replacement {
  original: string;
  replacement: string;
  refused_because?: string;
}

/**
 * The sentences of `prose` that hold a repeated span. One sentence may hold
 * several spans and is offered once; a span that straddles two sentences brings
 * both, because replacing half of a duplicated thought leaves the other half.
 */
export function duplicatedSentences(prose: string, spans: RepeatedSpan[]): { sentence: string; ref: string }[] {
  const sentences = splitSentences(prose);
  const found = new Map<string, string>();
  for (const span of spans) {
    const needle = span.text.toLowerCase();
    for (const sentence of sentences) {
      const normalized = sentence.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      // The span is a word sequence with punctuation already stripped, so the
      // sentence is normalized the same way before they are compared.
      if (!normalized) continue;
      const words = needle.split(' ');
      // A sentence qualifies when it holds the span or a leading part of it:
      // the span was grown across a sentence boundary and its head lands here.
      if (normalized.includes(needle) || (words.length > 4 && normalized.includes(words.slice(0, 4).join(' ')))) {
        if (!found.has(sentence)) found.set(sentence, span.ref);
      }
    }
  }
  return [...found].map(([sentence, ref]) => ({ sentence, ref }));
}

/**
 * Paragraphs of this scene that retell an earlier paragraph in different words.
 *
 * The cross-encoder decides, at the threshold fitted for it — a number measured
 * on real pairs rather than chosen, which is the whole reason to reach for the
 * model instead of inventing another constant. Content-word overlap only picks
 * which pairs are worth asking about; it never decides.
 *
 * Returns nothing at all when the models are off, when the scene is short, or
 * when the scorer fails: a repetition left standing is a blemish, and a repair
 * driven by a broken scorer is a scene nobody wrote.
 */
export async function retoldParagraphs(
  prose: string,
  earlier: { ref: string; text: string }[],
  rerank?: Reranker,
  maxPairs = 16,
): Promise<{ paragraph: string; ref: string; score: number }[]> {
  const scorer = rerank || (currentGateMode() === 'full' ? sharedReranker() : undefined);
  if (!scorer) return [];
  const mine = paragraphsOf(prose).filter(item => contentWords(item).length >= 25);
  if (!mine.length) return [];
  const theirs = earlier.flatMap(item => paragraphsOf(item.text)
    .filter(paragraph => contentWords(paragraph).length >= 25)
    .map(paragraph => ({ ref: item.ref, paragraph })));
  const pairs: { paragraph: string; ref: string; other: string }[] = [];
  for (let index = 0; index < mine.length; index++) {
    const paragraph = mine[index];
    const words = new Set(contentWords(paragraph));
    // The scene's own earlier paragraphs are candidates too. Every other
    // repetition check in the pipeline compares a scene with what came before
    // it and excludes the scene from its own comparison — necessarily, or it
    // would match itself everywhere — with the result that nothing looked
    // inside a scene at all, and a closing scene could state the same
    // realisation four times in four different sentences without repeating a
    // word run. Only paragraphs already past are offered, so the first
    // statement is never the finding; its restatements are.
    const candidates = [
      ...theirs,
      ...mine.slice(0, index).map(item => ({ ref: 'earlier in this scene', paragraph: item })),
    ];
    if (!candidates.length) continue;
    let best: { ref: string; other: string; overlap: number } | null = null;
    for (const candidate of candidates) {
      const other = contentWords(candidate.paragraph);
      const overlap = other.filter(word => words.has(word)).length / other.length;
      if (!best || overlap > best.overlap) best = { ref: candidate.ref, other: candidate.paragraph, overlap };
    }
    if (best && best.overlap > 0.12) pairs.push({ paragraph, ref: best.ref, other: best.other });
  }
  if (!pairs.length) return [];
  try {
    const scores = await scorer(pairs.slice(0, maxPairs).map(item =>
      [item.paragraph.slice(0, 1200), item.other.slice(0, 1200)] as [string, string]));
    return pairs.slice(0, maxPairs)
      .map((item, index) => ({ paragraph: item.paragraph, ref: item.ref, score: scores[index] ?? 0 }))
      .filter(item => item.score >= rerankRepetitionScore);
  } catch {
    return [];
  }
}

/**
 * How many quotation marks of each kind a piece of text opens or closes.
 *
 * Only the count, and only so a replacement can be compared with what it
 * replaces: a sentence that ended a speech and is swapped for one that does not
 * leaves every following paragraph on the wrong side of the quotation.
 */
export function quoteBalance(text: string): string {
  const straight = (text.match(/"/g) || []).length % 2;
  const open = (text.match(/[“«]/g) || []).length;
  const close = (text.match(/[”»]/g) || []).length;
  return `${straight}:${open - close}`;
}

/**
 * Find what this scene duplicates and repair only that, in place.
 *
 * Returns the prose unchanged when there is nothing to repair, when the model
 * call fails, or when no replacement applies cleanly — a failed repair is a
 * scene that still says exactly what it said, never a scene half-edited.
 */
/** One sentence to rewrite, and why: it repeats earlier text, or it carries an image the book has used up. */
export interface RewriteTarget {
  sentence: string;
  ref: string;
  image?: WornImage;
}

/** An image whose sentences in this text are to be rewritten without it; the first `keep` are left alone. */
export interface SpentImage {
  image: WornImage;
  uses: number;
  keep?: number;
}

/** The sentences of a text carrying spent images, past what each image is still allowed. */
export function imageTargets(prose: string, images: SpentImage[]): RewriteTarget[] {
  return images.flatMap(item => imageSentences(prose, item.image).slice(Math.max(0, item.keep ?? 0))
    .map(sentence => ({ sentence, ref: `the image "${item.image.image}", already used ${item.uses} time(s)`, image: item.image })));
}

/**
 * One call for every sentence that has to be rewritten in place, whatever the
 * reason. A duplicated sentence and a sentence carrying a worn image are the
 * same operation — this sentence, differently, nothing else touched — and they
 * used to be separate calls: one for the repeats, then one more for each image,
 * for each scene. Seven of the twelve small calls in a measured run were that.
 */
async function askRewrites(
  input: { design: BookDesign; summary: string; duplicatedFrom: string; targets: RewriteTarget[] },
  llm: NovelLLM,
): Promise<Replacement[]> {
  const prompt = renderPrompt('P08_SPAN_REPAIR', {
    story_contract: JSON.stringify(input.design.contract),
    style_contract: JSON.stringify(input.design.style_contract),
    narration: narrationRule(input.design),
    scene_summary: input.summary || '(no summary)',
    duplicated_from: input.duplicatedFrom || '(none)',
    sentences: input.targets.map((target, index) => (target.image
      ? `${index + 1}. (WORN IMAGE: ${target.ref} — rewrite without it) ${target.sentence}`
      : `${index + 1}. (repeats ${target.ref}) ${target.sentence}`)).join('\n\n'),
  });
  const raw = await structuredResponse(prompt, systemContract(), llm, ['replacements'], parsed => parsed,
    { temperature: 0.6, maxTokens: 4096, route: 'writer', stage: 'span-repair' }) as { replacements?: unknown };
  return Array.isArray(raw.replacements) ? raw.replacements as Replacement[] : [];
}

/**
 * Who tells the book, said to a repair call in a sentence of its own. The
 * contract travels as JSON, and a rewrite of one sentence taken out of its
 * paragraph was coming back in the third person in a book told in the first.
 */
export function narrationRule(design: BookDesign): string {
  const person = design.contract?.narrative_perspective?.trim();
  const tense = design.contract?.tense?.trim();
  if (!person && !tense) return 'Narration: keep the person and tense of the text you are given.';
  return `Narration: ${[person, tense].filter(Boolean).join('; ')}. Everything you return stays in that person and tense — a narrator who says "I" is never named or called "she" or "he" in narration.`;
}

export function toldInFirstPerson(design: BookDesign): boolean {
  return /\bfirst\b/i.test(design.contract?.narrative_perspective || '');
}

/** The sentence without what is spoken in it. */
function narrationOf(sentence: string): string {
  return sentence.replace(/["“][^"”]*["”]?/g, ' ');
}

function saysI(sentence: string): boolean {
  return /\bI\b|\b(?:me|my|mine|myself)\b/i.test(narrationOf(sentence).replace(/\bi\b/g, ' '));
}

/** Splice what came back, each replacement by exact string or not at all. */
function applyRewrites(text: string, targets: RewriteTarget[], replacements: Replacement[], shared = false, firstPerson = false): RepairOutcome & { trimmed: number } {
  let prose = text;
  const repaired: { from: string; to: string }[] = [];
  const left: string[] = [];
  let trimmed = 0;
  const wanted = new Map(targets.map(target => [target.sentence, target]));
  for (const entry of replacements) {
    const from = typeof entry?.original === 'string' ? entry.original.trim() : '';
    const to = typeof entry?.replacement === 'string' ? entry.replacement.trim() : '';
    const target = wanted.get(from);
    if (!from) continue;
    if (!prose.includes(from)) {
      // The model paraphrased the sentence it was asked to replace. Splicing on
      // a near match would edit a sentence nobody pointed at. When scenes share
      // one call, a sentence that is not here simply belongs to another scene.
      if (!shared) left.push(`"${from.slice(0, 60)}…" does not occur in the scene verbatim, so nothing was replaced`);
      continue;
    }
    // Only what was pointed at: a replacement for some other sentence is an
    // edit nobody asked for.
    if (!target) continue;
    if (!to) {
      left.push(`"${from.slice(0, 60)}…" was kept: ${entry.refused_because || 'no replacement offered'}`);
      continue;
    }
    // A replacement that still carries the sentence it replaces is not a repair;
    // spliced in, it leaves the duplication standing beside its own rewrite, and
    // the manuscript ships the pair — a line of dialogue followed immediately by
    // its own restatement, which is what this looked like when it shipped.
    if (to.includes(from)) {
      left.push(`"${from.slice(0, 60)}…" was kept: the replacement still contained it word for word`);
      continue;
    }
    // Quotation marks are load-bearing in prose and a swap can leave them odd,
    // which turns the rest of the paragraph into dialogue or out of it. Code
    // cannot judge a sentence, but it can count.
    if (quoteBalance(from) !== quoteBalance(to)) {
      left.push(`"${from.slice(0, 60)}…" was kept: the replacement would have left the paragraph's quotation marks unbalanced`);
      continue;
    }
    // The narrator's "I" gone from the narration is the narrator gone: the
    // sentence now tells the same thing about someone else.
    if (firstPerson && saysI(from) && !saysI(to)) {
      left.push(`"${from.slice(0, 60)}…" was kept: the rewrite dropped the first-person narrator`);
      continue;
    }
    // Counted, not trusted: a rewrite that still carries the image is the same
    // sentence with different words in it.
    if (target.image && imageSentences(to, target.image).length) {
      left.push(`"${from.slice(0, 60)}…" was kept: the rewrite still carried ${target.ref}`);
      continue;
    }
    prose = prose.replace(from, to);
    repaired.push({ from, to });
    if (target.image) trimmed++;
  }
  for (const target of targets) {
    if (!prose.includes(target.sentence)) continue;
    if (!left.some(item => item.startsWith(`"${target.sentence.slice(0, 60)}`))) {
      left.push(`"${target.sentence.slice(0, 60)}…" still ${target.image ? 'carries' : 'repeats'} ${target.ref}`);
    }
  }
  return { prose, repaired, left, trimmed };
}

/**
 * Find what this scene duplicates, and the spent images it carries, and repair
 * only those sentences, in place.
 *
 * Returns the prose unchanged when there is nothing to repair, when the model
 * call fails, or when no replacement applies cleanly — a failed repair is a
 * scene that still says exactly what it said, never a scene half-edited.
 */
export async function repairRepetition(
  input: {
    design: BookDesign;
    scene: ScenePlan;
    prose: string;
    earlier: { ref: string; text: string }[];
    rerank?: Reranker;
    images?: SpentImage[];
  },
  llm: NovelLLM,
): Promise<RepairOutcome & { trimmed: number }> {
  const spans = repeatedSpans(input.prose, input.earlier);
  const retold = await retoldParagraphs(input.prose, input.earlier, input.rerank);
  const targets: RewriteTarget[] = duplicatedSentences(input.prose, spans);
  // A retold paragraph is repaired sentence by sentence like any other: the
  // contract is the same — same information, different words — and splicing a
  // whole paragraph would change more of the scene than the defect occupies.
  for (const item of retold) {
    for (const sentence of splitSentences(item.paragraph)) {
      if (!targets.some(target => target.sentence === sentence)) targets.push({ sentence, ref: item.ref });
    }
  }
  for (const target of imageTargets(input.prose, input.images || [])) {
    const known = targets.find(item => item.sentence === target.sentence);
    if (known) known.image = target.image;
    else targets.push(target);
  }
  if (!targets.length) return { prose: input.prose, repaired: [], left: [], trimmed: 0 };

  let replacements: Replacement[];
  try {
    replacements = await askRewrites({
      design: input.design,
      summary: `${input.scene.function || ''}\n${input.scene.required_outcome || ''}`.trim(),
      duplicatedFrom: [
        ...spans.map(span => `Repeated word for word from ${span.ref}: "${span.text}"`),
        ...retold.map(item => `Retold in different words from ${item.ref} (paraphrase score ${item.score.toFixed(1)}): "${item.paragraph.slice(0, 240)}"`),
      ].join('\n'),
      targets,
    }, llm);
  } catch (error) {
    // A failed repair leaves a repetition in the book, which is a blemish. A
    // half-applied repair leaves a scene nobody wrote, which is worse.
    return {
      prose: input.prose,
      repaired: [],
      left: [`the repair call failed (${error instanceof Error ? error.message : error}); ${targets.length} sentence(s) stand as written`],
      trimmed: 0,
    };
  }
  return applyRewrites(input.prose, targets, replacements, false, toldInFirstPerson(input.design));
}

/**
 * Spent images across several scenes at once — a chapter's worth — in one
 * call. Each scene is spliced separately, with the sentences that are its own.
 */
export async function trimImagesAcross(
  input: { design: BookDesign; summary: string; scenes: { id: string; prose: string; targets: RewriteTarget[] }[] },
  llm: NovelLLM,
): Promise<Map<string, RepairOutcome & { trimmed: number }>> {
  const out = new Map<string, RepairOutcome & { trimmed: number }>();
  const all = input.scenes.flatMap(scene => scene.targets);
  if (!all.length) return out;
  let replacements: Replacement[];
  try {
    replacements = await askRewrites({ design: input.design, summary: input.summary, duplicatedFrom: '', targets: all }, llm);
  } catch (error) {
    const reason = `the rewrite failed (${error instanceof Error ? error.message.split('\n')[0] : error})`;
    for (const scene of input.scenes) if (scene.targets.length) out.set(scene.id, { prose: scene.prose, repaired: [], left: [reason], trimmed: 0 });
    return out;
  }
  for (const scene of input.scenes) {
    if (scene.targets.length) out.set(scene.id, applyRewrites(scene.prose, scene.targets, replacements, true, toldInFirstPerson(input.design)));
  }
  return out;
}

/**
 * Put a misspelt recorded name right, in the text, by exact string.
 *
 * The verdict that a spelling is a variant of a recorded name is the model's;
 * this only carries it out. Whole words only, so correcting "Marlo" does not
 * reach inside "Marlowe". Returns how many places changed.
 */
export function alignSpellings(prose: string, variants: { used: string; recorded: string }[]): { prose: string; changed: { used: string; recorded: string; places: number }[] } {
  let text = prose;
  const changed: { used: string; recorded: string; places: number }[] = [];
  for (const variant of variants) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${variant.used.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
    let places = 0;
    text = text.replace(pattern, () => { places++; return variant.recorded; });
    if (places) changed.push({ ...variant, places });
  }
  return { prose: text, changed };
}

export interface CondenseOutcome {
  prose: string;
  delta: StateDelta;
  /** Paragraph ids cut down in place. */
  condensed: string[];
  left: string[];
}

/**
 * A beat the book already has, cut down where it stands.
 *
 * The answer to a scene that stages something again used to be the scene
 * written again: a full writing call and a full extraction, and a different
 * scene at the end of them. But the charge arrives with the paragraphs that
 * stage the beat, and those are all that is wrong with the scene. Each is
 * rewritten to at most a sentence that leans on the earlier event and keeps
 * whatever else the paragraph carried, and is put back by its id — one
 * paragraph for one paragraph, so every other record of the scene still points
 * where it pointed. A rewrite that is not clearly shorter, or that leaves a
 * quotation open, is not applied.
 *
 * Memory is corrected by subtraction, not by reading the scene again: an event
 * whose only evidence was a paragraph that no longer stages it is dropped from
 * the delta. The earlier record already holds it.
 */
export async function condenseRestaged(
  input: { design: BookDesign; prose: string; delta: StateDelta; restaged: { beat: string; earlier: string; paragraphs: string[] }[] },
  llm: NovelLLM,
): Promise<CondenseOutcome> {
  const paragraphs = paragraphsWithIds(input.prose);
  const byId = new Map(paragraphs.map(item => [item.id, item.text]));
  const wanted = [...new Set(input.restaged.flatMap(item => item.paragraphs))].filter(id => byId.has(id));
  if (!wanted.length) return { prose: input.prose, delta: input.delta, condensed: [], left: [] };
  const prompt = renderPrompt('P09_BEAT_CONDENSE', {
    story_contract: JSON.stringify(input.design.contract),
    style_contract: JSON.stringify(input.design.style_contract),
    narration: narrationRule(input.design),
    restaged: input.restaged.map(item => `- ${item.beat} — already on record as ${item.earlier}; staged again in ${item.paragraphs.join(', ')}`).join('\n'),
    paragraphs: wanted.map(id => `[${id}] ${byId.get(id)}`).join('\n\n'),
  });
  let replacements: { paragraph?: unknown; replacement?: unknown; refused_because?: unknown }[];
  try {
    const raw = await structuredResponse(prompt, systemContract(), llm, ['replacements'], parsed => parsed,
      { temperature: 0.5, maxTokens: 4096, route: 'writer', stage: 'beat-condense' }) as { replacements?: unknown };
    replacements = Array.isArray(raw.replacements) ? raw.replacements as typeof replacements : [];
  } catch (error) {
    return { prose: input.prose, delta: input.delta, condensed: [], left: [`the rewrite failed (${error instanceof Error ? error.message.split('\n')[0] : error}); ${wanted.length} paragraph(s) stand as written`] };
  }
  const condensed: string[] = [];
  const left: string[] = [];
  for (const entry of replacements) {
    const id = typeof entry?.paragraph === 'string' ? (/p\d+/i.exec(entry.paragraph)?.[0] || '').toLowerCase() : '';
    const to = typeof entry?.replacement === 'string' ? entry.replacement.replace(/\s*\n\s*\n\s*/g, ' ').trim() : '';
    const from = byId.get(id);
    if (!from || !wanted.includes(id) || condensed.includes(id)) continue;
    if (!to) { left.push(`${id} was kept: ${typeof entry?.refused_because === 'string' && entry.refused_because.trim() || 'no rewrite offered'}`); continue; }
    if (to.length > from.length * 0.75) { left.push(`${id} was kept: the rewrite was not clearly shorter`); continue; }
    if (quoteBalance(to) !== quoteBalance(from)) { left.push(`${id} was kept: the rewrite would have left a quotation open`); continue; }
    byId.set(id, to);
    condensed.push(id);
  }
  for (const id of wanted) {
    if (!condensed.includes(id) && !left.some(item => item.startsWith(`${id} `))) left.push(`${id} came back with no rewrite`);
  }
  if (!condensed.length) return { prose: input.prose, delta: input.delta, condensed, left };
  const gone = new Set(condensed);
  const onlyThere = (refs: unknown): boolean => Array.isArray(refs) && refs.length > 0 && refs.every(ref => gone.has(String(ref)));
  return {
    prose: paragraphs.map(item => byId.get(item.id)!).join('\n\n'),
    delta: {
      ...input.delta,
      events: input.delta.events.filter(event => !onlyThere(event.evidence_refs)),
      restaged_beats: [],
    },
    condensed,
    left,
  };
}
