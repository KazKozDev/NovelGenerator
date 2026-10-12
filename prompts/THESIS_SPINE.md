AUTHOR REQUEST:
{{input}}
SYNOPSIS:
{{synopsis}}
THE TWO PEOPLE HAVE SPOKEN FOR THEMSELVES. Each answered alone, knowing only what that person knows. Build the story from what they said they would do; where their plans collide is where the story is. Neither is made to act against their own account, and neither is made a fool so the other can win:
{{voices}}
Before any scene is planned, settle how this story works. Not its scenes: its mechanism. An outline built on an unsettled mechanism cannot be repaired afterwards, so decide here, briefly and concretely, and decide from the ending backwards.

Return exactly this JSON and nothing else:
{"in_two_sentences":"How the story works, as one reader would tell it to another: who does what to whom, and how it comes out. No names of documents, no qualifications",
 "ending":"What is finally true, and what the protagonist paid or gave up for it",
 "turns":[{"who":"name","does":"A deliberate act that changes the situation","because":"Why this person, now","costs":"What it closes off or risks"}],
 "deeds":[{"who":"name","deed":"What the opponent or another force actually does","when":"before the opening | chapter N","on_the_page":"What the reader watches: the deed itself, or the protagonist walking in on it or on what it left. Never a report of it by a third person","safer_way":"The cheaper, safer move this person had, and why they do not take it"}],
 "proofs":[{"thing":"An object, record or testimony the resolution leans on","shows":"What a stranger who knows nothing else would conclude from it","alone_is_not_enough_because":"Its innocent reading","made_decisive_by":"The second fact that closes the innocent reading","obtained_by":"What the protagonist does to get it"}],
 "first_question":{"asked_by":"The official, relative or rival with most reason to doubt","question":"The first thing they ask the protagonist","answer":"What the story's facts answer"},
 "chapters":[{"chapter":1,"events":[{"where":"A named place","what":"Who does what to whom, bodily, in that place"}],"worse_because":"What is at risk at its end that was not at its start"}]}

Rules.
- A story is something that happens, in places, to bodies. It is not an argument. If in_two_sentences cannot be said without "which proves that", the mechanism is a legal case, not a story: change the mechanism until a child could repeat it.
- The worst thing that happens in the story happens in front of the reader, or the protagonist finds it with her own eyes. A killing, a betrayal or a ruin that is only told to someone across a table has not happened.
- At most one proof may be a document, and no proof may depend on comparing handwriting, dates, wording or records. A proof is something a reader can picture in a hand: a thing in the wrong place, a person seen where they said they were not, a thing someone could only have if they did it.
- The last decisive act is something the protagonist does with her body at risk, in a place, against a person who can answer back. Reading, realizing, reviewing and testifying are not acts.
- No place holds more than a third of the book's events, and no two consecutive events share a place unless something in it has changed.
- turns: the three to six acts that decide the story, in order. At least two thirds are the protagonist's own, and the last decisive one is the protagonist's. A discovery that falls into someone's hands is not a turn.
- deeds: every act the plot depends on that the protagonist does not perform — a killing, a theft, a lie, a set-up. Each has a moment and a place, and a way it reaches the page. If nobody is working against the protagonist, the list holds what the obstacle itself does.
- proofs: everything the ending relies on to convince anyone. shows is what it shows, not what the story needs. If its innocent reading cannot be closed, replace the proof. A story with nothing to prove returns an empty list.
- chapters: one entry per requested chapter, three to five events each. No two events in the book are the same attempt in the same place with the same result.
- Use only what the author asked for; add no genre, crime or subplot the request does not contain.
- Names and particulars are fixed here and will be binding on the outline: write them once and consistently.
