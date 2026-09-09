import { literaryResponse } from './helpers/literaryFixture';
import { describe, expect, it, vi } from 'vitest';
import { analyseChapter, duplicatePassages, parseObject, reviewBook, reviewChapter } from '../utils/novel/review';
import { createRun, NovelEngine } from '../utils/novel/engine';
import { MemoryRunStore } from '../utils/novel/runStore';
import { createBookSpec, genreCraft, specPrompt, type ChapterRecord, type NovelRun } from '../utils/novel/contracts';
import { acceptCandidate, addCandidate, evidenceExists, nextUnacceptedChapter, reconcileCheckpoint } from '../utils/novel/storyState';

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
      // Chapter 1 owns the setup, never the payoff, however confidently the model labels it.
      return JSON.stringify({ promises: [{ promiseId: 'letter', kind: 'payoff', evidence: { sourceId: 'p1' } }, { promiseId: 'letter', kind: 'setup', evidence: { sourceId: 'p1' } }] });
    };
    const analysis = await analyseChapter(run, chapter, version, async prompt => reply(prompt.includes('Extract facts') ? 'facts' : prompt.includes('Extract events') ? 'events' : 'promises'));
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
    chapter.lastFindings = JSON.stringify(['The vase has stood there for years and since yesterday.']);
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
    const response = (evidence: unknown) => JSON.stringify({ summary: 'Vera reads.', facts: [], events: [{ id: 'read', description: 'Vera reads the letter', consequences: [], evidence }], promises: [] });
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
    ];
    const analysis = await analyseChapter(run, chapter, version, async () => JSON.stringify(responses.shift()));
    expect(analysis.promises).toEqual([]);
  });
});
