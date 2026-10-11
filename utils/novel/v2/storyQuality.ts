import { isStopWord, splitSentences } from '../analytics';
import { habitUses, somaticAllowance, somaticBeats, type Habit } from './habits';
/** Shared criteria: the outline and the final prose must answer the same questions. */
export const STORY_QUALITY = {
  foundation: 'The reader learns the rule or condition needed to understand the opening before its consequences depend on it.',
  resolution: 'The central question has an evidenced answer. Reconcile incompatible witness accounts; distinguish lies, mistakes and deliberately open questions.',
  characters: 'Names, roles, status, resources and goals remain consistent. Important character threads receive an outcome.',
  duplicates: 'No paragraphs, scene openings, disclosures or completed events are replayed as new.',
  continuity: 'Track location, objects, injuries and knowledge from the actual previous scene; changes require an intervening action.',
  language: 'Repeated formulas, numbers and images serve distinct purposes rather than habitual filler.',
  chronology: 'Dates, durations, quantities and deadlines agree; identify concrete conflicting occurrences.',
  investigation: 'Decisive information is earned through observation, testing and choices, rather than supplied entirely by explanatory speeches.',
  variety: 'Chapters vary in dramatic mechanism and outcome; compare their actual event sequences.',
  subtext: 'The theme emerges through choices and consequences; repeated explicit moral explanations do not replace drama.',
  agency: 'The protagonist initiates consequential actions, makes costly choices and contributes causally to the resolution. Cooperation with police or allies is allowed; the protagonist need not supply all or the primary proof. A meaningful recording, disclosure or risky decision counts as agency.',
  setup: 'Rescues, resources and decisive reversals have prior preparation and a cost; identify their setup passages.',
  motives: 'Actions follow established intentions, limitations and available resources, including those of the opponent.',
  consequences: 'Violence, loss and injury affect subsequent capabilities, relationships or decisions.',
  action: 'Action follows specific space, objectives and limitations, and changes the situation rather than repeating generic spectacle.',
  dilemma: 'Where the premise contains a moral conflict, both positions retain credible stakes and costs through the ending.',
  scope: 'The requested length supports dramatized intermediate steps. Compare chapter word counts to the requested budget; do not fix shortfall with padding.',
} as const;
export type QualityCheck = { passed: boolean; evidence: string };
export const QUALITY_KEYS = ['transitions', 'causality', 'repeated_events', ...Object.keys(STORY_QUALITY)];
export const qualityInstructions = () => Object.entries(STORY_QUALITY).map(([key, rule]) => `${key}: ${rule}`).join('\n') + '\nFor a criterion genuinely absent from this story (for example violence), state why it is not applicable. Do not invent a subplot to satisfy a criterion. A major defect needs concrete evidence and a causal or reader consequence; stylistic preference alone is minor.';

/** Exact paragraph duplication is evidence, not an LLM opinion. Short refrains are excluded. */
export function duplicateParagraphs(blocks: { thesis_id: string; text: string }[]) {
  const seen = new Map<string, string>();
  const findings: { severity: 'major'; description: string }[] = [];
  for (const block of blocks) {
    for (const paragraph of block.text.split(/\n\s*\n/)) {
      const normalized = paragraph.trim().replace(/\s+/g, ' ');
      if (normalized.split(/\s+/).length < 30) continue;
      const previous = seen.get(normalized);
      if (previous) findings.push({ severity: 'major', description: `Exact repeated paragraph in ${previous} and ${block.thesis_id}: ${normalized}` });
      else seen.set(normalized, block.thesis_id);
    }
  }
  return findings;
}

export interface TextFinding { severity: 'major' | 'minor'; thesis_ids: string[]; description: string; strings: string[] }
const flat = (value: string) => value.trim().replace(/\s+/g, ' ');
/**
 * What a reviewer reading for events does not report, counted instead of asked.
 * A sentence of eight words or more written twice is a defect: eight is the run length
 * measured in analytics.ts. Habits are named by the editor (habits.ts) and found here by
 * their markers; they, bodily reactions past a scene's allowance and shared openings advise.
 */
export function textFindings(blocks: { thesis_id: string; text: string }[], habits: Habit[] = []): TextFinding[] {
  const findings: TextFinding[] = [];
  const seen = new Map<string, { id: string; sentence: string }>();
  const reported = new Set<string>();
  for (const block of blocks) for (const sentence of splitSentences(block.text).map(flat)) {
    // Speech and quoted documents come back on purpose; narration does not.
    if (/^["“‘'*_]/.test(sentence) || sentence.split(' ').length < 8) continue;
    const key = sentence.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '');
    const first = seen.get(key);
    if (!first) { seen.set(key, { id: block.thesis_id, sentence }); continue; }
    if (reported.has(key)) continue;
    reported.add(key);
    findings.push({ severity: 'major', thesis_ids: [...new Set([first.id, block.thesis_id])], strings: [sentence],
      description: `Sentence written twice, in ${first.id} and ${block.thesis_id}: "${sentence}" Keep one occurrence and rewrite or cut the other without changing what happens.` });
  }
  for (const { habit, uses } of habitUses(blocks, habits)) if (uses.length >= 3) {
    findings.push({ severity: 'minor', thesis_ids: [...new Set(uses.map(use => use.thesis_id))], strings: uses.map(use => use.sentence),
      description: `Move made ${uses.length} times — ${habit.device}: ${uses.map(use => `${use.thesis_id} "${use.sentence}"`).join(' | ')}. Keep at most one. For each other: first choice, cut the sentence; second, put in its place what this person does with what is in this room. Never the same move in other words.` });
  }
  for (const block of blocks) {
    const beats = somaticBeats(block.text);
    if (beats.length > somaticAllowance(block.text)) findings.push({ severity: 'minor', thesis_ids: [block.thesis_id], strings: beats,
      description: `${block.thesis_id}: ${beats.length} sentences where the body reacts in place of the feeling (allowance ${somaticAllowance(block.text)}): ${beats.map(beat => `"${beat.trim().replace(/\s+/g, ' ')}"`).join(' | ')}. Cut the weaker ones or replace them with an act.` });
  }
  const openings = new Map<string, string[]>();
  for (const block of blocks) {
    const first = splitSentences(block.text)[0] || '';
    const words = new Set(first.split(/[^\p{L}]+/u).filter(word => word.length > 3 && word[0] === word[0].toLowerCase() && !isStopWord(word)));
    for (const word of words) openings.set(word, [...(openings.get(word) || []), block.thesis_id]);
  }
  // Over fewer than five scenes a shared opening word is not yet a rate.
  if (blocks.length >= 5) for (const [word, ids] of openings) if (ids.length >= 3 && ids.length >= blocks.length * 0.3 ) {
    findings.push({ severity: 'minor', thesis_ids: ids, strings: [word],
      description: `${ids.length} of ${blocks.length} scenes open on "${word}" (${ids.join(', ')}). Open the later ones on what is different about their moment.` });
  }
  return findings;
}

export function validateQualityChecks(checks: unknown): Record<string, QualityCheck> {
  if (!checks || typeof checks !== 'object') throw new Error('Final audit requires all story quality checks with concrete evidence.');
  const values = checks as Record<string, QualityCheck>;
  for (const key of QUALITY_KEYS) {
    if (typeof values[key]?.passed !== 'boolean' || typeof values[key]?.evidence !== 'string' || !values[key].evidence.trim()) {
      throw new Error(`Final audit missing valid evidence for ${key}.`);
    }
  }
  return values;
}
