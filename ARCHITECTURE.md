# Novel pipeline

The production path is `App → useBookGenerator → utils/novel/v2/orchestrator.ts`.
React renders committed snapshots; it does not calculate memory or sequence model calls.

## Model roles

Two roles, configured independently: the **writer** produces prose, the **editor** plans,
reviews, extracts memory and audits the book. `NovelLLM` carries
`route: 'writer' | 'validator'` and the caller resolves it to the prose or validation
provider. Without an editor the writer judges its own prose, and a model that grades
itself is the configuration this pipeline exists to avoid.

Thinking never reaches the manuscript. `stripThinking` removes a `<think>` block and
refuses a response that ended inside one; a response with no complete JSON object is an
error, never an empty success.

## Prompts are files

The pipeline prompts and the shared system contract live under `prompts/`, one per
file. Application code never hand-builds them: it names a prompt and supplies its
variables through `renderPrompt`, and `fillTemplate` throws on any `{{hole}}` left
unfilled. `promptVariables` reports what a template declares, so a test can hold code and
prompt to the same contract — `tests/prompts.test.ts`.

| Prompt | Stage |
| --- | --- |
| `P01_BOOK_DESIGN` | one compact construction: contract, cast, rules, causal map, ending, chapter map |
| `P02_PLAN_REVIEW` | construction review, and later each scene's readiness |
| `P03_CHAPTER_PLAN` | one chapter, from confirmed memory |
| `P03_SCENE_REBASE` | rebase the next scene on the accepted scene handoff |
| `P04_SCENE_WRITE` | one scene, from a verified package |
| `P05_STATE_UPDATE` | what the written scene changed, against paragraph evidence |
| `P06_FORWARD_UPDATE` | reconcile the remaining plan with what was written |
| `P07_FINAL_AUDIT` | check the finished book and report |

## The order of work

The orchestrator owns the order, the budgets and the record. One design call, one
construction review with bounded fixes, then chapters in order through the injected
chapter pipeline, then the audit. Nothing else decides what runs next.

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
curve — and the findings go back through the design review as `major` charges. A
repetition you have to detect in prose is a repetition you already paid to write.

## Inside a chapter

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

A blocking finding sends the plan back to the planner with the evidence attached, up to twice. A chapter plan costs one
or two percent of the tokens of the chapter it describes, so three attempts here are
cheaper than one prose rewrite — and a prose rewrite cannot fix what is wrong at this
altitude anyway: no amount of re-writing scene four turns four identical chapters into a
rising book. When the attempts run out the findings become warnings and travel into the
writer's package as requirements, the same way an unresolved design objection already
does. A book that says what is wrong with it beats a book that refuses to exist.

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

**Code brings doubts; the model disposes them.** Before prose exists,
`buildSceneContext` raises structural problems by name — `pov-absent`, `empty-task`,
`location-mismatch`, `missing-fact`, `missing-source`, `repeated-staging`, `static-outcome`, `unknown-participant`,
`restaging-suspect` — and an optional local semantic gate adds two more kinds of
evidence. Nothing there blocks on its own: the doubts go to a P02 readiness review, and a
blocking verdict becomes a `continuity_requirements` instruction inside the writer's
package. The transition gets shown on the page instead of stopping the book.

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
question. P05 states what a ref is; code enforcing a rule the prompt never stated is how
a run dies citing a scene id it had every reason to think was valid.

**Every accepted scene also emits a persisted semantic handoff.** It names what the
reader already knows, what just changed, current conditions, still-open questions,
active intentions, the previous outcome, the next required outcome, and meanings that
must not be explained again. Before the next scene, `P03_SCENE_REBASE` updates that
scene's causal plan against this handoff; P04 receives the same object when writing.
The last scene's handoff is enriched by P06 and becomes the next chapter's input.

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

**A contradiction the model marks `blocks_continuation` buys one rewrite, not a dead
book.** The writer sees exactly what broke and rewrites against it; only a second
consecutive break fails loudly. A name variant is the same path: the model, reading both
the prose and the registry, judges whether "Zarka" beside "Zarko" is drift, and code only
carries the verdict. Code never decides by string similarity.

**Open questions are settled from the text, not carried as silent gaps.** Uncertainties
relevant to the next scene and non-blocking contradictions go to one bounded call. If that
call dies, memory keeps what the delta proved and the questions travel on as an explicit
warning and remain in the persisted handoff — never as answers.

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
| Chapter plan (P03) | writer | Once, unless a saved plan is reused on resume; up to twice more if the plan gate rejects it before prose | 1–3 |
| Scene readiness (P02) | validator | Only when code raised a structural doubt (`pov-absent`, `location-mismatch`, a restaging match, …) | 0–1 per scene |
| Write the scene (P04) | writer | Every scene; one retry only if the answer is empty or came back as JSON instead of prose | 1 per scene |
| Track the scene (P05) | validator | Every scene, against the prose just written; one correction pass if a citation points nowhere | 1 per scene |
| Span repair (P08) | writer | Only when the scene repeats earlier prose verbatim; carries the duplicated sentences, not the scene | 0–1 per scene |
| Rewrite on contradiction | writer + validator | Only when the tracked delta blocks continuation — one full redraft, not a repair | 0–1 pair per scene |
| Resolve open questions | validator | Only when the scene left an uncertainty or a non-blocking contradiction for the next scene | 0–1 per scene |
| Forward reconciliation (P06) | validator | Once, after the last scene | 1 |

A chapter of four scenes with no contradictions and half its scenes flagged for readiness
lands at 1 + 4×(0.5 + 1 + 1 + 1) + 1 ≈ 16 calls — the range a live run actually shows. The
writer only ever sees P03 and P04: the plan and the prose. Every other call is the editor
reading what already exists and reporting on it in a few hundred tokens, never generating
the manuscript itself — a large model earns its cost by judging, not by drafting.

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
1811 on page one and in 1841 on page thirty, which no state tracker sees because the
number was never an event.

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
a tic — "his breath hitched" seven times is not an event — and capitalized spans are
skipped, because a book repeating its own device by name is repeating its subject. It never rewrites: the manuscript it
checked is the manuscript that ships. `settleAuditStatus` computes the status in code —
findings mean `COMPLETE_WITH_WARNINGS`, an unfinished book means `PARTIAL`.

## Budgets, retries, failure

Every model call passes through `counted`: calls, elapsed time and estimated tokens
(characters/4, since providers report no usage) against `DEFAULT_BUDGET` — 200 calls, one
hour. Exhaustion throws, and the run ends `FAILED` with the reason in the log.

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

Ollama uses streaming NDJSON, and thinking is off unless the provider role turns it on —
`think: params.think ?? false`, with the anti-reasoning line dropped from the system prompt
when a role does enable it, since suppressing it in words would defeat the setting.
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
terminal against real Ollama models and logs every call:

```bash
npx vite-node scripts/run-book.ts --writer deepseek-v4.1-flash:cloud \
  --editor mistral-large-3:675b-cloud --chapters 3 \
  --premise "..." --out runs/manual-test
```

It writes `manuscript.md`, `snapshot.json` and `run.log` under `--out`. Record the
provider and models, the snapshot, the audit report and any unresolved warnings. Do not
infer ongoing generation from an old log line or a saved stage alone.
