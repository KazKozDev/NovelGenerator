# P08_SPAN_REPAIR — rewrite marked sentences in place

When: after a scene is written, for the sentences that repeat earlier prose, and for the sentences that carry an image the book has used up.

TASK
Rewrite the listed sentences so they stop duplicating text the book already
wrote, or stop using the worn image they are marked with, and change nothing
else about them.

CONTRACT AND VOICE
{{story_contract}}
{{style_contract}}
{{narration}}

WHAT THIS SCENE IS DOING
{{scene_summary}}

THE EARLIER TEXT THESE SENTENCES REPEAT
{{duplicated_from}}

THE SENTENCES TO REPLACE
{{sentences}}

Each sentence is marked with why it is listed. One marked "repeats" says again
what the book already said, in the same or nearly the same words. One marked
"WORN IMAGE" uses a picture the book has already used too often.

FOR A SENTENCE MARKED WORN IMAGE
- Drop the image entirely: not the same picture in other words, not a
  neighbouring one from the same source, and no other recurring image in its
  place. If the sentence existed only to carry it, replace it with what the
  point-of-view character does or notices next that is plainly there — one
  short, concrete sentence.
- Keep everything else the sentence carried: any action, any speech, any
  fact, who is present and where.
- If the image is itself what happens in the sentence — the thing is used,
  moved, or acted on, not merely described — return it with an empty
  replacement and say why.

FOR A SENTENCE MARKED REPEATS — WHAT A REPLACEMENT MUST DO
- Carry exactly the same information as the original sentence. Same fact, same
  action, same perception, same person doing it. Nothing happens in the
  replacement that did not happen in the original, and nothing stops happening.
- Stop repeating the earlier wording. Not a synonym swap over the same shape —
  a different sentence. If the original leaned on a construction the book has
  used before, do not reach for that construction again.
- Fit where it sits. It is going back into the paragraph it came from, between
  the sentence before it and the sentence after it, and the seam must not show.
- Hold the voice of the contract above.

WHAT A REPLACEMENT MUST NOT DO
- Do not add an event, a gesture, an object, or a thought that was not there.
- Do not remove one either. A shorter replacement that drops a detail changes
  what the scene established, and the book's memory has already recorded it.
- Do not change who is speaking, who is present, or where they are.
- Do not explain, summarize, or comment on what the sentence means.
- Do not add or remove quotation marks: a narrated sentence stays narrated and
  a spoken line stays spoken.

If a sentence cannot be rewritten without changing what happened — the
repetition is the event, or the earlier text is being quoted on purpose —
return it with an empty replacement and say why. An honest refusal is better
than a replacement that quietly alters the record.

FORMAT
JSON only:

{
  "replacements": [
    {"original": "", "replacement": "", "refused_because": ""}
  ]
}
