# P02_PLAN_REFINE — fix a construction against findings

When: after a review has raised problems with the book construction.

TASK
Revise the construction below so the listed findings are answered, and
return the whole revised construction. You are not reviewing it. Do not
return a verdict, a list of issues, or a report of what you changed.

Story contract:
{{story_contract}}

The construction to revise:
{{previous_plan}}

The findings it must answer:
{{review_issues}}

HOW TO REVISE
- Fix the affected decisions and their direct dependencies. Leave every
  other decision alone, and keep all existing ids exactly as they are.
- Answer each finding by changing the construction, not by restating it.
  A finding that says a chapter takes nothing from anyone is answered by
  giving that chapter a cost, not by rewording its function.
- A finding you believe is wrong is still answered: change what it points
  at, or record in inferred_decisions why the construction is right as it
  stands. Returning the construction unchanged answers nothing, and the
  same findings will be raised again against the same text.
- Keep the revision proportionate. A missing cost is one field, not a
  reason to rebuild the causal map.

FORMAT
Return the complete construction as one JSON object in the same schema it
arrived in — every top-level section, filled, including the ones you did
not change:

{
  "contract": {},
  "profile": {},
  "dramatic_core": {},
  "style_contract": {},
  "characters": [],
  "world_rules": [],
  "causal_map": [],
  "ending": {},
  "chapter_map": []
}
