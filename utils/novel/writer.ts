import { proseCraft, sceneWordTargets } from './proseCraft';
import type { ChapterRecord, NovelRun } from './contracts';
import { BESTSELLER_REQUIREMENTS, SAMPLING, STRUCTURE_BANS, languageContract } from './diversity';
import { COHERENCE_RULES } from './coherence';
import { chapterRole, genreCraft, specPrompt } from './contracts';
import { acceptedVersion, canonBefore, canonForPrompt, canonForScene } from './storyState';
import { journalSoFar } from './sceneJournal';
import { generateProse, type NovelLLM } from './review';
import { buildEditorialDirectives } from './deepCheck';

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

/** One scene of a validated chapter plan, as the writer receives it. */
type PlannedScene = NonNullable<ChapterRecord['plan']['detailedScenes']>[number];

/**
 * What the scene moves, what the move costs, and where it therefore starts.
 *
 * The plan declares the shift and the outcome type, and the scene journal reads the shift back off
 * the finished prose, so this is the one part of the scene's instructions the written scene is
 * checked against rather than merely asked for. Both prompt languages are written from it.
 */
function sceneMovement(scene: PlannedScene, previous?: PlannedScene): string {
  const shift = scene.shift
    ? `WHAT THIS SCENE SHIFTS: ${scene.shift.register}, from "${scene.shift.from}" to "${scene.shift.to}". That move happens on this page, in what is done, said or seen, and not in a sentence reporting that it happened. A scene that ends where it began has not been written.\n`
    : '';
  const ending = scene.outcomeType === 'clean'
    ? 'HOW THE ATTEMPT ENDS: it works, and this once it costs nothing new.\n'
    : scene.outcomeType === 'setback'
      ? 'HOW THE ATTEMPT ENDS: it fails, and the situation is worse afterwards than a plain failure would leave it. Put the new difficulty on the page; do not soften the failure with a consolation the plan does not contain.\n'
      : scene.outcomeType === 'costly-success'
        ? 'HOW THE ATTEMPT ENDS: it works, and it costs something that cannot be taken back. The cost is paid on the page, not mentioned as a risk.\n'
        : '';
  const inherited = previous?.outcomeType && previous.outcomeType !== 'clean'
    ? `WHERE THIS SCENE STARTS: from what the previous scene cost — ${previous.outcome}. Open inside that consequence rather than in a fresh situation that merely follows it in time.\n`
    : '';
  return shift + ending + inherited;
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
function sceneContract(scene: PlannedScene, sceneIndex: number, sceneCount: number, previous?: PlannedScene): string {
  const remaining = sceneCount - sceneIndex - 1;
  return sceneMovement(scene, previous) + `WHAT THIS SCENE MUST PUT ON THE PAGE — the story depends on these and nothing may stand in for them: the objective pursued (${scene.objective}), the resistance that meets it (${scene.conflict}), the consequential choice it forces, and these planned moments dramatized as action, speech or discovery rather than reported: ${JSON.stringify(scene.keyMoments)}.
WHAT CHANGES BY THE END: ${scene.outcome}. The scene begins in the situation the chapter has reached so far and leaves it changed in exactly that way.
SCENE TRANSITION DATA IS PRIVATE: any fields named initialState, continuityRequirements, prohibitedShortcuts or exitHook are production constraints. Dramatize their content; never output their names, labels or instructions.
WHERE THE SCENE STOPS: once that outcome has happened on the page. Do not carry the story past it. A closing summary of what the scene meant, or of how the character now feels about it, is not required and usually costs the ending its force; end on the event, the line or the image that completes the change. NO CLICHÉ VANISHING EXITS: Never end an interaction by having a character mysteriously dissolve, disappear into shadows or mist, or vanish the moment someone blinks or looks away; departures must be physically concrete and grounded in the environment.
PHYSICAL AND OPERATIONAL PLAUSIBILITY: Any planted clue, piece of evidence, intercepted device, or discovery must have a credible physical source and origin. Never introduce unexplained foreign devices or clues planted impossibly inside secured environments without dramatizing the breach or previous recovery.
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
    ? 'Каждая реплика прямой речи ОБЯЗАТЕЛЬНО пишется с новой строки с тире ("— "), например:\n— Куда мы идем? — спросил он, не оборачиваясь.\n— Скоро узнаешь, — ответила она.\nДиалог между персонажами ОБЯЗАТЕЛЕН и должен составлять 35–50% объема сцены! Никогда не выводи более двух реплик подряд без атрибуции говорящего или физического микродействия (взгляд, жест, поза, реакция тела, пауза, взаимодействие с окружением), чтобы персонажи оставались живыми и осязаемыми, а не «говорящими головами».'
    : 'Format each spoken line on its own new line with quotation marks ("Where are we going?" he asked). Direct dialogue between characters is MANDATORY and must form 35–50% of the scene! Never output more than two consecutive spoken dialogue lines without speaker attribution, physical micro-action (gesture, gaze, posture shift, breath), or environmental interaction to keep speakers physically grounded rather than floating talking heads.';

  const dialogueInstruction = (scene.participants || []).length >= 2 || scene.conflictCarriedBy === 'speech'
    ? `CRITICAL DIALOGUE REQUIREMENT: Multiple characters are present (${(scene.participants || []).join(', ')}). They MUST actively converse out loud on the page in direct speech. Write the questions, answers, refusals, subtext, arguments and emotional reactions. Do NOT summarize conversations in authorial narrative ("they spoke about X"). Characters must speak out loud!
${dialogueFormatting}`
    : `DIALOGUE: If any other character appears or speaks, dramatize it in direct dialogue lines. ${dialogueFormatting}`;

  const prior = run.chapters.filter(item => item.number < chapter.number).map(acceptedVersion).filter(Boolean).at(-1);
  const priorChapter = chapter.number > 1 ? run.chapters.find(c => c.number === chapter.number - 1) : undefined;
  const editorialDirectives = priorChapter ? buildEditorialDirectives(priorChapter, run) : '';
  const priorEnding = (sceneIndex === 0 && chapter.number > 1 && prior?.content)
    ? `\nCONTINUATION FROM PREVIOUS CHAPTER (Chapter ${chapter.number - 1}):
The previous chapter ended with the following text:
"...${prior.content.slice(-1200)}"
CONTINUATION CONTRACT:
1. Continue the story directly from where Chapter ${chapter.number - 1} left off.
2. DO NOT repeat the previous chapter's opening hook, setting descriptions, weather, sensory tropes, or introductory devices.
3. Characters, locations, and tensions established in Chapter ${chapter.number - 1} are already known; do not re-introduce them from scratch.`
    : '';

  // The plan says whose scene it is where it was asked; the first participant is the old guess, kept
  // for the plans that were made before the field existed.
  const focus = scene.pov || scene.participants?.[0];
  const viewpoint = isRussian
    ? (focus ? `третье лицо (фокус на персонаже: ${focus})` : (run.spec.narrativeVoice || 'третье лицо'))
    : (focus ? `third-person limited (focus on ${focus})` : (run.spec.narrativeVoice || 'third-person'));
  /**
   * A scene holds one viewpoint, and the seam where a generated chapter loses it is not the scene
   * break: a finished book spent a page in Alfred's kitchen and then continued, with no break and no
   * name, inside Clark — "The mark on his throat was there", where "his" points at the wrong man.
   * So the writer is told whose scene this is, told to stay in it, and where the viewpoint changes
   * from the scene before, told to say whose it is now in the first sentence.
   */
  const previousPov = sceneIndex > 0 ? (chapter.plan.detailedScenes || [])[sceneIndex - 1]?.pov : undefined;
  const changed = !!(focus && previousPov && previousPov !== focus);
  const viewpointContract = !focus ? '' : isRussian
    ? `\nТОЧКА ЗРЕНИЯ: вся сцена видна глазами одного человека — ${focus}. Не выходи из того, что ${focus} может видеть, слышать и знать; мысли и мотивы остальных доступны только по их словам и поступкам. Смена точки зрения внутри сцены — брак.${changed ? ` Предыдущая сцена шла от лица другого персонажа (${previousPov}), поэтому первое предложение должно назвать ${focus} по имени и сказать, где он и когда это происходит: читатель не должен догадываться, чьё это «он».` : ''}\n`
    : `\nVIEWPOINT: the whole scene is seen through one person — ${focus}. Stay inside what ${focus} can see, hear and know; everyone else's thoughts and motives reach the page only through what they say and do. A viewpoint that changes inside a scene is a defect.${changed ? ` The previous scene was seen through someone else (${previousPov}), so the first sentence of this one names ${focus} and says where they are and when: the reader must never have to work out whose "he" or "she" this is.` : ''}\n`;

  const genreToneVoice = isRussian
    ? `Жанр: ${run.spec.genre || 'художественная проза'}, тональность: ${run.spec.tone || 'выразительная'}, повествовательный голос: ${run.spec.narrativeVoice || run.spec.writingStyle || 'литературный'}`
    : `Genre: ${run.spec.genre || 'fiction'}, tone: ${run.spec.tone || 'expressive'}, narrative voice: ${run.spec.narrativeVoice || run.spec.writingStyle || 'literary'}`;

  const relevantContext = isRussian
    ? `ПЕРСОНАЖИ В СЦЕНЕ (намерения и характер):
${JSON.stringify(Object.fromEntries(Object.entries(run.blueprint?.characters || {}).filter(([name]) => (scene.participants || []).some(p => p.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.toLowerCase())))), null, 2)}
EVERY NAME THIS BOOK OWNS (РЕЕСТР ИМЕН КНИГИ, использовать строго эти написания):
${JSON.stringify(cast)}
ПРИНЯТЫЙ КАНОН СЮЖЕТА (факты, предметы, знания):
${JSON.stringify(canonForScene(canonBefore(run, chapter.number), scene.participants || [], chapter.number), null, 2)}${editorialDirectives ? `\n${editorialDirectives}` : ''}`
    : `CHARACTERS IN THIS SCENE:
${JSON.stringify(Object.fromEntries(Object.entries(run.blueprint?.characters || {}).filter(([name]) => (scene.participants || []).some(p => p.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.toLowerCase())))), null, 2)}
EVERY NAME THIS BOOK OWNS, spelled as it is spelled here and nowhere otherwise:
${JSON.stringify(cast)}
ACCEPTED CANON:
${JSON.stringify(canonForScene(canonBefore(run, chapter.number), scene.participants || [], chapter.number), null, 2)}${editorialDirectives ? `\n${editorialDirectives}` : ''}`;

  // What earlier chapters have already described, explained or played out. Their journals are gone —
  // the canon that replaced them records what is true, not what has been said — so this is the only
  // thing standing between a scene and the second description of a room the book has already given.
  const toldInEarlierChapters = [...new Set(run.chapters.filter(item => item.number < chapter.number).flatMap(item => item.alreadyTold || []))].slice(-24);
  const alreadyGiven = toldInEarlierChapters.length
    ? `\nALREADY GIVEN IN EARLIER CHAPTERS — each of these has been described, explained or played out already, and the reader has it: ${JSON.stringify(toldInEarlierChapters)}. Refer to them as things everyone in the book takes for granted; do not describe, explain or dramatize any of them again.`
    : '';
  const previousTail = `${alreadyOnThePage(chapter, sceneIndex)}${alreadyGiven}${priorEnding ? `\n${priorEnding}` : ''}`;

  const chapterPlanStr = `CHAPTER ${chapter.number} OF ${run.spec.chapterCount}
CHAPTER PLAN:
${JSON.stringify(planForScene(chapter, sceneIndex), null, 2)}`;

  const sceneBrief = isRussian
    ? `SCENE ${sceneIndex + 1}/${scenes.length} [${scene.sceneId}]. ${scene.location ? `Локация: ${scene.location}. ` : ''}Драматургическая задача: ${scene.objective}. Конфликт и сопротивление: ${scene.conflict}.`
    : `SCENE ${sceneIndex + 1}/${scenes.length} [${scene.sceneId}]. ${scene.location ? `Location: ${scene.location}. ` : ''}Objective: ${scene.objective}. Conflict: ${scene.conflict}.`;

  const contractText = sceneContract(scene, sceneIndex, scenes.length, sceneIndex > 0 ? scenes[sceneIndex - 1] : undefined);

  const requiredBeats = isRussian
    ? `${contractText}
- Ключевые моменты: ${JSON.stringify(scene.keyMoments || [scene.conflict])}
- Запланированные обещания сюжета: ${JSON.stringify((run.blueprint?.promises || []).filter(promise => promise.setupChapter === chapter.number || promise.payoffChapter === chapter.number))}
${sceneShape ? `- Назначенная форма сцены: ${sceneShape}\n` : ''}${dialogueInstruction}`
    : `${contractText}
- Key moments to dramatize: ${JSON.stringify(scene.keyMoments || [scene.conflict])}
- Scheduled narrative promises: ${JSON.stringify((run.blueprint?.promises || []).filter(promise => promise.setupChapter === chapter.number || promise.payoffChapter === chapter.number))}
${sceneShape ? `- Assigned scene shape: ${sceneShape}\n` : ''}${dialogueInstruction}`;

  const endingState = `WHAT CHANGES BY THE END: ${scene.outcome}${freshConstraint ? (isRussian ? `\nОграничение сцены: ${freshConstraint}` : `\nScene constraint: ${freshConstraint}`) : ''}`;

  const remaining = scenes.length - sceneIndex - 1;
  const sceneTransitionObj: Record<string, unknown> = {};
  for (const key of ['initialState', 'continuityRequirements', 'prohibitedShortcuts', 'exitHook']) {
    if (key in (scene as unknown as Record<string, unknown>)) {
      sceneTransitionObj[key] = (scene as unknown as Record<string, unknown>)[key];
    }
  }
  const sceneTransitionData = Object.keys(sceneTransitionObj).length ? JSON.stringify(sceneTransitionObj, null, 2) : 'None';
  const litIntent = literaryIntentForScene(chapter, scene.sceneId);
  const literaryIntentStr = litIntent ? JSON.stringify(litIntent, null, 2) : 'None';
  const scheduledPromises = (run.blueprint?.promises || []).filter(promise => promise.setupChapter === chapter.number || promise.payoffChapter === chapter.number);
  const charactersInScene = Object.fromEntries(
    Object.entries(run.blueprint?.characters || {}).filter(([name]) =>
      (scene.participants || []).some(p => p.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.toLowerCase()))
    )
  );
  const protagonist = scene.participants?.[0] || 'the protagonist';
  const alreadyWritten = `${alreadyOnThePage(chapter, sceneIndex)}${alreadyGiven}`;

  const context = isRussian
    ? `Ты — профессиональный русскоязычный писатель. Напиши сцену ${sceneIndex + 1} главы ${chapter.number}.

ФОРМАТ ОТВЕТА
- Только художественный текст на русском языке.
- Прошедшее время; точка зрения: ${viewpoint}.${viewpointContract}
- Ориентировочный объём: ${sceneTarget} слов.
- Никаких заголовков, списков, мета-комментариев, анализа, планов, пояснений.
- Диалоги оформляй по правилам русской прямой речи.

МЕТОД THOUGHT PROPAGATION (выполни мысленно перед написанием, не выводи)
1. Определи драматургическую задачу текущей сцены: что должно измениться, что персонажи должны узнать, что почувствовать, чем сцена должна закончиться.
2. Подбери 1–3 аналогичные сцены из литературы, канона или известных тебе сильных образцов: схожая функция (конфронтация, признание, погоня, открытие тайны, тихий разговор, бой, соблазн, утрата и т. п.), схожая точка зрения, схожий эмоциональный тон.
3. Для каждой аналогии мысленно выдели, какие решения сработали: точка входа, композиция, ритм, баланс диалога, действия и размышлений, детали, подтекст, смена фокуса, способ завершения.
4. Абстрагируй эти решения в принципы, не копируя чужие фразы, сюжет или стиль.
5. Перенеси принципы на текущих персонажей, их намерения, знания, обстоятельства и канон.
6. Проверь: сцена разыгрывает только ${sceneBrief}, обязательно включает ${requiredBeats}, приводит к ${endingState}, не разыгрывает последующие события и не противоречит предшествующему тексту.
7. Только после этого напиши окончательный художественный текст.

КНИГА
Жанр, тон и повествовательный голос:
${genreToneVoice}
Центральный конфликт (о чем книга):
${run.blueprint?.centralConflict || run.spec.premise}
${specPrompt(run.spec)}

КОНТЕКСТ
Персонажи, их текущие намерения и знания, необходимые факты канона:
${relevantContext}

Непосредственно предшествующий текст:
${previousTail}

ПЛАН ГЛАВЫ
${chapterPlanStr}

План дан для ориентации. Напиши только текущую сцену; не разыгрывай события последующих сцен и глав.

ТЕКУЩАЯ СЦЕНА
${sceneBrief}

Обязательно должно произойти:
${requiredBeats}

Состояние к концу сцены:
${endingState}

ПРИНЦИПЫ
- Соблюдай канон, точку зрения и непрерывность.
- План задаёт события, а не порядок абзацев. Способ их воплощения, композицию и темп выбирай самостоятельно.
- Поступки и реплики должны вытекать из намерений, знаний и обстоятельств персонажей.
- Значимые моменты разыгрывай подробно, рутинные — сжимай. Соотношение диалога, действия и размышлений определяется сценой.
- ЭМОЦИОНАЛЬНАЯ ВЫРАЗИТЕЛЬНОСТЬ И ВНУТРЕННИЙ ПУЛЬС: избегай сухой, протокольной или бесстрастной манеры повествования. Сцена обязана обладать живым эмоциональным нервом — передавай сменяющиеся чувства героя (тревога, подавленная ярость, внезапный страх, горькая надежда, подозрение, отчаяние, облегчение). Показывай эмоции через телесные ощущения (озноб, жар, сухость в горле, тяжесть в груди, мышечный зажим), изменение голоса, невольные микрожесты и восприятие окружения под стрессом.
- НЕПОВТОРИМОСТЬ ЛОКАЦИИ: если действие продолжается в том же помещении или месте, где происходила предыдущая сцена, КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО заново описывать стены, мебель, погоду, освещение или общий интерьер. Читатель уже там. Сразу переходи к действиям, репликам и развитию конфликта.
- ЗАКОН ОДНОГО ДУБЛЯ (Single-Take Climax): Конфликт, спор или эмоциональный перелом в сцене разыгрывается строго ОДИН раз. Категорически запрещено делать «второй дубль» того же столкновения через абзац с чуть другими фразами. Как только пик достигнут — сцена бесповоротно переходит к последствиям, тишине и завершению. Никаких монтажных склеек дублей.
- БРИТВА ОККАМА ДЛЯ ПРИЧИН (No Dual Causality): У любого события, поступка или реакции персонажа есть строго ОДНА конкретная причина. Категорически запрещено двоить причинность («или же дело было в...», «впрочем, настоящая причина крылась...», «с одной стороны / с другой стороны»). Выбирай одну причину и стой на ней без колебаний.
- ТАБУ НА РАСШИФРОВКУ ПОДТЕКСТА (Show, Don't Explain): Никаких персонажей-пояснителей и авторских лекций по психоанализу. Категорически запрещено объяснять мораль, скрытые страхи и мотивы героя готовыми обобщающими тезисами («он замолчал, потому что в глубине души...»). Оставляй улику, жест, действие и молчание. Читатель должен сделать вывод сам.
- ЗАКОН ЧЕХОВСКОГО ИНВЕНТАРЯ: Никаких декоративных предметов ради красоты и «штабелей метафор». Если вещь названа и положена на стол/взята в руки — персонаж обязан физически использовать её в сюжете сцены. Если вещь не участвует в действии — убирай её со страницы.
- ДИАЛОГОВЫЙ ПИНГ-ПОНГ БЕЗ САМОПОВТОРОВ: Одна мысль на одну реплику. Категорически запрещено персонажу говорить дважды подряд одно и то же другими словами или склеивать две формулировки в одну строку («— Уходи! Оставь меня в покое!»). Каждая фраза обязана двигать разговор вперёд, а не повторять сказанное синонимами.
- Избегай синдрома «говорящих голов»: диалог должен быть вплетен в физическое действие. Никогда не давай более двух реплик подряд без атрибуции говорящего или физического микродействия (жест, взгляд, смена позы, взаимодействие с предметами).
- Улики и зацепки должны быть логически обоснованы: не подбрасывай необяснимых предметов в охраняемые локации без показанного взлома или предыстории.
- Запрещены клишированные исчезновения: персонажи не должны растворяться в тенях, тумане или исчезать, пока герой моргнул; уход должен быть физически осязаемым.
- Не растягивай текст ради объёма и не объясняй повторно то, что уже понятно из происходящего.
- Диалоги оформляй по правилам русской прямой речи.
- MANUSCRIPT CONTRACT: Output only prose in the ${run.spec.tense} tense, without a chapter heading, a scene label, notes, placeholders or any word taken from the plan you were given: the plan is what you dramatize, never what you write down.`
    : `TASK

Write scene ${sceneIndex + 1} of chapter ${chapter.number}.

OUTPUT CONTRACT

- MANUSCRIPT CONTRACT: Output only prose in the ${run.spec.tense || 'past'} tense.
- Story prose only, in ${run.spec.language || 'English'}.
- ${run.spec.tense ? `${run.spec.tense.charAt(0).toUpperCase() + run.spec.tense.slice(1)}` : 'Past'} tense.
- Third-person limited, focused on ${protagonist}.
- Target length: approximately ${sceneTarget} words.
- No headings, scene labels, bullet lists, notes, analysis, or explanations.
- Use standard double quotation marks for speech.
- Start a new paragraph when the speaker changes.
- Do not output planning labels, instructions, or editorial commentary.
- Do not pad the scene to reach the target length.


BOOK CONTRACT

Genre: ${run.spec.genre || 'fiction'}
Tone: ${run.spec.tone || 'expressive'}
Narrative voice: ${run.spec.narrativeVoice || run.spec.writingStyle || 'literary'}

Central conflict / premise:
${run.blueprint?.centralConflict || run.spec.premise}

Additional author requirements:
${specPrompt(run.spec)}


CHARACTERS AND CANON

Characters in this scene, including their current intentions, knowledge,
relationships, and speech habits where provided:

${JSON.stringify(charactersInScene, null, 2)}

EVERY NAME THIS BOOK OWNS (use these spellings for established names):
${JSON.stringify(cast)}

Established facts:
${JSON.stringify(canonForScene(canonBefore(run, chapter.number), scene.participants || [], chapter.number), null, 2)}
${editorialDirectives ? `\nEditorial directives:\n${editorialDirectives}\n` : ''}
Keep character knowledge separate from author knowledge.
A character may act on a fact only if they already know it or learn it
through events available to them in this scene.

Stay within the viewpoint character’s perceptions and interpretations.
Do not state another character’s private thoughts or motives as fact.
${viewpointContract}


CONTINUITY

Previous chapter’s ending:
${prior?.content ? `CONTINUATION FROM PREVIOUS CHAPTER (Chapter ${chapter.number - 1}):\n"${prior.content.slice(-1200)}"\nDO NOT repeat the previous chapter's opening hook, setting descriptions, weather, sensory tropes, or introductory devices.` : 'None (opening chapter)'}

Prose already written in the current chapter:
${alreadyWritten.trim() || 'None (opening scene of chapter)'}

Continue from the latest available prose. If this is the first scene
of the chapter, use the previous chapter’s ending as the continuity anchor.

Honor any planned change of time or location. Make the transition clear
without inventing intervening events that change the established situation.

Preserve relevant physical conditions, positions, possessions, injuries,
unresolved actions, and what has already been said or discovered.

Do not replay completed beats, repeat the preceding ending, or reintroduce
familiar characters and settings from scratch.

STATIC SETTING AND BACKGROUND CONTINUITY:
If this scene continues in a location, room, or setting already established in this chapter or in the preceding scene, DO NOT re-describe the architecture, weather, furniture, lighting, walls, or general atmosphere. The reader already knows where the characters are. Never repeat descriptions, explanations, or metaphors already written earlier in this chapter. Jump immediately into active character behavior, new dialogue, shifting power dynamics, and fresh developments.


CHAPTER ORIENTATION

Chapter ${chapter.number} of ${run.spec.chapterCount}

CHAPTER PLAN:
${chapterPlanStr}

The chapter plan provides context. Write only the current scene.
Future events are not facts that characters already know.


CURRENT SCENE

Scene: ${sceneIndex + 1} of ${scenes.length}
Scene ID: ${scene.sceneId}
Location: ${scene.location || 'Unspecified'}
Assigned scene shape: ${sceneShape || 'unspecified'}

Scene brief:
${sceneBrief}

Immediate objective:
${scene.objective}

Conflict / resistance:
${scene.conflict}

Required beats:
${JSON.stringify(scene.keyMoments || [scene.conflict])}

Required outcome:
${scene.outcome}

${sceneMovement(scene, sceneIndex > 0 ? scenes[sceneIndex - 1] : undefined)}
Scheduled narrative promises:
${JSON.stringify(scheduledPromises)}

Additional scene constraint:
${freshConstraint || 'None'}

Scene transition constraints:
${sceneTransitionData}

Literary intent, if supplied:
${literaryIntentStr}


SCENE BOUNDARIES

WHAT THIS SCENE MUST PUT ON THE PAGE — the story depends on these and nothing may stand in for them:
Put the objective, resistance, and required beats on the page.
Dramatize consequential choices, exchanges, and discoveries rather
than replacing them with a report that they happened.

WHAT CHANGES BY THE END: ${scene.outcome}
Make the required outcome result from what happens in the scene.
Do not use coincidence, unexplained competence, or an unestablished
resource to bypass the central obstacle.

The plan specifies events, not paragraph order. Choose the entry point,
composition, and pacing while preserving the required causal sequence.

Reveal only what established knowledge and this scene’s events support.
${remaining ? `${remaining} more scene${remaining > 1 ? 's' : ''} of this chapter follow${remaining > 1 ? '' : 's'} this one, and what they contain is not established here. ` : ''}Do not disclose future revelations, resolve later conflicts, or fulfill
narrative promises ahead of their scheduled point.

Treat transition fields such as initialState, continuityRequirements,
prohibitedShortcuts, and exitHook as constraints. Never print their labels.

Use literary intent to guide choices and emphasis. Do not turn thematic
notes into explanatory narration or speeches.

WHERE THE SCENE STOPS: once that outcome has happened on the page.
Stop when the required outcome has occurred on the page.
End on the action, line, perception, or image that completes the change.
Do not append a summary of the scene’s meaning or an artificial cliffhanger.


DIALOGUE

Dramatize consequential exchanges in direct speech.
Use dialogue when characters would speak; do not force conversation
merely because multiple characters are present.

Let the amount of dialogue follow the scene’s conflict, not a fixed quota.
Compress routine exchanges when their exact wording does not matter.

Give each speaker an immediate purpose shaped by their knowledge,
relationship, and circumstances. Allow direct answers, evasion, silence,
interruption, and misunderstanding when motivated.

Do not make characters explain shared knowledge for the reader’s benefit.
Do not force them to reveal information they would naturally withhold.
Preserve established speech habits without turning them into catchphrases.

Keep speakers identifiable through clear turn-taking and unobtrusive
attribution. Simple tags such as “said” and “asked” are welcome.

Add physical action when it affects the exchange, reveals a specific
response, or clarifies spatial relationships. Do not insert gestures,
glances, breaths, or posture changes merely to interrupt dialogue.


EMOTIONAL TEXTURE AND SENSORY RESONANCE

Choose details the viewpoint character would notice because of their
current goal, visceral emotional state, or immediate danger.

Ground the scene in authentic, shifting emotional reality: convey the
viewpoint character’s distinct internal pulse — dread, apprehension,
mounting suspicion, bitter resolve, sudden grief, sharp astonishment,
dark humor, or fragile hope. The narration must NOT be flat, unfeeling,
or purely transactional.

Show emotional stakes through immediate bodily awareness (sensations of cold,
heat, tension, fatigue, nausea, or adrenaline), perceptual changes under stress,
vocal shifts, hesitations, and competing impulses. Avoid stock melodramatic clichés.

Vary the emotional atmosphere across the scene: move from uncertainty to
confrontation, or from grim focus to vulnerability.

Interiority should add something the visible action does not:
a raw interpretation, a forbidden impulse, doubt, memory, or a private decision.
Do not summarize emotion in abstract prose — dramatize how it alters perception and choice.

Dramatize pivotal moments in depth and compress routine transitions.


PHYSICAL AND CAUSAL PLAUSIBILITY

Keep movement, timing, access, object handling, and spatial relationships
consistent with the established environment.

Any discovered clue, evidence, or device must have a plausible origin
and route into the scene. Do not place it inside a secured environment
without an established or credibly supported means of access.

Distinguish observation from inference. Characters may suspect more than
they can prove, but narration must not silently turn suspicion into fact.

Departures must follow the setting’s physical rules and any explicitly
established abilities. Do not use unexplained disappearance into shadow,
mist, or a momentary distraction as a convenient ending.


SPECIFICITY AND RESTRAINT

- SINGLE-TAKE CLIMAX: The confrontation, dispute, or emotional pivot in the scene plays out strictly ONCE. Never generate a second "take" or rehash of the same clash a paragraph later with varied wording. Once peak intensity is reached, move decisively to consequences, silence, and resolution.
- SINGLE CAUSALITY (OCCAM'S RAZOR): Every action, event, or emotional reaction must have strictly ONE concrete cause. Never offer dual causality or explanatory hedges ("or perhaps it was...", "though the real reason was...", "partly because... partly because..."). Choose one reason and commit without wavering.
- NO PSYCHOANALYSIS LECTURES (SHOW, DON'T EXPLAIN): Never turn narration or characters into psychological explainers outlining hidden motives, moral lessons, or subtext ("he remained silent because deep down..."). Present the concrete action, clue, gesture, and silence; let the reader draw the conclusion.
- CHEKHOV'S PROPS ONLY: Eliminate decorative physical objects and ornamental metaphors that perform no dramatic work. If an object is named, picked up, or set on a surface, the character must physically use it in the scene. If it does not serve the action, remove it.
- DIALOGUE PING-PONG WITHOUT ECHOES: Exactly one idea per dialogue turn. Never allow a character to state the same thought twice consecutively with synonyms or fuse redundant commands into one line ("Leave! Get out of here!"). Every spoken sentence must advance the interaction forward.

Avoid stock phrases, interchangeable emotional reactions, and decorative
metaphors that could be transferred unchanged to an unrelated scene.

Build the scene from these characters’ particular goals, relationships,
knowledge, resources, and limitations.

Do not replace a familiar phrase with a strained synonym or an elaborate
metaphor merely to sound original. Precise, ordinary language is welcome.

Avoid repeating distinctive images, gestures, sentence patterns, and
scene-ending devices already prominent in the supplied prose.

Do not explain an emotion, implication, or theme immediately after
action or dialogue has already made it clear.

Do not invent twists, eccentric behavior, or extra conflict merely to
avoid a familiar trope. Preserve motivated behavior and required events.


PREPARATION AND FINAL CHECK — DO NOT OUTPUT

Before drafting, identify:
- What the viewpoint character wants now.
- What resists that goal.
- Which actions and choices produce the required outcome.
- What the viewpoint character can know at each point.
- Where the scene must stop.

Before returning the prose:
- Check required beats, continuity, point of view, and the ending state.
- Revise obvious stock phrasing and redundant interpretation.
- Remove filler gestures, repetitive reactions, and unnecessary exposition.
- Preserve facts, character voice, and causal links during revision.
- Do not add events or extend the scene beyond its required outcome.

Return only the finished scene.`;

  const systemPrompt = isRussian
    ? 'Ты — профессиональный русскоязычный писатель (single prose writer). Строго соблюдай непрерывность, канон и драматургию сцены. Пиши живой диалог и глубокую художественную прозу.'
    : `You are the prose writer for this novel (single prose writer).

Write the current scene while preserving the author contract, established
facts, character knowledge, point of view, and causal continuity.

Treat context and plans as production material, not text to reproduce.
Dramatize required events through character choices and their consequences.

Use precise language, character-specific behavior, and selective detail.
Prefer clarity to decorative novelty. Let pacing, dialogue, action, and
interiority follow the needs of the scene.

Return only the finished story prose.`;

  return generateProse(llm, `${context}${correction ? `\n\nCORRECTION REQUIRED:\n${correction}` : ''}`, systemPrompt, { temperature: correction ? SAMPLING.proseCorrection : SAMPLING.prose, maxTokens: 8192 });
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

  const priorChapter = chapter.number > 1 ? run.chapters.find(c => c.number === chapter.number - 1) : undefined;
  const editorialDirectives = priorChapter ? buildEditorialDirectives(priorChapter, run) : '';

  const context = `${specPrompt(run.spec)}${genreCraft(run.spec)}${proseCraft(run, chapter)}
${languageContract(run.spec.language)}
${STRUCTURE_BANS}
${BESTSELLER_REQUIREMENTS}
${COHERENCE_RULES}${editorialDirectives ? `\n${editorialDirectives}\n` : ''}
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
4. Spoken lines must be direct speech with distinct voices, opposing aims, and emotional subtext. Ground dialogue in physical action and clear speaker attribution; never allow more than two consecutive lines of ungrounded speech.
${dialogueRules}
5. Protect proper names, established clues, and causal continuity. Characters know only what canon or their perceptions provide. Clues and evidence must follow physical plausibility: never introduce arbitrary unexplained gadgets into secured locations. Exits and departures must be physically concrete: no vanishing into shadows or mist clichés.
6. Output ONLY finished story prose in the ${run.spec.tense} tense. Do not output chapter headings, scene labels (e.g. "Scene 1"), bracketed notes, bullet lists, or meta-commentary. Start directly with the first sentence of the story.`;

  const maxTokens = Math.max(16384, Math.min(32768, Math.round(targetWords * 4)));

  return generateProse(
    llm,
    `${context}${correction ? `\n\nCORRECTION REQUIRED:\n${correction}` : ''}`,
    'You are the single prose writer for this novel. Write the complete, immersive, unabbreviated chapter prose with all scenes fully dramatized and rich in direct dialogue.',
    { temperature: correction ? SAMPLING.proseCorrection : SAMPLING.prose, maxTokens }
  );
}
