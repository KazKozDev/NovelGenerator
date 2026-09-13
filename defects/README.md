# Manuscript defect registry

This directory turns reader and live-run findings into durable regression evidence.
Each case lives in one JSON file under `cases/`; do not combine unrelated defects.

Every case records:

- the smallest manuscript quotation that demonstrates the problem;
- why it is a defect rather than a stylistic preference;
- the generation contract, review check, or repair guard responsible for it;
- whether the current implementation catches it;
- executable detector input for cases marked `caught`.

`tests/defectRegistry.test.ts` validates every card and runs its named detector. A
case may use `not_caught` while the gap is being designed, but it must still name
the check that should own it. Change the status to `caught` only in the same change
that adds an executable regression.

## Adding a case

1. Copy the manuscript wording exactly. Redact names only when necessary and say so
   in `provenance.note`.
2. Describe the observable failure, not the desired rewrite.
3. Assign one owner: `generation-contract`, `review`, or `repair-guard`.
4. Add the smallest detector input that reproduces the failure. Context added only
   to cross a measured threshold belongs in `test.context`, not in the quotation.
5. Run `npm test -- tests/defectRegistry.test.ts` and then the full test suite.

The registry stores short evidence excerpts, not complete manuscripts.
