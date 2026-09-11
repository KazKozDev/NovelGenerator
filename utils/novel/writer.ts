import { proseCraft, sceneWordTargets } from './proseCraft';
import type { ChapterRecord, NovelRun } from './contracts';
import { BESTSELLER_REQUIREMENTS, SAMPLING, STRUCTURE_BANS, languageContract } from './diversity';
import { COHERENCE_RULES } from './coherence';
import { chapterRole, genreCraft, specPrompt } from './contracts';
import { acceptedVersion, canonBefore, canonForPrompt, canonForScene } from './storyState';
import { journalSoFar } from './sceneJournal';
import { generateProse, type NovelLLM } from './review';

/**
 * What the chapter has already put on the page, in the forms the next scene actually needs.
 *
 * Measured across 141 scenes of stored first drafts: three quarters of the scenes after the first
 * repeated something an earlier scene of the same chapter had already said, and 83% of those repeated
 * sentences matched prose this writer was never shown. That is not copying, it is two scenes deriving
 * the same material from the same plan — each one handed the chapter's frame, its canon and its
 * people, and asked for a thousand words without being told what the page already says. Cutting the
 * prompt from the whole chapter to its last words made the copying smaller and the convergence more
 * common: repeated sentences fell from 23.2% to 13.6%, while the share of scenes repeating something
 * rose from 69% to 83%. What was missing was never the prose; it was the record of what had been
 * said, which is what the journal's 'told' notes carry and what the ban below is built on.
 *
 * Pasting every finished scene in full is not the way back. It made the prose already written 43.5% of
 * a 78,000-character prompt while the scene to write was 0.7% of it, and a live chapter came back as
 * its second scene written four times: with the answer filling half the page, copying it is the
 * shortest path to a plausible response.
 */
function alreadyOnThePage(chapter: ChapterRecord, sceneIndex: number): string {
  const written = chapter.sceneDrafts || [];
  if (!written.length) return '';
  const journal = journalSoFar(chapter, sceneIndex);
  // The plan is the fallback, not the record: it says what the earlier scenes were for, which is what
  // this section used to declare had happened. A run resumed from a checkpoint written before the
  // journal existed, or a scene whose extraction failed, still gets that much rather than nothing.
  const covered = new Set(journal.map(entry => entry.sceneId));
  const unjournalled = (chapter.plan.detailedScenes || []).slice(0, written.length)
    .filter(scene => !covered.has(scene.sceneId))
    .map(scene => ({ sceneId: scene.sceneId, objective: scene.objective, outcome: scene.outcome }));
  const tail = written.at(-1)!.slice(-1200);
  // The notes, not the lines that proved them. A quotation is how a note earns its place in the
  // record; the writer of the next scene needs what the note says, and handing it a dozen verbatim
  // passages per earlier scene gives it earlier prose to echo instead of prose to continue from.
  const notes = journal.map(entry => ({
    sceneId: entry.sceneId,
    alreadyOnThePage: entry.notes.filter(note => note.kind === 'told').map(note => note.note),
    nowTrue: entry.notes.filter(note => note.kind !== 'told').map(note => `${note.kind}: ${note.note}`),
  }));
  const told = notes.flatMap(entry => entry.alreadyOnThePage);
  return (journal.length ? `\nWHERE THIS CHAPTER STANDS — taken from the scenes already written. This is a draft record of a chapter still being written, not accepted canon; where it and the prose below disagree, the prose is what happened:\n${JSON.stringify(notes)}` : '')
    + (told.length ? `\nALREADY ON THE PAGE, AND NOT YOURS TO WRITE AGAIN — each of these has been described, explained or played out in this chapter already, and a reader has just read it: ${JSON.stringify(told)}. Do not describe, explain or dramatize any of them a second time. Refer to them the way people refer to what they both already know — in a clause, in passing, or not at all — and spend your words on what this scene alone adds.` : '')
    + (unjournalled.length ? `\nALREADY DRAMATIZED IN THIS CHAPTER — these events happened on the page and must not be told again:\n${JSON.stringify(unjournalled)}` : '')
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
SCENE TRANSITION DATA IS PRIVATE: any fields named initialState, continuityRequirements, prohibitedShortcuts or exitHook are production constraints. Dramatize their content; never output their names, labels or instructions.
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
  const sceneShape = typeof (scene as { sceneShape?: unknown }).sceneShape === 'string' ? (scene as { sceneShape: string }).sceneShape : '';
  // The character design travels as a JSON object keyed by name, and a name read out of a key
  // alongside a participant list spelled slightly differently is how a book acquires two spellings of
  // one person. The spellings the book owns are worth stating as a list, in the story's own script,
  // where they cannot be mistaken for a field name.
  const cast = [...new Set([
    ...Object.entries(run.blueprint?.characters || {}).flatMap(([key, person]) => [key, person?.name]),
    ...(scene.participants || []),
  ].filter((name): name is string => typeof name === 'string' && !!name.trim()).map(name => name.trim()))];
  const freshConstraint = typeof (scene as { freshConstraint?: unknown }).freshConstraint === 'string' ? (scene as { freshConstraint: string }).freshConstraint : '';
  const isRussian = (run.spec.language || '').toLowerCase().startsWith('ru');
  const dialogueFormatting = isRussian
    ? 'Каждая реплика прямой речи ОБЯЗАТЕЛЬНО пишется с новой строки с тире ("— "), например:\n— Куда мы идем? — спросил он, не оборачиваясь.\n— Скоро узнаешь, — ответила она.\nДиалог между персонажами ОБЯЗАТЕЛЕН и должен составлять 35–50% объема сцены!'
    : 'Format each spoken line on its own new line with quotation marks ("Where are we going?" he asked). Direct dialogue between characters is MANDATORY and must form 35–50% of the scene!';

  const dialogueInstruction = (scene.participants || []).length >= 2 || scene.conflictCarriedBy === 'speech'
    ? `CRITICAL DIALOGUE REQUIREMENT: Multiple characters are present (${(scene.participants || []).join(', ')}). They MUST actively converse out loud on the page in direct speech. Write the questions, answers, refusals, subtext, arguments and emotional reactions. Do NOT summarize conversations in authorial narrative ("they spoke about X"). Characters must speak out loud!
${dialogueFormatting}`
    : `DIALOGUE: If any other character appears or speaks, dramatize it in direct dialogue lines. ${dialogueFormatting}`;

  const prior = run.chapters.filter(item => item.number < chapter.number).map(acceptedVersion).filter(Boolean).at(-1);
  const priorEnding = (sceneIndex === 0 && chapter.number > 1 && prior?.content)
    ? `\nCONTINUATION FROM PREVIOUS CHAPTER (Chapter ${chapter.number - 1}):
The previous chapter ended with the following text:
"...${prior.content.slice(-1200)}"
CONTINUATION CONTRACT:
1. Continue the story directly from where Chapter ${chapter.number - 1} left off.
2. DO NOT repeat the previous chapter's opening hook, setting descriptions, weather, sensory tropes, or introductory devices.
3. Characters, locations, and tensions established in Chapter ${chapter.number - 1} are already known; do not re-introduce them from scratch.`
    : '';

  const context = `${specPrompt(run.spec)}${genreCraft(run.spec)}${proseCraft(run, chapter)}\n${languageContract(run.spec.language)}\n${STRUCTURE_BANS}\n${BESTSELLER_REQUIREMENTS}\n${sceneShape ? `ASSIGNED SCENE SHAPE: ${sceneShape}. Build the scene in that shape, unlike its neighbors.\n` : ''}${freshConstraint ? `SCENE CONSTRAINT: ${freshConstraint}.\n` : ''}${COHERENCE_RULES}\nLITERARY INTENT FOR THIS SCENE (how it is written; never what the prose states):\n${JSON.stringify(literaryIntentForScene(chapter, scene.sceneId))}\nCHAPTER ${chapter.number} OF ${run.spec.chapterCount}\nROLE OF CHAPTER: ${chapterRole(chapter.number, run.spec.chapterCount)}\nWHAT THE BOOK IS ABOUT (background for your judgement, not character knowledge and not material for this scene):\n${run.blueprint?.centralConflict || run.spec.premise}\nCHARACTER DESIGN (intent, not established events; the people in this scene):\n${JSON.stringify(Object.fromEntries(Object.entries(run.blueprint?.characters || {}).filter(([name]) => (scene.participants || []).some(person => person.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(person.toLowerCase())))))}\nEVERY NAME THIS BOOK OWNS, spelled as it is spelled here and nowhere otherwise; anyone not on this list is named by their role, never by a new name:\n${JSON.stringify(cast)}\nACCEPTED CANON:\n${JSON.stringify(canonForScene(canonBefore(run, chapter.number), scene.participants || [], chapter.number))}\nPROMISES SCHEDULED FOR THIS CHAPTER (the chapter's business, not necessarily this scene's; plant or pay one off only where this scene's own planned outcome carries it):\n${JSON.stringify((run.blueprint?.promises || []).filter(promise => promise.setupChapter === chapter.number || promise.payoffChapter === chapter.number))}\nCHAPTER PLAN (this scene entire; the scenes already written as a line each, the ones still to come as a name only):\n${JSON.stringify(planForScene(chapter, sceneIndex))}\nSCENE ${sceneIndex + 1}/${scenes.length}${alreadyOnThePage(chapter, sceneIndex)}${priorEnding}\nTARGET SCENE LENGTH: approximately ${sceneTarget} words. This is a full, immersive, unabbreviated book scene. You MUST reach approximately ${sceneTarget} words by developing every beat in real time on the page through rich dialogue, sensory atmosphere, character reactions, and detailed physical actions. Never summarize or compress events into high-level synopses.\nWrite the scene as a causal change: the viewpoint character pursues a goal, encounters resistance, makes a consequential choice, and reaches the planned outcome.\n${sceneContract(scene, sceneIndex, scenes.length)}\n${dialogueInstruction}\nOtherwise use action, description or interiority where the scene needs them; no paragraph is required to contain all of them. Do not append an aftermath that only restates the outcome. Let important exchanges and decisions unfold instead of summarizing them. Characters can know only what they have learned. Protect proper names and established clues, spelling every name exactly as the list above spells it. Output only prose in the ${run.spec.tense} tense, without a chapter heading, a scene label, notes, placeholders or any word taken from the plan you were given: the plan is what you dramatize, never what you write down. The requested voice overrides generic stylistic preferences.`;

  return generateProse(llm, `${context}${correction ? `\n${correction}` : ''}`, 'You are the single prose writer for this novel. Keep the author contract and scene causality intact. Write rich direct dialogue for all character interactions.', { temperature: correction ? SAMPLING.proseCorrection : SAMPLING.prose, maxTokens: 8192 });
}

/**
 * Generates an entire chapter in a single pass.
 * Formats all planned scenes into a coherent sequential narrative prompt,
 * instructing the model to produce continuous, fully dramatized prose with '***' scene breaks.
 */
export async function writeFullChapter(
  run: NovelRun,
  chapter: ChapterRecord,
  llm: NovelLLM,
  correction = ''
): Promise<string> {
  const scenes = chapter.plan.detailedScenes;
  if (!scenes?.length) throw new Error('A validated scene plan is required.');
  const targetWords = chapter.plan.targetWordCount || run.spec.targetWordsPerChapter;
  const sceneTargets = sceneWordTargets(chapter, targetWords);
  const isRussian = (run.spec.language || '').toLowerCase().startsWith('ru');

  const cast = [...new Set([
    ...Object.entries(run.blueprint?.characters || {}).flatMap(([key, person]) => [key, person?.name]),
    ...scenes.flatMap(scene => scene.participants || []),
  ].filter((name): name is string => typeof name === 'string' && !!name.trim()).map(name => name.trim()))];

  const scheduledPromises = (run.blueprint?.promises || []).filter(
    promise => promise.setupChapter === chapter.number || promise.payoffChapter === chapter.number
  );

  const sceneSequence = scenes.map((s, idx) => {
    const participants = s.participants || [];
    const hasMultiple = participants.length >= 2 || s.conflictCarriedBy === 'speech';
    return `
SCENE ${idx + 1}/${scenes.length} [${s.sceneId}]:
- Target Scene Length: approximately ${sceneTargets[idx]} words (do NOT summarize or condense; write full, unabbreviated scene depth)
- Setting/Location: ${s.location || 'Established in scene'}
- Participants: ${participants.join(', ') || 'Protagonist alone'}
- Viewpoint Goal & Pursuit: ${s.objective}
- Conflict & Obstacles: ${s.conflict}
- Outcome & Consequential Change: ${s.outcome}
- Planned Moments to dramatize: ${JSON.stringify(s.keyMoments || [])}
${hasMultiple
  ? `- DIALOGUE MANDATE: Characters (${participants.join(', ')}) MUST actively converse on the page in direct speech. Write out their verbal exchanges, arguments, questions, and reactions in full.`
  : '- DIALOGUE: Focus on internal tension and physical action; if another character speaks, dramatize it in direct speech.'}
`;
  }).join('\n');

  const dialogueRules = isRussian
    ? `ПРАВИЛА ДИАЛОГОВ (ОБЯЗАТЕЛЬНО ДЛЯ РУССКОГО ЯЗЫКА):
- В любой сцене с участием двух и более персонажей диалог ОБЯЗАН составлять 35–50% объема текста!
- Каждая реплика прямой речи ОБЯЗАТЕЛЬНО пишется с новой строки с тире ("— "), например:
  — Ты уверен, что они нас не видели? — тихо спросил он.
  — Абсолютно, — ответила она, не оборачиваясь. — Но у нас мало времени.
- СТРОГО ЗАПРЕЩЕНО заменять диалоги пересказом ("они поговорили", "он объяснил ситуацию"). Персонажи обязаны спорить, спрашивать и отвечать своими словами!`
    : `DIALOGUE MANDATE:
- In any scene with two or more characters, direct dialogue MUST form 35–50% of the text!
- Format each spoken line on a new line with quotation marks:
  "Are you sure they didn't see us?" he asked quietly.
  "Certain," she replied without looking back. "But we don't have much time."
- NEVER replace character conversation with authorial summary ("they talked about the situation"). Write their actual spoken words!`;

  const context = `${specPrompt(run.spec)}${genreCraft(run.spec)}${proseCraft(run, chapter)}
${languageContract(run.spec.language)}
${STRUCTURE_BANS}
${BESTSELLER_REQUIREMENTS}
${COHERENCE_RULES}
CHAPTER ${chapter.number} OF ${run.spec.chapterCount}: "${chapter.plan.title || `Chapter ${chapter.number}`}"
ROLE OF CHAPTER: ${chapterRole(chapter.number, run.spec.chapterCount)}
WHAT THE BOOK IS ABOUT (central conflict):
${run.blueprint?.centralConflict || run.spec.premise}
LITERARY INTENT FOR THIS CHAPTER (how it is written; never what the prose states):
${JSON.stringify(chapter.literaryPlan || {})}
CHARACTER DESIGN (intent, not established events):
${JSON.stringify(run.blueprint?.characters || {})}
EVERY NAME THIS BOOK OWNS, spelled as it is spelled here and nowhere otherwise:
${JSON.stringify(cast)}
ACCEPTED CANON BEFORE THIS CHAPTER:
${JSON.stringify(canonForPrompt(canonBefore(run, chapter.number)))}
PROMISES SCHEDULED FOR THIS CHAPTER (plant or pay off where planned):
${JSON.stringify(scheduledPromises)}
APPROVED CHAPTER PLAN:
Opening Hook: ${chapter.plan.openingHook || 'Engage the reader from the first line.'}
Chapter Summary: ${chapter.plan.summary || ''}
Chapter Ending: ${chapter.plan.chapterEnding || ''}
Plot Advancement: ${chapter.plan.plotAdvancement || ''}

PLANNED SCENES TO DRAMATIZE (in exact sequence):
${sceneSequence}

CHAPTER WRITING CONTRACT:
1. Write the COMPLETE chapter from the opening hook through to the chapter ending in one continuous manuscript text.
2. Separate each scene with a scene break ('***' on its own line).
3. Target length: approximately ${targetWords} words (allocated across scenes: ${sceneTargets.map((t, i) => `Scene ${i + 1} ~${t} words`).join(', ')}). This is a full, immersive chapter with rich sensory atmosphere, physical action, and in-depth dialogue. Do NOT summarize or condense scenes.
4. Spoken lines must be direct speech with distinct voices, opposing aims, and emotional subtext.
${dialogueRules}
5. Protect proper names, established clues, and causal continuity. Characters know only what canon or their perceptions provide.
6. Output ONLY finished story prose in the ${run.spec.tense} tense. Do not output chapter headings, scene labels (e.g. "Scene 1"), bracketed notes, bullet lists, or meta-commentary. Start directly with the first sentence of the story.`;

  const maxTokens = Math.max(16384, Math.min(32768, Math.round(targetWords * 4)));

  return generateProse(
    llm,
    `${context}${correction ? `\n\nCORRECTION REQUIRED:\n${correction}` : ''}`,
    'You are the single prose writer for this novel. Write the complete, immersive, unabbreviated chapter prose with all scenes fully dramatized and rich in direct dialogue.',
    { temperature: correction ? SAMPLING.proseCorrection : SAMPLING.prose, maxTokens }
  );
}
