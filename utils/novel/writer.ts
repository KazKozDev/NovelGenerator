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
export async function writeScene(run: NovelRun, chapter: ChapterRecord, sceneIndex: number, llm: NovelLLM, correction = ''): Promise<string> {
  const scenes = chapter.plan.detailedScenes;
  if (!scenes?.length || !scenes[sceneIndex]) throw new Error('A validated scene plan is required.');
  const scene = scenes[sceneIndex];
  const sceneTarget = sceneWordTargets(chapter, run.spec.targetWordsPerChapter)[sceneIndex];
  const context = `${specPrompt(run.spec)}${genreCraft(run.spec)}${proseCraft(run, chapter)}\nVERSIONED LITERARY DEVELOPMENT PLAN:\n${JSON.stringify(chapter.literaryPlan)}\nCHAPTER ${chapter.number} OF ${run.spec.chapterCount}\nROLE OF CHAPTER: ${chapterRole(chapter.number, run.spec.chapterCount)}\nWHOLE STORY INTENT (not character knowledge):\n${run.outline}\nCHARACTER DESIGN (intent, not established events):\n${JSON.stringify(run.blueprint?.characters)}\nACCEPTED CANON:\n${JSON.stringify(canonForScene(canonBefore(run, chapter.number), scene.participants || [], chapter.number))}\nPLANNED PROMISES:\n${JSON.stringify(run.blueprint?.promises)}\nCHAPTER PLAN:\n${JSON.stringify(chapter.plan)}\nSCENE ${sceneIndex + 1}/${scenes.length}:\n${JSON.stringify(scene)}${alreadyOnThePage(chapter)}\nTARGET SCENE LENGTH: ${sceneTarget} words; approximate scene allocation, not a quota for each paragraph. This is a full book scene, not a synopsis.\nWrite the scene as a causal change: the viewpoint character pursues a goal, encounters resistance, makes a consequential choice, and reaches the planned outcome. Dramatize every planned beat on the page. ${scene.conflictCarriedBy === 'speech' ? 'THIS SCENE IS CARRIED BY SPEECH: the opposing aims meet in conversation on the page, in direct speech, at the length the confrontation needs. Write the refusal, the pressure that follows it and the thing said that cannot be taken back. Do not summarize the exchange, report it from outside, or resolve it in two lines. Once the reader knows who is speaking, most lines carry no attribution and no gesture at all; add one only where it changes the exchange, and never follow a named gesture with its anatomy and then its meaning. ' : scene.conflictCarriedBy === 'action' ? 'This scene is carried by physical action; speech is optional here. ' : 'This scene is faced alone; it needs no dialogue. '}Otherwise use action, description or interiority where the scene needs them; no paragraph is required to contain all of them. Do not append an aftermath that only restates the outcome. Let important exchanges and decisions unfold instead of summarizing them. Characters can know only what they have learned. Protect proper names and established clues. Output only prose without a chapter heading, notes or placeholders. The requested voice overrides generic stylistic preferences.`;

  return generateProse(llm, `${context}${correction ? `\n${correction}` : ''}`, 'You are the single prose writer for this novel. Keep the author contract and scene causality intact.', { temperature: correction ? 0.9 : 0.7, maxTokens: 8192 });
}
