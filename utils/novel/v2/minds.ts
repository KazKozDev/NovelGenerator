import { fillTemplate } from '../prompts';
import choiceRaw from '../../../prompts/THESIS_CHOICE.md?raw';
import compareRaw from '../../../prompts/THESIS_CHOICE_COMPARE.md?raw';
import { structuredResponse, isResponseContractError, type NovelLLM } from './llm';
import { blockContract } from './blockContract';
import { planReviewSchema } from './proseReviewSchema';
import { readThesisReview, type ThesisPlan, type ThesisDraft, type ThesisReview } from './theses';
import type { ProjectInput } from './types';

/**
 * Three truths that a book keeps apart: what happened (canon), what is in each person's
 * head (knows, believes — including what is false), and what the reader has been shown.
 * The writer of a scene is given the head of its point-of-view character and what can be
 * seen in the room. The editor keeps all three and checks them against each other.
 */
export interface MindAnswer { key: string; status: 'no' | 'learns' | 'already_knows'; quote: string }
export interface MindRow { key: string; who: string; reader: boolean; character_id?: string; fact_id: string; fact: string; due: string }
type MindLedger = Record<string, { minds?: MindAnswer[] }>;

const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const READER = '@READER';

/** A plan that says what lies beneath its scenes is written with the minds kept apart. */
export const hasMinds = (plan: ThesisPlan | null | undefined): boolean => !!plan?.canon && plan.theses.some(t => text(t.beneath));

const order = (plan: ThesisPlan, scene: string | undefined): number => scene === 'INITIAL' ? -1 : scene === undefined || scene === 'NEVER' ? Infinity : (i => i < 0 ? Infinity : i)(plan.theses.findIndex(t => t.id === scene));
const planned = (plan: ThesisPlan, character: string, fact: string): string | undefined => plan.canon?.facts.find(f => f.id === fact)?.knowledge.find(k => k.character_id === character)?.learned_in;

/** What a person knows as a scene opens: what the plan gave them earlier, and what the text itself showed them learning. */
export function knownFacts(plan: ThesisPlan, ledger: MindLedger, character: string, scene: string): Set<string> {
  const index = order(plan, scene);
  const known = new Set<string>();
  for (const fact of plan.canon?.facts || []) if (order(plan, planned(plan, character, fact.id)) < index) known.add(fact.id);
  for (const earlier of plan.theses.slice(0, Math.max(0, index))) for (const answer of ledger[earlier.id]?.minds || []) {
    const [who, fact] = answer.key.split('|');
    if (who === character && answer.status !== 'no') known.add(fact);
  }
  return known;
}

/** The closed questions put to a finished scene: does anyone here, or the reader, have what they should not yet have? */
export function mindRows(plan: ThesisPlan, ledger: MindLedger, scene: string, limit = 24): MindRow[] {
  const thesis = plan.theses.find(t => t.id === scene);
  if (!thesis || !hasMinds(plan)) return [];
  const index = order(plan, scene);
  const due = (at: string | undefined) => order(plan, at) === index ? 'here' : order(plan, at) === Infinity ? 'never in this book' : at!;
  const rows: MindRow[] = [];
  const present = [thesis.pov_id, ...thesis.participants.map(p => p.character_id).filter(id => id !== thesis.pov_id)];
  for (const id of present) {
    const known = knownFacts(plan, ledger, id, scene);
    const name = plan.characters.find(c => c.id === id)?.name || id;
    for (const fact of plan.canon!.facts) if (!known.has(fact.id))
      rows.push({ key: `${id}|${fact.id}`, who: name, reader: false, character_id: id, fact_id: fact.id, fact: fact.truth, due: due(planned(plan, id, fact.id)) });
  }
  for (const fact of plan.canon!.facts) if (text(fact.reader_learns_in) && order(plan, fact.reader_learns_in) > index)
    rows.push({ key: `${READER}|${fact.id}`, who: 'the reader', reader: true, fact_id: fact.id, fact: fact.truth, due: due(fact.reader_learns_in) });
  // Under the cap the point-of-view character comes first, then the reader, then the others:
  // a long list for one person must not crowd the reader's rows out unasked.
  const unique = [...new Map(rows.map(row => [row.key, row])).values()];
  const rank = (row: MindRow) => row.character_id === thesis.pov_id ? 0 : row.reader ? 1 : 2;
  return unique.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

const flat = (value: string) => value.replace(/\s+/g, ' ').trim();
/** An answer counts only when its sentence is in the scene. */
export function readMinds(raw: any, rows: MindRow[], scene: string): MindAnswer[] {
  const answers = Array.isArray(raw?.minds) ? raw.minds : [];
  const source = flat(scene);
  return rows.map(row => {
    const answer = answers.find((item: any) => item?.key === row.key);
    const quote = text(answer?.quote) ? flat(answer.quote).replace(/^["“”']+|["“”']+$/g, '') : '';
    if (!answer || !['learns', 'already_knows'].includes(answer.status) || quote.length < 12 || !source.includes(quote)) return { key: row.key, status: 'no' as const, quote: '' };
    return { key: row.key, status: answer.status, quote };
  });
}

export function mindIssues(rows: MindRow[], answers: MindAnswer[], scene: string): ThesisReview['issues'] {
  return answers.filter(answer => answer.status !== 'no').flatMap(answer => {
    const row = rows.find(item => item.key === answer.key)!;
    if (row.due === 'here') return [];
    const when = row.due === 'never in this book' ? 'never learns it in this book' : `learns it in ${row.due}`;
    const early = row.reader ? `The reader is given this before the plan gives it (${row.due}): "${row.fact}"`
      : answer.status === 'learns' ? `${row.who} learns here what the plan has them learn later (${when}): "${row.fact}"`
      : `${row.who} already knows, thinks or assumes what they have no way to know yet (${when}): "${row.fact}"`;
    return [{ severity: 'major' as const, kind: answer.status === 'already_knows' && !row.reader ? 'unsupported_knowledge' : 'premature_disclosure', evidence: answer.quote, thesis_ids: [scene],
      problem: early, consequence: 'The scene that owns this discovery has nothing left to discover, and a person acts on knowledge with no source.',
      required_change: row.reader ? 'Remove the statement or the plain showing of it; keep only what the plan asks this scene to plant.' : `Cut or rewrite the sentence so that ${row.who} thinks and acts only on what they have seen and been told so far. A suspicion drawn from something shown earlier may stay if the scene says what it is drawn from.` }];
  });
}

/** What the writer is told instead of the premise: form, not story. */
export function writerRequest(input: ProjectInput): string {
  return JSON.stringify({ genre: input.genre, author_requirements: input.author_requirements, planning_version: input.planning_version,
    note: 'The premise and the rest of the story are not shown to you. You write this scene from inside its point-of-view character, who does not know how the story goes.' });
}

/** The scene as its point-of-view character has it, and what can be seen of the others. */
export function writerScene(plan: ThesisPlan, id: string, ledger: MindLedger) {
  const t = plan.theses.find(thesis => thesis.id === id);
  if (!t) throw new Error(`Unknown scene ${id}`);
  const card = (character: string) => plan.characters.find(c => c.id === character)!;
  const pov = t.participants.find(p => p.character_id === t.pov_id)!;
  const truth = (fact: string) => plan.canon?.facts.find(f => f.id === fact)?.truth;
  return { id: t.id, chapter: t.chapter, when: t.when, where: t.where, state_before: t.state_before, action: t.action, resistance: t.resistance, outcome: t.outcome,
    establishes: t.establishes, reader_learns: t.reader_learns, requires: t.requires, writer_task: t.writer_task, target_words: t.target_words,
    point_of_view: { name: card(t.pov_id).name, goal: card(t.pov_id).goal, has_always_known: card(t.pov_id).initial_knowledge, capabilities: card(t.pov_id).capabilities, limitations: card(t.pov_id).limitations,
      wants_here: pov.intention, does: pov.does || '', knows: pov.knows, believes: pov.believes || [],
      facts_known: [...knownFacts(plan, ledger, t.pov_id, id)].map(truth).filter(text),
      learns_in_this_scene: (plan.canon?.facts || []).filter(f => planned(plan, t.pov_id, f.id) === id).map(f => f.truth) },
    others_present: t.participants.filter(p => p.character_id !== t.pov_id).map(p => ({ name: card(p.character_id).name, seen_doing: p.does || '' })) };
}

/** Where the scene stands among those already written. Nothing after it. */
export function writerOutline(plan: ThesisPlan, id: string) {
  const index = plan.theses.findIndex(t => t.id === id);
  const current = plan.theses[index];
  const shown = plan.theses.slice(0, index).filter((t, i) => i === index - 1 || current.requires.includes(t.id));
  return { title: plan.title, earlier_scenes: shown.map(t => ({ id: t.id, when: t.when, where: t.where, action: t.action, outcome: t.outcome })),
    scope: 'Earlier scenes only. What follows this scene is not shown: its point-of-view character does not know it, and neither do you.' };
}

export function writerContract(plan: ThesisPlan, id: string, blocks: ThesisDraft['blocks']) {
  const contract = blockContract(plan, id, blocks);
  const index = plan.theses.findIndex(t => t.id === id);
  const local = new Set([plan.theses[index - 1]?.id, ...plan.theses[index].requires]);
  return { owner: contract.owner, happens_here_first: contract.happens_here_first, continuing_disclosures: contract.continuing_disclosures,
    already_written: contract.already_written.filter(entry => local.has(entry.owner)).map(({ actual_consequence_checks, ...entry }) => entry), continue_from: contract.continue_from,
    stop_at: 'End the scene at its own outcome. Whatever comes next belongs to a scene you are not shown; do not reach for it.' };
}

export const WRITER_NOTE = '\nYou are shown what this scene\'s point-of-view character knows, believes and wants, and what can be seen of the others. That is all there is to write from: the character acts on beliefs that may be wrong, and you are not told which. Do not supply a hidden truth behind the scene, a hint that someone knows more, or a thought about what is coming. Plant what writer_task asks as something seen or said, without explaining it. Where this note and an instruction above disagree about a following scene, a handoff or an outline, this note holds: none of those is shown.';

/** The scenes most of the book hangs from: the ones the most later scenes require. */
export function turningPoints(plan: ThesisPlan, count = 3): string[] {
  const weight = new Map(plan.theses.map(t => [t.id, 0]));
  for (const t of plan.theses) for (const id of t.requires) weight.set(id, (weight.get(id) || 0) + 1);
  return plan.theses.filter(t => (weight.get(t.id) || 0) > 0).sort((a, b) => (weight.get(b.id)! - weight.get(a.id)!) || (b.participants.length - a.participants.length)).slice(0, count).map(t => t.id);
}

/**
 * Each person in a turning point is asked what they do, knowing only their own sheet and
 * not the outline's answer. One comparison then says where the outline has someone act
 * as the plot needs and not as they would.
 */
export async function choiceChecks(plan: ThesisPlan, system: string, llm: NovelLLM, log: (line: string) => void): Promise<ThesisReview['issues']> {
  const issues: ThesisReview['issues'] = [];
  for (const id of turningPoints(plan)) {
    const t = plan.theses.find(thesis => thesis.id === id)!;
    const choices: { character_id: string; name: string; would_do: string; otherwise: string; because: string }[] = [];
    for (const p of t.participants) {
      const card = plan.characters.find(c => c.id === p.character_id)!;
      const sheet = { name: card.name, goal: card.goal, capabilities: card.capabilities, limitations: card.limitations, knows: p.knows, believes: p.believes || [], wants_here: p.intention,
        situation: { when: t.when, where: t.where, as_it_stands: t.state_before, also_present: t.participants.filter(o => o.character_id !== p.character_id).map(o => plan.characters.find(c => c.id === o.character_id)!.name) } };
      try {
        const choice = await structuredResponse(fillTemplate('THESIS_CHOICE', choiceRaw, { sheet: JSON.stringify(sheet) }), system, llm, ['would_do', 'otherwise', 'because'],
          raw => { if (!text(raw.would_do) || !text(raw.otherwise) || !text(raw.because)) throw new Error('Return would_do, otherwise and because as nonempty text.'); return raw as { would_do: string; otherwise: string; because: string }; },
          { stage: 'thesis-choice', route: 'validator', maxTokens: 1024, maxAttempts: 3 });
        choices.push({ character_id: p.character_id, name: card.name, ...choice });
      } catch (error) { if (!isResponseContractError(error)) throw error; log(`Independent choice not obtained for ${card.name} in ${id}.`); }
    }
    if (!choices.length) continue;
    const found = await structuredResponse(fillTemplate('THESIS_CHOICE_COMPARE', compareRaw, {
      scene: JSON.stringify({ id: t.id, state_before: t.state_before, action: t.action, why: t.why, resistance: t.resistance, outcome: t.outcome, beneath: t.beneath || '', participants: t.participants }), choices: JSON.stringify(choices) }),
      system, llm, ['ready', 'issues'], raw => readThesisReview(raw, plan).issues, { stage: 'thesis-choice-compare', route: 'validator', schema: planReviewSchema([id]), maxTokens: 2048, deliberate: true });
    issues.push(...found);
  }
  return issues;
}
