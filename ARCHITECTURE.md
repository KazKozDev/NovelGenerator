# Architecture: Craft 2.0 Engine

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
