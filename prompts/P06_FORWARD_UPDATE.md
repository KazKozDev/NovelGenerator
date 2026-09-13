# P06_FORWARD_UPDATE — preparing further development

When: after a chapter.

TASK
Refine the forward plan based on the actually written chapter.
Prepare high-quality next generation.

Contract:
{{story_contract}}

Current book map:
{{chapter_map}}

Completed chapter:
{{completed_chapter}}

Confirmed state after the chapter:
{{accepted_state}}

Open promises:
{{open_threads}}

Finale premises:
{{ending_dependencies}}

Remaining chapters and length:
{{remaining_budget}}

DETERMINE
- What changed for the participants.
- Which consequences can no longer be ignored.
- Which actions are now motivated and available.
- Which future events kept their grounds and which lost them.
- What must be prepared before the conflict resolves.
- Whether the remaining length is overloaded.

RULES
- The accepted text takes priority over the previous plan.
- Do not rewrite the completed chapter.
- Do not change the future plan without substantial cause.
- Update only affected chapters and dependencies.
- Do not count a promise fulfilled without textual grounds.
- Do not downgrade a promise's importance to simplify the finale.
- Do not fix the past by claiming the needed event
  supposedly happened off-text.
- Keep explicit author requirements.
- Do not add twists and lines for novelty's sake.

FORMAT
JSON only:

{
  "chapter_outcome": "",
  "consequences_to_carry_forward": [],
  "next_chapter_inputs": {
    "starting_situation": "",
    "active_intentions": [],
    "necessary_content": [],
    "relevant_fact_refs": [],
    "source_refs_to_retrieve": []
  },
  "plan_updates": [
    {
      "chapter": 0,
      "field": "",
      "old_value": "",
      "new_value": "",
      "reason": ""
    }
  ],
  "ending_readiness": {
    "established_requirements": [],
    "remaining_requirements": [],
    "capacity_problems": []
  },
  "unresolved_blockers": []
}
