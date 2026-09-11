/**
 * Coherence detectors and prompt blocks for three defect classes the
 * sentence-level checks cannot see:
 *
 * 1. Metaphor / speech-pattern inertia — a striking phrase or image that
 *    returns unchanged (or in fresh synonyms) until it loses its weight.
 * 2. Spatial logic failure — objects appearing, moving or changing
 *    properties without established means; characters perceiving what
 *    their position withholds. Detected at planning/review time via an
 *    explicit staging line, not by string matching.
 * 3. Rhythmic drift — dense cinematic prose collapsing into telegraphic
 *    fragments toward the climax. Measured as first-third vs last-third
 *    sentence rhythm.
 *
 * All detectors are advisory-only by design (see bestsellerAdvisory in
 * diversity.ts for why): they never enter mechanicalIssues, never block
 * acceptance and never trigger repairs. They feed reports, dashboards
 * and pipeline metrics.
 */

export const COHERENCE_RULES = `COHERENCE (binding):
- MOTIF DISCIPLINE: a distinctive image, comparison or refrain may recur only with a changed meaning or consequence. Restating it in fresh synonyms to fill space is repetition, and the third unchanged use is always cut.
- SPATIAL STAGING: the plan's staging line is binding. No object appears, moves or changes properties without established means on the page; no character sees, hears or uses what their position withholds.
- SUSTAINED RHYTHM: the closing movement may quicken, but it must not collapse into fragments, drop function words, or turn into a list of actions. Every beat of the climax is dramatized on the page, not summarized.
- PERSISTING CONDITIONS: darkness, restraint, smoke, water, an injured hand, a locked door persist until the page changes them, and while one holds nobody performs an act it forbids — nor may such an act be reported afterwards as having happened under it. Changing a condition happens on the page and costs something.
- FIXED QUANTITIES: an age, a length of service, a distance, an interval is given once and keeps its value. A figure the canon does not establish is not invented to give a sentence weight.`;

/**
 * Planning-time clause: each scene opens with its physical facts fixed.
 *
 * The staging line began as position and reach, which answers "could he see it" and leaves "could he
 * do it" open — and the second question is where the retcons live. A scene planned in total darkness
 * with a forged pass among its key moments will be written with the forgery in it, because the plan
 * asked for both and nothing compared them; the writer then either performs the impossible act or
 * quietly drops the darkness. The comparison belongs here, before a word of prose exists.
 */
export const PLANNING_COHERENCE = `For each scene add one staging line: where every present character stands, which key objects are within sight or reach as the scene opens, and which physical conditions constrain action there — light, restraint, noise, air, injury, a closed door, a moving vehicle. Then check the scene's own key moments against that line: if a planned moment requires an act those conditions forbid, either plan the change of conditions as a moment of its own, with its cost, or plan a different act. A motif from an earlier chapter may return only with a new consequence.`;

/** Validator clause, appended to the review dimensions. */
export const REVIEW_COHERENCE = ` spatial staging (no object appears, moves or changes properties without established means on the page; no character perceives what their position withholds), persisting physical conditions (an act performed, or later reported as performed, under darkness, restraint, smoke, water or injury that the page never lifted — a condition is changed on the page or it still holds), quantities that keep their value (an age, a length of service, an interval or a distance given one value and then another, or a specific figure the canon never established), proper names spelled exactly as the canon and character design spell them (a variant spelling, an unestablished surname or nickname, or a person named who exists in no design), narration that holds the contract's tense and carries no trace of the planning apparatus (scene or beat labels, plan field names, bracketed directives, or a sentence instructing rather than narrating), descriptions that state what is there rather than defining it by what it is not, sustained sentence rhythm through the closing movement,`;

const EN_STOP = new Set(
  'a,an,the,and,or,but,if,then,else,when,while,of,at,by,for,with,about,into,through,during,before,after,above,below,to,from,up,down,in,out,on,off,over,under,again,further,once,here,there,all,any,both,each,few,more,most,other,some,such,no,nor,not,only,own,same,so,than,too,very,can,will,just,don,should,now,i,me,my,we,our,you,your,he,him,his,she,her,it,its,they,them,their,what,which,who,whom,this,that,these,those,am,is,are,was,were,be,been,being,have,has,had,having,do,does,did,doing,would,could,ought,as,until,because,while,although,though,since,despite,toward,towards,among,between,per,via,said,say,says,like,well,even,ever,never,still,yet,already,also,back,down,up,out,away,around,again,once,twice,one,two,three,very,really,quite,rather,almost,nearly,hardly,scarcely,merely,mostly,near,far,here,there,where,when,why,how'.split(','),
);
const RU_STOP = new Set(
  'и,в,во,не,что,он,на,я,с,со,как,а,то,все,она,так,его,но,да,ты,к,у,же,вы,за,бы,по,только,ее,мне,было,вот,от,меня,еще,нет,о,из,ему,теперь,когда,даже,ну,вдруг,ли,если,уже,или,ни,быть,был,была,было,есть,этот,эта,этого,который,которые,которая,себя,меня,тебя,нас,вас,них,него,нее,них,это,того,такой,такая,такие,весь,вся,сам,сама,можно,надо,лишь,хоть,пусть,ведь,же,уж,впрочем,однако,потому,поэтому,чтобы,хотя,будто,словно,вроде,кажется,весьма,очень,слишком,более,менее,самый,мой,моя,твой,твоя,наш,ваш,его,ее,их,этот,тот,такой,какой,который,сколько,столько,здесь,там,тут,туда,сюда,оттуда,отсюда,тогда,потом,сейчас,теперь,сегодня,вчера,завтра,всегда,никогда,иногда,часто,редко,почти,совсем,именно,прямо,просто,только,лишь,даже,уже,еще,пока,едва,чуть,вдруг,вдруг,снова,опять,затем,потом,вдоль,вокруг,против,между,через,сквозь,после,перед,до,без,для,ради,вместо,кроме,среди,мимо,около,возле,рядом,внутри,снаружи,вверх,вниз,вперед,назад,домой,сюда,туда,сказал,сказала,говорит,словно,будто'.split(','),
);

const wordsOf = (text: string): string[] =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

const isContentWord = (word: string): boolean => !EN_STOP.has(word) && !RU_STOP.has(word);

function splitSentences(content: string): string[] {
  return content
    .split(/(?<=[.!?…])\s+|\n\s*\n/)
    .map(item => item.trim())
    .filter(item => wordsOf(item).length >= 3);
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

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

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
 * words). Needs >=12 sentences; short texts never report. Dialogue-heavy
 * shootouts can trip this — it is advisory, and the validator judges
 * whether the fragments earn their place.
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
