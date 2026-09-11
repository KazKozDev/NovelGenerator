# Manuscript generation

The browser writes directly; editorial work is requested after completion.

1. Preparation creates an outline, character/conflict blueprint and chapter scene plans with an ending.
2. Short chapters (up to 2,000 target words) are written whole. Longer chapters use weighted scenes. The author can override automatic selection.
3. Each writing call receives the relevant plan, character design, bounded earlier chapter memory and actual preceding prose. There are no literary assessments, repairs, embedding checks or background model scans in this path.
4. Each written chapter is checkpointed before one memory extraction. Only notes with exact supporting passages are retained. Extraction failure uses labelled source excerpts, never the intended plan, and does not block writing.
5. Empty prose and transport failures stop at the saved position. Resume continues without regenerating saved scenes. Completed unreviewed books can be exported and carry `not_checked`, not a fabricated passing assessment.
6. Review completed book explicitly reads the manuscript and returns suggestions without changing prose. Applying suggestions edits a separate copy; success commits a new version, retaining downloadable original manuscript history. Failure leaves the original available.

The older editorial engine remains for compatibility and explicit CLI `--editorial` use. It is not the browser's generation path.

## Verification and limits

`tests/directPipeline.test.ts` covers generation call count, memory handoff, empty-answer resume, invented-quote fallback and preservation of original manuscript versions. These tests use a deterministic model double, not a literary-quality evaluator.

Chapter memory is bounded; the latest eight chapter summaries and preceding excerpts are supplied to the writer. Long books can lose remote details. The optional whole-book review sends the full manuscript and may exceed a provider's context limit; it reports failure without withdrawing the book. Neither successful API calls nor passing software tests establish literary quality. Evaluate finished books for continuity, repetition, scene completeness and ending payoff alongside actual call counts and duration.
