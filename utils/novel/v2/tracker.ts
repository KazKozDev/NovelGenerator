import { renderPrompt, systemContract } from '../prompts';
import { extractPremiseNames } from '../analytics';
import { structuredResponse, type NovelLLM } from './llm';
import type { ExtractedName, ProperName, ReaderThread, StateDelta, StoryState } from './types';

/** States persisted before the name registry existed carry no names shelf. */
export function storyNames(state: StoryState): ProperName[] {
  return Array.isArray(state.names) ? state.names : [];
}

/**
 * StateTracker: one call per scene extracts the memory delta and checks it
 * against the prior state. Only text-confirmed changes enter memory, each with
 * its evidence refs; a character's words stay their claim until the text makes
 * them fact. A blocking contradiction stops the line — taste notes never
 * trigger a rewrite.
 */

export interface TrackInput {
  story_language: string;
  planning_language: string;
  priorState: StoryState;
  scenePlan: unknown;
  sceneProse: string;
  sourceExcerpts: string[];
}

/** Number the paragraphs so every extracted change can point at its proof. */
export function paragraphsWithIds(prose: string): { id: string; text: string }[] {
  const parts = prose.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean);
  const grouped: string[] = [];
  for (const part of parts) {
    const prev = grouped.length - 1;
    if (prev >= 0 && grouped[prev].length < 40) grouped[prev] = `${grouped[prev]}\n\n${part}`;
    else grouped.push(part);
  }
  return grouped.map((text, index) => ({ id: `p${index + 1}`, text }));
}

const DELTA_KEYS = ['proper_names', 'name_variants', 'events', 'state_changes', 'knowledge_changes', 'belief_changes',
  'intentions_and_commitments', 'reader_disclosures', 'threads_opened', 'threads_resolved',
  'contradictions', 'uncertainties', 'plan_deviations'];

/**
 * Lowercased, possessives folded anywhere in the span: "Zor's" and "Zor"
 * are one key, and so are "Zor's Pax" and "Zor Pax".
 * Display spellings keep their apostrophes; only the key is folded.
 * Folding is normalization, not judgment: it never declares two different
 * names one thing.
 */
const normName = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/['’]s\b/g, '').replace(/['’]$/g, '').replace(/\s+/g, ' ');
};

/**
 * Fold freshly extracted proper names into the registry. Exact hits merge
 * silently; a name the model links to a recorded entry via refers_to becomes
 * an alias; anything else registers as its own entry. The merge never judges
 * similarity — variant verdicts arrive from the model in name_variants, and
 * only those block the line.
 */
export function mergeProperNames(
  known: ProperName[],
  extracted: ExtractedName[],
  sceneRef: string,
): { names: ProperName[] } {
  const names: ProperName[] = known.map(entry => ({ ...entry, aliases: [...entry.aliases] }));
  const variants = new Map<string, ProperName>();
  for (const entry of names) {
    variants.set(normName(entry.name), entry);
    for (const alias of entry.aliases) variants.set(normName(alias), entry);
  }
  for (const item of extracted || []) {
    const raw = typeof item?.name === 'string' ? item.name.trim() : '';
    const key = normName(raw);
    if (!key) continue;
    if (variants.has(key)) continue;
    const link = normName(item?.refers_to);
    const target = link ? variants.get(link) : undefined;
    if (target) {
      target.aliases.push(raw);
      variants.set(key, target);
      continue;
    }
    // An explicit link is a model decision code honors; anything else that is
    // not an exact hit registers as its own entry. Whether "Zarka" beside
    // "Zarko" is drift or a new ship is meaning — judged by the model in
    // name_variants, never by code similarity. No guessing per book.
    names.push({ name: raw, kind: typeof item?.kind === 'string' ? item.kind.trim() : '', refers_to: typeof item?.refers_to === 'string' ? item.refers_to.trim() : '', aliases: [], first_seen: sceneRef });
    variants.set(key, names[names.length - 1]);
  }
  return { names };
}

export function validateDelta(raw: unknown, paragraphIds: string[] = []): StateDelta {
  if (!raw || typeof raw !== 'object') throw new Error('State delta is not an object.');
  const delta = raw as Record<string, unknown>;
  for (const key of DELTA_KEYS) {
    if (!Array.isArray(delta[key])) throw new Error(`State delta is missing "${key}".`);
  }
  for (const event of (delta.events as { evidence_refs?: unknown }[])) {
    if (!Array.isArray(event?.evidence_refs) || !event.evidence_refs.length) {
      throw new Error('An extracted event has no evidence.');
    }
  }
  if (paragraphIds.length) {
    const known = new Set(paragraphIds);
    const dangling: string[] = [];
    for (const group of [delta.events, delta.state_changes, delta.knowledge_changes, delta.name_variants] as { evidence_refs?: unknown }[][]) {
      for (const record of group) {
        for (const ref of (Array.isArray(record?.evidence_refs) ? record.evidence_refs : []) as unknown[]) {
          if (typeof ref === 'string' && !known.has(ref)) dangling.push(ref);
        }
      }
    }
    if (dangling.length) {
      throw new Error(`Evidence points nowhere: ${[...new Set(dangling)].join(', ')}. Paragraphs are ${paragraphIds.join(', ')}.`);
    }
  }
  return raw as StateDelta;
}

export async function trackScene(input: TrackInput, llm: NovelLLM): Promise<StateDelta> {
  const system = systemContract({ story_language: input.story_language, planning_language: input.planning_language });
  const paragraphs = paragraphsWithIds(input.sceneProse);
  const ids = paragraphs.map(p => p.id);
  const numbered = paragraphs.map(p => `[${p.id}] ${p.text}`).join('\n\n');
  // The registry travels into extraction: only the model, reading both the
  // prose and the recorded spellings, may judge a variant. Code never does.
  const recorded = storyNames(input.priorState);
  const base = {
    prior_state: JSON.stringify(input.priorState),
    recorded_names: recorded.length
      ? recorded.map(entry => `${entry.name}${entry.aliases.length ? ` (also: ${entry.aliases.join(', ')})` : ''} — ${entry.kind || 'unnamed kind'}, first seen ${entry.first_seen}`).join('\n')
      : '(no named entities recorded yet)',
    scene_plan: typeof input.scenePlan === 'string' ? input.scenePlan : JSON.stringify(input.scenePlan),
    scene_text_with_paragraph_ids: numbered,
    source_excerpts: JSON.stringify(input.sourceExcerpts),
  };
  const read = async (extra: string): Promise<StateDelta> => {
    const raw = await structuredResponse(renderPrompt('P05_STATE_UPDATE', base) + extra, system, llm,
      DELTA_KEYS, parsed => parsed, { temperature: 0.1, maxTokens: 8192, route: 'validator' });
    return backstopNames(validateDelta(raw, ids), input.sceneProse);
  };
  try {
    return await read('');
  } catch (first) {
    // One correction pass for a misquoting extraction: the failure names the
    // dangling refs, so the retry answers a concrete question, not a vibe.
    if (!(first instanceof Error) || !first.message.startsWith('Evidence points nowhere')) throw first;
    return await read(`\nCORRECTION: ${first.message} Cite only paragraphs from this scene.`);
  }
}

/**
 * Code backstop for the model extraction: capitalized spans the scene uses
 * but P05 did not report still enter the registry as their own entries, each
 * evidenced by its first paragraph. Exact matching only — the backstop never
 * judges whether a new spelling is a variant; variant verdicts come from the
 * model, which reads the registry in its prompt.
 */
export function backstopNames(delta: StateDelta, prose: string): StateDelta {
  if (!prose.trim()) return delta;
  const reported = new Set((delta.proper_names || []).map(item => normName(item?.name)));
  const numbered = paragraphsWithIds(prose);
  const extra: ExtractedName[] = [];
  for (const name of extractPremiseNames(prose)) {
    const key = normName(name);
    if (!key || reported.has(key)) continue;
    reported.add(key);
    const hit = numbered.find(p => p.text.toLowerCase().includes(key));
    extra.push({ name, kind: '', refers_to: '', evidence_refs: hit ? [hit.id] : [] });
  }
  if (!extra.length) return delta;
  return { ...delta, proper_names: [...(delta.proper_names || []), ...extra] };
}

export interface OpenQuestion {
  question: string;
  evidence_refs: string[];
}

export interface QuestionResolution {
  question: string;
  resolution: string;
  kind: 'fact' | 'knowledge' | 'belief' | 'unresolved';
  subject: string;
  evidence_refs: string[];
}

/**
 * What the scene left open that the next scene needs: resolved from the text
 * and its context before writing continues, in one bounded call. Anything the
 * text cannot answer stays explicitly unresolved instead of guessed.
 */
export async function resolveOpenQuestions(
  sceneProse: string,
  questions: OpenQuestion[],
  llm: NovelLLM,
): Promise<QuestionResolution[]> {
  if (!questions.length) return [];
  const paragraphs = paragraphsWithIds(sceneProse);
  const ids = new Set(paragraphs.map(p => p.id));
  // Only the cited paragraphs plus their neighbours travel: the full scene
  // with its questions is what blows the output budget, and the retry then
  // fails identically. One sentence per answer keeps the output small too.
  const cited = new Set(questions.flatMap(q => q.evidence_refs || []));
  const picked = paragraphs.filter((p, i) =>
    cited.has(p.id) || cited.has(paragraphs[i - 1]?.id) || cited.has(paragraphs[i + 1]?.id));
  const context = (picked.length ? picked : paragraphs).map(p => `[${p.id}] ${p.text}`).join('\n\n');
  const raw = await structuredResponse(
    `SCENE EXCERPTS:\n${context}\n\nOPEN QUESTIONS (answer from these excerpts and nothing else, one sentence per answer):\n${JSON.stringify(questions)}\nState facts about the story world only — never about these excerpts, the dialogue, or how anything was confirmed. Do not repeat the excerpts; each resolution is one sentence inside the JSON.\nReturn JSON {"resolutions":[{"question":"...","resolution":"...","kind":"fact|knowledge|belief|unresolved","subject":"character id for knowledge/belief, empty otherwise","evidence_refs":["pN"]}]}.`,
    'You resolve open story questions strictly from the quoted excerpts. Never infer beyond them.',
    llm, ['resolutions'], parsed => parsed,
    { temperature: 0.1, maxTokens: 8192, route: 'validator' });
  const list = Array.isArray((raw as { resolutions?: unknown }).resolutions)
    ? (raw as { resolutions: QuestionResolution[] }).resolutions : [];
  return list.filter(item => item && typeof item.question === 'string' && typeof item.resolution === 'string'
    && (Array.isArray(item.evidence_refs) ? item.evidence_refs : []).every(ref => ids.has(ref)));
}

/** Fold answered questions into memory; unanswered ones stay out, not guessed. */
export function applyResolutions(state: StoryState, resolutions: QuestionResolution[], sceneRef: string): StoryState {
  const next: StoryState = {
    facts: [...state.facts],
    events: [...state.events],
    conditions: { ...state.conditions },
    knowledge: Object.fromEntries(Object.entries(state.knowledge).map(([k, v]) => [k, [...v]])),
    beliefs: Object.fromEntries(Object.entries(state.beliefs).map(([k, v]) => [k, [...v]])),
    reader_disclosures: [...state.reader_disclosures],
    names: storyNames(state).map(entry => ({ ...entry, aliases: [...entry.aliases] })),
  };
  const knownFactIds = new Set(next.facts.map(f => f.id));
  resolutions.forEach((item, index) => {
    if (item.kind === 'fact') {
      const id = `${sceneRef}-q${index + 1}`;
      if (knownFactIds.has(id)) return;
      knownFactIds.add(id);
      next.facts.push({ id, statement: item.resolution, evidence_refs: item.evidence_refs });
    } else if ((item.kind === 'knowledge' || item.kind === 'belief') && item.subject) {
      const shelf = item.kind === 'knowledge' ? next.knowledge : next.beliefs;
      if (!(shelf[item.subject] || []).includes(item.resolution)) {
        shelf[item.subject] = [...(shelf[item.subject] || []), item.resolution];
      }
    }
  });
  return next;
}

export interface ApplyResult {
  state: StoryState;
  blockers: string[];
}

/**
 * Memory is updated by code after the answer is checked, never by the model.
 *
 * Every fold is idempotent by record id: replaying a stored scene after a
 * resume lands on the same memory instead of doubling it.
 */
export function applyDelta(state: StoryState, delta: StateDelta, sceneRef: string): ApplyResult {
  const knownEventIds = new Set(state.events.map(e => e.id));
  const next: StoryState = {
    facts: [...state.facts],
    events: [...state.events],
    conditions: { ...state.conditions },
    knowledge: Object.fromEntries(Object.entries(state.knowledge).map(([k, v]) => [k, [...v]])),
    beliefs: Object.fromEntries(Object.entries(state.beliefs).map(([k, v]) => [k, [...v]])),
    reader_disclosures: [...state.reader_disclosures],
    names: storyNames(state).map(entry => ({ ...entry, aliases: [...entry.aliases] })),
  };
  const merged = mergeProperNames(next.names, delta.proper_names, sceneRef);
  next.names = merged.names;
  delta.events.forEach((event, i) => {
    const id = `${sceneRef}-e${i + 1}`;
    if (knownEventIds.has(id)) return;
    knownEventIds.add(id);
    next.events.push({ id, description: event.description, participants: event.participants, evidence_refs: event.evidence_refs });
  });
  for (const change of delta.state_changes) {
    // The model sometimes repeats the field inside the entity ("C02.location"
    // + "location"); the key must not stutter.
    const key = change.entity_id === change.field || change.entity_id.endsWith(`.${change.field}`)
      ? change.entity_id
      : `${change.entity_id}.${change.field}`;
    next.conditions[key] = change.after;
  }
  for (const change of delta.knowledge_changes) {
    if (!change.character_id || !(next.knowledge[change.character_id] || []).includes(change.learned)) {
      next.knowledge[change.character_id] = [...(next.knowledge[change.character_id] || []), change.learned];
    }
  }
  // A changed belief replaces the old one instead of piling beside it: the
  // shelf holds what the character believes now, with the superseded entry gone.
  for (const change of delta.belief_changes || []) {
    if (!change?.character_id || !change.new_belief) continue;
    const shelf = (next.beliefs[change.character_id] || []).filter(
      belief => belief !== change.new_belief && belief !== change.previous_belief);
    shelf.push(change.new_belief);
    next.beliefs[change.character_id] = shelf;
  }
  for (const disclosure of delta.reader_disclosures || []) {
    if (!next.reader_disclosures.includes(disclosure)) next.reader_disclosures.push(disclosure);
  }
  const blockers = delta.contradictions
    .filter(c => c.blocks_continuation)
    .map(c => c.description);
  // Name variants judged by the model: the scene uses a spelling of a
  // recorded name. Code only carries the verdict — the writer gets one
  // rewrite with the exact spelling demanded, through the existing path.
  for (const variant of delta.name_variants || []) {
    const used = typeof variant?.used === 'string' ? variant.used.trim() : '';
    const recorded = typeof variant?.recorded === 'string' ? variant.recorded.trim() : '';
    if (used && recorded) {
      blockers.push(`Name variant in ${sceneRef}: "${used}" is used for recorded "${recorded}". Use the recorded spelling verbatim, or establish "${used}" in the scene as a different thing.`);
    }
  }
  return { state: next, blockers };
}

export function applyThreads(threads: ReaderThread[], delta: StateDelta, sceneRef: string): ReaderThread[] {
  const next = threads.map(t => ({ ...t, setup_refs: [...t.setup_refs], payoff_refs: [...t.payoff_refs] }));
  for (const opened of delta.threads_opened || []) {
    const text = typeof opened === 'string' ? opened : (opened as { thread?: string; description?: string }).thread
      || (opened as { description?: string }).description || '';
    if (!text || next.some(t => t.setup_refs.includes(sceneRef) && t.description === text)) continue;
    next.push({ id: `${sceneRef}-t${next.length + 1}`, description: text, status: 'open', setup_refs: [sceneRef], payoff_refs: [] });
  }
  // The model cites payoffs in words (description) or by id, wrapped in objects.
  const resolved = new Set((delta.threads_resolved || []).map(item => {
    if (typeof item === 'string') return item;
    return item?.id || item?.thread || item?.description || '';
  }).filter(Boolean));
  for (const thread of next) {
    if (thread.status === 'open' && (resolved.has(thread.id) || resolved.has(thread.description))
      && !thread.payoff_refs.includes(sceneRef)) {
      thread.status = 'resolved';
      thread.payoff_refs.push(sceneRef);
    }
  }
  return next;
}
