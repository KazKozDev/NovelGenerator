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
 * material that is not yet its own. What it keeps is the frame — what the chapter is for, how it
 * opens and closes, where it sits in time — its own scene entire, and its neighbours as a line each.
 */
export function planForScene(chapter: ChapterRecord, sceneIndex: number): object {
  const scenes = chapter.plan.detailedScenes || [];
  // sceneBreakdown is the same chapter told again in prose — arrival, confession, discovery,
  // confrontation, choice, aftermath, all of it already in the scenes below it, and 774 characters of
  // a measured plan. Two accounts of one plan cost tokens and can disagree with each other; the
  // structured one is the account the engine checks against, so it is the one a prompt carries. The
  // field stays in the plan, for the plan screen and for whoever plans the chapters after this one.
  const { detailedScenes: _scenes, sceneBreakdown: _breakdown, ...frame } = chapter.plan;
  return {
    ...frame,
    thisScene: scenes[sceneIndex],
    otherScenes: scenes.map((scene, index) => index === sceneIndex ? undefined
      : { sceneId: scene.sceneId, objective: scene.objective, outcome: scene.outcome, position: index < sceneIndex ? 'earlier' : 'later' })
      .filter(Boolean),
  };
}

/** The literary intent of this scene, plus the two lines that belong to the chapter as a whole. */
export function literaryIntentForScene(chapter: ChapterRecord, sceneId: string): object | undefined {
  const plan = chapter.literaryPlan;
  if (!plan) return undefined;
  return {
    endingDevelopment: plan.endingDevelopment,
    avoidReplaying: plan.avoidReplaying,
    thisScene: (plan.scenes || []).find(scene => scene.sceneId === sceneId),
  };
}

export async function writeScene(run: NovelRun, chapter: ChapterRecord, sceneIndex: number, llm: NovelLLM, correction = ''): Promise<string> {
  const scenes = chapter.plan.detailedScenes;
  if (!scenes?.length || !scenes[sceneIndex]) throw new Error('A validated scene plan is required.');
  const scene = scenes[sceneIndex];
  const sceneTarget = sceneWordTargets(chapter, run.spec.targetWordsPerChapter)[sceneIndex];
  const context = `${specPrompt(run.spec)}${genreCraft(run.spec)}${proseCraft(run, chapter)}\nLITERARY INTENT FOR THIS SCENE:\n${JSON.stringify(literaryIntentForScene(chapter, scene.sceneId))}\nCHAPTER ${chapter.number} OF ${run.spec.chapterCount}\nROLE OF CHAPTER: ${chapterRole(chapter.number, run.spec.chapterCount)}\nWHOLE STORY INTENT (not character knowledge):\n${run.outline}\nCHARACTER DESIGN (intent, not established events; the people in this scene):\n${JSON.stringify(Object.fromEntries(Object.entries(run.blueprint?.characters || {}).filter(([name]) => (scene.participants || []).some(person => person.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(person.toLowerCase())))))}\nACCEPTED CANON:\n${JSON.stringify(canonForScene(canonBefore(run, chapter.number), scene.participants || [], chapter.number))}\nPROMISES SCHEDULED FOR THIS CHAPTER:\n${JSON.stringify((run.blueprint?.promises || []).filter(promise => promise.setupChapter === chapter.number || promise.payoffChapter === chapter.number))}\nCHAPTER PLAN (this scene entire, its neighbours as a line each):\n${JSON.stringify(planForScene(chapter, sceneIndex))}\nSCENE ${sceneIndex + 1}/${scenes.length}${alreadyOnThePage(chapter)}\nTARGET SCENE LENGTH: ${sceneTarget} words; approximate scene allocation, not a quota for each paragraph. This is a full book scene, not a synopsis.\nWrite the scene as a causal change: the viewpoint character pursues a goal, encounters resistance, makes a consequential choice, and reaches the planned outcome. Dramatize every planned beat on the page. ${scene.conflictCarriedBy === 'speech' ? 'THIS SCENE IS CARRIED BY SPEECH: the opposing aims meet in conversation on the page, in direct speech, at the length the confrontation needs. Write the refusal, the pressure that follows it and the thing said that cannot be taken back. Do not summarize the exchange, report it from outside, or resolve it in two lines. Once the reader knows who is speaking, most lines carry no attribution and no gesture at all; add one only where it changes the exchange, and never follow a named gesture with its anatomy and then its meaning. ' : scene.conflictCarriedBy === 'action' ? 'This scene is carried by physical action; speech is optional here. ' : 'This scene is faced alone; it needs no dialogue. '}Otherwise use action, description or interiority where the scene needs them; no paragraph is required to contain all of them. Do not append an aftermath that only restates the outcome. Let important exchanges and decisions unfold instead of summarizing them. Characters can know only what they have learned. Protect proper names and established clues. Output only prose without a chapter heading, notes or placeholders. The requested voice overrides generic stylistic preferences.`;

  return generateProse(llm, `${context}${correction ? `\n${correction}` : ''}`, 'You are the single prose writer for this novel. Keep the author contract and scene causality intact.', { temperature: correction ? 0.9 : 0.7, maxTokens: 8192 });
}
