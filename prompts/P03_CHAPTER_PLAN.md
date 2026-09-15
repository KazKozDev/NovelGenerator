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

What kind of book this is:
{{book_profile}}

What this chapter was allocated at design time, and what the book has already spent:
{{chapter_commitments}}

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

What a previous attempt at this chapter got wrong:
{{plan_findings}}

Fresh material for this chapter (concrete cards, not advice):
{{fresh_constraint}}

REQUIREMENTS
- Define what this chapter adds and what changes by its end.
- State the chapter's mechanism, cost, and pressure_rung.
  The mechanism is how the obstacle is met here, drawn from the book's
  ledger above. A mechanism already spent to its allowance cannot carry
  this chapter too: the same solution working a third time is the reader
  watching a procedure, not a story. The cost is what this chapter takes
  from someone, in the terms this book declared. A chapter that takes
  nothing repeats the chapter before it however different its scenery.
  The rung places this chapter on the book's declared pressure curve.
  All three are checked in code against the design's allocation before
  any prose exists, and a plan that fails them comes back to you with the
  findings rather than reaching the writer.
  These three describe the chapter as a whole. They are not a reason to
  write it as one scene: a chapter meets its obstacle once and still
  reaches that moment through several situations, and the cost is usually
  paid in a different scene from the one that earns it.
- Choose the scene count by content. A chapter is normally two to five
  scenes; one scene is right only when the chapter is a single unbroken
  situation, and when it is, say so in the chapter function. Length is not
  the reason either way — a short chapter can turn twice and a long one can
  hold a single room.
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
- Each scene names its outcome_kind: the class of change its outcome
  produces, not the outcome itself. Use one of: position, possession,
  knowledge, commitment, relation, exposure, loss. Scenes running one
  after another on the same class is what a book looks like from above
  when it is iterating instead of developing, and it is counted.
- Give every scene a fresh_constraint: one card from the fresh material
  above, copied by id with its text, as the concrete way this scene stays
  new — a place, an object, a move, or a limitation. The constraint is
  spent on the page through action or detail, never announced as novelty
  and never explained to the reader.
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

If findings from a previous attempt are listed above, every one of them is
measured, not opinion — a mechanism really is spent, a rung really does break
the declared curve, those scenes really do share a staging. Plan a different
chapter, not the same chapter re-described: rewording the same scenes to dodge
the wording of a finding leaves the defect and loses the evidence.

A finding about a promise left standing is answered by giving it a scene, and a
scene is something a chapter gains, not something it swaps. Do not drop a scene
that was working to make room: the chapter may be longer than you first planned
it, and a chapter that keeps its promise and runs long is worth more than one
that keeps its length and loses a scene that was doing work. Cut only what the
findings say is not earning its place. If a finding
is wrong because the chapter map itself no longer fits what has been written,
say so with status = "needs_replan" instead of planning around it.

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
  "mechanism": "",
  "cost": "",
  "pressure_rung": 1,
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
      "target_words": 0,
      "outcome_kind": "position | possession | knowledge | commitment | relation | exposure | loss",
      "fresh_constraint": ""
    }
  ],
  "forward_dependencies": [],
  "replan_reason": null
}
