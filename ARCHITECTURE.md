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

## Inside a chapter

**The plan is made from confirmed memory, not from the design alone.** `planChapter`
receives the current state, the previous chapter's own tail (600 characters of real
prose, which survives reload), the open threads, the ending's required setup and the word
budget still ahead. A plan that cannot be written returns `needs_replan` and stops the
chapter rather than writing against it.

**Code brings doubts; the model disposes them.** Before prose exists,
`buildSceneContext` raises structural problems by name — `pov-absent`, `empty-task`,
`location-mismatch`, `missing-fact`, `static-outcome`, `unknown-participant`,
`restaging-suspect` — and an optional local semantic gate adds two more kinds of
evidence. Nothing there blocks on its own: the doubts go to a P02 readiness review, and a
blocking verdict becomes a `continuity_requirements` instruction inside the writer's
package. The transition gets shown on the page instead of stopping the book.

**The semantic pre-write gate is advisory and local.** Full mode scores each planned scene
against finished paragraphs with a cross-encoder and the scene's claims against confirmed
state with NLI; light mode (the default) uses a ~90MB embedder for restaging only. It
never throws into the run — unavailable or failed, the book continues on the verbatim
check alone — and the run log says once per book what the gate actually checked, so a
clean status never implies coverage the author switched off.

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
| Chapter plan (P03) | writer | Once, unless a saved plan is reused on resume | 1 |
| Scene readiness (P02) | validator | Only when code raised a structural doubt (`pov-absent`, `location-mismatch`, a restaging match, …) | 0–1 per scene |
| Write the scene (P04) | writer | Every scene; one retry only if the answer is empty or came back as JSON instead of prose | 1 per scene |
| Track the scene (P05) | validator | Every scene, against the prose just written; one correction pass if a citation points nowhere | 1 per scene |
| Rewrite on contradiction | writer + validator | Only when the tracked delta blocks continuation — one full redraft, not a repair | 0–1 pair per scene |
| Resolve open questions | validator | Only when the scene left an uncertainty or a non-blocking contradiction for the next scene | 0–1 per scene |
| Forward reconciliation (P06) | validator | Once, after the last scene | 1 |

A chapter of four scenes with no contradictions and half its scenes flagged for readiness
lands at 1 + 4×(0.5 + 1 + 1 + 1) + 1 ≈ 16 calls — the range a live run actually shows. The
writer only ever sees P03 and P04: the plan and the prose. Every other call is the editor
reading what already exists and reporting on it in a few hundred tokens, never generating
the manuscript itself — a large model earns its cost by judging, not by drafting.

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
