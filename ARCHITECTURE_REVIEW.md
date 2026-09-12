# Generator Architecture Audit — September 2026

Audit of the active codebase and saved three-chapter manuscript. The commercial success of a book cannot be proven by architecture or model evaluation alone. Below are verifiable results, architectural boundaries, and completed fixes.

## 1. Architecture Map

| Module | Responsibility | Input → Output | Status |
|---|---|---|---|
| `contracts.ts` | Fixed authorial contract | User Settings → BookSpec | Implemented |
| `engine.ts`: outline/plan | Conflict, characters, promises, scenes | BookSpec + approved outline → Blueprint & chapter plans | Implemented; semantic depth checked by model |
| `writer.ts` | Scene prose generation | Plan + prior canon → Prose candidate | Implemented; quality comparison requires human readers |
| `review.ts` | Validation and evidence extraction | Full chapter → Findings and exact quotes | Fixed acceptance of unverified outputs |
| `storyState.ts` | Story canon and version dependencies | Accepted prose + verified quotes → StoryState | Fixed invalidation cascade and candidate selection |
| `engine.ts`: globalReview/lineEdit | Structural and targeted editing | Evidence ledger & findings → New versions → Re-verification | Capped cycles without auto-accept on exhaustion |
| `runStore.ts` | Persistence and resumption | Run state ↔ IndexedDB | Versions persisted; isolated browser session storage |
| `presentation.ts` & React | UI and manuscript export | Run snapshot → Chapters, statuses, final manuscript | Incomplete candidates block final export |
| `ollamaService.ts` | Model streaming delivery | Request → Completed stream | Errors, aborts, and token limits treated as failures |

Workflow: settings → approved outline → blueprint → chapter plans → scenes → chapter candidate → review → extract verified facts → acceptance → next chapter → structural review → targeted line editing → final review → export. In Forward-Only mode, past chapters remain sealed to eliminate endless cascade loops.

## 2. Structural & Logical Refinements

- In earlier handling of editor responses, malformed JSON could collapse into an empty findings list. `review.ts` now uses `not_checked`, and unverified quotes trigger rejection.
- Attempt exhaustion previously risked accepting flawed chapters. `engine.ts` halts the process for intervention; `storyState.ts` separately verifies acceptance predicates.
- Accepted status previously hid newer unverified candidates. Next chapter selection and final export now explicitly account for pending candidates.
- Prior checkpoints contained statuses derived from weaker checks. Migration preserves prose and version trees while enforcing re-verification.
- Ollama streaming responses verify transport errors, terminal records, and stop reasons; fallbacks are restricted to unsupported endpoints.
- Separation of reasoning channels: structured output parsing isolates system reasoning from actual creative prose.

## 3. Literary Quality Alignment

All core criteria are integrated into planner and editor specifications:

| Criterion | Support | What the Editor Evaluates |
|---|---|---|
| Story Arc | Plans and protagonist transformation | Causality and convincing transitions |
| Central Conflict | Explicit blueprint field, stakes, and fallout | Resistance depth and choice consequence |
| Chapter Pacing | Scene staging, local and global checks | Rhythmic variety, eliminating narrative drag |
| Character Depth | Desires, needs, contradictions, relations | Individuality and psychological plausibility |
| Dialogue | Idiolects, speech map, line editing | Subtext and distinguishable voices |
| Style & Voice | Language, POV, tense, tone settings | Voice stability and freshness of imagery |
| Emotional Hooks | Choices, cost, fallout, scene openings | Authentic engagement without cheap cliffhangers |
| Resolution | Mandatory promises and payoff evidence | Emotional earnedness of conclusion |
| Target Audience | Contract fields and editor review | Alignment with readership profile |

System limitation: exact quote matching proves the presence of a textual fragment, but not correctness of interpretation. The global reviewer operates over the evidence ledger; individual chapters are checked comprehensively.

## 4. Remediation Plan

1. **High — Completed:** Prevent erroneous acceptance, isolate reasoning channels, preserve full revision history, and enforce dependency checks.
2. **High — Completed:** Verify end-to-end multi-chapter runs, validate required payoffs, and verify manuscript export.
3. **Medium — Implemented:** Targeted edits based on cited findings instead of wholesale regeneration, preserving authorial voice.
4. **Medium — Forward-Only Mode:** Enforce forward-only pipeline discipline to avoid cascading backward invalidations.
5. **Ongoing:** Whole-book human editorial evaluation for character depth, consequences of choices, and emotional payoff.

## 5. Quick Guidelines

- Specify exact language, POV, tense, and stylistic preferences before starting a run.
- Approve the resolution in the master plan, including the protagonist's price of choice.
- Fix specific sections via chapter editing with dependency checking rather than full rewrites.
- Preserve successful revisions; avoid unbounded automated rewriting loops.
- Separate technical verification results from subjective reader enjoyment.
