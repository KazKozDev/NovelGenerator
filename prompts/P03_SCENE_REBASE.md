# P03_SCENE_REBASE — rebase the next scene on accepted prose

When: immediately before a scene when an earlier scene already exists.

TASK
Update the next scene plan against the explicit handoff from accepted prose.
This is a causal correction, not a prose rewrite and not an invitation to add novelty.

Story contract:
{{story_contract}}

Original scene plan:
{{scene_plan}}

State handoff from accepted prose:
{{state_handoff}}

Confirmed state:
{{confirmed_state}}

Open reader promises:
{{open_threads}}

REQUIREMENTS
- Preserve the scene id.
- Treat known_to_reader, confirmed_changes, and current_conditions as established.
- Do not explain forbidden_restatements again. They may be mentioned briefly only
  when the present action changes their meaning or consequence.
- Preserve still-relevant intentions and dependencies; remove or replace premises
  invalidated by the accepted scene.
- State what question remains open and why it matters now.
- Give the scene an outcome different from previous_outcome: position, possession,
  knowledge, relationship, or commitment must be held differently afterward.
- If the original scene no longer has a distinct function, repurpose it to the
  smallest necessary consequence of the accepted change. Do not pad or restage.
- Use only character ids already present in the original plan or confirmed state.
- Return the complete scene plan in the original schema, with no wrapper.

FORMAT
JSON only:

{
  "id": "CH01_S02",
  "pov_id": "",
  "location": "",
  "story_time": "",
  "participants": [],
  "initial_conditions": [],
  "function": "",
  "participant_intentions": [
    {"character_id": "", "intention": "", "reason_now": ""}
  ],
  "pressure_or_uncertainty": "",
  "development": "",
  "required_outcome": "",
  "flexible_elements": [],
  "required_fact_refs": [],
  "required_source_refs": [],
  "setup_or_payoff": [],
  "transition_to_next": "",
  "target_words": 0
}
