import type { DetailedScene } from '../../types';
import type { ChapterRecord, ChapterVersion, ContinuityState, ReviewIssue } from './contracts';

/** Thresholds are deliberately configuration, not hidden taste. */
export const continuityConfig = {
  maxRepeatedEmotionalConclusion: 1,
  maxRepeatedSensoryDetail: 2,
  maxChapterHeadingOccurrences: 1,
};

const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(word => word.length > 3);
const sentence = (text: string, index: number) => text.slice(Math.max(0, text.lastIndexOf('.', index - 1) + 1), text.indexOf('.', index) < 0 ? text.length : text.indexOf('.', index) + 1).trim();
const evidence = (chapter: number, version: ChapterVersion, quote: string) => [{ chapter, revision: version.revision, quote }];

/** Normalizes old short scene records into the explicit ScenePlan contract used by the writer. */
export function scenePlan(scene: DetailedScene, prior: ContinuityState): Required<Pick<DetailedScene,
  'initialState' | 'characterDecisions' | 'consequenceForNextScene' | 'continuityRequirements' | 'informationRevealed' |
  'informationWithheld' | 'emotionalDelta' | 'prohibitedShortcuts' | 'exitHook'>> {
  return {
    initialState: scene.initialState || `Continue from ${prior.currentLocation} at ${prior.currentTime}; do not contradict the continuity ledger.`,
    characterDecisions: scene.characterDecisions?.filter(Boolean).length ? scene.characterDecisions : ['A character makes a voluntary consequential choice under the stated conflict.'],
    consequenceForNextScene: scene.consequenceForNextScene || scene.outcome,
    continuityRequirements: scene.continuityRequirements?.filter(Boolean).length ? scene.continuityRequirements : ['Preserve established locations, knowledge, injuries and possessions.'],
    informationRevealed: scene.informationRevealed || scene.keyMoments,
    informationWithheld: scene.informationWithheld || [],
    emotionalDelta: scene.emotionalDelta || `Change the situation through ${scene.outcome}; do not merely restate the existing emotion.`,
    prohibitedShortcuts: scene.prohibitedShortcuts?.filter(Boolean).length ? scene.prohibitedShortcuts : ['No unearned reversal, off-page rescue, or explanation in place of action.'],
    exitHook: scene.exitHook || scene.outcome,
  };
}

export function continuityIssues(chapter: ChapterRecord, version: ChapterVersion, tense: 'past' | 'present', config = continuityConfig): ReviewIssue[] {
  const text = version.content;
  const issues: ReviewIssue[] = [];
  const heading = text.match(/^\s*(?:#\s*)?(?:chapter|глава)\s+\d+/gim);
  if ((heading?.length || 0) > config.maxChapterHeadingOccurrences) issues.push({ id: 'duplicate-chapter-heading', category: 'format', severity: 'major', description: 'Chapter heading is repeated inside prose.', instruction: 'Keep no internal chapter heading; prose starts directly with the scene.', evidence: evidence(chapter.number, version, heading![1]) });
  const meta = text.match(/\b(?:scenePlan|initialState|continuityRequirements|prohibitedShortcuts|exitHook|OUTPUT CONTRACT|return JSON|system prompt)\b/i);
  if (meta) issues.push({ id: 'prompt-leakage', category: 'format', severity: 'critical', description: 'Internal planning field or generation instruction reached the manuscript.', instruction: 'Remove the apparatus and dramatize only its story content.', evidence: evidence(chapter.number, version, sentence(text, meta.index!)) });
  const quotes = (text.match(/["“”«»]/g) || []).length;
  if (quotes % 2) issues.push({ id: 'unpaired-dialogue-quote', category: 'format', severity: 'major', description: 'Dialogue quotation marks are unpaired.', instruction: 'Repair the affected dialogue punctuation without changing its meaning.', evidence: evidence(chapter.number, version, text.slice(Math.max(0, text.lastIndexOf('\n')), Math.min(text.length, text.lastIndexOf('\n') + 180)).trim() || text.slice(0, 180)) });
  const opposite = tense === 'past' ? /\b(?:is|are|walks|says|looks)\b/i : /\b(?:was|were|walked|said|looked)\b/i;
  const tenseHit = opposite.exec(text);
  if (tenseHit) issues.push({ id: 'unjustified-tense-shift', category: 'format', severity: 'minor', description: `Narration shifts away from the requested ${tense} tense.`, instruction: `Keep the narrative in ${tense} tense unless a clearly marked embedded quotation requires otherwise.`, evidence: evidence(chapter.number, version, sentence(text, tenseHit.index)) });
  const emotional = text.match(/\b(?:she|he|they) (?:felt|realized|understood|knew) [^.]{0,90}(?:afraid|angry|guilty|heartbroken|in love)\b/gi) || [];
  if (emotional.length > config.maxRepeatedEmotionalConclusion) issues.push({ id: 'repeated-emotional-conclusion', category: 'pacing', severity: 'major', description: 'The same emotional conclusion is explained repeatedly.', instruction: 'Keep the strongest occurrence and show the other beats through action, choice, speech or reaction.', evidence: evidence(chapter.number, version, emotional[1]) });
  return issues;
}
