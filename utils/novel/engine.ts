import type { Character, ParsedChapterPlan, LLMProviderConfig } from '../../types';
import type { BookBlueprint, BookSpec, ChapterRecord, ChapterVersion, NovelRun, ReviewIssue, ReviewReport } from './contracts';
import { chapterRole, genreCraft, specPrompt } from './contracts';
import { acceptCandidate, acceptedVersion, addCandidate, canonBefore, canonForPrompt, emptyStoryState, evidenceExists, nextUnacceptedChapter, reconcileCheckpoint, validateAnalysis } from './storyState';
import { analyseChapter, reviewBook, reviewChapter, stripThinking, generateProse, structuredResponse, type NovelLLM } from './review';
import type { RunStore } from './runStore';
import { writeScene } from './writer';

export function createRun(spec: BookSpec, provider: LLMProviderConfig): NovelRun {
  return {
    schemaVersion: 1, validationVersion: 2, id: crypto.randomUUID(), spec: structuredClone(spec), provider: { ...provider },
    outline: '', chapters: [], canon: emptyStoryState(), stage: 'outline', updatedAt: Date.now(),
  };
}

export function validateBlueprint(value: any, spec: BookSpec): BookBlueprint {
  for (const field of ['centralConflict', 'protagonistChange', 'endingPayoff']) {
    if (typeof value[field] !== 'string' || !value[field].trim()) throw new Error(`Blueprint missing ${field}.`);
  }
  if (!Array.isArray(value.characters) || !value.characters.length || !Array.isArray(value.promises) || !value.promises.length) throw new Error('Blueprint needs characters and narrative promises.');
  const characters: Record<string, Character> = {};
  for (const character of value.characters) {
    if (typeof character.name !== 'string' || !character.name.trim() || typeof character.description !== 'string' || !character.description.trim() || characters[character.name]) throw new Error('Invalid or duplicate character design.');
    characters[character.name] = {
      name: character.name, description: character.description, first_appearance: 1,
      status: 'not established', location: 'not established', emotional_state: 'not established',
      relationships: {}, development: [],
    };
  }
  const ids = new Set<string>();
  for (const promise of value.promises) {
    if (typeof promise.id !== 'string' || !promise.id || ids.has(promise.id) || typeof promise.description !== 'string' ||
        typeof promise.required !== 'boolean' || !Number.isInteger(promise.setupChapter) || !Number.isInteger(promise.payoffChapter) ||
        promise.setupChapter < 1 || promise.payoffChapter < promise.setupChapter || promise.payoffChapter > spec.chapterCount) {
      throw new Error('Invalid narrative promise timing or identity.');
    }
    ids.add(promise.id);
  }
  if (!value.promises.some((promise: { required: boolean }) => promise.required)) throw new Error('The book must have at least one required narrative payoff.');
  return { centralConflict: value.centralConflict, protagonistChange: value.protagonistChange, endingPayoff: value.endingPayoff, characters, promises: value.promises, chapters: [] };
}

export function validateChapterPlan(value: any, spec: BookSpec): ParsedChapterPlan {
  if (!value || typeof value !== 'object') throw new Error('Invalid chapter plan object.');
  const target = value.chapter || value.chapterPlan || value.chapter_plan || value.plan || value;
  const aliases: Record<string, string[]> = {
    title: ['chapterTitle', 'chapter_title', 'heading'], summary: ['chapterSummary', 'chapter_summary', 'synopsis'],
    sceneBreakdown: ['scene_breakdown'], characterDevelopmentFocus: ['character_development_focus'],
    plotAdvancement: ['plot_advancement'], timelineIndicators: ['timeline_indicators'],
    emotionalToneTension: ['emotional_tone_tension'], connectionToNextChapter: ['connection_to_next_chapter'],
    openingHook: ['opening_hook'], chapterEnding: ['chapter_ending'], detailedScenes: ['detailed_scenes', 'scenes'],
  };
  const plan: any = { ...target };
  for (const [field, alternatives] of Object.entries(aliases)) {
    if (plan[field] === undefined) plan[field] = alternatives.map(key => target[key]).find(item => item !== undefined);
    if (field !== 'detailedScenes' && (typeof plan[field] !== 'string' || !plan[field].trim())) throw new Error(`Chapter plan missing ${field}.`);
  }
  if (!Array.isArray(plan.detailedScenes) || !plan.detailedScenes.length || plan.detailedScenes.length > 8) throw new Error('A chapter needs 1–8 fully planned scenes.');
  const ids = new Set<string>();
  plan.detailedScenes = plan.detailedScenes.map((raw: any, index: number) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid scene object.');
    const scene = { ...raw, sceneId: raw.sceneId || raw.scene_id || raw.id || `scene-${index + 1}`,
      objective: raw.objective || raw.goal, conflict: raw.conflict || raw.obstacle,
      outcome: raw.outcome || raw.result, participants: raw.participants || raw.characters,
      keyMoments: raw.keyMoments || raw.key_moments || raw.beats };
    for (const field of ['sceneId', 'location', 'objective', 'conflict', 'outcome', 'duration', 'mood']) {
      if (typeof scene[field] !== 'string' || !scene[field].trim()) throw new Error(`Scene missing ${field}.`);
    }
    if (ids.has(scene.sceneId) || !Array.isArray(scene.participants) || !scene.participants.length ||
        !scene.participants.every((name: unknown) => typeof name === 'string' && name.trim()) ||
        !Array.isArray(scene.keyMoments) || !scene.keyMoments.length ||
        !scene.keyMoments.every((beat: unknown) => typeof beat === 'string' && beat.trim())) throw new Error('Invalid scene identity, participants or beats.');
    ids.add(scene.sceneId);
    return scene;
  });
  return { ...plan, targetWordCount: spec.targetWordsPerChapter };
}

const text = { type: 'string', minLength: 1 };
/** Constrained decoding keeps a long plan well-formed; an unterminated JSON object is unrecoverable. */
export const blueprintSchema = {
  type: 'object', required: ['centralConflict', 'protagonistChange', 'endingPayoff', 'characters', 'promises'],
  properties: {
    centralConflict: text, protagonistChange: text, endingPayoff: text,
    characters: { type: 'array', minItems: 1, items: { type: 'object', required: ['name', 'description'], properties: { name: text, description: text }, additionalProperties: false } },
    promises: { type: 'array', minItems: 1, items: { type: 'object', required: ['id', 'description', 'setupChapter', 'payoffChapter', 'required'], properties: { id: text, description: text, setupChapter: { type: 'integer' }, payoffChapter: { type: 'integer' }, required: { type: 'boolean' } }, additionalProperties: false } },
  }, additionalProperties: false,
};
const planStrings = ['title', 'summary', 'sceneBreakdown', 'characterDevelopmentFocus', 'plotAdvancement', 'timelineIndicators', 'emotionalToneTension', 'connectionToNextChapter', 'openingHook', 'chapterEnding', 'moralDilemma', 'consequencesOfChoices', 'rhythmPacing'];
export const chapterPlanSchema = {
  type: 'object', required: [...planStrings, 'tensionLevel', 'detailedScenes'],
  properties: {
    ...Object.fromEntries(planStrings.map(field => [field, text])),
    tensionLevel: { type: 'integer' },
    detailedScenes: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', required: ['sceneId', 'location', 'participants', 'objective', 'conflict', 'outcome', 'duration', 'mood', 'keyMoments'], properties: { sceneId: text, location: text, participants: { type: 'array', minItems: 1, items: text }, objective: text, conflict: text, outcome: text, duration: text, mood: text, keyMoments: { type: 'array', minItems: 1, items: text } }, additionalProperties: false } },
  }, additionalProperties: false,
};

/**
 * A competent reviewer surfaces a different real defect on each pass, so a chapter converges over
 * several rounds. This is patience, not leniency: acceptance still requires zero non-minor issues.
 */
const MAX_CHAPTER_REPAIRS = 5;

export class NeedsRevisionError extends Error {}

export class NovelEngine {
  constructor(private llm: NovelLLM, private store: RunStore, private onUpdate: (run: NovelRun) => void = () => {}) {}

  private async checkpoint(run: NovelRun) {
    run.updatedAt = Date.now();
    await this.store.save(run); // Never report a saved stage before its transaction commits.
    this.onUpdate(structuredClone(run));
  }

  /**
   * The outline is the book's creative foundation: it belongs to the writer model, not the contract checker.
   * The schema pins outline to a string; a nested chapter object is not a usable outline.
   */
  async outline(run: NovelRun): Promise<void> {
    run.outline = await structuredResponse(`${specPrompt(run.spec)}\nDevelop a complete outline for exactly ${run.spec.chapterCount} chapters. Establish the central conflict, protagonist desire and inner need, opposition, causal escalation, major choices and their costs, planted clues and payoffs, differentiated character voices, and an earned ending. Describe the actual ending, not a teaser.` + '\nReturn JSON {"outline":"the complete outline"}.', 'You are a novel architect developing the author\'s story.', this.llm, ['outline'], raw => {
      if (typeof raw.outline !== 'string' || !raw.outline.trim()) throw new Error('The outline is empty.');
      return raw.outline.trim();
    }, { temperature: 0.6, maxTokens: 8192, route: 'writer', schema: { type: 'object', required: ['outline'], properties: { outline: { type: 'string', minLength: 1 } }, additionalProperties: false } });
    await this.checkpoint(run);
  }

  private async plan(run: NovelRun) {
    run.stage = 'planning';
    await this.checkpoint(run);
    if (!run.blueprint) {
      run.blueprint = await structuredResponse(`${specPrompt(run.spec)}\nAPPROVED OUTLINE:\n${run.outline}\nReturn JSON {"centralConflict":"goal, opposition, escalation and stakes","protagonistChange":"initial belief, decisive choice, cost and final change","endingPayoff":"external and emotional resolution","characters":[{"name":"name","description":"desire, need, contradiction, agency, speech habits and relationships"}],"promises":[{"id":"stable-id","description":"specific setup and earned payoff","setupChapter":1,"payoffChapter":${run.spec.chapterCount},"required":true}]}. Schedule all required payoffs inside this book. Optional series threads may remain open but must have required=false. Include the central conflict and emotional arc among the required promises.`, 'You build an explicit novel blueprint. Respond only with JSON.', this.llm, ['centralConflict', 'protagonistChange', 'endingPayoff', 'characters', 'promises'], raw => validateBlueprint(raw, run.spec), { temperature: 0.3, maxTokens: 8192, route: 'writer', schema: blueprintSchema });
      await this.checkpoint(run);
    }
    for (let number = run.chapters.length + 1; number <= run.spec.chapterCount; number++) {
      const plan = await structuredResponse(`${specPrompt(run.spec)}\nOUTLINE:\n${run.outline}\nBLUEPRINT AND PREVIOUS CHAPTER PLANS:\n${JSON.stringify(run.blueprint)}\nPlan chapter ${number}/${run.spec.chapterCount}, role=${chapterRole(number, run.spec.chapterCount)}. Every scene needs a goal, resistance, a consequential choice and changed situation. Follow scheduled promise setups and payoffs. Vary pacing intentionally; a quiet consequence scene need not contain a fight or cliffhanger. Return JSON with strings title, summary, sceneBreakdown, characterDevelopmentFocus, plotAdvancement, timelineIndicators, emotionalToneTension, connectionToNextChapter, openingHook, chapterEnding, moralDilemma, consequencesOfChoices, rhythmPacing; integer tensionLevel; and detailedScenes:[{sceneId,location,participants:[names],objective,conflict,outcome,duration,mood,keyMoments:[specific beats]}]. Use 1–8 scenes. For the final chapter, connectionToNextChapter must describe closure or an intentional series thread.`, 'You plan causally connected scenes for a novel. Respond only with JSON.', this.llm, ['title', 'detailedScenes'], raw => validateChapterPlan(raw, run.spec), { temperature: 0.4, maxTokens: 8192, route: 'writer', schema: chapterPlanSchema });
      run.blueprint.chapters.push(plan);
      const chapter: ChapterRecord = { number, plan, status: 'pending', versions: [], repairAttempts: 0 };
      if (run.importedDrafts?.[number - 1]?.trim()) addCandidate(chapter, run.importedDrafts[number - 1], 'Imported manuscript: requires review before acceptance');
      run.chapters.push(chapter);
      await this.checkpoint(run);
    }
  }

  /**
   * Semantic review is sampled, so a second pass over unchanged prose can miss what the first proved.
   * An evidenced non-minor defect therefore survives until the prose that carries it actually changes.
   */
  private carriedIssues(chapter: ChapterRecord, candidate: ChapterVersion, superseded?: ReviewReport): ReviewIssue[] {
    const reports = [superseded, ...chapter.versions.filter(version => version.revision !== candidate.revision && version.content === candidate.content).map(version => version.review)];
    const seen = new Set((candidate.review?.issues || []).map(issue => issue.id));
    const carried: ReviewIssue[] = [];
    for (const report of reports) {
      for (const issue of report?.issues || []) {
        if (issue.severity === 'minor' || seen.has(issue.id)) continue;
        const evidence = issue.evidence.map(item => ({ ...item, chapter: chapter.number, revision: candidate.revision }))
          .filter(item => evidenceExists(item, chapter.number, candidate));
        if (!evidence.length) continue; // The cited prose is gone, so the finding no longer applies.
        seen.add(issue.id);
        carried.push({ ...issue, evidence });
      }
    }
    return carried;
  }

  private async acceptOrRepair(run: NovelRun, chapter: ChapterRecord, candidate: ChapterVersion): Promise<void> {
    for (;;) {
      if (candidate.review?.validationVersion !== 2 || candidate.review.status !== 'passed' || candidate.review.checkedRevision !== candidate.revision) {
        const superseded = candidate.review;
        candidate.review = await reviewChapter(run, chapter, candidate, this.llm);
        if (candidate.review.status !== 'not_checked') {
          const carried = this.carriedIssues(chapter, candidate, superseded);
          if (carried.length) {
            candidate.review.issues = [...candidate.review.issues, ...carried];
            candidate.review.status = 'failed';
          }
        }
        await this.checkpoint(run);
      }
      if (candidate.review.status === 'passed') {
        const identical = chapter.versions.find(version =>
          version.revision !== candidate.revision && version.content === candidate.content && version.analysis,
        );
        if (identical?.analysis) {
          candidate.analysis = structuredClone(identical.analysis);
          for (const items of [candidate.analysis.facts, candidate.analysis.events, candidate.analysis.promises]) {
            for (const item of items) item.evidence.revision = candidate.revision;
          }
          const knownPromiseIds = new Set(run.blueprint?.promises.map(promise => promise.id) || []);
          candidate.analysis.promises = candidate.analysis.promises.filter(promise => knownPromiseIds.has(promise.promiseId));
          validateAnalysis(candidate.analysis, chapter.number, candidate);
        } else {
          candidate.analysis = await analyseChapter(run, chapter, candidate, this.llm);
        }
        acceptCandidate(run, chapter.number);
        await this.checkpoint(run);
        return;
      }
      if (candidate.review.status === 'not_checked') {
        chapter.status = 'needs_revision';
        throw new NeedsRevisionError(`Chapter ${chapter.number} needs editorial attention: ${candidate.review.error || 'Review failed or was offline.'}`);
      }
      if (chapter.repairAttempts >= MAX_CHAPTER_REPAIRS) {
        chapter.status = 'needs_revision';
        throw new NeedsRevisionError(`Chapter ${chapter.number} needs editorial attention: ${candidate.review.error || candidate.review.issues.map(issue => issue.description).join('; ')}`);
      }
      chapter.repairAttempts++;
      await this.checkpoint(run);
      const repetition = candidate.review.issues.filter(issue => issue.id === 'duplicated-passage' || /redundan|repetit|duplicat|identical/i.test(issue.description));
      const content = repetition.length === candidate.review.issues.length
        ? await this.removeRedundancy(run, chapter, candidate, repetition)
        : await this.repair(run, chapter, candidate, candidate.review.issues);
      candidate = addCandidate(chapter, content, 'Repair reported chapter defects');
      await this.checkpoint(run);
    }
  }

  private extractProse(text: string): string {
    // Remove only explicitly delimited model thinking. Never guess which story section to discard.
    return stripThinking(text);
  }

  /**
   * Redundancy is repaired by deletion, never by rewriting. A model asked to rewrite a repeated beat
   * produces a third version of it; asked to cut, it can only remove. The result is checked: every
   * sentence kept must come from the chapter as it stood, and the chapter must actually get shorter.
   */
  private async removeRedundancy(run: NovelRun, chapter: ChapterRecord, version: ChapterVersion, issues: ReviewIssue[]): Promise<string> {
    const sentences = (text: string) => text.split(/(?<=[.!?…])\s+/).map(item => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const original = new Set(sentences(version.content));
    // The contract is checked inside the call, so a pass that rewrites is told why and tries again.
    return structuredResponse(`${specPrompt(run.spec)}\nTHESE PASSAGES SAY THE SAME THING TWICE:\n${JSON.stringify(issues)}\nFULL CURRENT PROSE:\n${version.content}\nReturn the chapter with the weaker occurrence of each repetition deleted. This is a deletion pass: you may remove sentences and you may remove nothing else. Do not reword, merge, summarize or bridge what remains; every sentence you keep must appear in the prose above exactly as it is written there. Keep the stronger occurrence of each pair, and keep the chapter's ending single and in one place.\nOUTPUT FORMAT: Return one JSON object with exactly the field "prose", containing the complete chapter after the deletions.`,
      'You remove repeated passages from fiction by deleting them. You never rewrite.', this.llm, ['prose'], raw => {
        if (typeof raw.prose !== 'string' || !raw.prose.trim()) throw new Error('Missing final prose.');
        const cleaned = this.extractProse(raw.prose).trim();
        const invented = sentences(cleaned).filter(item => !original.has(item));
        if (invented.length) throw new Error(`This was a deletion pass, but ${invented.length} sentence(s) are not in the original. Return the original sentences you kept, unchanged, and delete the repetitions.`);
        if (cleaned.length >= version.content.length) throw new Error('Nothing was removed. Delete the weaker occurrence of each repeated passage.');
        return cleaned;
      }, { temperature: 0.1, maxTokens: Math.max(8192, version.content.length), route: 'writer',
           schema: { type: 'object', required: ['prose'], properties: { prose: { type: 'string' } }, additionalProperties: false } });
  }

  private async repair(run: NovelRun, chapter: ChapterRecord, version: ChapterVersion, issues: ReviewIssue[], extra = ''): Promise<string> {
    // A revision that silently condenses the chapter is a regression: state the length contract every time.
    const target = chapter.plan.targetWordCount || run.spec.targetWordsPerChapter;
    const budget = `\nLENGTH CONTRACT: the current version has ${version.content.split(/\s+/).filter(Boolean).length} words and the chapter target is ${target} words. Return a complete chapter of at least ${Math.ceil(target * 0.8)} words. Revise in place: keep every scene at full length and do not condense, trim or summarize anything the issues do not name.`;
    const raw = await generateProse(this.llm, `${specPrompt(run.spec)}${genreCraft(run.spec)}\nPLAN:\n${JSON.stringify(chapter.plan)}\nACCEPTED CANON BEFORE THIS CHAPTER:\n${JSON.stringify(canonForPrompt(canonBefore(run, chapter.number)))}\nREPAIR ONLY THESE ISSUES:\n${JSON.stringify(issues)}\nEach issue carries the exact passages it refers to. Locate those passages in the prose below and rewrite those passages. Reproduce every other sentence unchanged, word for word: a rewrite that regenerates the whole chapter reintroduces the same defect. The cited wording must not survive in the revision.\n${extra}\nFULL CURRENT PROSE:\n${version.content}\nReturn ONLY the complete revised chapter in the story's language. Do not output planning lists, outline scaffolding, working draft variants, or English commentary. Start directly with the story prose. Preserve all unaffected events, clues, names, scene outcomes and intentional voice. Do not add stock gestures, rename characters or impose synonym variation. Do not summarize or omit scenes.${budget}`, 'You perform targeted fiction revision. Return only the final revised story prose without scaffolding.', { temperature: 0.3, maxTokens: Math.max(8192, version.content.length) });
    return this.extractProse(raw).trim();
  }

  private async writeRemaining(run: NovelRun) {
    let chapter: ChapterRecord | undefined;
    while ((chapter = nextUnacceptedChapter(run))) {
      let candidate = chapter.versions.find(version => version.revision === chapter.candidateRevision);
      if (!candidate && chapter.status === 'invalidated') {
        // Keep downstream prose but re-review it against the changed canon before allowing it back in.
        const previous = chapter.versions.find(version => version.revision === chapter.acceptedRevision) || chapter.versions.at(-1);
        if (previous) candidate = addCandidate(chapter, previous.content, 'Revalidate after upstream revision');
      }
      if (!candidate) {
        chapter.sceneDrafts ||= [];
        for (let sceneIndex = chapter.sceneDrafts.length; sceneIndex < chapter.plan.detailedScenes.length; sceneIndex++) {
          const rawScene = await writeScene(run, chapter, sceneIndex, this.llm);
          const scene = this.extractProse(rawScene);
          if (!scene) throw new Error(`Scene ${sceneIndex + 1} of chapter ${chapter.number} is empty.`);
          chapter.sceneDrafts.push(scene);
          chapter.status = 'draft';
          await this.checkpoint(run);
        }
        candidate = addCandidate(chapter, chapter.sceneDrafts.join('\n\n***\n\n'), 'Initial chapter draft');
        await this.checkpoint(run);
      }
      await this.acceptOrRepair(run, chapter, candidate);
    }
  }

  private async globalReview(run: NovelRun, phase: 'structure' | 'final') {
    const field = phase === 'structure' ? 'structuralReview' : 'finalReview';
    const attempts = phase === 'structure' ? 'structuralAttempts' : 'finalAttempts';
    for (;;) {
      run[field] = await reviewBook(run, this.llm, phase);
      await this.checkpoint(run);
      if (run[field].status === 'passed') return;
      const report = run[field];
      if (report.status === 'not_checked' || (run[attempts] || 0) >= 2) throw new NeedsRevisionError(`Book ${phase} review needs attention: ${report.error || report.issues.map(issue => issue.description).join('; ')}`);
      run[attempts] = (run[attempts] || 0) + 1;
      await this.checkpoint(run);
      const affected = new Set(report.issues.filter(issue => issue.severity !== 'minor').flatMap(issue => issue.evidence.map(evidence => evidence.chapter)));
      // Missing required promise evidence needs a targeted task at its scheduled chapter.
      for (const promise of run.blueprint.promises.filter(item => item.required)) {
        if (!run.canon.promises.some(item => item.promiseId === promise.id && item.kind === 'setup')) affected.add(promise.setupChapter);
        if (!run.canon.promises.some(item => item.promiseId === promise.id && item.kind === 'payoff')) affected.add(promise.payoffChapter);
      }
      if (!affected.size) throw new NeedsRevisionError('Book review failed without an actionable repair target.');
      for (const number of [...affected].sort((a, b) => a - b)) {
        await this.writeRemaining(run);
        const chapter = run.chapters[number - 1];
        const version = acceptedVersion(chapter);
        const issues = report.issues.filter(issue => issue.evidence.some(evidence => evidence.chapter === number));
        const content = await this.repair(run, chapter, version, issues, `GLOBAL REVIEW: ${report.error || ''}\nRequired promises for this chapter: ${JSON.stringify(run.blueprint.promises.filter(promise => promise.setupChapter === number || promise.payoffChapter === number))}`);
        const candidate = addCandidate(chapter, content, `Address ${phase} review`);
        await this.checkpoint(run);
        await this.acceptOrRepair(run, chapter, candidate);
      }
      await this.writeRemaining(run);
    }
  }

  private async lineEdit(run: NovelRun) {
    for (const chapter of run.chapters) {
      await this.writeRemaining(run);
      const version = acceptedVersion(chapter);
      if (chapter.lineEditedRevision === version.revision) continue;
      // Reuse the evidenced local review. No blanket rewrite for a chapter without actionable issues.
      const issues = version.review?.issues.filter(issue => ['dialogue', 'voice', 'pacing', 'hook', 'audience'].includes(issue.category)) || [];
      if (issues.length) {
        const content = await this.repair(run, chapter, version, issues);
        const candidate = addCandidate(chapter, content, 'Targeted line edit');
        await this.checkpoint(run);
        await this.acceptOrRepair(run, chapter, candidate);
      }
      chapter.lineEditedRevision = chapter.acceptedRevision;
      await this.checkpoint(run);
    }
    await this.writeRemaining(run);
  }

  async continue(run: NovelRun): Promise<void> {
    try {
      if (reconcileCheckpoint(run)) await this.checkpoint(run);
      if (!run.outline.trim()) throw new Error('Approve an outline before continuing.');
      if (run.stage === 'complete') return;
      if (run.stage === 'needs_revision') run.stage = run.resumeStage || 'writing';
      run.error = undefined;
      if (run.stage === 'outline' || run.stage === 'planning') {
        await this.plan(run);
        run.stage = 'writing';
        await this.checkpoint(run);
      }
      await this.writeRemaining(run);
      if (run.stage === 'writing' || run.stage === 'structural_review') {
        run.stage = 'structural_review';
        await this.checkpoint(run);
        await this.globalReview(run, 'structure');
        run.stage = 'line_editing';
        await this.checkpoint(run);
      }
      if (run.stage === 'line_editing') {
        await this.lineEdit(run);
        run.stage = 'final_review';
        await this.checkpoint(run);
      }
      if (run.stage === 'final_review') {
        await this.globalReview(run, 'final');
        if (!run.title) {
          try {
            run.title = await structuredResponse(`${specPrompt(run.spec)}\nNOVEL SUMMARY:\n${JSON.stringify(run.canon.summaries)}\nGive this novel a distinctive title. Return JSON {"title":"the title"}.`, 'You title completed novels.', this.llm, ['title'], raw => {
              if (typeof raw.title !== 'string' || !raw.title.trim()) throw new Error('Missing title.');
              return raw.title.trim();
            }, { temperature: 0.5, route: 'writer', schema: { type: 'object', required: ['title'], properties: { title: { type: 'string', minLength: 1 } }, additionalProperties: false } });
          } catch {
            // A cosmetic model failure must not invalidate a fully reviewed manuscript.
            run.title = run.chapters[0]?.plan.title?.trim() || (run.spec.language.toLowerCase().startsWith('ru') ? 'Рукопись без названия' : 'Untitled Manuscript');
          }
        }
        run.stage = 'complete';
        await this.checkpoint(run);
      }
    } catch (error) {
      run.resumeStage = run.stage;
      run.stage = 'needs_revision';
      run.error = error instanceof Error ? error.message : String(error);
      await this.checkpoint(run);
      throw error;
    }
  }
}
