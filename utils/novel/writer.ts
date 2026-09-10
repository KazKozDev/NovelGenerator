import { proseCraft, sceneWordTargets } from './proseCraft';
import type { ChapterRecord, NovelRun } from './contracts';
import { chapterRole, genreCraft, specPrompt } from './contracts';
import { canonBefore, canonForScene } from './storyState';
import { generateProse, type NovelLLM } from './review';

/**
 * What the chapter has already put on the page, in the two forms the next scene actually needs: the
 * events, which must not be told again, and the last words, so the voice continues. Pasting every
 * finished scene in full made the prose already written 43.5% of a 78,000-character prompt while the
 * scene to write was 0.7% of it, and a live chapter came back as its second scene written four times:
 * with the answer filling half the page, copying it is the shortest path to a plausible response.
 */
function alreadyOnThePage(chapter: ChapterRecord): string {
  const written = chapter.sceneDrafts || [];
  if (!written.length) return '';
  const established = (chapter.plan.detailedScenes || []).slice(0, written.length)
    .map(scene => ({ sceneId: scene.sceneId, objective: scene.objective, outcome: scene.outcome }));
  const tail = written.at(-1)!.slice(-1200);
  return `\nALREADY DRAMATIZED IN THIS CHAPTER — these events happened on the page and must not be told again:\n${JSON.stringify(established)}`
    + `\nTHE LAST WORDS CURRENTLY ON THE PAGE, so your scene continues in the same voice and from this moment; they are context, never material to reuse:\n...${tail}`;
}

/**
 * One writer per scene. Slot assembly was removed after a measured comparison: on four matched scene
 * pairs it produced shorter scenes every time (879 vs 1233 words on the same target) and almost no
 * dialogue (3.8% vs 16% of paragraphs), with no measured advantage. The shortfall is what the length
 * contract then paid for in description.
 */
/**
 * The plan this scene needs, rather than the plan of everything.
 *
 * Measured on a live English run: a scene-writing prompt ran to 59,000 characters, of which the
 * chapter's literary plan was 17,000 and the chapter plan with every scene in it another 11,000 —
 * while the scene actually being written was 970 characters, 1.5% of what the model read. The same
 * shape was already found and cut twice tonight, in the literary gate and in the repair.
 *
 * Size is not the whole of it. Handing the writer of scene one the full plan of scenes two and three
 * tells it how the chapter ends before it has begun, and a scene that knows the ending reaches for
 * material that is not yet its own. What it keeps is where the chapter sits in time and what it is
 * for, its own scene entire, the scenes already written as a line each — and, only if it is the
 * scene that gets there, how the chapter closes.
 */
/**
 * Fields of the chapter frame that say where the chapter arrives. Only the scene that arrives there
 * reads them: telling the writer of scene one how the chapter closes is how a first scene acquires
 * the tone of an ending and states, early and out of turn, what the chapter was supposed to earn.
 */
const arrivalFields = ['summary', 'plotAdvancement', 'chapterEnding', 'connectionToNextChapter', 'consequencesOfChoices', 'climaxMoment'];

export function planForScene(chapter: ChapterRecord, sceneIndex: number): object {
  const scenes = chapter.plan.detailedScenes || [];
  // sceneBreakdown is the same chapter told again in prose — arrival, confession, discovery,
  // confrontation, choice, aftermath, all of it already in the scenes below it, and 774 characters of
  // a measured plan. Two accounts of one plan cost tokens and can disagree with each other; the
  // structured one is the account the engine checks against, so it is the one a prompt carries. The
  // field stays in the plan, for the plan screen and for whoever plans the chapters after this one.
  const { detailedScenes: _scenes, sceneBreakdown: _breakdown, ...whole } = chapter.plan;
  const frame: Record<string, unknown> = { ...whole };
  if (sceneIndex !== scenes.length - 1) for (const field of arrivalFields) delete frame[field];
  if (sceneIndex !== 0) delete frame.openingHook;
  return {
    ...frame,
    thisScene: scenes[sceneIndex],
    // A later scene travels as its name and nothing else. Its objective and outcome are the chapter's
    // undisclosed material: a writer who has them writes towards them, and the discovery the chapter
    // was saving arrives in the scene before the one planned to carry it.
    otherScenes: scenes.map((scene, index) => index === sceneIndex ? undefined
      : index < sceneIndex ? { sceneId: scene.sceneId, objective: scene.objective, outcome: scene.outcome, position: 'earlier' }
      : { sceneId: scene.sceneId, position: 'later' })
      .filter(Boolean),
  };
}

/** The literary intent of this scene. The chapter's ending development goes to the scene that ends it. */
export function literaryIntentForScene(chapter: ChapterRecord, sceneId: string): object | undefined {
  const plan = chapter.literaryPlan;
  if (!plan) return undefined;
  const scenes = chapter.plan.detailedScenes || [];
  const endsTheChapter = !scenes.length || scenes.at(-1)!.sceneId === sceneId;
  return {
    ...(endsTheChapter ? { endingDevelopment: plan.endingDevelopment } : {}),
    avoidReplaying: plan.avoidReplaying,
    thisScene: (plan.scenes || []).find(scene => scene.sceneId === sceneId),
  };
}

/**
 * What this scene owes the book, and what is not its business.
 *
 * The prompt used to ask for every planned beat dramatized on the page, next to a literary intent
 * naming the scene's development, the character's choice and its dramatic cost. Read together those
 * are a checklist of meanings, and a scene written to a checklist of meanings states them: the
 * discovery, then what the discovery means, then how it feels to have discovered it. The plot events
 * are obligations; the literary intent is how the scene is written, never what it says.
 */
function sceneContract(scene: NonNullable<ChapterRecord['plan']['detailedScenes']>[number], sceneIndex: number, sceneCount: number): string {
  const remaining = sceneCount - sceneIndex - 1;
  return `WHAT THIS SCENE MUST PUT ON THE PAGE — the story depends on these and nothing may stand in for them: the objective pursued (${scene.objective}), the resistance that meets it (${scene.conflict}), the consequential choice it forces, and these planned moments dramatized as action, speech or discovery rather than reported: ${JSON.stringify(scene.keyMoments)}.
WHAT CHANGES BY THE END: ${scene.outcome}. The scene begins in the situation the chapter has reached so far and leaves it changed in exactly that way.
WHERE THE SCENE STOPS: once that outcome has happened on the page. Do not carry the story past it. A closing summary of what the scene meant, or of how the character now feels about it, is not required and usually costs the ending its force; end on the event, the line or the image that completes the change.
WHAT IS NOT YOURS TO DISCLOSE YET: ${remaining ? `${remaining} more scene${remaining > 1 ? 's' : ''} of this chapter follow${remaining > 1 ? '' : 's'} this one, and what they contain is not established here. ` : ''}Reveal only what this scene's own events establish. Do not have a character reach a conclusion, name a culprit, or settle a question that the chapter has not yet dramatized, and do not close the chapter's business early.
THE LITERARY INTENT ABOVE IS FOR YOUR WRITING, NOT FOR THE PAGE: theme, symbolism, a character's private motive and the meaning of the choice work through what is done and said. Do not have the prose explain them, and do not name the scene's development as a conclusion the narration draws.
`;
}

export async function writeScene(run: NovelRun, chapter: ChapterRecord, sceneIndex: number, llm: NovelLLM, correction = ''): Promise<string> {
  const scenes = chapter.plan.detailedScenes;
  if (!scenes?.length || !scenes[sceneIndex]) throw new Error('A validated scene plan is required.');
  const scene = scenes[sceneIndex];
  const sceneTarget = sceneWordTargets(chapter, run.spec.targetWordsPerChapter)[sceneIndex];
  const context = `${specPrompt(run.spec)}${genreCraft(run.spec)}${proseCraft(run, chapter)}\nLITERARY INTENT FOR THIS SCENE (how it is written; never what the prose states):\n${JSON.stringify(literaryIntentForScene(chapter, scene.sceneId))}\nCHAPTER ${chapter.number} OF ${run.spec.chapterCount}\nROLE OF CHAPTER: ${chapterRole(chapter.number, run.spec.chapterCount)}\nWHAT THE BOOK IS ABOUT (background for your judgement, not character knowledge and not material for this scene):\n${run.blueprint?.centralConflict || run.spec.premise}\nCHARACTER DESIGN (intent, not established events; the people in this scene):\n${JSON.stringify(Object.fromEntries(Object.entries(run.blueprint?.characters || {}).filter(([name]) => (scene.participants || []).some(person => person.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(person.toLowerCase())))))}\nACCEPTED CANON:\n${JSON.stringify(canonForScene(canonBefore(run, chapter.number), scene.participants || [], chapter.number))}\nPROMISES SCHEDULED FOR THIS CHAPTER (the chapter's business, not necessarily this scene's; plant or pay one off only where this scene's own planned outcome carries it):\n${JSON.stringify((run.blueprint?.promises || []).filter(promise => promise.setupChapter === chapter.number || promise.payoffChapter === chapter.number))}\nCHAPTER PLAN (this scene entire; the scenes already written as a line each, the ones still to come as a name only):\n${JSON.stringify(planForScene(chapter, sceneIndex))}\nSCENE ${sceneIndex + 1}/${scenes.length}${alreadyOnThePage(chapter)}\nTARGET SCENE LENGTH: ${sceneTarget} words; approximate scene allocation, not a quota for each paragraph. This is a full book scene, not a synopsis.\nWrite the scene as a causal change: the viewpoint character pursues a goal, encounters resistance, makes a consequential choice, and reaches the planned outcome.\n${sceneContract(scene, sceneIndex, scenes.length)}${scene.conflictCarriedBy === 'speech' ? 'THIS SCENE IS CARRIED BY SPEECH: the opposing aims meet in conversation on the page, in direct speech, at the length the confrontation needs. Write the refusal, the pressure that follows it and the thing said that cannot be taken back. Do not summarize the exchange, report it from outside, or resolve it in two lines. Once the reader knows who is speaking, most lines carry no attribution and no gesture at all; add one only where it changes the exchange, and never follow a named gesture with its anatomy and then its meaning. ' : scene.conflictCarriedBy === 'action' ? 'This scene is carried by physical action; speech is optional here. ' : 'This scene is faced alone; it needs no dialogue. '}Otherwise use action, description or interiority where the scene needs them; no paragraph is required to contain all of them. Do not append an aftermath that only restates the outcome. Let important exchanges and decisions unfold instead of summarizing them. Characters can know only what they have learned. Protect proper names and established clues. Output only prose without a chapter heading, notes or placeholders. The requested voice overrides generic stylistic preferences.`;

  return generateProse(llm, `${context}${correction ? `\n${correction}` : ''}`, 'You are the single prose writer for this novel. Keep the author contract and scene causality intact.', { temperature: correction ? 0.9 : 0.7, maxTokens: 8192 });
}
