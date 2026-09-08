import type { ChapterRecord, NovelRun } from './contracts';
import { chapterRole, specPrompt } from './contracts';
import { canonBefore, canonForPrompt } from './storyState';
import { generateProse, structuredResponse, type NovelLLM } from './review';

/** Both writing strategies receive the same scene contract so they can be compared fairly. */
export async function writeScene(run: NovelRun, chapter: ChapterRecord, sceneIndex: number, llm: NovelLLM): Promise<string> {
  const scenes = chapter.plan.detailedScenes;
  if (!scenes?.length || !scenes[sceneIndex]) throw new Error('A validated scene plan is required.');
  const scene = scenes[sceneIndex];
  const sceneTarget = Math.round((chapter.plan.targetWordCount || run.spec.targetWordsPerChapter) / scenes.length);
  const context = `${specPrompt(run.spec)}\nCHAPTER ${chapter.number} OF ${run.spec.chapterCount}\nROLE OF CHAPTER: ${chapterRole(chapter.number, run.spec.chapterCount)}\nWHOLE STORY INTENT (not character knowledge):\n${run.outline}\nCHARACTER DESIGN (intent, not established events):\n${JSON.stringify(run.blueprint?.characters)}\nACCEPTED CANON:\n${JSON.stringify(canonForPrompt(canonBefore(run, chapter.number)))}\nPLANNED PROMISES:\n${JSON.stringify(run.blueprint?.promises)}\nCHAPTER PLAN:\n${JSON.stringify(chapter.plan)}\nSCENE ${sceneIndex + 1}/${scenes.length}:\n${JSON.stringify(scene)}\nEARLIER PROSE IN THIS CHAPTER:\n${(chapter.sceneDrafts || []).join('\n\n***\n\n')}\nTARGET SCENE LENGTH: ${sceneTarget} words; acceptable range ${Math.ceil(sceneTarget * 0.9)}–${Math.floor(sceneTarget * 1.1)} words. This is a full book scene, not a synopsis.\nWrite the scene as a causal change: the viewpoint character pursues a goal, encounters resistance, makes a consequential choice, and reaches the planned outcome. Dramatize every planned beat on the page. Integrate substantial dialogue, action, concrete sensory detail, interior response and aftermath naturally; do not add a generic gesture merely to alternate paragraph types. Let important exchanges and decisions unfold instead of summarizing them. Characters can know only what they have learned. Protect proper names and established clues. Output only prose without a chapter heading, notes or placeholders. The requested voice overrides generic stylistic preferences.`;

  if (run.spec.writingMode === 'scenes') {
    return generateProse(llm, context, 'You are the single prose writer for this novel. Keep the author contract and scene causality intact.', { temperature: 0.7, maxTokens: 8192 });
  }

  const slotPattern = /\[((?:DIALOGUE|INTERNAL|ACTION|DESCRIPTION)_\d+)\]/g;
  // The field description must never be mistaken for the value: a model that echoes it produces a scene with no prose.
  const structure = await structuredResponse(`${context}\nFor this step, do not write the final scene. Return JSON with two fields.\n"framework": the connective narrative prose of this scene in the story's language, with markers such as [DIALOGUE_1], [INTERNAL_1], [ACTION_1] or [DESCRIPTION_1] standing in for the passages specialists will write. Write the real linking prose; never return this description as the value.\n"slots": one entry per marker: [{"id":"DIALOGUE_1","purpose":"specific narrative function","participants":["name"]}].\nEvery marker in framework needs exactly one slot and every slot id must appear in framework. Use as many or as few of each type as the scene needs.\nA marker replaces the passage it stands for: never narrate or summarize in the framework a beat that a slot will write.`, 'You plan a coherent scene framework for specialist contributions.', llm, ['framework', 'slots'], raw => {
    if (typeof raw.framework !== 'string' || !Array.isArray(raw.slots) || !raw.slots.length) throw new Error('Slot writer returned no usable scene framework.');
    const markers = new Set([...raw.framework.matchAll(slotPattern)].map(match => match[1]));
    const ids = new Set<string>();
    for (const slot of raw.slots) {
      if (typeof slot.id !== 'string' || !markers.has(slot.id) || ids.has(slot.id)) throw new Error(`Slot ${String(slot?.id)} is duplicated or absent from the framework.`);
      ids.add(slot.id);
    }
    for (const marker of markers) if (!ids.has(marker)) throw new Error(`Framework marker [${marker}] has no slot definition.`);
    return raw as { framework: string; slots: { id: string; purpose: string; participants: string[] }[] };
  }, { temperature: 0.4, maxTokens: 8192, route: 'writer', schema: { type: 'object', required: ['framework', 'slots'], properties: { framework: { type: 'string', minLength: 1 }, slots: { type: 'array', minItems: 1, items: { type: 'object', required: ['id', 'purpose', 'participants'], properties: { id: { type: 'string', pattern: '^(DIALOGUE|INTERNAL|ACTION|DESCRIPTION)_[0-9]+$' }, purpose: { type: 'string', minLength: 1 }, participants: { type: 'array', items: { type: 'string' } } }, additionalProperties: false } } }, additionalProperties: false } });
  const contents: Record<string, string> = {};
  for (const group of [['DIALOGUE', 'INTERNAL'], ['ACTION', 'DESCRIPTION']]) {
    const slots = structure.slots.filter((slot: { id: string }) => group.some(prefix => slot.id.startsWith(prefix)));
    if (!slots.length) continue;
    const required = slots.map((slot: { id: string }) => slot.id);
    const result = await structuredResponse(`${context}\nFRAMEWORK:\n${structure.framework}\nSLOTS TO FILL:\n${JSON.stringify(slots)}\nALREADY WRITTEN CONTRIBUTIONS:\n${JSON.stringify(contents)}\nFor this step return JSON {"content":{"SLOT_ID":"complete prose passage"}}. Fill every requested slot with finished prose in the story's language, keeping its narrative function and participants.`, 'You write scene contributions under the novel author contract.', llm, ['content'], raw => {
      for (const id of required) {
        const text = raw.content?.[id];
        if (typeof text !== 'string' || !text.trim()) throw new Error(`Missing required slot ${id}.`);
      }
      return raw as { content: Record<string, string> };
    }, { temperature: 0.7, maxTokens: 8192, route: 'writer', schema: { type: 'object', required: ['content'], properties: { content: { type: 'object', required, properties: Object.fromEntries(required.map((id: string) => [id, { type: 'string', minLength: 1 }])), additionalProperties: false } }, additionalProperties: false } });
    for (const id of required) contents[id] = result.content[id];
  }
  const assembled = structure.framework.replace(slotPattern, (marker: string, id: string) => contents[id] || marker);
  return generateProse(llm, `${context}\nASSEMBLED SCENE:\n${assembled}\nIntegrate this scene in one consistent voice. Preserve every planned event, clue and consequential choice. Do not compress it into a synopsis. The assembly seam duplicates material: where the connective prose and an inserted passage carry the same beat, keep the stronger one and delete the other. The finished scene must not narrate a moment twice in different words, and must not summarize dialogue or action it has just dramatized. Output only the finished scene.`, 'You synthesize specialist prose into a complete scene under the author contract.', { temperature: 0.3, maxTokens: 8192 });
}
