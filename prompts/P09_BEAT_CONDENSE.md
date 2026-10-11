# P09_BEAT_CONDENSE — a beat the book already has, cut down in place

When: after a scene is written, for paragraphs that stage again something an earlier scene already staged.

TASK
Rewrite the listed paragraphs so they no longer stage what the book has
already shown, and change nothing else about the scene.

CONTRACT AND VOICE
{{story_contract}}
{{style_contract}}
{{narration}}

WHAT ALREADY HAPPENED, AND WHERE
{{restaged}}

THE PARAGRAPHS THAT STAGE IT AGAIN
{{paragraphs}}

WHAT A REWRITE MUST DO
- Treat the earlier event as known. The reader was there: at most one
  sentence may lean on it — a glance back, its consequence, what it leaves
  someone holding — and it is never played through again.
- Keep whatever in the paragraph is new: an action that had not happened, a
  thing said that moves the scene, a detail the scene needs afterwards.
- Come back clearly shorter than the original, as one paragraph.
- Fit where it sits, between the paragraph before it and the paragraph after
  it, in the voice of the contract.

WHAT A REWRITE MUST NOT DO
- Do not add an event, a person, an object, or a thought that was not there.
- Do not explain that something already happened, or have a character remark
  on the repetition.
- Do not leave a quotation open: a paragraph that is narration stays narration.

If a paragraph does not stage the earlier event after all, return it with an
empty replacement and say why.

FORMAT
JSON only:

{
  "replacements": [
    {"paragraph": "p1", "replacement": "", "refused_because": ""}
  ]
}
