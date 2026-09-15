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
  /** Short title from P01, in the manuscript's own words. */
  working_title: string;
  explicit_requirements: string[];
  premise_givens?: PremiseGiven[];
  /** Names the P01 model judges to be proper names in the premise — code checks coverage, never judges. */
  premise_names?: string[];
  inferred_decisions: InferredDecision[];
  tense: string;
  narrative_perspective: string;
  genre_expectations_selected: string[];
}

/**
 * The book profile (§ step 1): what kind of book this is, declared once at
 * design time and enforced by code ever after.
 *
 * Everything here is either a qualitative authorial decision about this
 * premise — the shape of the pressure curve, which repetitions are deliberate
 * refrains, what a cost is made of — or an ordinal rank. Never an absolute
 * number: a model has no access to the distribution of its own future output,
 * so a declared "dialogue share 0.35" is noise wearing a decimal point. Ranks
 * are what a model judges reliably; code turns a rank into a numeric band
 * through a table it owns (profile.ts), and that table is recalibrated from
 * measured books without touching a single prompt.
 */
export type ProfileRank = 'low' | 'medium' | 'high';

/**
 * How pressure is meant to move across the book. "Rung must rise" is true for
 * a thriller and false for half of everything else: a mystery escalates
 * information rather than threat, a romance oscillates on purpose, literary
 * fiction often descends. Code checks conformance to the declared shape, never
 * monotonicity as such.
 */
export type PressureCurve = 'rising' | 'oscillating' | 'investigative' | 'flat' | 'descending';

/**
 * A repetition the book means. Without this list the tired-phrase ban would
 * destroy exactly what makes a literary refrain work, so a motif declared here
 * is exempt up to its own budget and reported only past it.
 */
export interface DeclaredMotif {
  motif: string;
  allowed_uses: number;
  reason: string;
}

export interface BookProfile {
  pressure_curve: PressureCurve;
  curve_reason: string;
  declared_motifs: DeclaredMotif[];
  /** What paying a price means in this book — material loss, exposure, a discarded theory. */
  cost_kinds: string[];
  /** How much of this book is spoken aloud. */
  dialogue_weight: ProfileRank;
  /** low = deliberately claustrophobic (one house, one pair of eyes); high = a book that travels. */
  staging_variety: ProfileRank;
  /** high = a procedural genre where a repeated method is the form, not a defect. */
  mechanism_reuse: ProfileRank;
  /** True when threads left standing at the end are the design, not a defect. */
  open_ending: boolean;
  /** The distinct ways the central obstacle is met. Spent, one per chapter that meets it. */
  mechanism_ledger: string[];
  /** Genre promises the finished book must keep, in this book's own words. */
  ending_invariants: string[];
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
  /**
   * The book's own budgets, allocated at design time rather than detected later.
   * A repetition you have to detect in prose is a repetition you already paid
   * to write: the mechanism is drawn from the profile's ledger and spent, the
   * cost says what this chapter takes from the protagonist, and the rung places
   * the chapter on the declared pressure curve.
   *
   * An empty string and a null rung mean the design declined to allocate, which
   * is a finding the review raises — not a field that may be absent. Absence and
   * refusal are different facts, and only one of them can be argued with.
   */
  mechanism: string;
  cost: string;
  pressure_rung: number | null;
}

export interface BookDesign {
  contract: DesignContract;
  profile: BookProfile;
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
  /**
   * The class of change this scene's outcome produces — position, possession,
   * knowledge, commitment, relation, exposure. Not the outcome itself: the
   * class, so code can see five scenes in a row producing the same kind of
   * change, which is what iteration looks like from above. Empty when the plan
   * declined to name one, which the gate reports.
   */
  outcome_kind: string;
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
  /** How this chapter meets the obstacle, drawn from the profile's ledger. */
  mechanism: string;
  /** What the chapter takes from the protagonist. A chapter that costs nothing is a chapter that repeats. */
  cost: string;
  /** Where the chapter sits on the declared pressure curve; null when the plan took none. */
  pressure_rung: number | null;
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
 * belong to, so a diminutive never competes with the full form while a
 * near-identical spelling cannot sneak past the name it resembles.
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
}
