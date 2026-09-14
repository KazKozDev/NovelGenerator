/**
 * Types for the rebuilt pipeline (v2): design first, write once, track state.
 *
 * Shapes mirror the JSON schemas inside prompts/P01_BOOK_DESIGN.md (book design),
 * prompts/P05_STATE_UPDATE.md (per-scene memory delta) and prompts/P06_FORWARD_UPDATE.md
 * (post-chapter plan maintenance). Structured answers are validated against these before
 * anything they claim enters memory: a plan never proves an event happened.
 */

export interface InferredDecision {
  decision: string;
  reason: string;
}

export interface PremiseGiven {
  given: string;
  kind: string;
}

export interface DesignContract {
  /** Short title from P01, in the manuscript language. Books designed before the field existed have none. */
  working_title?: string;
  explicit_requirements: string[];
  premise_givens?: PremiseGiven[];
  /** Names the P01 model judges to be proper names in the premise — code checks coverage, never judges. */
  premise_names?: string[];
  inferred_decisions: InferredDecision[];
  language: string;
  tense: string;
  narrative_perspective: string;
  genre_expectations_selected: string[];
}

export interface DramaticCore {
  distinctive_situation: string;
  central_conflict: string;
  stakes: string;
  why_now: string;
  sources_of_development: string[];
}

export interface StyleContract {
  narrative_distance: string;
  attention: string;
  register: string;
  humor: string;
  emotional_expression: string;
}

export interface CharacterCard {
  id: string;
  name: string;
  story_function: string;
  goal: string;
  motives: string[];
  capabilities: string[];
  limitations: string[];
  relationships: string[];
  behavior: string;
  voice_and_perception: string;
  initial_knowledge: string[];
  initial_beliefs: string[];
}

export interface WorldRule {
  id: string;
  rule: string;
  relevant_consequences: string[];
}

export interface CausalEvent {
  id: string;
  cause: string;
  actor_id: string;
  action_or_event: string;
  consequence: string;
  requires: string[];
  enables: string[];
}

export interface EndingDesign {
  central_resolution: string;
  decisive_action_or_choice: string;
  required_setup: string[];
  intentionally_open_questions: string[];
}

export interface ChapterMapEntry {
  chapter: number;
  function: string;
  main_change: string;
  event_ids: string[];
  dependencies: string[];
  setup_or_payoff: string[];
  pov_id: string | null;
  target_words: number;
}

export interface BookDesign {
  contract: DesignContract;
  dramatic_core: DramaticCore;
  style_contract: StyleContract;
  characters: CharacterCard[];
  world_rules: WorldRule[];
  causal_map: CausalEvent[];
  ending: EndingDesign;
  chapter_map: ChapterMapEntry[];
}

export interface PlanIssue {
  id: string;
  severity: 'blocking' | 'major' | 'optional';
  target_ref: string;
  category: string;
  problem: string;
  evidence_refs: string[];
  consequence_for_writing: string;
  required_decision: string;
  suggested_adjustment: string;
}

export interface PlanReview {
  ready: boolean;
  issues: PlanIssue[];
}

export interface ScenePlan {
  id: string;
  pov_id: string;
  location: string;
  story_time: string;
  participants: string[];
  initial_conditions: string[];
  function: string;
  participant_intentions: { character_id: string; intention: string; reason_now: string }[];
  pressure_or_uncertainty: string;
  development: string;
  required_outcome: string;
  flexible_elements: string[];
  required_fact_refs: string[];
  required_source_refs: string[];
  setup_or_payoff: string[];
  transition_to_next: string;
  target_words: number;
}

export interface ChapterPlan {
  status: 'ready' | 'needs_replan';
  chapter: number;
  function: string;
  starting_situation: string;
  ending_change: string;
  scenes: ScenePlan[];
  forward_dependencies: string[];
  replan_reason: string | null;
}

/**
 * The explicit semantic boundary between two scenes. Unlike StoryState, which
 * is the durable ledger, this is the compact writing contract for what the
 * next scene inherits, must not explain again, and still has to change.
 */
export interface SceneHandoff {
  after_scene_id: string;
  known_to_reader: string[];
  confirmed_changes: string[];
  current_conditions: Record<string, string>;
  open_questions: string[];
  active_intentions: string[];
  previous_outcome: string;
  required_new_outcome: string;
  forbidden_restatements: string[];
}

/** One memory delta from P05: only text-confirmed changes, every record quoted. */
export interface BeliefChange {
  character_id: string;
  previous_belief?: string;
  new_belief?: string;
  evidence_refs?: string[];
}

export interface ExtractedName {
  name: string;
  kind?: string;
  refers_to?: string;
  evidence_refs?: string[];
}

/**
 * A spelling the scene uses for a recorded name, judged a variant by the
 * model — never by code similarity. Code only carries the verdict.
 */
export interface NameVariant {
  used: string;
  recorded: string;
  evidence_refs: string[];
}

export interface StateDelta {
  proper_names: ExtractedName[];
  name_variants: NameVariant[];
  events: { description: string; participants: string[]; evidence_refs: string[] }[];
  state_changes: { entity_id: string; field: string; before: string | null; after: string; evidence_refs: string[] }[];
  knowledge_changes: { character_id: string; learned: string; source: string; evidence_refs: string[] }[];
  belief_changes: BeliefChange[];
  intentions_and_commitments: unknown[];
  reader_disclosures: string[];
  threads_opened: string[];
  /** The model cites payoffs in words (thread description or id), not only ids. */
  threads_resolved: (string | { id?: string; thread?: string; description?: string })[];
  contradictions: { description: string; prior_refs: string[]; scene_refs: string[]; blocks_continuation: boolean }[];
  uncertainties: { question: string; evidence_refs: string[]; relevant_to_next_scene: boolean }[];
  plan_deviations: { planned: string; actual: string; future_dependency_affected: string }[];
}

export interface WorldFact {
  id: string;
  statement: string;
  evidence_refs: string[];
}

export interface StoryEvent {
  id: string;
  description: string;
  participants: string[];
  evidence_refs: string[];
}

/**
 * A proper name on record: canonical spelling, what kind of thing it names,
 * and whom it refers to (a character id, another recorded name, or empty when
 * the scene established it as its own thing). Aliases live on the entry they
 * belong to, so Pax never competes with Paxel but Zarka cannot sneak past
 * Zarko.
 */
export interface ProperName {
  name: string;
  kind: string;
  refers_to: string;
  aliases: string[];
  first_seen: string;
}

/** state.json: facts, events, current conditions, knowledge, beliefs, reader disclosures. */
export interface StoryState {
  facts: WorldFact[];
  events: StoryEvent[];
  conditions: Record<string, string>;
  knowledge: Record<string, string[]>;
  beliefs: Record<string, string[]>;
  reader_disclosures: string[];
  names: ProperName[];
}

export interface ReaderThread {
  id: string;
  description: string;
  status: 'open' | 'resolved';
  setup_refs: string[];
  payoff_refs: string[];
}

/**
 * What the ending still needs, judged after a chapter against the accepted text.
 * `required_setup` in the design says what the book must prepare; this says how
 * much of it is standing, and whether the chapters left can carry the rest.
 */
export interface EndingReadiness {
  established_requirements: string[];
  remaining_requirements: string[];
  capacity_problems: string[];
}

export interface ForwardUpdate {
  chapter_outcome: string;
  consequences_to_carry_forward: string[];
  next_chapter_inputs: {
    starting_situation: string;
    active_intentions: string[];
    necessary_content: string[];
    relevant_fact_refs: string[];
    source_refs_to_retrieve: string[];
  };
  plan_updates: { chapter: number; field: string; old_value: string; new_value: string; reason: string }[];
  ending_readiness: EndingReadiness;
  unresolved_blockers: string[];
}

export type AuditStatus = 'COMPLETE' | 'COMPLETE_WITH_WARNINGS' | 'PARTIAL' | 'FAILED';

export interface FinalReport {
  coverage: { material_examined: string; limitations: string[] };
  findings: {
    category: string;
    severity: string;
    description: string;
    evidence_refs: string[];
    reader_impact: string;
    certainty: string;
  }[];
  central_resolution: { supported: boolean; evidence_refs: string[]; comment: string };
  unresolved_major_promises: string[];
  need_more_evidence: string[];
  summary: string;
  status: AuditStatus;
}

export interface ProjectInput {
  premise: string;
  chapter_count: number;
  genre: string;
  target_total_words: number;
  author_requirements: string;
  story_language: string;
  planning_language: string;
}
