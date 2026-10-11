# P01_INTENTION_RESOLVE — consequences of independent choices

Resolve what follows when independently chosen actions meet. Characters were
not told the planned ending or each other's secrets. Their expectations are not
world facts. Use the actual means, limits, causal history and world rules below.
Do not soften a plausible counter-move just to preserve the planned outcome.
Do not assume that discovering evidence makes an opponent give up, that a witness
agrees to testify, that institutional authority grants a desired remedy, or that
one document establishes more than it actually shows. Explain the connecting
mechanism for every decisive effect. Do not invent a new rule or outside rescuer.
A character's deliberately credible mistake is allowed when their limited
knowledge explains it. Reject omniscient or infeasible choices rather than
rewriting the book around them. Quiet and solitary fiction can turn on conflicting
obligations or beliefs; never demand a conventional villain or a twist count.

AUTHOR PLAN
{{plan}}

PRESSURE SITUATIONS
{{situations}}

INDEPENDENT CHOICES
{{choices}}

Do not author new discretionary choices during resolution. Every important voluntary
step needs a matching independent choice from this situation, cited as
SITUATION_ID:CHARACTER_ID. If an official, witness, creditor or other person whose
consent determines the result has not chosen independently, list that missing
decision with choice_ref null. If they are absent from the cast, character_id is
null and actor_name is their role. A place where evidence can be submitted is not
a rule requiring a particular verdict. A scheduled hearing does not authorize
cancelling a debt or clearing a conviction. Separate admitting evidence, investigating
it, granting interim protection and a final remedy. Do not cite the planned event's
own desired consequence as the mechanism proving that consequence can happen.
A goal, someone's expectation or a genre convention does not supply a missing choice.
Your job is to derive consequences of the submitted choices, not add a later
change of mind so that the authored ending still comes true.

For each situation state the action-response chain, real cost, resulting situation,
and whether the planned event can still occur. The resulting situation must say
what changed, not simply repeat the planned result. Evaluate the observation
packets too: reference timing alone does not prove that a person could perceive
that event or that the packet kept secrets private. A leaked secret is a major
issue against characters or causal_map. A necessary missing rule or implication
is an issue, not permission to fabricate it.

For a substantial failure identify the responsible section in target_ref:
Use exactly a section and a specific field or ID separated by a colon, e.g.
characters:C01, causal_map:E06, world_rules:R08, dramatic_core:central_conflict
or ending:central_resolution. Bare section names are invalid. Severity must be
blocking, major or optional; never minor. Ask for the smallest
repair that makes the chain earned. Keep a proposed adjustment concrete. Pure
stylistic taste is optional. A change to the ending is permitted only through an
explicit issue targeting ending; this call never overwrites approved sections.

Return exactly one consequence for each situation and a review:
{
  "collisions": [
    {
      "situation_id": "T01",
      "event_id": "E01",
      "action_response_chain": "",
      "required_decisions": [
        {"character_id": "C01", "actor_name": "", "choice_ref": "T01:C01", "decision": ""}
      ],
      "cost": "",
      "resulting_situation": "",
      "planned_outcome_supported": true,
      "reason": ""
    }
  ],
  "ready": true,
  "issues": [
    {
      "id": "I01",
      "severity": "major",
      "target_ref": "causal_map:E01",
      "category": "intentions",
      "problem": "",
      "evidence_refs": [],
      "consequence_for_writing": "",
      "required_decision": "",
      "suggested_adjustment": ""
    }
  ]
}
