/**
 * Advisory prose analytics: originality, motifs, rhythm, hook, texture.
 *
 * Pure string functions with no model calls and no pipeline dependencies.
 * The motif/rhythm/hook/originality detectors keep the original formulas
 * (recurring 4-grams across distinct sentences, first-vs-last-third medians,
 * opening-150-words hook markers, unique n-gram ratio); the texture numbers
 * feeding the MEASURED bar are compact equivalents computed the same way the
 * labels read. Everything here is advisory-only: it never blocks, repairs,
 * or rewrites — it feeds the dashboard and the reader's judgment.
 */

const EN_STOP = new Set(
  'a,an,the,and,or,but,if,then,else,when,while,of,at,by,for,with,about,into,through,during,before,after,above,below,to,from,up,down,in,out,on,off,over,under,again,further,once,here,there,all,any,both,each,few,more,most,other,some,such,no,nor,not,only,own,same,so,than,too,very,can,will,just,don,should,now,i,me,my,we,our,you,your,he,him,his,she,her,it,its,they,them,their,what,which,who,whom,this,that,these,those,am,is,are,was,were,be,been,being,have,has,had,having,do,does,did,doing,would,could,ought,as,until,because,while,although,though,since,despite,toward,towards,among,between,per,via,said,say,says,like,well,even,ever,never,still,yet,already,also,back,down,up,out,away,around,again,once,twice,one,two,three,very,really,quite,rather,almost,nearly,hardly,scarcely,merely,mostly,near,far,here,there,where,when,why,how'.split(','),
);
const wordsOf = (text: string): string[] =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

const isContentWord = (word: string): boolean => !EN_STOP.has(word);

/** Content words (no stopwords): the overlap currency of the pre-write gate. */
export function contentWords(text: string): string[] {
  return wordsOf(text).filter(isContentWord);
}

/** Lowercased stopword check shared with name extraction. */
export function isStopWord(word: string): boolean {
  return EN_STOP.has(word.toLowerCase());
}

const NAME_SPAN = /[\p{Lu}][\p{L}\p{M}'-]*(?:\s+[\p{Lu}][\p{L}\p{M}'-]*)*/gu;

/**
 * Proper-name candidates: capitalized spans with stopword parts trimmed.
 *
 * `requireFreeCapital` is what makes this safe to point at prose rather than at
 * a premise. A premise is two sentences, so a stopword filter is enough to keep
 * its sentence openers out. Fourteen thousand words of prose have thousands of
 * openers, and the filter lets through every capitalized word that is not a
 * stopword — "Nothing", "Static", "Listen", "Us", "Ten", "Don't" — which then
 * reach the writer as names of the story that must be spelled exactly so.
 *
 * A proper name is a word capitalized where capitalization is not forced. Vera,
 * Crestline and Arthur all occur capitalized inside a sentence; Nothing, Static
 * and Us never do. That is the whole test, it needs no word list, and it is the
 * difference between a registry of the book's names and a registry of its
 * sentence beginnings.
 */
export function extractPremiseNames(premise: string, requireFreeCapital = false): string[] {
  const free = requireFreeCapital ? capitalizedMidSentence(premise) : null;
  const found: string[] = [];
  for (const match of premise.matchAll(NAME_SPAN)) {
    // Possessive and contraction tails folded: the registry holds the bare name.
    const parts = match[0].split(/\s+/)
      .map(part => part.replace(/['’](s|re|ve|ll|d|m|t)$/i, '').replace(/n['’]$/i, ''))
      .filter(part => part && !isStopWord(part) && part.length > 1);
    if (!parts.length) continue;
    if (free && !parts.some(part => free.has(part))) continue;
    const name = parts.join(' ');
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

/** Words this text capitalizes somewhere other than after a full stop. */
export function capitalizedMidSentence(text: string): Set<string> {
  const free = new Set<string>();
  for (const sentence of text.split(/(?<=[.!?…"”«»])\s+|\n+/)) {
    for (const token of sentence.trim().split(/\s+/).slice(1)) {
      const word = token.replace(/^[^\p{L}]+/u, '').replace(/[^\p{L}'’]+$/u, '')
        .replace(/['’](s|re|ve|ll|d|m|t)$/i, '').replace(/n['’]$/i, '');
      if (word.length > 1 && /^\p{Lu}/u.test(word)) free.add(word);
    }
  }
  return free;
}

export function splitSentences(content: string): string[] {
  return content
    .split(/(?<=[.!?…])\s+|\n\s*\n/)
    .map(item => item.trim())
    .filter(item => wordsOf(item).length >= 3);
}

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function paragraphsOf(text: string): string[] {
  return text.split(/\n\s*\n/).map(item => item.trim()).filter(Boolean);
}

function ngrams(words: string[], n: number): string[] {
  if (words.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i <= words.length - n; i++) out.push(words.slice(i, i + n).join(' '));
  return out;
}

/** Share of unique n-grams (default 4-grams). Higher means less formulaic phrasing. */
export function uniqueNgramRatio(text: string, n = 4): number {
  const grams = ngrams(wordsOf(text), n);
  if (!grams.length) return 1;
  return new Set(grams).size / grams.length;
}

export interface MotifFinding {
  phrase: string;
  sentences: number;
  quotes: string[];
}

export interface MotifOptions {
  minSentences?: number;
  n?: number;
  maxFindings?: number;
}

/**
 * Distinctive phrases recurring across distinct sentences.
 *
 * Counts distinct sentences, not raw occurrences, so a refrain circled
 * three times in different paragraphs is one finding with sentences=3 —
 * exactly the inertia defect. N-grams built mostly from stopwords are
 * skipped, so ordinary glue ("and then he went to") never reports.
 */
export function recurrentMotifs(content: string, options: MotifOptions = {}): MotifFinding[] {
  const { minSentences = 3, n = 4, maxFindings = 8 } = options;
  const sentences = splitSentences(content);
  const wordLists = sentences.map(wordsOf);
  const index = new Map<string, Set<number>>();
  wordLists.forEach((words, sentenceIndex) => {
    for (let start = 0; start + n <= words.length; start++) {
      const gram = words.slice(start, start + n);
      if (gram.filter(isContentWord).length < 2) continue;
      const key = gram.join(' ');
      let holders = index.get(key);
      if (!holders) index.set(key, (holders = new Set()));
      holders.add(sentenceIndex);
    }
  });
  const candidates = [...index]
    .filter(([, holders]) => holders.size >= minSentences)
    .sort((first, second) => second[1].size - first[1].size || first[0].localeCompare(second[0]));
  // Suppress sliding-window duplicates of one longer repeated phrase: grams
  // with an identical sentence set that overlap word-for-word keep one row.
  const selected: { phrase: string; holders: Set<number> }[] = [];
  for (const [phrase, holders] of candidates) {
    const phraseWords = new Set(phrase.split(' '));
    const duplicate = selected.some(item => {
      if (item.holders.size !== holders.size) return false;
      for (const index of holders) if (!item.holders.has(index)) return false;
      const itemWords = new Set(item.phrase.split(' '));
      let shared = 0;
      for (const word of phraseWords) if (itemWords.has(word)) shared++;
      return shared >= n - 1;
    });
    if (!duplicate) selected.push({ phrase, holders });
    if (selected.length >= maxFindings) break;
  }
  return selected.map(item => ({
    phrase: item.phrase,
    sentences: item.holders.size,
    quotes: [...item.holders].slice(0, 2).map(index => sentences[index]),
  }));
}

export interface WornPhrase {
  phrase: string;
  uses: number;
  per1000: number;
}

/**
 * Short phrases the book leans on as a formula.
 *
 * The 4-gram motif detector above counts distinct sentences and needs two
 * content words inside four, so it sees a circled refrain and misses the tic
 * that actually marks generated prose: a short somatic
 * beat of two ordinary words — reused every few pages inside different
 * sentences. This counts raw uses of 2- and 3-word content phrases across the
 * whole manuscript and reports the ones that recur at a rate, not merely a
 * count, so a long book is not flagged for what a short one would be.
 *
 * Measured, not judged: a deliberate refrain and a verbal tic look identical
 * here, which is why the finding reports a rate and never blocks.
 */
export function wornPhrases(content: string, minUses = 4, minPer1000 = 0.5, maxPhrases = 6): WornPhrase[] {
  const total = wordsOf(content).length;
  if (total < 500) return [];
  const counts = new Map<string, number>();
  for (const sentence of splitSentences(content)) {
    // Case is kept while tokenizing: a capitalized word is a name or the book's
    // own invented term, and a book repeating its subject is not a tic.
    // Possessives and contractions fold into the word rather than splitting
    // into "harry s" and "didn t".
    const tokens = sentence
      .replace(/n['’]t\b/gi, ' not')
      .replace(/['’](s|re|ve|ll|d|m)\b/gi, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    const usable = tokens.map(token => {
      const lower = token.toLowerCase();
      if (token[0] !== lower[0]) return null;
      return isContentWord(lower) && lower.length > 1 ? lower : null;
    });
    for (let size = 2; size <= 3; size++) {
      for (let start = 0; start + size <= usable.length; start++) {
        const gram = usable.slice(start, start + size);
        if (gram.some(word => word === null)) continue;
        const key = gram.join(' ');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  const flagged = [...counts]
    .map(([phrase, uses]) => ({ phrase, uses, per1000: (uses / total) * 1000 }))
    .filter(item => item.uses >= minUses && item.per1000 >= minPer1000)
    .sort((first, second) => second.uses - first.uses || first.phrase.localeCompare(second.phrase));
  // A three-word run that only reports because the two-word tic inside it does
  // is the same finding said twice; the shorter, more frequent one wins.
  const kept: WornPhrase[] = [];
  for (const item of flagged) {
    if (kept.some(seen => item.phrase.includes(seen.phrase))) continue;
    kept.push(item);
    if (kept.length >= maxPhrases) break;
  }
  return kept;
}

export interface RhythmReport {
  sentences: number;
  firstMedian: number;
  lastMedian: number;
  drifted: boolean;
}

/**
 * First-third vs last-third sentence rhythm.
 *
 * Flags only a collapse, not a quickening: the closing movement must be
 * under 60% of the opening median AND terse in absolute terms (<=10
 * words). Needs >=12 sentences; short texts never report.
 */
export function rhythmDrift(content: string): RhythmReport {
  const lengths = splitSentences(content).map(sentence => wordsOf(sentence).length);
  if (lengths.length < 12) {
    const whole = median(lengths);
    return { sentences: lengths.length, firstMedian: whole, lastMedian: whole, drifted: false };
  }
  const third = Math.floor(lengths.length / 3);
  const firstMedian = median(lengths.slice(0, third));
  const lastMedian = median(lengths.slice(lengths.length - third));
  const drifted = firstMedian >= 14 && lastMedian <= 10 && lastMedian < firstMedian * 0.6;
  return { sentences: lengths.length, firstMedian, lastMedian, drifted };
}

const HOOK_MARKERS =
  /(you|i must|we have until|deadline|threat|danger|kill|escape|run|choose|decide|secret|lie|truth|missing|stolen|dead|arrest|attack|fire|alarm|chase|knife|gun|trial|verdict|\?)/i;

/** Heuristic 0–10 score for whether the opening ~150 words hook through action, conflict or a question. */
export function hookScore(content: string): number {
  const opening = content.trim().split(/\s+/).slice(0, 150).join(' ');
  if (!opening) return 0;
  let score = 4;
  if (/^(the |a |an |it was |there was |in the )/i.test(opening)) score -= 1;
  if (HOOK_MARKERS.test(opening)) score += 3;
  if (/\?/.test(opening)) score += 1;
  if (/\b(said|shouted|whispered|asked|answered|replied)\b/i.test(opening)) score += 1;
  return Math.max(0, Math.min(10, score));
}

const RECAP_OPENERS =
  /^(in summary|in conclusion|as we have seen|the moral of|and so they (rested|talked|agreed)|they decided to rest)\b/i;

/** True when the chapter closes with a recap instead of a forward push. */
export function isRecapEnding(content: string): boolean {
  const paragraphs = paragraphsOf(content);
  const last = (paragraphs.at(-1) || content.trim().split(/(?<=[.!?])\s+/).at(-1) || '').trim();
  return RECAP_OPENERS.test(last) || /summar(y|ize|ise) (what|everything|the (scene|chapter)).{0,80}$/i.test(last);
}

export interface AdvisoryFinding {
  id: 'weak-opening-hook' | 'recap-ending';
  detail: string;
}

/**
 * Bestseller surface check, advisory only by design. Never blocks acceptance
 * or triggers repairs: for reports and the dashboard only.
 */
export function bestsellerAdvisory(content: string): AdvisoryFinding[] {
  if (!content.trim()) return [];
  const findings: AdvisoryFinding[] = [];
  if (hookScore(content) < 5) {
    findings.push({
      id: 'weak-opening-hook',
      detail: 'The opening ~150 words do not hook through action, conflict or a question.',
    });
  }
  if (isRecapEnding(content)) {
    findings.push({
      id: 'recap-ending',
      detail: 'The chapter closes with a summary of what the scene meant rather than a forward push.',
    });
  }
  return findings;
}

/**
 * Distinctive phrasing a plan shares with already written prose.
 *
 * Slides content-word 4-grams from the plan text over the chapter and merges
 * overlaps into maximal runs. Keeps a run with 3+ content words, or two
 * distinct runs with 2+ — a single shared pair is coincidence, a triplet or
 * a pair of pairs is a staging about to be restaged. Returns at most a few
 * phrases, longest first, for evidence.
 */
export function sharedDistinctivePhrasing(planText: string, chapterText: string, maxPhrases = 3): string[] {
  const chapterWords = wordsOf(chapterText);
  const chapterSeq = ` ${chapterWords.join(' ')} `;
  const planWords = wordsOf(planText);
  const hits: { start: number; end: number }[] = [];
  for (let start = 0; start + 4 <= planWords.length; start++) {
    const gram = planWords.slice(start, start + 4);
    if (gram.filter(isContentWord).length < 2) continue;
    if (chapterSeq.includes(` ${gram.join(' ')} `)) hits.push({ start, end: start + 4 });
  }
  // Merge overlaps into maximal runs.
  hits.sort((a, b) => a.start - b.start);
  const runs: { start: number; end: number }[] = [];
  for (const hit of hits) {
    const last = runs.at(-1);
    if (last && hit.start <= last.end) last.end = Math.max(last.end, hit.end);
    else runs.push({ ...hit });
  }
  const contentCount = (run: { start: number; end: number }) =>
    planWords.slice(run.start, run.end).filter(isContentWord).length;
  const strong = runs.filter(run => contentCount(run) >= 3);
  const weak = runs.filter(run => contentCount(run) === 2);
  const kept = [...strong, ...(strong.length ? [] : weak.slice(0, 2))];
  if (strong.length === 0 && weak.length < 2) return [];
  return kept
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
    .slice(0, maxPhrases)
    .map(run => planWords.slice(run.start, run.end).join(' '));
}

export interface TextureReport {
  dialogueShare: number;
  medianParagraphWords: number;
  similesPer1000: number;
  taggedSpeechShare: number;
}

const QUOTE_RUN = /"([^"]+)"|“([^”]+)”/g;
const COMPARISON = /\blike (a|an|the)\b|\bas \w+ as\b|\bas if\b|\bas though\b/gi;
const SPEECH_TAG = /\b(said|asked|answered|replied|shouted|whispered|muttered|snapped)\b/i;

/**
 * The MEASURED bar: share of words inside quotes, median paragraph length,
 * comparisons per thousand words, and the share of quoted lines carrying a
 * speech beat. Straight string counting over the shown text.
 */
export function measureTexture(content: string): TextureReport {
  const paragraphs = paragraphsOf(content);
  const totalWords = wordsOf(content).length;
  let quotedWords = 0;
  let quotedLines = 0;
  let taggedLines = 0;
  for (const paragraph of paragraphs) {
    const quotes = [...paragraph.matchAll(QUOTE_RUN)];
    if (quotes.length) {
      quotedLines++;
      for (const match of quotes) {
        const spoken = match.slice(1).find(Boolean) || '';
        quotedWords += wordsOf(spoken).length;
      }
      if (SPEECH_TAG.test(paragraph)) taggedLines++;
    }
  }
  const comparisons = content.match(COMPARISON)?.length || 0;
  return {
    dialogueShare: totalWords ? quotedWords / totalWords : 0,
    medianParagraphWords: median(paragraphs.map(paragraph => wordsOf(paragraph).length)),
    similesPer1000: totalWords ? (comparisons / totalWords) * 1000 : 0,
    taggedSpeechShare: quotedLines ? taggedLines / quotedLines : 0,
  };
}

export interface TicReport {
  id: 'antithesis' | 'uniform-openings' | 'flat-rhythm';
  detail: string;
  rate: number;
}

const ANTITHESIS = [
  // "It was not a knock. It was the preparation for one."
  /\bnot\s+(?:a|an|the)\b[^.!?]{0,80}[.!?]\s+(?:It|That|This|He|She|They)\s+(?:was|were|is|are)\b/g,
  // "not a detector, but a ban list"
  /\bnot\s+(?:a|an|the)?\s*\w[^,.!?]{0,60},\s*but\b/g,
];

/**
 * Signature tics: the shapes a generated manuscript repeats that no reviewer
 * reading for what happens will ever report.
 *
 * A model reads a book at the altitude of events, where "it was not a knock, it
 * was the preparation for one" occurring forty times is not an event. A reader
 * feels it by chapter three. The difference between those two facts is what
 * this function exists to close, and it closes it with regular expressions and
 * arithmetic — no model call, microseconds, and the same answer every run.
 *
 * Rates, never verdicts. One antithesis is a good sentence; two per thousand
 * words is a formula, and the caller decides what to do about it.
 *
 * The rates below are judgements, not measurements — unlike the run length in
 * `repeatedSpans`, which was measured across finished books. Fitting these
 * would need published prose of the same kind to compare against; fitting them
 * on this pipeline's own output would set the line at whatever it already does.
 */
export function signatureTics(content: string): TicReport[] {
  const total = wordsOf(content).length;
  if (total < 400) return [];
  const findings: TicReport[] = [];

  const antitheses = ANTITHESIS.reduce((sum, pattern) => sum + (content.match(pattern)?.length || 0), 0);
  const antithesisRate = (antitheses / total) * 1000;
  if (antitheses >= 4 && antithesisRate >= 1.2) {
    findings.push({
      id: 'antithesis',
      detail: `The "it was not X, it was Y" construction appears ${antitheses} times (${antithesisRate.toFixed(1)} per 1000 words). Once it defines; at this rate it is the prose's default gear, and every definition it makes reads as the same gesture.`,
      rate: antithesisRate,
    });
  }

  const sentences = splitSentences(content);
  if (sentences.length >= 20) {
    const openings = new Map<string, number>();
    for (const sentence of sentences) {
      const first = wordsOf(sentence)[0];
      if (first) openings.set(first, (openings.get(first) || 0) + 1);
    }
    const [word, count] = [...openings].sort((first, second) => second[1] - first[1])[0] || ['', 0];
    const share = count / sentences.length;
    if (share >= 0.22) {
      findings.push({
        id: 'uniform-openings',
        detail: `${Math.round(share * 100)}% of sentences open on "${word}" (${count} of ${sentences.length}). A paragraph of them reads as a list of things one person did.`,
        rate: share,
      });
    }
  }

  if (sentences.length >= 30) {
    const lengths = sentences.map(sentence => wordsOf(sentence).length);
    const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    const deviation = Math.sqrt(lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length);
    const variation = mean ? deviation / mean : 0;
    if (variation < 0.42) {
      findings.push({
        id: 'flat-rhythm',
        detail: `Sentence length barely varies (mean ${mean.toFixed(0)} words, variation ${variation.toFixed(2)}). Prose at one length has one speed, and a reader stops hearing where the emphasis is meant to fall.`,
        rate: variation,
      });
    }
  }

  return findings;
}

export interface NumericClash {
  context: string;
  values: string[];
  refs: string[];
}

const NUMBER_SPAN = /\b(\d{3,}(?:[.,]\d+)?)\b/g;

/**
 * The same thing given two different numbers in two different places.
 *
 * A founding year given one way on page one and another way on page thirty is a defect no
 * state tracker sees, because the number was never extracted into memory as a
 * fact — it was scenery. Code can see it without understanding anything: take
 * every number and the nearest content word before it, and report a context
 * that carries two different values.
 *
 * Advisory by construction. "Page 12" and "page 40" are both correct, and this
 * cannot tell them from a founding date that moved — so it asks rather than
 * accuses, and the caller keeps it out of anything that blocks.
 */
export function numericContradictions(chapters: { ref: string; text: string }[], maxFindings = 5): NumericClash[] {
  const seen = new Map<string, Map<string, Set<string>>>();
  for (const chapter of chapters) {
    // Scanned over the raw text rather than over sentences on purpose: an
    // abbreviation ends a sentence for any splitter, and the
    // number would then be left with nothing in front of it — which is exactly
    // the case this check exists for.
    for (const match of chapter.text.matchAll(NUMBER_SPAN)) {
      {
        const value = match[1].replace(/[.,]$/, '');
        const window = chapter.text.slice(Math.max(0, (match.index ?? 0) - 60), match.index ?? 0);
        const anchor = contentWords(window).at(-1);
        if (!anchor || anchor.length < 3 || /^\d+$/.test(anchor)) continue;
        const byValue = seen.get(anchor) || new Map<string, Set<string>>();
        const refs = byValue.get(value) || new Set<string>();
        refs.add(chapter.ref);
        byValue.set(value, refs);
        seen.set(anchor, byValue);
      }
    }
  }
  const clashes: NumericClash[] = [];
  for (const [context, byValue] of seen) {
    if (byValue.size < 2) continue;
    const refs = [...new Set([...byValue.values()].flatMap(set => [...set]))];
    clashes.push({ context, values: [...byValue.keys()].sort(), refs });
  }
  return clashes
    .sort((first, second) => second.values.length - first.values.length || first.context.localeCompare(second.context))
    .slice(0, maxFindings);
}

export interface RepeatedSpan {
  /** The repeated text, as this scene wrote it. */
  text: string;
  /** Where it was already written. */
  ref: string;
}

/**
 * Runs of words this scene shares verbatim with prose already accepted.
 *
 * The exact spans, not a score: a caller that knows which sentences duplicate
 * earlier text can repair those sentences and leave the rest of the scene
 * standing — no new delta, no recomputed handoff, no cascade into the scenes
 * that follow. That is the whole economic argument for catching repetition
 * here rather than by re-writing the scene.
 *
 * `minWords` is the run length that counts as a duplicate rather than as
 * English, and it is measured rather than chosen. Two finished books from the
 * same writer — different stories, so nothing they share is one of them
 * repeating itself — share 140 runs of four words, 40 of five, 12 of six, 7 of
 * seven, 3 of eight and 2 of nine. The four-to-six band is idiom and chance.
 * At eight the hits stop being coincidence and become either the premise's own
 * nouns or the model's own habit ("a sound that might have been a laugh"),
 * which is exactly what this is for. Below eight the check would fire on
 * ordinary English; above nine it would miss a sentence carried over whole.
 */
export function repeatedSpans(prose: string, earlier: { ref: string; text: string }[], minWords = 8, maxSpans = 6): RepeatedSpan[] {
  const words = wordsOf(prose);
  if (words.length < minWords) return [];
  const haystacks = earlier
    .filter(item => item.text.trim())
    .map(item => ({ ref: item.ref, sequence: ` ${wordsOf(item.text).join(' ')} ` }));
  if (!haystacks.length) return [];
  const runs: { start: number; end: number; ref: string }[] = [];
  let index = 0;
  while (index + minWords <= words.length) {
    const gram = words.slice(index, index + minWords).join(' ');
    const hit = haystacks.find(item => item.sequence.includes(` ${gram} `));
    if (!hit) { index++; continue; }
    // Grow the match as far as it still occurs, so the report names the whole
    // duplicated sentence rather than an arbitrary window inside it.
    let end = index + minWords;
    while (end < words.length && hit.sequence.includes(` ${words.slice(index, end + 1).join(' ')} `)) end++;
    runs.push({ start: index, end, ref: hit.ref });
    index = end;
  }
  return runs.slice(0, maxSpans).map(run => ({ text: words.slice(run.start, run.end).join(' '), ref: run.ref }));
}
