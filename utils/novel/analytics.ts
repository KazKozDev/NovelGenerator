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
const RU_STOP = new Set(
  'и,в,во,не,что,он,на,я,с,со,как,а,то,все,она,так,его,но,да,ты,к,у,же,вы,за,бы,по,только,ее,мне,было,вот,от,меня,еще,нет,о,из,ему,теперь,когда,даже,ну,вдруг,ли,если,уже,или,ни,быть,был,была,было,есть,этот,эта,этого,который,которые,которая,себя,тебя,нас,вас,них,него,нее,это,того,такой,такая,такие,весь,вся,сам,сама,можно,надо,лишь,хоть,пусть,ведь,уж,впрочем,однако,потому,поэтому,чтобы,хотя,будто,словно,вроде,весьма,очень,слишком,более,менее,самый,мой,моя,твой,твоя,наш,ваш,его,ее,их,тот,сколько,столько,здесь,там,тут,туда,сюда,оттуда,отсюда,тогда,потом,сейчас,теперь,сегодня,вчера,завтра,всегда,никогда,иногда,часто,редко,почти,совсем,именно,прямо,просто,лишь,даже,уже,еще,пока,едва,чуть,снова,опять,затем,вдоль,вокруг,против,между,через,сквозь,после,перед,до,без,для,ради,вместо,кроме,среди,мимо,около,возле,рядом,внутри,снаружи,вверх,вниз,вперед,назад,домой,сюда,туда,сказал,сказала,говорит,словно,будто'.split(','),
);

const wordsOf = (text: string): string[] =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

const isContentWord = (word: string): boolean => !EN_STOP.has(word) && !RU_STOP.has(word);

/** Content words (no stopwords): the overlap currency of the pre-write gate. */
export function contentWords(text: string): string[] {
  return wordsOf(text).filter(isContentWord);
}

/** Lowercased stopword check shared with name extraction. */
export function isStopWord(word: string): boolean {
  const lower = word.toLowerCase();
  return EN_STOP.has(lower) || RU_STOP.has(lower);
}

const NAME_SPAN = /[\p{Lu}][\p{L}\p{M}'-]*(?:\s+[\p{Lu}][\p{L}\p{M}'-]*)*/gu;

/**
 * Proper-name candidates from a premise: capitalized spans with stopword
 * parts trimmed. Sentence position alone never qualifies or disqualifies —
 * the stopword filter does that work ("After" drops out, "Zor" stays
 * wherever it stands).
 */
export function extractPremiseNames(premise: string): string[] {
  const found: string[] = [];
  for (const match of premise.matchAll(NAME_SPAN)) {
    // Possessive tails folded: the registry holds "Zor", never "Zor's".
    const parts = match[0].split(/\s+/)
      .map(part => part.replace(/['’][sS]$/, ''))
      .filter(part => part && !isStopWord(part) && part.length > 1);
    if (!parts.length) continue;
    const name = parts.join(' ');
    if (!found.includes(name)) found.push(name);
  }
  return found;
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

export interface TiredPhrase {
  phrase: string;
  uses: number;
}

/**
 * Phrases the finished manuscript already wore out, across chapter texts:
 * the writer's watch list for the next scene. Same detector as the texture
 * motifs, higher bar — a phrase earns the list at four uses, not three.
 */
export function tiredPhrases(texts: string[], minUses = 4, maxPhrases = 5): TiredPhrase[] {
  return recurrentMotifs(texts.filter(text => text.trim()).join('\n\n'), { minSentences: minUses, maxFindings: maxPhrases })
    .map(item => ({ phrase: item.phrase, uses: item.sentences }));
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

const QUOTE_RUN = /"([^"]+)"|“([^”]+)”|«([^»]+)»/g;
const COMPARISON = /\blike (a|an|the)\b|\bas \w+ as\b|\bas if\b|\bas though\b|\bсловно\b|\bбудто\b|\bкак будто\b|\bвроде\b/gi;
const SPEECH_TAG = /\b(said|asked|answered|replied|shouted|whispered|muttered|snapped|сказал(?:а)?|спросил(?:а)?|ответил(?:а)?|прошептал(?:а)?|крикнул(?:а)?)\b/i;

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
    if (!quotes.length) continue;
    quotedLines++;
    for (const match of quotes) {
      const spoken = match.slice(1).find(Boolean) || '';
      quotedWords += wordsOf(spoken).length;
    }
    if (SPEECH_TAG.test(paragraph)) taggedLines++;
  }
  const comparisons = content.match(COMPARISON)?.length || 0;
  return {
    dialogueShare: totalWords ? quotedWords / totalWords : 0,
    medianParagraphWords: median(paragraphs.map(paragraph => wordsOf(paragraph).length)),
    similesPer1000: totalWords ? (comparisons / totalWords) * 1000 : 0,
    taggedSpeechShare: quotedLines ? taggedLines / quotedLines : 0,
  };
}
