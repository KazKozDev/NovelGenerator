import type { ChapterRecord, NovelRun } from './contracts';
import { acceptedVersion } from './storyState';

/** Shared by first drafts, specialist contributions, synthesis and repairs. No extra model call. */
export function proseCraft(run: NovelRun, chapter: ChapterRecord): string {
  const earlier = run.chapters.filter(item => item.number < chapter.number && acceptedVersion(item))
    .sort((a, b) => a.number - b.number);
  const references = [...new Set([earlier[0], earlier.at(-1)].filter(Boolean))];
  const samples = references.map(item => {
    const text = acceptedVersion(item)!.content;
    return { chapter: item.number, opening: text.slice(0, 1500), ending: text.length > 1500 ? text.slice(-1500) : '' };
  });
  return `${narrativeDesign}\nPROSE COMPOSITION — APPLY WHILE WRITING, NOT AS A LATER POLISH:
Choose the form of each paragraph from what happens now. Each paragraph must advance an action, alter an exchange, supply necessary orientation, or develop a thought beyond what the reader already knows. A sustained interior passage is welcome when its thought actually develops.
After an action or line of dialogue conveys an emotion, let it stand unless the next thought complicates or contradicts it. Do not explain the same meaning again through bodily sensation, then metaphor, then an abstract conclusion. Changing the words does not make that sequence new.
Do not repeatedly resolve paragraphs through the same rhetorical construction or a repeated explanation of its meaning. These devices are available when earned, not a default paragraph template. Recurring motifs must gain a changed meaning or consequence, not merely recur in new synonyms.
Use sensory detail when it changes attention, action or atmosphere. Dialogue may continue without a gesture between every line, and normally should: a named gesture must not be followed by its anatomy and then its interpretation, and most spoken lines in a running exchange need no attribution at all. An action paragraph may end on the action. End a scene when its dramatic work is done, without an appended moral or emotional recap. Let its particular conflict determine the ending.
Spend the length budget on resistance, specific exchanges, discoveries and consequences that belong to the planned scene. Do not stretch a completed beat with paraphrases or invent new plot facts just to add words. Preserve the author's requested voice, including deliberate lyricism or repetition; variety must not flatten that voice.
For a targeted repair, apply these principles only within the passages authorized for change; preserve all other text. Before returning new prose, silently compare adjacent paragraphs and the earlier prose supplied: if several perform the same rhetorical move without developing it, compose them differently or remove the redundant explanation. Return only the finished result in the required output format.
EARLIER ACCEPTED PROSE EXCERPTS (limited samples, not the whole book; continuity references, not templates to imitate):
${JSON.stringify(samples)}
Preserve established register and character speech. Notice constructions already used here and in earlier scenes of this chapter; do not mechanically reproduce their paragraph shapes or endings. Events in these excerpts are governed by the accepted canon, not inferred from stylistic analogy.\n`;
}

/**
 * How many scenes a chapter of this length wants.
 *
 * The planner was told only "use 1–8 scenes", and the word budget was then divided by narrative
 * weight over however many it happened to return. A four-thousand-word chapter planned as two scenes
 * hands each of them two thousand words to fill after its action is over, and the length contract is
 * paid in restatement — the repetition the redundancy pass afterwards has to cut. A scene of roughly
 * a thousand words is the unit, so the count follows from the chapter's length; it stays a starting
 * point, because a chapter's shape, not arithmetic, decides where its scenes break.
 */
export function sceneCountGuidance(targetWordsPerChapter: number): string {
  const suggested = Math.max(1, Math.min(8, Math.round(targetWordsPerChapter / 1000)));
  return `Plan about ${suggested} scene${suggested > 1 ? 's' : ''} for this chapter's ${targetWordsPerChapter} words, and never fewer than 1 or more than 8: a scene runs roughly 800–1200 words of finished prose. Depart from that count where the chapter's shape asks for it — a connective scene may be much shorter and the decisive confrontation longer — but do not plan so few scenes that one of them has to continue after its action is finished, nor so many that none has room to develop.`;
}

/** Give decisive scenes page space instead of dividing a chapter equally by scene count. */
export function sceneWordTargets(chapter: ChapterRecord, fallback: number): number[] {
  const scenes = chapter.plan.detailedScenes || [];
  const total = chapter.plan.targetWordCount || fallback;
  const weightedScenes = scenes.map(scene => ({ ...scene, narrativeWeight: chapter.literaryPlan?.scenes.find(intent => intent.sceneId === scene.sceneId)?.narrativeWeight ?? scene.narrativeWeight }));
  const weights = weightedScenes.map(scene => Number.isInteger(scene.narrativeWeight) && scene.narrativeWeight! >= 1 && scene.narrativeWeight! <= 5 ? scene.narrativeWeight! : 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map(weight => total * weight / sum);
  const targets = exact.map(Math.floor);
  const order = exact.map((value, index) => ({ index, fraction: value - targets[index] })).sort((a, b) => b.fraction - a.fraction);
  const remaining = total - targets.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining && order.length; i++) targets[order[i].index]++;
  return targets;
}

export const narrativeDesign = `
NARRATIVE DESIGN:
Track how the protagonist's belief changes through choices and contrary evidence. A later chapter must test or complicate an earlier realization, not announce it again. Atmosphere should affect what someone notices, risks or does.
Give consequential supporting characters a private objective, a personal cost and a choice capable of resisting the protagonist. Express these in character descriptions and planned actions, rather than defining them solely by their function for the protagonist. Do not add a subplot for every incidental person.
Preserve the antagonist's established motives, limits and credible alternative across the ending. Do not retroactively make one antagonist responsible for every misfortune merely to simplify the hero's decision. A revelation of culpability needs prior groundwork; a moral choice must still cost something after the revelation.
Compare chapter endings with previous plans: vary the dramatic consequence and unresolved question, not merely the scenery or wording. Do not reuse the same sequence of actions, images and internal conclusions to close successive chapters. Deliberate recurring endings must change their meaning.
Give the decisive confrontation sufficient page space for resistance, reversals, a consequential choice and its immediate cost. Do not spend the scene on approach and then summarize the decisive exchange. Use rhythmPacing and scene keyMoments to specify that progression. Preserve the approved outline and author contract; do not invent a different ending to satisfy this guidance.
`;
