import { drainRetryNotices, type NovelLLM } from './llm';
import { reviewPlan } from './reviewer';
import { applyPlanUpdates, chapterDeviations, chapterEvents, readEndingReadiness, remainingEndingRequirements, updateForward, type ForwardInput } from './forward';
import type { ChapterPipeline } from './orchestrator';
import { buildSceneContext, doubtsToRead, needsReading, planChapter, planReadingProblems, rebaseScenePlan, retellingSuspect, writerRequirement } from './planner';
import { writeSceneV2 } from './sceneWriter';
import { emptyState, type ProjectStore } from './store';
import { applyDelta, applyResolutions, applyThreads, paragraphsWithIds, sameQuestionFacts, trackScene, type QuestionResolution } from './tracker';
import { readFactClashes, readSeams, runPrewriteGate } from './semanticGate';
import { applyForwardToHandoff, buildSceneHandoff, compactHandoff } from './handoff';
import { stringList } from './normalize';
import { resolveSourceRefs } from './retrieval';
import { recentShapes } from './shapes';
import { chapterSeams, checkChapterPlan, describeFindings, type PlanFinding } from './planGate';
import { acceptedProse, scenesFor, wordsPerScene, openThreadsWithAge, priorOutcomeKinds, priorRungs, spentMechanisms, textureDrift, thinScenes, wornLedger } from './ledger';
import { bandsFor, profileOf } from './profile';
import { countImages, knownImages, proseThrough } from './images';
import { chapterRecords, correctSpans, describeChapterText, repairChapter } from './chapterRepair';
import { describeStateDigest } from './stateDigest';
import { measureTexture, numericContradictions } from '../analytics';
import { alignSpellings, condenseRestaged, repairRepetition } from './repair';
import type { ReadinessProblem } from './planner';
import type { BookDesign, ChapterPlan, StoryState } from './types';

/** Where the chapter before this one left things, as its last scene's plan stated it. */
function previousChapterEnd(store: ProjectStore, chapter: number): { scene: string; state: Record<string, string> } | undefined {
  const last = store.chapterScenes(chapter - 1).at(-1);
  const state = last?.plan?.state_at_end;
  return last && state && Object.keys(state).length ? { scene: last.id, state } : undefined;
}

/**
 * The v2 chapter pipeline: plan one chapter from confirmed state, write each
 * scene once from a verified package, fold every delta into memory before the
 * next scene, join the scenes in code (no model "stitching"), then reconcile
 * the remaining plan with what was actually written.
 */
export class ChapterPipelineV2 implements ChapterPipeline {
  /** Move first-attempt failures into the run log with their reasons. */
  private flushRetries(store: ProjectStore): void {
    for (const notice of drainRetryNotices()) {
      store.log('retry', `${notice.keys.join('+')} attempt ${notice.attempt} rejected: ${notice.error}`);
    }
  }

  private seedState(design: BookDesign, store: ProjectStore): void {
    const state = store.loadState();
    if (state.facts.length || state.events.length || Object.keys(state.knowledge).length) return;
    // Merge into what is there, never replace it: a resumed chapter 1 may
    // already hold recorded conditions the seed must not wipe.
    const seeded: StoryState = {
      ...emptyState(),
      ...state,
      knowledge: { ...state.knowledge },
      beliefs: { ...state.beliefs },
    };
    for (const character of design.characters) {
      if (character.initial_knowledge?.length) seeded.knowledge[character.id] = [...character.initial_knowledge];
      if (character.initial_beliefs?.length) seeded.beliefs[character.id] = [...character.initial_beliefs];
    }
    // Character names enter the registry before any prose: the first scene's
    // writer already sees the canonical spellings, and diminutives the model
    // links via refers_to land as aliases instead of competing entries.
    seeded.names = design.characters
      .filter(character => typeof character.name === 'string' && character.name.trim())
      .map(character => ({ name: character.name.trim(), kind: 'person', refers_to: character.id, aliases: [], first_seen: 'design' }));
    store.saveState(seeded);
  }

  /**
   * What the premise gave is owed to the reader, so it is entered as a promise
   * before the first scene.
   *
   * The design is checked in code for giving every premise element a home in
   * the construction. Nothing checked that it reached the page: a book could
   * place "the only guest still alive from that week" in its causal map, write
   * three chapters in which nobody says or shows it, and learn so from the
   * final audit. As threads the givens are shown to the planner, aged by the
   * plan gate — which blocks a late chapter that still ignores one — and
   * marked paid by the tracker when a scene puts them on the page.
   *
   * People are left out: the cast is bound to the premise's names in code, and
   * a character appearing is not something a chapter can forget to do.
   */
  private seedPremise(design: BookDesign, store: ProjectStore): void {
    this.seedParticulars(design, store);
    const threads = store.loadThreads();
    if (threads.some(thread => thread.id.startsWith('PREMISE-'))) return;
    const givens = (Array.isArray(design.contract?.premise_givens) ? design.contract.premise_givens : [])
      .filter(item => typeof item?.given === 'string' && item.given.trim() && String(item.kind || '').trim().toLowerCase() !== 'person')
      .map(item => item.given.trim());
    if (!givens.length) return;
    store.saveThreads([
      ...threads,
      ...[...new Set(givens)].map((given, index) => ({
        id: `PREMISE-t${index + 1}`, description: given, status: 'open' as const, setup_refs: ['CH01_PREMISE'], payoff_refs: [],
      })),
    ]);
  }

  /**
   * What the design fixed about the world, on the facts shelf before the first
   * scene. The shelf used to start empty and take whatever the first scene to
   * mention a thing happened to say of it; a room was on one floor in chapter
   * one and another in chapter three, and neither had been decided.
   */
  private seedParticulars(design: BookDesign, store: ProjectStore): void {
    const state = store.loadState();
    const held = new Set(state.facts.map(fact => fact.id));
    const fixed = (Array.isArray(design.world_rules) ? design.world_rules : [])
      .filter(rule => typeof rule?.rule === 'string' && rule.rule.trim() && typeof rule.subject === 'string' && rule.subject.trim()
        && typeof rule.attribute === 'string' && rule.attribute.trim() && !held.has(`DESIGN-${rule.id}`))
      .map(rule => ({ id: `DESIGN-${rule.id}`, statement: rule.rule.trim(), evidence_refs: [], subject: rule.subject!.trim(), attribute: rule.attribute!.trim() }));
    if (!fixed.length) return;
    store.saveState({ ...state, facts: [...fixed, ...state.facts] });
    store.log('memory', `${fixed.length} particular(s) the design fixed are on record before the first scene.`);
  }

  /**
   * Plan the chapter, check it, and plan again until it holds or the budget is
   * spent. The loop lives here rather than inside the planner because only the
   * pipeline knows what the book has already spent.
   *
   * Why a loop at all: a chapter plan costs one or two percent of the tokens of
   * the chapter it describes, so three attempts here are cheaper than one prose
   * rewrite — and a prose rewrite could not fix these findings anyway. A chapter
   * whose mechanism is spent and whose rung breaks the curve is not a chapter
   * that was written badly.
   *
   * When the budget runs out the findings do not vanish: they become warnings
   * the reader sees and requirements the chapter is written against, the same
   * way an unresolved design objection already travels into the contract. A
   * book that says what is wrong with it beats a book that refuses to exist.
   */
  private async planUntilSound(
    design: BookDesign,
    chapter: number,
    store: ProjectStore,
    llm: NovelLLM,
    base: Omit<Parameters<typeof planChapter>[0], 'findings'>,
    warnings: string[],
    maxReplans = 2,
  ): Promise<{ plan: ChapterPlan; findings: PlanFinding[] }> {
    const gateInput = {
      design,
      chapter,
      spentMechanisms: spentMechanisms(store, chapter - 1),
      priorRungs: priorRungs(store, chapter - 1),
      recentShapes: recentShapes(store, chapter - 1),
      priorOutcomeKinds: priorOutcomeKinds(store, chapter - 1),
      endingRequirements: base.endingRequirements,
      openThreads: openThreadsWithAge(store),
      remainingChapters: design.chapter_map.length - chapter + 1,
      previousEnd: previousChapterEnd(store, chapter),
      facts: base.currentState.facts.map(fact => ({ id: fact.id, statement: fact.statement })),
      maxScenes: scenesFor(Number(design.chapter_map.find(item => item.chapter === chapter)?.target_words) || 0, base.wordsPerScene || wordsPerScene(store, chapter - 1)),
    };
    let findings = '';
    let last: { plan: ChapterPlan; findings: PlanFinding[] } | null = null;
    let refused = new Set<string>();
    let priorBlockingCount = 0;
    for (let attempt = 0; ; attempt++) {
      const plan = await planChapter({ ...base, findings: findings || undefined }, llm);
      this.flushRetries(store);
      if (plan.status === 'needs_replan') {
        // The planner refusing the chapter map is a different failure from the
        // gate refusing the plan, and it is the planner's own judgement about
        // the book — it ends the chapter rather than being argued with.
        throw new Error(`Chapter ${chapter} cannot be written as planned: ${plan.replan_reason || 'no reason given'}.`);
      }
      // The seams are read by the local model when it is on: whether two
      // entries contradict is its question, and shared words cannot answer it.
      const seamVerdicts = await readSeams(plan, gateInput.previousEnd);
      const found = checkChapterPlan({ ...gateInput, plan, seamVerdicts });
      last = { plan, findings: found };
      const blocking = found.filter(item => item.severity === 'blocking');
      if (!blocking.length) {
        if (attempt) store.log('chapter-plan', `Chapter ${chapter}: plan accepted on attempt ${attempt + 1}.`);
        return last;
      }
      // Repeated blocking findings are a failed plan, not permission to write it.
      const stuck = attempt > 0 && blocking.length >= priorBlockingCount
        && blocking.every(item => refused.has(`${item.code}:${item.detail}`));
      if (attempt >= maxReplans || stuck) {
        store.log('chapter-plan', `Chapter ${chapter}: plan refused after ${attempt + 1} attempts.`);
        throw new Error(`Chapter ${chapter} plan not executable after ${attempt + 1} attempts:\n${describeFindings(blocking)}`);
      }
      refused = new Set(blocking.map(item => `${item.code}:${item.detail}`));
      priorBlockingCount = blocking.length;
      findings = describeFindings(found);
      store.log('chapter-plan', `Chapter ${chapter} attempt ${attempt + 1} rejected before prose: ${blocking.map(item => item.code).join(', ')}.`);
    }
  }

  /**
   * One review for every scene of the chapter whose plan needs a reader — a
   * participant who is nobody in the cast, a scene with no task — instead of a
   * review a scene. Returns, per scene asked about, what the writer must be
   * told; a scene not in the map was not asked about.
   */
  private async readPlanDoubts(
    design: BookDesign,
    chapter: number,
    plan: ChapterPlan,
    store: ProjectStore,
    llm: NovelLLM,
    warnings: string[],
    gateProblems: Map<string, ReadinessProblem[]> = new Map(),
  ): Promise<Map<string, string[]>> {
    const readings = new Map<string, string[]>();
    const written = new Set(store.chapterScenes(chapter).filter(record => record.delta).map(record => record.id));
    const doubted = plan.scenes
      .filter(scene => !written.has(scene.id))
      .map(scene => ({ scene, problems: doubtsToRead([...planReadingProblems(design, scene), ...(gateProblems.get(scene.id) || [])]) }))
      .filter(item => item.problems.length);
    if (!doubted.length) return readings;
    try {
      const check = await reviewPlan(
        { story_contract: JSON.stringify(design.contract) },
        `Chapter ${chapter}: readiness of ${doubted.length} scene(s) before prose. Give each issue the scene id as its target_ref. Cast roster (id — name — function):\n${design.characters.map(character => `${character.id} — ${character.name} — ${character.story_function}`).join('\n')}\nCode-level doubts:\n${doubted.flatMap(item => item.problems.map(problem => `- ${item.scene.id} ${problem.code}: ${problem.detail}`)).join('\n')}`,
        { scenes: doubted.map(item => item.scene) },
        describeStateDigest(store.loadState()),
        '',
        llm,
        'scene-readiness',
      );
      this.flushRetries(store);
      for (const item of doubted) readings.set(item.scene.id, []);
      for (const issue of check.issues) {
        const said = issue.required_decision || issue.problem;
        const target = doubted.find(item => String(issue.target_ref || '').toUpperCase().includes(item.scene.id.toUpperCase()));
        if (issue.severity !== 'blocking' && issue.severity !== 'major') {
          warnings.push(`${target ? `Scene ${target.scene.id}` : `Chapter ${chapter}`}: ${issue.problem}`);
          continue;
        }
        // A verdict that names no scene is given to every scene asked about:
        // a mapping the writer is told twice does less harm than one it is never told.
        for (const item of target ? [target] : doubted) readings.get(item.scene.id)!.push(said);
      }
      store.log('readiness', `Chapter ${chapter}: ${doubted.length} scene(s) read in one review (${doubted.map(item => `${item.scene.id}: ${item.problems.map(problem => problem.code).join(', ')}`).join('; ')}).`);
    } catch (error) {
      const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
      store.log('retry', `Chapter ${chapter} readiness review failed; its scenes are read one at a time. ${reason}`);
    }
    return readings;
  }

  async writeChapter(
    design: BookDesign,
    chapter: number,
    store: ProjectStore,
    llm: NovelLLM,
    gate: typeof runPrewriteGate = runPrewriteGate,
  ): Promise<{ warnings: string[] }> {
    const warnings: string[] = [];
    const input = store.loadInput();
    const profile = profileOf(design);
    this.seedState(design, store);
    if (chapter === 1) this.seedPremise(design, store);

    // Where the chapter starts, kept so its memory can be rebuilt if the
    // chapter check corrects one of its scenes: a delta cannot be un-applied.
    const chapterStartState = JSON.parse(JSON.stringify(store.loadState())) as StoryState;
    const entry = design.chapter_map.find(item => item.chapter === chapter);
    const threads = store.loadThreads();
    const previousRecord = store.chapterScenes(chapter - 1).at(-1);
    let handoff = (previousRecord?.handoff && compactHandoff(previousRecord.handoff)) || (previousRecord?.delta && previousRecord.plan
      ? buildSceneHandoff({
          scene: previousRecord.plan,
          state: store.loadState(),
          delta: previousRecord.delta,
          resolutions: previousRecord.resolutions || [],
          threads,
        })
      : null);
    // Resume reuses the saved plan when scenes already exist against it: the
    // planner is not deterministic across runs, and a fresh plan would orphan
    // the stored scenes and force every one of them to be rewritten.
    const savedPlan = store.loadChapterPlan(chapter);
    const savedScenes = new Map(store.chapterScenes(chapter).map(record => [record.id, record]));
    let plan;
    if (savedPlan && savedPlan.status === 'ready' && [...savedScenes.values()].some(record => record.delta)) {
      plan = savedPlan;
      store.log('chapter-plan', `Chapter ${chapter}: reusing saved plan with ${plan.scenes.length} scenes.`);
    } else {
      // The previous chapter's own tail, not a memory-only note: it survives reload.
      const previousText = store.manuscript().find(item => item.chapter === chapter - 1)?.text || '';
      const sound = await this.planUntilSound(design, chapter, store, llm, {
        design,
        chapter,
        currentState: store.loadState(),
        previousOutcome: previousText ? `End of the previous chapter:\n${previousText.slice(-600)}` : '(opening chapter)',
        openThreads: threads.filter(t => t.status === 'open').map(t => t.description),
        endingRequirements: remainingEndingRequirements(design, store.loadEndingReadiness()),
        remainingWords: design.chapter_map.filter(item => item.chapter >= chapter)
          .reduce((sum, item) => sum + (item.target_words || 0), 0),
        previousHandoff: handoff,
        recentShapes: recentShapes(store, chapter - 1),
        spentMechanisms: spentMechanisms(store, chapter - 1),
        wordsPerScene: wordsPerScene(store, chapter - 1),
        premiseOwed: threads.filter(thread => thread.status === 'open' && thread.id.startsWith('PREMISE-'))
          .map(thread => `${thread.id} — ${thread.description}`),
      }, warnings);
      plan = sound.plan;
      // An advisory the gate raised is not worth another planning round and is
      // still worth the reader knowing: it rides along instead of disappearing.
      for (const advisory of sound.findings.filter(item => item.severity === 'advisory')) {
        warnings.push(`Chapter ${chapter} (${advisory.code}): ${advisory.detail}`);
      }
      store.saveChapterPlan(plan);
      store.log('chapter-plan', `Chapter ${chapter}: ${plan.scenes.length} scenes planned; mechanism "${plan.mechanism || '(none)'}", rung ${plan.pressure_rung ?? '(none)'}, cost "${plan.cost || '(none)'}".`);
    }

    const chapterStartHandoff = handoff;
    const unpaid: string[] = [];
    let previousTail = '';
    const excerpts: string[] = [];
    // Finished chapters as restaging evidence: the pre-write gate compares
    // each planned scene against them before a prose token exists.
    const priorChapters = store.manuscript()
      .filter(item => item.chapter !== chapter && item.text.trim())
      .map(item => ({ ref: `Chapter ${item.chapter}`, text: item.text }));
    // Semantic pre-write gate: the local models read the plan against
    // finished prose and confirmed state before any prose exists. Off by
    // default, advisory always — findings join the P02 review below.
    const prewrite = await gate(plan, priorChapters, store.loadState());
    if (prewrite.warnings.length) {
      warnings.push(...prewrite.warnings);
      store.log('retry', `Pre-write semantic check degraded: ${prewrite.warnings.join('; ')}`);
    }
    // Honest label, once per book, in the run log — never in warnings: the
    // run says what the gate did or did not check without punishing a clean
    // book's status for the author's own setting.
    if (!store.checkpoints().includes('gate-mode-noted')) {
      store.checkpoint('gate-mode-noted');
      const coverage = prewrite.mode === 'full'
        ? 'paraphrase restaging and plan-vs-memory clashes'
        : 'nothing beyond the verbatim check (semantic gate off)';
      store.log('gate', `Semantic pre-write check (${prewrite.mode}): ${coverage}.`);
    }
    // The doubts only a reader can settle, for the whole chapter, in one call
    // before its first scene. A scene replanned later is read again on its own.
    // A scene that opens somewhere other than where the last one closed, and
    // says what changed, answered the planner's rule; whether the change could
    // have happened between the scenes is a reading, and goes to the same review.
    const doubts = new Map(prewrite.problems);
    const previousEnd = previousChapterEnd(store, chapter);
    for (const seam of chapterSeams(plan, previousEnd, await readSeams(plan, previousEnd)).filter(item => item.changeStated)) {
      doubts.set(seam.scene, [...(doubts.get(seam.scene) || []), {
        code: 'seam-change',
        detail: `${seam.text}. Could that have happened between the two scenes, with nothing the reader needs left out? If not, return major with what ${seam.scene} must show at its opening.`,
      }]);
    }
    const readings = await this.readPlanDoubts(design, chapter, plan, store, llm, warnings, doubts);
    for (let sceneIndex = 0; sceneIndex < plan.scenes.length; sceneIndex++) {
      let scene = plan.scenes[sceneIndex];
      // A stored scene with a folded delta replays: same fold functions, same
      // ids, same memory — no model calls, no doubled events. A partial record
      // (no delta: the run died mid-scene) is regenerated below.
      const stored = savedScenes.get(scene.id);
      if (stored?.delta) {
        const replayed = applyDelta(store.loadState(), stored.delta, scene.id);
        const settled = applyResolutions(replayed.state, stored.resolutions || [], scene.id);
        store.saveState(settled);
        const replayedThreads = applyThreads(store.loadThreads(), stored.delta, scene.id);
        store.saveThreads(replayedThreads);
        handoff = (stored.handoff && compactHandoff(stored.handoff)) || buildSceneHandoff({
          scene: stored.plan || scene,
          nextScene: plan.scenes[sceneIndex + 1],
          state: settled,
          delta: stored.delta,
          resolutions: stored.resolutions || [],
          threads: replayedThreads,
          previous: handoff,
        });
        if (!stored.handoff) store.saveScene({ ...stored, handoff });
        const tail = stored.prose.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean).at(-1) || '';
        previousTail = tail.slice(-600);
        excerpts.push(`[${scene.id}] ${tail.slice(-300)}`);
        this.flushRetries(store);
        store.log('scene', `Scene ${scene.id} replayed from the stored draft; no rewrite.`);
        continue;
      }
      // A scene is replanned only when the scene before it has made its plan
      // untrue: written as planned it would now repeat what that scene did, or
      // contradict where it left things. It used to be replanned before every
      // scene — a prompt the size of a chapter, the whole plan back again — and
      // then on any recorded departure from plan, which came to nearly the same
      // thing: of thirty departures recorded over two books most were a writer
      // supplying a date or a detail the plan had left open, and five said in
      // so many words that the scene matched its plan. So the tracker is asked
      // the one question that matters here, per departure, and the replan
      // happens on a yes.
      const before = sceneIndex > 0
        ? store.chapterScenes(chapter).find(record => record.id === plan.scenes[sceneIndex - 1].id)
        // A chapter's first scene was planned after the last chapter was written.
        : undefined;
      const departed = (before?.delta?.plan_deviations || [])
        .filter(item => item?.next_scene_must_change === true && String(item?.actual || '').trim())
        .map(item => `The scene before this one was planned as "${String(item.planned || '').trim()}" and was written as "${String(item.actual).trim()}"${String(item.future_dependency_affected || '').trim() ? `, which affects ${String(item.future_dependency_affected).trim()}` : ''}.`);
      const retold = before?.prose ? retellingSuspect(scene, [{ ref: before.id, text: before.prose }]) : '';
      if (handoff && (departed.length || retold)) {
        // A replan that will not validate is a worse plan than the one the chapter planner
        // already approved — not a reason to lose the chapter. The scene is written as
        // planned and the reader is told the handoff did not reach it.
        try {
          scene = await rebaseScenePlan({
            design,
            scene,
            handoff,
            openThreads: store.loadThreads().filter(item => item.status === 'open').map(item => item.description),
            reason: [...departed, ...(retold ? [retold] : [])].join('\n'),
          }, llm);
          plan = { ...plan, scenes: plan.scenes.map((item, index) => index === sceneIndex ? scene : item) };
          store.saveChapterPlan(plan);
          readings.delete(scene.id);
          store.log('scene-rebase', `Scene ${scene.id} replanned after ${handoff.after_scene_id}: ${departed.length} departure(s) from plan${retold ? ', and an outcome already reached' : ''}.`);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          warnings.push(`Scene ${scene.id} kept its planned causal chain: the rebase on ${handoff.after_scene_id} failed (${reason.split('\n')[0]}).`);
          store.log('scene-rebase', `Scene ${scene.id} rebase failed; writing the planned scene. ${reason}`);
        }
      }
      // A callback to an earlier detail travels as the paragraph that established it.
      // The chapter tails still follow, for continuity of voice rather than of fact.
      const sources = resolveSourceRefs(scene.required_source_refs, store, store.loadState());
      const sceneSources = [...sources.excerpts, ...excerpts];
      // Recomputed per scene, not per chapter: a phrase this chapter has already
      // worn out must be banned for the next scene, not for the next book.
      // Images the earlier chapters' checks named, counted over everything
      // accepted so far. One at its allowance joins the ban list with its
      // number, beside the phrases — and unlike the phrases it is searched for
      // in the draft below, because a ban a writer can paraphrase around is a
      // suggestion.
      const spentImages = countImages(knownImages(store, chapter - 1), proseThrough(store, chapter), profile)
        .filter(use => use.uses >= use.allowance);
      const worn = [
        ...wornLedger(store, profile),
        ...spentImages.map(use => ({ phrase: `the image of ${use.image.image} (any sentence joining: ${use.image.anchors.join(', ')})`, uses: use.uses })),
      ];
      const { vars, problems: contextProblems } = buildSceneContext(design, store.loadState(), scene, previousTail, sceneSources, priorChapters, handoff, recentShapes(store, chapter), worn);
      const problems = [...contextProblems, ...(prewrite.problems.get(scene.id) || [])];
      if (sources.missing.length) {
        problems.push({
          code: 'missing-source',
          detail: `Scene ${scene.id} cites earlier text that cannot be retrieved: ${sources.missing.join(', ')}. A reference reads SCENE_ID#pN or the id of a recorded fact or event. Either the callback rests on nothing written, or the reference is malformed — decide which before the scene leans on it.`,
        });
      }
      if (sources.excerpts.length) {
        store.log('retrieval', `Scene ${scene.id} retrieved ${sources.excerpts.length} exact excerpt(s) for its callbacks.`);
      }
      // What code can settle goes to the writer as it stands: a doubt with one
      // right answer is an instruction, not a question for the editor.
      const direct = problems.filter(problem => !needsReading(problem));
      const requirements = direct.map(writerRequirement);
      if (direct.length) store.log('readiness', `Scene ${scene.id}: ${direct.length} doubt(s) passed to the writer as requirements (${direct.map(problem => problem.code).join(', ')}).`);
      // What needs a reader was read with the chapter's plan, unless the scene
      // has changed since or the run was resumed past that point.
      const toRead = doubtsToRead(problems);
      if (toRead.length) {
        let verdicts = readings.get(scene.id);
        if (!verdicts) {
          // The review only ever advises, so losing it is not worth a book: the
          // scene goes to the writer with its doubts unanswered and the reader is
          // told which. The tracker still reads the result afterwards.
          const check = await reviewPlan(
            { story_contract: JSON.stringify(design.contract) },
            `Scene ${scene.id} readiness before prose. Cast roster (id — name — function):\n${design.characters.map(character => `${character.id} — ${character.name} — ${character.story_function}`).join('\n')}\nCode-level doubts:\n${toRead.map(p => `- ${p.code}: ${p.detail}`).join('\n')}`,
            scene,
            describeStateDigest(store.loadState()),
            JSON.stringify(sceneSources),
            llm,
            'scene-readiness',
          ).catch(error => {
            const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
            warnings.push(`Scene ${scene.id} was written without its readiness review (${reason}). Unanswered doubts: ${toRead.map(p => p.code).join(', ')}.`);
            store.log('retry', `Scene ${scene.id} readiness review failed; writing with the doubts unanswered. ${reason}`);
            return { ready: true, issues: [] };
          });
          verdicts = check.issues.filter(item => item.severity === 'blocking' || item.severity === 'major')
            .map(item => item.required_decision || item.problem);
          for (const item of check.issues.filter(item => item.severity !== 'blocking' && item.severity !== 'major')) {
            warnings.push(`Scene ${scene.id}: ${item.problem}`);
          }
        }
        if (verdicts.length) {
          requirements.push(...verdicts);
          warnings.push(`Scene ${scene.id} must establish: ${verdicts.join('; ')}.`);
        }
      }
      if (requirements.length) {
        const startState = JSON.parse(vars.scene_start_state) as Record<string, unknown>;
        startState.continuity_requirements = requirements;
        vars.scene_start_state = JSON.stringify(startState);
      }
      const track = (prose: string) => trackScene({
        priorState: store.loadState(),
        scenePlan: scene,
        sceneProse: prose,
        sourceExcerpts: excerpts,
        openThreads: store.loadThreads().filter(item => item.status === 'open'),
      }, llm);
      // Repair before tracking, never after: a replacement carries the same
      // information as the sentence it replaces, so memory is unaffected — and
      // running it here means the delta, the handoff and the tail all describe
      // the prose that actually ships. Only the duplicated sentences travel to
      // the model, so this costs a fraction of the rewrite it replaces and
      // leaves the rest of the scene exactly as written.
      const deduplicate = async (draft: string): Promise<string> => {
        const earlier = [...priorChapters, ...store.chapterScenes(chapter)
          .filter(record => record.prose.trim() && record.id !== scene.id)
          .map(record => ({ ref: record.id, text: record.prose }))];
        // The spent images are searched for in the draft here too, and their
        // sentences travel in the same call as the duplicated ones: one small
        // rewrite a scene, whatever it is for.
        const repair = await repairRepetition({
          design, scene, prose: draft, earlier,
          images: spentImages.map(use => ({ image: use.image, uses: use.uses })),
        }, llm);
        if (repair.repaired.length) {
          store.log('repair', `Scene ${scene.id}: ${repair.repaired.length} sentence(s) rewritten in place${repair.trimmed ? `, ${repair.trimmed} of them to take out an image the book has used up` : ''}${repair.repaired.length > repair.trimmed ? ' for repeating earlier prose' : ''}.`);
        }
        for (const standing of repair.left) {
          warnings.push(`Scene ${scene.id}: ${standing}.`);
        }
        this.flushRetries(store);
        return repair.prose;
      };
      const onApparatus = (removed: string[]): void => {
        const cut = removed.map(line => `"${line.length > 80 ? `${line.slice(0, 80)}…` : line}"`).join(', ');
        warnings.push(`Scene ${scene.id}: ${removed.length} line(s) the writer put around the scene, not in it, were cut from the manuscript: ${cut}.`);
        store.log('apparatus', `Scene ${scene.id}: cut ${cut}.`);
      };
      const noteOmissions = (read: { omitted_lists?: string[] }): void => {
        if (read.omitted_lists?.length) {
          store.log('memory', `Scene ${scene.id}: the extraction left out ${read.omitted_lists.join(', ')}; read as empty.`);
        }
      };
      const sceneRef = scene.id;
      // What the tracker found wrong that is smaller than the scene is put
      // right at its own size. A recorded name misspelt is a spelling: code
      // replaces it. A beat staged again is the paragraphs that stage it: they
      // are cut down in place. Neither sends the scene back to be written, and
      // neither needs it read again — the delta is corrected by the same
      // subtraction the text was.
      const settle = async (draft: string, read: typeof delta): Promise<{ prose: string; delta: typeof delta; applied: ReturnType<typeof applyDelta> }> => {
        let text = draft;
        let record = read;
        let folded = applyDelta(store.loadState(), record, sceneRef);
        if (folded.variants.length) {
          const fixed = alignSpellings(text, folded.variants);
          text = fixed.prose;
          const used = new Set(folded.variants.map(item => item.used));
          record = { ...record, name_variants: [], proper_names: (record.proper_names || []).filter(item => !used.has(String(item?.name || '').trim())) };
          for (const item of fixed.changed) {
            warnings.push(`Scene ${scene.id}: "${item.used}" was respelt "${item.recorded}" in ${item.places} place(s), the spelling on record.`);
            store.log('names', `Scene ${scene.id}: "${item.used}" → "${item.recorded}" ×${item.places}.`);
          }
        }
        if (folded.restaged.length) {
          const out = await condenseRestaged({ design, prose: text, delta: record, restaged: folded.restaged }, llm);
          text = out.prose;
          record = out.delta;
          if (out.condensed.length) {
            warnings.push(`Scene ${scene.id}: ${out.condensed.length} paragraph(s) that staged again what the book already had were cut down in place (${folded.restaged.map(item => `${item.beat} — ${item.earlier}`).join('; ')}).`);
            store.log('repair', `Scene ${scene.id}: paragraph(s) ${out.condensed.join(', ')} condensed; they restaged ${folded.restaged.map(item => item.earlier).join(', ')}.`);
          }
          for (const standing of out.left) warnings.push(`Scene ${scene.id} stages again what the book already had, and ${standing}.`);
          this.flushRetries(store);
        }
        // A particular the scene states otherwise than the record holds it —
        // the same thing, the same property, another answer — is the sentences
        // that state it: they are corrected in place to what the book holds,
        // and the scene's own version never reaches the shelf.
        const clashes = await readFactClashes(sameQuestionFacts(store.loadState(), record));
        if (clashes.length) {
          const paragraphs = new Map(paragraphsWithIds(text).map(item => [item.id, item.text]));
          const dropped = new Set<number>();
          for (const clash of clashes) {
            dropped.add(clash.index);
            const quotes = clash.stated.evidence_refs.map(ref => paragraphs.get(ref)).filter((quote): quote is string => Boolean(quote));
            const said = `${clash.stated.subject} — ${clash.stated.attribute}: the scene says "${clash.stated.statement}", the book holds "${clash.recorded.statement}" (${clash.recorded.id})`;
            if (!quotes.length) { warnings.push(`Scene ${scene.id}: ${said}; no paragraph was cited for it, so it stands uncorrected.`); continue; }
            const out = await correctSpans({ design, prose: text, repair: {
              id: `${scene.id}-fact${clash.index + 1}`, kind: 'align', scene_id: scene.id, after_paragraph: '', must_establish: '',
              problem: `These paragraphs state ${clash.stated.subject} — ${clash.stated.attribute} as "${clash.stated.statement}".`,
              canonical: clash.recorded.statement, quotes,
            } }, llm);
            this.flushRetries(store);
            text = out.prose;
            if (out.corrected) store.log('repair', `Scene ${scene.id}: ${out.corrected} paragraph(s) corrected in place — ${said}.`);
            warnings.push(`Scene ${scene.id}: ${said}; ${out.corrected ? `${out.corrected} paragraph(s) corrected in place` : `left as written (${out.left.join('; ') || 'no correction offered'})`}.`);
          }
          record = { ...record, established_facts: (record.established_facts || []).filter((_, index) => !dropped.has(index)) };
        }
        if (folded.variants.length || folded.restaged.length || clashes.length) folded = applyDelta(store.loadState(), { ...record, restaged_beats: [] }, sceneRef);
        return { prose: text, delta: record, applied: folded };
      };
      // Speech is measured, not requested. A scene with two people in it that
      // comes back below the floor this book declared is written once more with
      // the number in front of the writer, and measured again; the draft with
      // more said in it is the one kept. Once per scene — the contradiction
      // rewrite below does not buy a second attempt at it.
      const floor = bandsFor(profile).dialogueShare[0];
      const spoken = (draft: string): number | null => {
        if (floor <= 0 || new Set(scene.participants || []).size < 2) return null;
        if (draft.split(/\s+/).filter(Boolean).length < 200) return null;
        return measureTexture(draft).dialogueShare;
      };
      let askedToSpeak = false;
      const draftScene = async (): Promise<string> => {
        let draft = await writeSceneV2({ contextVars: vars, onApparatus }, llm);
        const share = spoken(draft);
        if (share !== null && share < floor && !askedToSpeak) {
          askedToSpeak = true;
          const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
          const startState = JSON.parse(vars.scene_start_state) as Record<string, unknown>;
          const prior = Array.isArray(startState.continuity_requirements) ? startState.continuity_requirements as string[] : [];
          startState.continuity_requirements = [...prior, `The last draft of this scene gave ${percent(share)} of its words to speech with ${new Set(scene.participants).size} people present; this book declared dialogue weight "${profile.dialogue_weight}", which starts at ${percent(floor)}. Carry the turn of the scene in what they say to each other — the question asked aloud, the answer withheld, the thing said that cannot be taken back — and narrate only what speech cannot do.`];
          vars.scene_start_state = JSON.stringify(startState);
          const again = await writeSceneV2({ contextVars: vars, onApparatus }, llm);
          const after = spoken(again) ?? 0;
          store.log('texture', `Scene ${scene.id}: ${percent(share)} spoken against a floor of ${percent(floor)}; rewritten once, now ${percent(after)}.`);
          if (after > share) draft = again;
          if (Math.max(after, share) < floor) {
            warnings.push(`Scene ${scene.id} was asked for more speech and still gives ${percent(Math.max(after, share))} of its words to it, below the ${percent(floor)} this book declared.`);
          }
        }
        this.flushRetries(store);
        return draft;
      };
      let prose = await deduplicate(await draftScene());
      let delta = await track(prose);
      noteOmissions(delta);
      let applied: ReturnType<typeof applyDelta>;
      ({ prose, delta, applied } = await settle(prose, delta));
      if (applied.blockers.length) {
        // One correction pass, not a dead book: the writer sees exactly what
        // broke continuity and rewrites the scene against it. A second
        // consecutive break does not end the book either — it travels as a
        // warning, the way an unfixed plan defect and an unresolved design
        // objection already do. The verdict is an editor model's judgement, and
        // on two live runs every objection that survived a rewrite was the same
        // false one: an abbreviation read as a misspelt name.
        store.log('retry', `Scene ${scene.id} contradicts confirmed state: ${applied.blockers.join('; ')}. One rewrite with corrections.`);
        warnings.push(`Scene ${scene.id} broke continuity on the first draft and was rewritten: ${applied.blockers.join('; ')}.`);
        const startState = JSON.parse(vars.scene_start_state) as Record<string, unknown>;
        const prior = Array.isArray(startState.continuity_requirements) ? startState.continuity_requirements as string[] : [];
        startState.continuity_requirements = [...prior, ...applied.blockers.map(blocker => `Do not contradict confirmed state: ${blocker}`)];
        vars.scene_start_state = JSON.stringify(startState);
        prose = await deduplicate(await draftScene());
        delta = await track(prose);
        noteOmissions(delta);
        ({ prose, delta, applied } = await settle(prose, delta));
        if (applied.blockers.length) {
          const standing = applied.blockers.join('; ').replace(/\.$/, '');
          // The rewrite is the one that stands: it was written against the
          // objection, and memory folds what it says. What it still breaks is
          // on the record for whoever edits the book.
          warnings.push(`Scene ${scene.id} still breaks continuity after its rewrite and was kept: ${standing}.`);
          store.log('continuity', `Scene ${scene.id} kept over ${applied.blockers.length} standing objection(s): ${standing}`);
        }
      }
      // A bond that moved with nothing behind it stays where it was, and says so:
      // an interpretation of the scene is not a change to the world.
      for (const note of applied.refused) {
        warnings.push(`Scene ${scene.id}: ${note}`);
        store.log('memory', note);
      }
      // A contradiction the editor did not think worth stopping for is still
      // worth a line in the record.
      for (const doubt of delta.contradictions.filter(item => !item.blocks_continuation)) {
        store.log('continuity', `Scene ${scene.id}: possible contradiction, not acted on — ${doubt.description}`);
      }
      // What the plan said this scene would pay of the premise, against what
      // the tracker found paid. An unpaid one goes to the chapter's closing
      // call, which can still have a beat added for it.
      const paid = new Set((delta.threads_resolved || []).map(item => String(typeof item === 'string' ? item : item?.id || item?.thread || item?.description || '').trim().toUpperCase()));
      for (const owed of scene.pays_premise || []) {
        if ([...paid].some(cited => cited.includes(owed.id.toUpperCase()))) continue;
        const given = threads.find(thread => thread.id.toUpperCase() === owed.id.toUpperCase())?.description || owed.id;
        unpaid.push(`${scene.id}: planned to put the premise given "${given}" on the page by "${owed.action || 'an action the plan did not name'}", and the tracker did not find it done`);
        store.log('premise', `Scene ${scene.id} was planned to pay ${owed.id} ("${given}") and did not.`);
      }
      const settled = applied.state;
      const resolutions: QuestionResolution[] = [];
      store.saveState(settled);
      const updatedThreads = applyThreads(store.loadThreads(), delta, sceneRef);
      store.saveThreads(updatedThreads);
      handoff = buildSceneHandoff({
        scene,
        nextScene: plan.scenes[sceneIndex + 1],
        state: settled,
        delta,
        resolutions,
        threads: updatedThreads,
        previous: handoff,
      });
      const numbered = paragraphsWithIds(prose);
      store.saveScene({ id: scene.id, chapter, prose, paragraph_ids: numbered.map(p => p.id), plan: scene, delta, resolutions, handoff });
      const tail = numbered.at(-1)?.text || '';
      previousTail = tail.slice(-600);
      excerpts.push(`[${scene.id}] ${tail.slice(-300)}`);
      this.flushRetries(store);
      store.log('scene', `Scene ${scene.id} written and folded into memory.`);
    }

    // The chapter is closed in one call. It reads the finished chapter once and
    // answers both questions that reading can answer: what in the chapter can
    // still be corrected, and what the plan ahead must now be. They were two
    // calls over the same text, one after the other.
    const closing = chapterRecords(store, chapter, plan);
    const forwardInput: ForwardInput = {
      design,
      completedChapter: chapter,
      chapterOutcome: `Chapter ${chapter} written as ${closing.length} scenes: ${plan.ending_change}`,
      acceptedState: store.loadState(),
      openThreads: store.loadThreads().filter(t => t.status === 'open').map(t => t.description),
      remainingChapters: entry ? design.chapter_map.length - chapter : 0,
      remainingWords: design.chapter_map.filter(item => item.chapter > chapter)
        .reduce((sum, item) => sum + (item.target_words || 0), 0),
      chapterEvents: chapterEvents(closing),
      planDeviations: [...chapterDeviations(closing), ...unpaid],
      chapterText: describeChapterText(closing),
    };
    let forward: Awaited<ReturnType<typeof updateForward>> | null = null;
    try {
      forward = await updateForward(forwardInput, llm);
    } catch (error) {
      // The chapter is written. Losing this call loses a check of it and an
      // adjustment to the chapters ahead, not the chapter: the next one is
      // planned from confirmed memory either way, against the map and the
      // ending requirements as they last stood.
      const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
      warnings.push(`The plan ahead was not reconciled with chapter ${chapter}, and the chapter was not checked against the book's record (${reason}). The next chapter is planned from memory against the map as it stood.`);
      store.log('retry', `Closing chapter ${chapter} failed; the chapter stands as written and the map as it stood. ${reason}`);
    }
    this.flushRetries(store);
    // The corrections, while nothing after the chapter exists. Once per
    // chapter: a resumed run does not correct a corrected chapter again.
    const checked = `chapter-check-${chapter}`;
    if (forward && !store.checkpoints().includes(checked)) {
      try {
        const outcome = await repairChapter({
          design, chapter, plan, store,
          startState: chapterStartState,
          startHandoff: chapterStartHandoff,
          proposals: forward,
        }, llm);
        warnings.push(...outcome.warnings);
        store.checkpoint(checked);
      } catch (error) {
        const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
        warnings.push(`Chapter ${chapter}: the corrections its check proposed were not made (${reason}).`);
        store.log('retry', `Chapter ${chapter} corrections failed; the chapter stands as written. ${reason}`);
      }
      this.flushRetries(store);
    }

    const scenes = chapterRecords(store, chapter, plan);
    const manuscript = scenes.map(s => s.prose).join('\n\n***\n\n');
    store.saveManuscript(chapter, manuscript);
    // The craft ledger read back against what the book said it would be. Both of
    // these are arithmetic over accepted prose — no model call, microseconds —
    // and both are visible now rather than in the final audit, when saying so
    // changes nothing that can still be written.
    const drift = textureDrift(store, profile, chapter);
    if (drift.drift) {
      warnings.push(`After chapter ${chapter}: ${drift.drift}`);
      store.log('texture', drift.drift);
    }
    if (drift.trend) {
      warnings.push(`After chapter ${chapter}: ${drift.trend}`);
      store.log('texture', drift.trend);
    }
    for (const tic of drift.tics) {
      warnings.push(`After chapter ${chapter} (${tic.id}): ${tic.detail}`);
      store.log('texture', `${tic.id}: ${tic.detail}`);
    }
    // A number that changed between chapters: the state tracker never saw it,
    // because scenery is not an event. Advisory on purpose — code cannot tell a
    // founding date that moved from two page numbers that are both correct.
    // Measured against the book's own rate, so a meditative book is judged as
    // the meditative book it has been, and only a scene that stopped carrying
    // its share is named.
    for (const thin of thinScenes(store, chapter)) {
      const detail = `Scene ${thin.scene} carries ${thin.events} event(s) across ${thin.words} words — ${thin.rate.toFixed(1)} per thousand, against ${thin.bookRate.toFixed(1)} for the book so far. Less happens here than anywhere else in it.`;
      warnings.push(detail);
      store.log('pacing', detail);
    }
    for (const clash of numericContradictions(acceptedProse(store, chapter))) {
      warnings.push(`"${clash.context}" is given as ${clash.values.join(' and as ')} in ${clash.refs.join(', ')}. If these are the same thing, one of them is wrong.`);
      store.log('continuity', `Numeric clash on "${clash.context}": ${clash.values.join(' / ')} (${clash.refs.join(', ')}).`);
    }
    // The chapter is finished only here: its state becomes the resume point,
    // so a later run never re-applies these deltas.
    store.saveStateSnapshot(chapter, store.loadState());

    if (!forward) return { warnings };
    const appliedPlan = applyPlanUpdates(design, forward);
    if (appliedPlan.skipped.length) warnings.push(`Plan updates skipped: ${appliedPlan.skipped.join('; ')}.`);
    // The reconciled map replaces the design's map for the chapters ahead.
    design.chapter_map = appliedPlan.design.chapter_map;
    store.saveDesign(appliedPlan.design);
    const lastScene = store.chapterScenes(chapter).at(-1);
    if (lastScene?.handoff) {
      store.saveScene({ ...lastScene, handoff: applyForwardToHandoff(lastScene.handoff, forward) });
    }
    // What the ending still needs is read once and kept: the next chapter is planned
    // against the requirements that are still standing, not against the design's full
    // list, and a book running out of chapters to prepare them says so now rather than
    // in the final audit, when there is nothing left to spend on the fix.
    // What an earlier chapter established stays established: a reading that
    // lists only its own chapter's does not hand the earlier ones back.
    const read = readEndingReadiness(forward);
    const readiness = {
      ...read,
      established_requirements: [...new Set([...(store.loadEndingReadiness()?.established_requirements || []), ...read.established_requirements])],
    };
    store.saveEndingReadiness(readiness);
    const stillNeeded = remainingEndingRequirements(appliedPlan.design, readiness);
    store.log('ending', stillNeeded.length
      ? `After chapter ${chapter} the ending still needs: ${stillNeeded.join('; ')}.`
      : `After chapter ${chapter} every ending requirement on record is established.`);
    for (const problem of readiness.capacity_problems) {
      warnings.push(`Ending capacity after chapter ${chapter}: ${problem}`);
    }
    // Same reason applyForwardToHandoff normalizes: the schema pins the key, not its contents.
    const blockers = stringList(forward.unresolved_blockers);
    if (blockers.length) {
      warnings.push(`Unresolved after chapter ${chapter}: ${blockers.join('; ')}.`);
    }
    return { warnings };
  }
}
