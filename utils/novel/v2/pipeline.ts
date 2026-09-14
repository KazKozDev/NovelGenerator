import { drainRetryNotices, type NovelLLM } from './llm';
import { reviewPlan } from './reviewer';
import { applyPlanUpdates, readEndingReadiness, remainingEndingRequirements, updateForward, type ForwardInput } from './forward';
import type { ChapterPipeline } from './orchestrator';
import { buildSceneContext, planChapter, rebaseScenePlan } from './planner';
import { writeSceneV2 } from './sceneWriter';
import { emptyState, type ProjectStore } from './store';
import { applyDelta, applyResolutions, applyThreads, paragraphsWithIds, resolveOpenQuestions, trackScene, type QuestionResolution } from './tracker';
import { runPrewriteGate } from './semanticGate';
import { applyForwardToHandoff, buildSceneHandoff } from './handoff';
import { stringList } from './normalize';
import { resolveSourceRefs } from './retrieval';
import { recentShapes } from './shapes';
import type { BookDesign, StoryState } from './types';

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

  async writeChapter(
    design: BookDesign,
    chapter: number,
    store: ProjectStore,
    llm: NovelLLM,
    gate: typeof runPrewriteGate = runPrewriteGate,
  ): Promise<{ warnings: string[] }> {
    const warnings: string[] = [];
    const input = store.loadInput();
    const storyLanguage = input?.story_language || design.contract.language || 'English';
    const planningLanguage = input?.planning_language || 'English';
    this.seedState(design, store);

    const entry = design.chapter_map.find(item => item.chapter === chapter);
    const threads = store.loadThreads();
    const previousRecord = store.chapterScenes(chapter - 1).at(-1);
    let handoff = previousRecord?.handoff || (previousRecord?.delta && previousRecord.plan
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
      plan = await planChapter({
        design,
        chapter,
        currentState: store.loadState(),
        previousOutcome: previousText ? `End of the previous chapter:\n${previousText.slice(-600)}` : '(opening chapter)',
        openThreads: threads.filter(t => t.status === 'open').map(t => t.description),
        endingRequirements: remainingEndingRequirements(design, store.loadEndingReadiness()),
        remainingWords: design.chapter_map.filter(item => item.chapter >= chapter)
          .reduce((sum, item) => sum + (item.target_words || 0), 0),
        story_language: storyLanguage,
        planning_language: planningLanguage,
        previousHandoff: handoff,
        recentShapes: recentShapes(store, chapter - 1),
      }, llm);
      if (plan.status === 'needs_replan') {
        throw new Error(`Chapter ${chapter} cannot be written as planned: ${plan.replan_reason || 'no reason given'}.`);
      }
      store.saveChapterPlan(plan);
      this.flushRetries(store);
      store.log('chapter-plan', `Chapter ${chapter}: ${plan.scenes.length} scenes planned.`);
    }

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
        : prewrite.mode === 'light'
          ? 'paraphrase restaging only (plan-vs-memory NLI needs the full mode)'
          : 'nothing beyond the verbatim check (semantic gate off)';
      store.log('gate', `Semantic pre-write check (${prewrite.mode}): ${coverage}.`);
    }
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
        handoff = stored.handoff || buildSceneHandoff({
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
      if (handoff) {
        // A rebase that will not validate is a worse plan than the one the chapter planner
        // already approved — not a reason to lose the chapter. The scene is written as
        // planned and the reader is told the handoff did not reach it.
        try {
          scene = await rebaseScenePlan({
            design,
            scene,
            handoff,
            state: store.loadState(),
            openThreads: store.loadThreads().filter(item => item.status === 'open').map(item => item.description),
            story_language: storyLanguage,
            planning_language: planningLanguage,
          }, llm);
          plan = { ...plan, scenes: plan.scenes.map((item, index) => index === sceneIndex ? scene : item) };
          store.saveChapterPlan(plan);
          store.log('scene-rebase', `Scene ${scene.id} rebased on handoff from ${handoff.after_scene_id}.`);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          warnings.push(`Scene ${scene.id} kept its planned causal chain: the rebase on ${handoff.after_scene_id} failed (${reason}).`);
          store.log('scene-rebase', `Scene ${scene.id} rebase failed; writing the planned scene. ${reason}`);
        }
      }
      // A callback to an earlier detail travels as the paragraph that established it.
      // The chapter tails still follow, for continuity of voice rather than of fact.
      const sources = resolveSourceRefs(scene.required_source_refs, store, store.loadState());
      const sceneSources = [...sources.excerpts, ...excerpts];
      const { vars, problems: contextProblems } = buildSceneContext(design, store.loadState(), scene, previousTail, sceneSources, priorChapters, handoff, recentShapes(store, chapter));
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
      if (problems.length) {
        // The §6 model gate: code found structural doubts, P02 disposes them
        // before prose exists. Blocking verdicts become explicit writer
        // instructions stitched into the package — the transition gets shown
        // on the page instead of stopping the book. If the writer still breaks
        // continuity, the state tracker catches it with evidence after the fact.
        const check = await reviewPlan(
          { story_language: storyLanguage, planning_language: planningLanguage, story_contract: JSON.stringify(design.contract) },
          `Scene ${scene.id} readiness before prose. Cast roster (id — name — function):\n${design.characters.map(character => `${character.id} — ${character.name} — ${character.story_function}`).join('\n')}\nCode-level doubts:\n${problems.map(p => `- ${p.code}: ${p.detail}`).join('\n')}`,
          scene,
          JSON.stringify(store.loadState()),
          JSON.stringify(sceneSources),
          llm,
        );
        const hard = check.issues.filter(item => item.severity === 'blocking' || item.severity === 'major');
        if (hard.length) {
          const startState = JSON.parse(vars.scene_start_state) as Record<string, unknown>;
          startState.continuity_requirements = hard.map(item => item.required_decision || item.problem);
          vars.scene_start_state = JSON.stringify(startState);
          warnings.push(`Scene ${scene.id} must establish: ${hard.map(item => item.required_decision || item.problem).join('; ')}.`);
        }
        for (const item of check.issues.filter(item => item.severity !== 'blocking' && item.severity !== 'major')) {
          warnings.push(`Scene ${scene.id}: ${item.problem}`);
        }
      }
      const track = (prose: string) => trackScene({
        story_language: storyLanguage,
        planning_language: planningLanguage,
        priorState: store.loadState(),
        scenePlan: scene,
        sceneProse: prose,
        sourceExcerpts: excerpts,
      }, llm);
      let prose = await writeSceneV2({ story_language: storyLanguage, planning_language: planningLanguage, contextVars: vars }, llm);
      let delta = await track(prose);
      const sceneRef = scene.id;
      let applied = applyDelta(store.loadState(), delta, sceneRef);
      if (applied.blockers.length) {
        // One correction pass, not a dead book: the writer sees exactly what
        // broke continuity and rewrites the scene against it. Only a second
        // consecutive break fails loudly.
        store.log('retry', `Scene ${scene.id} contradicts confirmed state: ${applied.blockers.join('; ')}. One rewrite with corrections.`);
        warnings.push(`Scene ${scene.id} broke continuity on the first draft and was rewritten: ${applied.blockers.join('; ')}.`);
        const startState = JSON.parse(vars.scene_start_state) as Record<string, unknown>;
        const prior = Array.isArray(startState.continuity_requirements) ? startState.continuity_requirements as string[] : [];
        startState.continuity_requirements = [...prior, ...applied.blockers.map(blocker => `Do not contradict confirmed state: ${blocker}`)];
        vars.scene_start_state = JSON.stringify(startState);
        prose = await writeSceneV2({ story_language: storyLanguage, planning_language: planningLanguage, contextVars: vars }, llm);
        delta = await track(prose);
        applied = applyDelta(store.loadState(), delta, sceneRef);
        if (applied.blockers.length) {
          throw new Error(`Scene ${scene.id} contradicts confirmed state: ${applied.blockers.join('; ').replace(/\.$/, '')}.`);
        }
      }
      // A bond that moved with nothing behind it stays where it was, and says so:
      // an interpretation of the scene is not a change to the world.
      for (const note of applied.refused) {
        warnings.push(`Scene ${scene.id}: ${note}`);
        store.log('memory', note);
      }
      // What the scene left open that the next scene needs is settled from the
      // text now, not carried as a silent gap: one bounded call, then memory.
      // If that call dies (a blown output budget, a disabled backend), the
      // chapter still stands — memory keeps what the delta proved, and the
      // open questions travel on as an explicit chapter warning instead of
      // silently passing as settled.
      const open = [
        ...delta.uncertainties.filter(u => u.relevant_to_next_scene)
          .map(u => ({ question: u.question, evidence_refs: u.evidence_refs })),
        ...delta.contradictions.filter(c => !c.blocks_continuation)
          .map(c => ({ question: `Possible contradiction to settle: ${c.description}`, evidence_refs: c.scene_refs })),
      ];
      let settled = applied.state;
      let resolutions: QuestionResolution[] = [];
      try {
        resolutions = await resolveOpenQuestions(prose, open, llm);
        settled = applyResolutions(applied.state, resolutions, sceneRef);
      } catch (error) {
        if (open.length) {
          warnings.push(`Scene ${scene.id} leaves open questions unresolved (${error instanceof Error ? error.message : error}). They travel to the next scene as questions, not answers.`);
        }
      }
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

    const scenes = store.chapterScenes(chapter);
    const manuscript = scenes.map(s => s.prose).join('\n\n***\n\n');
    store.saveManuscript(chapter, manuscript);
    // The chapter is finished only here: its state becomes the resume point,
    // so a later run never re-applies these deltas.
    store.saveStateSnapshot(chapter, store.loadState());

    const forwardInput: ForwardInput = {
      story_language: storyLanguage,
      planning_language: planningLanguage,
      design,
      completedChapter: chapter,
      chapterOutcome: `Chapter ${chapter} written as ${scenes.length} scenes: ${plan.ending_change}`,
      acceptedState: store.loadState(),
      openThreads: store.loadThreads().filter(t => t.status === 'open').map(t => t.description),
      remainingChapters: entry ? design.chapter_map.length - chapter : 0,
      remainingWords: design.chapter_map.filter(item => item.chapter > chapter)
        .reduce((sum, item) => sum + (item.target_words || 0), 0),
    };
    const forward = await updateForward(forwardInput, llm);
    this.flushRetries(store);
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
    const readiness = readEndingReadiness(forward);
    store.saveEndingReadiness(readiness);
    store.log('ending', readiness.remaining_requirements.length
      ? `After chapter ${chapter} the ending still needs: ${readiness.remaining_requirements.join('; ')}.`
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
