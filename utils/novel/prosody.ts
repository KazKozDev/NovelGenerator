import type { ChapterVersion, Evidence, ReviewIssue } from './contracts';
import { rerankCandidateFloor, rerankRepetitionScore, type Reranker } from './reranker';

/**
 * Measured prose texture, not a model's opinion of it. Every number here is computed from the
 * text itself, so a threshold can be argued about and a regression can be seen.
 */
export interface ProsodyMetrics {
  words: number;
  paragraphs: number;
  medianParagraphWords: number;
  longestParagraphWords: number;
  dialogueShare: number;
  /** Share of spoken paragraphs that also carry an attribution or an action beat. */
  taggedSpeechShare: number | undefined;
  similesPer1000: number | undefined;
  stackedAdjectivesPer1000: number | undefined;
  /** Series of three or more coordinate members hung on one action, per 1000 words. */
  serialExplanationsPer1000: number | undefined;
}

// JavaScript's \b is defined over ASCII word characters, so a Cyrillic boundary must be spelled out.
const edge = { before: '(?<![\\p{L}\\p{N}])', after: '(?![\\p{L}\\p{N}])' };
const word = (alternatives: string[]) => new RegExp(`${edge.before}(?:${alternatives.join('|')})${edge.after}`, 'giu');

/** Comparison markers are language-specific; an unlisted language is measured, not guessed at. */
const similePatterns: { languages: string[]; pattern: RegExp }[] = [
  { languages: ['russian', 'русский', 'ru'], pattern: word(['словно', 'будто', 'подобно', 'точно как', 'как если бы', 'напоминая']) },
  { languages: ['english', 'en'], pattern: word(['like an?', 'as if', 'as though', 'resembling', 'reminiscent of']) },
];
/**
 * Two adjectives joined by a comma: the shape that turns every noun into a small catalogue. Only
 * listed where inflection marks an adjective; guessing from word order would flag ordinary lists.
 */
const stackedAdjectives: { languages: string[]; pattern: RegExp }[] = [
  { languages: ['russian', 'русский', 'ru'], pattern: new RegExp(`${edge.before}\\p{L}+(?:ым|ой|ая|ое|ые|ого|ной|ним)${edge.after},\\s+\\p{L}+(?:ым|ой|ая|ое|ые|ого|ной|ним)${edge.after}`, 'giu') },
];

/**
 * The shape of a gesture named once and then explained twice more: three coordinate modifiers, or
 * three participial phrases, hung on a single action. Embeddings cannot separate this from a genuine
 * sequence of actions — measured at 0.52 against 0.42 for unrelated ones — but the grammar can.
 * The inflections listed are a conservative subset, so the count is a floor rather than a census; it
 * still separated the manuscripts cleanly, from 0.52 to 1.97 per 1000 words across 13 chapters.
 */
const serialExplanations: { languages: string[]; pattern: RegExp }[] = [
  { languages: ['russian', 'русский', 'ru'], pattern: new RegExp(
    `${edge.before}\\p{L}+(?:ым|ой|ая|ое|ые|ого|ной|ним)\\s*,\\s*(?:почти\\s+|совсем\\s+|)?\\p{L}+(?:ым|ой|ая|ое|ые|ого|ной|ним)\\s*,\\s*(?:и\\s+)?\\p{L}+(?:ым|ой|ая|ое|ые|ого|ной|ним)`
    + `|${edge.before}\\p{L}+(?:ая|яя|ав|ив|вши|ясь|ась)${edge.after}[^.!?]{0,60},\\s*\\p{L}+(?:ая|яя|ав|ив|вши|ясь|ась)${edge.after}[^.!?]{0,60},\\s*(?:и\\s+)?\\p{L}+(?:ая|яя|ав|ив|вши|ясь|ась)${edge.after}`, 'giu') },
];

const forLanguage = <T extends { languages: string[] }>(table: T[], language: string) =>
  table.find(entry => entry.languages.some(name => language.toLowerCase().includes(name)));

export function paragraphsOf(text: string): string[] {
  return text.split(/\n+/).map(line => line.trim()).filter(line => line && !/^[*\-—_\s]+$/.test(line));
}

// Direct speech opens with a dash in most European typography and with a quote elsewhere.
const isSpeech = (line: string) => /^[—–-]\s|^[«"“]/.test(line);
/**
 * A speech attribution: the second dash of "— Реплика, — сказал он", or narration after a closing
 * quotation mark. Deliberately conservative — an earlier version counted any sentence break followed
 * by a capital, which marks every multi-sentence line as tagged: "— Я пришла. Теперь говори." carries
 * no attribution at all, yet a live chapter was told for nineteen revisions to strip one from it.
 * A floor is the right error here: demanding the removal of something that is not there cannot succeed.
 */
const isTagged = (line: string) => (line.match(/[—–]/g) || []).length > 1 || /[»"“][^»"“]*[\p{L}]/u.test(line.replace(/^[«"“]/, ''));

const wordsIn = (text: string) => (text.match(/[\p{L}\p{N}]+/gu) || []).length;
const count = (text: string, pattern: RegExp) => (text.match(new RegExp(pattern.source, pattern.flags)) || []).length;

export function prosodyMetrics(text: string, language = ''): ProsodyMetrics {
  const paragraphs = paragraphsOf(text);
  const speech = paragraphs.filter(isSpeech);
  const words = wordsIn(text);
  const lengths = paragraphs.map(wordsIn).sort((a, b) => a - b);
  const simile = forLanguage(similePatterns, language);
  const stacked = forLanguage(stackedAdjectives, language);
  const serial = forLanguage(serialExplanations, language);
  const per1000 = (matches: number) => words ? (matches * 1000) / words : 0;
  return {
    words,
    paragraphs: paragraphs.length,
    medianParagraphWords: lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0,
    longestParagraphWords: lengths.at(-1) || 0,
    dialogueShare: paragraphs.length ? speech.length / paragraphs.length : 0,
    taggedSpeechShare: speech.length ? speech.filter(isTagged).length / speech.length : undefined,
    similesPer1000: simile ? per1000(count(text, simile.pattern)) : undefined,
    stackedAdjectivesPer1000: stacked ? per1000(count(text, stacked.pattern)) : undefined,
    serialExplanationsPer1000: serial ? per1000(count(text, serial.pattern)) : undefined,
  };
}

/**
 * Calibrated against this system's own output, not against published fiction: 13 chapters from five
 * runs and two writer models gave 3.4–7.1 similes and 2.8–6.7 stacked modifiers per 1000 words. The
 * ceilings sit at that distribution's upper quartile, so a finding means "denser than this pipeline
 * usually writes" — a claim the numbers support — and not "denser than literature", which nothing
 * here measured. An earlier budget of 2.5 similes was set from one manuscript and from memory; it
 * failed all 13 chapters and therefore distinguished nothing.
 */
export interface ProsodyBudget {
  similesPer1000: number;
  stackedAdjectivesPer1000: number;
  medianParagraphWords: number;
  serialExplanationsPer1000: number;
}
export const defaultProsodyBudget: ProsodyBudget = { similesPer1000: 5, stackedAdjectivesPer1000: 5.6, medianParagraphWords: 90, serialExplanationsPer1000: 1.5 };

/** Drift inside one book: a chapter well above what this book's accepted chapters do is an outlier. */
export const driftFactor = 1.25;

/** The passages the writer must actually change, quoted, so the repair pass can locate them. */
function densest(text: string, pattern: RegExp, limit: number): string[] {
  const paragraphs = paragraphsOf(text);
  return paragraphs
    .map(paragraph => ({ paragraph, density: count(paragraph, pattern) / Math.max(wordsIn(paragraph), 1) }))
    .filter(item => item.density > 0)
    .sort((a, b) => b.density - a.density)
    .slice(0, limit)
    .map(item => item.paragraph);
}

export function prosodyIssues(chapter: number, version: ChapterVersion, language = '', budget = defaultProsodyBudget, reference?: ProsodyMetrics): ReviewIssue[] {
  const metrics = prosodyMetrics(version.content, language);
  // A chapter may sit inside the absolute ceiling and still be far denser than the book around it.
  const over = (value: number | undefined, ceiling: number, book: number | undefined) =>
    value !== undefined && (value > ceiling || (book !== undefined && book > 0 && value > book * driftFactor));
  /**
   * Drift alone informs; only the absolute ceiling blocks. A chapter measured at 0.7 coordinate series
   * per 1000 words against a budget of 1.5 was failed for standing above its book's median of 0.25 —
   * denser than its neighbours, and comfortably clean by the only threshold with evidence behind it.
   */
  const weight = (value: number | undefined, ceiling: number): 'major' | 'minor' =>
    value !== undefined && value > ceiling ? 'major' : 'minor';
  const issues: ReviewIssue[] = [];
  const quote = (quotes: string[]): Evidence[] => quotes.map(text => ({ chapter, revision: version.revision, quote: text }));
  const simile = forLanguage(similePatterns, language);
  if (simile && over(metrics.similesPer1000, budget.similesPer1000, reference?.similesPer1000)) issues.push({
    id: 'simile-density', category: 'voice', severity: 'minor',
    description: `Comparisons appear ${metrics.similesPer1000!.toFixed(1)} times per 1000 words${reference?.similesPer1000 ? `, against ${reference.similesPer1000.toFixed(1)} in the chapters this book has already accepted` : ''}; the ceiling is ${budget.similesPer1000}.`,
    instruction: 'Delete the comparisons that restate what the sentence already conveys, keeping those that add information the reader does not have. Do not replace a deleted comparison with a different one.',
    evidence: quote(densest(version.content, simile.pattern, 4)),
  });
  const stacked = forLanguage(stackedAdjectives, language);
  if (stacked && over(metrics.stackedAdjectivesPer1000, budget.stackedAdjectivesPer1000, reference?.stackedAdjectivesPer1000)) issues.push({
    id: 'adjective-stacking', category: 'voice', severity: 'minor',
    description: `Comma-joined modifier pairs appear ${metrics.stackedAdjectivesPer1000!.toFixed(1)} times per 1000 words; the budget is ${budget.stackedAdjectivesPer1000}.`,
    instruction: 'Where two modifiers carry the same meaning, keep the more precise one and delete the other. Leave pairs that genuinely say different things.',
    evidence: quote(densest(version.content, stacked.pattern, 3)),
  });
  const serial = forLanguage(serialExplanations, language);
  if (serial && over(metrics.serialExplanationsPer1000, budget.serialExplanationsPer1000, reference?.serialExplanationsPer1000)) {
    const sentences = version.content.split(/(?<=[.!?…])\s+/).filter(sentence => count(sentence, serial.pattern));
    issues.push({
      id: 'serial-explanation', category: 'voice', severity: weight(metrics.serialExplanationsPer1000, budget.serialExplanationsPer1000),
      description: `${metrics.serialExplanationsPer1000!.toFixed(1)} series of three or more coordinate members per 1000 words: a gesture is named and then explained twice more.`,
      instruction: 'In each of these sentences keep the member that carries information the reader does not already have and delete the rest of the series. Do not replace a deleted member with a different one, and change nothing outside the series.',
      evidence: quote(sentences.slice(0, 4)),
    });
  }
  if (over(metrics.medianParagraphWords, budget.medianParagraphWords, reference?.medianParagraphWords)) {
    const longest = paragraphsOf(version.content).sort((a, b) => wordsIn(b) - wordsIn(a)).slice(0, 3);
    issues.push({
      id: 'paragraph-monotony', category: 'pacing', severity: 'minor',
      description: `The median paragraph runs ${metrics.medianParagraphWords} words and the longest ${metrics.longestParagraphWords}; a chapter whose paragraphs are all this size has no rhythm.`,
      instruction: 'Break the paragraphs whose material is already two separate beats, and let a decisive action or line stand as a short paragraph. Do not pad the short ones back up.',
      evidence: quote(longest),
    });
  }
  return issues;
}

/**
 * A floor, not a law of literature. Commercial fiction carries a large share of its scenes in speech,
 * but no corpus was measured here: this number is a convention, chosen below the 16% that whole-scene
 * writing produced unprompted in matched samples, so it flags silence rather than legislating a style.
 * A chapter whose plan contains no speech-driven scene is never held to it.
 */
/**
 * Paragraphs a repair left broken open: a closing quotation mark with nothing it closes.
 *
 * Found by reading a finished book rather than by any check. Chapter two of a live English run
 * contained a paragraph reading, in its entirety, `Again."` — the tail of a line of dialogue whose
 * body a repair had cut away. Every check we have looks at meaning: repetition, knowledge, beats,
 * texture. None of them looks at whether the text is still whole, and a reader sees it immediately.
 *
 * Deliberately narrow. Speech that runs over several paragraphs opens each one with a quotation mark
 * and closes only the last, so an unclosed paragraph is legitimate whenever the next one carries the
 * speech on — and a paragraph that opens speech, breaks for narration and resumes is indistinguishable
 * by counting alone from that same shape damaged. It is left alone. Across 1,177 paragraphs of
 * accepted chapters this rule fires once, on the seam above, and never on prose in another
 * typography: Russian dialogue carries no quotation marks at all.
 */
export function brokenParagraphs(content: string): string[] {
  const paragraphs = content.split(/\n\s*\n/).map(item => item.trim());
  const broken: string[] = [];
  paragraphs.forEach((paragraph, index) => {
    if (!paragraph || paragraph.split('"').length % 2 === 1) return;
    const next = paragraphs[index + 1] || '';
    // An unclosed quotation is speech continuing into the paragraph below it.
    if (paragraph.startsWith('"') && next.startsWith('"')) return;
    broken.push(paragraph);
  });
  return broken;
}

/**
 * Spoken lines a repair removed. Scenes live in their dialogue, and a repair holding the whole chapter
 * removes what nobody asked it to: measured across the stored runs, twelve repairs dropped spoken
 * paragraphs while answering findings that had nothing to do with speech or length — one of them took
 * a chapter from twelve spoken paragraphs to six, another took the only line a chapter had.
 *
 * Paragraphs alone do not say that, though, and counting them alone refused work that had lost
 * nothing. Across 277 stored revision pairs the paragraph count fell 29 times, and in 10 of those the
 * spoken words were still there or there were more of them — two consecutive lines by one speaker
 * joined, a line folded into the gesture that follows it, and in three cases a repair that both
 * reflowed the dialogue and lengthened it, the worst of them refused for adding 31% more speech. The
 * real losses are not subtle: they sit at a quarter to nine tenths of the words, and the reflows at
 * 0.93 and above. So the paragraph count says where to look and the spoken words say whether anything
 * went; below 95% of them the chapter has stopped speaking as much as it did, and a line rewritten,
 * merged or re-attributed is still a line.
 */
export const spokenWordFloor = 0.95;

export function spokenLinesLost(before: string, after: string): number {
  const lost = speechParagraphs(before).length - speechParagraphs(after).length;
  if (lost <= 0) return 0;
  const spoken = (text: string) => wordsIn(speechParagraphs(text).join(' '));
  const had = spoken(before);
  if (had && spoken(after) >= had * spokenWordFloor) return 0;
  return lost;
}

/** What a repair broke that was whole before it: damage the previous version did not have. */
export function newlyBroken(before: string, after: string): string[] {
  const had = new Set(brokenParagraphs(before));
  return brokenParagraphs(after).filter(paragraph => !had.has(paragraph));
}

export const dialogueFloor = 0.12;

/** Direct speech, not reported speech: the paragraph opens with a dash or an opening quotation mark. */
export function speechParagraphs(text: string): string[] {
  return paragraphsOf(text).filter(isSpeech);
}

/**
 * Recalibrated on 18 chapters after the detector was corrected: 33% at best, 67% at the lower
 * quartile, 88% at the median, 100% in a third of them. The earlier reading of this measure counted
 * any multi-sentence spoken line as tagged, so it stood near 100% everywhere and could not be
 * repaired — there was nothing to strip. At 0.85 the ceiling now separates the chapters where nearly
 * every line arrives wrapped from the ones that let speech stand, and the best chapters prove the
 * lower figures are reachable.
 */
export const taggedSpeechCeiling = 0.85;

/**
 * Where the measure stops describing a habit and starts describing a chapter that cannot be read as
 * conversation at all.
 *
 * Measured over 180 versions with real dialogue: the share runs at 0.81 at the median and 0.85 at the
 * third quartile, so the ceiling sat exactly on a quartile of our own distribution and fired on one
 * version in four by construction. And it does not repair: one live chapter carried this finding
 * through nine consecutive rounds, another six, eighteen of the English run's fifty-five blocking
 * findings. A writer's standing habit is not a defect of the chapter it shows up in.
 *
 * So the band from the ceiling to here informs a repair without blocking one, and past 0.95 — 16% of
 * versions, where all but one line in twenty arrives wrapped — it blocks, because a chapter whose
 * speech never once stands alone is not a stylistic preference.
 */
export const taggedSpeechBlocking = 0.95;

/**
 * The plan says which scenes are argued out loud; this checks the prose kept that promise. Deterministic
 * on purpose: a scene planned as an exchange and written without a spoken line is a defect no model
 * needs to adjudicate. Scenes planned before this field existed are not judged.
 */
export function dialogueIssues(chapter: number, version: ChapterVersion, scenes: { sceneId: string; conflictCarriedBy?: string }[] = []): ReviewIssue[] {
  const spoken = scenes.filter(scene => scene.conflictCarriedBy === 'speech');
  if (!spoken.length) return [];
  const speech = speechParagraphs(version.content);
  const share = speech.length / Math.max(paragraphsOf(version.content).length, 1);
  const opening = { chapter, revision: version.revision, quote: paragraphsOf(version.content)[0] || version.content.slice(0, 200) };
  if (!speech.length) return [{
    id: 'missing-dialogue', category: 'dialogue', severity: 'major',
    description: `${spoken.length} planned scene(s) carry their conflict in speech (${spoken.map(scene => scene.sceneId).join(', ')}), but the chapter contains no spoken line.`,
    instruction: 'Dramatize those confrontations as conversation: let the characters press their opposing aims on each other in direct speech, with the resistance and the concession on the page. Do not summarize what was said, and do not narrate the exchange from outside.',
    evidence: [opening],
  }];
  const tagged = speech.filter(isTagged);
  if (speech.length >= 6 && tagged.length / speech.length > taggedSpeechCeiling) return [{
    id: 'speech-tag-bloat', category: 'dialogue', severity: tagged.length / speech.length > taggedSpeechBlocking ? 'major' : 'minor',
    description: `${Math.round((tagged.length / speech.length) * 100)}% of spoken lines arrive with an attached gesture or attribution; the exchange never runs as speech alone.`,
    instruction: `This is a pattern across the whole chapter, not the ${Math.min(tagged.length, 3)} lines quoted below: they are examples. Go through every spoken line in the chapter and delete the attribution and the gesture from those that do not need them — once the reader knows who is speaking, a line stands on its own. At least half of the chapter's spoken lines must end up bare. Keep a beat only where it changes the exchange — a hesitation, a refusal to answer, an action that contradicts the words — and where a gesture stays, cut the clause that names its anatomy and the clause that explains its meaning. Change no spoken words, and change nothing that is not a speech attribution or its gesture.`,
    evidence: tagged.slice(0, 3).map(quote => ({ chapter, revision: version.revision, quote })),
  }];
  if (share < dialogueFloor) return [{
    id: 'thin-dialogue', category: 'dialogue', severity: 'minor',
    description: `Spoken lines occupy ${Math.round(share * 100)}% of paragraphs while ${spoken.length} scene(s) were planned to carry their conflict in speech.`,
    instruction: 'Let the planned exchanges run at their real length instead of resolving in one or two lines: the answer that refuses, the pressure that follows, the thing said that cannot be taken back.',
    evidence: [speech[0] ? { chapter, revision: version.revision, quote: speech[0] } : opening],
  }];
  return [];
}

export type Embedder = (inputs: string[]) => Promise<number[][]>;

/**
 * What was actually measured on a version. Report mode records findings without failing the
 * chapter, so a budget can be argued about against real manuscripts before it blocks anything.
 */
export interface ProsodyReport {
  checkedRevision: number;
  metrics: ProsodyMetrics;
  findings: ReviewIssue[];
  /** False when no embedder was configured: repetition was not checked, not found absent. */
  repetitionChecked: boolean;
  /** Set when measurement itself failed; findings are then incomplete, not empty. */
  error?: string;
}

const normalise = (vector: number[]) => {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return length ? vector.map(value => value / length) : vector;
};
const cosine = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * b[index], 0);

/**
 * Measured against six generated chapters: adjacent paragraphs sit at a median cosine of 0.585 and a
 * 95th percentile of 0.785, so 0.80 is the tail where one beat is genuinely told twice.
 *
 * Paragraphs from different chapters are not that distribution. Across 525 paragraphs of six finished
 * runs they sit a tenth higher — median 0.705, 95th percentile 0.800 — so the inherited 0.80 was the
 * 95th percentile itself: a quota that takes the top 5% of every chapter however clean it is, and in
 * that band the pairs are a novel's own echoes, not its repetitions. The first chapter's light in the
 * window against the second chapter's argument about that light; a scene that goes on across the
 * chapter break. Above 0.86 the reading changes and stops changing: 0.86, 0.90 and 0.95 all return
 * exactly the same two paragraphs, and those two are word-for-word copies, which copiedFromEarlier
 * now catches without an embedder at all.
 */
export const defaultRepetitionThresholds = { adjacent: 0.8, crossChapter: 0.86, distant: 0.8, minimumCharacters: 200 };

export interface PriorProse { chapter: number; revision: number; content: string }

/**
 * Semantic repetition the lexical check cannot see: the same beat in new words, next to itself or
 * chapters away. Findings carry the id the repair loop routes to deletion, because a paraphrase of a
 * paraphrase is still the second telling.
 */
export async function repetitionIssues(
  chapter: number, version: ChapterVersion, earlier: PriorProse[], embed: Embedder,
  thresholds = defaultRepetitionThresholds, rerank?: Reranker,
): Promise<ReviewIssue[]> {
  const current = paragraphsOf(version.content).filter(paragraph => paragraph.length >= thresholds.minimumCharacters);
  if (current.length < 2) return [];
  const history = earlier.flatMap(prior => paragraphsOf(prior.content)
    .filter(paragraph => paragraph.length >= thresholds.minimumCharacters)
    .map(paragraph => ({ ...prior, paragraph })));
  const vectors = (await embed([...current, ...history.map(item => item.paragraph)])).map(normalise);
  if (vectors.length !== current.length + history.length) throw new Error('The embedder returned a different number of vectors than paragraphs.');
  const currentVectors = vectors.slice(0, current.length);
  const historyVectors = vectors.slice(current.length);

  const issues: ReviewIssue[] = [];
  // Neighbours and distant pairs are the same defect at different distances. Checking only neighbours
  // left a scene repeated twenty paragraphs later invisible: a live chapter carried 55 such passages
  // while this report said the prose was clean, and only the lexical check saw them.
  const doubled: Evidence[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < current.length - 1; index++) {
    for (let other = index + 1; other < current.length; other++) {
      const threshold = other === index + 1 ? thresholds.adjacent : thresholds.distant;
      if (seen.has(other) || cosine(currentVectors[index], currentVectors[other]) < threshold) continue;
      // Both copies, first then second: one alone proves nothing, and the deletion pass has to see
      // what it is choosing between. The later telling is the one it should weigh for removal.
      seen.add(other);
      doubled.push({ chapter, revision: version.revision, quote: current[index] },
        { chapter, revision: version.revision, quote: current[other] });
    }
  }
  if (doubled.length) issues.push({
    // Its own id: the lexical duplicate check owns 'duplicated-passage', and sharing it meant that
    // whenever that check fired first, every reworded repetition was dropped as an already-reported
    // finding and never reached the deletion pass.
    id: 'restated-passage', category: 'format', severity: 'critical',
    description: `${doubled.length / 2} paragraph(s) tell again a beat this chapter has already told; each pair below is the first telling followed by the second.`,
    instruction: 'Delete the weaker telling of each doubled beat outright. Do not merge the two into a third version.',
    evidence: doubled.slice(0, 8),
  });

  // With a reranker the cosine stops deciding and only nominates: it keeps the best match for each
  // paragraph and lets anything plausibly related through, and the cross-encoder — which reads both
  // passages together instead of comparing two summaries of them — says whether one retells the other.
  // Without one the cosine decides alone, at the higher threshold its own distribution asks for.
  const floor = rerank ? rerankCandidateFloor : thresholds.crossChapter;
  const candidates: { paragraph: string; score: number; source: PriorProse & { paragraph: string } }[] = [];
  for (let index = 0; index < current.length; index++) {
    let best = { score: 0, source: -1 };
    for (let prior = 0; prior < history.length; prior++) {
      const score = cosine(currentVectors[index], historyVectors[prior]);
      if (score > best.score) best = { score, source: prior };
    }
    if (best.score < floor || best.source < 0) continue;
    candidates.push({ paragraph: current[index], score: best.score, source: history[best.source] });
  }
  // A cross-encoder that cannot load — no weights cached, no network to fetch them — is a reader who
  // did not come, not a verdict of "no repetition". The cosine then decides alone, at the threshold
  // its own distribution asks for, and the nominations below that line go back to being nothing.
  let verdicts: number[] | undefined;
  if (rerank && candidates.length) {
    try { verdicts = await rerank(candidates.map(item => [item.paragraph, item.source.paragraph])); }
    catch { verdicts = undefined; }
  }
  const crossed: Evidence[] = [];
  candidates.forEach((candidate, index) => {
    const repeated = verdicts ? verdicts[index] >= rerankRepetitionScore : candidate.score >= thresholds.crossChapter;
    if (!repeated) return;
    crossed.push({ chapter, revision: version.revision, quote: candidate.paragraph });
    crossed.push({ chapter: candidate.source.chapter, revision: candidate.source.revision, quote: candidate.source.paragraph });
  });
  if (crossed.length) issues.push({
    id: 'recycled-passage', category: 'voice', severity: 'major',
    description: `${crossed.length / 2} paragraph(s) repeat a passage from an earlier chapter in new wording.`,
    instruction: `Each pair below is one passage from this chapter followed by the earlier passage it repeats. Only the passage from chapter ${chapter} is yours to change: rewrite it so it performs work the earlier one did not, or cut it. The earlier passage is quoted as context, it lives in another chapter and you will not find it in the prose you were given; do not look for it and do not change it. A deliberate motif must gain a changed meaning or consequence, not return in synonyms.`,
    evidence: crossed.slice(0, 8),
  });
  return issues;
}

/** The book's own habit so far: the median of what it has already accepted, not an average of drafts. */
export function referenceMetrics(earlier: PriorProse[], language: string): ProsodyMetrics | undefined {
  if (earlier.length < 2) return undefined;
  const each = earlier.map(item => prosodyMetrics(item.content, language));
  const median = (values: (number | undefined)[]) => {
    const known = values.filter((value): value is number => typeof value === 'number').sort((a, b) => a - b);
    return known.length ? known[Math.floor(known.length / 2)] : undefined;
  };
  return {
    words: median(each.map(item => item.words))!,
    paragraphs: median(each.map(item => item.paragraphs))!,
    medianParagraphWords: median(each.map(item => item.medianParagraphWords))!,
    longestParagraphWords: median(each.map(item => item.longestParagraphWords))!,
    dialogueShare: median(each.map(item => item.dialogueShare))!,
    taggedSpeechShare: median(each.map(item => item.taggedSpeechShare)),
    similesPer1000: median(each.map(item => item.similesPer1000)),
    stackedAdjectivesPer1000: median(each.map(item => item.stackedAdjectivesPer1000)),
    serialExplanationsPer1000: median(each.map(item => item.serialExplanationsPer1000)),
  };
}

/** One report for a candidate: deterministic budgets always, semantic repetition when an embedder exists. */
export async function prosodyReport(
  chapter: number, version: ChapterVersion, earlier: PriorProse[], language: string,
  embed?: Embedder, budget = defaultProsodyBudget, scenes: { sceneId: string; conflictCarriedBy?: string }[] = [],
  rerank?: Reranker,
): Promise<ProsodyReport> {
  const reference = referenceMetrics(earlier, language);
  const findings = [...prosodyIssues(chapter, version, language, budget, reference), ...dialogueIssues(chapter, version, scenes)];
  if (!embed) return { checkedRevision: version.revision, metrics: prosodyMetrics(version.content, language), findings, repetitionChecked: false };
  const repetition = await repetitionIssues(chapter, version, earlier, embed, defaultRepetitionThresholds, rerank);
  return { checkedRevision: version.revision, metrics: prosodyMetrics(version.content, language), findings: [...findings, ...repetition], repetitionChecked: true };
}
