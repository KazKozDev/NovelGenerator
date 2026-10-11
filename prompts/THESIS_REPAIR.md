AUTHOR REQUEST:
{{input}}
COMPLETE CURRENT THESIS OUTLINE:
{{plan}}
DEFECTS TO RESOLVE:
{{issues}}
Return the complete corrected outline in the SAME JSON shape, not prose or a list of changes. Keep thesis and character IDs stable. You may repair causes, decisions and consequences; propagate changes to every affected thesis, including setup, available knowledge and ending. Keep unaffected distinctive choices and the author's explicit givens. No prose has been written yet. Do not silently replace this book with another story.

Keep canon and all scene fact_ids; update the canonical facts and source/knowledge references together with affected theses. Write the final resolution only in ending; return canon with facts only. The application derives its stored resolution. Chapter budgets come from author input and are distributed across distinct scenes, not padded descriptions.
