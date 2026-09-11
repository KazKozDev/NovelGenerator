/**
 * Quiet post-acceptance checks: NLI contradictions and language mismatch.
 *
 * These run AFTER a chapter is accepted, as advisory log lines — never
 * inside review, never blocking, never triggering repairs (see
 * bestsellerAdvisory in diversity.ts for why the blocking path is
 * off-limits). Each check is consent-gated by its own localStorage key,
 * default off: enabling one downloads hundreds of MB on first use, and
 * that decision belongs to the reader, not the pipeline.
 */
import type { NovelRun } from './contracts';
import { canonBefore } from './storyState';
import { scanChapterContradictions, sharedNLIScorer, type ContradictionFinding, type NLIScorer } from './nli';
import { languageMatches, sharedLanguageIdentifier, type LanguageIdentifier } from './languageId';
import { sharedZeroShotClassifier, type ZeroShotClassifier } from './zeroShot';
import { dominantEmotion, emotionVariety, sharedEmotionScorer, type EmotionScores, type EmotionScorer } from './emotion';
import { getGenreList } from '../genrePrompts';

export const DEEPCHECK_NLI_KEY = 'novel-deepcheck-contradictions';
export const DEEPCHECK_LANG_KEY = 'novel-deepcheck-language';
export const DEEPCHECK_GENRE_KEY = 'novel-deepcheck-genre';
export const DEEPCHECK_EMOTION_KEY = 'novel-deepcheck-emotion';
export const SUMMARIZER_KEY = 'novel-local-summarizer';

/** Consent-gated and storage-proof: anything but an explicit 'on' is off. */
export function isLocalModelOn(key: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    // The contradiction model is part of the continuity gate once installed. Other optional
    // readers remain opt-in because they are advisory and do not protect the manuscript.
    return key === DEEPCHECK_NLI_KEY ? localStorage.getItem(key) !== 'off' : localStorage.getItem(key) === 'on';
  } catch {
    return false;
  }
}

export function setLocalModel(key: string, on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.setItem(key, 'on');
    else localStorage.removeItem(key);
  } catch { /* a browser that refuses storage gets the default (off) */ }
}

/**
 * Short canon claims about the chapter's own people: "subject predicate:
 * value". Sampled, not exhaustive — NLI cost is claims × sentences.
 */
export function claimsForChapter(run: NovelRun, chapterNumber: number, maxClaims = 8): string[] {
  const chapter = run.chapters.find(item => item.number === chapterNumber);
  const people = new Set(
    (chapter?.plan.detailedScenes || []).flatMap(scene => scene.participants || []).map(name => name.toLowerCase()),
  );
  const facts = canonBefore(run, chapterNumber).facts.filter(fact => {
    const mentioned = [fact.subject, ...fact.knownBy].map(name => name.toLowerCase());
    return mentioned.some(name => [...people].some(person => person.includes(name) || name.includes(person)));
  });
  return facts.slice(0, Math.max(0, maxClaims)).map(fact => `${fact.subject} ${fact.predicate}: ${fact.value}`);
}

export interface DeepCheckReport {
  chapter: number;
  contradictions: ContradictionFinding[];
  language: { label: string; score: number; expected: string; ok: boolean } | undefined;
}

export async function checkChapter(
  run: NovelRun,
  chapterNumber: number,
  content: string,
  tools: { score?: NLIScorer; identify?: LanguageIdentifier },
): Promise<DeepCheckReport> {
  const contradictions = tools.score
    ? await scanChapterContradictions(claimsForChapter(run, chapterNumber), content, tools.score)
    : [];
  let language: DeepCheckReport['language'];
  if (tools.identify && content.trim()) {
    const guess = await tools.identify(content.slice(0, 2000));
    language = { ...guess, expected: run.spec.language || 'English', ok: languageMatches(guess.label, run.spec.language || 'English') };
  }
  return { chapter: chapterNumber, contradictions, language };
}

type Log = (entry: { type: 'decision' | 'execution' | 'evaluation' | 'iteration' | 'warning' | 'success' | 'diff'; message: string }) => void;

/**
 * Consent-gated tool bundle, mirroring repetitionTools: shared lazy
 * instances, so weights download once no matter how many chapters check.
 */
export interface GenreVerdict {
  top: string;
  score: number;
  expected: string;
  ok: boolean;
}

const normGenre = (value: string): string => value.toLowerCase().replace(/[^a-z]/g, '');

/** Ranked once: does the outline read as the contracted genre? */
export async function checkGenre(
  run: NovelRun,
  text: string,
  classify: ZeroShotClassifier,
): Promise<GenreVerdict | undefined> {
  const expected = (run.spec.genre || '').trim();
  if (!expected || !text.trim()) return undefined;
  const labels = [...new Set([...getGenreList(), expected])];
  const ranked = await classify(text.slice(0, 2000), labels);
  const top = ranked[0];
  if (!top) return undefined;
  const same = normGenre(top.label) === normGenre(expected)
    || normGenre(expected).includes(normGenre(top.label))
    || normGenre(top.label).includes(normGenre(expected));
  return { top: top.label, score: top.score, expected, ok: same };
}

export interface EmotionVerdict {
  chapter: number;
  dominant: string;
  variety: number;
}

/** Score up to maxPassages paragraphs; advisory numbers, never a verdict on quality. */
export async function checkEmotions(
  chapter: number,
  content: string,
  score: EmotionScorer,
  maxPassages = 10,
): Promise<EmotionVerdict | undefined> {
  const passages = content.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean).slice(0, Math.max(1, maxPassages));
  if (!passages.length) return undefined;
  const results: EmotionScores[] = [];
  for (const passage of passages) results.push(await score(passage));
  const whole: EmotionScores = {
    labels: results[0].labels,
    scores: results[0].labels.map((_, index) => results.reduce((sum, result) => sum + (result.scores[index] ?? 0), 0) / results.length),
  };
  return { chapter, dominant: dominantEmotion(whole), variety: emotionVariety(results) };
}

export function deepCheckTools(log: Log): { score?: NLIScorer; identify?: LanguageIdentifier; classifyGenre?: ZeroShotClassifier; scoreEmotion?: EmotionScorer } {
  const tools: { score?: NLIScorer; identify?: LanguageIdentifier; classifyGenre?: ZeroShotClassifier; scoreEmotion?: EmotionScorer } = {};
  let announcedNli = false;
  let announcedLang = false;
  let announcedGenre = false;
  let announcedEmotion = false;
  if (isLocalModelOn(DEEPCHECK_NLI_KEY)) {
    const score = sharedNLIScorer();
    tools.score = async (premise, hypothesis) => {
      if (!announcedNli) {
        announcedNli = true;
        log({ type: 'execution', message: 'Deep check: NLI contradiction scan (first use downloads weights)' });
      }
      return score(premise, hypothesis);
    };
  }
  if (isLocalModelOn(DEEPCHECK_LANG_KEY)) {
    const identify = sharedLanguageIdentifier();
    tools.identify = async text => {
      if (!announcedLang) {
        announcedLang = true;
        log({ type: 'execution', message: 'Deep check: language identification (first use downloads weights)' });
      }
      return identify(text);
    };
  }
  if (isLocalModelOn(DEEPCHECK_GENRE_KEY)) {
    const classify = sharedZeroShotClassifier();
    tools.classifyGenre = async (text, labels) => {
      if (!announcedGenre) {
        announcedGenre = true;
        log({ type: 'execution', message: 'Deep check: genre verification (first use downloads ~400MB)' });
      }
      return classify(text, labels);
    };
  }
  if (isLocalModelOn(DEEPCHECK_EMOTION_KEY)) {
    const score = sharedEmotionScorer();
    tools.scoreEmotion = async text => {
      if (!announcedEmotion) {
        announcedEmotion = true;
        log({ type: 'execution', message: 'Deep check: emotion scoring (first use downloads ~130MB)' });
      }
      return score(text);
    };
  }
  return tools;
}
