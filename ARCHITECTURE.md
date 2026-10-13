# Architecture

A new book is written at the author's desk.

`App → useBookGenerator → utils/novel/v2/orchestrator.ts → utils/novel/v3/authorDesk.ts`

The form sends a premise, a chapter count, a rough length and the author's requirements. The orchestrator gives the run a call budget and a clock, then hands the book to the desk. The desk is a set of files the author owns (`notebook.md`, `plan.md`, `dossier.md`, `envelope.md`, `drama.md`, and one file per chapter) and a few tools: write, append, plant, change, find, ask a character, ask the keeper, ask a reader, ask for more calls, done.

The author decides the order. The prompt does not.

## What code owns

- **Acts.** Chapters are split into three acts, about a quarter, the middle, and a quarter. One short book shares chapters across acts.
- **Debts.** `drama.md` names them in lines code can count: the turn of each act, three rising stakes, the question and its answer, a gun, the protagonist's last act, a false victory, irony, want and need, and what each chapter teaches. The plan's LEARN lines, the reader's WAITING FOR, a plant, and the clock in `envelope.md` are debts too.
- **The page.** A debt is met when its words stand in the chapter that owes them. The first wording is frozen. A later line with other words does not retarget it. A debt already found on the page stays if its line is deleted.
- **The budget.** The desk's own budget is `6 + chapters × 3` calls. While calls remain, `done` is refused if the shape is missing or a debt is open. When the budget is spent, the book is finished and the open debts are reported.
- **The outer stop.** The orchestrator also caps the run, above the desk's own count, so a runaway ends. Continuing a saved book starts that outer count again and keeps the pages.

## What the author owns

The prose, the notebook, the plan, the clock, and the wording of each debt. A reader is another model when one is configured, and the author's own model when it is not or when the other model will not read the page. Asking the keeper looks up what the book already says.

## What is stored

`utils/novel/v2/store.ts` holds the author's draft, the manuscript, the report and the run log. `persistent.ts` writes a snapshot to `autosaves/latest.project.json` and to IndexedDB. `export.ts` is the portable JSON of that same slot. Import replaces the live book.

The report is the desk's own count: chapters written, words, and the named obligations still open. Status is complete when the chapters exist and those obligations are met.

## What else is in the tree

`utils/novel/v3/drama.ts` is the ledger. `deskTabs.ts` is what the screen shows of the author's tools. `similar.ts` finds a line by meaning when the host can. Continuity scripts under `scripts/` measure a manuscript after the fact; they are not a step of writing the book.

React renders the saved desk. It does not decide the next call.
