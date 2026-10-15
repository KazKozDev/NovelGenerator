import type { AuthorArchitecture } from '../../utils/novel/craft/types';
import type { NovelLLM } from '../../utils/novel/v2/llm';
import { cleanAuditJSON } from './baselineAudit';

export function authorArchitecture(): AuthorArchitecture {
  const voice = { syntax: 'Short sentences.', vocabulary: 'Plain.', directness: 'Direct under pressure.', defense: 'Dry humor.', forbiddenTopic: 'Her brother.', examples: ['Give me the key.', 'That lock has a better memory than you.'] };
  const perception = { attention: 'Locks and exits.', blindSpot: 'Trust in officials.', imagery: 'Mechanical detail.' };
  const scenes = [1, 2, 3].map((n) => ({ id: `SC${n}`, chapter: 1, order: n, timeline: 'T1', pov: 'C1', participants: ['C1', 'C2'], events: [`E${n}`], dependsOn: n > 1 ? [`SC${n - 1}`] : [], causedBy: n > 1 ? [{ scene: `SC${n - 1}`, consequence: n === 2 ? 'The stolen key opens the archive but compromises her cover.' : 'The key broke, so she must use the ledger in public.', relation: 'therefore' as const }] : [], goal: ['Take the archive key.', 'Get the ledger.', 'Expose the forgery.'][n - 1], obstacle: 'The guard wants to keep the archive closed.', choice: 'Risk her identity to expose the forgery.', outcome: ['She has the key but loses anonymity.', 'She has the ledger but the key breaks.', 'She exposes the forgery and loses her job.'][n - 1], optionsBefore: ['Walk away.', 'Risk exposure.'], optionsAfter: n < 3 ? ['Act without cover.'] : ['Face the hearing.'], resourceChanges: [{ resource: 'R1', available: n === 1, reason: n === 1 ? 'She takes it.' : 'The key breaks.' }], relationshipChanges: [{ characters: ['C1', 'C2'], change: 'Trust is lost.' }], sceneContract: { action: ['Nora takes the key.', 'Nora opens the archive and the key snaps.', 'Nora reads the ledger aloud to the council.'][n - 1], dialogueAims: { C1: 'Get past the guard.', C2: 'Protect the archive.' }, external: 'The archive lock.', interpersonal: 'The guard refuses access.', internal: 'Fear of losing her job.', startValue: 'Safety', endValue: 'Exposure', polarity: '+ to -' as const, cost: 'Her cover and then her job.', location: 'Town hall archive', time: `Thursday ${n + 12}:00` } }));
  return {
    contract: { premise: 'Nora exposes a forgery.', genre: 'thriller', requirements: '', chapters: 1, words: 1200, layout: 'classic-three-scenes', method: 'outliner', requestedStructure: 'Choose for this story', mandatory: [], freedom: ['The archive layout.'], genrePromise: 'Exposure at a personal cost.', requiredExperiences: ['Narrowing options and a costly public choice.'] },
    form: { structure: 'Three acts', reason: 'A short escalating conflict.', method: 'outliner', layout: 'classic-three-scenes', timelines: [{ id: 'T1', function: 'Events unfold in order.' }], viewpoints: [{ id: 'C1', person: 'third-limited', function: 'The witness chooses exposure.' }], sceneSlots: scenes.map(s => ({ id: s.id, chapter: s.chapter, order: s.order, targetWords: 400 })) },
    concept: { title: 'The Broken Key', logline: 'An archivist must expose a forged ledger before a hearing, risking her job.', synopsis: 'Nora steals a key, enters the archive, breaks the key, and brings the ledger to the council at the cost of her job.', conflict: 'The guard protects forged records.', thematicQuestion: 'What does honest testimony cost?', ending: { action: 'She reads the ledger aloud.', cost: 'Her job.', externalOutcome: 'The forgery becomes public.', internalOutcome: 'She stops protecting her cover.' } },
    world: { events: scenes.map((s, i) => ({ id: `E${i + 1}`, timeline: 'T1', time: s.sceneContract.time, location: s.sceneContract.location, actor: 'C1', intention: s.goal, action: s.sceneContract.action, prerequisites: i ? [`E${i}`] : [], access: i === 0 ? 'Guard leaves the key on the counter.' : 'The stolen key admits her.', means: 'The brass key and the paper ledger.', outcome: s.outcome, traces: ['The broken key and her signed statement.'], dependsOn: i ? [`E${i}`] : [] })), rules: [{ id: 'W1', rule: 'The archive opens with one physical key.', limit: 'The lock cannot be picked in time.', cost: 'Identity must be logged.' }], places: [{ id: 'L1', constraints: ['One guarded entrance.'], dramaticFunction: 'Forces a visible choice.' }], resources: [{ id: 'R1', owner: 'C2', available: true, description: 'The only brass key.' }], deliberateUnknowns: [] },
    characters: { protagonist: 'C1', characters: ['C1', 'C2'].map((id, i) => ({ id, name: i ? 'Cole' : 'Nora', role: i ? 'Guard' : 'Archivist', arc: 'testing', want: i ? 'Keep the archive closed.' : 'Expose the forgery.', beliefOrCode: 'Records must tell the truth.', tactics: ['Demand access.', 'Use physical evidence.'], initialBenefit: 'Officials trust her.', escalatingCost: 'Her access is revoked.', crucible: 'Speak and lose her job.', finalChoice: 'Read the ledger aloud.', thematicAnswer: 'Truth is worth a public cost.', initialKnowledge: ['The archive has a single guarded entrance.'], voice, perception })) },
    opposition: { agent: 'C2', worldview: 'Order protects the town.', goal: 'Keep the ledger private.', resources: ['The key.'], limits: ['Cannot erase signed records.'], steps: [{ id: 'O1', event: 'E2', trigger: 'Nora enters.', knowledgeRequired: ['The lock is damaged.'], action: 'Revoke her access.', consequence: 'She must testify publicly.', possibleFailure: 'She already has the ledger.' }] },
    beats: { beats: [{ id: 'B1', name: 'Commitment', scene: 'SC1', percent: 10, eventIds: ['E1'], choice: 'Take the key.', strategyBefore: 'Ask politely.', strategyAfter: 'Risk her cover.', price: 'Anonymity.' }, { id: 'B2', name: 'Climax', scene: 'SC3', percent: 90, eventIds: ['E3'], choice: 'Testify.', strategyBefore: 'Hide the evidence.', strategyAfter: 'Publish it.', price: 'Her job.' }] },
    promises: { promises: [{ id: 'P1', scale: 'macro', expectation: 'Will she expose the forgery?', opens: 'SC1', progress: [{ scene: 'SC2', change: 'She gets the ledger but loses access.' }], payoff: { scene: 'SC3', action: 'She reads it aloud.', consequence: 'Forgery exposed; job lost.' }, successor: null }] },
    payoffs: { setups: [{ id: 'G1', kind: 'object', name: 'The key', neededFor: 'SC2', appearances: [{ scene: 'SC1', role: 'setup', action: 'She takes it.', interpretation: 'Access is possible.' }, { scene: 'SC2', role: 'payoff', action: 'It breaks in the lock.', interpretation: 'She cannot quietly return.' }], changedMeaning: 'Access becomes evidence of intrusion.' }] },
    revelations: { facts: [{ id: 'F0', truth: 'The archive has a single entrance.', initialKnownBy: ['C1', 'C2'], acquisitions: [], readerEvidence: [{ scene: 'SC1', event: 'E1', interpretation: 'The guard controls entry.' }], reveal: 'SC1', mode: 'direct' }, { id: 'F1', truth: 'The key has broken and cannot be used again.', initialKnownBy: [], acquisitions: [{ character: 'C1', scene: 'SC2', action: 'She feels it snap.', evidenceEvent: 'E2' }], readerEvidence: [{ scene: 'SC2', event: 'E2', interpretation: 'Silent retreat is impossible.' }], reveal: 'SC2', mode: 'suspense' }] },
    pacing: { scenes: scenes.map((s, i) => ({ scene: s.id, emotionBefore: i ? 'Fear' : 'Hope', emotionAfter: i === 2 ? 'Relief with grief' : 'Dread', intensity: i + 4, mode: i === 1 ? 'action' : 'reaction', distance: i === 1 ? 'deep' : 'close', timeScale: i === 1 ? 'dilated' : 'realtime', detailFunction: 'Make the cost of entry visible.', syntax: i === 1 ? 'Compressed action.' : 'Measured speech.', ending: i === 2 ? 'quiet-resonance' : 'cliffhanger', targetWords: 400 })) },
    graph: { scenes },
  };
}

export const authorProse = (scene: number) => [
  'Nora took the key. Cole wrote her name in the entry book.',
  'The key snapped in the lock. Nora lifted the ledger from its shelf.',
  'Nora read the ledger aloud. The council dismissed her from her job.',
][scene - 1] + ' The room held its silence. '.repeat(65);

/** Scripted protocol fixture; never presented as live literary-quality evidence. */
export function scriptedAuthorLLM(plan = authorArchitecture(), calls: { stage: string; prompt: string }[] = []): NovelLLM {
  return async (prompt, _system, options) => {
    const stage = options?.stage || ''; calls.push({ stage, prompt });
    const op = stage.replace('craft-author-', '');
    const named: Record<string, unknown> = { contract: { mandatory: [], freedom: plan.contract.freedom, genrePromise: plan.contract.genrePromise, requiredExperiences: plan.contract.requiredExperiences }, form: { ...plan.form, sceneSlots: undefined, sceneCounts: [...new Set(plan.form.sceneSlots.map(s => s.chapter))].map(ch => plan.form.sceneSlots.filter(s => s.chapter === ch).length) }, cast: { leadViewpoint: plan.characters.protagonist, people: plan.characters.characters.map(c => ({ name: c.name, role: c.role, viewpointId: plan.form.viewpoints.some(v => v.id === c.id) ? c.id : 'none' })) }, logline: { logline: plan.concept.logline }, concept: plan.concept, truth: plan.world, characters: plan.characters, opposition: plan.opposition, beats: plan.beats, promises: plan.promises, payoffs: plan.payoffs, revelations: { facts: plan.revelations.facts.map(f => ({ kind: 'objective', attributedTo: null, supersededBy: null, ...f })) }, pacing: plan.pacing, graph: plan.graph };
    if (op === 'graph' && prompt.includes('BATCH OVERRIDE:')) {
      const scope = JSON.parse(prompt.match(/AUTHOR INPUT DATA:\n([^\n]+)/)![1]);
      const ids = Object.entries(scope).find(([k]) => k.endsWith('-scope.json'))![1] as { slots: { id: string }[] };
      return JSON.stringify({ scenes: plan.graph.scenes.filter(s => ids.slots.some(slot => slot.id === s.id)) });
    }
    if (op in named) return JSON.stringify(named[op]);
    if (op === 'revision-plan') {
      const data = JSON.parse(prompt.match(/AUTHOR INPUT DATA:\n([^\n]+)/)![1]);
      const source = Object.entries(data).find(([k]) => k.endsWith('/source.json'))![1] as { scenes: { id: string; chapter: number }[] };
      const targets = Object.entries(data).find(([k]) => k.endsWith('/targets.json'))![1] as { id: string; chapter: number; targetWords: number }[];
      return JSON.stringify({ problem: 'Preserve the effective causal draft.', openingPromise: 'The key makes exposure possible.', endingExecution: 'Read the ledger aloud and lose the job.', scenes: targets.map(target => ({ id: target.id, chapter: target.chapter, sources: [source.scenes.find(s => s.id === target.id)!.id], operation: 'keep', instruction: 'Keep the effective scene.', dependencies: [], beforeState: 'Narrowing options.', afterState: 'Personal cost.', revealChanges: 'No reveal moved.', targetWords: target.targetWords })) });
    }
    const id = prompt.match(/scenes\/(SC\d+)\//)?.[1] || prompt.match(/before (SC\d+)/)?.[1] || prompt.match(/"sceneId":"(SC\d+)"/)?.[1];
    const index = id ? Number(id.slice(2)) : 1;
    if (op === 'adapt') return JSON.stringify({ decision: 'progress', reason: 'The reader needs the next consequence.', adjustments: [{ scene: id, action: 'Show the personal cost through the entry record.', intendedEffect: 'Make access costly.' }] });
    if (op === 'execution') {
      const node = plan.graph.scenes[index - 1];
      return JSON.stringify({ goal: node.goal, action: node.sceneContract.action, obstacle: node.obstacle, choice: node.choice, outcome: node.outcome, cost: node.sceneContract.cost, location: node.sceneContract.location, time: node.sceneContract.time, dialogueAims: node.sceneContract.dialogueAims, directives: ['Make access costly through an actual action.'] });
    }
    if (op === 'enact') {
      const quote = authorProse(index).split('. ')[0] + '.';
      return JSON.stringify({ events: [{ event: `E${index}`, quote, outcome: plan.graph.scenes[index - 1].outcome }], acquisitions: index === 2 ? [{ character: 'C1', fact: 'F1', quote }] : [], resources: [{ resource: 'R1', available: index === 1, quote }], relationships: [], options: index === 2 ? ['Testify publicly without a usable key.'] : ['Take the next costly step.'], summary: quote, deferred: [], deviations: [] });
    }
    if (stage === 'craft-preflight') return '{"issues":[]}';
    if (stage === 'craft-reader') return '{"hypotheses":[],"expectations":["She must risk her cover."]}';
    if (stage === 'craft-write' || stage === 'craft-repair') {
      const scene = Number(prompt.match(/"sceneId":"SC(\d+)"/)?.[1] || 1);
      return authorProse(scene);
    }
    if (stage === 'craft-observe') {
      const scene = prompt.match(/"id":"(SC\d+)"/)![1];
      return JSON.stringify({ event: { status: 'enacted', sources: [`${scene}-p1`], reason: 'Concrete action.' }, tangibleActionEnacted: true, valueChargeTurned: true, facts: [], issues: [], wordCount: 400 });
    }
    return cleanAuditJSON;
  };
}
