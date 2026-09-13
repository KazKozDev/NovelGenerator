# Progress Log

## Session: 2026-09-12

### Phase 1: Architecture map and contracts
- **Status:** complete
- **Started:** 2026-09-12 18:35 Europe/Madrid
- Actions taken:
  - Read the full `planning-with-files` skill and its three templates.
  - Captured all eight requested architecture changes as five implementation phases.
  - Recorded compatibility and dirty-worktree constraints.
  - Traced `NovelRun`, `ChapterRecord`, `writeScene`, the scene-generation loop, and `reviewBook`.
  - Confirmed the whole-book model pass reads the ledger rather than accepted prose.
  - Audited every `DetailedScene` property by exact production use.
  - Downloaded three official Project Gutenberg texts to temporary files for external calibration.
  - Replaced the unused legacy scene-plan builder with a compile-time active-field ownership map.
  - Removed `duration` and `mood` from the current planner schema while keeping old checkpoint fields optional.
- Files created/modified:
  - `types.ts`
  - `utils/novel/continuity.ts`
  - `utils/novel/engine.ts`
  - `tests/continuityArchitecture.test.ts`

### Phase 2: Whole-book texture and voice registry
- **Status:** complete
- Actions taken:
  - Added external-corpus metric data and a reproducible measurement script.
  - Added book-wide prose metrics, chapter-series findings, and a measured voice registry.
  - Fed bounded voice history into later scene prompts.
  - Added optional checkpoint fields for quality and prompt telemetry.
- Files created/modified:
  - `benchmarks/external-prose-v1.json`
  - `scripts/measure-prose-benchmark.ts`
  - `utils/novel/bookQuality.ts`
  - `utils/novel/promptContract.ts`
  - `utils/novel/contracts.ts`
  - `utils/novel/writer.ts`

### Phase 3: Prompt contracts and decisive-scene selection
- **Status:** complete
- Actions taken:
  - Added named per-section budgets and persisted relevance-share telemetry to scene and whole-book prompts.
  - Added two-draft deterministic selection for editorial scenes weighted 4 or 5.
  - Persisted chosen index and measurement scores without storing discarded prose.

### Phase 4: External calibration and plan-field ownership
- **Status:** complete
- Actions taken:
  - Measured three public-domain English novels and stored aggregate metrics, URLs, method, and source hashes only.
  - Required book-wide syntax findings to exceed both internal and external reference values.
  - Replaced inactive expanded plan fields with a compile-time ownership map for current fields.

### Phase 5: Integration, migration, and verification
- **Status:** complete
- Actions taken:
  - Documented the complete architecture in `ARCHITECTURE.md`.
  - Kept new checkpoint state optional and cleared derived state when checkpoint reconciliation invalidates chapters.
  - Preserved the pre-existing untracked `tests/_scratch.test.ts` unchanged.
  - Completed focused and full verification.
  - Ran a bounded live two-candidate probe with local `qwen3.5:4b`, then stopped the temporary Ollama service.
  - Candidate generation completed in 23.3s and 35.2s; candidates measured 423 and 352 words.
  - Both had zero major deterministic findings and satisfied the dialogue requirement; candidate 2 won on target deviation (0.173 vs 0.410).
  - Both prompt records measured 14,155 characters total, 3,833 focus characters, relevance share 27.08%, with no section budget overrun.
- Files created/modified:
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### Prior completed work: Defect registry
- **Status:** complete
- Actions taken:
  - Added four evidence cards and a generic executable regression test.
  - Ran 410 tests, TypeScript typecheck, and production build successfully.
- Files created/modified:
  - `defects/README.md`
  - `defects/cases/*.json`
  - `tests/defectRegistry.test.ts`
  - `ARCHITECTURE.md`

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| Defect registry | `npm test -- tests/defectRegistry.test.ts` | Four cards execute | 5 tests passed | pass |
| Full suite baseline | `npm test` | Existing and new tests pass | 410 tests passed | pass |
| Typecheck baseline | `npx tsc --noEmit` | No errors | No errors | pass |
| Build baseline | `npm run build` | Production bundle builds | Built with existing chunk-size warning | pass |
| Whole package final | `npm test` | All tests pass | 417 tests passed | pass |
| Typecheck final | `npx tsc --noEmit` | No errors | No errors | pass |
| Production build final | `npm run build` | Bundle succeeds | Succeeded with existing chunk-size warning | pass |
| External benchmark | `npm run benchmark:prose -- /tmp/...` | Stored metrics and hashes reproduce | Exact metrics and SHA-256 values reproduced | pass |
| Diff hygiene | `git diff --check` | No whitespace errors | Clean | pass |
| Live decisive-scene probe | `npm run probe:scene -- qwen3.5:4b` | Two drafts, deterministic choice, telemetry | Candidate 2 selected; two prompt records captured | pass |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-09-12 18:45 | External corpus paragraph median was 12 because hard wraps were treated as paragraphs | 1 | Added Gutenberg line-wrap normalization before rerunning measurement. |
| Now | Review integration patch did not match the current import list | 1 | Reapplied as a smaller patch against exact lines. |
| Now | Typecheck failed on widened outcome predicate; one safety test failed on changed prompt wording | 1 | Narrowed with `NonNullable` and restored the tested ledger-copy phrase. |
| Now | Two book-quality tests used an invalid one-chapter BookSpec; mock call was untyped | 1 | Raised fixture spec to the product minimum and typed the LLM mock. |
| Now | Benchmark/helper patch failed twice on patch syntax and stale context | 1 | Verified no partial application, then applied against exact anchors. |
| Now | Full suite exposed a legacy run without a blueprint failing before its review call | 1 | Made prompt telemetry serialize the optional blueprint as `null`. |
| Now | First live probe could not access localhost from the sandbox | 1 | Repeated with approved localhost access; both generations completed. |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | All five phases complete. |
| Where am I going? | Delivery. |
| What's the goal? | Implement and verify all eight agreed improvements. |
| What have I learned? | See `findings.md`. |
| What have I done? | Implemented and verified all eight architecture changes. |
