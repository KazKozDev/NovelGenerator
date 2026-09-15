# P01_BOOK_DESIGN — book construction

When: once, before writing.

TASK
Prepare a compact book construction suitable for subsequent writing. The main goal is a story that develops through the actions of its participants and the consequences of those actions.

INPUT
Premise:
{{premise}}

Genre:
{{genre}}

Chapter count:
{{chapter_count}}

Approximate total length:
{{target_total_words}}

Additional author requirements:
{{author_requirements}}

WORK ORDER
1. Separate explicitly stated requirements from decisions that must be made.
   Decompose the premise into premise_givens — one entry per concrete
   element (every named person, every distinctive thing, situation, and
   fact). Each given must then earn a home in the construction below;
   a given that never lands is rejected in code before any review.
   Separately declare premise_names: the spans of the premise that are
   proper names in your judgment — people, places, named things. A word
   that is merely capitalized is not a name. Every declared name is
   checked against the finished design in code, so declare all of them.
2. Identify the distinctive opportunity of this premise:
   which situations and conflicts arise specifically from its conditions.
3. Choose the minimal sufficient cast and points of view.
4. Build development through actions, consequences, and changes
   in available opportunities.
5. Define the intended resolution of the central conflict
   and the prior events it requires.
6. Distribute development across the given number of chapters.
7. Give the book a working_title: a short title
   this story could carry, drawn from what the book is actually about. Not
   the premise restated, and not a subtitle.
8. Declare the profile: what kind of book this is, so the rest of the
   pipeline checks it against its own form instead of against a generic one.
   See PROFILE below — it is not decoration, every field is enforced.
9. Allocate the budgets across chapter_map. Each chapter that meets the
   central obstacle draws a mechanism from the profile's ledger, states the
   cost it takes from the protagonist, and takes a rung on the declared
   pressure curve.

CONSTRUCTION REQUIREMENTS
- Cast every person the premise names, under that premise-given name;
  a diminutive may appear only beside the full form, never replacing it.
  A premise-given "someone" is the only open casting slot — everything
  named is bound, and the cast is checked against the premise in code.
- Important participants have their own motives and means to act.
- Obstacles follow from conditions, interests, and prior events.
- If an obvious easy way out exists, account for its use
  or a concrete reason it is unavailable.
- New complications must change the participants' positions.
- Do not substitute development with one repeated threat in different scenery.
- Every chapter takes something from someone, in the terms of cost_kinds.
  A chapter that costs nothing is a chapter that repeats: state the cost.
- A chapter's mechanism is drawn from mechanism_ledger, and no mechanism
  carries more chapters than this book's mechanism_reuse rank allows.
- pressure_rung is a small integer placing the chapter on the declared curve.
  Its shape is checked against pressure_curve in code, so a rising curve whose
  rungs never rise is rejected before any chapter is planned.
- Do not explain every act with trauma or a hidden past.
- Prepare the means of resolving the conflict before their decisive use.
- Preserve the features of the original premise.
- Choose the narrative scheme to fit the story.
- Do not detail future scenes and do not write prose.

PROFILE
This is where you say what kind of book this is. Code enforces it afterwards,
so declare the book you mean to write, not the book that sounds safest.

- pressure_curve: how pressure is meant to move across the whole book.
  "rising" — it grows chapter by chapter (thriller, horror).
  "oscillating" — it closes and breaks on purpose (romance, some drama).
  "investigative" — what grows is what is known, not what threatens (mystery).
  "flat" — the pressure is a condition, not a rise (much literary fiction).
  "descending" — the book releases rather than tightens.
  Choose from what this premise actually is. A wrong curve is worse than a
  modest one: the chapter rungs are checked against the shape you name here.
- declared_motifs: the repetitions this book means. A returning image, phrase,
  or gesture that carries the book is a refrain; the same thing unmeant is a
  tic. Anything you declare here is exempt from the repetition check up to
  allowed_uses, and anything you do not declare is counted. Declare only what
  is load-bearing, give each one a reason, and keep the budgets honest — a
  large enough exemption disarms the check and the book goes formulaic
  unnoticed.
- cost_kinds: what paying a price means in this book. Material loss and injury
  in one genre; exposure and vulnerability in another; a discarded theory, a
  burned source, a lost witness in another. Every chapter must be able to take
  something from someone in these terms.
- dialogue_weight, staging_variety, mechanism_reuse: low / medium / high only.
  Never a number, a share, or a percentage — you cannot know the statistics of
  prose that does not exist yet, and a decimal invented here would be enforced
  as if it were measured. staging_variety "low" is the honest answer for a
  deliberately claustrophobic book: one house, one pair of eyes, and the
  repetition-of-staging check relaxes accordingly. mechanism_reuse "high" is
  the honest answer for a procedural, where repeating the method is the form.
- open_ending: true when threads left standing at the end are the design.
- mechanism_ledger: the distinct ways the central obstacle is met across the
  book. Not scenes and not plot points — kinds of solution. Chapters draw from
  this list and spend what they draw, so a book whose ledger is too short will
  repeat one solution in different scenery, and code will say so before a word
  is written.
- ending_invariants: what this book's kind promises a reader, in this book's
  own words. A mystery that the reader could have solved from clues planted
  before the revelation. A romance that ends on the pair. A horror that leaves
  the wrong thing alive. Name what yours owes.

VOICE
Describe the voice through narrative distance, traits of attention,
register, attitude to humor, and emotional restraint.
Do not set quotas on sentence length, dialogue, or metaphors.

FORMAT
Return only JSON with the following structure.
Fill lists as needed; chapter_map contains exactly
{{chapter_count}} entries.

{
  "contract": {
    "working_title": "",
    "explicit_requirements": [],
    "premise_givens": [
      {"given": "", "kind": "person | thing | situation | fact"}
    ],
    "premise_names": [],
    "inferred_decisions": [
      {"decision": "", "reason": ""}
    ],
    "tense": "",
    "narrative_perspective": "",
    "genre_expectations_selected": []
  },
  "profile": {
    "pressure_curve": "rising | oscillating | investigative | flat | descending",
    "curve_reason": "",
    "declared_motifs": [
      {"motif": "", "allowed_uses": 0, "reason": ""}
    ],
    "cost_kinds": [],
    "dialogue_weight": "low | medium | high",
    "staging_variety": "low | medium | high",
    "mechanism_reuse": "low | medium | high",
    "open_ending": false,
    "mechanism_ledger": [],
    "ending_invariants": []
  },
  "dramatic_core": {
    "distinctive_situation": "",
    "central_conflict": "",
    "stakes": "",
    "why_now": "",
    "sources_of_development": []
  },
  "style_contract": {
    "narrative_distance": "",
    "attention": "",
    "register": "",
    "humor": "",
    "emotional_expression": ""
  },
  "characters": [
    {
      "id": "C01",
      "name": "",
      "story_function": "",
      "goal": "",
      "motives": [],
      "capabilities": [],
      "limitations": [],
      "relationships": [],
      "behavior": "",
      "voice_and_perception": "",
      "initial_knowledge": [],
      "initial_beliefs": []
    }
  ],
  "world_rules": [
    {"id": "R01", "rule": "", "relevant_consequences": []}
  ],
  "causal_map": [
    {
      "id": "E01",
      "cause": "",
      "actor_id": "",
      "action_or_event": "",
      "consequence": "",
      "requires": [],
      "enables": []
    }
  ],
  "ending": {
    "central_resolution": "",
    "decisive_action_or_choice": "",
    "required_setup": [],
    "intentionally_open_questions": []
  },
  "chapter_map": [
    {
      "chapter": 1,
      "function": "",
      "main_change": "",
      "event_ids": [],
      "dependencies": [],
      "setup_or_payoff": [],
      "pov_id": null,
      "target_words": 0,
      "mechanism": "",
      "cost": "",
      "pressure_rung": 1
    }
  ]
}
