import { literaryResponse } from './helpers/literaryFixture';
import { describe, expect, it, vi } from 'vitest';
import { analyseChapter, confirmedFindings, demoteHedgedKnowledge, demoteKnownCanon, demoteSuggestions, duplicatePassages, findingStreaks, mergeFindings, sameFindingSet, parseObject, reviewBook, reviewChapter } from '../utils/novel/review';
import { createRun, NovelEngine } from '../utils/novel/engine';
import { MemoryRunStore } from '../utils/novel/runStore';
import { createBookSpec, genreCraft, specPrompt, type ChapterRecord, type NovelRun } from '../utils/novel/contracts';
import { acceptCandidate, addCandidate, emptyStoryState, evidenceExists, nextUnacceptedChapter, reconcileCheckpoint } from '../utils/novel/storyState';
import { stampLiterary } from './helpers/literaryFixture';

function fixture() {
  const run = createRun(createBookSpec('A letter changes a family', 3, { targetWordsPerChapter: 300 }), { provider: 'ollama', ollamaEndpoint: '/api/ollama', ollamaModel: 'test' });
  const chapter: ChapterRecord = { number: 1, plan: { title: 'A letter', summary: 'A choice', sceneBreakdown: 'one scene', characterDevelopmentFocus: 'trust', plotAdvancement: 'truth', timelineIndicators: 'evening', emotionalToneTension: 'tense', connectionToNextChapter: 'consequence' }, versions: [], status: 'draft', repairAttempts: 2 };
  const filler = [
    'She kept the letter folded in her pocket while the clerk read the register.',
    'Rain moved along the gutter outside and nobody in the room looked up at it.',
    'A clock behind the counter lost a second every hour and no one had fixed it.',
    'The archive smelled of dust, old glue and the cold iron of the shelving.',
    'Somebody had written a name on the ledger and then crossed it out twice.',
    'Her boots left grey half-moons of water across the boards by the door.',
    'The lamp above the desk buzzed whenever a tram passed in the street below.',
    'He counted the coins into her palm slowly, as if the number might change.',
    'Outside, a dog barked once and then thought better of barking again.',
    'The window frame had swollen with damp and would not close all the way.',
    'A child ran past the glass carrying something wrapped in newspaper.',
    'She thought about the boat and about how long the repairs would take.',
    'The clerk turned a page and the sound was louder than either of them expected.',
    'Someone upstairs dragged a chair across the floor and then stopped.',
    'The stove had gone out an hour ago and nobody had said anything about it.',
    'She read the top line again, though she already knew what it said.',
    'A moth circled the lamp twice and settled on the cold part of the shade.',
    'The town outside went on with its afternoon without any interest in either of them.',
  ].join(' ');


  const version = addCandidate(chapter, `Vera read the letter. ${filler}`, 'test');
  run.chapters = [chapter];
  return { run, chapter, version };
}

describe('Evidence verification tolerance', () => {
  it('accepts a real passage shortened with an elision marker or reflowed whitespace', () => {
    const { version } = fixture();
    expect(evidenceExists({ chapter: 1, revision: version.revision, quote: 'Vera read the letter. She kept the letter folded...' }, 1, version)).toBe(true);
    expect(evidenceExists({ chapter: 1, revision: version.revision, quote: 'Vera read the letter.\n   She kept the letter' }, 1, version)).toBe(true);
  });
  it('still rejects invented prose, the wrong revision and an unidentifiable fragment', () => {
    const { version } = fixture();
    expect(evidenceExists({ chapter: 1, revision: version.revision, quote: 'Vera burned the letter in the yard' }, 1, version)).toBe(false);
    expect(evidenceExists({ chapter: 1, revision: version.revision + 1, quote: 'Vera read the letter.' }, 1, version)).toBe(false);
    expect(evidenceExists({ chapter: 1, revision: version.revision, quote: '...' }, 1, version)).toBe(false);
    expect(evidenceExists({ chapter: 1, revision: version.revision, quote: 'Vera' }, 1, version)).toBe(false);
  });
});

describe('Promise ledger schedule', () => {
  it('refuses a promise label that contradicts the plan, whatever the extractor claims', async () => {
    const { run, chapter, version } = fixture();
    run.blueprint = { centralConflict: 'c', protagonistChange: 'p', endingPayoff: 'e', characters: {}, chapters: [], promises: [
      { id: 'letter', description: 'The truth surfaces', setupChapter: 1, payoffChapter: 3, required: true },
    ] };
    const passage = version.content.split(/\n\s*\n/).filter(Boolean)[0];
    const reply = (field: string) => {
      if (field === 'facts') return JSON.stringify({ summary: 'Vera reads the letter.', facts: [] });
      if (field === 'events') return JSON.stringify({ events: [] });
      if (field === 'beats') return JSON.stringify({ beats: [] });
      // Chapter 1 owns the setup, never the payoff, however confidently the model labels it.
      return JSON.stringify({ promises: [{ promiseId: 'letter', kind: 'payoff', evidence: { sourceId: 'p1' } }, { promiseId: 'letter', kind: 'setup', evidence: { sourceId: 'p1' } }] });
    };
    const analysis = await analyseChapter(run, chapter, version, async prompt => reply(prompt.includes('Extract facts') ? 'facts' : prompt.includes('Extract events') ? 'events' : prompt.includes('Extract beats') ? 'beats' : 'promises'));
    expect(analysis.promises).toHaveLength(1);
    expect(analysis.promises[0]).toMatchObject({ promiseId: 'letter', kind: 'setup' });
    expect(passage).toContain('Vera read the letter.');
  });
});

describe('Duplicate detection boundaries', () => {
  it('ignores repetition short enough to be a deliberate refrain', () => {
    const refrain = 'He did not sleep.';
    expect(duplicatePassages(`${refrain} The night went on. ${refrain}`)).toHaveLength(0);
  });

  it('catches a restatement that was reworded rather than repeated', () => {
    const first = 'Ray stood at the counter of the clinic and felt the night press against the glass.';
    const reworded = 'Ray stood in the dark of the clinic and felt the night press against the glass.';
    expect(duplicatePassages(`${first} He waited a while longer. ${reworded}`)).toHaveLength(1);
  });

  it('catches a repeat that differs only in punctuation or spacing', () => {
    const sentence = 'Ray stood in the dark of the clinic and listened to the rain against the window.';
    const variant = 'Ray stood in the dark of the clinic and listened to the rain against the window';
    expect(duplicatePassages(`${sentence} He waited a while longer. ${variant}.`)).toHaveLength(1);
  });
});

describe('Deterministic duplicate check', () => {
  const line = (n: number) => `Ray stood at the counter of the clinic and felt the night press against the glass for the ${n} time.`;

  it('fails a chapter that says the same thing twice, whatever the reviewer reports', async () => {
    const { run, chapter, version } = fixture();
    version.content = [line(1), 'He drove home along the bayou road without once looking at the water beside him.', line(1)].join(' ');
    const result = await reviewChapter(run, chapter, version, async () => '{"issues":[]}');
    const issue = result.issues.find(item => item.id === 'duplicated-passage');
    expect(result.status).toBe('failed');
    expect(issue?.severity).toBe('critical');
    expect(issue?.instruction).toContain('Delete the weaker occurrence');
    expect(version.content).toContain(issue!.evidence[0].quote);
  });

  it('leaves a chapter alone when two sentences share a subject but say different things', async () => {
    const { run, chapter, version } = fixture();
    version.content = [
      'Ray stood at the counter of the clinic and counted the notes into the drawer.',
      'Ray drove out to the bayou before dawn with the radio off and the windows down.',
    ].join(' ');
    const result = await reviewChapter(run, chapter, version, async () => '{"issues":[]}');
    expect(result.issues.some(item => item.id === 'duplicated-passage')).toBe(false);
  });
});

describe('Deterministic script check', () => {
  it('fails a Russian chapter that carries characters from the writer model\'s own script', async () => {
    const { run, chapter, version } = fixture();
    run.spec.language = 'Russian';
    version.content = version.content.replace('Vera read the letter.', 'Вера прочитала письмо, повторяя её试探тельное движение.');
    const result = await reviewChapter(run, chapter, version, async () => '{"issues":[]}');
    expect(result.status).toBe('failed');
    const issue = result.issues.find(item => item.id === 'foreign-script-cjk');
    expect(issue?.severity).toBe('critical');
    expect(version.content).toContain(issue!.evidence[0].quote);
    // A whole sentence, so the repair has a unit to rewrite rather than a fragment with no ends.
    expect(issue!.evidence[0].quote).toBe('Вера прочитала письмо, повторяя её试探тельное движение.');
  });
  it('leaves the same characters alone when the story is written in that script', async () => {
    const { run, chapter, version } = fixture();
    run.spec.language = 'Chinese';
    version.content = version.content.replace('Vera read the letter.', '她读了那封信。');
    const result = await reviewChapter(run, chapter, version, async () => '{"issues":[]}');
    expect(result.issues.some(item => item.id.startsWith('foreign-script'))).toBe(false);
  });
});

describe('Prompt canon size', () => {
  it('sends the established facts to writer and reviewer without the paragraphs that prove them', async () => {
    const { run, chapter, version } = fixture();
    const quote = fixture().version.content.split(/(?<=\.)\s+/).slice(1, 5).join(' ');
    const earlier = chapter.versions[0];
    earlier.analysis = { summary: 'Vera reads the letter.', facts: [{ id: 'f1', subject: 'Vera', predicate: 'condition', value: 'sleepless', knownBy: ['Vera'], evidence: { chapter: 1, revision: earlier.revision, quote } }], events: [], promises: [] };
    chapter.status = 'accepted';
    chapter.acceptedRevision = earlier.revision;
    chapter.candidateRevision = undefined;
    run.chapters = [chapter, { ...chapter, number: 2 }];
    let seen = '';
    await reviewChapter(run, { ...chapter, number: 2 }, version, async prompt => { seen = prompt; return '{"issues":[]}'; });
    const canonBlock = seen.slice(seen.indexOf('ACCEPTED CANON BEFORE THIS CHAPTER:'), seen.indexOf("PLANNED PROMISES (the whole book's schedule):"));
    expect(canonBlock).toContain('sleepless');
    expect(canonBlock).toContain('Vera reads the letter.');
    expect(canonBlock).not.toContain(quote);
    // The stored evidence is untouched: verification still reads the full quotation.
    expect(earlier.analysis.facts[0].evidence.quote).toBe(quote);
  });
});

describe('Sampled review durability', () => {
  it('keeps an evidenced defect when a later pass over the same prose comes back clean', async () => {
    const run = createRun(createBookSpec('A letter changes a family', 3, { targetWordsPerChapter: 300 }), { provider: 'ollama', ollamaEndpoint: '/api/ollama', ollamaModel: 'test' });
    const { chapter, version } = fixture();
    run.chapters = [chapter];
    run.outline = 'Vera recovers the letter and pays for it.';
    run.stage = 'writing';
    run.blueprint = { centralConflict: 'c', protagonistChange: 'p', endingPayoff: 'e', characters: {}, chapters: [], promises: [{ id: 'letter', description: 'truth', setupChapter: 1, payoffChapter: 1, required: false }] };
    // Budget spent on this exact finding: the verdict on the candidate is the whole subject here.
    chapter.repairAttempts = 5;
    chapter.lastFindingShapes = [{ id: 'vase', category: 'canon', description: 'The vase has stood there for years and since yesterday.' }];
    version.review = { validationVersion: 2, status: 'failed', checkedRevision: version.revision, issues: [{ id: 'vase', category: 'canon', severity: 'major', description: 'The vase has stood there for years and since yesterday.', instruction: 'Resolve the timeline.', evidence: [{ chapter: 1, revision: version.revision, quote: 'Vera read the letter.' }] }] };
    chapter.candidateRevision = version.revision;
    const engine = new NovelEngine(async (prompt, system) => literaryResponse(prompt, system) ?? '{"issues":[]}', new MemoryRunStore());
    await expect(engine.continue(run)).rejects.toThrow(/needs editorial attention/);
    const rechecked = chapter.versions.find(item => item.revision === version.revision);
    expect(rechecked?.review?.status).toBe('failed');
    expect(rechecked?.review?.issues.map(issue => issue.id)).toContain('vase');
    expect(chapter.acceptedRevision).toBeUndefined();
  });
});

describe('Author contract fields', () => {
  it('carries only settings the author can actually set', () => {
    const spec = createBookSpec('A letter changes a family', 3, { genre: 'thriller', generationSpeedMode: 'fast' });
    expect(specPrompt(spec)).not.toContain('generationSpeedMode');
  });

  it('resolves a qualified genre to its craft profile and invents nothing for an unknown one', () => {
    expect(genreCraft(createBookSpec('p', 3, { genre: 'psychological thriller' }))).toContain('GENRE CRAFT');
    expect(genreCraft(createBookSpec('p', 3, { genre: 'thriller' }))).toBe(genreCraft(createBookSpec('p', 3, { genre: 'psychological thriller' })));
    expect(genreCraft(createBookSpec('p', 3, { genre: 'kitchen-sink saga' }))).toBe('');
  });

  it('gives genre craft to the prose steps and keeps it out of review', async () => {
    const { run, chapter, version } = fixture();
    run.spec.genre = 'horror';
    let seen = '';
    await reviewChapter(run, chapter, version, async prompt => { seen = prompt; return '{"issues":[]}'; });
    // A reviewer handed a pitfall list reports stylistic preference as defect.
    expect(seen).toContain('"genre": "horror"');
    expect(seen).not.toContain('GENRE CRAFT');
  });
});

describe('Chapter review scope', () => {
  it('tells the reviewer which promises this chapter actually owes', async () => {
    const { run, chapter, version } = fixture();
    run.blueprint = { centralConflict: 'c', protagonistChange: 'p', endingPayoff: 'e', characters: {}, chapters: [], promises: [
      { id: 'letter', description: 'The truth surfaces', setupChapter: 1, payoffChapter: 3, required: true },
      { id: 'boat', description: 'The boat is restored', setupChapter: 2, payoffChapter: 3, required: false },
    ] };
    let seen = '';
    await reviewChapter(run, chapter, version, async prompt => { seen = prompt; return '{"issues":[]}'; });
    const scoped = seen.slice(seen.indexOf('SCHEDULED FOR THIS CHAPTER ONLY:'), seen.indexOf('FULL CANDIDATE PROSE:'));
    expect(scoped).toContain('letter');
    expect(scoped).not.toContain('boat');
  });
});

describe('Editorial evidence filtering', () => {
  const issue = (evidence: object[]) => JSON.stringify({ issues: [{ id: 'pace-1', category: 'pacing', severity: 'major', description: 'The middle sags.', instruction: 'Tighten the repeated beat.', evidence }] });

  it('keeps an evidenced issue and drops only the citation that is not in the prose', async () => {
    const { run, chapter, version } = fixture();
    const result = await reviewChapter(run, chapter, version, async () => issue([
      { chapter: 1, revision: version.revision, quote: version.content.split(/(?<=\.)\s+/)[1] },
      { chapter: 1, revision: version.revision, quote: 'Vera hurled the letter into the fireplace.' },
    ]));
    expect(result.status).toBe('failed');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].evidence).toHaveLength(1);
  });

  it('never passes a chapter whose only findings could not be verified', async () => {
    const { run, chapter, version } = fixture();
    const result = await reviewChapter(run, chapter, version, async () => issue([{ chapter: 1, revision: version.revision, quote: 'Vera hurled the letter into the fireplace.' }]));
    expect(result.status).toBe('not_checked');
    expect(result.issues).toHaveLength(0);
  });
});

describe('Follow-up audit regressions', () => {
  it('does not turn repeated malformed JSON into a clean review', async () => {
    const { run, chapter, version } = fixture();
    const llm = vi.fn(async () => '{"issues":[...]}');
    const result = await reviewChapter(run, chapter, version, llm);
    expect(result.status).toBe('not_checked');
    expect(llm).toHaveBeenCalledTimes(2);
  });
  it('does not accept a critical issue without a quotation from the reviewed prose', async () => {
    const { run, chapter, version } = fixture();
    for (const evidence of [[], [{ chapter: 1, revision: 1, quote: 'A fabricated quotation.' }]]) {
      const result = await reviewChapter(run, chapter, version, async () => JSON.stringify({ issues: [{ id: 'critical', category: 'canon', severity: 'critical', description: 'Contradiction', instruction: 'Resolve the contradiction', evidence }] }));
      expect(result.status).toBe('not_checked');
    }
  });
  it('stamps a verified quotation with the revision actually reviewed, whatever the model labelled it', async () => {
    const { run, chapter, version } = fixture();
    const result = await reviewChapter(run, chapter, version, async () => JSON.stringify({ issues: [{ id: 'critical', category: 'canon', severity: 'critical', description: 'Contradiction', instruction: 'Resolve the contradiction', evidence: [{ chapter: 9, revision: 9, quote: 'Vera read the letter.' }] }] }));
    expect(result.status).toBe('failed');
    expect(result.issues[0].evidence).toEqual([{ chapter: 1, revision: version.revision, quote: 'Vera read the letter.' }]);
  });
  it('does not invent an empty canon when extraction fails', async () => {
    const { run, chapter, version } = fixture();
    await expect(analyseChapter(run, chapter, version, async () => 'not JSON')).rejects.toThrow(/unvalidated/);
    await expect(analyseChapter(run, chapter, version, async () => JSON.stringify({ summary: 'A fact', facts: [{ id: 'x', subject: 'Vera', predicate: 'knowledge', value: 'secret', evidence: { chapter: 1, revision: 1, quote: 'Vera read the letter.' } }], events: [], promises: [] }))).rejects.toThrow(/unvalidated/);
  });
  it('never accepts a failed chapter because its retry budget is exhausted', () => {
    const { run, chapter, version } = fixture();
    version.review = { status: 'failed', checkedRevision: 1, issues: [] };
    version.analysis = { summary: 'A letter', facts: [], events: [], promises: [] };
    expect(chapter.repairAttempts).toBe(2);
    expect(() => acceptCandidate(run, 1)).toThrow(/reviewed/);
  });
  it('does not ignore a pending candidate on a previously accepted chapter', () => {
    const { run, chapter, version } = fixture();
    chapter.status = 'accepted'; chapter.acceptedRevision = version.revision;
    expect(nextUnacceptedChapter(run)).toBe(chapter);
  });
  it('preserves all legacy prose while invalidating old success claims', () => {
    const { run, chapter, version } = fixture();
    delete run.validationVersion;
    run.stage = 'complete';
    chapter.status = 'accepted'; chapter.acceptedRevision = 1;
    const original = version.content;
    expect(reconcileCheckpoint(run)).toBe(true);
    expect(chapter.status).toBe('invalidated');
    expect(version.content).toBe(original);
    expect(run.finalReview).toBeUndefined();
    expect(reconcileCheckpoint(run)).toBe(false);
  });
  it('rejects ambiguous example/result objects instead of choosing the largest one', () => {
    expect(() => parseObject('{"issues":[]}\n{"issues":[{"description":"real defect"}]}', ['issues'])).toThrow(/Ambiguous/);
    expect(parseObject('<think>private notes</think>\n```json\n{"issues":[]}\n```', ['issues'])).toEqual({ issues: [] });
  });
  it('does not pass global review after malformed responses', async () => {
    const { run, chapter, version } = fixture();
    chapter.status = 'accepted'; chapter.acceptedRevision = 1; chapter.candidateRevision = undefined;
    version.analysis = { summary: 'A letter', facts: [], events: [], promises: [] };
    run.chapters = [1, 2, 3].map(number => ({ ...structuredClone(chapter), number }));
    const llm = vi.fn(async () => 'malformed');
    const result = await reviewBook(run, llm, 'final');
    expect(result.status).toBe('not_checked');
    expect(llm).toHaveBeenCalledTimes(2);
  });
});


describe('Source-indexed evidence extraction', () => {
  it('resolves a declared source to exact prose and rejects unknown or ambiguous references', async () => {
    const { run, chapter, version } = fixture();
    const response = (evidence: unknown) => JSON.stringify({ summary: 'Vera reads.', facts: [], events: [{ id: 'read', description: 'Vera reads the letter', consequences: [], evidence }], promises: [], beats: [] });
    const analysis = await analyseChapter(run, chapter, version, async () => response({ sourceId: 'p1' }));
    expect(analysis.events[0].evidence).toEqual({ chapter: 1, revision: version.revision, quote: version.content });
    await expect(analyseChapter(run, chapter, version, async () => response({ sourceId: 'p999' }))).rejects.toThrow(/Unknown evidence sourceId/);
    await expect(analyseChapter(run, chapter, version, async () => response({ sourceId: 'p1', quote: 'fabricated' }))).rejects.toThrow(/only sourceId/);
  });

  it('drops invented promise IDs while preserving required-promise failure downstream', async () => {
    const { run, chapter, version } = fixture();
    run.blueprint = { centralConflict: 'truth', protagonistChange: 'honesty', endingPayoff: 'truth told', characters: {}, chapters: [], promises: [{ id: 'known', description: 'known promise', setupChapter: 1, payoffChapter: 3, required: true }] };
    const responses = [
      { summary: 'Vera reads.', facts: [] },
      { events: [] },
      { promises: [{ promiseId: 'invented', kind: 'setup', evidence: { sourceId: 'p1' } }] },
      { beats: [] },
    ];
    const analysis = await analyseChapter(run, chapter, version, async () => JSON.stringify(responses.shift()));
    expect(analysis.promises).toEqual([]);
  });
});

describe('A leak reported against a sentence that hedges itself', () => {
  const issue = (quote: string, category: 'knowledge' | 'plot' = 'knowledge', severity: 'critical' | 'minor' = 'critical') =>
    ({ id: 'leak', category, severity, description: 'The character uses knowledge the story has not given.', instruction: 'Remove it.', evidence: [{ chapter: 3, revision: 15, quote }] });

  it('demotes it to advisory, whatever the guess is about', () => {
    // Quoted verbatim from a live run, where this sentence blocked a chapter through two full budgets.
    const hedged = 'Фигура с этим предметом напоминала кого-то, чье лицо мелькало в новостях год назад.';
    expect(demoteHedgedKnowledge([issue(hedged)])[0].severity).toBe('minor');
    expect(demoteHedgedKnowledge([issue('The figure seemed to be someone he had seen in the news.')])[0].severity).toBe('minor');
  });

  it('leaves a plain assertion, and every other category, exactly as reported', () => {
    const stated = 'Алексей набрал номер Марии Соколовой, дочери журналиста из Колонны №305.';
    expect(demoteHedgedKnowledge([issue(stated)])[0].severity).toBe('critical');
    // A guess about the plot is the reviewer's business, not this rule's: it only answers leaks.
    expect(demoteHedgedKnowledge([issue('Возможно, дверь была открыта.', 'plot')])[0].severity).toBe('critical');
    // An issue with no evidence at all cannot be judged hedged.
    expect(demoteHedgedKnowledge([{ ...issue('x'), evidence: [] }])[0].severity).toBe('critical');
  });
});

describe('A finding written as a suggestion', () => {
  const issue = (description: string, category: 'character' | 'plot' | 'canon' | 'knowledge' = 'character', severity: 'major' | 'minor' = 'major') =>
    ({ id: 'x', category, severity, description, instruction: 'Rework it.', evidence: [{ chapter: 4, revision: 14, quote: 'q' }] });

  it('is demoted where taste lives, quoting the two that burned a chapter budget', () => {
    expect(demoteSuggestions([issue('Елена слишком быстро соглашается, что делает её решение недостаточно мотивированным.')])[0].severity).toBe('minor');
    expect(demoteSuggestions([issue('Момент выбора должен быть более напряжённым.', 'plot')])[0].severity).toBe('minor');
    expect(demoteSuggestions([issue('The choice should be more tense and internally contradictory.')])[0].severity).toBe('minor');
  });

  it('leaves a stated defect alone, and never touches canon, knowledge or format', () => {
    expect(demoteSuggestions([issue('Елена знает о колонне до того, как ей о ней сказали.')])[0].severity).toBe('major');
    // A contradiction of canon is a defect however it is worded; taste has no vote there.
    expect(demoteSuggestions([issue('Недостаточно мотивировано: герой противоречит установленному факту.', 'canon')])[0].severity).toBe('major');
    expect(demoteSuggestions([issue('Слишком быстро раскрывает знание, которого у него нет.', 'knowledge')])[0].severity).toBe('major');
  });
});

describe('A judgement of taste seen once', () => {
  const issue = (description: string, category: 'character' | 'canon' = 'character', id = 'x') =>
    ({ id, category, severity: 'major' as const, description, instruction: 'Rework it.', evidence: [{ chapter: 4, revision: 14, quote: 'q' }] });

  it('is advisory the first round and blocking when the next round sees it again', () => {
    const first = confirmedFindings([issue('Елена соглашается на условия, не показав борьбы с собой.')]);
    expect(first[0].severity).toBe('minor');
    // The same finding, worded differently — which is how it always comes back.
    const again = confirmedFindings([issue('Елена принимает условия Алексея, не показав внутренней борьбы с собой.')], first);
    expect(again[0].severity).toBe('major');
  });

  it('never softens a dimension where taste has no vote, or a measurement of our own', () => {
    expect(confirmedFindings([issue('Противоречит установленному факту.', 'canon')])[0].severity).toBe('major');
    expect(confirmedFindings([issue('The chapter says the same thing twice.', 'character', 'duplicated-passage')])[0].severity).toBe('major');
    expect(confirmedFindings([issue('A planned scene never reached the page.', 'character', 'undramatized-beat')])[0].severity).toBe('major');
  });

  it('does not accept a different finding in the same dimension as confirmation', () => {
    const first = confirmedFindings([issue('Елена соглашается слишком охотно.')]);
    const other = confirmedFindings([issue('Алексей входит в архив без причины, которую глава назвала.')], first);
    expect(other[0].severity).toBe('minor');
  });
});

describe('A leak the canon already answers', () => {
  const canon = (knownBy: string[]) => ({ ...emptyStoryState(), facts: [{
    id: 'c305', subject: 'Колонна №305', predicate: 'содержит', value: 'запись убийства журналиста',
    knownBy, evidence: { chapter: 1, revision: 1, quote: 'q' },
  }] });
  const leak = (description: string) => ({ id: 'k', category: 'knowledge' as const, severity: 'critical' as const, description, instruction: 'Fix.', evidence: [{ chapter: 5, revision: 5, quote: 'q' }] });

  it('is demoted when the fact is recorded and the character is one who knows it', () => {
    // Quoted from a live run: the review demanded proof of exactly what the canon was holding.
    const issue = leak('Алексей использует знание о Колонне №305 и убийстве журналиста без подтверждения.');
    expect(demoteKnownCanon([issue], canon(['Алексей']))[0].severity).toBe('minor');
  });

  it('leaves it alone when the canon records the fact for somebody else', () => {
    const issue = leak('Алексей использует знание о Колонне №305 и убийстве журналиста без подтверждения.');
    expect(demoteKnownCanon([issue], canon(['Елена']))[0].severity).toBe('critical');
  });

  it('leaves it alone when the canon holds nothing about it', () => {
    const issue = leak('Алексей называет адрес Марии Соколовой, который ему никто не давал.');
    expect(demoteKnownCanon([issue], canon(['Алексей']))[0].severity).toBe('critical');
  });
});

describe('The stuck counter', () => {
  const finding = (description: string, id = 'issue-1') =>
    ({ id, category: 'knowledge' as const, severity: 'major' as const, description, instruction: 'Fix.', evidence: [] });

  it('sees the same finding through a rewording, which is how it always comes back', () => {
    // Both quoted from a live run, four rounds apart, reported as different findings by the model.
    const first = [finding('Алексей использует знание о точном механизме ускорения света, которого нет в тексте.')];
    const later = [finding('Алексей использует конкретное знание о механизме ускорения света, не установленное ранее.', 'issue-003')];
    expect(sameFindingSet(later, first)).toBe(true);
  });

  it('does not call a different defect the same one, or count a round that answered something', () => {
    const before = [finding('Алексей использует знание о механизме ускорения света, которого нет в тексте.')];
    const other = [finding('Елена знает о комнате отдыха Алексея, хотя планов помещений ей никто не давал.')];
    expect(sameFindingSet(other, before)).toBe(false);
    // Two findings answered by one is progress, not a repeat.
    expect(sameFindingSet(before, [...before, ...other])).toBe(false);
  });
});

describe('The whole-book review and its suggestions', () => {
  it('demotes a wish and keeps a structural defect, both quoted from a live run', () => {
    const issue = (description: string, category: 'character' | 'plot') =>
      ({ id: 'b', category, severity: 'major' as const, description, instruction: 'Rework.', evidence: [{ chapter: 4, revision: 15, quote: 'q' }] });
    const wish = issue("Елена's betrayal of Алексей in Chapter 4 lacks sufficient motivation.", 'character');
    // Only a reader of all five chapters can see this one, and no wording of it is a matter of taste.
    const structural = issue('The plan to redirect the light from Column 402 is introduced in Chapter 4 without prior setup or foreshadowing.', 'plot');
    const [first, second] = demoteSuggestions([wish, structural]);
    expect(first.severity).toBe('minor');
    expect(second.severity).toBe('major');
  });
});

describe('Reconciling a checkpoint whose ledger has moved', () => {
  it('revalidates from the first stale chapter, not from the first chapter of the book', () => {
    const run = createRun(createBookSpec('A letter changes a family', 3, { targetWordsPerChapter: 300 }), { provider: 'ollama', ollamaEndpoint: '/api/ollama', ollamaModel: 'test' });
    run.validationVersion = 2;
    run.literaryValidationVersion = 1;
    run.chapters = [1, 2, 3].map(number => {
      const chapter: ChapterRecord = { number, plan: { title: 't', summary: 's', sceneBreakdown: 'b', characterDevelopmentFocus: 'c', plotAdvancement: 'p', timelineIndicators: 'i', emotionalToneTension: 'e', connectionToNextChapter: 'n' }, versions: [], status: 'draft', repairAttempts: 0 };
      const version = addCandidate(chapter, `Chapter ${number} prose that stands on its own.`, 'fixture');
      version.review = { validationVersion: 2, status: 'passed', issues: [], checkedRevision: version.revision };
      version.analysis = { summary: `Chapter ${number}.`, facts: [], events: [], promises: [], beats: [] };
      stampLiterary(run, number, version);
      chapter.status = 'accepted';
      chapter.acceptedRevision = version.revision;
      return chapter;
    });
    // Chapter 3's literary record no longer matches the ledger — the ordinary consequence of repairing
    // and re-accepting a chapter before it.
    run.chapters[2].versions[0].literary!.contextKey = 'a ledger this record was not written against';
    expect(reconcileCheckpoint(run)).toBe(true);
    expect(run.chapters.map(chapter => chapter.status)).toEqual(['accepted', 'accepted', 'invalidated']);
    // And the canon of the chapters that kept their standing is kept with them.
    expect(Object.keys(run.canon.summaries)).toEqual(['1', '2']);
  });
});

describe('One defect said twice', () => {
  const issue = (description: string, severity: 'critical' | 'major' = 'major', id = 'a') =>
    ({ id, category: 'knowledge' as const, severity, description, instruction: 'Fix.', evidence: [{ chapter: 3, revision: 7, quote: 'q' }] });

  it('reaches the repair once, at the severity the review gave it at its sharpest', () => {
    const merged = mergeFindings([
      issue('Алексей использует имя жертвы из Колонны №305 до того, как оно ему доступно.'),
      issue('Алексей использует имя жертвы из Колонны №305, хотя оно ещё не было ему доступно.', 'critical', 'b'),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].severity).toBe('critical');
  });

  it('leaves two different defects as two', () => {
    const both = mergeFindings([
      issue('Алексей использует имя жертвы из Колонны №305 до того, как оно ему доступно.'),
      issue('Елена знает о комнате отдыха Алексея, хотя планов помещений ей никто не давал.'),
    ]);
    expect(both).toHaveLength(2);
  });
});

describe('A one-word paragraph', () => {
  it('cannot be a source on its own, because evidence that short proves nothing', async () => {
    const { run, chapter } = fixture();
    // The shape that killed a live English run: a paragraph reading "Salt." offered as evidence.
    const version = addCandidate(chapter, 'Salt.\n\nShe tasted it on the wind before she saw the water at all, and knew the town by that alone.\n\nThe piano had not been opened in six years, and the keeper did not say why he wanted it playable now.', 'fixture');
    const seen: string[] = [];
    const analysis = await analyseChapter(run, chapter, version, async (prompt: string) => {
      const sources = JSON.parse(prompt.slice(prompt.indexOf('[{"sourceId"'), prompt.indexOf(']', prompt.indexOf('[{"sourceId"')) + 1));
      seen.push(...sources.map((source: { text: string }) => source.text));
      if (prompt.includes('TASK: Extract facts')) return JSON.stringify({ summary: 'She arrives.', facts: [] });
      if (prompt.includes('TASK: Extract events')) return JSON.stringify({ events: [{ id: 'arrival', description: 'She arrives in the town.', consequences: [], evidence: { sourceId: 'p1' } }] });
      if (prompt.includes('TASK: Extract beats')) return JSON.stringify({ beats: [] });
      return JSON.stringify({ promises: [] });
    });
    // Every source offered to the model is long enough to locate; "Salt." travels with what follows it.
    expect(seen.every(text => text.length >= 40)).toBe(true);
    expect(analysis.events[0].evidence.quote).toContain('Salt.');
    expect(analysis.events[0].evidence.quote.length).toBeGreaterThan(40);
  });
});

describe('A finding that outlives the report it came in', () => {
  const issue = (description: string, id = 'speech-tag-bloat', category: 'dialogue' | 'knowledge' = 'dialogue') =>
    ({ id, category, severity: 'major' as const, description, instruction: 'Strip the attributions.', evidence: [] });

  it('is counted per finding, so a changing set around it does not reset the count', () => {
    // Quoted from a live English run, where this measurement survived nine consecutive rounds while
    // the findings beside it changed every time, and the chapter was never once counted as stuck.
    const bloat = issue('88% of spoken lines arrive with an attached gesture or attribution.');
    let shapes = findingStreaks([bloat, issue('Elias knows about the tremor nobody told him of.', 'k1', 'knowledge')]);
    expect(shapes.find(item => item.id === 'speech-tag-bloat')?.streak).toBe(1);
    // A different neighbour this round; the measurement itself is the same one.
    shapes = findingStreaks([issue('The chapter says the same thing twice.', 'duplicated-passage'), bloat], shapes);
    expect(shapes.find(item => item.id === 'speech-tag-bloat')?.streak).toBe(2);
    shapes = findingStreaks([bloat], shapes);
    expect(shapes.find(item => item.id === 'speech-tag-bloat')?.streak).toBe(3);
    // And the neighbour that came and went never accumulated one.
    expect(shapes.find(item => item.id === 'duplicated-passage')).toBeUndefined();
  });

  it('does not count an advisory finding, which is not blocking anything', () => {
    expect(findingStreaks([{ ...issue('88% of spoken lines carry an attribution.'), severity: 'minor' }])).toHaveLength(0);
  });
});
