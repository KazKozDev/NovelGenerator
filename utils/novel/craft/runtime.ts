import type { NovelLLM } from '../v2/llm';
import type { Packet, Card } from './craftOrchestrator';
import type { AuthorArchitecture, SceneExecution, EnactedState, EnactedScene, ReaderDecision, SceneNode } from './types';
import { CraftSession, revision, object as o, text as t, list as a, choice as c, bool, dictionary, referenceSchema, hasProseQuote } from './state';
import { currentCharacterEngine, presentProfiles } from './characters';
import { oppositionForScene } from './opposition';
import { promiseContributions } from './promises';
import { setupsForScene } from './payoffs';
import { sceneKnowledge, readerPresentation } from './revelations';
import { pacingForScene } from './pacing';
import { causalFrontier } from './sceneGraph';
import { renderExecution } from './prose';
import { validateReaderDecision, pendingPresentation } from './readerAdaptation';
import { PLAN_SCHEMAS, validateArchitecture, acceptArchitecture } from './planning';

/** Compatibility packet is a view of the authored graph, not a second outline. */
export function projectArchitecture(plan: AuthorArchitecture): Packet {
  const order = (id: string) => plan.graph.scenes.find(s => s.id === id)!.order;
  const protagonist = plan.characters.characters.find(c => c.id === plan.characters.protagonist)!;
  return {
    title: plan.concept.title, names: Object.fromEntries(plan.characters.characters.map(c => [c.id, c.name])), initialProtagonistKnowledge: protagonist.initialKnowledge,
    facts: plan.revelations.facts.map(f => ({ id: f.id, text: f.truth, kind: f.kind || 'objective', learnsAt: f.initialKnownBy.includes(protagonist.id) ? 0 : Math.min(...f.acquisitions.filter(a => a.character === protagonist.id).map(a => order(a.scene)), plan.graph.scenes.length), source: f.acquisitions.find(a => a.character === protagonist.id)?.evidenceEvent || 'author reality' })),
    scenes: plan.graph.scenes.map(s => {
      const pace = plan.pacing.scenes.find(p => p.scene === s.id)!;
      const current = s.sceneContract;
      return {
        id: s.id, chapter: s.chapter, order: s.order, pov: s.pov, goal: s.goal, targetWords: pace.targetWords,
        sceneType: pace.mode === 'reaction' ? 'sequel' : 'scene',
        time: current.time, location: current.location, causalLink: s.causedBy[0]?.relation || 'therefore',
        valueCharge: { start: current.startValue, end: current.endValue, shift: current.polarity },
        conflict: { external: current.external, interpersonal: current.interpersonal, internal: current.internal },
        stakes: { atRisk: s.optionsBefore.join('; ') || s.goal, costOfChoice: current.cost },
        purpose: s.goal, action: current.action, choice: s.choice, cost: current.cost, change: s.outcome, dialogueAims: current.dialogueAims,
        rhythm: pace.mode, readerBefore: '', readerAfter: '', endingCadence: pace.ending, dependsOn: s.dependsOn,
        // The per-character revelation schedule below is authoritative. Global
        // protagonist fields remain only for older readers of packet.json.
        povKnows: [], newFacts: [], props: [],
        openLoopsIntroduced: plan.promises.promises.filter(p => p.opens === s.id).map(p => p.id),
        openLoopsResolved: plan.promises.promises.filter(p => p.payoff.scene === s.id).map(p => p.id),
        propAnchors: plan.payoffs.setups.flatMap(p => p.appearances.filter(v => v.scene === s.id).map(v => ({ name: p.name, role: v.role === 'reminder' ? 'complication' as const : v.role }))),
      };
    }),
  };
}

export function emptyEnacted(): EnactedState { return { version: 1, scenes: [] }; }
export function prefixState(plan: AuthorArchitecture, state: EnactedState, scene: string): EnactedState {
  const order = plan.graph.scenes.find(s => s.id === scene)!.order;
  return { version: 1, scenes: state.scenes.filter(s => plan.graph.scenes.find(n => n.id === s.id)!.order < order) };
}

/** Only per-character knowledge and the current scheduled acquisition cross the boundary. */
export function executionBase(plan: AuthorArchitecture, node: SceneNode, enacted: EnactedState): SceneExecution {
  const person = plan.characters.characters.find(c => c.id === node.pov)!;
  const prefix = prefixState(plan, enacted, node.id);
  const knowledge = sceneKnowledge(plan, node, prefix);
  const pace = pacingForScene(plan, node.id);
  return {
    sceneId: node.id, viewpoint: node.pov, narrativePerson: plan.form.viewpoints.find(v => v.id === node.pov)?.person || 'third-limited', initialKnowledge: person.initialKnowledge,
    characterEngine: currentCharacterEngine(plan, node),
    ...knowledge,
    current: { goal: node.goal, action: node.sceneContract.action, obstacle: node.obstacle, choice: node.choice, outcome: node.outcome, cost: node.sceneContract.cost, location: node.sceneContract.location, time: node.sceneContract.time, dialogueAims: node.sceneContract.dialogueAims,
      conflict: { external: node.sceneContract.external, interpersonal: node.sceneContract.interpersonal, internal: node.sceneContract.internal }, valueTurn: { start: node.sceneContract.startValue, end: node.sceneContract.endValue } },
    profiles: presentProfiles(plan, node),
    pacing: pace, directives: [],
  };
}

const decisionSchema = o({ decision: c('continue', 'progress', 'clarify', 'conceal', 'reframe'), reason: t, adjustments: a(o({ scene: t, action: t, intendedEffect: t })) });
const taskSchema = o({ goal: t, action: t, obstacle: t, choice: t, outcome: t, cost: t, location: t, time: t, dialogueAims: dictionary, directives: a() });
export async function prepareExecution(plan: AuthorArchitecture, node: SceneNode, state: EnactedState, reader: string, session: CraftSession, llm: NovelLLM): Promise<SceneExecution> {
  const prefix = prefixState(plan, state, node.id);
  const stateFile = `scenes/${node.id}/before-state.json`, readerFile = `scenes/${node.id}/reader.json`, baseFile = `scenes/${node.id}/base.json`;
  await session.put(stateFile, { version: prefix.version, scenes: prefix.scenes.slice(-3), earlierConsequences: prefix.scenes.slice(0, -3).map(s => ({ id: s.id, summary: s.summary })), frontier: causalFrontier(plan, node, prefix) });
  await session.put(readerFile, { reaction: reader });
  const base = executionBase(plan, node, state);
  await session.put(baseFile, base);
  await session.put(`scenes/${node.id}/author-direction.json`, { frontier: causalFrontier(plan, node, prefix), worldConstraints: { rules: plan.world.rules, places: plan.world.places }, opposition: oppositionForScene(plan, node, prefix), promises: promiseContributions(plan, node.id), preparations: setupsForScene(plan, node.id), presentation: readerPresentation(plan, node.id) });
  const pending = session.files['presentation-adjustments.json'] ? session.read<{ source: string; scene: string; action: string; intendedEffect: string }[]>('presentation-adjustments.json') : [];
  const localAdjustments = pendingPresentation(plan, node.id, pending);
  await session.put(`scenes/${node.id}/presentation-input.json`, localAdjustments);
  const decision = await session.run<ReaderDecision>(`adapt/${node.id}`, `scenes/${node.id}/reader-decision.json`, 'adapt',
    [stateFile, readerFile, baseFile, 'book-contract.json', 'promises.json', 'revelation-plan.json'], decisionSchema,
    `Author the next presentation decision before ${node.id}. Do not alter enacted facts or the binding book outcome. Adjustments may target this or later declared scenes only. If the reader guessed correctly, decide whether suspense benefits; do not automatically conceal.`, llm,
    value => validateReaderDecision(plan, node.order, value));
  const task = await session.run<{ goal: string; action: string; obstacle: string; choice: string; outcome: string; cost: string; location: string; time: string; dialogueAims: Record<string, string>; directives: string[] }>(
    `execution/${node.id}`, `scenes/${node.id}/execution-task.json`, 'execution', [baseFile, stateFile, `scenes/${node.id}/author-direction.json`, `scenes/${node.id}/reader-decision.json`, `scenes/${node.id}/presentation-input.json`, 'book-contract.json'], taskSchema,
    `Build the concrete present-scene execution task. Method: ${plan.form.method}. Honor required current action/outcome and acquisitions. Use actual lost resources, relationships and prior consequences. Develop the opposing move from the supplied agent knowledge and limits; a planned knowledge requirement is not proof the agent knows it. Apply reader adjustments for ${node.id}. Translate applicable user style requirements into safe directives without copying future plot secrets. In hybrid/discovery choose fresh connective tactics within the known tentpoles. Never put later reveals or author explanations into the writer output.`, llm);
  // IDs, permitted factual text and future knowledge never come from this free-text operation.
  const execution = { ...base, current: { ...base.current, goal: task.goal, action: task.action, obstacle: task.obstacle, choice: task.choice, outcome: task.outcome, cost: task.cost, location: task.location, time: task.time, dialogueAims: task.dialogueAims }, directives: task.directives };
  // Future-scene adjustments survive until their target is prepared; they do not mutate canon.
  const previous = session.files['presentation-adjustments.json'] ? session.read<{ source: string; scene: string; action: string; intendedEffect: string }[]>('presentation-adjustments.json') : [];
  await session.put('presentation-adjustments.json', [...previous.filter(a => a.source !== node.id), ...decision.adjustments.map(a => ({ ...a, source: node.id }))]);
  await session.put(`scenes/${node.id}/execution.json`, execution);
  return execution;
}

export function executionPrompt(execution: SceneExecution, recent: string[]): string {
  return renderExecution(execution, recent);
}

const enactedSchema = o({ events: a(o({ event: t, quote: t, outcome: t }), 1), acquisitions: a(o({ character: t, fact: t, quote: t })), resources: a(o({ resource: t, available: bool, quote: t })), relationships: a(o({ characters: a(t, 2), change: t, quote: t })), options: a(), summary: t, deferred: a(o({ kind: t, task: t, quote: t })), deviations: a(o({ event: t, difference: t, downstreamImpact: t })) });
export async function commitEnacted(plan: AuthorArchitecture, node: SceneNode, prose: string, state: EnactedState, session: CraftSession, llm: NovelLLM): Promise<EnactedState> {
  const textFile = `scenes/${node.id}/prose.json`;
  await session.put(textFile, { text: prose });
  const scheduled = plan.revelations.facts.flatMap(f => f.acquisitions.filter(a => a.scene === node.id).map(a => ({ ...a, fact: f.id })));
  const scheduledDesc = scheduled.length ? scheduled.map(s => `${s.character} learns ${s.fact}`).join(', ') : 'none scheduled (return acquisitions: [])';
  const sourceFile = `scenes/${node.id}/event-contract.json`;
  await session.put(sourceFile, { events: plan.world.events.filter(e => node.events.includes(e.id)), scheduledAcquisitions: scheduled, resources: plan.world.resources.map(r => r.id), characters: plan.characters.characters.map(c => c.id) });
  const result = await session.run<Omit<EnactedScene, 'id' | 'textRevision'>>(`enact/${node.id}`, `scenes/${node.id}/enacted.json`, 'enact', [textFile, sourceFile], referenceSchema(enactedSchema, { event: node.events, character: plan.characters.characters.map(c => c.id), characters: plan.characters.characters.map(c => c.id), ...(plan.world.resources.length ? { resource: plan.world.resources.map(r => r.id) } : {}) }),
    `Extract actual visible events and acquisitions from this exact prose. Use only IDs from the current event contract. Never fill an event because it was planned. Scheduled acquisitions for this scene: ${scheduledDesc}. Do not record acquisitions for any other facts. For each state change cite a verbatim quote copied directly from the prose (5 to 15 consecutive words). Defer style defects for later editing. options describe concrete remaining actions, not hypothetical facts.`, llm,
    value => {
      const isPlaceholder = (q: unknown) => typeof q !== 'string' || !q.trim() || /^(?:none|n\/?a|not\s+applicable|implied|unspecified|off-page|-)$/i.test(q.trim());
      value.acquisitions = value.acquisitions.filter(acq => scheduled.some(s => s.fact === acq.fact && s.character === acq.character));
      for (const e of value.events) {
        if (isPlaceholder(e.quote) || !hasProseQuote(prose, e.quote)) throw new Error(`Enacted change requires exact prose evidence for event ${e.event}: ${JSON.stringify(e.quote)}`);
      }
      for (const acq of value.acquisitions) {
        if (isPlaceholder(acq.quote) || !hasProseQuote(prose, acq.quote)) throw new Error(`Enacted change requires exact prose evidence for acquisition ${acq.fact}: ${JSON.stringify(acq.quote)}`);
      }
      if (value.events.some(e => !node.events.includes(e.event))) throw new Error('Unassigned event cannot become canon.');
      if (value.resources.some(r => !plan.world.resources.some(p => p.id === r.resource))) throw new Error('Unknown resource change.');
      if (value.deviations.some(d => !node.events.includes(d.event))) throw new Error('Deviation must refer to a current planned event.');
      if (value.relationships.some(r => r.characters.some(id => !plan.characters.characters.some(c => c.id === id)))) throw new Error('Unknown relationship owner.');
    });
  const scene: EnactedScene = { ...result, id: node.id, textRevision: await revision(prose) };
  const next: EnactedState = { version: 1, scenes: [...state.scenes.filter(s => s.id !== node.id), scene].sort((a, b) => plan.graph.scenes.find(s => s.id === a.id)!.order - plan.graph.scenes.find(s => s.id === b.id)!.order) };
  await session.put('enacted-state.json', next);
  return next;
}

/** Discover connective scenes without changing enacted history or promised tentpoles. */
export async function continueArchitecture(plan: AuthorArchitecture, committed: EnactedScene, session: CraftSession, llm: NovelLLM): Promise<AuthorArchitecture> {
  const current = plan.graph.scenes.find(s => s.id === committed.id)!;
  if (current.order === plan.graph.scenes.length || (plan.form.method === 'outliner' && !committed.deviations.length)) return plan;
  const protectedScenes = new Set(plan.beats.beats.map(b => b.scene));
  const window = plan.graph.scenes.filter(s => s.order > current.order && !protectedScenes.has(s.id)).slice(0, 3);
  if (!window.length) return plan;
  const allowed = new Set(window.map(s => s.id));
  const allowedEvents = new Set(window.flatMap(s => s.events).filter(id => !plan.beats.beats.some(b => b.eventIds.includes(id))));
  const source = `scenes/${committed.id}/continuation-source.json`;
  await session.put(source, { method: plan.form.method, committed, window, mutableEventIds: [...allowedEvents], ending: plan.concept.ending, protectedBeats: plan.beats, currentRevelations: plan.revelations });
  const patch = await session.run<{ scenes: SceneNode[]; events: AuthorArchitecture['world']['events'] }>(`continuation/${committed.id}`, `scenes/${committed.id}/continuation.json`, 'graph', [source],
    o({ scenes: a(PLAN_SCHEMAS.graph.properties!.scenes.items!), events: a(PLAN_SCHEMAS.world.properties!.events.items!) }),
    'Develop the next connective route from actual consequences. Return replacement scenes only from the allowed window and replacement events only from mutableEventIds; empty arrays are permitted when no adjustment is needed. Never change IDs, chapter/order/POV, acquisitions, protected turning points, user requirements or enacted history. For hybrid retain planned outcomes but discover different tactics; discovery may change connective choices/outcomes and must update their objective events consistently. For outliner repair only consequences of the demonstrated deviation. Do not invent a safe resource already lost in committed prose.', llm,
    value => {
      if (value.scenes.some(s => !allowed.has(s.id)) || new Set(value.scenes.map(s => s.id)).size !== value.scenes.length || value.events.some(e => !allowedEvents.has(e.id))) throw new Error('Continuation tried to alter protected or enacted material.');
      for (const scene of value.scenes) {
        const old = plan.graph.scenes.find(s => s.id === scene.id)!;
        if (scene.pov !== old.pov || (plan.form.method === 'hybrid' && scene.outcome !== old.outcome)) throw new Error('Continuation exceeded the selected writing method.');
      }
      validateArchitecture({ ...plan, graph: { scenes: plan.graph.scenes.map(s => value.scenes.find(n => n.id === s.id) || s) }, world: { ...plan.world, events: plan.world.events.map(e => value.events.find(n => n.id === e.id) || e) } });
    });
  if (!patch.scenes.length && !patch.events.length) return plan;
  const next = { ...plan, graph: { scenes: plan.graph.scenes.map(s => patch.scenes.find(n => n.id === s.id) || s) }, world: { ...plan.world, events: plan.world.events.map(e => patch.events.find(n => n.id === e.id) || e) } };
  await acceptArchitecture(next, session);
  return next;
}

export function applyExecutionToCard(card: Card, execution: SceneExecution): Card {
  return { ...card, goal: execution.current.goal, action: execution.current.action, choice: execution.current.choice, change: execution.current.outcome,
    cost: execution.current.cost, time: execution.current.time, location: execution.current.location, dialogueAims: execution.current.dialogueAims, writerDirectives: execution.directives.join('\n') };
}
