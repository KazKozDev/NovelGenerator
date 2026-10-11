# P06_FORWARD_UPDATE — closing a chapter

When: after the last scene of a chapter, before the chapter is joined.

TASK
Refine the forward plan based on the actually written chapter, and first say
what in the chapter itself can still be corrected. Nothing after this chapter
is written yet: a sentence corrected now costs nothing downstream, and the
plan ahead can still be changed to follow what the text did. The material is
at the end, under THE MATERIAL.

PART ONE — WHAT TO CORRECT IN THE CHAPTER

Find where the chapter disagrees with what the book has already established
or with what the rest of the book depends on. Propose only repairs small
enough to make now: sentences corrected in place, or one short beat added
between two existing paragraphs.

Look for:
- The chapter states a particular two ways: a number, a date, a time, a name,
  who did what, where a thing is.
- The chapter states a particular differently from a fact on record from an
  earlier chapter.
- The chapter fixes a particular that the causal map or the ending cannot live
  with, and no later chapter could absorb it.
- A preparation the chapter map assigned to THIS chapter is missing, and it is
  one the later chapters depend on having already happened.

Leave alone:
- Anything a later chapter can still supply, answer, or explain: that belongs
  in part two, as a plan update or a blocker.
- A departure from the plan that harms nothing. The accepted text outranks the
  plan; when the plan can follow the text, it follows.
- Style, pacing, emphasis, taste, and ambiguity the book means.
- Anything you cannot point at. A repair needs the sentence or the place.

Two kinds of repair, and nothing else:
- "align": sentences that state the wrong particular are rewritten to state
  the right one. Give scene_id, canonical — what the book holds, in one
  sentence — and quotes: every sentence of that scene that states it
  otherwise, copied character for character from the text. A quote that does
  not occur in the scene exactly as you give it is discarded, and a repair
  left with no quotes is not made. One repair per scene.
- "insert": one short beat is added. Give scene_id, after_paragraph — the
  reference of the paragraph it follows, as written in the text — and
  must_establish: what the beat has to put on the page, in one or two
  sentences.

At most three repairs, the ones the rest of the book most depends on. An
empty list is the expected answer.

Separately, in worn_images, name any image this chapter keeps returning to:
the same picture — a sound, a light, a piece of weather, a gesture — arriving
again in different words each time, until it reads as a habit rather than as
something seen. Not an object the story is about, not a phrase the book
repeats on purpose, not a place the scenes simply happen in. Give image, a
short label, and anchors: two to four plain single words exactly as the text
uses them, chosen so that every sentence carrying the image contains at least
two of them. Code counts those sentences across the whole book. At most
three, and none if the chapter has no such habit.

PART TWO — THE PLAN AHEAD

Determine:
- What changed for the participants.
- Which consequences can no longer be ignored.
- Which actions are now motivated and available.
- Which future events kept their grounds and which lost them.
- What must be prepared before the conflict resolves.
- Whether the remaining length is overloaded.

Rules:
- The accepted text takes priority over the previous plan.
- Do not rewrite the completed chapter beyond the repairs of part one.
- Do not change the future plan without substantial cause.
- Update only affected chapters and dependencies.
- A departure listed in the material is now the book. For each one a later
  chapter depends on, either update that chapter so it builds on what was
  written, or name it in unresolved_blockers. Do not leave the plan ahead
  describing a chapter the text has already made impossible.
- Judge ending_readiness from what the chapter put on record, not from the
  plan: a requirement is established when the text established it.
  The finale's premises are listed under ids (E1, E2, …). In
  established_requirements give the id of every one the book has now
  established, in this chapter or an earlier one — the id alone, not the
  sentence retyped. remaining_requirements is for something the ending needs
  that the list does not name; a listed premise not yet established is not
  repeated there.
- Do not count a promise fulfilled without textual grounds.
- Do not downgrade a promise's importance to simplify the finale.
- Do not fix the past by claiming the needed event supposedly happened
  off-text.
- Keep explicit author requirements.
- Do not add twists and lines for novelty's sake.

FORMAT
JSON only:

{
  "repairs": [
    {
      "id": "R1",
      "kind": "align",
      "problem": "",
      "scene_id": "",
      "canonical": "",
      "quotes": [],
      "after_paragraph": "",
      "must_establish": ""
    }
  ],
  "worn_images": [
    {"image": "", "anchors": []}
  ],
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

THE MATERIAL

Contract:
{{story_contract}}

Causal map and intended ending:
{{book_design_digest}}

Current book map:
{{chapter_map}}

Completed chapter:
{{completed_chapter}}

Confirmed state after the chapter, with the facts on record:
{{accepted_state}}

Everything the chapter itself put on record, scene by scene:
{{chapter_events}}

Where its scenes departed from their plans:
{{plan_deviations}}

Open promises:
{{open_threads}}

Finale premises:
{{ending_dependencies}}

Remaining chapters and length:
{{remaining_budget}}

The chapter, every paragraph under its reference:
{{chapter_text_with_refs}}

Return the JSON object described under FORMAT, and nothing else.
