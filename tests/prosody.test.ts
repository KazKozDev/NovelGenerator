import { plannedBeatsFrom } from './beatStub';
import { describe, expect, it } from 'vitest';
import type { ChapterVersion } from '../utils/novel/contracts';
import { dialogueIssues, paragraphsOf, prosodyIssues, prosodyMetrics, repetitionIssues, speechParagraphs, type Embedder } from '../utils/novel/prosody';
import { textureRegression } from '../utils/novel/engine';
import { createBookSpec } from '../utils/novel/contracts';
import { createRun, NovelEngine } from '../utils/novel/engine';
import { addCandidate } from '../utils/novel/storyState';
import { MemoryRunStore } from '../utils/novel/runStore';
import type { NovelLLM } from '../utils/novel/review';
import { stampLiterary } from './helpers/literaryFixture';

const version = (content: string, revision = 1): ChapterVersion => ({ revision, content, reason: 'test', createdAt: 0 });

/** Vectors chosen so cosine similarity is exact and the thresholds, not an embedder, are under test. */
const unit = (angle: number) => [Math.cos(angle), Math.sin(angle), 0, 0, 0, 0, 0, 0];
/** Mutually orthogonal: unlike points on a circle, these stay dissimilar at every distance. */
const axis = (index: number) => Array.from({ length: 8 }, (_, position) => (position === index ? 1 : 0));
const embedderFor = (map: Record<string, number[]>): Embedder => async inputs => inputs.map(input => {
  const key = Object.keys(map).find(prefix => input.startsWith(prefix));
  if (!key) throw new Error(`No vector for: ${input.slice(0, 30)}`);
  return map[key];
});

const long = (opening: string) => `${opening} ${'Она смотрела в окно и ждала следующего движения на той стороне двора. '.repeat(4)}`.trim();

describe('measured prose texture', () => {
  it('counts paragraphs, dialogue and comparison density from the text itself', () => {
    const text = ['Он открыл дверь, словно боялся того, что за ней.', '— Ты пришёл, — сказала она.', 'Комната была пуста, будто из неё вынесли даже воздух.'].join('\n\n');
    const metrics = prosodyMetrics(text, 'Russian');
    expect(metrics.paragraphs).toBe(3);
    expect(metrics.dialogueShare).toBeCloseTo(1 / 3);
    expect(metrics.similesPer1000).toBeGreaterThan(0);
    expect(metrics.words).toBe(prosodyMetrics(text, 'Russian').words);
  });

  it('reports no comparison budget for a language it cannot measure', () => {
    const metrics = prosodyMetrics('Ein Satz ohne bekannte Sprache.', 'German');
    expect(metrics.similesPer1000).toBeUndefined();
    expect(prosodyIssues(1, version('Ein Satz ohne bekannte Sprache.'), 'German')).toEqual([]);
  });

  it('ignores scene separators when counting paragraphs', () => {
    expect(paragraphsOf('Первый абзац.\n\n***\n\nВторой абзац.')).toEqual(['Первый абзац.', 'Второй абзац.']);
  });

  it('raises a repairable issue with the densest passages quoted', () => {
    const dense = 'Тьма была словно вода, будто плотная масса, точно как стена, подобно дыханию.';
    const issues = prosodyIssues(1, version(`${dense}\n\nОн вышел.`), 'Russian');
    const simile = issues.find(issue => issue.id === 'simile-density');
    // A fitted density budget informs a repair; it never fails a chapter by itself.
    expect(simile?.severity).toBe('minor');
    expect(simile?.evidence[0].quote).toBe(dense);
    expect(simile?.evidence[0].revision).toBe(1);
  });

  it('stays silent when the prose is inside its budget', () => {
    const plain = ['Он открыл дверь и вышел на лестницу.', '— Подожди, — сказала она.', 'Дверь закрылась.'].join('\n\n');
    expect(prosodyIssues(1, version(plain), 'Russian').map(issue => issue.id)).not.toContain('simile-density');
  });
});

describe('a gesture named once and explained twice more', () => {
  const flogged = Array.from({ length: 4 }, (_, i) =>
    `Она коснулась плеча номер ${i}. Движение было плавным, размеренным, наполненным смыслом, и она провела пальцами, проверяя текстуру, подтверждая связь, повторяя жест.`).join('\n\n');

  it('counts the series the embedder could not separate, and quotes the sentences', () => {
    const metrics = prosodyMetrics(flogged, 'Russian');
    expect(metrics.serialExplanationsPer1000).toBeGreaterThan(1.5);
    const issue = prosodyIssues(1, version(flogged), 'Russian').find(item => item.id === 'serial-explanation');
    expect(issue?.severity).toBe('major');
    // Denser than the book but inside the budget: worth saying, not worth failing a chapter over.
    const mild = 'Она коснулась плеча. Движение было плавным, размеренным, наполненным смыслом.\n\n'
      + Array.from({ length: 110 }, (_, i) => `Она смотрела в окно и считала минуты до утра номер ${i}.`).join('\n\n');
    const reference = { ...prosodyMetrics(mild, 'Russian'), serialExplanationsPer1000: 0.1 };
    const drift = prosodyIssues(1, version(mild), 'Russian', undefined, reference).find(item => item.id === 'serial-explanation');
    expect(drift?.severity).toBe('minor');
    expect(issue?.evidence.length).toBeGreaterThan(0);
    expect(issue?.evidence[0].quote).toContain('плавным');
  });

  it('leaves prose that names an action once alone', () => {
    const plain = 'Она коснулась плеча. Ткань была тёплой.\n\nОн отвернулся к окну и молчал.';
    expect(prosodyMetrics(plain, 'Russian').serialExplanationsPer1000).toBe(0);
    expect(prosodyIssues(1, version(plain), 'Russian').map(item => item.id)).not.toContain('serial-explanation');
  });
});

describe('semantic repetition', () => {
  const a = long('Ваза начала движение через комнату.');
  const b = long('Ваза медленно пересекала комнату.');
  const c = long('За окном шёл дождь и никто не отвечал.');

  it('flags an adjacent paragraph that retells the beat before it, for deletion', async () => {
    const embed = embedderFor({ 'Ваза начала': unit(0), 'Ваза медленно': unit(0.3), 'За окном': unit(1.4) });
    const issues = await repetitionIssues(1, version([a, b, c].join('\n\n')), [], embed);
    const doubled = issues.find(issue => issue.id === 'restated-passage');
    expect(doubled?.severity).toBe('critical');
    // Both tellings, in the order they appear: one copy alone proves nothing to a reader or a repair.
    expect(doubled?.evidence.map(item => item.quote)).toEqual([a, b]);
  });

  it('finds a beat told again twenty paragraphs later, not only next door', async () => {
    const filler = Array.from({ length: 6 }, (_, i) => long(`Он считал минуты до утра, номер ${i}.`));
    const embed = embedderFor({ 'Ваза начала': axis(0), 'Ваза медленно': [0.96, 0.28, 0, 0, 0, 0, 0, 0],
      ...Object.fromEntries(filler.map((_, i) => [`Он считал минуты до утра, номер ${i}`, axis(i + 2)])) });
    const issues = await repetitionIssues(1, version([a, ...filler, b].join('\n\n')), [], embed);
    const doubled = issues.find(issue => issue.id === 'restated-passage');
    expect(doubled?.evidence.map(item => item.quote)).toEqual([a, b]);
  });

  it('leaves consecutive paragraphs that do different work alone', async () => {
    const embed = embedderFor({ 'Ваза начала': unit(0), 'За окном': unit(1.4) });
    expect(await repetitionIssues(1, version([a, c].join('\n\n')), [], embed)).toEqual([]);
  });

  it('holds cross-chapter pairs to their own distribution, not the one measured inside a chapter', async () => {
    // Paragraphs from different chapters of the same novel sit a tenth higher than paragraphs inside
    // one: at 0.80 the band is the book's own echoes — a scene continued across the break, a later
    // chapter arguing about the light the first one lit — and every one of them blocked acceptance.
    const echo = await repetitionIssues(3, version([c, b].join('\n\n'), 2), [{ chapter: 1, revision: 4, content: a }],
      embedderFor({ 'Ваза начала': unit(0), 'За окном': unit(1.4), 'Ваза медленно': unit(0.61) }));
    expect(echo.find(issue => issue.id === 'recycled-passage')).toBeUndefined();
    const repeated = await repetitionIssues(3, version([c, b].join('\n\n'), 2), [{ chapter: 1, revision: 4, content: a }],
      embedderFor({ 'Ваза начала': unit(0), 'За окном': unit(1.4), 'Ваза медленно': unit(0.49) }));
    expect(repeated.find(issue => issue.id === 'recycled-passage')?.evidence.map(item => item.chapter)).toEqual([3, 1]);
  });

  it('finds a passage recycled from an earlier chapter and cites both chapters', async () => {
    const embed = embedderFor({ 'Ваза начала': unit(0), 'За окном': unit(1.4), 'Ваза медленно': unit(0.3) });
    const issues = await repetitionIssues(3, version([c, b].join('\n\n'), 2), [{ chapter: 1, revision: 4, content: a }], embed);
    const recycled = issues.find(issue => issue.id === 'recycled-passage');
    expect(recycled?.evidence.map(item => item.chapter)).toEqual([3, 1]);
    // The earlier passage is not in the prose being repaired, and saying so is what makes the finding
    // actionable: two live revisions left four recycled passages untouched without it.
    expect(recycled?.instruction).toContain('Only the passage from chapter 3 is yours to change');
    expect(recycled?.instruction).toContain('you will not find it in the prose you were given');
    expect(recycled?.evidence[1].revision).toBe(4);
    expect(recycled?.evidence[0].revision).toBe(2);
  });

  it('skips paragraphs too short to compare rather than guessing about them', async () => {
    const embed = embedderFor({ 'Он вышел': unit(0), 'Она вышла': unit(0) });
    expect(await repetitionIssues(1, version('Он вышел.\n\nОна вышла.'), [], embed)).toEqual([]);
  });

  it('refuses a truncated embedder response instead of reporting no repetition', async () => {
    const short: Embedder = async inputs => inputs.slice(1).map(() => unit(0));
    await expect(repetitionIssues(1, version([a, b].join('\n\n')), [], short)).rejects.toThrow(/different number of vectors/);
  });
});

describe('report mode inside the engine', () => {
  const purple = Array.from({ length: 12 }, (_, index) =>
    `Тьма была словно вода, будто плотная масса, точно как стена, подобно дыханию, и она ждала неподвижно у окна номер ${index}. `
    + 'Комната стояла тихой, застывшей, и воздух был тяжёлым, плотным, пока она считала минуты до нужного часа.').join('\n\n');

  function ready() {
    const run = createRun(createBookSpec('A woman watches the window opposite.', 3, { targetWordsPerChapter: 300, language: 'Russian' }),
      { provider: 'ollama', ollamaModel: 'test', ollamaEndpoint: 'http://localhost:11434' });
    run.outline = 'She learns what the light means.';
    run.chapters = [{ number: 1, status: 'pending' as const, repairAttempts: 0, versions: [], plan: {
      title: 'Ритуал', summary: 'A vigil', sceneBreakdown: 'One vigil', characterDevelopmentFocus: 'Doubt', plotAdvancement: 'The light returns',
      timelineIndicators: 'Night', emotionalToneTension: 'Tense', connectionToNextChapter: 'Closure',
      detailedScenes: [{ sceneId: 's1', location: 'flat', participants: ['Марина'], objective: 'Watch', conflict: 'Sleeplessness', outcome: 'The light appears', duration: 'an hour', mood: 'tense', keyMoments: ['the light'] }],
    } }];
    const candidate = addCandidate(run.chapters[0], purple, 'test');
    candidate.review = { validationVersion: 2, status: 'passed', issues: [], checkedRevision: candidate.revision };
    candidate.analysis = { summary: 'Марина ждёт света.', facts: [], events: [], promises: [] };
    stampLiterary(run, 1, candidate);
    return { run, candidate };
  }
  // Only the canon extraction a passed chapter still needs; any other call would mean the report
  // mode had changed the verdict rather than recorded it.
  const extractOnly: NovelLLM = async (prompt, system) => {
    if (system.includes('extract evidence')) {
      if (prompt.includes('TASK: Extract facts')) return '{"summary":"Марина ждёт света в окне напротив.","facts":[]}';
      if (prompt.includes('TASK: Extract events')) return '{"events":[]}';
      if (prompt.includes('TASK: Extract beats')) return JSON.stringify({ beats: plannedBeatsFrom(prompt).map(item => ({ ...item, evidence: { sourceId: 'p1' } })) });
      return '{"promises":[]}';
    }
    throw new Error(`No ${system.slice(0, 40)} call belongs in an accepted, current chapter.`);
  };

  it('keeps budget findings advisory: a chapter over every budget is still accepted', async () => {
    const { run, candidate } = ready();
    // Orthogonal vectors: nothing in this chapter repeats, so only the fitted budgets have anything to say.
    // One dimension per paragraph: nothing here resembles anything else at any distance.
    const embed: Embedder = async inputs =>
      inputs.map((_, index) => Array.from({ length: inputs.length }, (_, position) => (position === index ? 1 : 0)));
    await (new NovelEngine(extractOnly, new MemoryRunStore(), () => {}, embed) as any).acceptOrRepair(run, run.chapters[0], candidate);
    expect(run.chapters[0].acceptedRevision).toBe(candidate.revision);
    expect(candidate.review!.issues).toEqual([]);
    const report = candidate.prosody!;
    expect(report.repetitionChecked).toBe(true);
    expect(report.findings.map(issue => issue.id)).toContain('simile-density');
    expect(report.metrics.similesPer1000).toBeGreaterThan(2.5);
  });

  it('reaches the repair even when the lexical duplicate check fired first', async () => {
    const { run, candidate } = ready();
    candidate.review = undefined;
    // The lexical check owns 'duplicated-passage'; a reworded repetition must not be dropped as a
    // finding the editor already reported, which is what a shared id did.
    const editor: NovelLLM = async (prompt, system) => system.includes('continuity and developmental') ? '{"issues":[]}' : extractOnly(prompt, system);
    const embed: Embedder = async inputs => inputs.map(() => [1, 0]);
    await expect((new NovelEngine(editor, new MemoryRunStore(), () => {}, embed) as any)
      .acceptOrRepair(run, run.chapters[0], candidate)).rejects.toThrow();
    const reported = candidate.review!.issues.map(issue => issue.id);
    expect(reported).toContain('duplicated-passage');
    expect(reported).toContain('restated-passage');
  });

  it('sends measured defects into a repair the editor already triggered', async () => {
    const { run, candidate } = ready();
    // The editor finds its own defect, so the chapter is failing anyway; the doubled paragraphs must
    // still reach the repair, or they survive every round while other findings come and go.
    candidate.review = undefined; // let the editor actually review this revision
    const quote = paragraphsOf(candidate.content)[0];
    const editor: NovelLLM = async (prompt, system) => {
      if (system.includes('continuity and developmental')) return JSON.stringify({ issues: [{ id: 'knowledge-01', category: 'knowledge', severity: 'major', description: 'A name the story has not given.', instruction: 'Remove it.', evidence: [{ chapter: 1, revision: 1, quote }] }] });
      return extractOnly(prompt, system);
    };
    const embed: Embedder = async inputs => inputs.map(() => [1, 0]);
    await expect((new NovelEngine(editor, new MemoryRunStore(), () => {}, embed) as any)
      .acceptOrRepair(run, run.chapters[0], candidate)).rejects.toThrow();
    const reported = candidate.review!.issues.map(issue => issue.id);
    expect(reported).toContain('knowledge-01');
    expect(reported).toContain('restated-passage');
    expect(candidate.review!.status).toBe('failed');
  });

  it('fails a chapter whose paragraphs repeat each other, however clean the review was', async () => {
    const { run, candidate } = ready();
    const embed: Embedder = async inputs => inputs.map(() => [1, 0]);
    // The repair fixture refuses to answer, so the run stops at the attempt; the verdict is already set.
    await expect((new NovelEngine(extractOnly, new MemoryRunStore(), () => {}, embed) as any)
      .acceptOrRepair(run, run.chapters[0], candidate)).rejects.toThrow();
    expect(run.chapters[0].acceptedRevision).toBeUndefined();
    expect(candidate.review!.status).toBe('failed');
    expect(candidate.review!.issues.map(issue => issue.id)).toContain('restated-passage');
  });

  /** A chapter with nothing mechanically wrong with it, so the editor's verdict is the only verdict. */
  function clean() {
    const { run } = ready();
    const chapter = run.chapters[0];
    chapter.versions = [];
    chapter.plan.targetWordCount = 214; // the chapter's own length, so neither length gate speaks for the editor
    const content = [
      'Марина открыла ящик стола и увидела счёт за электричество, выписанный на фамилию, которой в этом доме никогда не было.',
      'Соседский кот сидел на подоконнике с той стороны стекла и не шевелился, хотя дождь шёл уже второй час подряд.',
      'В кладовой пахло сухой известью, и этот запах не менялся с тех пор, как она въехала сюда в позапрошлом сентябре.',
      'Телефон показывал три пропущенных звонка с номера, который сам себя определял как её собственный домашний.',
      'Она поставила чайник, забыла о нём, и через двадцать минут кухню заполнил свист, похожий на далёкий детский плач.',
      'На лестничной площадке кто-то сменил лампочку, и теперь свет падал под другим углом, удлиняя тени у почтовых ящиков.',
      'Вешалка в прихожей держала два пальто, хотя жила Марина одна и второе пальто было ей велико в плечах.',
      'Дождь кончился внезапно, будто выключили кран, и двор наполнился тем гулким молчанием, которое бывает только к рассвету.',
      'Она достала из холодильника вчерашний хлеб, отломила корку и не стала есть, оставив кусок лежать на столе.',
      'Часы в спальне спешили на семь минут, и она давно перестала их подводить, привыкнув вычитать эту разницу в уме.',
      'Из вентиляции доносилась музыка, слишком тихая, чтобы узнать мелодию, и слишком отчётливая, чтобы счесть её выдумкой.',
      'Марина села в кресло, положила ладони на подлокотники и стала ждать, сама не зная точно, чего именно ждёт.',
    ].join('\n\n');
    const version = addCandidate(chapter, content, 'test');
    version.analysis = { summary: 'Марина находит чужие счета.', facts: [], events: [], promises: [] };
    stampLiterary(run, 1, version);
    return { run, candidate: version };
  }

  it('draws the review again when every citation missed the prose, instead of ending the chapter', async () => {
    const { run, candidate } = clean();
    let asked = 0;
    const editor: NovelLLM = async (prompt, system) => {
      if (!system.includes('continuity and developmental')) return extractOnly(prompt, system);
      // The first draw cites prose that is not there; the second is usable.
      return ++asked === 1
        ? JSON.stringify({ issues: [{ id: 'ghost', category: 'plot', severity: 'major', description: 'A defect.', instruction: 'Fix it.', evidence: [{ chapter: 1, revision: 1, quote: 'Этого предложения в главе нет.' }] }] })
        : '{"issues":[]}';
    };
    await (new NovelEngine(editor, new MemoryRunStore(), () => {}) as any).acceptOrRepair(run, run.chapters[0], candidate);
    expect(asked).toBe(2);
    expect(run.chapters[0].acceptedRevision).toBe(candidate.revision);
  });

  it('gives up when a second draw misses the prose as well', async () => {
    const { run, candidate } = clean();
    let asked = 0;
    const editor: NovelLLM = async (prompt, system) => {
      if (!system.includes('continuity and developmental')) return extractOnly(prompt, system);
      asked++;
      return JSON.stringify({ issues: [{ id: 'ghost', category: 'plot', severity: 'major', description: 'A defect.', instruction: 'Fix it.', evidence: [{ chapter: 1, revision: 1, quote: 'Этого предложения в главе нет.' }] }] });
    };
    await expect((new NovelEngine(editor, new MemoryRunStore(), () => {}) as any)
      .acceptOrRepair(run, run.chapters[0], candidate)).rejects.toThrow(/do not appear in this revision/);
    expect(asked).toBe(2);
    expect(run.chapters[0].status).toBe('needs_revision');
  });

  it('says repetition was not checked when no embedder is configured', async () => {
    const { run, candidate } = ready();
    await (new NovelEngine(extractOnly, new MemoryRunStore()) as any).acceptOrRepair(run, run.chapters[0], candidate);
    expect(candidate.prosody!.repetitionChecked).toBe(false);
    expect(candidate.prosody!.findings.map(issue => issue.id)).not.toContain('restated-passage');
    expect(run.chapters[0].acceptedRevision).toBe(candidate.revision);
  });

  it('keeps every finding the embedder was not needed for when it fails', async () => {
    const { run, candidate } = ready();
    const broken: Embedder = async () => { throw new Error('embedding endpoint unreachable'); };
    // The purple fixture breaks the comparison budget. That budget is advisory, so the chapter is
    // still accepted — but a network fault must not erase the finding from the record.
    await (new NovelEngine(extractOnly, new MemoryRunStore(), () => {}, broken) as any).acceptOrRepair(run, run.chapters[0], candidate);
    expect(run.chapters[0].acceptedRevision).toBe(candidate.revision);
    expect(candidate.prosody!.error).toMatch(/unreachable/);
    expect(candidate.prosody!.repetitionChecked).toBe(false);
    expect(candidate.prosody!.findings.map(issue => issue.id)).toContain('simile-density');
    expect(candidate.prosody!.metrics.words).toBeGreaterThan(0);
  });
});

describe('texture regression between revisions', () => {
  const metrics = (text: string) => prosodyMetrics(text, 'Russian');
  const withDialogue = ['— Ты пришёл, — сказала она.', 'Он закрыл дверь и остался стоять у порога.', '— Не сейчас.',
    'Она отвернулась к окну и долго молчала.', '— Тогда я подожду снаружи.', 'Он не двинулся с места.',
    '— Уходи.', 'Дверь за ним закрылась почти беззвучно.'].join('\n\n');

  it('spends no repair defending a single stray line in a solitary chapter', () => {
    const oneLine = ['— Кто там? — спросила она в пустоту.', ...Array.from({ length: 20 },
      (_, i) => `Она смотрела в окно и считала минуты до утра, номер ${i}.`)].join('\n\n');
    const silent = oneLine.split('\n\n').slice(1).join('\n\n');
    expect(textureRegression(metrics(oneLine), metrics(silent))).toBeUndefined();
  });

  it('names the loss when a repair silences the dialogue a chapter had', () => {
    // Same material, same length: only the spoken lines became narration.
    const silenced = ['Она сказала, что он пришёл.', 'Он закрыл дверь и остался стоять у порога.', 'Она попросила подождать.',
      'Она отвернулась к окну и долго молчала.', 'Он предложил подождать снаружи.', 'Он не двинулся с места.',
      'Она велела ему уйти.', 'Дверь за ним закрылась почти беззвучно.'].join('\n\n');
    expect(textureRegression(metrics(withDialogue), metrics(silenced))).toMatch(/spoken dialogue from 50% of paragraphs to 0%/);
  });

  it('names the loss when separate beats are fused into far longer paragraphs', () => {
    const short = ['Он вошёл.', 'Она молчала.', 'Дверь закрылась.'].join('\n\n');
    const fused = `${'Он вошёл, и она молчала, и дверь закрылась за его спиной, и в комнате остался только свет. '.repeat(12)}`;
    expect(textureRegression(metrics(short), metrics(fused))).toMatch(/median paragraph from \d+ to \d+ words/);
  });

  it('reports a repair that quietly took a fifth of the chapter with nothing asking for cuts', () => {
    const full = Array.from({ length: 20 }, (_, i) => `Он вышел на лестницу и прислушался к тишине за дверью соседа, номер ${i}.`).join('\n\n');
    const cut = full.split('\n\n').slice(0, 12).join('\n\n');
    expect(textureRegression(metrics(full), metrics(cut))).toMatch(/cut the chapter from \d+ to \d+ words/);
    // The same cut is correct when an issue asked for it.
    expect(textureRegression(metrics(full), metrics(cut), true)).toBeUndefined();
  });

  it('sees the drift that no single revision was large enough to show', () => {
    const plain = Array.from({ length: 12 }, (_, i) => `Он вышел на лестницу и прислушался, номер ${i}.`).join('\n\n');
    const denser = plain.split('\n\n').map((line, i) => i % 3 ? line : `${line} Тишина стояла словно вода.`).join('\n\n');
    // Against its immediate predecessor the step is small; against where the chapter began it is not.
    const nearlySame = plain.split('\n\n').map((line, i) => i === 0 ? `${line} Тишина стояла словно вода.` : line).join('\n\n');
    expect(textureRegression(metrics(nearlySame), metrics(denser), false)).toBeUndefined();
    expect(textureRegression(metrics(nearlySame), metrics(denser), false, metrics(plain))).toMatch(/carried comparisons from/);
  });

  it('accepts a revision that keeps the chapter\'s shape', () => {
    const revised = withDialogue.replace('— Уходи.', '— Уходи сейчас же.');
    expect(textureRegression(metrics(withDialogue), metrics(revised))).toBeUndefined();
  });

  it('does not invent a regression for a chapter that never had dialogue', () => {
    const before = 'Он вошёл в комнату и остановился у окна.\n\nСвет за двором не горел.';
    const after = 'Он вошёл в комнату и остановился у окна.\n\nСвет за двором погас.';
    expect(textureRegression(metrics(before), metrics(after))).toBeUndefined();
  });
});

describe('planned exchanges must reach the page as speech', () => {
  const speechScene = [{ sceneId: 's1', conflictCarriedBy: 'speech' }];
  const silentChapter = ['Она смотрела в окно и молчала.', 'Он ушёл, не сказав ни слова.'].join('\n\n');
  const spoken = ['— Ты знал, — сказала она.', 'Он не ответил.', '— Скажи это вслух.', '— Знал.', 'Она отвернулась.'].join('\n\n');

  it('reports a planned exchange written without a spoken line, and names the scene', () => {
    const issues = dialogueIssues(1, version(silentChapter), speechScene);
    expect(issues[0].id).toBe('missing-dialogue');
    expect(issues[0].severity).toBe('major');
    expect(issues[0].category).toBe('dialogue');
    expect(issues[0].description).toContain('s1');
  });

  it('reports an exchange resolved in one line as thin rather than missing', () => {
    const thin = [...Array.from({ length: 14 }, (_, i) => `Она смотрела в окно и считала минуты, номер ${i}.`), '— Знал.'].join('\n\n');
    const issues = dialogueIssues(1, version(thin), speechScene);
    expect(issues[0].id).toBe('thin-dialogue');
    expect(issues[0].severity).toBe('minor');
  });

  it('says nothing when the planned exchange was actually written', () => {
    expect(dialogueIssues(1, version(spoken), speechScene)).toEqual([]);
  });

  it('never demands dialogue from a scene planned to be faced alone', () => {
    expect(dialogueIssues(1, version(silentChapter), [{ sceneId: 's1', conflictCarriedBy: 'solitude' }])).toEqual([]);
    expect(dialogueIssues(1, version(silentChapter), [{ sceneId: 's1', conflictCarriedBy: 'action' }])).toEqual([]);
  });

  it('judges no chapter planned before the field existed', () => {
    expect(dialogueIssues(1, version(silentChapter), [{ sceneId: 's1' }])).toEqual([]);
    expect(dialogueIssues(1, version(silentChapter), [])).toEqual([]);
  });

  it('reports an exchange where every line arrives wrapped in a gesture', () => {
    const wrapped = Array.from({ length: 8 }, (_, i) =>
      `— Скажи это вслух, — произнёс он, и его брови сошлись на переносице, номер ${i}.`).join('\n\n');
    const issues = dialogueIssues(1, version(wrapped), speechScene);
    expect(issues[0].id).toBe('speech-tag-bloat');
    expect(issues[0].severity).toBe('major');
    // A share is not repaired by editing three quoted lines: two live revisions left it at 100%.
    expect(issues[0].instruction).toContain('a pattern across the whole chapter');
    expect(issues[0].instruction).toContain('At least half of the chapter');
    expect(issues[0].evidence).toHaveLength(3);
    expect(prosodyMetrics(wrapped, 'Russian').taggedSpeechShare).toBe(1);
  });

  it('leaves an exchange alone when most of its lines stand bare', () => {
    const bare = ['— Ты знал.', '— Знал.', '— И молчал.', '— Молчал.', '— Почему?',
      '— Потому что ты бы ушла, — сказал он.', '— Я и ухожу.', '— Знаю.'].join('\n\n');
    expect(dialogueIssues(1, version(bare), speechScene)).toEqual([]);
    expect(prosodyMetrics(bare, 'Russian').taggedSpeechShare).toBeLessThan(0.85);
  });

  it('does not mistake a long speech for an attributed one', () => {
    // Nineteen revisions of a live chapter were spent stripping attributions from lines like this,
    // which carry none: the old reading counted any sentence break followed by a capital.
    const long = ['— Я пришла. Теперь говори. Кто ты? Зачем ты носишь мою одежду?', 'Она ждала ответа у самого стекла.',
      '— Уходи. Уходи сейчас же. Я не буду просить дважды.', 'Свет в окне напротив не дрогнул.'].join('\n\n');
    expect(prosodyMetrics(long, 'Russian').taggedSpeechShare).toBe(0);
    expect(dialogueIssues(1, version(long), speechScene)).toEqual([]);
  });

  it('counts direct speech, not reported speech', () => {
    expect(speechParagraphs('— Я знаю.\n\nОн сказал, что знает.\n\n«Я знаю», — подумала она.')).toHaveLength(2);
  });
});
