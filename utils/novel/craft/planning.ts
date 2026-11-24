import { buildSceneSlots } from './form';
import { assertWorldCausality } from './storyWorld';
import type { ProjectInput } from '../v2/types';
import type { NovelLLM } from '../v2/llm';
import type { AuthorArchitecture, BookContract, FormPlan, Concept, StoryTruth, CharacterPlan, OppositionPlan, BeatPlan, PromisePlan, PayoffPlan, RevelationPlan, PacingPlan, SceneGraph } from './types';
import { CraftSession, text as t, number as n, bool, object as o, list as a, choice as c, dictionary, referenceSchema, extractJson, type JsonSchema } from './state';

const arc = c('positive', 'negative', 'testing');
const voice = o({ syntax: t, vocabulary: t, directness: t, defense: t, forbiddenTopic: t, examples: a(t, 2) });
const perception = o({ attention: t, blindSpot: t, imagery: t });
export const PLAN_SCHEMAS = {
  contract: o({ mandatory: a(), freedom: a(), genrePromise: t, requiredExperiences: a(t, 1) }),
  form: o({ structure: t, reason: t, method: c('outliner', 'hybrid', 'discovery'), layout: c('classic-three-scenes', 'flexible'), timelines: a(o({ id: t, function: t }), 1), viewpoints: a(o({ id: t, person: c('third-limited', 'first-person', 'third-omniscient', 'second-person', 'external'), function: t }), 1), sceneCounts: a(n, 1) }),
  logline: o({ logline: t }),
  concept: o({ title: t, logline: t, synopsis: t, conflict: t, thematicQuestion: t, ending: o({ action: t, cost: t, externalOutcome: t, internalOutcome: t }) }),
  world: o({ events: a(o({ id: t, timeline: t, time: t, location: t, actor: t, intention: t, action: t, prerequisites: a(), access: t, means: t, outcome: t, traces: a(), dependsOn: a() }), 1), rules: a(o({ id: t, rule: t, limit: t, cost: t })), places: a(o({ id: t, constraints: a(), dramaticFunction: t }), 1), resources: a(o({ id: t, owner: t, available: bool, description: t })), deliberateUnknowns: a(o({ question: t, whyUnresolved: t })) }),
  characters: o({ protagonist: t, characters: a(o({ id: t, name: t, role: t, arc, want: t, beliefOrCode: t, tactics: a(t, 1), initialBenefit: t, escalatingCost: t, crucible: t, finalChoice: t, thematicAnswer: t, initialKnowledge: a(), voice, perception }), 1) }),
  opposition: o({ agent: t, worldview: t, goal: t, resources: a(), limits: a(t, 1), steps: a(o({ id: t, event: t, trigger: t, knowledgeRequired: a(), action: t, consequence: t, possibleFailure: t }), 1) }),
  beats: o({ beats: a(o({ id: t, name: t, scene: t, percent: { type: 'number', minimum: 0, maximum: 100 }, eventIds: a(t, 1), choice: t, strategyBefore: t, strategyAfter: t, price: t }), 2) }),
  promises: o({ promises: a(o({ id: t, scale: c('macro', 'meso', 'micro'), expectation: t, opens: t, progress: a(o({ scene: t, change: t })), payoff: o({ scene: t, action: t, consequence: t }), successor: {} }), 1) }),
  payoffs: o({ setups: a(o({ id: t, kind: t, name: t, neededFor: t, appearances: a(o({ scene: t, role: c('setup', 'reminder', 'payoff'), action: t, interpretation: t }), 2), changedMeaning: t })) }),
  revelations: o({ facts: a(o({ id: t, truth: t, kind: c('objective', 'claim', 'belief'), attributedTo: {}, supersededBy: {}, initialKnownBy: a(), acquisitions: a(o({ character: t, scene: t, action: t, evidenceEvent: t })), readerEvidence: a(o({ scene: t, event: t, interpretation: t })), reveal: t, mode: c('mystery', 'suspense', 'irony', 'direct') }), 1) }),
  pacing: o({ scenes: a(o({ scene: t, emotionBefore: t, emotionAfter: t, intensity: { type: 'number', minimum: 0, maximum: 10 }, mode: c('action', 'reaction', 'transition'), distance: c('distant', 'external', 'close', 'deep'), timeScale: c('realtime', 'dilated', 'summary'), detailFunction: t, syntax: t, ending: c('cliffhanger', 'quiet-resonance'), targetWords: { type: 'number', minimum: 1 } }), 1) }),
  graph: o({ scenes: a(o({ id: t, chapter: n, order: n, timeline: t, pov: t, participants: a(t, 1), events: a(), dependsOn: a(), causedBy: a(o({ scene: t, consequence: t, relation: c('but', 'therefore') })), goal: t, obstacle: t, choice: t, outcome: t, optionsBefore: a(), optionsAfter: a(), resourceChanges: a(o({ resource: t, available: bool, reason: t })), relationshipChanges: a(o({ characters: a(t, 2), change: t })), sceneContract: o({ action: t, dialogueAims: dictionary, external: t, interpersonal: t, internal: t, startValue: t, endValue: t, polarity: c('+ to -', '- to +'), cost: t, location: t, time: t }) }), 1) }),
  preflight: o({ issues: a(o({ status: c('demonstrated', 'uncertain'), reason: t, sources: a(t) })) }),
} satisfies Record<string, JsonSchema>;

function unique(items: { id: string }[], label: string): Set<string> {
  const ids = new Set(items.map(i => i.id));
  if (ids.size !== items.length) throw new Error(`Duplicate ${label} ID`);
  return ids;
}
function refs(ids: string[], available: Set<string>, label: string): void {
  if (ids.some(id => !available.has(id))) throw new Error(`Unknown ${label}: ${ids.filter(id => !available.has(id)).join(', ')}`);
}
function slots(form: FormPlan): Set<string> { return new Set(form.sceneSlots.map(s => s.id)); }
function reconcileSceneSlotIds<T extends { scene: string }>(scenes: T[], form: FormPlan): void {
  const expected = slots(form);
  if (scenes.length === form.sceneSlots.length && scenes.some(s => !expected.has(s.scene))) {
    scenes.forEach((s, idx) => {
      if (!expected.has(s.scene)) {
        s.scene = form.sceneSlots[idx].id;
      }
    });
  }
}
function completeScenes(ids: string[], form: FormPlan): void {
  const expected = slots(form);
  if (ids.length !== expected.size || new Set(ids).size !== ids.length || ids.some(id => !expected.has(id))) throw new Error('Operation must cover every planned scene exactly once.');
}

const ARCHITECTURE_FILES = { contract: 'book-contract.json', form: 'form-plan.json', concept: 'concept.json', world: 'story-truth.json', characters: 'character-engines.json', opposition: 'opposition-plan.json', beats: 'beat-plan.json', promises: 'promises.json', payoffs: 'setups-payoffs.json', revelations: 'revelation-plan.json', pacing: 'pacing-plan.json', graph: 'scene-graph.json' } as const;

/** Accepted author decisions survive a stop without regenerating their plan. */
export function acceptedArchitecture(session: CraftSession): AuthorArchitecture | undefined {
  if (!session.files['accepted-architecture.json']) return undefined;
  const plan = session.read<AuthorArchitecture>('accepted-architecture.json');
  validateArchitecture(plan);
  for (const [key, file] of Object.entries(ARCHITECTURE_FILES)) {
    if (JSON.stringify(session.read(file)) !== JSON.stringify(plan[key as keyof AuthorArchitecture])) throw new Error(`Accepted architecture and ${file} differ; preserve source and reconcile revisions before writing.`);
  }
  return plan;
}

export async function acceptArchitecture(plan: AuthorArchitecture, session: CraftSession): Promise<void> {
  validateArchitecture(plan);
  for (const [key, file] of Object.entries(ARCHITECTURE_FILES)) await session.put(file, plan[key as keyof AuthorArchitecture]);
  await session.put('accepted-architecture.json', plan);
}

export function validateArchitecture(plan: AuthorArchitecture): void {
  const { form, world, characters, beats, promises, payoffs, revelations, pacing, graph, opposition } = plan;
  const events = unique(world.events, 'event'), people = unique(characters.characters, 'character'), scenes = slots(form);
  const timelineIds = unique(form.timelines, 'timeline'), resources = unique(world.resources, 'resource');
  refs([characters.protagonist], people, 'protagonist');
  const viewpoints = unique(form.viewpoints, 'viewpoint');
  refs([...viewpoints], people, 'viewpoint character');
  const occurred = new Set<string>();
  for (const event of world.events) {
    refs([event.timeline], timelineIds, 'event timeline'); refs(event.dependsOn, occurred, 'earlier cause'); occurred.add(event.id);
  }
  for (const step of opposition.steps) refs([step.event], events, 'opposition event');
  for (const beat of beats.beats) { refs([beat.scene], scenes, 'beat scene'); refs(beat.eventIds, events, 'beat event'); }
  const promiseIds = unique(promises.promises, 'promise');
  for (const promise of promises.promises) {
    refs([promise.opens, ...promise.progress.map(p => p.scene), promise.payoff.scene], scenes, 'promise scene');
    if (promise.successor !== null) { if (typeof promise.successor !== 'string') throw new Error('Invalid successor'); refs([promise.successor], promiseIds, 'successor promise'); }
    const order = (id: string) => form.sceneSlots.find(s => s.id === id)!.order;
    if (order(promise.opens) > order(promise.payoff.scene) || promise.progress.some(p => order(p.scene) < order(promise.opens) || order(p.scene) > order(promise.payoff.scene))) throw new Error('Promise progression is out of order.');
  }
  for (const setup of payoffs.setups) {
    refs([setup.neededFor, ...setup.appearances.map(p => p.scene)], scenes, 'setup scene');
    const at = (id: string) => form.sceneSlots.find(s => s.id === id)!.order;
    if (!setup.appearances.some(p => p.role === 'setup') || !setup.appearances.some(p => p.role === 'payoff') || setup.appearances.some((p, i) => i > 0 && at(p.scene) < at(setup.appearances[i - 1].scene))) throw new Error('Setup lifecycle needs chronological preparation and payoff.');
  }
  unique(revelations.facts, 'fact');
  for (const fact of revelations.facts) {
    if (fact.kind && fact.kind !== 'objective') { if (typeof fact.attributedTo !== 'string') throw new Error('Claim/belief needs an attributed owner.'); refs([fact.attributedTo], new Set([...people, 'WORLD']), 'claim/belief owner'); }
    if (fact.supersededBy !== undefined && fact.supersededBy !== null) { if (typeof fact.supersededBy !== 'string' || fact.supersededBy === fact.id || fact.kind === 'objective') throw new Error('Only an attributed claim/belief can be superseded by a different fact.'); refs([fact.supersededBy], new Set(revelations.facts.map(f => f.id)), 'superseding fact'); }
    refs(fact.initialKnownBy, people, 'initial fact owner'); refs([fact.reveal], scenes, 'reveal');
    for (const acquisition of fact.acquisitions) { refs([acquisition.character], people, 'fact owner'); refs([acquisition.scene], scenes, 'acquisition scene'); refs([acquisition.evidenceEvent], events, 'acquisition evidence'); }
    for (const evidence of fact.readerEvidence) { refs([evidence.scene], scenes, 'reader evidence scene'); refs([evidence.event], events, 'reader evidence event'); }
  }
  completeScenes(pacing.scenes.map(s => s.scene), form); completeScenes(graph.scenes.map(s => s.id), form);
  const seen = new Set<string>();
  for (const scene of graph.scenes) {
    const slot = form.sceneSlots.find(s => s.id === scene.id)!;
    if (scene.chapter !== slot.chapter || scene.order !== slot.order || scene.order !== seen.size + 1) throw new Error('Scene order or chapter differs from chosen form.');
    refs([scene.timeline], timelineIds, 'scene timeline'); refs([scene.pov], viewpoints, 'selected viewpoint'); refs([scene.pov, ...scene.participants], people, 'scene character'); refs(scene.events, events, 'scene event');
    refs([...scene.dependsOn, ...scene.causedBy.map(cause => cause.scene)], seen, 'earlier scene consequence');
    if (seen.size && !scene.causedBy.length) throw new Error('A later scene needs an actual causal consequence.');
    for (const change of scene.resourceChanges) refs([change.resource], resources, 'scene resource');
    for (const change of scene.relationshipChanges) refs(change.characters, people, 'relationship character');
    seen.add(scene.id);
  }
}

/** Each operation consumes accepted earlier artifacts, never the whole guide. */
export async function planArchitecture(input: ProjectInput, session: CraftSession, llm: NovelLLM): Promise<AuthorArchitecture> {
  await session.put('engine-input.json', input);
  const extracted = await session.run<Pick<BookContract, 'mandatory' | 'freedom' | 'genrePromise' | 'requiredExperiences'>>('contract', 'contract-decisions.json', 'contract', ['engine-input.json'], PLAN_SCHEMAS.contract,
    'Extract mandatory exact quotations from premise/requirements (no paraphrases), author freedom and concrete promised reading experiences. Do not add new user requirements. Numeric word/chapter constraints are enforced separately in code; do not copy them into mandatory. Voice, tense, style, ending and other explicitly requested settings are binding, never author freedom.', llm,
    value => {
      const source = `${input.premise}\n${input.author_requirements}`;
      if (value.mandatory.some(s => !source.includes(s))) throw new Error('Mandatory requirements must quote the supplied request exactly.');
      if (value.freedom.some(s => input.author_requirements.includes(s.replace(/\.$/, '')))) throw new Error('Explicit voice/style/ending requirements cannot be classified as author freedom.');
    });
  const contract: BookContract = { ...extracted, premise: input.premise, genre: input.genre, requirements: input.author_requirements, chapters: input.chapter_count, words: input.target_total_words, title: input.title,
    layout: input.scene_layout || 'classic-three-scenes', method: input.writing_method || 'outliner', requestedStructure: input.story_structure?.trim() || '',
    ...(input.series_context ? { seriesContext: input.series_context } : {}), ...(session.files['series-bible.json'] ? { seriesPlan: session.read('series-bible.json') } : {}), ...(input.comparable_books ? { comparableSourceNotes: input.comparable_books } : {}) };
  await session.put('book-contract.json', contract);
  type FormChoice = Omit<FormPlan, 'sceneSlots'> & { sceneCounts: number[] };
  const formChoice = await session.run<FormChoice>('form', 'form-choice.json', 'form', ['book-contract.json'], PLAN_SCHEMAS.form,
    'Select a specific story structure and explain why it fits. Honor layout and writing method exactly. If requestedStructure is nonempty use that exact text; if empty choose a real structure, never return a placeholder. Timelines are chronological strands, NOT acts, themes or deadline functions: a linear story normally has one timeline. viewpoint.person means grammatical narrative mode, never a character name. sceneCounts has one integer per chapter: 3 for classic, 1..4 for flexible. Use stable character IDs C1 etc. and timeline IDs T1 etc.', llm,
    value => { if (value.method !== contract.method || value.layout !== contract.layout || (input.story_structure?.trim() && value.structure !== input.story_structure.trim()) || value.sceneCounts.length !== contract.chapters || value.sceneCounts.some(n => !Number.isInteger(n) || (contract.layout === 'classic-three-scenes' ? n !== 3 : n < 1 || n > 4))) throw new Error('Form violates selected method, structure, layout or chapter count.'); });
  const form: FormPlan = { structure: formChoice.structure, reason: formChoice.reason, method: formChoice.method, layout: formChoice.layout, timelines: formChoice.timelines, viewpoints: formChoice.viewpoints,
    sceneSlots: buildSceneSlots(contract, formChoice.sceneCounts) };
  await session.put('form-plan.json', form);
  await session.run('logline', 'logline.json', 'concept', ['book-contract.json', 'form-plan.json'], PLAN_SCHEMAS.logline, 'Write the protagonist + disruption + goal + personal stakes in one or two sentences.', llm);
  const concept = await session.run<Concept>('concept', 'concept.json', 'concept', ['book-contract.json', 'form-plan.json', 'logline.json'], PLAN_SCHEMAS.concept, 'Expand the accepted logline into a complete causal synopsis. The ending must specify the actual mechanism/action and its cost, not promise a later explanation. Keep the accepted logline verbatim.', llm,
    value => { if (value.logline !== session.read<{ logline: string }>('logline.json').logline) throw new Error('Concept must build on the accepted logline.'); });
  const cast = await session.run<{ leadViewpoint: string; people: { name: string; role: string; viewpointId: string }[] }>('cast', 'cast-choice.json', 'characters', ['book-contract.json', 'form-plan.json', 'concept.json'],
    o({ leadViewpoint: c(...form.viewpoints.map(v => v.id)), people: a(o({ name: t, role: t, viewpointId: c('none', ...form.viewpoints.map(v => v.id)) }), 1) }),
    'Identify the complete important human cast from the accepted named premise and synopsis, including protagonist, opposing people, important relatives/witnesses and a victim when relevant. Do not list only viewpoint characters. Assign each declared viewpoint ID to its matching person exactly once; non-viewpoint people use none. leadViewpoint is an ID, never a name. name must be an actual human name or an anonymous role designation matching a participant in the premise/synopsis, never an internal character ID such as C3. You may name an already established unnamed supporting role. Preserve names supplied by the user. Do not invent new people to meet a quota.', llm,
    value => { if (value.people.some(p => /^(?:C|V|P|CHAR)\d+$/i.test(p.name) && !input.premise.includes(p.name))) throw new Error('Cast human names must not be internal IDs.'); const assigned = value.people.filter(p => p.viewpointId !== 'none').map(p => p.viewpointId); if (new Set(value.people.map(p => p.name)).size !== value.people.length || new Set(assigned).size !== assigned.length || form.viewpoints.some(v => !assigned.includes(v.id))) throw new Error('Cast must uniquely bind each viewpoint to a named person.'); });
  const usedIds = new Set(form.viewpoints.map(v => v.id)); let nextId = 1;
  const roster = cast.people.map(person => { let id = person.viewpointId; if (id === 'none') { while (usedIds.has(`C${nextId}`)) nextId++; id = `C${nextId++}`; usedIds.add(id); } return { id, name: person.name, role: person.role }; });
  await session.put('character-roster.json', { protagonist: cast.leadViewpoint, people: roster });
  const world = await session.run<StoryTruth>('truth', 'story-truth.json', 'truth', ['book-contract.json', 'form-plan.json', 'concept.json', 'character-roster.json'], referenceSchema(PLAN_SCHEMAS.world, { timeline: form.timelines.map(t => t.id), actor: [...roster.map(p => p.id), 'WORLD'], owner: [...roster.map(p => p.id), 'WORLD'] }),
    'Build objective events in causal/topological order. actor and resource.owner are IDs from character-roster, never names or newly invented character labels. Use WORLD only for nonpersonal forces/institutions/groups; explain the actual actor in action. Use real names from the roster in descriptive action text, not IDs. Event IDs E1 etc.; dependsOn references earlier events only. For a mystery solve the act itself, access and traces before the investigation. Use declared timeline IDs. Places must actively constrain action. Do not mistake an unexplained central mechanism for deliberate ambiguity.', llm,
    value => { assertWorldCausality(value); const actors = new Set([...roster.map(p => p.id), 'WORLD']); value.events.forEach(e => refs([e.actor], actors, 'event actor')); value.resources.forEach(r => refs([r.owner], actors, 'resource owner')); });
  const characters = await session.run<CharacterPlan>('characters', 'character-engines.json', 'characters', ['book-contract.json', 'form-plan.json', 'concept.json', 'story-truth.json', 'character-roster.json'], referenceSchema(PLAN_SCHEMAS.characters, { protagonist: [cast.leadViewpoint], id: roster.map(p => p.id) }),
    'Develop exactly one character engine for EVERY person in character-roster, preserving their ID/name/role. protagonist MUST be the roster protagonist ID, never the name. Include the opposing cast and relatives, not only the narrator. Give distinct action engines, thematic answers, voices and perceptual profiles. initialKnowledge is only what this person knows before their first on-page scene. No hidden plot motives in voice samples.', llm,
    value => { const ids = unique(value.characters, 'character'); if (value.protagonist !== cast.leadViewpoint || value.characters.length !== roster.length || roster.some(person => !value.characters.some(c => c.id === person.id && c.name === person.name))) throw new Error('Character engines must cover the full accepted roster with exact IDs/names.'); refs([value.protagonist, ...form.viewpoints.map(v => v.id)], ids, 'viewpoint character'); });
  const opposition = await session.run<OppositionPlan>('opposition', 'opposition-plan.json', 'opposition', ['concept.json', 'story-truth.json', 'character-engines.json'], referenceSchema(PLAN_SCHEMAS.opposition, { event: world.events.map(e => e.id) }),
    'Plan concrete opposition moves. The event field MUST be an existing event ID (not an invented event description); action elaborates the opposing move within that event. Show which knowledge permits each move, its trigger and possible failure. This may be an institution or environment, not necessarily a villain.', llm, value => { const ids = new Set(world.events.map(e => e.id)); value.steps.forEach(step => refs([step.event], ids, 'opposition event')); });
  const beats = await session.run<BeatPlan>('beats', 'beat-plan.json', 'beats', ['book-contract.json', 'form-plan.json', 'concept.json', 'story-truth.json', 'character-engines.json', 'opposition-plan.json'], referenceSchema(PLAN_SCHEMAS.beats, { scene: form.sceneSlots.map(s => s.id), eventIds: world.events.map(e => e.id) }),
    'Assign tentpole events to declared scene IDs. Establish actual changes of strategy, costs and final choice. Percent is cumulative planned word position. The chosen form controls which turning points apply. In discovery/hybrid keep the tentpoles concrete but allow discovery of connective scene tactics.', llm, value => { value.beats.forEach(beat => { refs([beat.scene], slots(form), 'beat scene'); refs(beat.eventIds, new Set(world.events.map(e => e.id)), 'beat event'); }); });
  const promises = await session.run<PromisePlan>('promises', 'promises.json', 'promises', ['book-contract.json', 'form-plan.json', 'beat-plan.json', 'concept.json'], referenceSchema(PLAN_SCHEMAS.promises, { opens: form.sceneSlots.map(s => s.id), scene: form.sceneSlots.map(s => s.id) }),
    'Build linked reader promises with concrete scene-specific progress and action/consequence payoff. successor is another promise ID or null. Include the central premise promise and distinguish it from the internal character resolution.', llm, value => { const ids = unique(value.promises, 'promise'); for (const p of value.promises) { refs([p.opens, ...p.progress.map(s => s.scene), p.payoff.scene], slots(form), 'promise scene'); if (p.successor !== null) { if (typeof p.successor !== 'string') throw new Error('Invalid successor promise'); refs([p.successor], ids, 'successor promise'); } } });
  const payoffs = await session.run<PayoffPlan>('payoffs', 'setups-payoffs.json', 'payoffs', ['form-plan.json', 'story-truth.json', 'beat-plan.json', 'promises.json'], referenceSchema(PLAN_SCHEMAS.payoffs, { neededFor: form.sceneSlots.map(s => s.id), scene: form.sceneSlots.map(s => s.id) }),
    'Work back from decisive solutions to organically planted abilities, objects, relationships and evidence. neededFor is the payoff scene ID. Appearances are chronological and have setup and payoff roles; recurring contexts change meaning. Do not invent a power or clue that contradicts objective truth.', llm, value => { unique(value.setups, 'setup'); value.setups.forEach(s => refs([s.neededFor, ...s.appearances.map(a => a.scene)], slots(form), 'setup scene')); });
  const revelations = await session.run<RevelationPlan>('revelations', 'revelation-plan.json', 'revelations', ['form-plan.json', 'story-truth.json', 'character-engines.json', 'beat-plan.json', 'setups-payoffs.json'], referenceSchema(PLAN_SCHEMAS.revelations, { character: characters.characters.map(c => c.id), initialKnownBy: characters.characters.map(c => c.id), scene: form.sceneSlots.map(s => s.id), reveal: form.sceneSlots.map(s => s.id), evidenceEvent: world.events.map(e => e.id), event: world.events.map(e => e.id) }),
    'Schedule objective facts, attributed claims and personal beliefs separately with independent character acquisitions and reader evidence. For kind=claim/belief, truth contains the proposition as claimed/believed, not an author assertion that it is objectively true. attributedTo is its speaker/believer ID (or WORLD for institutional claims), null for objective facts. supersededBy is a later objective fact ID that disproves/confirms an earlier claim/belief, otherwise null. Never turn a fantasy, confession claim or rumor into an enacted objective event. Reference declared people/scenes/events. Treat a fact as a proposition, not an entire paragraph of the outline. Establish provenance and presentation mode. Do not reveal the same fact as new twice.', llm, value => { unique(value.facts, 'fact'); const people = new Set(characters.characters.map(c => c.id)), events = new Set(world.events.map(e => e.id)); for (const fact of value.facts) { refs(fact.initialKnownBy, people, 'fact owner'); refs([fact.reveal], slots(form), 'fact reveal'); for (const acq of fact.acquisitions) { refs([acq.character], people, 'fact owner'); refs([acq.scene], slots(form), 'acquisition scene'); refs([acq.evidenceEvent], events, 'acquisition evidence'); } for (const evidence of fact.readerEvidence) { refs([evidence.scene], slots(form), 'reader evidence scene'); refs([evidence.event], events, 'reader evidence event'); } } });
  const pacingInputs = ['book-contract.json', 'form-plan.json', 'character-engines.json', 'beat-plan.json', 'promises.json', 'revelation-plan.json'];
  const pacingInstruction = `Compose emotional deposits, relief, threat and consequences. Pick appropriate distance and time scale rather than automatic deep POV and constant sensory microdetail. The scene field MUST be an exact scene slot ID from form-plan.json (${form.sceneSlots.map(s => s.id).join(', ')}), never an invented title.`;
  const pacingSchema = referenceSchema(PLAN_SCHEMAS.pacing, { scene: form.sceneSlots.map(s => s.id) });
  let pacing: PacingPlan;
  if (form.sceneSlots.length <= 12) {
    pacing = await session.run<PacingPlan>('pacing', 'pacing-plan.json', 'pacing', pacingInputs, pacingSchema,
      `${pacingInstruction} Cover every scene exactly once. Assign integer scene budgets summing to the requested total words.`, llm,
      value => {
        reconcileSceneSlotIds(value.scenes, form);
        completeScenes(value.scenes.map(s => s.scene), form);
        if (value.scenes.some(s => !Number.isInteger(s.targetWords) || s.targetWords <= 0)) throw new Error('Scene word budgets must be positive integers.');
        const sum = value.scenes.reduce((acc, s) => acc + s.targetWords, 0);
        const diff = contract.words - sum;
        if (Math.abs(diff) > 0 && Math.abs(diff) <= 200) {
          value.scenes[value.scenes.length - 1].targetWords += diff;
        } else if (sum !== contract.words) {
          throw new Error(`Scene word budgets must be integers summing to the requested total of ${contract.words} words.`);
        }
      });
  } else {
    pacing = { scenes: [] };
    for (let start = 0; start < form.sceneSlots.length; start += 12) {
      const batch = form.sceneSlots.slice(start, start + 12);
      const scope = `pacing-batches/${start + 1}-scope.json`;
      await session.put(scope, { slots: batch, preceding: pacing.scenes.slice(-3), totalBookWords: contract.words });
      const batchPacingSchema = referenceSchema(PLAN_SCHEMAS.pacing, { scene: batch.map(s => s.id) });
      const part = await session.run<PacingPlan>(`pacing/${start + 1}`, `pacing-batches/${start + 1}.json`, 'pacing', [...pacingInputs, scope], batchPacingSchema,
        `${pacingInstruction} BATCH OVERRIDE: Only scenes ${batch.map(s => s.id).join(', ')}. Preserve each supplied slot targetWords exactly so batches retain the full-book budget. Use preceding rhythm for contrast.`, llm,
        value => {
          reconcileSceneSlotIds(value.scenes, { sceneSlots: batch } as any);
          if (value.scenes.length !== batch.length || value.scenes.some((s, i) => s.scene !== batch[i].id || s.targetWords !== batch[i].targetWords)) throw new Error('Pacing batch violates its scene or word allocation.');
        });
      pacing.scenes.push(...part.scenes);
    }
    await session.put('pacing-plan.json', pacing);
  }
  const graphSchema = referenceSchema(PLAN_SCHEMAS.graph, { id: form.sceneSlots.map(s => s.id), pov: form.viewpoints.map(v => v.id), participants: characters.characters.map(c => c.id), characters: characters.characters.map(c => c.id), events: world.events.map(e => e.id), timeline: form.timelines.map(t => t.id), ...(world.resources.length ? { resource: world.resources.map(r => r.id) } : {}) });
  const graphInputs = ['book-contract.json', 'form-plan.json', 'story-truth.json', 'character-engines.json', 'opposition-plan.json', 'beat-plan.json', 'promises.json', 'setups-payoffs.json', 'revelation-plan.json', 'pacing-plan.json'];
  const graphInstruction = 'Construct the causal skeleton using the declared ordered scene slots. For each scene name actual enabling consequences, options/resources/relationships before and after, participants and objective event IDs. Every non-opening scene needs causedBy references to earlier scenes. sceneContract contains ONLY current-scene actions and knowledge, never future motives/payoff explanations.';
  let graph: SceneGraph;
  if (form.sceneSlots.length <= 6) {
    graph = await session.run<SceneGraph>('graph', 'scene-graph.json', 'graph', graphInputs, graphSchema, graphInstruction, llm,
      value => validateArchitecture({ contract, form, concept, world, characters, opposition, beats, promises, payoffs, revelations, pacing, graph: value }));
  } else {
    graph = { scenes: [] };
    for (let start = 0; start < form.sceneSlots.length; start += 6) {
      const batch = form.sceneSlots.slice(start, start + 6);
      const scope = `graph-batches/${start + 1}-scope.json`;
      // Summarize accepted prior nodes in code; keep full source nodes in their
      // artifacts. A long novel never requires one oversized projection reply.
      await session.put(scope, { slots: batch, priorConsequences: graph.scenes.map(s => ({ id: s.id, order: s.order, outcome: s.outcome, optionsAfter: s.optionsAfter, resourceChanges: s.resourceChanges })) });
      const batchGraphSchema = referenceSchema(PLAN_SCHEMAS.graph, { id: batch.map(s => s.id), pov: form.viewpoints.map(v => v.id), participants: characters.characters.map(c => c.id), characters: characters.characters.map(c => c.id), events: world.events.map(e => e.id), timeline: form.timelines.map(t => t.id), ...(world.resources.length ? { resource: world.resources.map(r => r.id) } : {}) });
      const part = await session.run<SceneGraph>(`graph/${start + 1}`, `graph-batches/${start + 1}.json`, 'graph', [...graphInputs, scope], batchGraphSchema,
        `${graphInstruction} BATCH OVERRIDE: Output ONLY slots ${batch.map(s => s.id).join(', ')}. Prior consequences are already accepted planned nodes, not enacted prose. Do not end the entire novel at a batch boundary.`, llm,
        value => {
          if (value.scenes.length !== batch.length || value.scenes.some((s, i) => s.id !== batch[i].id || s.chapter !== batch[i].chapter || s.order !== batch[i].order)) throw new Error('Graph batch changed its assigned slots.');
          const seen = new Set(graph.scenes.map(s => s.id));
          for (const scene of value.scenes) { refs([...scene.dependsOn, ...scene.causedBy.map(cause => cause.scene)], seen, 'batch causal predecessor'); seen.add(scene.id); }
        });
      graph.scenes.push(...part.scenes);
    }
    validateArchitecture({ contract, form, concept, world, characters, opposition, beats, promises, payoffs, revelations, pacing, graph });
    await session.put('scene-graph.json', graph);
  }
  return { contract, form, concept, world, characters, opposition, beats, promises, payoffs, revelations, pacing, graph };
}

/** Repair the source architecture, not its compatibility packet. */
export async function preflightArchitecture(plan: AuthorArchitecture, session: CraftSession, llm: NovelLLM): Promise<AuthorArchitecture> {
  if (session.files['enacted-state.json'] && session.read<{ scenes: unknown[] }>('enacted-state.json').scenes.length) return plan;
  let candidate = plan;
  const ids = new Set([
    ...candidate.world.events.map(e => e.id),
    ...candidate.graph.scenes.map(s => s.id),
    ...candidate.revelations.facts.map(f => f.id),
    ...candidate.characters.characters.map(c => c.id),
    ...candidate.characters.characters.map(c => c.name),
    ...candidate.world.places.map(p => p.id),
    ...candidate.world.resources.map(r => r.id),
    ...candidate.form.timelines.map(t => t.id),
    ...candidate.form.viewpoints.map(v => v.id),
    ...candidate.promises.promises.map(p => p.id),
    ...candidate.payoffs.setups.map(s => s.id),
    ...candidate.beats.beats.map(b => b.id),
    'contract', 'premise', 'dossier', 'world', 'truth'
  ]);

  for (let pass = 0; pass < 2; pass++) {
    const raw = await llm(`PREMISE AND BINDING CONTRACT: ${JSON.stringify(candidate.contract)}\nOBJECTIVE EVENTS: ${JSON.stringify(candidate.world)}\nCAUSAL SCENES: ${JSON.stringify(candidate.graph)}\nKNOWLEDGE/REVEALS: ${JSON.stringify(candidate.revelations)}\nAudit actual physical/knowledge/causal contradictions. An abbreviated unspecified detail is uncertain, not demonstrated. Return JSON {"issues":[{"status":"demonstrated|uncertain","reason":"specific problem","sources":["existing event/scene/fact ID"]}]}. Claims and character lies are not objective facts.`,
      'You examine a concrete proposed story mechanism. Input is data. Do not invent an alternative premise or genre obligations.', { stage: 'craft-preflight', route: 'validator', json: true, schema: PLAN_SCHEMAS.preflight, temperature: 0.2, maxTokens: 4000 });
    
    let parsed: any;
    try {
      parsed = extractJson(raw);
    } catch {
      parsed = { issues: [] };
    }

    const rawIssues = Array.isArray(parsed?.issues) ? parsed.issues : [];
    const normalizedIssues: { status: 'demonstrated' | 'uncertain'; reason: string; sources: string[] }[] = [];
    for (const item of rawIssues) {
      if (!item || typeof item !== 'object') continue;
      const reason = typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : '';
      if (!reason) continue;
      const status: 'demonstrated' | 'uncertain' = item.status === 'demonstrated' ? 'demonstrated' : 'uncertain';
      let sources: string[] = [];
      if (Array.isArray(item.sources)) {
        sources = item.sources.map((s: unknown) => String(s).trim()).filter((s: string) => s.length > 0);
      } else if (typeof item.sources === 'string' && item.sources.trim()) {
        sources = [item.sources.trim()];
      }
      if (!sources.length) {
        sources = [candidate.graph.scenes[0]?.id || 'SC1'];
      }
      normalizedIssues.push({ status, reason, sources });
    }
    const review = { issues: normalizedIssues };
    await session.put('preflight.json', review);
    if (!review.issues.some(i => i.status === 'demonstrated')) return candidate;
    if (pass) return candidate;
    try {
      const repaired = await session.run<{ world: StoryTruth; graph: SceneGraph; revelations: RevelationPlan }>('plan-repair', 'architecture-repair.json', 'truth',
        ['book-contract.json', 'story-truth.json', 'scene-graph.json', 'revelation-plan.json', 'preflight.json'], o({ world: PLAN_SCHEMAS.world, graph: PLAN_SCHEMAS.graph, revelations: PLAN_SCHEMAS.revelations }),
        'Repair supported contradictions in the actual event mechanism, causal scenes and acquisition schedule together. Preserve all existing IDs, scene/chapter slots and binding premise/ending. Return corrected source artifacts. Reject unsupported accusations through concrete explanations in access/means/actions, never by replacing the story.', llm,
        value => {
          const same = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));
          if (!same(candidate.world.events.map(e => e.id), value.world.events.map(e => e.id)) || !same(candidate.graph.scenes.map(s => s.id), value.graph.scenes.map(s => s.id)) || !same(candidate.revelations.facts.map(f => f.id), value.revelations.facts.map(f => f.id))) throw new Error('Plan repair cannot replace stable IDs.');
          validateArchitecture({ ...candidate, ...value });
        });
      candidate = { ...candidate, ...repaired };
      await session.put('story-truth.json', candidate.world);
      await session.put('scene-graph.json', candidate.graph);
      await session.put('revelation-plan.json', candidate.revelations);
    } catch {
      return candidate;
    }
  }
  return candidate;
}
