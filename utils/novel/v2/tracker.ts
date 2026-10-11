import { renderPrompt, systemContract } from '../prompts';
import { contentWords, extractPremiseNames } from '../analytics';
import { structuredResponse, type NovelLLM } from './llm';
import { isRelationKey, relationChangeRefused } from './relationships';
import { matchKey, stringList } from './normalize';
import { describeStateDigest } from './stateDigest';
import type { ExtractedName, ProperName, ReaderThread, StateDelta, StoryState, WorldFact } from './types';

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
  priorState: StoryState;
  scenePlan: unknown;
  sceneProse: string;
  sourceExcerpts: string[];
  /** The promises still standing, so a payoff can be cited by id instead of guessed at. */
  openThreads: ReaderThread[];
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
  'contradictions', 'uncertainties', 'plan_deviations', 'restaged_beats', 'established_facts'];

/**
 * Facts one scene may put on the shelf. The shelf is the one part of memory
 * every call receives whole, which is what makes it worth having and what makes
 * it expensive: an editor that records everything it reads as a fact would turn
 * it back into the log it exists to outlast.
 */
export const MAX_FACTS_PER_SCENE = 10;

/**
 * The one list an extraction cannot leave out. A scene with no events on record
 * is a claim about the scene, and it has to be made rather than inferred from a
 * missing key.
 *
 * Every other list may be absent. The format asks for thirteen of them and most
 * scenes fill four; a model that drops an empty one has said the same thing as a
 * model that writes `[]`, and refusing the whole answer over it ended a book
 * hours into a run for a list that held nothing. An absent list is read as
 * empty and named in `omitted_lists`, so the run log can tell an editor that
 * skips keys from one that had nothing to report.
 */
const REQUIRED_DELTA_KEYS = ['events'];

const DELTA_SCHEMA = {
  type: 'object',
  required: DELTA_KEYS,
  // Named, not typed. Gemini refuses an array with no item schema, and these
  // lists are too various to give one: typed as arrays, every extraction sent
  // to a Gemini editor was rejected before it was read.
  properties: Object.fromEntries(DELTA_KEYS.map(key => [key, {}])),
  additionalProperties: true,
};

/**
 * Lowercased, possessives folded anywhere in the span, so a name and its
 * possessive are one key — inside a multi-word span as well as alone.
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
    // not an exact hit registers as its own entry. Whether a near-identical
    // spelling is drift or a second thing is meaning — judged by the model in
    // name_variants, never by code similarity. No guessing per book.
    names.push({ name: raw, kind: typeof item?.kind === 'string' ? item.kind.trim() : '', refers_to: typeof item?.refers_to === 'string' ? item.refers_to.trim() : '', aliases: [], first_seen: sceneRef });
    variants.set(key, names[names.length - 1]);
  }
  return { names };
}

export function validateDelta(raw: unknown, paragraphIds: string[] = []): StateDelta {
  if (!raw || typeof raw !== 'object') throw new Error('State delta is not an object.');
  const delta = { ...(raw as Record<string, unknown>) };
  const omitted: string[] = [];
  for (const key of DELTA_KEYS) {
    if (Array.isArray(delta[key])) continue;
    // Absent is empty; present and not a list is a malformed answer, and
    // guessing what it meant would put a guess into memory.
    if (delta[key] !== undefined && delta[key] !== null) throw new Error(`State delta carries "${key}" as something other than a list.`);
    if (REQUIRED_DELTA_KEYS.includes(key)) throw new Error(`State delta is missing "${key}".`);
    delta[key] = [];
    omitted.push(key);
  }
  if (omitted.length) delta.omitted_lists = omitted;
  for (const event of (delta.events as { evidence_refs?: unknown }[])) {
    if (!Array.isArray(event?.evidence_refs) || !event.evidence_refs.length) {
      throw new Error('An extracted event has no evidence.');
    }
  }
  if (paragraphIds.length) {
    const known = new Set(paragraphIds);
    const dangling: string[] = [];
    for (const group of [delta.events, delta.state_changes, delta.knowledge_changes, delta.name_variants, delta.restaged_beats, delta.established_facts] as { evidence_refs?: unknown }[][]) {
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
  return delta as unknown as StateDelta;
}

export async function trackScene(input: TrackInput, llm: NovelLLM): Promise<StateDelta> {
  const system = systemContract();
  const paragraphs = paragraphsWithIds(input.sceneProse);
  const ids = paragraphs.map(p => p.id);
  const numbered = paragraphs.map(p => `[${p.id}] ${p.text}`).join('\n\n');
  // The registry travels into extraction: only the model, reading both the
  // prose and the recorded spellings, may judge a variant. Code never does.
  const recorded = storyNames(input.priorState);
  const base = {
    // The names travel once, below, in the form the extraction reads them in.
    prior_state: describeStateDigest({ ...input.priorState, names: [] }),
    open_threads: input.openThreads.length
      ? input.openThreads.map(thread => `${thread.id} — ${thread.description}`).join('\n')
      : '(no promise is outstanding)',
    recorded_names: recorded.length
      ? recorded.map(entry => `${entry.name}${entry.aliases.length ? ` (also: ${entry.aliases.join(', ')})` : ''} — ${entry.kind || 'unnamed kind'}, first seen ${entry.first_seen}`).join('\n')
      : '(no named entities recorded yet)',
    scene_plan: typeof input.scenePlan === 'string' ? input.scenePlan : JSON.stringify(input.scenePlan),
    scene_text_with_paragraph_ids: numbered,
    source_excerpts: JSON.stringify(input.sourceExcerpts),
  };
  const read = async (extra: string): Promise<StateDelta> => {
    // The model is asked for every list; the answer is accepted with the one it
    // cannot do without. validateDelta reads the rest as empty and says which.
    const raw = await structuredResponse(renderPrompt('P05_STATE_UPDATE', base) + extra, system, llm,
      // Room to answer in: a thorough editor returns about two and a half times
      // the scene in JSON — 13KB for a 5KB scene on a live run — and at 8192
      // tokens the third scene of that run, a long one, was cut off mid-object
      // and took the book with it.
      REQUIRED_DELTA_KEYS, parsed => parsed, { temperature: 0.1, maxTokens: 16384, route: 'validator', schema: DELTA_SCHEMA, stage: 'track' });
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
  // Prose, not a premise: a name must earn its capital somewhere a capital is
  // not compulsory, or the registry fills with sentence openers.
  for (const name of extractPremiseNames(prose, true)) {
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
    { temperature: 0.1, maxTokens: 8192, route: 'validator', stage: 'resolve-questions' });
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
  /** Contradictions with confirmed state: the one thing a scene is written again for. */
  blockers: string[];
  /** Spellings of recorded names the scene got wrong, for code to put right in the text. */
  variants: { used: string; recorded: string }[];
  /** Beats staged again, each naming the record it repeats and the paragraphs that stage it. */
  restaged: { beat: string; earlier: string; paragraphs: string[] }[];
  /** Changes memory declined to fold, with the reason. Reported, never silent. */
  refused: string[];
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
  const refused: string[] = [];
  // Particulars onto the shelf that travels whole. An event says a letter was
  // read; the fact says what date it carried — and it was the date, three
  // chapters on, that nothing could see any more. Keyed by scene like events,
  // so a replayed or corrected scene replaces its own facts and doubles none.
  const knownFactIds = new Set(next.facts.map(fact => fact.id));
  const statedFacts = new Set(next.facts.map(fact => matchKey(fact.statement)));
  (delta.established_facts || []).slice(0, MAX_FACTS_PER_SCENE).forEach((fact, index) => {
    const statement = typeof fact?.statement === 'string' ? fact.statement.trim() : '';
    const id = `${sceneRef}-f${index + 1}`;
    if (!statement || knownFactIds.has(id) || statedFacts.has(matchKey(statement))) return;
    knownFactIds.add(id);
    statedFacts.add(matchKey(statement));
    const subject = typeof fact.subject === 'string' ? fact.subject.trim() : '';
    const attribute = typeof fact.attribute === 'string' ? fact.attribute.trim() : '';
    next.facts.push({
      id, statement, evidence_refs: Array.isArray(fact.evidence_refs) ? fact.evidence_refs : [],
      ...(subject ? { subject } : {}), ...(attribute ? { attribute } : {}),
    });
  });
  for (const change of delta.state_changes) {
    // The model sometimes repeats the field inside the entity ("C02.location"
    // + "location"); the key must not stutter.
    const key = change.entity_id === change.field || change.entity_id.endsWith(`.${change.field}`)
      ? change.entity_id
      : `${change.entity_id}.${change.field}`;
    if (isRelationKey(key)) {
      const reason = relationChangeRefused(delta, change);
      if (reason) {
        refused.push(`${sceneRef}: "${key}" was not moved to "${change.after}" because ${reason}.`);
        continue;
      }
    }
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
  // The format asks for strings and an editor that cites everything answers
  // with {disclosure, evidence_refs}. Folded as given, memory held objects on a
  // shelf of strings: no two were ever equal, so the same disclosure was kept
  // again by every scene that restated it, and each reached the writer as a
  // line of JSON.
  for (const disclosure of stringList(delta.reader_disclosures)) {
    if (!next.reader_disclosures.includes(disclosure)) next.reader_disclosures.push(disclosure);
  }
  const blockers = delta.contradictions
    .filter(c => c.blocks_continuation)
    .map(c => c.description);
  // Name variants judged by the model: the scene uses a spelling of a
  // recorded name. Code only carries the verdict, and carries it as what it
  // is — a spelling. It used to buy the scene a full rewrite and a second
  // extraction, the two most expensive calls there are, and on two measured
  // books every one of those rewrites was for an abbreviation or a plural.
  const variants: { used: string; recorded: string }[] = [];
  for (const variant of delta.name_variants || []) {
    const used = typeof variant?.used === 'string' ? variant.used.trim() : '';
    const recorded = typeof variant?.recorded === 'string' ? variant.recorded.trim() : '';
    if (used && recorded && used !== recorded) variants.push({ used, recorded });
  }
  // A beat staged twice. Only a reader of both can say so, and the tracker is
  // the one call that reads the finished scene against the record. The charge
  // has to name what is repeated and where: the ids are checked against the
  // state the scene was written from — a scene cannot be a repetition of
  // itself — and the paragraphs it cites are the only ones that will be touched.
  const recordedIds = new Set([...state.events, ...state.facts].map(item => item.id.toLowerCase()));
  const restaged: { beat: string; earlier: string; paragraphs: string[] }[] = [];
  for (const beat of delta.restaged_beats || []) {
    const what = typeof beat?.beat === 'string' ? beat.beat.trim() : '';
    const earlier = typeof beat?.earlier_ref === 'string' ? beat.earlier_ref.trim() : '';
    const paragraphs = (Array.isArray(beat?.evidence_refs) ? beat.evidence_refs : []).filter(ref => typeof ref === 'string' && ref.trim());
    if (!what) continue;
    if (!recordedIds.has(earlier.toLowerCase())) {
      refused.push(`${sceneRef}: the charge that "${what}" restages an earlier beat was not acted on because it names no recorded event or fact (${earlier || 'no reference given'}).`);
      continue;
    }
    if (!paragraphs.length) {
      refused.push(`${sceneRef}: the charge that "${what}" restages ${earlier} was not acted on because it cites no paragraph of the scene.`);
      continue;
    }
    restaged.push({ beat: what, earlier, paragraphs });
  }
  return { state: next, blockers, refused, variants, restaged };
}

/**
 * Does this citation name that thread? An id match, or enough of the thread's
 * own content words to leave no doubt which promise is meant.
 */
export function citesThread(citation: string, thread: ReaderThread): boolean {
  const cite = matchKey(citation);
  if (!cite) return false;
  if (cite === matchKey(thread.id)) return true;
  if (cite === matchKey(thread.description)) return true;
  const wanted = contentWords(thread.description);
  if (wanted.length < 3) return false;
  const given = new Set(contentWords(citation));
  const shared = wanted.filter(word => given.has(word)).length;
  return shared / wanted.length >= 0.6;
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
  const cited = (delta.threads_resolved || []).map(item => {
    if (typeof item === 'string') return { cite: item, answer: '' };
    return { cite: item?.id || item?.thread || item?.description || '', answer: typeof item?.answer === 'string' ? item.answer.trim() : '' };
  }).filter(item => item.cite);
  for (const thread of next) {
    if (thread.status !== 'open' || thread.payoff_refs.includes(sceneRef)) continue;
    const citation = cited.find(item => citesThread(item.cite, thread));
    if (!citation) continue;
    // A promise the book made in a scene is a question, and it is paid by an
    // answer. A citation that cannot say what the answer was is a mention:
    // "who rang the bell" was closed in a measured book whose text never
    // says. A premise given is paid by being put on the page, and has no
    // answer to state.
    // A payoff cited in the tracker's own sentence has said it; a bare id has not.
    const said = citation.answer || (matchKey(citation.cite) === matchKey(thread.id) ? '' : citation.cite);
    if (!thread.id.toUpperCase().startsWith('PREMISE') && contentWords(said).length < 2) continue;
    thread.status = 'resolved';
    thread.payoff_refs.push(sceneRef);
    if (said) thread.payoff = said;
    continue;
    // By id first, because the model is now shown the ids. Description matching
    // is the fallback, and it is by meaning-bearing words rather than by exact
    // string: a thread's description is a sentence the model wrote several
    // scenes ago, and requiring it back character for character made resolution
    // impossible — every promise a book made stayed open, and nothing could tell
    // a payoff from an abandonment.
  }
  return next;
}

/** One question a fact answers: what it is about, and which property of it. Empty when the fact names neither. */
export function factKey(fact: { subject?: string; attribute?: string }): string {
  const subject = matchKey(String(fact.subject || '')).replace(/^(?:the|a|an) /, '');
  const attribute = matchKey(String(fact.attribute || ''));
  return subject && attribute ? `${subject}\n${attribute}` : '';
}

export interface FactPair {
  /** Position in the delta's established_facts. */
  index: number;
  stated: { subject: string; attribute: string; statement: string; evidence_refs: string[] };
  recorded: WorldFact;
}

/**
 * The facts a scene states about something the record already holds under the
 * same subject and property, in other words. Not clashes yet — "on the second
 * floor" and "second floor, facing the water" are the same answer — only the
 * pairs worth comparing.
 */
export function sameQuestionFacts(state: StoryState, delta: StateDelta): FactPair[] {
  const recorded = new Map<string, WorldFact>();
  for (const fact of state.facts) {
    const key = factKey(fact);
    if (key && !recorded.has(key)) recorded.set(key, fact);
  }
  const pairs: FactPair[] = [];
  (delta.established_facts || []).slice(0, MAX_FACTS_PER_SCENE).forEach((fact, index) => {
    const key = factKey(fact);
    const before = key ? recorded.get(key) : undefined;
    const statement = typeof fact?.statement === 'string' ? fact.statement.trim() : '';
    if (!before || !statement || matchKey(before.statement) === matchKey(statement)) return;
    pairs.push({
      index, recorded: before,
      stated: { subject: String(fact.subject).trim(), attribute: String(fact.attribute).trim(), statement, evidence_refs: Array.isArray(fact.evidence_refs) ? fact.evidence_refs.map(String) : [] },
    });
  });
  return pairs;
}
