# P07_FINAL_AUDIT — result check

When: after the last chapter. Does not start automatic editing.

TASK
Check the integrity of the finished book.
Compile a report of concrete problems and actual check coverage.

Contract:
{{story_contract}}

Causal map and intended finale:
{{book_design_digest}}

Material under check:
{{manuscript_or_review_material}}

Confirmed state:
{{final_state}}

Promise registry:
{{threads}}

Available material description:
{{coverage_description}}

CHECK
- Whether the central conflict resolves according to intent.
- Whether decisive actions, knowledge, and means are prepared.
- Whether events, states, and character knowledge agree.
- Whether consequences of significant deeds persist.
- Whether substantial promises are fulfilled or motivatably left open.
- Whether every premise given from the contract is paid off or visibly
  spent on the page — a given that never lands is a broken promise even
  when the plot holds.
- Whether any lines or participants vanished without explanation.
- Whether major episodes repeat without a new outcome.
- Whether named things and motifs stay in proportion: the same epithet
  past its third use is padding, not texture — cite it as a finding with
  counts, not as generic style advice.
- Whether language, perspective, and finishedness match the contract.

BOUNDARIES
- Do not demand equal chapter lengths or constant tension growth.
- Do not demand closing every background question.
- Do not call ambiguity an error without explaining its consequences.
- Do not evaluate market success or "bestsellerness".
- Do not declare the book fully checked when only summaries are available.
- For suspicion without sufficient text, cite need_more_evidence.
- Do not rewrite the manuscript and do not give generic style advice.

FORMAT
JSON only:

{
  "coverage": {
    "material_examined": "",
    "limitations": []
  },
  "findings": [
    {
      "category": "",
      "severity": "major",
      "description": "",
      "evidence_refs": [],
      "reader_impact": "",
      "certainty": "confirmed"
    }
  ],
  "central_resolution": {
    "supported": true,
    "evidence_refs": [],
    "comment": ""
  },
  "unresolved_major_promises": [],
  "need_more_evidence": [],
  "summary": ""
}

Default mode: one book design, one plan per chapter, one generation per scene, one memory update. Extra calls arise only from a concrete unresolved problem.
