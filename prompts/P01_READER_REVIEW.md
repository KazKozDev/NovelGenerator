# P01_READER_REVIEW
Compare the author's plan with the independent reader's evolving understanding.
PLAN
{{plan}}
VISIBLE TRACES AND DISCOVERY COSTS
{{beats}}
INDEPENDENT READINGS
{{readings}}
Check that every trace can really be perceived, not just that its event ID exists.
Check that reader versions arise from actions and available evidence, not withheld
POV knowledge or deliberately stupid inference. Discoveries should cost something
and create a concrete next difficulty. Check changes of meaning against previous
traces and character intentions. The ending should explain relevant earlier oddities
without introducing decisive evidence for the first time. Do not insist on a surprising
ending for every genre; dramatic irony and known outcomes can be compelling. Do not
reject a book merely because one reader guessed the answer. Assess the causal evidence.
Return 
{
  "ready": true,
  "issues": [],
  "closure": [{"question":"Exact final next_question", "answer":"What shown evidence answers it", "support_ids":["R1"], "resolved":true, "intentionally_open":false}],
  "retrospective": [
    {
      "trace_id": "R1",
      "ending_explanation": "How this earlier fact acquires its final meaning",
      "earned": true
    }
  ]
}.
Account for every trace exactly once. If an explanation is unearned, return a major
issue targeting its responsible section. Issues have id, severity (blocking/major/optional),
target_ref (characters:C01, causal_map:E01, world_rules:R01, dramatic_core:field,
ending:field or chapter_map:1), category, problem, evidence_refs,
consequence_for_writing, required_decision, suggested_adjustment. Bare sections invalid.
False ready cannot override a major issue. Do not modify the plan in this response.

Explicitly answer the final independent reading's next_question in closure (copy its
exact wording). Also cover any central competing version left unresolved. Support
answers with visible trace IDs, not the author's hidden history alone. If the reader
still has two materially different motives compatible with every shown fact, author
certainty does not resolve the ambiguity. Mark resolved false. intentionally_open
may be true only for a question explicitly left open by the approved ending; do not
use it to excuse a missing central explanation. A document stamped by someone does
not on its own prove who used the stamp, an alibi or motive. A reader trace that says
"demonstrates" an author's conclusion without showing its observable mechanism is
a major issue. Do not promote a merely plausible interpretation to conclusive proof.

Choose the smallest responsible repair target. If the approved ending already
contains the needed action but the visible traces omitted it, target chapter_map:
CHAPTER_NUMBER. Do not reopen ending merely to show an existing decision. Target
ending only when the intended resolution itself must change. Repair the evidence
presentation, then let a new independent reading test it; never ask to rewrite an
independent reader's answer into the desired interpretation.
