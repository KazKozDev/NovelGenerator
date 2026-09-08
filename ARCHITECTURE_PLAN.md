# Literary pipeline implementation

Scope: implement the complete architecture audit, preserving existing unrelated edits.

## Acceptance checklist

- [x] One versioned BookSpec reaches outline, planning, writing and every editor.
- [x] Actual chapter count and local plans drive chapter roles and final review.
- [x] Accepted-text StoryState tracks evidence, knowledge, relationships, events and promises; plans are not facts.
- [x] Full-content review returns passed / failed / not_checked; critical issues prevent acceptance.
- [x] Bounded targeted repair, version history, dependency invalidation and metadata refresh follow every accepted edit.
- [x] Run checkpoints persist settings, provider, stage, candidates, accepted versions and canon outside React.
- [x] Book-level structural review covers all chapter evidence and planned payoffs before line editing.
- [x] Whole-scene writing is available alongside slot writing for controlled comparison; no unmeasured quality claims.
- [x] Remove blind rewrites, random action insertions, proper-name bans and numeric success-as-quality scores.
- [x] Update UI, documentation and retire superseded production paths after migration.
- [x] Regression tests: short/long books, knowledge leakage, missing content, interruption, early revision, ending preservation.
- [x] Live manuscript revalidation completed: three chapters accepted, structural and final reviews passed, and final export verified. Thinking is disabled at every stage; GLM writes prose and a capability-tested local Granite model validates structured output. Build, TypeScript and 78 tests pass.

## Sequence

1. Domain contracts, canonical state and review gates.
2. Resumable run engine with structural and targeted editorial passes.
3. Hook/UI migration and complete BookSpec controls.
4. Legacy-route cleanup and controlled comparison harness.
5. Regression suite, live verification, documentation and requirement-by-requirement completion audit.

## Baseline

Seven test files / 46 tests and TypeScript passed during the audit. Existing dirty files:
services/ollamaService.ts, tests/ollamaService.test.ts, tests/parserUtils.test.ts,
utils/agentCoordinator.ts, utils/parserUtils.ts, utils/synthesisAgent.ts.
These changes are user work and must be preserved.

## Follow-up audit, 2026-09-08

Replaced permissive malformed-review fallbacks and acceptance after exhausted repairs with explicit failure states. Preserved existing manuscript versions, invalidated historical acceptance claims, rejected ambiguous JSON and ungrounded citations, and required successful terminal Ollama stream records. Thinking is disabled for every model and stage. Live probes proved `glm-5.3-flash:cloud` cannot reliably obey JSON Schema with thinking disabled, so prose and validation now support separate frozen providers; `granite4.2:8b` passed the structured-output capability test and completed the book reviews. The restored three-chapter manuscript completed with revisions 9/8/8 under explicit cloud permission. A live scene-treatment comparison completed with separate A/B prose samples. Both modes produced text; no quality advantage has been established. The first harness measurement omitted a failed synthesis attempt; the harness now records failed calls too, so those initial durations must not be presented as total cost.
