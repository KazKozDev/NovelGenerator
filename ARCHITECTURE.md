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

Measured prose texture is recorded on every candidate version: comparison density,
paragraph length distribution, dialogue share, and semantic repetition found with
embeddings. Three of these measurements act, and the rest only report.

**Repetition fails a chapter.** Paragraphs whose embeddings sit above the tail of what a
real manuscript produces — cosine 0.80, against a median of 0.585 — are the same defect
the lexical duplicate check already blocks, caught after rewording, so they are treated
the same way and repaired by deletion. A passage recycled from an earlier chapter is
reported against both chapters and repaired in the later one.

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

Edits are candidates, never in-place replacements of accepted text. Acceptance
invalidates later chapters and their derived canon. Their prose and version history
remain available for revalidation. Chapter summaries and facts are extracted again
from the accepted revision. No post-validation ending rewrite runs afterward.

Whole-book review sees the complete evidence ledger and blueprint; local reviews see
full chapter prose. The global pass checks causality, escalation and required payoffs.
Line editing acts only on specific issues. A final global pass follows all changes.

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

For live evidence, record the provider/model, complete run checkpoint, accepted
revisions, review reports, exported manuscript, call durations and any unresolved issues.
Do not infer ongoing generation from an old log line or a saved stage alone.
