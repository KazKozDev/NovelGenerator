# Novel pipeline

The production path is `App → useBookGenerator → utils/novel/engine.ts`.
React renders committed snapshots; it does not calculate canon or sequence model calls.

## Model roles

Two roles, configured independently: the **writer** produces prose, the **editor** reviews
chapters, extracts canon and audits the book. `NovelLLM` carries `route: 'writer' | 'validator'`
and the caller resolves it to `run.provider` or `run.validationProvider`. Without an editor the
writer judges its own prose, and a model that grades itself is the configuration this pipeline
exists to avoid.

Thinking belongs to the role, not to a model name: `LLMProviderConfig.think` is set on the
editor and never on the writer. A reasoning model asked to judge with thinking disabled returns
an empty review; Ollama returns its reasoning in `message.thinking`, which `readOllamaCompletion`
never reads, so it cannot reach the manuscript.

## Author contract and planning

`BookSpec` freezes premise, chapter count, genre, audience, language, POV, tense,
tone, style notes, chapter length, ending and writing mode for a run. The prose
provider and optional structured-validation provider are also frozen. Outline approval precedes the blueprint and individual
chapter plans. Scene plans require explicit goals, resistance, outcomes and beats;
missing literary content is not replaced with generic defaults.

The blueprint contains intended characters and scheduled narrative promises. It is
not evidence of events or character knowledge. Roles use the actual chapter count.

## Writing and review

One prose writer generates each scene from the plan, the accepted canon and the prose
already written in that chapter. A second treatment — a framework of specialist slots
merged by a synthesis call — was measured against it on four matched scene pairs and
removed: it produced shorter scenes every time (879 against 1233 words on the same
target) and almost no dialogue (3.8% against 16% of paragraphs), with no measured
advantage. The shortfall it created is what the length contract then paid for in
description.

**A scene is written to its own contract, not to the whole plan.** The writer is given its
scene entire, the scenes already written as a line each, and the ones still to come as a
name only. The fields that say where the chapter arrives — its summary, its ending, what
it advances, what follows it — go to the scene that arrives there, the opening hook to
the scene that opens, and the chapter's ending development to the scene that ends it. The
book's outline stays with the planner and the editor. What the scene is told instead is
what it must put on the page, what changes by its end, where it stops, and what it may
not disclose yet; theme, symbolism and motive are guidance for the writing, never
something the prose states.

**The chapter keeps a journal of what it has actually written.** After each scene, one
call reads that scene and records where the characters are, who holds what, what
happened, who learned what and what question is still open, each note with a short
quotation from the scene. A note whose quotation is not in the scene is dropped. The next
scene of the chapter reads the journal in place of the earlier scenes' planned objectives
and outcomes, which said what those scenes were for rather than what reached the page.
The journal is a draft record: it never enters the canon, and it is discarded when the
chapter is accepted and its accepted prose is extracted instead.

**Scene count follows chapter length.** A scene is roughly 800–1200 words, so a plan
starts from about one scene per thousand words of the chapter's target and departs from
that where the chapter's shape asks for it. Too few scenes leaves a scene with words to
fill after its action is over, and that budget is paid in restatement.

Measured prose texture is recorded on every candidate version: comparison density,
paragraph length distribution, dialogue share, and semantic repetition found with
embeddings. Three of these measurements act, and the rest only report.

**Decisive scenes are selected before they are repaired.** A scene with effective
`narrativeWeight` 4 or 5 gets two independent writer drafts. The application scores
both immutable candidates on blocking deterministic findings, target-length deviation
and the presence of speech where the plan says speech carries the conflict, then keeps
the lower-risk draft. It records scores and the chosen index, not the discarded prose.
Ordinary scenes still cost one call, and a tie preserves the first draft.

**Style has a forward state of its own.** Before each scene, accepted chapters are
reduced to a voice registry: dominant sentence-opening frames, whole-book texture
measurements, and bounded `alreadyTold` material such as images, gestures and
descriptions whose work is spent. The registry contains no prose sample to imitate.
It tells the writer what the book has leaned on and what it has already used.

**Writer prompts are measured as an interface.** The scene request, author contract,
canon, continuity, chapter orientation, prose guidance and correction each have a
named character budget. Every scene call records their sizes, budget overruns and the
share occupied by the current scene request. Canon is never silently truncated to hit
a budget; an overrun remains visible in checkpoint telemetry.

**Repetition fails a chapter.** Paragraphs whose embeddings sit above the tail of what a
real manuscript produces — cosine 0.80, against a median of 0.585 — are the same defect
the lexical duplicate check already blocks, caught after rewording, so they are treated
the same way and repaired by deletion. A passage recycled from an earlier chapter is
reported against both chapters and repaired in the later one. Rare wordings travel
forward instead of blocking: each accepted chapter's 4-grams carrying a word nothing
before used reach the next chapter's planner as spent phrasing, which must not be
reused or closely varied. Speech is excluded — a refrain is the line-level check's
business. An abbreviation the reader meets first after chapter 1 is a minor finding
against the chapter that introduces it.

**A sentence shape used as a formula is measured, not debated.** Two syntactic habits are
counted against what this pipeline actually writes, over 131 stored manuscripts of 4000
words and up: sentence pairs that deny a thing and then assert its replacement ("It was
not a handshake. It was a grip."), and the single most-used sentence-opening frame, with
everything but the function words masked ("he did not *"). Both sit at their 95th
percentile as a ceiling — 0.25 and 1.3 per 1000 words — and block only well past it, at
0.5 and 2.0, where the chapter is an outlier rather than a writer with a habit. The book
that prompted the measure reads 1.16 and 2.86, above every other manuscript measured. A
count floor goes with the rate: three pairs, five sentences on one frame. English only,
because that is where the distribution was measured. The manuscript contract carries the
matching clause, so the writer is told before the reviewer has to report it.

**Damage is read as well as meaning.** A paragraph that opens a line of speech and never
closes it — narration running on inside the quotation marks — fails the chapter. The check
existed but saw almost nothing: it split on blank lines while the writer produces one
paragraph per line, counted only the straight `"` while the writer produces typographic
`“ ”`, and excused any unclosed paragraph whose neighbour opened with a quotation mark,
which in a dialogue scene is nearly every neighbour. It also ran only against the previous
version, so a first draft that arrived broken was never examined. A spoken line that
returns word for word, in this chapter or out of an earlier one, is reported as a minor
finding: a refrain can be deliberate, a character's signature line handed back to them
unchanged is what made one reviewer say he had stopped sounding like a person.

**A character's limits are part of the design.** The blueprint declares, per character, what
they cannot do and what they will not do — the body's ceiling and the standing refusal
together, because on the page they fail the same way. They travel to the chapter planner
with the description, reach the writer inside the character design, and the chapter review
is asked about them by name, for the people that chapter's scenes contain. A limit may be
broken only by paying for it on the page. A book planned before the field existed is judged
against nothing.

**A character's secret travels in the data, not in a word list.** The blueprint declares,
per character, `secret` — the hidden thing itself as a short noun phrase in the manuscript
language — and `revealChapter` with the chapter that exposes it. Each book is checked
against its own secrets: those words in direct speech fail the chapter until the reveal
chapter, whatever the book is about. No list in the code names any secret.

**A scene declares whose eyes it is seen through.** `pov` names one of the scene's own
participants; a viewpoint outside the room is refused, unless one person is in it and the
name is simply wrong. The writer is told whose scene it is, and where the viewpoint changes
from the scene before, told to name that person in the first sentence. The review is given
the declaration and asked whether the page kept it. The seam this exists for is not the
scene break: a finished chapter ran a page of one man's morning and continued, with no break
and no name, inside another.

**What the book has already told the reader reaches the reviewer.** Each accepted chapter
keeps what it described, explained or played out, taken from its own prose; that record went
to the writer and to nobody else. The review now gets it with one question — is this chapter
giving the reader something they already have. It is the only check that can see a meaning
re-explained in new words, which shares no wording with the first telling and so is invisible
to both the lexical and the embedding measures. A motif-frequency counter was measured and
rejected instead: in the book that prompted this, the motif appears 15 times in chapter one
and once in chapter four, so a count would have failed the chapter the reader praised.

**A book in which nothing ever goes wrong is replanned once.** If no scene in any chapter
ends in a setback, one chapter past the middle — never the opening, the climax or the
resolution — is replanned so its decisive attempt fails. Like the muteness check, it runs
once over the whole book and never ends the run; a book of successes is the author's to keep.
No stored run carries `outcomeType` yet, so this is a floor on structure, not a fitted
threshold.

**A designed character used once and then dropped is reported.** The blueprint's cast is the
book's consequential people, so one who appears in a single chapter's evidence and in none
after it is either a thread the book abandoned or a person the plan overvalued. Deterministic,
reported at whole-book review rather than judged, and the final chapters are exempt.

**Planned exchanges must reach the page as speech.** Each planned scene declares whether
its conflict is carried by speech, action or solitude. A chapter whose plan contains a
speech-driven scene and whose prose contains no spoken line is rejected; spoken lines
below `dialogueFloor` of paragraphs are reported. Scenes planned before the field
existed are not judged.

**A repair may not pay for its fix with the chapter.** A revision is compared against the
text it came from: silencing the dialogue that chapter had, fusing its paragraphs into
far longer blocks, or cutting a sixth of it when no issue asked for cuts sends the
repair back once with the damage named. That comparison needs no fitted threshold.

Chapter length is bounded on both sides against the planned target, and a repair is told
to restore length only when an issue names content as missing. Comparison density,
modifier stacking and paragraph monotony stay advisory: their budgets were fitted to one
manuscript and must be recalibrated across several before they can block acceptance.

Every chapter goes through full-prose review, bounded targeted repair and grounded
analysis before acceptance. Review reports use `passed`, `failed`, or `not_checked`.
Malformed JSON, missing quotations and transport errors never become an empty success
report. Major and critical issues block acceptance; minor issues remain available to
the targeted line editor. Two repair attempts are followed by explicit author attention.

JSON wrappers keep requested prose separate from model commentary. Parsers accept
unambiguous formatting wrappers, not fabricated values or arbitrarily selected examples.

## Canon and revisions

Accepted prose establishes `StoryState`: facts, events, character knowledge and
setup/payoff evidence. Extraction requests reference source paragraph IDs; the application resolves these IDs to exact prose and revision. Unknown or ambiguous IDs are rejected. Existing explicit quotations remain strictly validated. Every stored item cites an exact passage and revision. This verifies
source presence; semantic truth and literary quality still depend on model review.
The system cannot guarantee absence of subtle contradictions or commercial success.

Facts and events carry story time as `atHour`, hours from the story's start, when
the prose pins them to it — never inferred from the plan. The cross-chapter review
asks whether the chapter contradicts a recorded hour. A missing hour never
contradicts anything; vagueness is not a defect.

The chapter planner sees the book's open debts: required promises scheduled for
payoff at or before that chapter with no payoff recorded. The chapter must close
each on the page or release it explicitly — a debt settled offscreen, in summary,
or by another character's report is not closed.

Edits are candidates, never in-place replacements of accepted text. Acceptance
invalidates later chapters and their derived canon. Their prose and version history
remain available for revalidation. Chapter summaries and facts are extracted again
from the accepted revision. No post-validation ending rewrite runs afterward.

Whole-book structural review sees the complete evidence ledger and blueprint; local
reviews see full chapter prose. Before either global review, a deterministic book pass
measures the accepted prose both as a whole and as an ordered chapter series: chapter
length trajectory, dialogue and paragraph texture, repeated opening frames and the
curve of planned scene outcomes. The final global review additionally receives every
accepted chapter in reading order and asks one prose-level question about repetition
that accumulates across chapters. Line editing acts only on specific issues. A final
global pass follows all changes.

English syntax metrics carry two reference points. The internal ceilings remain the
measured distribution of pipeline manuscripts. `benchmarks/external-prose-v1.json`
adds a versioned external reference measured from three public-domain Project Gutenberg
works; it stores source URLs, source hashes, method and aggregate numbers, never the
books. `scripts/measure-prose-benchmark.ts` reproduces it. External measurements are
descriptive rather than a universal literary threshold, but a whole-book syntax finding
must exceed both the internal ceiling and the external reference maximum.

Every active `DetailedScene` field has a compile-time owner in
`ACTIVE_SCENE_FIELD_CONSUMERS`: writer, review, beat registry, diversity check,
book-structure check, word allocation or candidate selection. The current planner no
longer emits `duration`, `mood`, or the unused expanded transition graph. Those names
remain optional legacy checkpoint fields only; four can still be read best-effort by
the writer when an old saved plan contains them.

## Persistence and transport

IndexedDB stores run specification, provider, blueprint, scene drafts, candidates,
accepted versions, review results, canon and current stage. Each write transaction
must commit before the UI reports the checkpoint. Resume selects the first pending
candidate or unaccepted chapter, including a partly written scene sequence.

Legacy localStorage manuscripts are imported as unverified drafts. Checkpoints from
the earlier permissive review policy retain all prose but require revalidation under
the current policy. Export as a final book requires accepted chapters and final review.

Ollama uses streaming NDJSON transport with `think:false` for every model and stage,
including the generate-endpoint fallback. There are no model-specific exceptions.
Gemini requests already use `thinkingBudget:0`. Any unsolicited thinking channel is
ignored. The earlier GLM probe showed possible commentary leakage into content with
thinking disabled, so structured output and editorial validation remain mandatory.
Evidence extraction is split into facts, events and promises; all sections must pass
before a chapter enters canon.
Some models cannot obey structured output while thinking is disabled. A short,
non-manuscript capability probe must verify one schema-conforming object before a
model is assigned as validator. Prose and validation can use separate models; the
checkpoint records both. Validator failure pauses the run without accepting partial data.
Title generation is cosmetic: after the manuscript passes final review, a malformed
title response falls back to the first approved chapter title instead of blocking export.
Successful completion requires the terminal `done` record. Broken streams, reported
errors and token-limit endings are rejected. `/api/generate` fallback is reserved for
an unsupported `/api/chat` endpoint, not an expensive retry after a timeout.

## Legacy modules

`agentCoordinator`, `coherenceManager`, `storyContextDatabase`, `specialistAgents`,
`synthesisAgent`, and the old broad editorial passes are no longer on the production
generation path. Their files and compatibility tests remain to preserve existing local
work. Legacy success scores and automatic prose substitutions do not drive the new engine.

## Verification

Run `npm test`, `npx tsc --noEmit`, and `npm run build`.
`novelEngine.test.ts` exercises the actual engine with deterministic model fixtures;
`novelSafetyRegression.test.ts` checks failed-review and provenance regressions;
`ollamaStreaming.test.ts` checks partial and terminal transport records. These tests
prove control flow and contracts, not model literary performance.

Reader and live-run findings are retained in `defects/cases/`, one JSON card per
observable defect. Each card names the generation contract, review, or repair guard
that owns it and records whether that check catches it now. Cards marked `caught`
must carry executable detector input; `defectRegistry.test.ts` validates the registry
and runs those checks. A new complaint therefore starts as evidence and a named gap,
then becomes a regression in the same artifact when the responsible check exists.

For live evidence, record the provider/model, complete run checkpoint, accepted
revisions, review reports, exported manuscript, call durations and any unresolved issues.
Do not infer ongoing generation from an old log line or a saved stage alone.
`npm run probe:scene -- qwen3.5:4b` is the bounded live check for the decisive-scene
policy: it writes two drafts of one 300-word scene, prints deterministic scores and
prompt telemetry, and stores neither candidate.
