AUTHOR REQUEST:
{{input}}
REVIEW MODE:
{{mode}}
COMPLETE THESIS OUTLINE:
{{plan}}
MATERIAL TO CHECK:
{{material}}

For PLAN mode: crystallize the entire outline by identifying actual defects before any prose is written. Check premise fidelity, causal links, character intentions and knowledge, timing, evidence, spatial mechanics, ending setup, interesting conflict and whether every writer_task is executable. Cite responsible thesis IDs. Later polish or taste is not a blocking issue.
Check event ownership explicitly: one first occurrence belongs to one thesis. Adjacent theses must distinguish an event from its response and consequences. Do not assign the same confession, revelation, escape or arrival twice. In prose modes use event_contract and actual prose to check that earlier events are not restarted and the next block's central action is not prematurely executed. Planned history is not proof: compare supplied prose evidence. Recollections, deliberate motifs and a new reaction to a known fact are allowed.
For ROUGH mode: the entire story is being manifested as short scenes. Require correct action, motive, resistance and outcome, but allow terse narration, summarized dialogue and absent decorative descriptions. Do not demand final prose length. Check concrete facts and causal mechanics as strictly as in BLOCK mode.
For SEAM mode: review the actual end of the left scene and start of the right scene together. Check location changes, elapsed time, held objects, physical state, ongoing actions and what has already been said or revealed. Identify skipped necessary transitions, repeated entrances/exits or a revelation presented as new twice. Intentional time cuts are allowed when understandable; do not demand a narrated walk for every move. A previously disclosed fact may return with a new consequence, but must not be reset as unknown. Quote the actual boundary prose and identify both affected thesis IDs. Use the same major/minor rules as BLOCK. Never invent connective plot or impose particular wording.
For BLOCK mode: check the supplied prose against its exact thesis and accepted preceding prose. Did it actually dramatize the required action, motivation, resistance, outcome and reader disclosure? Are knowledge, facts, timing and continuity consistent? Does it repeat earlier exposition or reveal future secrets prematurely? Distinguish essential missing execution from optional style. A convenient assurance is not evidence that a character's required condition was met. Do not approve merely because all keywords appear. Find concrete textual evidence for each major issue.
For ROUGH, BLOCK and SEAM: the thesis is a semantic contract, not a screenplay to copy literally. Writer_task gestures, sensory details, exact dialogue and staging are suggestions unless necessary to cause the outcome or preserve an explicit author requirement. Alternative dialogue, a missing decorative prop, different gestures, summarized emotion or a preference for showing over telling are minor recommendations, never major defects. A character interpreting another person's observable behavior is not automatically omniscient narration. Do not demand invented new actions or particular sentences as the only solution.
Every prose issue must have kind: contradiction, impossible_action, unsupported_knowledge, missing_event, continuity, premature_disclosure, author_requirement, narrative_failure, or style. narrative_failure means a demonstrable missing causal step, unsupported resolution, unearned rescue, or consequential choice replaced entirely by outside intervention. A major prose issue must include evidence (a verbatim quote from supplied prose) and consequence (the specific causal, factual or essential story failure). For omissions quote the relevant surrounding passage and explain the missing essential event. Style issues are always minor. Required_change must describe the semantic repair, leaving wording and staging to the writer.
For PLAN mode return exactly:
{
  "ready": false,
  "issues": [{"severity":"major","thesis_ids":["an actual ID from the supplied plan"],"problem":"Concrete defect","required_change":"Specific correction needed"}]
}
Use actual thesis IDs, never chapter numbers, character IDs or example IDs. For a book-wide defect cite the scenes that cause or resolve it.
For prose modes return:
{
  "ready": false,
  "issues": [{"severity":"major","kind":"contradiction","evidence":"Exact prose quote (prose modes only)","consequence":"What fact or causal step fails","thesis_ids":["T01"],"problem":"Concrete defect with plan or prose evidence","required_change":"Decision or textual correction needed"}]
}
severity is major or minor. If no findings exist, return {"ready":true,"issues":[]}. Any major finding means ready:false; minor-only findings may be ready:true. Code derives readiness from findings. No score-only verdict. Major issues must be repaired before advancing.

WHOLE_ROUGH is a PROSE mode, not PLAN mode. Assess the supplied complete short manuscript, not just the outline. Every major issue MUST include all of: kind (an allowed category), evidence (one exact contiguous quote copied from the manuscript, no paraphrase, no ellipsis), consequence (the concrete causal or story failure), affected thesis_ids, problem, required_change. For an omission, quote the passage where the missing step matters and explain the omission in consequence. If you cannot substantiate a blocking claim, do not invent evidence or declare the book approved: report the uncertainty as a minor finding. Short scenes are expected; do not flag absent ornament, low word count or summarized dialogue as major.

In WHOLE_ROUGH, apply the same semantic-contract rule as BLOCK: optional staging, an exact prop, or a specific outline phrase is not mandatory if another established mechanism earns the outcome. However, a later deduction claiming an earlier specific detail that never appeared is a real missing setup or contradiction. Separate that from demands to copy outline wording.
Protagonist agency does NOT require personally collecting every record or excluding police, allies or professionals. A recording, disclosure, risky choice, preserved clue or decision that materially changes the investigation is consequential agency. To block for passivity, demonstrate that the protagonist's choices have no meaningful causal contribution; do not require that their evidence be the sole or primary legal proof.

For canonical plans, compare scene fact_ids, source scenes and character knowledge against canon. Confirm resolution exactly matches ending and every source thesis implements its linked fact through action or observation. A narrator knowing a fact never licenses a character to know it early. Review hypotheses and lies as character claims; keep them distinct from canonical truth. Explanatory accounts are notes, not an alternative story. Check the complete event chain and scene budgets for each requested chapter.
