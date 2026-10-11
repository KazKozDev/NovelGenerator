# Novel pipeline

The production path is `App → useBookGenerator → utils/novel/v2/orchestrator.ts`.
React renders committed snapshots; it does not calculate memory or sequence model calls.

## Active generation: progressive manifestation beneath theses

Fresh app and CLI books use `generation_mode: 'progressive'` and `v2/theses.ts`.
A coarse synopsis including the ending and chapter skeleton precedes the complete
thesis outline and its whole-plan review. Theses record participants, intentions,
knowledge, time/place, cause, action, resistance, outcome and dependencies. Code
validates IDs, chapter coverage and dependencies, and assigns exact total word budgets from model-proposed relative weights. No scene is written
until the outline passes review. Plan repair continues automatically while independent checks verify resolution of the previous blocking defects; two consecutive rounds without verified progress stop with saved findings. The overall run budget bounds every call.

Each block receives a code-derived event contract without additional model calls:
its first event/disclosures, earlier written events with prose references and review
status, the actual ending of the preceding block, and the next block's reserved
action/outcome. Matching disclosure labels retain their earliest thesis owner.
Plans are not treated as proof that an event occurred. Writers and reviewers use
the contract during writing, expansion, polish, seam repairs and final repairs;
outline review distinguishes first occurrences from responses and consequences.
The paired thesis export shows these ownership boundaries. Existing snapshots
need no new generated fields or migration.

The first manifestation writes short scenes beneath every thesis before expansion
starts. `ROUGH` review checks facts and causality while allowing terse prose. Then
`expand` and `polish` visit blocks with the same thesis and neighboring context.
`manuscriptTools.ts` exposes model-driven JSON tools: `search` (ranked lexical/phrase
paragraph excerpts), `read` (bounded character ranges), `replace` (atomic exact-anchor
replacements), and `finish`. During manifestation `revise_thesis` proposes a causal correction to the current thesis; the editor checks it against the whole outline before saving it. Linked earlier blocks are revisited during polish, within the overall run budget. No embeddings, provider function-calling dependency or
external search service is required. The tool directory contains IDs and sizes;
search/read return only requested excerpts. The writer does not receive all preceding
prose. The final audit still receives the whole manuscript.

Only the active block is writable. Replacements may insert, delete or change text;
missing, ambiguous and stale anchors fail without a partial batch. Patches are saved
immediately in `thesis_draft.edits`, even if the next model call is interrupted.
Expansion repeats while measured scene length increases toward the input budget; two consecutive passes without length progress stop with saved text. Local semantic defects are retained in `deferred` for whole-book causal reconciliation while other blocks advance. Prose reviews check semantic events and causality, not exact wording or illustrative staging. Blocking claims require an actual prose quote and a concrete consequence; style is advisory. Malformed checker assessments are stored as unavailable reviews with `review_failures` history, not treated as successful checks or defects in the manuscript. Unavailable current checks are retried before the final audit; remaining failures and major findings prevent a clean report. Transport failures still propagate. Rough, expanded and polished block snapshots live in
`manifestation.versions`; phase and position support portable resume. All blocks being
present is not completion: manifestation must finish and a final report must exist.

After expansion and before polish, adjacent scene endings and beginnings receive
a dedicated seam review, including across chapter boundaries. The editor receives
bounded boundary prose, adjacent theses and locally retrieved earlier disclosures.
At most two repairs may patch either adjacent block; edits and the seam cursor are
saved immediately for resume. Unresolved or unavailable seam checks are retained
and rechecked before final assessment. Polishing searches the manuscript for
repeated imagery and explanations of feelings, preserving useful motifs and new
emotional developments. The final audit separately records transitions, causality
and repeated-event checks; failed checks cannot produce a clean report.
Major final findings automatically return to the writer for exact local patches while independently reviewed blocking counts decrease after manuscript changes. `final_repair` persists the attempt, pending findings and changed block
IDs. Changed blocks and their neighboring seams are checked again before a new
whole-book audit. Interrupted repairs resume with their saved text; unresolved
blocking findings after two consecutive rounds without reviewed progress stop the run with saved findings; they cannot produce a completed report. Minor advice remains warnings.

The CLI exports paired `thesis-book.md` and prose-only `manuscript.md`; the app shows
theses paired with prose and the current manifestation phase. Explicit `'theses'`
retains one-pass block writing with patch-based repairs. Existing `progressive_draft`
snapshots resume through the old `DEVELOP_*` engine; old designs use `'chapters'`.
Existing projects are not silently migrated. Model acceptance does not prove quality.

## Legacy chapter pipeline: model roles

Two roles, configured independently: the **writer** produces prose, the **editor** plans,
reviews, extracts memory and audits the book. `NovelLLM` carries
`route: 'writer' | 'validator'` and the caller resolves it to the prose or validation
provider. Without an editor the writer judges its own prose, and a model that grades
itself is the configuration this pipeline exists to avoid.

Thinking never reaches the manuscript. `stripThinking` removes a `<think>` block and
refuses a response that ended inside one; a response with no complete JSON object is an
error, never an empty success.

Neither does what a writer says around a scene. `stripApparatus` cuts the lines that stand
alone above or below the prose and speak about the task — "I'll write the opening scene…",
a heading, "Word count: 500", a closing note on what the scene establishes, an offer of
changes — and reports each cut as a chapter warning. It is cut rather than sent back: a
rewrite to remove a sentence outside the scene costs a writing call and returns a different
scene. Only the edges are read. Commentary inside the prose is narration to code and stays
the editor's to judge.

## Prompts are files

The pipeline prompts and the shared system contract live under `prompts/`, one per
file. Application code never hand-builds them: it names a prompt and supplies its
variables through `renderPrompt`, and `fillTemplate` throws on any `{{hole}}` left
unfilled. `promptVariables` reports what a template declares, so a test can hold code and
prompt to the same contract — `tests/prompts.test.ts`.

| Prompt | Stage |
| --- | --- |
| `P01_BOOK_DESIGN` | three short candidate plans, then expansion of each owned level |
| `P01_CONCEPT_SELECT` | explicit comparison of all candidates and selection rationale |
| `P01_INTENTION_SITUATIONS` | three decisive situations and private observation packets |
| `P01_INTENTION_CHOICE` | one person's independent choice from their goals and evidence |
| `P01_INTENTION_RESOLVE` | consequences of the choices meeting and required plan repairs |
| `P02_PLAN_REVIEW` | construction review, and later each scene's readiness |
| `P03_CHAPTER_PLAN` | one chapter, from confirmed memory |
| `P03_SCENE_REBASE` | replan a scene, only when the scene before it left its plan |
| `P04_SCENE_WRITE` | one scene, from a verified package |
| `P05_STATE_UPDATE` | what the written scene changed, against paragraph evidence |
| `P06_FORWARD_UPDATE` | close a chapter: what to correct in it, and what the plan ahead must now be |
| `P07_FINAL_AUDIT` | check the finished book and report |
| `P08_SPAN_REPAIR` | rewrite marked sentences in place: a repeat, or a worn image |
| `P09_BEAT_CONDENSE` | cut down in place the paragraphs that stage a beat again |
| `P10_SPAN_CORRECT` | correct a stated particular in place |
| `P11_BEAT_INSERT` | one short beat between two paragraphs |

## The order of work

The orchestrator owns the order, budgets and record. Planning now crystallizes before
any prose exists:

1. P01 produces three short plans for the whole book. P01_CONCEPT_SELECT compares
   their causal invention, fidelity and reader interest, and selects one.
2. The concept level owns contract, dramatic_core, style_contract and ending.
3. The structure level adds characters, world_rules and causal_map.
4. Before freezing the structure, test three turning points through independent intentions.
   Each involved character receives only their own goals, capabilities, limits, initial
   knowledge and sourced observations. They choose an action and a credible alternative
   without the intended ending, other people's private goals or previous actors' answers.
   A separate resolution call evaluates the action-response chain against the actual world,
   states the cost and changed situation, and identifies unsupported planned outcomes.
   Every decisive voluntary step references an independent choice from that situation.
   Missing choices (including officials absent from the cast) produce repair issues; the
   resolver cannot supply convenient consent or a new institutional remedy.
   Its major findings enter the same bounded repair/escalation cycle; a repaired structure
   is tested again. Missing knowledge sources, hidden-past references, future observations,
   unknown actors and incomplete consequences fail validation. Perceptibility and causal
   implications still require model judgement.
5. The chapter level adds profile and chapter_map using the accepted collision consequences.
   P03 receives the relevant consequences through the chapter's event_ids. Experiments never
   become confirmed facts in story memory.

Every level is reviewed before expansion, for coherence and reader interest and for
whether the distinctive invention survives expansion. Missing future sections are
intentional. Code merges only the current level's sections; a returned copy of an upper
section cannot overwrite it. Each level allows two ordinary repairs. A substantial issue
explicitly targeting an upper section reopens that level once and discards its descendants,
which are regenerated and reviewed. A second reopening of that level fails. New major
findings retain their severity. Remaining major or blocking findings stop planning before
prose; they never become writing requirements. Alternatives, selection rationale and all
review rounds are persisted in design.planning_history. Complete rejected chapter-level
drafts are also saved for diagnosis; an unwritten draft with a failed review cannot
resume directly into prose. P03 still plans the nearest chapter
from confirmed written memory, and P06 still updates the future chapter map.

A clean initial design takes seven basic calls plus a situation call, one isolated choice
call per participant per tested situation, and one consequence-resolution call. Repairs
and reopening add calls within explicit limits. The accepted experiments persist as
intention_collisions; every failed or accepted experiment also stays with its review round
in planning_history. Existing written
books can still resume from their stored state. These checks assess relative novelty and
reader interest; they cannot prove originality across published literature.

Reader-understanding experiments were removed from automatic generation after the
live run. The standalone scripts/check-reader.ts diagnostic and historical metadata
remain for inspection; their findings do not reopen planning layers or feed P03.
A new unwritten plan no longer needs reader_understanding to resume.

**A design is not trusted because it is coherent.** `settleReview` computes `ready` in
code — only an empty blocking/major list passes, never the model's own verdict. Two
charges are appended by code every round, because cast fidelity is not something a
reviewer can be trusted with: a premise name nobody answers to (`premiseNameGaps`) and a
premise given the construction never places (`premiseGivenGaps`). A plan can be perfectly
coherent by simply declining to tell the promised story.

## What kind of book this is

**The design declares a profile, and code enforces it.** P01 returns a `profile` beside
the contract: the shape of the pressure curve (`rising`, `oscillating`, `investigative`,
`flat`, `descending`), the refrains this book means to repeat with a budget for each, what
a cost is made of here, and three ordinal ranks — dialogue weight, staging variety,
mechanism reuse. The division of labour is the point. A model asked for "dialogue share
0.35" invents a decimal it has no access to; a model asked for low/medium/high answers the
question it can actually answer. `profile.ts` owns the table that turns a rank into a
numeric band, so recalibrating the pipeline after twenty finished books is an edit to one
table, not to a prompt, and books already written reproduce exactly.

**One machine, different constants.** The same checks run for every genre; only their
thresholds move. A locked-room horror declares `staging_variety: low` and the
repeated-staging check relaxes to match, because flagging a book for having the form it
declared is the fastest way to teach a reader to ignore the warnings. A procedural
declares `mechanism_reuse: high` and is allowed to repeat its method, which is its genre
rather than its defect. A mystery declares an `investigative` curve and is checked for
accumulating information rather than for climbing threat. Nothing here is a genre table
the repo has to maintain: the model declares, code enforces.

**The budgets are allocated, not detected.** The profile's `mechanism_ledger` holds the
distinct ways this book meets its central obstacle, and each chapter draws one and spends
it. Every chapter also states what it takes from someone and which rung it occupies.
`designBudgetGaps` checks the allocation before a chapter is planned — a ledger too short
for the chapter count, chapters that cost nothing, rungs that do not trace the declared
curve, and an ending requirement no chapter before the last prepares — and the findings go
back through the design review as `major` charges. The structural checks run before the
structure is frozen; chapter allocations are checked before that level passes. Every
ending prerequisite must be placed by the planner in a chapter before the last. The
production path no longer silently distributes missing prerequisites after review.
`placeEndingRequirements` remains a standalone helper for older callers.

## Inside a chapter

**A scene is replanned only when the scene before it left its plan.** A chapter's scenes
are planned together, before any exists, and a scene sometimes does other than its plan:
reaches further, stops short, settles something another way. The tracker has always
recorded that as `plan_deviations`. It used to be read by nothing, while every scene was
replanned before it was written — a prompt the size of a chapter for the whole plan back
again, most of the time with nothing to correct. Nor is any recorded departure a reason:
of thirty recorded over two books most were a writer supplying a date or a detail the plan
had left open, and five said the scene matched its plan. So P05 answers one question per
departure, `next_scene_must_change` — would the next scene, written as planned, now repeat
this one or contradict where it left things — and a scene is replanned on a yes, or when
the scene before it has just reached the outcome this one was planned to reach
(`retellingSuspect`). The replan is told which. Otherwise the scene is written as planned,
and every departure still reaches P06, which brings the plan ahead up to date.

**The chapter is planned by the editor's model.** Everything that went wrong in a chapter
read side by side with its plan was already wrong in the plan — a book closed at the end of
one scene and lying open at the start of the next, a particular left for each scene to
invent — and the writer had carried the plan out step for step. A plan is a few percent of
a chapter's tokens and decides the rest of them, so P03 and the scene replan run on the
`validator` route: it is the one place the stronger model's time is cheapest and worth
most. The book design stays with the writer's model.

**A plan says where each scene starts and stops, and code compares them.** Every scene
carries `state_at_start` and `state_at_end`: who is where, who holds what, the state of an
object that matters, keyed by the person or thing. `seamProblems` compares each scene's
opening with the end of the one before it — the first scene of a chapter with where the
last chapter left things. Whether two entries contradict is asked of the local NLI model
(`readSeams`), each entry put to it as "key: value": shared words say only that two
entries concern the same things, and "shut" and "lying open" concern the same book. On
the seams of three measured runs the model scored every real break 0.98 or more and
every agreeing pair 0.03 or less. A contradiction that says nothing of a change returns
the plan as `scene-seam`. One whose opening says what changed — a movement, a lapse of
time (`statesChange`) — answered the planner's rule, and whether that could have happened
between the scenes is a reading: it goes, as a `seam-change` doubt, into the one review
the editor already gives the chapter. With the model off, seams are judged by word stems
in common (`statesAgree`) and a stated change passes unread. The writer is given both:
what the scene opens with, and what it must close with for the next to open from.

**A point repair is told who narrates.** The four repair prompts (P08–P11) carry the
book's person and tense as a sentence of their own (`narrationRule`), not only inside the
contract's JSON: a sentence rewritten out of its paragraph was coming back in the third
person in a book told in the first. In a first-person book code also keeps the original
sentence when the narrator's "I" is gone from the rewrite's narration.

**Particulars are decided in the plan.** Numbers, dates, rooms and names used to be
supplied by the writer in the moment, scene by scene, which is how a count stated in
chapter one was resolved differently in chapter three. Each scene now lists what it
`establishes`; `factClashes` holds those against the facts on record and against what the
plan's own earlier scenes fix, and returns the plan as `fact-clash` when the same statement
about the same thing carries other numbers. The check is deliberately narrow — two
statements must share most of their words, numbers aside, before their numbers are
compared, so one guest's room is never held against another's. The writer is told to use
the listed particulars as they stand and to fix no others.

**A premise given is assigned to a scene.** The planner is shown what the premise gave and
the book has not yet put on the page, by id, and names in `pays_premise` the scene that
pays each and the action that pays it. The writer is given that action; the tracker says
whether it was done; one that was planned and not done goes to the chapter's closing call,
which can still add a beat for it.

**How many scenes a chapter has is counted, not left to the plan.** Across thirty measured
scenes the writer wrote eleven to fifteen hundred words whatever length was asked, so every
book ran 40% to 90% over by exactly its surplus of scenes. `scenesFor` gives the number of
scenes whose natural length (`wordsPerScene`: the book's own median once it has three, 1250
before) comes nearest the chapter's; a plan with more is returned as `too-many-scenes`, and
the chapter's length is shared among its scenes in code rather than set by the planner.

**The plan is checked before it is written, and rejected cheaply.** `checkChapterPlan`
reads the plan against the design's allocation and the craft ledger, with no model call:
a mechanism already spent to its allowance, a chapter that declares no cost, a missing
rung or one that breaks the declared curve, scenes that repeat a staging past this book's
tolerance, four scenes running on one class of outcome, and an ending whose remaining
requirements outnumber the chapters left to prepare them.

Promises age here too. The thread ledger records what the book has promised and, since a
payoff can be cited by id, what it has kept — but recording was never the problem. The
planner was shown the open list and nothing obliged it to act, so a promise made on the page
in so many words ("I will return in three days with the terms in writing") could be recorded,
displayed, ignored, and recorded again as still open for the whole length of a book, three
books running. A thread standing through two further chapters untouched is now raised, and
blocked once the chapters left to keep it in have run out.

A blocking finding sends the plan back with evidence. If a repair returns the same concrete blocking findings without reducing their count,
or the bounded attempts run out, the chapter stops before prose. Sharing a finding
category while fixing other findings is progress and can use the remaining repair attempt.
Advisories can travel as warnings, but a failed chapter plan is never passed to the writer.

**`needs_replan` is not argued with.** The gate refusing a plan and the planner refusing
the chapter map are different failures. The first is answered with a better plan; the
second is the planner's own judgement about the book, and it ends the chapter.

**The plan is made from confirmed memory, not from the design alone.** `planChapter`
receives the current state, the previous chapter's own tail (600 characters of real
prose, which survives reload), the open threads, the ending's required setup and the word
budget still ahead. A plan that cannot be written returns `needs_replan` and stops the
chapter rather than writing against it.

**The ending's requirements shrink as the book establishes them.** After each chapter P06
reports which of the design's `required_setup` items the accepted text has established,
which still stand, and whether the chapters left can carry them. That reading is persisted
(`ending_readiness`) and the next chapter is planned against what remains, not against the
full list; a capacity problem — three preparations, two chapters — is raised as a warning
while there is still budget to spend on it, instead of surfacing in the final audit.
The requirements are shown to P06 under ids (E1, E2, …) and retired by id, or by a
wording that keeps most of the requirement's own words: compared as exact strings, a
reading that found all seven established retired none, and the last chapter was planned
against an ending already paid for. What one chapter's reading retired stays retired.

**The design decides what the chapters would otherwise invent.** Two things were being
made up scene by scene and came out different each time. The past the story uncovers:
it stands at the head of `causal_map` as events marked `before_story`, stated as fact,
and a design that leaves it as "someone" or "a specific event" is returned in code
(`past-undecided`). The planner reveals parts of those events and supplies no other
account. And the world's particulars — the layout of the place, the period and its
money, each person's trade: they are `world_rules` with a `subject` and an `attribute`,
a design with fewer than eight is returned (`particulars-unfixed`), and they include what
each document or object the story turns on says or holds, and they are on the
facts shelf before the first scene (`seedParticulars`).

**A fact answers a question, and only facts answering the same one are compared.** Every
fact carries what it is about and which property of it it fixes. The tracker is told to
record what is so — a floor, a material, a trade, a town, an hour — rather than what
happened, up to ten a scene, under the subject and attribute the record already uses.
The writer is given every fact about anything its scene plan names. When a scene states
a fact under a key the shelf already holds, the pair is read by the local NLI model, both
ways round (`readFactClashes`); a contradiction is the paragraphs that state it, and they
are corrected in place to what the book holds (P10) while the scene's version stays off
the shelf. Facts are not compared as bare sentences: the model called 47 of 66 unrelated
pairs of a measured book's facts contradictory.

**Planning calls are given time to think.** Candidate generation, selection, level
expansion and reviews, the close of each chapter and the final audit carry `deliberate`;
planning runs on the editor's model. Everything else runs with thinking off. A promise is
closed only with the answer the text gave (`payoff`): a citation that cannot state one is
a mention, and the promise stays open.

**Code brings doubts, and settles the ones it can.** Before prose exists,
`buildSceneContext` raises structural problems by name — `pov-absent`, `empty-task`,
`location-mismatch`, `missing-fact`, `missing-source`, `repeated-staging`, `static-outcome`,
`unknown-participant`, `restaging-suspect` — and the local semantic gate adds two more
kinds of evidence. Every one of them used to go to a P02 review, a scene at a time: meant
to be rare, it ran before eight scenes of nine and was the most expensive stage of a
measured run. Most doubts have one right answer whoever reads them. A character recorded
in the corridor in a scene set in the lobby is an instruction to show the walk, so
`writerRequirement` puts it in the writer's package as it stands. Two are about meaning
and still go to the editor — a participant who is no cast member, a scene with no task —
and those are asked about once for the whole chapter (`readPlanDoubts`), before its first
scene; a scene replanned afterwards is read again on its own.

**Weights are served, not downloaded.** A browser cannot read `node_modules` — it has no
filesystem, only a sandbox keyed to the page's origin — so transformers.js there fetches
weights over the network and caches them in Cache Storage, while the same library in Node
writes plain files into its own package directory. Two caches, because two runtimes, and
warming one does nothing for the other. `scripts/warm-models.ts` loads all three models once
in Node and copies what lands in the package cache under `public/models/`, which Vite serves;
`modelSource.ts` sets `allowLocalModels` and `localModelPath` so the page loads about 780MB from
localhost instead of from Hugging Face. Remote stays allowed, so a checkout without the local
copy still works — slower, not broken. `public/models/` is git-ignored: a repository is not a
CDN. The onnxruntime WASM itself still comes from a CDN; only the model weights are staged.

**The local models run outside the browser too.** The reranker, the embedder and the NLI
head all fall back to loading transformers.js in-process when there is no worker, so the only
thing that kept a terminal run on string checks alone was having nowhere to record the
choice: the mode was read from browser storage, and a script has none. `setGateModeOverride`
supplies one, and `run-book.ts` takes `--gate off|light|full`. It stays off by default there,
because nobody in a script can consent to a 600MB download.

**The semantic pre-write gate is advisory, local, and not optional.** A cross-encoder scores
each planned scene against finished paragraphs (paraphrase restaging) and an NLI head scores
the scene's claims against confirmed state (plan-vs-memory clashes). There is no setting in
the application and no flag on the runner. There used to be three modes; the middle one ran a
small embedder, wrote "paraphrase restaging" into the run log, and let a scene be retold
nearly beat for beat from one chapter to the next — a check that reports coverage it does not
have is a check that stops anyone looking. `off` survives it only as a runtime fact, for the
places with nowhere to record a choice and nobody to consent to 780MB: a test suite, which
must never reach for the network, and any script that has not called `setGateModeOverride`.
A stored value from when the switch existed is ignored, so nobody is quietly held below the
full check for every book they write afterwards.

**A scene is written once, from its own package.** The writer gets the scene, the
previous scene's tail and one short excerpt per earlier scene — not the book's outline.

**Every scene is folded into memory before the next one is written.** `trackScene` reads
the scene with numbered paragraph ids and returns proper names, events, state changes,
knowledge, beliefs, disclosures, threads, contradictions and uncertainties. Each record
cites paragraph ids, and `validateDelta` rejects a citation that points nowhere — with
one correction pass that names the dangling refs, so the retry answers a concrete
question. Only `events` is a list the answer cannot leave out: any other list that is
absent is read as empty and named in the run log, because a model that drops an empty key
has said what a model writing `[]` says, and refusing the whole answer over it ended books. P05 states what a ref is; code enforcing a rule the prompt never stated is how
a run dies citing a scene id it had every reason to think was valid.

**Every accepted scene also emits a persisted semantic handoff.** It names what the
reader already knows, what just changed, current conditions, still-open questions,
active intentions, the previous outcome, the next required outcome, and meanings that
must not be explained again. It is stored whole and read in views: `plannerHandoff` for a
call that also receives the state digest carries only what the digest does not, and
`writerHandoff` carries where the last scene left things, what is open, the newest dozen
things not to explain again, and the conditions of the people in the scene — not the
forty-five things the reader knows and the ninety changes the last scene made, which were
the largest single part of a writer's prompt. The last scene's handoff is enriched by P06
and becomes the next chapter's input.

**The handoff carries the recent stretch, not the book.** It is a writing contract, and
it was built like the ledger: every event and disclosure since page one, twice — once as
what the reader knows and once, accumulated, as what must not be restated. Measured on a
finished four-chapter book it grew about 4KB a scene, to 70KB and 237 prohibitions by the
sixteenth, in front of the chapter plan, the rebase and the scene itself. A local model's
window fills long before a long book ends, and Ollama drops the *start* of a prompt that
does not fit — the task and the scene plan — leaving the writer the tail of the previous
scene and nothing to do but write it again. Facts travel whole; events and disclosures are
the same recent stretch `stateDigest` gives every other call; restatements and open
questions keep their newest twenty-four (`HANDOFF_LIMITS`, judgements, not measurements);
and a trimmed handoff says so in `history_note`. The full record stays in the store, where
retrieval and the cross-encoder read it. `compactHandoff` brings a handoff stored before
the limits inside them when a book resumes.

**A relationship is current state, not a fixed card.** Character cards hold who two
people were to each other when the book was designed; what they are to each other now
lives in `conditions` under a directed key (`C01->C02.trust`), in words, and travels into
the writer's package ahead of the card. P05 records such a move only from a deed the scene
showed, with the paragraph cited — a character declaring trust is a belief, and memory
keeps it as one. A relationship change that cites nothing, or that no deed in the scene
supports, is not folded: it comes back as a `refused` note, warned on the chapter and
written to the run log, so an interpretation of the scene never becomes a fact about the
world by default.

**Repetition is measured by shape, not only by phrase.** Every accepted scene leaves a
staging — who was present, where, through whose eyes — and `recentShapes` hands the last
six to the chapter planner so a chapter is planned against what the book just did. The
same measurement runs before each scene: a third consecutive scene in the same staging, or
a staging owning half the recent window, becomes a `repeated-staging` doubt for the
readiness review. Nothing is banned and no word list grows; code says the shape repeats and
the model decides whether that is stalling or the point.

**A callback travels as the paragraph it calls back to.** A scene plan's
`required_source_refs` name earlier text by paragraph (`CH02_S01#p3`) or by the id of a
recorded fact or event, and `resolveSourceRefs` hands the writer those paragraphs verbatim
under their references — the chapter tails follow as continuity of voice, not of fact. A
reference no stored paragraph answers becomes a `missing-source` doubt for the readiness
review: either the callback rests on nothing written, or the reference is wrong, and both
are decided before the scene leans on it.

**A finished scene is read against what already happened, not only against its plan.**
Every check before prose reads the plan, and a writer handed a sound plan can still write
the scene the book already has — the same confrontation, the same discovery, in sentences
that share no word run with the first. P05 is the one call that reads the finished scene
against the record, so it also reports `restaged_beats`: a beat staged again, with the id
of the recorded event or fact it repeats. A charge that names nothing on record is not
acted on and comes back as a `refused` note. One that does is repaired at its own size: the
paragraphs it cites are rewritten by `condenseRestaged` (P09) to at most a sentence that
leans on the earlier event and keeps whatever else they carried, and put back by paragraph
id — one for one, so every other record of the scene still points where it pointed. A
rewrite that is not clearly shorter, or leaves a quotation open, is not applied. Memory is
corrected by the same subtraction: an event whose only evidence was a condensed paragraph
is dropped from the delta, and the scene is neither written nor read again.

**A contradiction the model marks `blocks_continuation` buys one rewrite, not a dead
book.** The writer sees exactly what broke and rewrites against it. A second consecutive
break does not end the book either: the rewritten scene is kept and the objection travels
as a warning. This prose repair policy is separate from planning: unresolved blocking
plan defects now stop before writing.
The verdict is an editor model's judgement, and on two live runs every objection that
survived its rewrite was the same false one — an abbreviation read as a misspelt name. The
same holds for two calls nothing depends on: a readiness review that could not be had (the
scene is written with its doubts unanswered) and a forward reconciliation that failed after
its chapter was saved (the next chapter is planned against the map as it stood). A planner
that refuses the chapter map and a scene nothing could be extracted from still stop the
run.

**A misspelt name is a spelling.** The model, reading both the prose and the registry,
judges whether a near-identical spelling is drift; code never decides by string similarity.
What code does with the verdict used to be a full rewrite of the scene and a second
extraction, and on two measured books every one of those was for an abbreviation or a
plural. `alignSpellings` now replaces the used spelling with the recorded one, whole words
only, and P05 is told that an abbreviation, a plural and a form of address are the name
itself.

**Open questions travel in the handoff.** P05 is asked to answer from the scene what the
scene answers and to list as an uncertainty only what the next scene needs and the text
does not give. Those go into the handoff as questions. There was a second call after every
scene to settle them; with an editor that left four to seven a scene it ran every time, and
what it settled is what the facts shelf now records in the first place.

**Particulars go on a shelf that travels whole.** Memory shows a call the recent stretch
of events and disclosures, and with an editor that records two dozen events a scene that
stretch is shorter than one scene: a count stated in chapter one was out of every call's
sight by chapter three, and the book resolved it differently. P05 therefore also returns
`established_facts` — a number, a date, who did what, where a thing is kept — at most four
a scene, folded onto `facts`, which every digest carries entire. The writer's handoff
carries only the newest twenty-four: it is not checking anything against the shelf, and
gets the facts its scene cites separately. P05 is told as well how much
to record: an event is something after which the story stands differently, a disclosure is
one sentence and not a passage copied out, because every record that did not need making
pushes one that did out of view.

**What the premise gave is a promise from page one.** Every premise given that is not a
person is entered in the thread ledger before the first scene (`PREMISE-tN`). The design
was always checked for giving each one a home in the construction; nothing checked that it
reached the page. As threads they are shown to the planner, aged by the plan gate, and
marked paid by the tracker when a scene puts them in front of the reader.

**A chapter is corrected while nothing after it exists.** The final audit reports and has
never rewritten, because a scene changed after the scenes that follow it were written
leaves them standing on something that is gone. The end of a chapter is the one moment
that is not true: the next chapter is planned from memory, and memory can be rebuilt first.
The call that closes the chapter (P06) reads its text once — against the facts shelf, the
causal map, the ending and the scenes' own `plan_deviations` — and answers both things
that reading can answer: what in the chapter can still be corrected, and what the plan
ahead must now be. They were two calls over the same text. `repairChapter` makes the two
kinds of repair it proposes, both splices. `align` replaces sentences that state a
particular the book does not hold (P10); `insert` adds one beat of at most 150 words
between two paragraphs (P11). Every charge has
to point: a quotation the scene does not contain is discarded, a paragraph that is not
there is refused, three repairs a chapter at most. A corrected scene is read by the tracker
again, against the state it was written from, when the correction touched a paragraph some
record of the scene cites or added a beat (`touchesMemory`); a correction memory then
refuses is taken back out. When no record cited what changed, memory held nothing drawn
from it, and the scene is not read again. Kept corrections rebuild the chapter's memory and handoffs from its
starting state, and the scene as first accepted stays on the record as `original_prose`.
A check that fails is a warning and the chapter stands. Of three measured books, the one
written with this was the only one whose audit found no contradiction of fact.

**The plan ahead is reconciled with what the chapter recorded.** P06 used to judge a
chapter from the recent stretch of the whole book's events. It now receives the chapter's
own events and facts and every departure its scenes made from their plans — extracted by
P05 since the beginning and, until now, read by nothing.

**Scenes are joined in code**, separated by `***`. No model stitches a chapter together.

**After the chapter, the plan ahead is reconciled with what was written.** P06 returns
plan updates for the chapters that follow; accepted prose outranks the old plan, and only
affected chapters change. Skipped updates and unresolved blockers become chapter warnings.

### What a chapter actually costs

Every structured call declares its route explicitly, or takes the default `structuredResponse`
falls back to (`'validator'`); `writeSceneV2` is the one call that bypasses that wrapper —
it wants raw prose, not JSON — so it declares its own route too, the same way. Nothing in
the pipeline reaches a model without one of the two roles named at the call site.

| Call | Route | When | Per chapter |
| --- | --- | --- | --- |
| Chapter plan (P03) | validator | Once, unless a saved plan is reused on resume; up to twice more if the plan gate rejects it before prose | 1–3 |
| Scene replan (P03_SCENE_REBASE) | validator | Only when the scene before it departed from its plan or reached this scene's outcome | 0–1 per scene |
| Scene readiness (P02) | validator | Only for a participant outside the cast or a scene with no task; one review for the chapter | 0–1 |
| Write the scene (P04) | writer | Every scene; one retry only if the answer is empty or came back as JSON instead of prose | 1 per scene |
| Track the scene (P05) | validator | Every scene, against the prose just written; one correction pass if a citation points nowhere | 1 per scene |
| Sentence rewrite (P08) | writer | Only when the scene repeats earlier prose or carries a spent image; carries those sentences, not the scene | 0–1 per scene |
| Beat condense (P09) | writer | Only when the tracker cites paragraphs that stage a recorded event again | 0–1 per scene |
| Speech rewrite (P04) | writer | Only when a peopled scene comes back under its floor | 0–1 per scene |
| Rewrite on contradiction | writer + validator | Only when the tracked delta contradicts confirmed state — one full redraft, not a repair | 0–1 pair per scene |
| Correct, insert (P10, P11) | writer + validator | Only for what the closing call proposed; a scene is tracked again only when memory cited what changed | 0–3 |
| Chapter close (P06) | validator | Once, after the last scene: corrections for the chapter and the plan ahead | 1 |

A chapter of four scenes with no contradictions, nothing to correct and a repeat to reword
in half its scenes lands at 1 + 4×(1 + 1 + 0.5) + 1 = 12 calls. The writer sees P03, P04 and
the small repairs; every other call is the editor reading what already exists and reporting
on it, never generating the manuscript itself — a large model earns its cost by judging,
not by drafting.

**A run says where its calls went.** Every call carries a `stage` label, the orchestrator
tallies calls and characters sent and received by stage, and the run log ends with the
table and the totals beside the size of the manuscript. Two measured books sent forty-five
and sixty-seven times the text they wrote, and nothing could say which stage sent it.

## The craft ledger

`StoryState` is the ledger of the world — what happened, who knows it, where everyone
stands. `ledger.ts` is the ledger of the form: which mechanisms are spent, which rungs are
taken, which classes of change the scenes keep producing, which phrasing is worn through,
and how the measured texture is drifting from what the book declared. It is written by
code at scene acceptance, never by a model and never from a plan.

**The ban list is enumerated, not advised.** `wornLedger` reads the whole accepted
manuscript rather than a window — a tic that started in chapter two is exactly the one
nobody can see by chapter seven — subtracts the profile's declared refrains up to their
budgets, and hands the writer exact strings it may not write. A model told to vary its
language varies nothing; a model handed fourteen exact strings does not write them. A
declaration buys permission, not immunity: past its budget a refrain is counted again.

**Declared against measured is itself a signal.** `textureDrift` compares the book's
measured dialogue share against the band its declared weight resolves to, and reports it
per chapter rather than at the final audit. A book that declared itself dialogue-forward
and is writing four percent dialogue has not been written badly; it has failed to execute
its own intent, which is a different problem with a different fix. Alongside it,
`signatureTics` reports what a reviewer reading for events structurally cannot see — the
"it was not X, it was Y" construction at a rate, sentences that all open on one word,
prose running at a single speed — and `numericContradictions` catches a town founded in
one year on page one and another on page thirty, which no state tracker sees because the
number was never an event.

**Speech is decided when a scene is cast, and measured when it is written.** On a measured
book the scenes holding one person ran at 0% speech each and the ones holding two from 14%
to 43%: a scene with nobody to speak to is narrated whatever the writer is asked for. So
the plan gate counts peopled scenes against the declared weight (`solitary-chapter`,
blocking: half the scenes of a medium book, two thirds of a high one, none of a low one; a
single-scene chapter is left alone), and a written scene with two people in it that comes
back under the floor of its band is written once more with the measured number in the
request and measured again. The draft with more said in it is kept. These bands are
judgements, like the rest of `profile.ts`.

**An image is named by the editor and counted by code.** The phrase ledger counts word
runs, and a writer returning to one picture never uses the same run twice. The chapter
check names such an image and the plain words that mark it; `images.ts` counts the
sentences carrying at least two of them across the whole accepted text. Past its allowance
— a declared refrain's own budget, the phrase tolerance otherwise — the image joins the
writer's ban list with its number, every later draft is searched for it before tracking,
and the sentences that carry it are rewritten without it and counted again. That rewrite
travels in the same call as the scene's duplicated sentences (P08) — one small rewrite a
scene, whatever it is for — and a chapter's overuse is trimmed in one call for the
chapter. A rewrite that still carries the image is not spliced.

**The manuscript is written in English.** The system contract says so, no call carries a
language parameter, and the prose checks are built for one typography: English stop words,
English quotation marks, the "it was not X, it was Y" construction. That is a deliberate
narrowing — a check that has to hedge about which convention it is reading is a check
nobody trusts.

## Which numbers are measured and which are judgements

The pipeline decides things with thresholds, and they are not all worth the same.

**Measured.** The cross-encoder's repetition line (4.5) was fitted over 525 cross-chapter
pairs from finished runs, and the run length that counts a word sequence as duplicated (8)
was fitted the same way: two books from the same writer, different stories, share 140 runs
of four words, 40 of five, 12 of six, 7 of seven, 3 of eight — the four-to-six band is idiom
and chance, and at eight the hits are the premise's own nouns or the model's own habit.

**Judgements.** Every band in `profile.ts` — dialogue share per rank, staging tolerance,
mechanism reuse — and every rate in `signatureTics`. They are labelled as such in the code
rather than left to look like the measured ones. They cannot honestly be fitted on this
pipeline's own output: a corpus of books it generated would calibrate the checks to the
habits they exist to catch. Fitting them needs published prose of each kind, or generated
books a person has marked good and bad.

**Neither.** Where a signal can be had without a threshold at all, it is preferred.
`textureDrift` reports the dialogue share of each chapter and says when every chapter gives
less to speech than the one before — that needs only the book's own numbers, and it caught a
run falling 7.4% to 5.2% to 3.8% while the band said the same thing three times over.

## Repair is a sentence, not a scene

When a scene turns out to repeat prose the book already wrote, the expensive answer is to
write the scene again: a full writing call, a full tracking call, and a different scene
whose delta, handoff and tail differ from the one the following scenes were planned
against. One repetition becomes a cascade.

Two detectors feed it, and they see different things. `repeatedSpans` returns exact word
runs and costs nothing. `retoldParagraphs` puts the cross-encoder — the same model and the
same fitted threshold the pre-write gate uses on scene plans — over this scene's paragraphs
against the accepted book, and catches the paragraph retold in fresh words, which no string
match reaches. It runs only when the local models are switched on, and with them off the
repair is exactly what it was. `duplicatedSentences` maps every hit to the sentences holding
it, and only those sentences travel to P08 and come back. The result is spliced
by exact string replacement, so a replacement that does not apply cleanly does not apply
at all — the scene is never left in a state nobody chose. The rule that makes this safe is
in the prompt and in the shape of the call: a replacement carries the same information as
the sentence it replaces. Nothing happens that did not happen, so the repair runs before
the scene is ever tracked and memory is untouched. A failed repair leaves a repetition in
the book, which is a blemish; a half-applied one leaves a scene nobody wrote.

Full scene rewriting stays where it was: a tracked delta that contradicts confirmed state.

## Memory and evidence

`StoryState` holds facts, events, conditions, per-character knowledge and beliefs, reader
disclosures and the name registry. Conditions are keyed `entity.field`; events are keyed
by scene so a replayed scene cannot double them. Character names enter the registry from
the design before any prose exists, so the first scene's writer already sees the canonical
spellings.

The audit reads the whole manuscript against the contract, the dramatic core, the causal
map and the ending, plus final state and threads. One finding is measured rather than
asked: `wornPhrases` counts two- and three-word content phrases across the finished book
and reports the ones that return at a rate. A reviewer reading for what happens cannot see
a tic — one somatic beat seven times is not an event — and capitalized spans are
skipped, because a book repeating its own device by name is repeating its subject. It never rewrites: the manuscript it
checked is the manuscript that ships. `settleAuditStatus` computes the status in code —
findings mean `COMPLETE_WITH_WARNINGS`, an unfinished book means `PARTIAL`. An audit that
fails does not fail the book: the chapters are written, the run ends with a warning that
the manuscript was not checked as a whole.

## Budgets, retries, failure

Every model call passes through `counted`: calls, elapsed time and estimated tokens
(characters/4, since providers report no usage) against `budgetFor(chapters)` — forty calls
and an hour for every chapter, never less than two hundred calls and one hour. Neither is
capped: the count is what stops a runaway, and it is proportional to the book, while the
clock measures the hardware rather than the book and is sized for a model on the author's
own machine. Exhaustion throws, the run ends `FAILED` with the reason in the log, and
Continue keeps the chapters written and starts both again.

`structuredResponse` retries once on a malformed answer and tells the model what failed.
It does not retry what a retry cannot answer — an exhausted quota, a rejected key, a
disabled service, an output budget already spent — because resending the same prompt under
the same cap fails identically while doubling the wait, and the real reason then arrives
disguised as a model problem. A repeated answer is retried hotter, not colder: a model told
it said the same thing twice and then given less room to vary says it a third time. First
attempts that failed are drained into the run log with their reasons.

## Persistence and resume

`PersistentProjectStore` keeps memory as the synchronous source of truth and schedules a
debounced snapshot into IndexedDB on every mutation; a localStorage book from the previous
version migrates once. Resume is exact rather than approximate: a stored design for the
same premise and chapter count skips to the first unfinished chapter, finished chapters
keep their manuscript and memory, an interrupted chapter restarts from the previous
chapter's state snapshot, and scenes whose delta was already folded replay from the stored
draft with no model calls. Only a scene that died before its delta is regenerated. A saved
plan is reused whenever scenes already exist against it — the planner is not deterministic,
and a fresh plan would orphan every stored scene.

## Transport

Ollama uses streaming NDJSON, and thinking is off for every model and every role: a
reasoning trace is paid for out of the output budget before the answer starts, on calls
whose answers were already being cut off at that budget, and nothing here reads it.
`/api/generate` is reserved for an unsupported `/api/chat`, not as a retry after a timeout. Successful completion requires the terminal `done` record: broken streams, reported errors and
token-limit endings are rejected rather than accepted as short answers. Structured output
and editorial validation stay mandatory regardless, because a model with thinking disabled
can still leak commentary into content.

## Verification

Run `npm test`, `npx tsc --noEmit`, and `npm run build`.

`tests/v2.test.ts` and `tests/v2pipeline.test.ts` drive the orchestrator and the chapter
pipeline with deterministic model fixtures; `tests/prompts.test.ts` holds the prompt files
to their declared variables; `tests/semanticGate.test.ts` covers the advisory gate,
including its unavailable path; `tests/ollamaStreaming.test.ts` checks partial and terminal
transport records; `tests/vexport.test.ts` covers snapshot and restore. These tests prove
control flow and contracts, not model literary performance.

For a live run outside the browser, `scripts/run-book.ts` drives the same pipeline from a
terminal against real models — the writer on Ollama, the editor on Gemini — and logs every call:

```bash
npx vite-node scripts/run-book.ts --writer deepseek-v4.1-flash:cloud \
  --editor gemini-3.6-flash --chapters 3 \
  --premise "..." --out runs/manual-test
```

It writes `manuscript.md`, `snapshot.json` and `run.log` under `--out`. Record the
provider and models, the snapshot, the audit report and any unresolved warnings. Do not
infer ongoing generation from an old log line or a saved stage alone.

Connected causal repairs are staged transactions. The writer first reconciles the
affected theses and a genre-neutral account of chronology, observable facts,
knowledge, character interpretations and consequential choices. The candidate
plan is reviewed independently of obsolete prose.
The causal reviewer must substantiate blocking findings with an exact quote or
paragraph address from the supplied candidate plan/account; old manuscript
citations are rejected as invalid reviewer output. Account decisions must be
implemented in executable thesis fields, including earlier prerequisites and
later outcomes. Only explicit author requirements bind the repair; unsupported
mechanisms or outcomes invented by an earlier outline may be replaced.
Repair scope comes from changed theses, the book's dependencies and related manuscript mentions. Scenes are patched
in outline order, with only the current scene writable. The saved scene cursor and
candidate survive interruption. After every scene in the package has been visited,
an independent whole-manuscript check verifies setup and consequences together.
Only an accepted package commits both plan and prose. Unverified edits remain in
the candidate; visible changes and the Checks review status are separate signals.


New main-page and CLI jobs use `planning_version: 2`. `plan.canon` is their sole
story truth: facts have stable IDs, a source thesis and character-knowledge source
theses. Each scene supplies `fact_ids`. Code rejects missing sources, unknown
references and knowledge before its source; the editor checks semantic execution.
The model specifies the ending once; code derives the persisted canonical resolution.
Source-scene fact references are mirrored from explicit ledger links, never invented.
For canonical repairs code derives explanatory accounts from the plan instead of asking
the model to maintain another causal account. Writers and verification receive that plan.
Readiness is derived from verified issues and per-defect verdicts; an inconsistent model
ready flag cannot approve defects or trigger a format retry. Snapshot comparisons ignore
JSON object-key ordering while preserving values and scene-array ordering. Invalid canon
references name the exact fact, source or character for the model to repair.

Word budgets are allocated separately for each chapter from the main-page target.
The sum is exact, including integer remainders. A scene planning cap of 1,100 words
sets minimum event counts and bounds allocations when there are enough scenes;
it is not a hardcoded chapter target. Underplanned long chapters receive a reviewed
scene redesign before expansion. Existing prose is divided at paragraph boundaries,
retained with its original plan in an archival version, and rechecked under the new
scene contracts. Division itself never counts as fulfillment of those contracts.
Failure preserves the original plan and manuscript. Checks shows actual/target words.

Canonical causal proposals are judged against each original defect before prose
editing. A refusal refines the same proposal and the same defect set, without
rejudging unchanged prose. Verified per-defect resolution drives progress; differing
counts from successive judges do not prove progress. Expanded and final-audit
logical defects use the same ordered plan-and-prose repair transaction.

Structured-response validation repairs continue while diagnostics change, bounded by the run budget. Repetition of the same validation failure twice stops with its exact cause. Provider quota, credentials and exhausted budgets propagate rather than being disguised as malformed reviews.

Repair-verification schemas constrain both verdict and issue evidence to the current source paragraph addresses. A malformed citation invokes a separate `*-evidence` source-location call which changes only citation fields. Unsupported repair verdicts remain unresolved; blocking findings cannot be deleted by the citation locator. Async structured-response validation is awaited so its failures participate in automatic correction. This applies to initial plan repair, causal candidate review and manuscript repair verification.

Canonical plan repairs use `planTools.ts`: `read_plan`, `search_plan`, `linked_plan`, `patch_plan`, `validate_plan`, and `finish`. Tool inputs identify a section, stable entity ID and field. A patch batch compares each `before` value exactly and validates the whole candidate with the user's scene budgets and frozen scene/character identities before applying anything. Unrelated fields are preserved. Structural validation is not causal approval: independent plan and per-defect reviews still gate writing and staged prose repair. Initial plan repair and whole-book causal reconciliation both use these tools. Candidate, tool history and edits are checkpointed in `plan_tools`; transport interruption retains them. Local tool exhaustion yields to review, not a human-operated continuation. Existing complete proposals remain accepted as unapproved candidates for compatibility.

Dependency invalidation skips manuscript search when repairing the first pending block before any accepted prose exists. This prevents a zero-limit search from interrupting the first scene's repair.

For instrumented progressive/thesis runs, `budgetFor(chapters,input)` uses the author's requested word count to estimate scene volume. It allows 40 calls per planned scene, 20 per chapter and 80 for book-level planning/audits, with a 600-call floor (800 for four chapters at 3400 words each). The browser passes its actual ProjectInput; CLI defaults use its supplied words, and explicit --max-calls still overrides the default. Legacy chapter runs retain their old budget. Time ceilings and verified no-progress guards remain active; an exhausted call allowance is not a provider-account quota.

Canonical scene prose reviews now return an evidence-backed `state_trace` alongside findings. It records ordered character posture, location, knowledge, object and activity transitions, plus concrete checks for state chains, knowledge sources, time, choices/consequences and actual outcomes. `stateTransitions.ts` resolves current paragraph addresses and replays states; conflicting entry states and repeated posture actions create blocking, addressed findings even if the model declares readiness. Semantic failed checks enter the existing writer/whole-book repair cycle. Extractor completeness and semantic judgement still require the reviewer; code does not infer literary truth from arbitrary strings. Current-scene events and outcomes cannot cite earlier context. Retrieval evidence contains actual prose, not plan summaries or old review claims. Invalid trace citations use the existing source locator; unsupported extracted actions request re-extraction instead of inventing events. Actual traces are passed forward in block contracts only while their scene revision matches; edited scenes lose that authority until rechecked. Older snapshots without traces remain loadable.

The in-app question-mark guide describes the thesis-based progressive workflow in six English sections: setup, workspace, writing, checks/repair, model/data routing, and saving/recovery. It distinguishes heuristic metrics from causal approval, unfinished exports from project checkpoints, cloud routes from browser-local storage, and legacy local-ML checks from the current workflow.

Citation location repair accepts exact current quotations as addresses and handles partial, duplicate or malformed locator entries conservatively. Missing/ambiguous/invalid references leave checks unresolved; they cannot approve a claim. Unsupported extracted transition events request re-extraction. An auxiliary locator formatting defect no longer stops the parent review merely for missing support/explanation fields.

Agent Inspector displays cumulative input/output tokens beneath the call clock. Provider usage is propagated through Gemini, Ollama and the Qwen server proxy, including reported rejected/truncated answers and retries. The browser persists cumulative `token_totals` checkpoints in the project log; resume/import restores the latest checkpoint instead of recounting it. Older completed-run character summaries are recovered as explicitly estimated counts. Missing provider usage falls back to character estimates on successful responses. Historical calls without a retained summary or reported usage cannot be reconstructed; the tooltip explains this coverage limit. Gemini output includes reported reasoning tokens; cached input is not added twice.


### Repository autosave
The local Vite dev/preview server exposes same-origin `/api/project-autosave`. Every project mutation schedules a serialized, atomic replacement of `autosaves/latest.project.json`; replacing or resetting input retains the preceding project in a timestamped recovery file. The directory is Git-ignored. Browser IndexedDB remains a secondary copy. Opening the application restores the newest saved snapshot; the header reflects a confirmed disk write, reports failures, and retries after five seconds. Generation does not resume automatically after reopening. Static hosting without this local backend cannot provide repository autosave.


### Response recovery and grounded checks
Structured replies with valid JSON but rejected fields enter exact JSON Pointer patch repair rather than full regeneration. A bounded response allowance (eight calls) and the shared run budget still prevent endless retries. Initial thesis-plan candidates checkpoint raw JSON and rejection text before acceptance and resume from those candidates. Citation locators cannot substitute arbitrary source passages for unsupported blocking claims: the review must be reassessed; unresolved repair verdicts cannot grant approval. Deterministic state replay compares enum posture states, while free-text state mismatches remain recorded diagnostics assessed by semantic checks. Repository recovery tries saved copies in timestamp order, including IndexedDB and the newest five project archives; invalid copies never count as an intentional reset and failed opening is shown in the UI.


### Context for local editing
Scene writing and local reviews receive the current scene, neighbors, explicit prerequisites and relevant canonical facts rather than the full book plan. Read-only plan lookup tools and manuscript search/read retain access to omitted sources. Whole-plan, whole-story and final audits still receive complete material. Plan evidence uses field-level paragraphs, preventing one citation from expanding to the complete outline. Tool prompts compact successful edit history and retain recent exact reads; durable checkpoints retain the full saved history. Oversized legacy evidence is excerpted only in tool prompts and never changes the saved verdict. Impact checks run after the local editing batch, not between its linked replacements. The target word budget remains user-supplied and measured independently.


### Repair dependency tools and package acceptance
Plan and manuscript agents can inspect `fact_dependencies`, tracing a canonical fact to its source, learning scenes, explicit uses and transitive downstream dependencies; manuscript hits are bounded retrieval leads, never proof of knowledge. `repair_status` and `package_diff` expose independent verdicts and staged changes without granting approval. Connected causal repairs stage plan and prose together. Acceptance checks the accepted base revision, the independently verified candidate revision, complete block identity/order, nonempty prose, canonical normalization and unresolved verdicts before replacing the draft snapshot. Rejected packages retain their candidate and leave accepted plan/prose unchanged. Whole-package review rejects newly detected major defects outside the initial repair scope as well. Persisted repair reports distinguish resolved originals, remaining findings and new findings; Agent Inspector displays the latest report. Repair progress uses net remaining defects on changed revisions rather than counting edits or repeatedly resolving the same issue. Word budgets remain enforced by the existing user-derived plan allocation.


### Reviewer response failures
Response contract exhaustion has a typed error distinct from provider, cancellation and shared-budget failures. After two malformed JSON Pointer repair commands, the decoder requests a complete response under the original schema within the same attempt allowance. Local prose reviewers use a four-attempt allowance and checkpoint candidates against the exact source/plan revision. Exhausted local review formatting is recorded as unavailable and queued for later recheck; it is neither a manuscript defect nor literary approval. Provider and budget errors still propagate. Saved candidates are reused only for the same scene, phase and source revision.


### Premise checks, measured text and trace failures
A `planning_version: 2` outline receives two further checks with its first whole-plan review (`premiseChecks.ts`). `THESIS_COVERAGE` asks where each premise given happens; code returns the plan for a story given that is no scene's own `action` or `outcome`. `THESIS_STRESS` plays the outline from inside its people — the observer of each decisive object, each character whose action the plot needs, the sceptic, the literal reader, the protagonist, the reader who has seen it before — and reports where the mechanism fails. Both are asked once per outline: their findings join the review's and are then verified defect by defect by the existing repair loop. A repaired plan is not stress-tested again.

`textFindings` counts what a reviewer reading for events does not report: a narrated sentence of eight words or more written twice (major, sent to final repair with the exact string), a named habit made three times, bodily reactions past a scene's allowance, and scenes opening on one word (all advisory). The polisher receives the findings for its block; the final report carries them all.

**A habit is named by the editor and counted by code, and the writer is told before it writes** (`habits.ts`). After each accepted scene, and again after its expansion, `THESIS_HABITS` names the stock moves in it — a body reacting in place of a feeling, a ready-made comparison — each with two or three marker words. Code keeps a habit only when its markers find it in the scene, and afterwards finds the move by those markers in any order and form, so the name of a thing in the story is never counted and a move rewritten around the same words still is. The next scene's writer receives the devices already spent, with their counts, and one rule counted by code from a lexicon that is a judgement: a bodily reaction in place of a feeling at most once a scene. A repair is told to cut first, replace with a deed second, and never rephrase, because a rephrased move is the same move.

A move made three times in one book, or made again after an earlier one, is the writer model's: it is saved under the model's name (`habits/<provider>-<model>.json` from the CLI, browser storage in the app) and is in front of the writer of the next book from its first scene.

**The plan gives each participant a deed.** `participants[].does` is what the person visibly does under the pressure of the scene. `deedGaps` returns a `planning_version: 2` outline in which it is missing or is a feeling or sensation: a writer given nothing to do with a frightened character writes her heart.

A state trace that cannot be read no longer makes its review unavailable. A trace event the citation locator cannot ground is left out; a posture outside the five is read as `unknown`; a trace still unreadable is recorded in `review_failures` under `<phase>-trace` and the reviewer's findings are kept without it.


### A repair that does not converge
The whole-book repairs (the short-book gate, the review after expansion, the causal part of the final repair) used to end the run when two rounds made no verified progress. They now throw `RepairStalled`, and `carryForward` catches it: the uncommitted candidate is dropped, so the accepted plan and prose stand exactly as they were; the unresolved findings are attached to their scenes as `deferred`, where the next pass receives them as required corrections; and they are kept in `carried_findings`, which the final audit is shown and the final report lists, so such a book ends `COMPLETE_WITH_WARNINGS` and never `COMPLETE`. Earlier paragraphs of this document that say these repairs stop the run describe the previous behaviour. Planning before prose still stops on unresolved blocking defects, and so does the final repair's own no-progress guard.


### What a call carries, and how many calls a repair takes
Measured on a ten-scene book: scene repair took 141 calls at 83K characters each and scene review 81 at 79K, for scenes of about 4K. Two causes, both removed. A scene call carried the same material several times — the adjacent theses three times, the previous scene's ending twice, its state trace twice, the canon facts and the ending twice. `sceneContractContext(…, beside_outline)` now leaves out what `scenePlanContext` in the same call already holds, source and neighbour theses travel as what happened and what it left (`brief`), and the writer's `neighbors` slot names IDs. And a one-scene repair spent turns reading the scene it was repairing and then saying it was done: the tool loop now shows a single writable block whole, and `{"tool":"replace",…,"finish":true}` applies the edits and ends the turn sequence in one call.

A refused structured answer is no longer sent back unchanged. Validation reports every defect at once and names the failed condition with its values (`storyCanon.ts`, `readThesisPlan`); the edits already tried and refused travel with the next repair request; and a refusal that comes back twice in the same words is put to the other role's model. Planning that does not converge — chapter development, scene redesign, plan repair — proceeds with its open findings carried by name (`settlePlan`, `carried_findings`).


### The first writing is the full scene
A `planning_version: 2` book no longer writes a quarter-length draft first. The short draft was meant to find plot defects cheaply, but the writer returned about two thirds of full length whatever was asked, the plan is now stress-tested before prose, and the short book's repair loop was where a measured run spent 470 calls. Each scene is written once at its `target_words`; the expansion pass visits only a scene that came back under its budget or carries findings, and costs nothing for the rest. The whole-book review, the seam review and the polish pass are unchanged. Plan repair shows the cited scenes whole on every turn (`planAgent` `focus`) instead of spending a call to read each.


### What a repair package answers for
A whole-book repair was returned whenever its review found any blocking issue anywhere, and a reviewer rereading a book finds something else each time: a package that resolved its defect came back with "new defects" that stood in the text before it, or that doubted how the demanded change read. A package is now judged on the defects it was sent to repair and on hard contradictions (`contradiction`, `impossible_action`, `continuity`, `unsupported_knowledge`, `premature_disclosure`, `author_requirement`) quoted from text it wrote. A finding quoted from text that stood before the repair is left for the next whole-book review. The gate counts progress as fewer blocking findings on changed text for canonical books too; changed text alone no longer counts. Repair visits the cited and changed scenes and their direct prerequisites, re-reviews only edited scenes, and spends no locator call on a state trace.


### The state ledger
A plan names in `tracked` the three to ten things its plot cannot lose track of — objects, documents, evidence, with where each is before the first scene — and code adds every character's whereabouts (`stateLedger.ts`). After a scene is written, and again when its text has changed, one short call (`THESIS_STATE`, the scene and the list, a few thousand characters) asks how each thing stands at the end of it: `unchanged`, `changed` or `conflict`, with the sentence that shows it. Code believes an answer only as far as its quote is in the scene, keeps the table in `state_ledger` by scene and text revision, hands the next scene's writer the last recorded row as where things stand, and turns a verified `conflict` into a `continuity` finding that names both states and the scene that left the first; the finding joins the scene's review and its ordinary repair.

A book with `tracked` does not ask its reviewer for a state trace: the open-ended extraction of fifteen cited events inside the review call could not be read for most scenes. A plan without `tracked` — every project saved before it — keeps the trace, which now drops an entry it cannot read instead of the whole trace. What the planner does not name is not followed.


### One answer, and no stop after prose exists
Plan repair and every manuscript edit are one answer, not a conversation. A turn costs the whole request, and a model offered a read per field spent sixty thousand characters to ask for fifty, a dozen times in a row. The request now holds what the work needs — for a plan, the cited scenes whole and every other scene and fact in brief; for an edit, the writable text itself (one scene, both sides of a seam, or the whole manuscript up to 80K characters) — and the answer is one batch with `"finish":true`. A plan edit no longer has to reproduce the old value; a refusal that concerns a stale value returns the current one. Search and read remain and are described as costing a full turn. The polisher's forced search is gone: what a scene repeats is counted by code and listed.

Once prose exists nothing ends the book but a transport failure, an empty answer or the call budget. A scene that stays short, a chapter under its length and a final repair that stops converging are delivered with their findings in the report (`COMPLETE_WITH_WARNINGS`). A repair package is verified once against the whole manuscript, not twice. What a scene is asked to correct is what its current review says plus what a whole-book repair carried to it; `deferred` is a history, kept because saved versions are validated against it, and is no longer handed back as corrections.


### Three truths: what happened, what each person holds, what the reader has been shown
A writer who is sent the premise knows how the book ends and writes its people as though they did: a first chapter had its heroine think of a murder nobody had yet described. A plan now keeps the three apart (`minds.ts`), and a book whose plan says what lies `beneath` its scenes is written that way.

**The plan.** Each participant has `believes` — what they take to be true as the scene opens, right or wrong. Each scene has `beneath` — what is really going on that its point-of-view character does not perceive. `action`, `resistance`, `outcome`, `state_before` and `writer_task` hold only what could be seen or heard. Each canon fact may say in `reader_learns_in` when the reader is given it. The stress test reads the outline as the writer will and reports a visible field that states the hidden thing, a deceived person who already believes the truth, and a turn given to the reader before it is earned.

**The writer is sealed.** Every writer-route call for such a book — first writing, repair, expansion, polish, seam repair, a whole-book repair's visit to a scene — receives `writerRequest` (form, not the premise), `writerScene` (the scene's visible fields; the point-of-view character's goal, wants, `knows`, `believes`, the canon they have by now and what they learn here; of the others, a name and what they are seen doing), `writerOutline` (earlier scenes only) and `writerContract` (no handoff). The tool loop offers no plan tools and no thesis revision, and shows no scene after the one being edited. The final audit's repair is the exception: the book is whole by then. A reviewer is sent everything, as before.

**Minds are followed in the text.** The state question carries a second list: for each person present and for the reader, the canon facts they do not yet have. The answer is `no`, `learns` or `already_knows` with the sentence; code believes it as far as the sentence is in the scene, records it in `state_ledger[scene].minds`, and from then on that person has the fact — the next scene's sheet is built from what the text showed, with the plan as the fallback. Knowing or being told ahead of the plan is a finding (`unsupported_knowledge`, `premature_disclosure`) in the scene's ordinary repair. A suspicion is not knowledge; whether a sentence is one or the other is the editor's reading.

**People choose alone.** With the first plan review, the three scenes the most later scenes require are replayed: each participant is given only their own sheet and the situation — not the outline's action — and asked what they do (`THESIS_CHOICE`); one comparison per scene reports where the outline needs a person to act against that choice with nothing in the scene to move them (`THESIS_CHOICE_COMPARE`). About a dozen short calls, once per plan.

What the planner leaves in a visible field the writer sees; that is checked by the stress test and not by code. A writer without the whole story depends on the plan for tone and for what to plant.


### A crossing is reviewed as a crossing; a repaired plan is tested once more
The boundary between two scenes has its own review (`THESIS_SEAM`): the two scenes in brief, the end of one and the start of the other, and the earlier passages the second leans on. It no longer travels in a whole scene's review request with that scene's outline, contract, quality criteria and state trace.

The premise checks — coverage of the givens, the stress test, the deeds — run a second time on the plan as it stands after repair (`premise_rechecked`), since that is the plan the book is written from and a repair can break what it was not looking at. They run twice at most: what the second pass finds is repaired and verified like any other finding, and the plan then goes to prose.

A refused structured answer is repaired from the head and tail of its task, the answer and the reason, not the task's supplied material; the material is kept when the refusal concerns a citation into it and returns after two abridged repairs fail.


### The plan is frozen once the book is being written
A plan is written, reviewed and repaired before the first scene, and not after. For a book with a canon, every whole-book repair is a repair of prose: the scenes a finding cites are corrected and checked against themselves and their neighbours, and nothing else moves. There is no causal reconciliation of the plan, no plan review and no visit to dependant scenes at this stage, and the writer cannot propose a changed thesis. A whole-book reviewer says in `fix` whether a finding is `text` — the prose departs from a sound plan, or one scene's prose from another's — or `plan`; a `plan` finding is carried to the report and reopens nothing. Earlier paragraphs of this document that describe reconciling the plan during repair apply only to books planned without a canon.

**A later reading may raise what has changed.** The first whole-book review may raise anything. Each records the paragraphs it read; a later one may raise as blocking only what stands in text changed since. A finding on a paragraph an earlier reading passed is carried to its scene as a correction for the next pass and listed in the report, and starts no whole-book repair. A book has at most eight whole-book repairs in all.

**Tool answers are read as they are meant.** Several commands in one answer are one answer: edit batches are joined. An edit that restates a field unchanged is left out without refusing the edits beside it. An empty batch marked finished is a finish. Whole-book calls carry `wholeBookPlan` — events, facts and people — in place of the full plan.


### The plan as a chain, written from its end
A hole in a plot is a thing that is not where a scene needs it, a person acting on what they do not know, or an ending resting on what nothing established. Each can be stated in IDs, and what is stated in IDs code can check. A plan therefore carries a chain (`chainGaps` in `premiseChecks.ts`): `places`; `tracked[].at`, the holder or place of each thing before the first scene; and on each scene `place`, `needs_things` (a thing, and the person present or the place it must be with), `moves` (a thing, and where it ends, or `GONE`) and `needs_knowledge` (who must already know which canon fact). `ending_rests_on` lists the facts the resolution cannot do without. Code plays the plan forward, keeping where each thing is, and reports every need no earlier scene met — "T2 needs the notebook with Nora, but it is in the car, left there by T1, and no scene between moves it" — and every fact the ending rests on that is not established, not learned by the last scene's point-of-view character, or never given to the reader. A stated need that is not met cannot pass; there is no reading in it. What the planner does not state, code does not see; the state ledger meets it later, in the text.

The plan's shape puts `ending` and `ending_rests_on` before the scenes, so that a model writing the answer in order commits to the end first. `canonGaps` adds what needs no chain: a fact used before the scene that makes it so, and a tracked thing no scene handles. `THESIS_DRYRUN` plays the outline once more as a stage manager for what IDs cannot say — time, and why. All of this runs with the first plan review and again on the repaired plan, and the plan is frozen after it.

### Two writers
When the author sets a second writer (`getStoredSecondWriterConfig`; `--writer2` from the CLI; route `writer2`), a scene's first writing is a duel (`duel.ts`). Both writers draft it at once, each told its own spent moves. Code measures each draft — length against target, bodily reactions past the allowance, moves the book has spent, a sentence the book already has — and a draft that is empty, far off its length or repeats the book is out. Between two that stand, the editor chooses without being told whose is whose, on two questions: in which draft the scene's outcome actually happens, and which sounds like the narrator so far; the order they are shown in alternates by scene. Only the chosen draft is reviewed; nothing is taken from the other. A scene's repairs and expansion go back to the writer who wrote it; polish and seams stay with the first writer. The book keeps score by kind of scene (one person, or more), and so does the host between books: once a writer has four of five in a kind, it writes those scenes alone and the other is tried again every fifth scene.
