/** Author decisions are proposals; enacted state is evidence from prose. */
export type CraftPhase = 'planning' | 'draft' | 'structural-revision' | 'line-edit' | 'copyedit' | 'proofread' | 'complete';
export type SceneLayout = 'classic-three-scenes' | 'flexible';
export type WritingMethod = 'outliner' | 'hybrid' | 'discovery';
export interface OperationRecord {
  status: 'pending' | 'running' | 'committed' | 'failed';
  inputs: Record<string, string>;
  output: string;
  revision?: string;
  attempts: number;
  error?: string;
}
export interface CraftEngineState {
  version: 1;
  contractKey: string;
  phase: CraftPhase;
  operations: Record<string, OperationRecord>;
  revisions: Record<string, string>;
}
export interface BookContract {
  premise: string;
  genre: string;
  requirements: string;
  chapters: number;
  words: number;
  title?: string;
  layout: SceneLayout;
  method: WritingMethod;
  requestedStructure: string;
  mandatory: string[];
  freedom: string[];
  genrePromise: string;
  requiredExperiences: string[];
  seriesContext?: string;
  seriesPlan?: unknown;
  comparableSourceNotes?: string;
}
export interface FormPlan {
  structure: string;
  reason: string;
  method: WritingMethod;
  layout: SceneLayout;
  timelines: { id: string; function: string }[];
  viewpoints: { id: string; person: string; function: string }[];
  sceneSlots: { id: string; chapter: number; order: number; targetWords: number }[];
}
export interface Concept {
  title: string;
  logline: string;
  synopsis: string;
  conflict: string;
  thematicQuestion: string;
  ending: { action: string; cost: string; externalOutcome: string; internalOutcome: string };
}
export interface WorldEvent {
  id: string;
  timeline: string;
  time: string;
  location: string;
  actor: string;
  intention: string;
  action: string;
  prerequisites: string[];
  access: string;
  means: string;
  outcome: string;
  traces: string[];
  dependsOn: string[];
}
export interface StoryTruth {
  events: WorldEvent[];
  rules: { id: string; rule: string; limit: string; cost: string }[];
  places: { id: string; constraints: string[]; dramaticFunction: string }[];
  resources: { id: string; owner: string; available: boolean; description: string }[];
  deliberateUnknowns: { question: string; whyUnresolved: string }[];
}
export interface CharacterEngine {
  id: string;
  name: string;
  role: string;
  arc: 'positive' | 'negative' | 'testing';
  want: string;
  beliefOrCode: string;
  tactics: string[];
  initialBenefit: string;
  escalatingCost: string;
  crucible: string;
  finalChoice: string;
  thematicAnswer: string;
  initialKnowledge: string[];
  voice: { syntax: string; vocabulary: string; directness: string; defense: string; forbiddenTopic: string; examples: string[] };
  perception: { attention: string; blindSpot: string; imagery: string };
}
export interface CharacterPlan { protagonist: string; characters: CharacterEngine[] }
export interface OppositionPlan {
  agent: string;
  worldview: string;
  goal: string;
  resources: string[];
  limits: string[];
  steps: { id: string; event: string; trigger: string; knowledgeRequired: string[]; action: string; consequence: string; possibleFailure: string }[];
}
export interface BeatPlan {
  beats: { id: string; name: string; scene: string; percent: number; eventIds: string[]; choice: string; strategyBefore: string; strategyAfter: string; price: string }[];
}
export interface PromisePlan {
  promises: { id: string; scale: 'macro' | 'meso' | 'micro'; expectation: string; opens: string; progress: { scene: string; change: string }[]; payoff: { scene: string; action: string; consequence: string }; successor: string | null }[];
}
export interface PayoffPlan {
  setups: { id: string; kind: string; name: string; neededFor: string; appearances: { scene: string; role: 'setup' | 'reminder' | 'payoff'; action: string; interpretation: string }[]; changedMeaning: string }[];
}
export interface RevelationPlan {
  facts: { id: string; truth: string; kind?: 'objective' | 'claim' | 'belief'; attributedTo?: string | null; supersededBy?: string | null; initialKnownBy: string[]; acquisitions: { character: string; scene: string; action: string; evidenceEvent: string }[]; readerEvidence: { scene: string; event: string; interpretation: string }[]; reveal: string; mode: 'mystery' | 'suspense' | 'irony' | 'direct' }[];
}
export interface PacingPlan {
  scenes: { scene: string; emotionBefore: string; emotionAfter: string; intensity: number; mode: 'action' | 'reaction' | 'transition'; distance: 'distant' | 'external' | 'close' | 'deep'; timeScale: 'realtime' | 'dilated' | 'summary'; detailFunction: string; syntax: string; ending: 'cliffhanger' | 'quiet-resonance'; targetWords: number }[];
}
export interface SceneNode {
  id: string;
  chapter: number;
  order: number;
  timeline: string;
  pov: string;
  participants: string[];
  events: string[];
  dependsOn: string[];
  causedBy: { scene: string; consequence: string; relation: 'but' | 'therefore' }[];
  goal: string;
  obstacle: string;
  choice: string;
  outcome: string;
  optionsBefore: string[];
  optionsAfter: string[];
  resourceChanges: { resource: string; available: boolean; reason: string }[];
  relationshipChanges: { characters: string[]; change: string }[];
  sceneContract: { action: string; dialogueAims: Record<string, string>; external: string; interpersonal: string; internal: string; startValue: string; endValue: string; polarity: '+ to -' | '- to +'; cost: string; location: string; time: string };
}
export interface SceneGraph { scenes: SceneNode[] }
export interface EnactedScene {
  id: string;
  textRevision: string;
  events: { event: string; quote: string; outcome: string }[];
  acquisitions: { character: string; fact: string; quote: string }[];
  resources: { resource: string; available: boolean; quote: string }[];
  relationships: { characters: string[]; change: string; quote: string }[];
  options: string[];
  summary: string;
  deferred: { kind: string; task: string; quote: string }[];
  deviations: { event: string; difference: string; downstreamImpact: string }[];
}
export interface EnactedState { version: 1; scenes: EnactedScene[]; stale?: boolean }
export interface ReaderDecision {
  decision: 'continue' | 'progress' | 'clarify' | 'conceal' | 'reframe';
  reason: string;
  adjustments: { scene: string; action: string; intendedEffect: string }[];
}
export interface SceneExecution {
  sceneId: string;
  viewpoint: string;
  narrativePerson: string;
  characterEngine: { want: string; beliefOrCode: string; tactics: string[] };
  initialKnowledge: string[];
  availableFacts: { id: string; text: string; kind?: 'objective' | 'claim' | 'belief'; attributedTo?: string | null }[];
  acquireNow: { id: string; action: string; text: string; kind?: 'objective' | 'claim' | 'belief'; attributedTo?: string | null }[];
  current: { goal: string; action: string; obstacle: string; choice: string; outcome: string; cost: string; location: string; time: string; dialogueAims: Record<string, string>; conflict: { external: string; interpersonal: string; internal: string }; valueTurn: { start: string; end: string } };
  profiles: { id: string; name: string; voice: CharacterEngine['voice']; perception?: CharacterEngine['perception'] }[];
  pacing: PacingPlan['scenes'][number];
  directives: string[];
}
export interface AuthorArchitecture {
  contract: BookContract;
  form: FormPlan;
  concept: Concept;
  world: StoryTruth;
  characters: CharacterPlan;
  opposition: OppositionPlan;
  beats: BeatPlan;
  promises: PromisePlan;
  payoffs: PayoffPlan;
  revelations: RevelationPlan;
  pacing: PacingPlan;
  graph: SceneGraph;
}

export interface PropInscription {
  section: string;
  author: string;
  exactText: string;
}

export interface TrackedPropState {
  id: string;
  name: string;
  location: string;
  condition?: string;
  inscriptions?: PropInscription[];
  lastModifiedScene?: string;
}
