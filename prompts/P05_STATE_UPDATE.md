# P05_STATE_UPDATE — changes for the next scene

When: right after a scene is written, before continuing.

TASK
Extract the essential changes from the new scene and check their
compatibility with the previous state. The material is at the end, under
THE MATERIAL; everything before it is how to read it.

This result becomes the basis of the next generation.
Accuracy matters more than filling every category.

HOW MUCH TO RECORD
Record what the next scenes depend on, not everything the scene contains.
Memory shows later calls only the most recent records, so every record that
did not need making pushes one that did out of view: a scene reported as
twenty-eight events hides the chapter before it. An empty list is a complete
answer.
- An event is something after which the story stands differently: someone
  arrives or leaves, a thing changes hands, something is found, decided,
  admitted, refused, broken. A gesture, a glance, a line of talk that changes
  nothing is not an event. A scene of a thousand words usually has six to
  twelve.
- A reader disclosure is something the reader now knows and did not: one
  plain sentence in your own words, never a passage of the prose copied out,
  never a description of a room or the weather. At most eight a scene.
- When two records would say the same thing, make one.

EXTRACTION RULES
- Record only what the text confirms.
- An evidence ref is a paragraph id from the scene, written exactly as it
  appears in its bracket: [p7] is cited as "p7". Nothing else is a ref — no
  scene or chapter ids, no quoted sentences, no plan step names. One or two
  refs a record: the paragraph that shows it, not every paragraph near it.
- A character's words count as their claim first.
- Track fact, knowledge, belief, and reader disclosure separately.
- Do not carry plan events into memory when the scene lacks them.
- Absence of a mention does not mean the object is gone.
- A state transition with a shown cause is not a contradiction.

EXTRACT
- proper_names: only names the record does not already hold. A person,
  place, ship, institution or titled thing the scene introduces, spelled
  exactly as written, with what kind of thing it is; and a new way of
  referring to something already recorded — a diminutive, a title with the
  name, the surname alone — with refers_to naming the recorded entry or the
  character id. A name already on record, used as recorded, is not listed.
- name_variants: a different SPELLING of a recorded name — a letter changed,
  a transliteration differing from the one on record. Give the used
  spelling, the recorded one, and evidence. Code replaces the used spelling
  with the recorded one throughout the scene, so report only what is truly
  the same name written wrongly. NOT a variant, and never reported here: a
  form of address ("Keeper Voss", "Dr. Reyes", the surname alone); an
  abbreviation or its full form ("Rd" for "Road", "St" for "Saint"); a
  plural or possessive ("the Marlows" for the family of "Marlow"); an
  epithet. Those are the name itself, and at most aliases for proper_names.
- events: what happened, as defined above.
- established_facts: the particulars the scene fixes that a later scene
  could get wrong. Not what happened — that is an event — but what is so:
  where a place is (which floor, which side, what it adjoins), what a thing
  is made of or looks like when it will be seen again, what someone does
  for a living, a number, a date, an hour, an age, a distance, a sum and
  the money it is counted in, the town someone is from, where a thing is
  kept, what someone is wearing tonight. Each has:
  subject — the person, place or thing it is about, by the plain name the
  book uses, the same words every time; if the previous state already
  holds a fact about it, copy that fact's subject exactly;
  attribute — which property of the subject this fixes, in a word or two
  ("floor", "trade", "material", "home town", "price", "found on"); again
  copy the attribute the record already uses when this is the same
  property;
  statement — one plain sentence that would still be true in the last
  chapter;
  and the paragraph that states it.
  State a fact even when the record already holds that subject and
  attribute and the scene says otherwise: that is exactly what is checked.
  These are kept whole for the rest of the book while events scroll out of
  view, and they are the only thing that lets a later scene agree with
  this one — a later writer sees these facts and never sees this prose.
  Go through the scene paragraph by paragraph and take every one of:
  what a document, record, letter or sign is said to contain (the names in
  it, the dates, the sums, whose hand); how long someone has done
  something; what someone carries, wears or arrived with; where each thing
  that will be handled again is kept; every room number, floor and
  direction; every price and count. A thousand words of scene usually fix
  six to ten; ten is the most that is kept, so when there are more, keep
  the ones a later scene is likeliest to state again. Mood, weather and
  anything already on record in the same words are not facts.
- state_changes: changes of location, condition and possession. A
  relationship change is a state_change with a directed entity id:
  entity_id "C01->C02", field "trust" (or "debt", "hostility", "loyalty" —
  name the bond that moved), before and after in words. Record it only when
  the scene shows the deed that moved it, and cite that paragraph. Someone
  saying they trust another person is a belief, not a bond that changed.
  Both directions are separate.
- knowledge_changes and belief_changes: what a character now knows, and what
  they now believe that they did not.
- intentions_and_commitments: decisions and promises that bind what someone
  does next.
- reader_disclosures: as defined above.
- plan_deviations: where the scene did something other than its plan and a
  later scene or chapter depends on the difference — it reached further than
  planned, stopped short, settled something another way, or left someone
  knowing or holding what the plan did not give them. At most three, each
  side in one sentence of your own — never the plan copied out.
  Not a deviation, and not listed: a detail the plan left open and the scene
  supplied (a date, a number, what someone wore, the exact words) — if it
  matters later it is an established fact; a planned thing that happened as
  planned; a departure nothing later depends on.
  For each one answer next_scene_must_change: true only if the very next
  scene, written exactly as it was planned, would now repeat something this
  scene already did or contradict where this scene left things. Otherwise
  false — the plan ahead is brought up to date after the chapter, and a
  scene is replanned only on a true here.
- uncertainties: a question the scene raises that the very next scene has to
  have answered and the text does not answer. Try to answer it from the
  scene first; what the scene answers is an event, a fact or a piece of
  knowledge, not an uncertainty. At most three, and usually none.

COVERAGE CHECK
Before answering, match the extraction against the actions in the text:
movement, handover of an object, damage, discovery, message, decision, and
promise must not go missing when they affect continuation.

CONTRADICTIONS
Give concrete incompatible statements and their sources.
No stylistic review.
Do not rewrite the scene.

RESTAGED BEATS
The previous state lists what has already happened, each event under its id.
Compare the scene with it for one thing only: does the scene stage, as if for
the first time, something that list already holds?
- A restaged beat is the same thing happening again: the same confrontation
  between the same people over the same matter, the same discovery made a
  second time, the same secret disclosed to a reader who already has it, the
  same decision reached again. Different sentences do not make it a different
  beat.
- It is NOT a restaged beat when the scene moves past the earlier one: a
  consequence of it, a second attempt that ends differently, a character
  learning what another already knew, a brief reference back, a refrain the
  book means. If anyone's position, possession, knowledge or commitment ends
  the scene held differently because of it, the beat is new.
- Report each one in restaged_beats: beat says what is staged again,
  earlier_ref is the id of the recorded event or fact it repeats, copied
  exactly from the previous state, and evidence_refs cite the paragraphs of
  this scene that stage it — those paragraphs, and only those, are then cut
  down in place. A charge with no earlier_ref is ignored: say what it repeats
  or do not raise it.
- Raise nothing you would not show a reader side by side.

PROMISES
- threads_resolved lists the promises that THIS scene paid off: the id,
  exactly as it is given, and answer — one sentence saying what the text
  now tells the reader that pays it, as the text has it. A promise is paid
  when the text answers it — the question gets its answer, the threat
  arrives, the thing set up is used. Not when the scene merely mentions it
  again, moves past it, or leaves the reader to guess. If you cannot write
  the answer from the scene, the promise is still open; one cited without
  an answer is kept open.
- An id beginning PREMISE is something the premise itself promised the
  reader. It is paid when the text puts it on the page as a thing that
  matters — shown, said, or used by someone — not while it is merely true in
  the background and no sentence has carried it.
- Cite nothing you are not sure of. A promise wrongly marked paid disappears
  from the book's account of itself, and nothing later can tell it was dropped.
- threads_opened lists promises this scene makes for the first time: a question
  the reader now expects answered, a person introduced as mattering, a thing
  set up to be used later. One sentence each.

FORMAT
JSON only:

{
  "proper_names": [
    {"name": "", "kind": "", "refers_to": ""}
  ],
  "name_variants": [
    {"used": "", "recorded": "", "evidence_refs": []}
  ],
  "events": [
    {"description": "", "participants": [], "evidence_refs": []}
  ],
  "established_facts": [
    {"subject": "", "attribute": "", "statement": "", "evidence_refs": []}
  ],
  "state_changes": [
    {"entity_id": "", "field": "", "before": null, "after": "", "evidence_refs": []}
  ],
  "knowledge_changes": [
    {"character_id": "", "learned": "", "evidence_refs": []}
  ],
  "belief_changes": [
    {"character_id": "", "previous_belief": "", "new_belief": "", "evidence_refs": []}
  ],
  "intentions_and_commitments": [],
  "reader_disclosures": [],
  "threads_opened": [],
  "threads_resolved": [
    {"id": "", "answer": ""}
  ],
  "contradictions": [
    {"description": "", "prior_refs": [], "scene_refs": [], "blocks_continuation": true}
  ],
  "uncertainties": [
    {"question": "", "evidence_refs": [], "relevant_to_next_scene": true}
  ],
  "plan_deviations": [
    {"planned": "", "actual": "", "future_dependency_affected": "", "next_scene_must_change": false}
  ],
  "restaged_beats": [
    {"beat": "", "earlier_ref": "", "evidence_refs": []}
  ]
}

Code updates memory after checking the answer. An empty contradiction list
alone does not prove the scene flawless.

THE MATERIAL

Previous state:
{{prior_state}}

Promises the book has made and not yet kept:
{{open_threads}}

Names already on record (canonical spellings with aliases):
{{recorded_names}}

Scene plan — for deviation detection only:
{{scene_plan}}

Relevant source excerpts:
{{source_excerpts}}

New scene with paragraph ids:
{{scene_text_with_paragraph_ids}}

Return the JSON object described under FORMAT, and nothing else.
