AUTHOR REQUEST:
{{input}}
Create the COMPLETE book as an ordered thesis outline, from opening through ending. Do not write prose yet. Use the supplied per-chapter scene requirements. Each thesis becomes one scene with its own consequential event; do not collapse a long chapter into one thesis. The chapter target comes from the author input, and scene budgets must add to that chapter target. Every thesis must be independently actionable by a writer and causally connected to the rest. Let characters' conflicting intentions produce events. Specify what each person knows at this moment; never give them knowledge of later revelations. Decide necessary backstory, evidence, timing and spatial mechanics now. Show where a change of mind is earned by an event or cost. Budget the author's total words across blocks, without padding.
Build the outline from its end. Decide first how the book resolves and what that resolution stands on; then every scene before it exists to put one of those things in place, and the fields are written in that order so that you commit to the end before the scenes.

Return exactly this shape, in this order:
{
  "title": "Working title",
  "premise_givens": ["Binding author premise or requirement"],
  "ending": "Resolution and deliberately open questions",
  "ending_rests_on": ["F07"],
  "places": [{"id":"L01","name":"A place scenes happen in"}],
  "tracked": [{"id":"K01","name":"A thing the plot turns on","start":"Where it is and who holds it before the first scene","at":"C01 or L01"}],
  "canon": {"facts":[{"id":"F01","truth":"Actual fact, distinct from character claims","established_in":"T01","reader_learns_in":"T01","knowledge":[{"character_id":"C01","learned_in":"T01"}]}]},
  "characters": [{"id":"C01","name":"Name","goal":"Goal","initial_knowledge":["Known fact"],"capabilities":["Means"],"limitations":["Limit"]}],
  "theses": [{"id":"T01","chapter":1,"pov_id":"C01","place":"L01","fact_ids":["F01"],
    "needs_things":[{"thing":"K01","at":"C01"}],"needs_knowledge":[{"who":"C01","fact":"F01"}],"moves":[{"thing":"K01","to":"L01"}],
    "participants":[{"character_id":"C01","intention":"What this person seeks in this event","knows":["Fact available now"],"believes":["What this person takes to be true now, right or wrong"],"does":"What this person visibly does under the pressure of this event"}],
    "when":"Time","where":"Place","state_before":"Relevant conditions and available evidence","action":"Who does what","why":"Why they choose this action now","resistance":"Opposing action or obstacle","outcome":"What happens and what changes","beneath":"What is really going on here that the point-of-view character does not perceive","establishes":["Fact or condition established"],"reader_learns":["Disclosure"],"requires":[],"writer_task":"What to dramatize and what must remain unstated","target_words":600}]
}

The chain. The outline is also a chain that a program plays forward, scene by scene, before any prose is written; it reports every link that is missing, and the outline is frozen once writing begins. State the chain in IDs:
- ending_rests_on: the canon facts the resolution cannot do without — each proof, admission, discovery. Each must be established in a scene, learned by the last scene's point-of-view character in a scene, and given to the reader.
- places: every place a scene happens in or a thing is left in. place on each thesis is one of them.
- tracked[].at: the character who holds the thing, or the place it lies in, before the first scene.
- needs_things: what must already be where, for this scene to happen as planned — the thing, and the character who must have it or the place it must be in. It may be somewhere other than the scene: a scene at home can depend on the notebook still lying in the office.
- moves: every time this scene hands a thing over, takes it, hides it or leaves it: the thing, and the character or place it ends with; "GONE" when it is destroyed, surrendered or put out of reach. A thing stays where the last move left it. If a later scene needs it elsewhere, a scene in between moves it, and says so in its action or outcome.
- needs_knowledge: who must already know which fact for what they do in this scene. They must have learned it in an earlier scene (knowledge.learned_in), not this one and not a later one.
Use empty arrays where a scene needs or moves nothing. Do not leave a need out to make the chain pass: the writer will need the thing anyway, and it will not be there.

Use exactly {{chapters}} chapters, numbered consecutively, and stable unique character/thesis IDs. requires contains only IDs of earlier theses. Each chapter must have at least one thesis. The thesis order is the writing order.
When reviewed chapter development is supplied, choose scene boundaries from its causal progression, retaining its essential attempts, decisions and consequences. Do not treat the arithmetic minimum scene count as a preferred count. One scene can contain connected steps; a new dramatic goal, confrontation or necessary time/place change may need another scene. Assign budgets only after determining what actually needs to happen. A scene must earn its place: removing it would lose a specific cause, choice, discovery, cost or consequence.
Each thesis owns one new event. action specifies its first occurrence; outcome specifies its completed result. state_before records what already happened or was revealed in earlier theses. A following thesis starts with those results and develops consequences, not another first occurrence of the same confession, discovery, departure or arrival. If an emotional beat spans several theses, assign distinct steps (decision, spoken confession, response, consequences), not repeated versions of the same event. reader_learns distinguishes genuinely new disclosure from an already-known fact recalled with new significance. writer_task must stop at this thesis's outcome and leave the next thesis's event to its owner.

Make the following decisions explicit inside the existing fields, rather than leaving them for prose improvisation:
- In ending, name the true account of the central event, how the protagonist proves it, and what remains intentionally uncertain. In reader_learns and requires, place each decisive clue, its interpretation and its test before the final inference. A witness's assertion is not confirmed truth.
- In establishes, pin stable roles, resources, quantities and deadlines when first introduced. state_before carries their current values and records any earned change. capabilities and limitations bind later actions.
- Place the premise's indispensable rule in the opening chapter, shown through an action before a consequence needs it. No mandatory magic or technical exposition when the premise does not need it.
- Each outcome carries consequences into later state_before: wounds, losses, suspicion, costs and changed relationships. Important supporting characters have a final consequential appearance.
- Give the protagonist consequential decisions, a plausible opponent with something real to protect, and previously established means for the resolution. Vary chapter mechanisms. Allocate room to failed hypotheses and investigative tests instead of compressing them into explanatory dialogue.

does is a deed: something this person does with a thing or a person present in this place, which someone else in the room could see and which belongs to this person and this moment. It is never a feeling, a thought or a bodily sensation, and never the scene's action restated. A writer given no deed fills the gap with a pounding heart.

tracked names the three to ten things this plot cannot afford to lose track of: the objects, documents, records, keys or evidence that pass between hands or prove something, and any condition of a place or body a later scene depends on. Not people (their whereabouts are followed anyway), not feelings, not facts. Each has a stable id (K01, K02…), a name a reader would recognise it by, and where it is before the first scene. Every later scene will be asked where each one is; a thesis that moves one says so in its action or outcome.

Keep every field to what a writer must be told and no more: the plan is sent with every scene, and each word in it is paid for on every call. action, resistance, outcome and why: one to three sentences each. state_before: what differs from the previous outcome, not a retelling. establishes and reader_learns: at most four short items each, and nothing listed in both. participants[].knows: only what bears on this scene. writer_task: at most three sentences on what to dramatize and what to leave unsaid; it never prescribes how a feeling shows in the body ("through physical sensation", "her pulse", "a tightening") — the feeling is carried by does.

A book keeps three things apart, and so does this plan: what happened, what is in each person's head, and what the reader has been shown. The writer of a scene will be given ONLY the head of its point-of-view character and what can be seen in the room. They will not see the premise, the ending, the next scene, canon the character has not learned, or the other people's intentions.
- action, resistance, outcome, state_before and writer_task hold only what could be seen or heard in that place, or what the point-of-view character does and thinks. Never the hidden reason. "Claire mentions Thursday evenings and watches the handshake", not "Claire, who knows of the affair, tests Nora".
- beneath holds the rest: what is really happening that the point-of-view character does not perceive, who is deceiving whom, what an act is for. The editor reads it; the writer never does. When nothing is hidden, say so in a few words.
- believes is what each person takes to be true as the scene opens, including what is false. A person acts on believes, not on canon. The gap between a belief and the truth in beneath is where the story's tension lives; plan it.
- writer_task says what to plant for later as something seen or said, and never why: "her gaze stays on their hands a beat too long".
- reader_learns_in on each fact is the scene in which the reader is given it, or INITIAL, or NEVER. It may be later than established_in: a thing can happen long before the reader is told.

Canon is the single source of story truth, chronology, provenance and resolution. Every fact is implemented in its established_in thesis; fact_ids links all scenes that establish or use it. knowledge lists the scene in which a character earns knowledge, never before its source. A narrator knowing the truth does not give it to characters. Character claims, false hypotheses and deliberate lies are labeled in scene action and state; do not record them as true canon. Author requirements bind the plan; mechanisms or punishments invented by an earlier outline may be replaced.

Use established_in: "INITIAL" only for stable facts already true before the opening, and learned_in: "INITIAL" only for a character who already knows such an initial fact. Reference initial facts in the relevant scenes, showing necessary world rules before their consequences. Never use INITIAL to give a character knowledge of a later discovery.

Write the resolution only in ending. Return canon with facts only; the application derives its stored resolution from ending.
