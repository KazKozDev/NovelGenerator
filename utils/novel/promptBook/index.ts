import {planningBrief,prepareWritingStyle} from './style';
import type { StorySettings } from '../../../types';
import type { ProjectInput } from '../v2/types';
import type { ProjectStore } from '../v2/store';
import type { NovelLLM } from '../v2/llm';
import { parseObject } from '../v2/llm';

export interface BookBlueprint {
  title: string;
  overview: string;
  centralConflict: string;
  ending: string;
  additions: string[];
  characters: { id: string; name: string; motivation: string; voice: string; initialKnowledge?: string[] }[];
  facts: { id: string; description: string; introducedIn: number }[];
  chapters: {
    chapter: number; title: string; goal: string; conflict: string;
    startingSituation: string; outcome: string; handoff: string;
    dependsOn: number[]; reveals: string[];
  }[];
}
export interface ChapterBrief {
  chapter: number;
  dramaticTask: string;
  initialState: string;
  interests: string;
  causalRoute: string[];
  ending: string;
  freedom: string;
}
export interface ChapterPrompt {
  chapter: number; title: string; system: string; prompt: string;
  sourceRevision: number; edited?: boolean;
}
export interface PromptBook {
  version: 1;
  brief: { input: ProjectInput; settings: StorySettings };
  phase: 'blueprint' | 'prompts' | 'ready';
  revision: number;
  blueprint?: BookBlueprint;
  prompts: ChapterPrompt[];
  workspaceStage?: import('./editing').PromptWorkspaceStage;
  storyEdits?: import('./editing').StoryEditRevision[];
  style?: import('./style').WritingStyleProfile;
  story?: import('./actions').PromptStory;
  storyHistory?: import('./actions').PromptStory[];
  fixes?: import('./actions').PromptFix[];
  reviews?: import('./review').PromptReview[];
  updatedAt: string;
}
const BATCH = 4;
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
const requireValid = (condition: unknown, reason: string) => { if (!condition) throw new Error(`Outline not saved: ${reason}`); };

export function validateBlueprint(raw: unknown, count: number): asserts raw is BookBlueprint {
  requireValid(object(raw), 'expected an outline object.');
  const p = raw as BookBlueprint;
  for (const key of ['title', 'overview', 'centralConflict', 'ending'] as const) requireValid(text(p[key]), `missing field ${key}.`);
  requireValid(strings(p.additions), 'model additions must be a separate list.');
  requireValid(Array.isArray(p.characters) && p.characters.length > 0, 'no characters provided.');
  const people = new Set<string>();
  for (const c of p.characters) {
    requireValid(object(c) && ['id','name','motivation','voice'].every(k => text((c as any)[k])), 'incomplete character profile.');
    requireValid(c.initialKnowledge === undefined || strings(c.initialKnowledge), 'initial character knowledge must be a list.');
    requireValid(!people.has(c.id), 'duplicate character ID.'); people.add(c.id);
  }
  requireValid(Array.isArray(p.facts), 'missing revelation list.');
  const facts = new Map<string, number>();
  for (const f of p.facts) {
    requireValid(object(f) && text(f.id) && text(f.description) && Number.isInteger(f.introducedIn) && f.introducedIn >= 1 && f.introducedIn <= count, 'invalid revelation chapter.');
    requireValid(!facts.has(f.id), 'duplicate fact ID.'); facts.set(f.id, f.introducedIn);
  }
  requireValid(Array.isArray(p.chapters) && p.chapters.length === count, `expected ${count} chapters.`);
  p.chapters.forEach((c, i) => {
    requireValid(object(c) && c.chapter === i + 1, 'chapters must be sequential with no gaps or duplicates.');
    for (const k of ['title','goal','conflict','startingSituation','outcome','handoff']) requireValid(text((c as any)[k]), `incomplete chapter ${i + 1}: ${k}.`);
    requireValid(Array.isArray(c.dependsOn) && new Set(c.dependsOn).size === c.dependsOn.length && c.dependsOn.every(n => Number.isInteger(n) && n >= 1 && n < c.chapter), `chapter ${i + 1} references future events.`);
    requireValid(strings(c.reveals) && new Set(c.reveals).size === c.reveals.length && c.reveals.every(id => facts.get(id) === c.chapter), `invalid revelations in chapter ${i + 1}.`);
  });
  for (const [id, chapter] of facts) requireValid(p.chapters[chapter - 1].reveals.includes(id), `fact ${id} is not assigned to its chapter.`);
}
export function validateBriefs(raw: unknown, chapters: number[]): asserts raw is ChapterBrief[] {
  requireValid(Array.isArray(raw) && raw.length === chapters.length, 'the model returned an incomplete batch.');
  (raw as ChapterBrief[]).forEach((b, i) => {
    requireValid(object(b) && b.chapter === chapters[i], 'incorrect prompt order.');
    for (const k of ['dramaticTask','initialState','interests','ending','freedom']) requireValid(text((b as any)[k]), `incomplete brief for chapter ${b.chapter}.`);
    requireValid(strings(b.causalRoute) && b.causalRoute.length >= 2, `missing causal route for chapter ${b.chapter}.`);
  });
}
const PLANNER = 'Ты планировщик книги. Создавай согласованный авторский замысел, а не прозу и не редакторский отчёт. Явные требования автора обязательны. Дополнения обозначай отдельно. Пиши содержимое на языке исходного замысла. Верни только JSON указанной структуры.';
export function blueprintRequest(state: PromptBook): string {
  return `Спроектируй всю книгу по полному авторскому заданию ниже. Не теряй поля формы. Название автора сохраняй, если оно задано. Продумай реальные мотивы совместных действий, сопротивление, изменение тактики, подготовку и последствия. Каждая глава изменяет ситуацию и делает следующую необходимой. Не повторяй один выбор в нескольких главах. Отделяй раскрытие читателю от получения знания персонажем. Герой помнит свои сознательные действия, подписи и договорённости до начала книги; не создавай искусственную амнезию ради тайны. Укажи initialKnowledge каждого героя. Новые сведения персонажи получают через действия; будущие открытия не считай их исходным знанием. Не навязывай три сцены, травмы или списки реквизита, если они не нужны истории.\nАВТОРСКОЕ ЗАДАНИЕ (неизменяемые исходные данные):\n${JSON.stringify(planningBrief(state))}\nВерни {"title":"название","overview":"связный замысел","centralConflict":"конфликт","ending":"разрешение","additions":["только придуманные тобой существенные дополнения"],"characters":[{"id":"P1","name":"имя","motivation":"цель и цена","voice":"речевые особенности","initialKnowledge":["что персонаж уже знает до начала книги"]}],"facts":[{"id":"F1","description":"важное раскрываемое сведение","introducedIn":1}],"chapters":[{"chapter":1,"title":"название","goal":"задача героя","conflict":"сопротивление","startingSituation":"начальное положение","outcome":"что необратимо изменилось","handoff":"почему следующая глава нужна; для последней — завершение","dependsOn":[],"reveals":["F1"]}]}\nРовно ${state.brief.input.chapter_count} глав по порядку. dependsOn — только номера предшествующих глав. Каждый факт назначь ровно той главе, в которой он раскрывается. Пустые списки допустимы, незаполненные содержательные поля — нет.`;
}
export function chapterRequest(state: PromptBook, chapters: number[]): string {
  return `Составь задания писателю для глав ${chapters.join(', ')} по единому согласованному плану ВСЕЙ книги. Не пиши прозу. Сохрани события, зависимости и моменты раскрытия плана. Ситуация и знания в начале главы следуют из результатов предыдущих глав; это пока запланированное состояние, не доказанный факт из будущей прозы. У задания есть одно собственное драматическое изменение; не переигрывай развязки предшествующих глав. Задай причинный маршрут, столкновение интересов, неудачную тактику и выбор, оставляя реплики, ритм и конкретное воплощение писателю. Реквизит и его ограничения фиксируй только когда они влияют на действие. Будущие открытия нельзя выдавать за уже известное героям. Знание героем собственных прошлых действий из initialKnowledge не является новым открытием; не превращай его в амнезию. Явно различай сведения читателю и открытия героев.\nИСХОДНОЕ ЗАДАНИЕ:\n${JSON.stringify(planningBrief(state))}\nОБЩИЙ ПЛАН, редакция ${state.revision}:\n${JSON.stringify(state.blueprint)}\nУЖЕ СОСТАВЛЕННЫЕ ЗАДАНИЯ ЭТОЙ РЕДАКЦИИ:\n${JSON.stringify(state.prompts.filter(p => p.sourceRevision === state.revision).slice(-2).map(p => ({chapter:p.chapter,prompt:p.prompt})))}\nВерни {"chapters":[{"chapter":${chapters[0]},"dramaticTask":"задача и изменение героя","initialState":"место, время, участники, важные ограничения и доступные знания","interests":"кто чего хочет и почему зависит от других","causalRoute":["событие с причиной и последствием","следующее событие"],"ending":"конкретное последнее действие; чем продолжится следующая глава без лишнего эпилога","freedom":"что писатель придумывает самостоятельно"}]}. Верни только главы ${chapters.join(', ')} в указанном порядке. Каждое задание должно быть полноценным, без 'см. предыдущую главу' вместо содержания.`;
}
export function renderChapterPrompt(state: PromptBook, brief: ChapterBrief): ChapterPrompt {
  const input = state.brief.input, plan = state.blueprint!;
  const card = plan.chapters[brief.chapter - 1];
  const system = `Ты пишешь цельную главу книги. Следуй авторскому заданию: ${input.author_requirements}. Жанр: ${input.genre}. Язык — язык авторского замысла. План и требования являются знанием автора; персонажи получают новые сведения через показанные события и помнят собственные прошлые действия. Выдай только художественный текст, без анализа и отчёта.`;
  const prompt = `Напиши главу ${card.chapter} «${card.title}» книги «${plan.title}» одним проходом, приблизительно на ${Math.round(input.target_total_words / input.chapter_count)} слов.\n\nИСХОДНЫЕ ТРЕБОВАНИЯ АВТОРА\n${JSON.stringify(planningBrief(state))}\n\nДРАМАТИЧЕСКАЯ ЗАДАЧА\n${brief.dramaticTask}\n\nНАЧАЛЬНАЯ СИТУАЦИЯ\n${brief.initialState}\n\nИНТЕРЕСЫ И СОПРОТИВЛЕНИЕ\n${brief.interests}\n\nПРИЧИННЫЙ МАРШРУТ\n${brief.causalRoute.map(s => `— ${s}`).join('\n')}\n\nРАСКРЫТИЯ ДЛЯ ЧИТАТЕЛЯ В ЭТОЙ ГЛАВЕ (новое для героя узнаётся через действие; собственные прошлые действия он уже помнит)\n${plan.facts.filter(f => f.introducedIn === card.chapter).map(f => f.description).join('\n') || 'Отдельных обязательных раскрытий не назначено.'}\n\nФИНАЛ\n${brief.ending}\n\nПИСАТЕЛЬСКАЯ СВОБОДА\n${brief.freedom}\nРазвивай сопротивление и решения, а не повторное объяснение уже понятого.\n\nПРЕЕМСТВЕННОСТЬ\n${card.chapter === 1 ? 'Начало книги. Предыдущей прозы нет.' : 'Перед написанием сюда должен быть добавлен фактический текст или актуальное состояние после предыдущей главы. Если оно отличается от запланированного начала, не переписывай прошлое и не выдавай несостоявшееся событие за факт.'}\nЗапланированный результат главы: ${card.outcome}\nСвязь с продолжением: ${card.handoff}`;
  return { chapter:card.chapter, title:card.title, system, prompt, sourceRevision:state.revision };
}
export function initializePromptBook(input: ProjectInput, settings: StorySettings, store: ProjectStore): PromptBook {
  const state: PromptBook = {version:1, brief:{input:structuredClone(input),settings:structuredClone(settings)}, phase:'blueprint',revision:1,prompts:[],updatedAt:new Date().toISOString()};
  store.saveInput(input);
  store.saveAuthor({version:1,input_key:JSON.stringify(state.brief),clock:'',plan:'',chapters:[],waiting:'',noticed:[],completed:false,promptPlanning:state});
  return state;
}
export function savePromptBook(store: ProjectStore, state: PromptBook): void {
  const author = store.loadAuthor();
  if (!author?.promptPlanning) throw new Error('Prompt project not found.');
  state.updatedAt = new Date().toISOString();
  store.saveAuthor({...author,title:state.blueprint?.title,plan:state.blueprint?.overview || '',completed:state.phase==='ready',promptPlanning:state});
}
export function editBlueprint(store: ProjectStore, blueprint: BookBlueprint): PromptBook {
  const state = store.loadAuthor()?.promptPlanning;
  if (!state) throw new Error('Prompt project not found.');
  validateBlueprint(blueprint,state.brief.input.chapter_count);
  if (state.brief.input.title?.trim() && blueprint.title !== state.brief.input.title.trim()) throw new Error('The title is specified in project settings. Change it there.');
  state.blueprint = structuredClone(blueprint); state.revision++; state.phase='prompts';
  savePromptBook(store,state); return state;
}
export function editChapterPrompt(store: ProjectStore, chapter: number, system: string, prompt: string): PromptBook {
  const state = store.loadAuthor()?.promptPlanning;
  const at = state?.prompts.findIndex(p => p.chapter === chapter) ?? -1;
  if (!state || at < 0 || !text(system) || !text(prompt)) throw new Error('Empty or unknown prompt.');
  if (state.prompts[at].sourceRevision !== state.revision) throw new Error('Regenerate prompts from the current outline first.');
  state.prompts[at] = {...state.prompts[at],system,prompt,edited:true}; savePromptBook(store,state); return state;
}
export async function generatePromptBook(store: ProjectStore, llm: NovelLLM, active: () => void = () => {}): Promise<PromptBook> {
  let state = await prepareWritingStyle(store,llm,active);
  if (!state) throw new Error('Prompt project not found.');
  const persist = () => {active(); savePromptBook(store,state!);};
  active();
  if (!state.blueprint) {
    store.log('prompt-blueprint','Планирование всей книги');
    const raw = await llm(blueprintRequest(state),PLANNER,{stage:'prompt-blueprint',route:'writer',temperature:0.5,json:true,maxTokens:Math.min(32000,4000+state.brief.input.chapter_count*500),deliberate:true});
    active(); const plan = parseObject(raw);
    validateBlueprint(plan,state.brief.input.chapter_count);
    if (state.brief.input.title?.trim()) plan.title = state.brief.input.title.trim();
    state.blueprint = plan; state.phase='prompts'; persist(); store.checkpoint('Общий план книги сохранён');
  } else validateBlueprint(state.blueprint,state.brief.input.chapter_count);
  const pending = state.blueprint.chapters.filter(c => !state!.prompts.some(p => p.chapter===c.chapter && p.sourceRevision===state!.revision));
  for (let i=0;i<pending.length;i+=BATCH) {
    const chapters = pending.slice(i,i+BATCH).map(c => c.chapter);
    store.log('prompt-chapters',`Промпты глав ${chapters.join(', ')}`);
    const raw = await llm(chapterRequest(state,chapters),PLANNER,{stage:'prompt-chapters',route:'writer',temperature:0.5,json:true,maxTokens:20000,deliberate:true});
    active(); const briefs = parseObject(raw).chapters; validateBriefs(briefs,chapters);
    const prompts = briefs.map(b => renderChapterPrompt(state!,b));
    state.prompts = [...state.prompts.filter(p => !chapters.includes(p.chapter)),...prompts].sort((a,b)=>a.chapter-b.chapter);
    persist(); store.checkpoint(`Промпты глав ${chapters.join(', ')} сохранены`);
  }
  state.phase='ready'; persist(); store.log('prompt-ready',`${state.prompts.length} промптов готовы. Проза не генерировалась.`);
  return state;
}
