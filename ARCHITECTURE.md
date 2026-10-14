# Architecture

A new book is written at the author's desk.

Drafting moves forward. Starting a chapter locks every earlier chapter against write, append, change/edit and plant, including edits whose file is resolved by a whole-book search. Only the current chapter remains editable; done locks the entire manuscript. The furthest chapter started is persisted and inferred from existing saved chapters on resume. Reading old chapters remains allowed. Notes guide future scenes but cannot supersede enacted facts; this semantic constraint is an author instruction, whereas chapter text locks are enforced by code. Late problems remain in the report for a separate editorial pass; no editorial pass is started automatically.

`Edit book` explicitly starts a separate editorial pass through `Orchestrator.runEditorial`. It requires a complete saved draft and report with unchanged book input. The selected author model edits; the selected reader model performs the final audit. `desk.editorial` preserves the source file texts and source report; previous editorial sources are retained in `editorial_history`, included in project export. An interrupted pass resumes its saved allowance and source. All chapters are editable together during this pass; earlier drafting locks still apply outside it. The editor receives the whole desk and the fallible source report, has a fresh `6 + chapters × 3` allowance plus the existing optional three calls, and chooses coordinated repairs. Automatic plan reviews and pre-ending reader calls are disabled for editing. On completion or exhaustion, the resulting manuscript is audited once and locked again. The source remains available in the exported project; there is no automatic rollback or automatic second pass.

`App → useBookGenerator → utils/novel/v2/orchestrator.ts → utils/novel/v3/authorDesk.ts`

The form sends a premise, chapter count, rough length and author's requirements. The author owns its notebook, plan, dossier, hidden envelope, dramatic intentions and chapter files. It chooses when to write, revise, search, ask a character, keeper or reader, and finish.

## Writing and dramatic intentions

The desk's creative allowance is `6 + chapters × 3` calls, with three more available once on request. Code divides chapters into three acts and requires the named shape in `drama.md` and `plan.md`: turns, stakes, question, gun, false victory, irony, want, need, decisive action and what each chapter newly reveals.

These lines describe events, not sentences that must appear in the prose. The production desk uses the parsers and act ranges from `drama.ts`; its legacy lexical matching helpers are not completion checks. No missing-word hints demand that the author copy planning language into a chapter. Plants and the current reader expectation are also submitted as semantic obligations.

`envelope.md` describes hidden events and their clock. It is a factual reference for the author, not a requirement to reproduce every clock line in the final chapter. The early clock reading is advisory; it does not replace a full-manuscript check.

## Premise fidelity before chapters

Before storing a chapter, `premisePlan.ts` compares the current notebook, plan, envelope, drama and dossier with the publisher's premise. It checks central promised events and the twist, allows creative details and defensible interpretations, and requires references to exact source sentences and note lines for a conflict. Code extracts the quotations from these IDs, so the reader does not have to transcribe them.

An incompatible assessment format receives one repair attempt from the same configured reader. No second model confirms findings. The comparison with the premise is advisory: it runs after executed author actions, never vetoes chapter storage and never puts the author into a forced repair mode. Updated notes may receive fresh feedback. Conflicts, uncertainty and failed reviews remain in the report. The author decides whether to act on them.

## Reserved whole-book checks

`bookAudit.ts` makes four separate validator checks outside the author's writing allowance:

1. The existing `continuityDiscovery.ts` reads every manuscript paragraph, within and across chapters, including the final reconstruction against earlier scenes. Exact source quotations are validated. Errors, uncertainties, dropped threads and invalid evidence remain distinguishable.
2. Dramatic obligations are assessed against cited scenes, including setup/payoff order, genuinely new revelations and premature disclosure. Different wording can fulfill an event. Planning commentary cannot serve as scene evidence.
3. Causality is assessed separately: actions, coordination, means, opportunity, evidence and the support for the ending. An asserted reconstruction or conviction requires its causal links. This check also looks for editorial commentary printed as fiction.
4. The premise and publisher requirements are assessed separately. A metaphor that replaces a promised literal action is not silently accepted as fulfillment.

The complete-book audit runs once after the drafting loop ends, on done or exhaustion. Its findings go only into the final report and never return the author to drafting. Each of the four checks may recover once; this is bounded protocol recovery, not a revision cycle. Editing is a separate pass, not started automatically. Stale reader responses remain in saved history but are excluded from active author feedback; the pre-ending response expires when the ending is written. The outer orchestrator still bounds total calls and elapsed time.

The audit cache stores its exact inputs: chapter prose, parsed dramatic definitions and publisher input. Administrative note changes do not invalidate it; chapter, obligation or input changes do. Notes not read by these manuscript checks are excluded from the key. The earlier premise-plan gate has its own cache for note changes. Required checks never silently fall back to an apparently clean result after a transport or parsing failure. A configured validator is used when available; otherwise the host may serve that route with the writer model. Semantic judgments remain model judgments, with machine-validated quote provenance.

## Completion and storage

The report includes all final unresolved findings with source references and unavailable checks. `COMPLETE` requires every requested chapter, the named shape and no unresolved audit findings or failures. Otherwise a full manuscript is `COMPLETE_WITH_WARNINGS`; missing chapters produce `PARTIAL` and the draft is not marked completed. Resuming a partial saved book preserves its pages and journal and starts a fresh writing allowance; the previous allowance remains recorded in the journal. Exhausting the writing allowance alone does not mean a clean review.

`store.ts` saves the desk, manuscript, audit and report. `persistent.ts` writes snapshots to disk and IndexedDB; `export.ts` carries the same slot in portable JSON. The CLI writes `report.json` beside its chapter files and logs the actual review status.

React renders the saved desk and report. It does not choose the author's next call. Continuity scripts remain available for independent offline evaluation as well as the integrated final check.

Final manuscript findings carry confirmed, refuted or insufficient_data status. The configured reader supplies a structured self-check of entity, event, time, factual status, incompatibility and later explanations in the same call. Code extracts cited paragraphs by ID and checks protocol consistency; source validation does not prove semantic truth. Confirmed findings are grounded repair suggestions, not commands; the author controls the next action. Refuted findings remain in the report without affecting completion; insufficient_data findings remain visible and cause warnings. Legacy unstructured errors are insufficient_data, never mandatory repairs. Cached audits from the older protocol are invalidated.

Each final check receives a source-reference schema whose allowed IDs come from the actual manuscript. Evidence is extracted by code, never matched approximately. An invalid source, malformed response or transport failure receives at most one recovery attempt by the same reader, outside the creative budget. Valid assessments survive recovery; a rejected allegation disappearing from a retry is not a clean pass. Eight outer calls are reserved for the four checks and their possible recoveries. Recovery diagnostics are saved with the audit.

Mutation actions receive code-generated APPLIED, ALREADY IDENTICAL or NOT APPLIED receipts. Failed mutations stop remaining actions in the same answer, including done. Rejections persist on the desk and in a warning report until the same edit succeeds or the affected chapter is rewritten; an unrelated edit does not clear them. The bonus of three writing calls remains unchanged.


Final audit output limits are fixed. The browser gateway skips generic output-room doubling for reserved audit stages, and the Hugging Face transport disables its internal length-limit repeat for these calls. The audit layer owns one recovery with compact JSON instructions at the same token limit; persistent truncation remains an unavailable check.

The author controls writing order and completion. Missing dramatic labels are reported but do not prevent chapter writing. Reader objections and whole-book checks cannot refuse done. Deterministic tool receipts, file matching, budget accounting, caching and evidence provenance validation remain active; an unexecuted tool action is never represented as applied.

`writingCraft.ts` supplies the autonomous author with a craft reference: three acts as changing strategies, flexible story-length landmarks, scene goals/resistance/consequences, reaction leading to decisions, and a climax enacted with consequences. It distinguishes motifs from replayed scenes and connects mystery revelations to prior evidence. This is prompt guidance only: no new stages, calls, required fields, tool restrictions or acceptance gates. Existing chapter allocations are displayed as approximate suggestions.

Craft references used in the adaptation: K. M. Weiland, [connecting plot points](https://www.helpingwritersbecomeauthors.com/connect-plot-points-keep-story-moving/); Jessica Brody, [novel beat-sheet starter kit](https://www.jessicabrody.com/wp-content/uploads/2020/01/Save_the_Cat_Writes_a_Novel_Starter_Kit_v6.pdf); Randy Ingermanson, [scene structure](https://www.advancedfictionwriting.com/articles/writing-the-perfect-scene/) and [Snowflake method](https://www.advancedfictionwriting.com/articles/snowflake-method/); Story Grid, [five elements of dramatic movement](https://storygrid.com/articles/five-commandments-of-storytelling). The guidance is an adaptation, not a claim that every novelist uses one method.

The craft reference also covers the story’s experiential promise, external goals and internal strategy, varied character arcs, gradual plan expansion, scene/reaction rhythm, escalation through consequences, costly dilemmas, preparation and payoff, separate truth/character-belief/reader-knowledge states, motifs with changed meaning, and beginning/end relationships. Short examples illustrate principles without supplying a plot for the requested book. The reference is injected into the existing author system prompt; it adds no workflow stage or model call.

Writing or appending the hidden clock no longer invokes an automatic keeper call. The author may request that perspective with ask_keeper. During a paid author response, budget guidance distinguishes the already charged current answer from future calls; zero future calls does not prevent the current writing action. Advisory feedback explicitly acknowledges possible reader errors and invented requirements. Chapter cleanup strips standalone EOF delimiters and known LEARN/execution-report footers while retaining quoted fictional text.
