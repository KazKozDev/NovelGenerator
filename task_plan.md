# Task Plan: Preventive literary-quality architecture

## Goal
Implement and verify all eight agreed architecture improvements without replacing the existing accepted-text and provenance guarantees.

## Next Step
Deliver the completed implementation and verified outcomes.

## Current Phase
Complete

## Phases

### Phase 1: Architecture map and contracts
- [x] Trace the production call graph for scene writing, repair, final review, and persistence
- [x] Build a field-to-consumer inventory for every scene-plan field
- [x] Record compatibility constraints and existing user changes
- **Status:** complete

### Phase 2: Whole-book texture and voice registry
- [x] Add deterministic book-wide metrics and chapter-series trend findings
- [x] Persist a measured voice registry including used imagery and constructions
- [x] Feed bounded actionable voice history into later scene prompts
- [x] Add the one-question prose-level repetition reading to final review
- **Status:** complete

### Phase 3: Prompt contracts and decisive-scene selection
- [x] Represent writer prompt sections with names and budgets
- [x] Record prompt relevance and section-size telemetry
- [x] Generate two candidates only for high-narrative-weight scenes
- [x] Select deterministically without allowing selection to mutate accepted prose
- **Status:** complete

### Phase 4: External calibration and plan-field ownership
- [x] Add a versioned, reproducible external-prose benchmark file containing metrics only
- [x] Combine external and internal reference points without pretending they are interchangeable
- [x] Remove or wire every orphaned plan field, with contract tests
- **Status:** complete

### Phase 5: Integration, migration, and verification
- [x] Update architecture documentation and defect cards
- [x] Verify legacy checkpoints remain readable
- [x] Run focused tests, full tests, typecheck, and production build
- [x] Review diff boundaries and preserve unrelated work
- **Status:** complete

## Key Questions
1. Which existing run structures can accept optional telemetry without checkpoint migration?
2. Where can a second scene candidate be selected using measurements already available before chapter review?
3. Which plan fields are genuinely unconsumed in the production path?
4. How can whole-book model reading remain bounded while still reading prose rather than the registry?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Keep all new persisted fields optional | Old IndexedDB checkpoints must continue loading without migration failures. |
| Treat candidate selection as a high-weight-scene policy, not a second repair loop | This bounds cost and cannot damage the first candidate. |
| Store only external corpus measurements and source metadata | The repository does not need to redistribute published prose. |
| Preserve `tests/_scratch.test.ts` untouched | It predates this task and belongs to the user. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Gutenberg hard-wrapped lines were counted as paragraphs, producing a false 12-word median | 1 | Normalize soft line wraps inside blank-line-delimited paragraphs before measurement. |
| A large review.ts patch missed the actual import context | 1 | Split the patch and apply against the exact current imports and function body. |
| Type predicate widened a scene outcome union to string; one legacy assertion expected exact prompt wording | 1 | Preserve the union with `NonNullable` and restore the established structural-review phrase. |
| Two new unit fixtures requested a one-chapter BookSpec, below the product minimum; untyped mock exposed no call tuple | 1 | Keep the fixture run at the three-chapter minimum and type the mock prompt parameter. |
| Two multi-file patches failed because one hunk had invalid syntax and another used stale test context | 1 | Re-read exact anchors and applied one corrected patch; no partial changes landed. |
| Whole-book prompt telemetry read `.length` from `JSON.stringify(undefined)` on a legacy fixture without a blueprint | 1 | Serialize absent optional blueprint as `null`, matching the prompt's prior behavior. |
| Sandboxed live probe could not reach the separately started localhost Ollama service | 1 | Reran the bounded probe with approved local-network access; both candidates completed. |

## Notes
- The executable defect registry was completed before this plan and remains Phase 5 input.
- No improvement percentage will be claimed without a live comparative evaluation.
