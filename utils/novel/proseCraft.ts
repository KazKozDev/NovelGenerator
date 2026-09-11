import type { ChapterRecord, NovelRun } from './contracts';
import { acceptedVersion } from './storyState';

/**
 * The five ways a draft betrays how it was made.
 *
 * Each of these was read off finished chapters, not imagined: a page that keeps defining things by
 * what they are not; planner vocabulary and a slipped present tense standing in the middle of past
 * narration; an act performed under conditions the same paragraph made impossible; a length of
 * service that doubles between one scene and the next; a name that arrives spelled as though two
 * books had been merged by an autocorrect. None of them is a matter of taste, and none of them is
 * reachable by a later polish — a repair told to fix a name it has already written writes the name
 * again. They belong in the contract every prose call reads, which is this one: first drafts, the
 * scene writer, synthesis and every targeted repair.
 *
 * The negation clause is the only one with a measurement behind it. Across 36 stored chapters the
 * "not X, but Y" figure runs at a median of 2.5 per 1000 words and reaches 8.2 in the worst chapter,
 * which is a page and a half between one and the next — audible, and never once a correction of
 * something a character believed.
 */
export function manuscriptContract(tense: 'past' | 'present'): string {
  return `MANUSCRIPT CONTRACT (binding; the page carries the story and nothing else):
TENSE: narrate in the ${tense} tense and hold it to the last line. A paragraph that slips into the ${tense === 'past' ? 'present' : 'past'} reads as a note to the author, not as prose.
NOTHING FROM THE APPARATUS REACHES THE PAGE: no scene, beat or chapter label; no plan field name; no bracketed note; no sentence that instructs instead of narrating ("show that...", "here the reader must feel..."). The plan is what you dramatize, never what you write down.
NAMES ARE SPELLED AS THE BOOK SPELLS THEM, letter for letter as the character design and the canon give them, every time. Coin no variant, second surname, nickname or transliteration the book has not established, and name no person the design does not contain: an incidental figure is his role — the porter, the woman with the dog. A name appearing once in a spelling of its own is the seam between two drafts, and it is the first thing a reader sees.
STATE A FACT IN THE AFFIRMATIVE. "Not X, but Y" — defining a thing, a feeling or an act by first denying what it is not — is earned only where someone on the page held the denied belief and events are correcting them. As a default way to describe it becomes a tic audible within a page and doubles the length of every description. Where nothing is being corrected, delete the denial and write what is there.
NUMBERS ATTACHED TO A PERSON OR AN INTERVAL come from the canon or the character design, or they are not given: an age, a length of service, a distance, a time, how long ago something happened. Invent no figure to fill a sentence, and never restate an established one with a different value — a career of twelve years does not become twenty in the next scene because the sentence wanted weight. Where the number is not established, write the sentence without it.
PHYSICAL CONDITIONS PERSIST UNTIL THE PAGE CHANGES THEM: darkness, restraint, a covered face, smoke, water, an injured hand, a locked door, a held breath. While a condition holds nobody performs an act it forbids, and no such act may later be reported as having been performed under it — a forged document, a read label, an aimed shot. If a character must do what the conditions forbid, the prose changes the conditions first, on the page, and the change costs light, air, time, a freed hand or a witness. A capability discovered after the fact is a retcon, and the reader catches it in the sentence that needs it.
`;
}

/** Shared by first drafts, specialist contributions, synthesis and repairs. No extra model call. */
export function proseCraft(run: NovelRun, chapter: ChapterRecord): string {
  const earlier = run.chapters.filter(item => item.number < chapter.number && acceptedVersion(item))
    .sort((a, b) => a.number - b.number);
  const references = [...new Set([earlier[0], earlier.at(-1)].filter(Boolean))];
  const samples = references.map(item => {
    const text = acceptedVersion(item)!.content;
    return { chapter: item.number, opening: text.slice(0, 1500), ending: text.length > 1500 ? text.slice(-1500) : '' };
  });
  return `${narrativeDesign}\n${manuscriptContract(run.spec.tense)}\nPROSE COMPOSITION — APPLY WHILE WRITING, NOT AS A LATER POLISH:
Choose the form of each paragraph from what happens now. Each paragraph must advance an action, alter an exchange, supply necessary orientation, or develop a thought beyond what the reader already knows. A sustained interior passage is welcome when its thought actually develops.
After an action or line of dialogue conveys an emotion, let it stand unless the next thought complicates or contradicts it. Do not explain the same meaning again through bodily sensation, then metaphor, then an abstract conclusion. Changing the words does not make that sequence new.
Do not repeatedly resolve paragraphs through the same rhetorical construction or a repeated explanation of its meaning. These devices are available when earned, not a default paragraph template. Recurring motifs must gain a changed meaning or consequence, not merely recur in new synonyms.
Use sensory detail when it changes attention, action or atmosphere. Dialogue may continue without a gesture between every line, and normally should: a named gesture must not be followed by its anatomy and then its interpretation, and most spoken lines in a running exchange need no attribution at all. An action paragraph may end on the action. End a scene when its dramatic work is done, without an appended moral or emotional recap. Let its particular conflict determine the ending.
Spend the length budget on resistance, specific exchanges, discoveries and consequences that belong to the planned scene. Do not stretch a completed beat with paraphrases or invent new plot facts just to add words. A refrain that returns unchanged a third time is cut; the closing movement keeps its sentence rhythm instead of collapsing into fragments; nothing appears, moves or is perceived without staged means. Preserve the author's requested voice, including deliberate lyricism or repetition; variety must not flatten that voice.
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
NARRATIVE DESIGN (English instructions; story prose follows the author contract language):
Track how the protagonist's belief changes through choices and contrary evidence. A later chapter must test or complicate an earlier realization, not announce it again. Atmosphere should affect what someone notices, risks or does.
Give consequential supporting characters a private objective, a personal cost and a choice capable of resisting the protagonist. Express these in character descriptions and planned actions, rather than defining them solely by their function for the protagonist. Do not add a subplot for every incidental person.
Preserve the antagonist's established motives, limits and credible alternative across the ending. Do not retroactively make one antagonist responsible for every misfortune merely to simplify the hero's decision. A revelation of culpability needs prior groundwork; a moral choice must still cost something after the revelation.
Compare chapter endings with previous plans: vary the dramatic consequence and unresolved question, not merely the scenery or wording. Do not reuse the same sequence of actions, images and internal conclusions to close successive chapters. Deliberate recurring endings must change their meaning.
Give the decisive confrontation sufficient page space for resistance, reversals, a consequential choice and its immediate cost. Do not spend the scene on approach and then summarize the decisive exchange. Use rhythmPacing and scene keyMoments to specify that progression. Preserve the approved outline and author contract; do not invent a different ending to satisfy this guidance.
`;
