# Novel pipeline

The production path is `App → useBookGenerator → utils/novel/engine.ts`.
React renders committed snapshots; it does not calculate canon or sequence model calls.

## Author contract and planning

`BookSpec` freezes premise, chapter count, genre, audience, language, POV, tense,
tone, style notes, chapter length, ending and writing mode for a run. The prose
provider and optional structured-validation provider are also frozen. Outline approval precedes the blueprint and individual
chapter plans. Scene plans require explicit goals, resistance, outcomes and beats;
missing literary content is not replaced with generic defaults.

The blueprint contains intended characters and scheduled narrative promises. It is
not evidence of events or character knowledge. Roles use the actual chapter count.

## Writing and review

Two scene-writing treatments share the same plan and context:

- `slots`: structure and specialist contributions followed by one scene synthesis.
- `scenes`: one prose writer generates the whole scene (experimental).

Neither treatment has a claimed quality or speed advantage. `scripts/compare-writers.mjs`
creates blind A/B manuscript samples with separate operational measurements.

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
