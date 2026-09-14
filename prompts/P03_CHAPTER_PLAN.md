# P03_CHAPTER_PLAN — the nearest chapter

When: before each chapter.

TASK
Plan only the current chapter, based on the actually written story.
Prepare scenes so the writer can immediately create full prose.

Book construction:
{{book_design_digest}}

Chapter:
{{chapter_number}} of {{chapter_count}}

Chapter purpose in the overall map:
{{chapter_map_entry}}

Current state:
{{current_state}}

Previous chapter outcome:
{{previous_chapter_outcome}}

Explicit state handoff from the last accepted scene:
{{state_handoff}}

Open promises and finale dependencies:
{{open_threads_and_ending_requirements}}

Stagings of the recently accepted scenes (who was present, where, through whose eyes):
{{recent_scene_shapes}}

Remaining length:
{{remaining_word_budget}}

REQUIREMENTS
- Define what this chapter adds and what changes by its end.
- Choose the scene count by content.
- For each scene set participant intentions, starting conditions,
  and a substantive outcome.
- Participants are character ids exactly as cast — never roles,
  names, or descriptions. A role where an id should be is not resolved
  by guessing: it becomes an unknown-participant problem for the review,
  mapped against the roster in words or refused, never substituted silently.
- A required outcome states a change — position, possession, knowledge,
  or commitment held differently at the end. Never a prolonged posture
  in the setup's own words; an outcome that restates the setup is
  rejected in code before any review.
- Account for the actions of other parties even when they happen off POV.
- Distinguish changes of situation, relationships, knowledge, and understanding.
- Leave the writer freedom in lines, details, and the course of interaction.
- Do not introduce a new line without a function and room for its consequences.
- Do not repeat what was already shown for the sake of length.
- Vary the staging against the recent scenes above: a chapter of scenes with the
  same people in the same room, one after another, reads as stalling however
  well each is written. Change who is present, where it happens, or through
  whose eyes — or give the repetition a reason the chapter needs. This is about
  the shape of scenes, not about forbidding a location the story lives in.
- Treat handoff.known_to_reader and handoff.forbidden_restatements as already
  established. Each scene must transform or exploit them, not explain them again.
- Keep handoff.open_questions open until a planned action can answer them from
  evidence. Make the first scene's result distinct from handoff.previous_outcome.
- Do not demand equal intensity and structure of all scenes.
- In required_fact_refs cite only identifiers from the facts array
  of the current state. Character knowledge and premise givens are already
  in the scene package — do not duplicate them with fact refs. If a scene
  must establish something for the first time, leave the refs empty and let
  the scene establish it.
- In required_source_refs cite the earlier text a scene must return to
  exactly — a remembered line, an object described once, a promise made in
  its own words. A reference is either SCENE_ID#pN (CH02_S01#p3) or the id
  of a recorded fact or event (CH02_S01-e2), and the cited paragraph is
  handed to the writer verbatim. Cite nothing for a scene that invents its
  own detail: a reference that resolves to no written paragraph is reported
  as a defect, not quietly ignored.

BEFORE ANSWERING
Check availability of knowledge and means, transitions between scenes,
the necessity of each scene, and the feasibility of the outcome.

If the chapter contradicts the accepted state and requires revising
the overall map, return status = "needs_replan" with a concrete reason.
Do not hide the problem with an invented event in the past.

FORMAT
JSON only:

{
  "status": "ready",
  "chapter": 1,
  "function": "",
  "starting_situation": "",
  "ending_change": "",
  "scenes": [
    {
      "id": "CH01_S01",
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
  ],
  "forward_dependencies": [],
  "replan_reason": null
}
