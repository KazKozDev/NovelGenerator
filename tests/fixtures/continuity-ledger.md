# Assertion-ledger experiment

```sh
npx vite-node scripts/check-continuity-ledger.ts --books runs/nora-truth1,runs/nora-forward1 --out runs/continuity-ledger
```

The existing Qwen transport is used. The default experiment budget is 128 calls, with source windows of about 1,300 words. Source paragraphs are never split between extraction windows; code divides sentences into comma/semicolon clauses with exact character offsets for citation.

The extractor archives individual assertions, including incompatible clauses from the same sentence. It labels shown actions, narrative assertions, speech, thoughts/memories and documents separately. It does not pick a canonical truth or rewrite prose. Every accepted assertion must point to source units present in that extraction window. Existing entity names help naming across windows, but this is not a proven global entity resolver.

Code groups different values for the same normalized entity name and facet. These groups are potential comparison topics, not proven contradictions. Review receives the original supporting paragraphs, their neighbours and other literal mentions of the entity, including later context. The extracted assertions are explicitly described as fallible indexing aids. The reviewer returns assertion IDs and source-unit IDs; quotations are copied from the manuscript by code.

The raw extraction, rejected records, topics, review results, original prose and source hashes are saved in `report.json`. Every prompt and response is saved under `calls/`. Source-local actor actions are linked to object location/ownership/condition topics; this prevents subject-key differences from hiding a taking/leaving mismatch. Topic review separately reports unsupported or misattributed records under `index_errors`, rather than accusing the manuscript based on the archive's mistakes. Completed calls are reusable:

```sh
npx vite-node scripts/check-continuity-ledger.ts --books runs/nora-truth1,runs/nora-forward1 --out runs/continuity-ledger --resume
```

Resume requires unchanged source hashes, model, window size and book order. Failed calls remain recorded as failed rather than being silently retried. A budget-limited run is partial; remaining topics and unprocessed windows are visible. `COMPLETE` means all scheduled windows and topics were processed with valid responses, not that the book has no errors or every assertion was correctly interpreted.

`--jobs 1..4` sets parallelism (default 3). Each batch uses the entity-name registry available before that batch, and completed window results are committed in narrative order. `--max-calls` is an absolute limit across resumes, not an additional allowance. `--recheck-errors` explicitly repeats reviews that produced an error, rejected finding or failed response; their old results are retained in `review_history`. All attempts have distinct call-file names. Rechecking during development must be disclosed and is not a held-out benchmark.

Limits to measure: extraction omissions, alias fragmentation, incorrectly inferred event/time/source, retrieval of explanations that do not literally name the entity, and reviewer false positives. Source-reference validation proves where the words came from, not the correctness of the extracted interpretation. There is no exhaustive human gold list for the real novels.

The parser preserves `thought`/`thought` as a belief topic and `speech`/`speech` as an utterance topic when a model puts its source kind in the facet field. Source perspective remains unchanged. `--restore-source-kinds` reparses saved raw answers locally, keeping a pre-migration report. Reviews are reused only for matching entity/facet keys with exactly unchanged claim-ID sets; changed/new topics are scheduled for review.

`calendar_candidates` contains a separate deterministic necessary constraint: an nth weekday of a month must fall in days `7(n-1)+1` through `7n` (bounded by 31). The check copies the original statement and flags an impossible date; it does not decide whether a character lied or whether the author is at fault. It is a narrow English date-pattern check, not a general temporal reasoner. Statements outside the recognized pattern are not certified correct.

This is offline experimental analysis. It is not wired to the author, does not modify existing chapters and does not authorize automatic repairs.
