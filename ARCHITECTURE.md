# Architecture

## Main-page workflow: book plan and chapter prompts

New projects use `generation_mode: prompts`: `App → useBookGenerator → utils/novel/promptBook`. The selected author model first designs one shared blueprint, then expands chapter briefs in batches of four against that blueprint. Four chapters require two successful model calls. This stage never writes manuscript prose or invokes scene observers, readers or editors.

The original `ProjectInput` and complete `StorySettings` are kept separately from model additions. `AuthorDraft.promptPlanning` holds the blueprint, revision and chapter prompts, so normal project autosave, import/export and recovery preserve progress. Structural validation rejects missing chapters, invalid dependencies and misplaced revelation IDs; it does not guarantee literary or semantic consistency. A failed batch leaves earlier valid batches available to resume. Editing the blueprint increments its revision and marks all old prompts stale until regenerated; manual prompt changes are explicitly marked and preserved until that regeneration. The workspace exposes the plan, individual prompts and downloads. Planned starting states will need reconciliation with actual prior prose when chapter writing is implemented.

## Legacy Craft 2.0 engine

A book is crafted using the 2-layer Craft Engine (`utils/novel/craft/craftOrchestrator.ts`).

## Workflow

```
App → useBookGenerator → utils/novel/v2/orchestrator.ts → utils/novel/craft/craftOrchestrator.ts
```

The generation pipeline consists of two decoupled, robust layers:

1. **Strategic Layer (The Master Blueprint & Projection Matrix)**
   - **Dossier Generation**: Establishes 4 Layers of Truth (World Rules, Hidden Mechanics, Character Desires/Flaws, The Climax Principle).
   - **Projection Matrix & Scene Cards**: Deconstructs chapters into structured Scene Cards based on Swain's Scene-and-Sequel pulse (Goal → Conflict → Disaster; Emotion → Dilemma → Decision), Value Charges, Stakes, and Prop Anchors.

2. **Execution Layer (Scene Enactment, Micro-Pacing, Observer & Blind Reader)**
   - **Scene Enactment**: The Writer model executes scenes beat-by-beat according to the Scene Card specifications.
   - **Observer Review**: Post-enactment sensory and grounding validation verifying physical causality, dialogue subtext, and prop continuity.
   - **Blind Reader**: Simulates real reader expectation and hypothesis tracking after each chapter without knowledge of future secrets.
   - **Dual Audit**: Developmental review and literary pass evaluating whole-manuscript dramatic tension, voice consistency, and premise fidelity.

## Storage and Persistence

- `utils/novel/v2/store.ts`: In-memory and persistent project stores.
- `utils/novel/v2/persistent.ts`: IndexedDB local state persistence.
- `utils/novel/author.ts`: Holds shared author types (`AuthorDraft`, `DeskState`, `cleanChapter`, `wornPhrases`).
- `utils/novel/deskTabs.ts`: Formats the five inspector panels (`Dossier`, `Scene Cards`, `Observer`, `Reader`, `Reviews`).
- `utils/novel/similar.ts`: Fallback similarity and embedding configurations.

## Bestbook revision and final delivery

`craft/editorial.ts` runs focused manuscript reviews with verbatim chapter evidence. Architecture, reader promises, genre, opening and actual word-based structure precede line editing, copyediting and proofreading. A focus may apply one coordinated replacement sweep, followed by rechecking. Unresolved architecture stops prose polishing. A final read-only sweep checks all focuses on the last saved text. `runCraftEditorial` edits existing chapters and archives their source; it does not invoke dossier generation or scene drafting. Automatic post-draft editing uses this same path. Its persisted active marker sends an interrupted run back to editing through Continue, preserving the original source archive.

`craft/projection.ts` batches large projections, validates scene ordering and knowledge dependencies, and repairs/rechecks preflight findings before drafting. Uncertain semantic objections are advisory; demonstrated contradictions and unavailable preflight reviews stop drafting with the latest valid packet preserved. Repairs may coordinate scenes, facts, initial character knowledge and dossier clarifications. Continue reuses a saved pre-draft packet instead of generating a different plan. `craft/observer.ts` validates source IDs against the scene version being reviewed and makes factual findings, unchanged polarity, repetition and large word-count drift eligible for local repair. The second observer call is built from the replacement prose.

`craft/metrics.ts` records intended question/prop timelines, actual chapter word positions and the opening sample. Final reader maps and turning points are independently extracted from manuscript excerpts, checked for source validity and order, and saved with the reviews. These are model interpretations with code-verified provenance.

`craft/readerTools.ts` provides optional series planning, three blind simulated reader perspectives and comparisons against supplied source notes. `ReaderTools.tsx` provides browser read-aloud. No human feedback or approval step is used. Saving EPUB/PDF uses existing author metadata without an extra confirmation dialog.

Final status comes from unresolved findings, unavailable checks, manuscript completeness and actual length. Full findings and check failures appear in the final screen. Review history and original sources remain in portable project exports. The detailed scope and verification boundaries are in `BESTBOOK_ROADMAP.md`.

Observer responses use a compact source-reference schema and one fixed-budget protocol recovery. A truncated or invalid response never becomes a passing receipt: after two failures generation stops with the scene saved and its observation still pending for Continue. Scene prose and pending/completed observation checkpoints are saved before validation; Continue reuses these scene files, preserving completed scenes and retrying pending observations without regenerating their prose.

`novel/manuscript.ts` owns chapter-body normalization and canonical assembly. Duplicate numbered labels are removed from chapter bodies without deduplicating fictional paragraphs. Restoration migrates existing manuscripts with a preserved source/report backup. EPUB/PDF parse the same canonical chapter headings, with or without subtitles, and do not infer chapter count from embedded model labels.

Original Craft 2.0 developmental and literary audit checklists and result fields are restored in `craft/baselineReviews.ts`. They supplement the new editorial focuses before repairs and in the final exact-manuscript audit. Grounded findings enter the same repair/report path; raw assessments are retained. The old unconditional passed flags are not used as evidence of successful checks.

The restored fixed layout is three chronological scenes per chapter, with scalable word budgets. `craft/blindContext.ts` isolates writer input through a field allowlist: no global premise/dossier/preflight review or future-reader fields. An independent blind reader receives committed prose before each scene; the original after-chapter reader remains additional. Model-authored initial knowledge and current-scene directives remain semantic assertions and are subject to review. Invalid causal links, missing conflict layers, missing polarity turns, future fact references and incorrect chapter slots are rejected before drafting. Existing incompatible manuscripts are preserved without replanning.

## Sequential author engine (implementation in progress)

New projects use `craft/planning.ts`: contract, form, logline, concept, objective events, character engines, independent opposition, beats, promises, reverse-engineered setups, revelations, pacing, and a causal scene graph. `packet.json` is a compatibility projection of this authored architecture. The full guide is no longer loaded into model prompts; `craftRules.ts` supplies operation-specific instructions.

`craft/state.ts` persists versioned operations, input/recipe/output SHA-256 bindings, atomic operation receipts, historical artifacts and dependency invalidation through the existing project store. `runtime.ts` prepares present-scene execution from enacted consequences, reader adaptation, world constraints and character-specific knowledge, then commits evidence-backed outcomes. Hybrid and discovery modes may revise unwritten connective routes while preserving committed history and protected tentpoles.

`revision.ts` creates one structural plan for all affected scenes and stages replacements before `ProjectStore.commitRevision` applies a complete book revision. Existing-book recovery distinguishes quoted observations from unknown mechanisms and proposed repairs. Long books use chapter evidence digests, batched structural planning and incremental blind-reader memory. Their summaries remain fallible interpretations, not proof of literary correctness.

The implementation and live-run limitations are recorded in `BESTBOOK_ENGINE_PROGRESS.md`. The user goal remains incomplete until a real full draft has been generated, read and audited against the entire plan.

### Scene continuation integrity

Scene seams are finalized before observation and enacted-state extraction, including after a repair. Checkpoints bind the observation and finalized prose to their text revision and the preceding scene revision; Continue reuses an unchanged seam and rechecks old unbound observations. Raw writer output is saved before seam editing so interruption does not require regeneration. No prose mutation occurs after the scene observation and state commit.

The author writer receives the full committed prefix of its current chapter (the preceding two scenes at a chapter boundary), plus source-bound prior events, resource changes and relationship changes. The execution planner reconciles the current card with evidenced history. Completed milestones come from committed event quotes, or observed paragraph sources in legacy mode, never directly from planned card actions. Resources and relationships require the same prose-evidence validation as events and acquisitions. These checks establish provenance and revision consistency; model judgments still determine whether an event or consequence is semantically correct.
