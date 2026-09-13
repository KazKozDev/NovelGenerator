# P05_STATE_UPDATE — changes for the next scene

When: right after a scene is written, before continuing.

TASK
Extract the essential changes from the new scene and check their
compatibility with the previous state.

This result becomes the basis of the next generation.
Accuracy matters more than filling every category.

Previous state:
{{prior_state}}

Names already on record (canonical spellings with aliases):
{{recorded_names}}

Scene plan — for deviation detection only:
{{scene_plan}}

New scene with paragraph ids:
{{scene_text_with_paragraph_ids}}

Relevant source excerpts:
{{source_excerpts}}

EXTRACTION RULES
- Record only what the text confirms.
- Every record must have evidence_refs.
- An evidence ref is a paragraph id from the scene above, written exactly as
  it appears in its bracket: [p7] is cited as "p7". Nothing else is a ref —
  no scene or chapter ids, no quoted sentences, no plan step names.
- A character's words count as their claim first.
- Track fact, knowledge, belief, and reader disclosure separately.
- Do not carry plan events into memory when the scene lacks them.
- Absence of a mention does not mean the object is gone.
- A state transition with a shown cause is not a contradiction.
- Record uncertainty explicitly when it matters for continuation.

EXTRACT
- Every proper name the scene uses: people, places, ships, institutions,
  titled things. For each give the spelling exactly as written, what kind of
  thing it is, and refers_to — the character id or the already recorded name
  it means (a diminutive beside the full form). Leave refers_to empty only
  when the scene introduces the thing itself for the first time.
- Every spelling the scene uses for a RECORDED name that is not its
  canonical spelling or a recorded alias: report it in name_variants with
  the used spelling, the recorded one, and evidence. Only you, reading both
  the prose and the record, may judge a variant — a near-twin is guilty
  until the scene establishes it as its own thing with its own refers_to.
  Variants block the line: the writer gets one rewrite with the exact
  spelling.
- Events that happened.
- Changes of location, condition, possession, and relationships.
- Gained knowledge and changed beliefs.
- Significant decisions, commitments, and intentions.
- Information disclosed to the reader.
- Promises created and fulfilled. Name a fulfilled promise in the words of threads_opened (the same description) — code matches by text, not by identifier.
- Deviations from the plan that affect later chapters.

COVERAGE CHECK
Before answering, match the extraction against the actions in the text:
movement, handover of an object, damage, discovery, message,
decision, and promise must not go missing when they affect continuation.

CONTRADICTIONS
Give concrete incompatible statements and their sources.
No stylistic review.
Do not rewrite the scene.

FORMAT
JSON only:

{
  "proper_names": [
    {
      "name": "",
      "kind": "",
      "refers_to": "",
      "evidence_refs": []
    }
  ],
  "name_variants": [
    {
      "used": "",
      "recorded": "",
      "evidence_refs": []
    }
  ],
  "events": [
    {
      "description": "",
      "participants": [],
      "evidence_refs": []
    }
  ],
  "state_changes": [
    {
      "entity_id": "",
      "field": "",
      "before": null,
      "after": "",
      "evidence_refs": []
    }
  ],
  "knowledge_changes": [
    {
      "character_id": "",
      "learned": "",
      "source": "",
      "evidence_refs": []
    }
  ],
  "belief_changes": [
    {
      "character_id": "",
      "previous_belief": "",
      "new_belief": "",
      "evidence_refs": []
    }
  ],
  "intentions_and_commitments": [],
  "reader_disclosures": [],
  "threads_opened": [],
  "threads_resolved": [],
  "contradictions": [
    {
      "description": "",
      "prior_refs": [],
      "scene_refs": [],
      "blocks_continuation": true
    }
  ],
  "uncertainties": [
    {
      "question": "",
      "evidence_refs": [],
      "relevant_to_next_scene": true
    }
  ],
  "plan_deviations": [
    {
      "planned": "",
      "actual": "",
      "future_dependency_affected": ""
    }
  ]
}

Code updates memory after checking the answer. On a significant contradiction or uncertainty, continuation is blocked until resolution; an empty contradiction list alone does not prove the scene flawless.
