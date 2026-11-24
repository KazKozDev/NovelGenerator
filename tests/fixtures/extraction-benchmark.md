# NuExtract3 versus the current Qwen extractor

This is an offline experiment, not an author tool or a new correction loop.

12 fixed excerpts contain 22 manually labelled source spans. Ten excerpts are synthetic;
two are verbatim passages already present in `continuityCases.ts`. The saved departure
excerpt does not name Nora, so the unresolved name `she` is accepted. No missing identity
is invented. Labels were fixed before model calls and are not included in `inputs.json`.

The existing `extractionPrompt` is used for both models. Qwen receives its normal archivist
system instruction. NuExtract uses its official structured template, with the same extraction
instructions in the template's instructions field and the original paragraphs/units as data.
Both use deterministic generation and a 2200 output-token ceiling. Each case is read once.

The scorer measures citation coverage, entity attribution, source kind, holder, and promotion
of speech/thought/document claims to world facts. It does **not** verify the semantic content
of values, complete extraction of every assertion, or invented extra claims. A correctly
attributed citation can still have an incorrect value. Review raw outputs separately.
Unavailable cases are counted explicitly and never treated as successful clean extraction.

NuExtract conventionally emits `null` for absent fields. A shared adapter maps null time/event
to `unknown`, and null holder on already objective sources to `narrator`. It never changes
source or entity, and never fills an absent speech/document/thought holder. Strict raw-format
rejections and adapted rejections remain in the report.

Prepare and run the existing extractor:

```sh
npx vite-node scripts/compare-extraction.ts --qwen
```

Run the downloaded NuExtract snapshot locally (PyTorch with MPS and current Transformers):

```sh
PYTORCH_ENABLE_MPS_FALLBACK=1 python3 scripts/run-nuextract.py --model-path /path/to/snapshot
npx vite-node scripts/compare-extraction.ts
```

The Python runner uses only a tokenizer for text inputs, avoiding unrelated video dependencies.
It loads local files without remote custom code. Model weights are not part of this repository.
Do not change gold labels in a populated output directory: the manifest hash refuses this.
Both runners keep raw responses and skip previously attempted cases rather than silently retrying.

Cloud Qwen timing and local Mac timing are useful operational observations, not a controlled
model-speed comparison. A result on these short excerpts cannot establish whole-book quality.

Model and native template documentation: https://huggingface.co/numind/NuExtract3
