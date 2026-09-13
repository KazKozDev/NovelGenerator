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
7. Give the book a working_title in the manuscript language: a short title
   this story could carry, drawn from what the book is actually about. Not
   the premise restated, and not a subtitle.

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
- Do not explain every act with trauma or a hidden past.
- Prepare the means of resolving the conflict before their decisive use.
- Preserve the features of the original premise.
- Choose the narrative scheme to fit the story.
- Do not detail future scenes and do not write prose.

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
    "language": "",
    "tense": "",
    "narrative_perspective": "",
    "genre_expectations_selected": []
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
      "target_words": 0
    }
  ]
}
