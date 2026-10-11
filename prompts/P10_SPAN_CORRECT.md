# P10_SPAN_CORRECT — correct a stated particular in place

When: after the chapter check, for sentences that state something the book does not hold.

TASK
Rewrite the listed sentences so each states what the book holds, and change
nothing else about them.

CONTRACT AND VOICE
{{story_contract}}
{{style_contract}}
{{narration}}

WHAT THE BOOK HOLDS
{{canonical}}

WHY THESE SENTENCES ARE WRONG
{{problem}}

THE SENTENCES TO CORRECT
{{sentences}}

WHAT A CORRECTION MUST DO
- State the particular the way the book holds it. If the sentence said three
  and the book holds one, the corrected sentence says one, and whatever in
  the sentence depended on three is brought into line with it.
- Keep everything else the sentence carried: who acts, what they perceive,
  where they are, the order of things, the voice.
- Fit where it sits. It goes back between the sentence before it and the
  sentence after it, and the seam must not show.

WHAT A CORRECTION MUST NOT DO
- Do not add an event, a person, an object, or a reason that was not there.
- Do not explain the correction, hedge it, or have a character remark on it.
- Do not add or remove quotation marks: a narrated sentence stays narrated
  and a spoken line stays spoken.
- Do not rewrite a sentence that does not state the particular at all.

If a sentence cannot be corrected without changing what happens in the scene,
return it with an empty replacement and say why. An honest refusal is better
than a correction that quietly alters the scene.

FORMAT
JSON only:

{
  "replacements": [
    {"original": "", "replacement": "", "refused_because": ""}
  ]
}
