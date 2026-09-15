# P02_PLAN_REVIEW — check before writing

When: after the book construction is ready; again for a substantial plan change or a complex scene.

TASK
Check whether the provided plan is ready for writing.
Find problems that would force the writer to invent unmotivated
actions, break constraints, or fill the scene with empty content.

Review scope:
{{review_scope}}

Story contract:
{{story_contract}}

Plan under review:
{{plan}}

Confirmed state:
{{relevant_state}}

Available excerpts of previously written text:
{{source_excerpts}}

CHECK
- Whether the planned actions have reasons.
- Whether participants have the needed knowledge, means, and opportunities.
- Whether the outcome follows from the described conditions.
- Whether obvious alternative actions are accounted for.
- Whether events change the situation.
- Whether the outcome is resolved through action, discovery, loss, or commitment on the page — not by retelling what the handoff already established. A scene that explains again instead of changing something is stalling however well written.
- Whether scenes duplicate each other in content and outcome.
- Whether necessary future decisions are prepared.
- Whether development fits the given length.
- Whether author requirements and premise features are preserved.

REVIEW BOUNDARIES
- Do not demand an external conflict, twist, or cliffhanger in every scene.
- Do not treat missing detailed choreography as a plan defect.
- Do not declare the unknown a contradiction.
- Do not propose a different book out of personal preference.
- Do not evaluate prose that has not been written yet.
- If there are no substantial problems, return empty issues.

PLAN VS PROSE (one-line test)
- The plan sets decisions; prose executes them. A motivation or knowledge
  gap is a plan defect only when no plausible in-scene motivation exists.
- Before raising blocking or major on "why would X do/know Y", apply the
  one-line test: could a competent writer motivate this inside the scene in
  one or two lines consistent with the character? If yes, severity is
  optional at most. Entering a room, opening a kept object, asking for help
  after a failed attempt — these are routinely motivable in-scene.
- blocking on motivation is reserved for load-bearing events where no such
  line exists: the resolution hinges on the act and the character as written
  would not plausibly do it under any in-scene framing.
- On re-review, previously settled points stay settled: judge only whether
  the fixes resolved the raised issues and whether the fixes themselves broke
  coherence. Do not open new fronts on decisions that already passed review.

STATIC OUTCOME (kinetic test)
- Compare the starting situation with the required outcome: has anyone's
  position, possession, knowledge, or commitment changed between them? An
  inner decision recorded as a knowledge or belief change counts as movement.
- A plan that describes a prolonged posture in the same words at both ends —
  standing together, waiting, agreeing to try, with nothing held differently
  after — is major: it is stasis wearing a plan's clothes, and prose will
  only stretch it across chapters.
- Lyrical stillness is allowed when the plan says what the stillness costs
  or settles; "nothing changes and nothing is risked" is not a defense.

For each problem give the exact location, the grounds, and the decision
that must be made before writing.
Propose the minimal clarification that preserves the intent.

FORMAT
JSON only:

{
  "ready": true,
  "issues": [
    {
      "id": "I01",
      "severity": "blocking",
      "target_ref": "",
      "category": "causality",
      "problem": "",
      "evidence_refs": [],
      "consequence_for_writing": "",
      "required_decision": "",
      "suggested_adjustment": ""
    }
  ]
}

Allowed severity values:
- blocking: under current conditions the plan cannot be executed coherently;
- major: a substantial gap that must be resolved before writing;
- optional: a non-mandatory improvement.

ready = false only when blocking or major issues exist.

MAPPING DUTY (scene readiness)
- A participant that is a role or a name rather than an id: map it against
  the cast roster in the scope, in words, inside required_decision
  (map it to the roster entry in words, using the name as the card gives it).
- If nobody on the roster answers to it, return major, not a guess: state
  how the scene carries the beat without inventing a person.
