# Findings & Decisions

## Requirements
- Preserve the completed first-class defect registry.
- Add a deterministic whole-book pass and one model read over actual prose for repetition.
- Replace repair pressure with two-candidate selection for decisive scenes only.
- Add versioned external published-prose calibration using metrics, not redistributed text.
- Enforce one consumer per scene-plan field.
- Carry book voice/style history forward to the writer.
- Turn prompt sections and relevance share into measurable contracts.
- Preserve current canon, provenance, repair guards, checkpoint compatibility, and unrelated work.

## Research Findings
- Production entry is `App -> useBookGenerator -> utils/novel/engine.ts`.
- `ARCHITECTURE.md` confirms full-prose chapter review but registry-only whole-book review.
- Existing deterministic measurements live in `utils/novel/prosody.ts`; repair guards already compare before/after.
- Existing `alreadyTold` carries semantic content forward, but no persisted voice registry exists.
- Scene plan includes transition fields in `types.ts` and normalization in `continuity.ts`; actual consumption must be audited before removal.
- Existing untracked `tests/_scratch.test.ts` is user work and must not be edited.
- `NovelRun` and `ChapterRecord` already use optional additive fields extensively, so optional book metrics, voice state, prompt telemetry, and scene-selection records are checkpoint-compatible.
- `writeScene` still assembles one large anonymous string even though its data is already computed as conceptual sections (`spec`, prose craft, canon, plan, scene obligations, prior text).
- The scene loop has several immediate rewrite attempts (copy, restatement, apparatus, scene faults). Two-candidate selection must occur before these repair-like retries and must not double them.
- `reviewBook` currently proves the critique from the pasted analysis: it serializes the blueprint and evidence ledger and explicitly tells the model it is not reading prose.
- High narrative weight already exists on both scene plans and literary scene intents, and `sceneWordTargets` resolves the effective value. It is the natural bounded trigger for candidate generation.
- Transition fields are not uniformly unused: `initialState`, `continuityRequirements`, `prohibitedShortcuts`, and `exitHook` reach the writer; `shift`, `outcomeType`, `pov`, and speech carrier reach both writer and checks. `emotionalDelta`, `informationRevealed`, `informationWithheld`, and `characterDecisions` need a precise consumer audit.
- Exact property-use search changes that conclusion: the nine legacy transition fields are constructed only by `scenePlan()`, and that helper is called only by its unit test. Four names are copied opportunistically by `writeScene` if an old checkpoint happens to contain them, but the current planner schema cannot produce them. They are legacy compatibility data, not an active planning contract.
- `duration` and `mood` likewise have no production consumer and are no longer required, but remain in the public TypeScript interface and planner schema. They should be removed from newly generated plans while old JSON remains harmlessly readable.
- The active scene contract already replaces the orphan fields with `objective`, `conflict`, `keyMoments`, `outcome`, `shift`, `outcomeType`, `pov`, `staging`, and `freshConstraint`.
- Project Gutenberg provides official UTF-8 public-domain text endpoints for benchmark works. Three texts were downloaded to `/tmp` for measurement; only aggregate metrics and source metadata will enter the repository.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Reuse prosody primitives for book-wide analysis | Avoid a second inconsistent metric implementation. |
| Keep planning artifacts at repository root for this task | Required by the selected planning skill. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Gutenberg UTF-8 files are hard-wrapped for display, unlike generated manuscript paragraphs | Join lines within blank-line-delimited paragraphs before calling application metrics. |

## Resources
- `ARCHITECTURE.md`
- `utils/novel/engine.ts`
- `utils/novel/writer.ts`
- `utils/novel/review.ts`
- `utils/novel/prosody.ts`
- `utils/novel/contracts.ts`

## Visual/Browser Findings
- None.
