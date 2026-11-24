# Continuity benchmark

Run deterministic checks:

```sh
npx vitest run tests/continuityEval.test.ts
```

Run the model benchmark through the existing configured transport:

```sh
npx vite-node scripts/check-continuity.ts --model qwen3.8-max --repeats 3 --out runs/continuity-bench
```

Qwen uses the existing local credentials. Other model names use Ollama; override its address with `--endpoint`. Use a new output directory for each run. `--cases nora-alibi-admitted,nora-scarf-same-paragraph` limits the cases.

The 16 human-labelled cases include explicit deception, an unsupported explanation, objective time and location conflicts, object transfers, distinct similar objects, intentional coincidence, later revelations, a forged document, uncertain memory, first-person assertions, elapsed time, unsupported knowledge and two verbatim saved-book examples. The labels are inspectable editorial judgements, not automatically proven ground truth. Revise a disputed label explicitly before comparing models, rather than changing it to fit a model's answer.

The model receives only passage IDs and text. Expected labels, case categories and human rationales are excluded. Each call has one attempt. Malformed responses, missing/false quotes, transport failures and truncation are recorded as unavailable. Quote validation proves that the quoted words exist; it cannot prove that the model interprets them correctly.

`report.json` contains per-case answers, errors, precision, recall, false positives, unavailable readings, exact three-way accuracy and repeat stability. Accuracy and recall include unavailable readings in their denominators; inspect coverage before interpreting them as model quality. Prompt and raw response files are saved under `calls/`. The report is updated after every case, so an interrupted run retains its evidence.

This measures **classification of supplied potential mismatches**. It does not measure whether a judge can discover every defect in a whole novel, whether the generator writes better books, or whether a factual ledger improves it. The generator is not connected to this benchmark and no manuscript is revised.

Saved sources:

- `nora-alibi-admitted`: `runs/nora-forward1/chapter-4.md` and `chapter-5.md`, the departure, false Monday alibi and explicit admission.
- `nora-scarf-same-paragraph`: `runs/nora-truth1/chapter-3.md`, the paragraph beginning “She should have waited”.

The quotes are committed in the fixture so the tests remain portable without local run files.

## First live run, 2026-10-12

The frozen `similar-objects` control calls the scarves “identical” while specifying different stitching. Qwen interprets this adjective literally and flags the wording itself. This is an ambiguous control and should not be used as clean evidence of a continuity false positive. Keep the original run and labels intact; fix the wording in a separately versioned future dataset before testing object identity again.

Qwen also sometimes abbreviates the real alibi admission with an ellipsis. Those responses are unavailable under the exact-quote contract even when the proposed semantic verdict is correct. The quote validator intentionally continues to reject them.
