import type { ThesisPlan, ThesisDraft } from './theses';
import {canonContext} from './storyCanon';
import {sceneRevision} from './stateTransitions';

/** Derived from the existing outline and saved prose; never generated in a new model call. */
export function blockContract(plan: ThesisPlan, id: string, blocks: ThesisDraft['blocks']) {
  const index = plan.theses.findIndex(t => t.id === id);
  if (index < 0) throw new Error(`Unknown thesis for block contract: ${id}`);
  const current = plan.theses[index];
  const earlier = plan.theses.slice(0, index);
  const previous = index ? blocks.find(b => b.thesis_id === plan.theses[index - 1].id) : undefined;
  const next = plan.theses[index + 1];
  const traceFor=(block:ThesisDraft['blocks'][number]|undefined)=>block?.review.state_trace?.source_revision===sceneRevision(block?.text||'') ? block?.review.state_trace : undefined;
  const normalize = (s: string) => s.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const firstOwner = new Map<string, string>();
  for (const thesis of plan.theses) for (const fact of [...thesis.establishes, ...thesis.reader_learns]) {
    if (!firstOwner.has(normalize(fact))) firstOwner.set(normalize(fact), thesis.id);
  }
  return {
    owner: current.id,
    canonical_story:canonContext(plan,id),
    resolution_contract: { intended_answer: plan.ending,
      evidence_chain: plan.theses.filter(t => t.reader_learns.length).map(t => ({ owner: t.id, disclosure: t.reader_learns, prerequisites: t.requires })),
      rule: 'Witness statements and hypotheses are not proven facts. The final answer must be earned by these discoveries and tests. If incompatible accounts remain, resolve their reliability explicitly rather than silently choosing one.' },
    entry_state: { time: current.when, location: current.where, conditions_and_objects: current.state_before,
      characters: current.participants.map(p => ({ id: p.character_id, intention: p.intention, planned_knowledge: p.knows })),
      evidence: { previous_block: previous?.thesis_id || null, previous_prose: previous ? 'continue_from.actual_previous_ending' : null },
      rule: 'Planned knowledge and conditions must agree with the referenced prose. If a required object, arrival or disclosure is absent, read the source and repair the missing transition; do not silently assume it happened.' },
    happens_here_first: { event_id: `${current.id}:event`, action: current.action, outcome: current.outcome,
      disclosures: [...new Set([...current.establishes, ...current.reader_learns])].filter(f => firstOwner.get(normalize(f)) === current.id) },
    continuing_disclosures: [...new Set([...current.establishes, ...current.reader_learns])].filter(f => firstOwner.get(normalize(f)) !== current.id)
      .map(fact => ({ fact, first_owner: firstOwner.get(normalize(fact)) })),
    already_written: earlier.flatMap(t => {
      const block = blocks.find(b => b.thesis_id === t.id);
      return block ? [{ owner: t.id, event_id: `${t.id}:event`, planned_action: t.action, planned_outcome: t.outcome,
        planned_disclosures: [...t.establishes, ...t.reader_learns], review_status: block.review.status === 'unavailable' ? 'unavailable' : block.review.ready ? 'checked' : 'unresolved',
        actual_state_changes: traceFor(block)?.events || [],
        actual_consequence_checks: traceFor(block)?.checks,
        prose_reference: { block_id: block.thesis_id, characters: block.text.length } }] : [];
    }),
    continue_from: { planned_state: current.state_before, actual_previous_ending: previous?.text.slice(-2400) || null, actual_previous_changes:traceFor(previous)?.events||[],
      source: previous?.thesis_id || null },
    handoff: next ? { next_owner: next.id, next_state: next.state_before, reserved_action: next.action, reserved_outcome: next.outcome }
      : { next_owner: null, next_state: 'Book ending', reserved_action: null, reserved_outcome: null },
    rule: 'Execute the current event once. Treat earlier prose as history, not a scene to replay. Continue its consequences. Do not execute the next owner’s event. Planned outcomes are not proof of actual prose: search/read references if unsure. Recalling an event or showing a new emotional consequence is allowed; resetting it as a new revelation is not.',
  };
}
