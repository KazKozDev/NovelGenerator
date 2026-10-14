# Local Fact Assertion Graph

`fact_graph_nli.py` indexes every non-empty paragraph, preserves sentences/excerpts
with exact character offsets, and compares selected pairs using a local Hugging Face NLI model.
MNLI is a paired comparison task, not an exhaustive atomic fact extraction model. The nodes
of this graph are verbatim candidate assertions, including complex sentences; subjects,
pronouns, causality, and absolute truth values are not automatically resolved.

```sh
cd /Users/artemk/projects/NovelGenerator
python3 scripts/fact_graph_nli.py --chapters runs/nora-author-facts-deepseek1 --out runs/nora-nli-new --cache-dir /private/tmp/novel-nli-cache --local-only
```

`--file input.txt` analyzes a single file, `--text '...'` analyzes a raw string. By default, language
is detected from character distributions; `--language en|ru` specifies it explicitly. The English model
is `cross-encoder/nli-deberta-v3-base`; the Russian model is `cointegrated/rubert-base-cased-nli-threeway`.
Labels are read from the model configuration; an unknown checkpoint with opaque labels requires an explicit
`--labels` flag in the correct logit order. No manuscripts are ever transmitted to external APIs.

Dependencies are listed in `requirements-fact-graph.txt`. In the active environment they are
already available; standalone installation is supported in a virtual environment. Validation models
are cached in `/private/tmp/novel-nli-cache`. Without `--local-only`, missing weights are pulled
from Hugging Face. The default cache directory is `runs/hf-nli-cache`.

The output directory must be empty:

- `sources.json`: all paragraphs, excerpts, source paths, Python character offsets, line numbers, and SHA-256 hashes of source files;
- `report.json`: model, revision, labels, parameters, coverage, scores, and candidates;
- `graph.graphml`: source paragraphs → excerpts → lexical mentions, plus NLI relation edges;
- `view.html`: standalone visualizer for pair inspection with full source paragraphs, requiring no external libraries.

Candidate search leverages a global lexical index rather than merely adjacent phrases.
`--entities Nora,Claire,key` adds entity search hints. `--neighbors` caps the count of nearest neighbors,
and `--max-pairs` limits the total number of unique pairs evaluated. Each directed edge is scored
exactly once. High-frequency stop words are excluded from candidate generation; consequently, search
completeness is not guaranteed. `--extract-only` writes the index without executing NLI consistency evaluation.

All literal NLI contradictions are recorded first. Pairs advance to the triage shortlist if they exhibit
high contradiction scores in both directions, share a lexical mention, and pass compatibility checks
for heuristic source, time, and aspect tags. Dialogue utterances, internal memories, disparate timestamps,
and distinct semantic aspects remain accessible in the full candidate list. These heuristic filters may
fail or omit genuine narrative errors: this is a triage mechanism, not a formal world-logic proof.

No candidate pair is labeled an authorial error automatically. Scores reflect the model's softmax confidence,
not an objective probability of a plot bug. Long pairs are never silently truncated: they are flagged as
unevaluated. Absence of contradictory edges, hitting pair budgets, or skipped pairs does not prove the
manuscript is fully consistent.

Verification:

```sh
python3 -m unittest discover -s tests -p 'test_fact_graph_nli.py' -v
```

In a live English demo, 12 literal triggers yielded 2 direct contradiction candidates after triage;
in Russian, 3 triggers yielded 1 candidate. On the full Nora manuscript: 223 paragraphs, 706 excerpts,
7,264 directed comparisons, 1,538 literal triggers, and 75 candidates. Local evaluation duration was
approximately 86 seconds on Apple Silicon (MPS). Many of the 75 candidates belong to distinct scenes,
demonstrating that candidate volume is not an error count. Raw scores are saved to `report-before-triage.json`;
triage scoring is recomputed locally without invoking the neural model again.
