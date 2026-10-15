# Bestbook implementation roadmap

The numbered scope follows the thirteen gaps identified in the project review. Implementations below are connected to the production Craft pipeline. Evidence-based model judgments remain fallible; a clean report is not a guarantee of literary quality.

| # | Implemented behavior | Primary verification |
|---|---|---|
| 1 | Whole-book reviews lead to a bounded repair sweep and fresh checks of revised prose. | `editorial.test.ts`: saved replacement is what subsequent reviews examine. |
| 2 | Findings, missing checks and incomplete manuscripts determine COMPLETE / COMPLETE_WITH_WARNINGS / PARTIAL. Full findings are visible in the final screen. | Report status, invalid evidence and rendered-report tests. |
| 3 | Edit saved book uses the existing manuscript; it never regenerates the dossier or scenes. Sources and history survive in project export. | Existing-book editorial integration test. |
| 4 | Architecture, reader promises, genre, opening and structure precede line editing, copyediting and proofreading. One repair sweep per focus; unresolved architecture stops polishing. Final checks audit the exact last revision. | Editorial ordering and failure tests. |
| 5 | Preflight findings receive a bounded plan repair and recheck. Remaining uncertain objections stay as advice. Demonstrated contradictions or unavailable preflight checks stop before drafting, retaining the saved plan for Continue. | Preflight repair, initial-knowledge correction, contradiction-stop, uncertainty continuation and saved-plan resume tests. |
| 6 | The post-repair observer receives the new scene, not the old prompt. | End-to-end Craft test records both observer requests. |
| 7 | Factual problems, unchanged polarity, repetition and large length deviations trigger repair; observer source IDs are validated. Remaining draft findings are retained separately from final reviews. | Observer validation, repair triggers, truncated-JSON recovery, missing-check stop and saved-scene resume tests. |
| 8 | Planned question/prop timelines are calculated. A separate final audit maps actual prose to reader questions, progress, closure and prop appearances with verified excerpts and chronology. | Promise-map chronology, active-question and source tests. |
| 9 | Exactly three consecutive scenes per chapter; scene word budgets scale with the requested word count. Large projections remain batched. Actual word count drift is reported. | Three-scenes-per-chapter validation, projection batching and actual-length tests. |
| 10 | A dedicated genre-contract audit checks required experiences/scenes and requested endings. Planning permits positive, negative and flat/testing arcs. | Focus routing and contract-preservation tests. |
| 11 | First 250 words and first 10% are measured and audited for hook, POV voice, disruption, genre signal, question, stakes and throat-clearing. | Opening-window and editorial focus tests. |
| 12 | Chapter positions and cited turning points are calculated from actual word counts. Missing, invented or ambiguous landmark maps are reported as unavailable. | Unequal-chapter word positions and exact landmark tests. |
| 13 | Optional series architecture, three blind simulated reader perspectives, read-aloud controls, and source-backed comparable-book analysis. | Reader-tools tests and isolated browser workshop. |

## Operational boundaries

- Original Craft 2.0 developmental and literary audits run alongside the new editorial focuses, before repairs and against the final revision. Their original assessment fields are preserved; failures never become unconditional passed checks.
- Unavailable scene observations stop after protocol recovery; saved prose and pending checkpoints survive for Continue.
- A repair sweep is finite. It may finish with warnings; it does not loop until a model agrees with itself.
- Chapter replacements are staged as a complete sweep before they are applied. Source manuscripts and revision history remain in the project files.
- Final simulated readers receive published prose and genre only, without the premise, dossier or future notes. They are not human beta readers.
- Generation, editing and review run autonomously. There is no human-feedback or human-approval step. Export uses existing author metadata or Unknown Author without a name-confirmation dialog.
- Comparable-book analysis uses supplied source notes; it does not claim to have researched unprovided books.
- Read aloud uses browser speech synthesis and reports lack of browser support or playback errors.
- Automated tests use scripted model responses. Browser verification uses `tests/fixtures/reader-workshop.html`, which has no access to the project store or provider credentials. A complete new novel has not been generated against a paid model as part of this verification.

## Checks

`npm test`, `npm run typecheck`, `npm run build`.

Application type checking includes current source, tests and fixtures. Historical experiment scripts in `runs/` retain references to the removed v3 engine and are excluded by `tsconfig.app.json`.

Chapter headings are owned by canonical assembly, not model prose. Saved books with duplicate labels are migrated with a source backup. EPUB and PDF both accept numbered headings with or without subtitles.

## Restored screenshot architecture

Dossier → Scene Cards → Preflight → (Blind Reader → Blind Write → Observer) per scene → original Dual Review plus additional editorial focuses. The original post-chapter reader is retained as an extra check.

The writer receives an allowlisted current-scene view, referenced earlier facts confirmed as known, facts acquired in the present scene, initial POV knowledge and recent committed prose. Global premise, author requirements, dossier, preflight commentary, future cards, reader predictions and fact provenance are excluded. Applicable style requirements are projected into current-scene writerDirectives. This isolates input channels; semantic mistakes inside model-authored current-scene fields still require observer/editor review.

Incomplete drafts with an incompatible saved layout are preserved and stopped with guidance to edit the saved book or start a fresh project. They are never silently replanned over existing prose.
