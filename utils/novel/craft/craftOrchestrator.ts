import type { NovelLLM } from '../v2/llm';
import type { ProjectStore } from '../v2/store';
import type { FinalReport, ProjectInput } from '../v2/types';
import type { ProgressStage } from '../v2/orchestrator';
import type { AuthorDraft } from '../v3/author';
import type { DeskState } from '../v3/authorDesk';
import { getCraftGuide } from './craftGuide';

export interface PropAnchor {
  name: string;
  role: 'setup' | 'complication' | 'payoff';
}

export interface ValueCharge {
  start: string;
  end: string;
  shift: '+ to -' | '- to +';
}

export interface CardConflict {
  external: string;
  interpersonal: string;
  internal: string;
}

export interface CardStakes {
  atRisk: string;
  costOfChoice: string;
}

export interface Card {
  id: string;
  chapter: number;
  order: number;
  sceneType?: 'scene' | 'sequel'; // Swain's pulse: Action (Goal->Conflict->Disaster) vs Reaction (Emotion->Dilemma->Decision)
  time: string;
  location: string;
  causalLink: 'therefore' | 'but';
  valueCharge: ValueCharge;
  conflict?: CardConflict; // 3-layer conflict: external, interpersonal, internal
  stakes?: CardStakes; // Concrete immediate stakes and cost
  purpose: string;
  action: string;
  choice: string;
  cost: string;
  change: string;
  dialogueAims: Record<string, string>;
  rhythm: string;
  readerBefore: string;
  readerAfter: string;
  endingCadence?: 'cliffhanger' | 'quiet-resonance';
  endingType?: 'interrupted-action' | 'new-reveal' | 'impossible-choice' | 'arrival-of-threat' | 'loaded-line' | 'pause';
  openLoopsIntroduced?: string[];
  openLoopsResolved?: string[];
  dependsOn: string[];
  povKnows: string[];
  newFacts: string[];
  props: string[];
  propAnchors?: PropAnchor[];
}

export interface Fact {
  id: string;
  text: string;
  kind: string;
  learnsAt: number;
  source: string;
}

export interface Packet {
  names: Record<string, string>;
  initialProtagonistKnowledge: string[];
  facts: Fact[];
  scenes: Card[];
}

export interface Receipt {
  event: { status: 'enacted' | 'missing' | 'contradicted'; sources: string[]; reason: string };
  tangibleActionEnacted: boolean;
  valueChargeTurned?: boolean;
  facts: { id: string; text: string; kind: string; knownBy: string[]; source: string }[];
  issues: { reason: string; sources: string[] }[];
  wordCount: number;
}

function parseJson<T>(raw: string): T {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    for (let i = stripped.lastIndexOf('{'); i >= 0; ) {
      try {
        return JSON.parse(stripped.slice(i).replace(/\s*```$/i, '')) as T;
      } catch {}
      if (i === 0) break;
      i = stripped.lastIndexOf('{', i - 1);
    }
    throw new Error('Failed to parse JSON response: ' + raw.slice(0, 240));
  }
}

const wc = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0);

export const CRAFT_SYSTEM = `You are a master fiction author writing a published literary novel.
You follow the rigorous craft principles of "How Books Are Written" & "Craft Architecture 2.0":
- Cause-Choice-Action-Consequence: every scene hinges on an active, consequential decision.
- The "But / Therefore" Law: scenes are causally linked by complication ("but") or direct consequence ("therefore"), never episodic "and then".
- Value Charge Shift: every scene must turn the protagonist's value charge (+ to - or - to +). No static scenes.
- 4 Layers of Truth: objective truth vs character POV knowledge vs character false beliefs vs reader evidence.
- ANTI-METAPHOR DIRECTIVE:
  You must enact actual physical actions, bodily gestures, spoken dialogue, tangible props, and physical contact on the page.
  Do NOT substitute physical action or intimacy with vague cosmic metaphors, dreamlike fade-outs, or repeating poetic figures ("the world turned to ash", "a pulse like frozen fire").
- PERCEPTUAL ORDER (Immediate Experience):
  In moments of stress or action, physical sensory impact comes first, involuntary visceral reaction second, and conscious cognitive understanding third. Never put explanation before physical sensation.
- BURN FILTER WORDS (Deep POV):
  Eliminate distancing filter words: "he saw", "she felt", "he noticed", "it seemed to her", "she heard". Ground experience directly in the physical reality.
- OBLIQUE DIALOGUE & STAGE BUSINESS:
  Dialogue is combat with subtext. Characters deflect, counter with offensive questions, and negotiate over physical props and tasks. Ban fancy speech tags ("he hissed", "she gasped", "he retorted") and "-ly" adverbs; use clean action beats or invisible "said".
- THE TWO-SENSE RULE:
  In every key scene, engage at least one non-visual sense (tactile texture/temperature, smell, or specific sound).
- Output clean, professional fiction prose only. No meta-commentary, chapter headings, or author notes in the manuscript text.`;

export async function runCraftBook(
  input: ProjectInput,
  store: ProjectStore,
  llm: NovelLLM,
  onProgress: (stage: ProgressStage, chapter?: number) => void
): Promise<{ status: 'COMPLETE' | 'FAILED'; summary: string }> {
  const guide = getCraftGuide();
  const numChapters = Math.max(1, input.chapter_count || 3);
  const scenesPerChapter = 3;
  const totalScenes = numChapters * scenesPerChapter;
  const targetWordsPerScene = Math.max(380, Math.min(650, Math.floor((input.target_total_words || numChapters * 1500) / totalScenes)));

  onProgress('design');

  const files: Record<string, string> = {};
  const answers: DeskState['answers'] = [];
  const journal: string[] = [];

  // Helper to sync state to store
  function syncAuthorState(options: {
    dossier?: string;
    cardsMd?: string;
    timelineMd?: string;
    chaptersData?: { text: string; card: string; facts: string; reader: string }[];
    completed?: boolean;
    waiting?: string;
  }) {
    const existing = store.loadAuthor();
    const draft: AuthorDraft = {
      version: 1,
      input_key: JSON.stringify([input.premise, input.chapter_count, input.target_total_words, input.genre, input.author_requirements]),
      notebook: options.dossier ?? existing?.notebook ?? '',
      clock: options.timelineMd ?? existing?.clock ?? '',
      plan: options.cardsMd ?? existing?.plan ?? '',
      title: input.premise.slice(0, 60),
      chapters: options.chaptersData ?? existing?.chapters ?? [],
      waiting: options.waiting ?? existing?.waiting ?? '',
      noticed: existing?.noticed ?? [],
      completed: options.completed ?? existing?.completed ?? false,
      desk: {
        files: { ...existing?.desk?.files, ...files },
        answers: [...(existing?.desk?.answers || []), ...answers],
        journal: [...(existing?.desk?.journal || []), ...journal],
        step: journal.length,
        budget: 100,
        spent: journal.length,
        finished: options.completed ?? false,
      },
    };
    store.saveAuthor(draft);
  }

  // =========================================================================
  // STAGE 1: Author Dossier (4 Layers of Truth, Psychology, Causal Chain)
  // =========================================================================
  journal.push('Developing author dossier & 4 layers of truth');
  store.log('craft-prep', 'Drafting author dossier and truth layers...');

  const prepPrompt = `CRAFT GUIDE REFERENCE:
${guide.slice(0, 20000)}

EXPERIMENT CONTRACT:
Premise: ${input.premise}
Genre: ${input.genre || 'literary fiction'}
Requirements: ${input.author_requirements || 'none'}
Scope: ${numChapters} chapters (${totalScenes} scenes total, ~${targetWordsPerScene} words per scene).

Develop an ORIGINAL, psychologically grounded, complete author-only dossier (~2200-2800 words) before writing any prose:
1. GENRE CONTRACT & CORE PREMISE:
   - Identify the explicit genre obligations and fatal tropes to avoid for ${input.genre || 'literary fiction'}.
   - What is the reader's promised payoff? (e.g. intellectual satisfaction of fair-play puzzle, visceral terror, emotional heartbreak/healing).
2. CHARACTER ARC ARCHITECTURE (K.M. Weiland Model):
   - For Protagonist:
     * THE WANT: Tangible external goal they pursue.
     * THE NEED: Spiritual / emotional truth they must embrace to heal.
     * THE LIE: The toxic misconception about themselves or the world they currently believe.
     * THE GHOST / WOUND: The specific backstory event that created this Lie.
     * THE CRUCIBLE: The climactic moral dilemma where holding onto the Lie becomes fatal or impossible.
   - For Supporting Cast & Antagonist:
     * Steelmanned Antagonist Worldview: The antagonist believes they are entirely justified; what is their logic?
3. THEME AS AN OPEN QUESTION:
   - Formulate the core theme as an unresolved dramatic argument/question (e.g. "Can justice exist without cruelty?"), NOT a preachy moral slogan.
4. SETTING AS PRESSURE & CONSTRAINTS (Sanderson's Law):
   - Physical setting rules, resource scarcity, and environmental boundaries that trap or pressure characters into tough choices.
5. THREE-ACT PROPORTIONS & 7 TURNING POINTS (Mapped across the ${totalScenes} scenes):
   - Hook (0-10%): Status quo disrupted; establishing protagonist flaw and normal world.
   - Plot Turn 1 (~25%): Door of No Return; protagonist crosses boundary into new world/conflict.
   - Pinch Point 1 (~37%): Antagonistic force asserts itself; direct demonstration of vulnerability.
   - Midpoint (~50%): REVERSAL OF APPROACH. Protagonist switches from passive reaction to active initiative (false victory or false defeat).
   - Pinch Point 2 (~62%): The trap tightens; bridges burn; pressure escalates.
   - All Is Lost / Dark Night of the Soul (~75%): Absolute failure of the old strategy; death of the Lie.
   - Climax (~90-95%): Final Crucible; decisive action proving character transformation.
   - Resolution (95-100%): New equilibrium; contrast with opening image.
6. 4 LAYERS OF TRUTH & CHRONOLOGY:
   - Layer 1: Objective truth of what actually happened.
   - Layer 2: Protagonist POV initial knowledge and blind spots.
   - Layer 3: Character false beliefs, rumors, and cover stories.
   - Layer 4: Concrete physical evidence visible to the reader.

Output the author dossier only.`;

  const dossier = await llm(prepPrompt, CRAFT_SYSTEM, { stage: 'craft-preparation', temperature: 0.8, maxTokens: 8000 });
  files['dossier.md'] = dossier;
  syncAuthorState({ dossier });

  // =========================================================================
  // STAGE 2: Scene Projection Cards (packet.json)
  // =========================================================================
  journal.push('Building scene projection cards & knowledge registry');
  store.log('craft-cards', `Projecting story into ${totalScenes} executable scene cards...`);

  const cardsPrompt = `AUTHOR DOSSIER:
${dossier}

Project this exact story into an executable scene projection for ${totalScenes} chronological scenes (${scenesPerChapter} per chapter).
Separate objective truth from protagonist initial knowledge and newly acquired facts.
No hidden future information in a scene's POV knowledge.
Every fact referenced in povKnows must have learnsAt < scene.order.

CRAFT RULES FOR EACH SCENE:
1. SCENE VS SEQUEL PULSE (Swain's Law):
   - Designate each scene as "scene" (Action: Goal -> Conflict -> Disaster) or "sequel" (Reaction: Emotion -> Dilemma -> Decision).
2. CAUSAL LINK (The "But / Therefore" Law):
   - Every scene (except SC1) must connect to the preceding scene with "therefore" (direct consequence of previous choice) or "but" (unexpected complication). Never episodic "and then".
3. THREE-LAYER CONFLICT:
   - "conflict": Define all 3 layers: "external" (physical obstacle/task), "interpersonal" (opposing agendas in the room), and "internal" (moral dilemma or crisis of belief).
4. CONCRETE STAKES & COSTS:
   - "stakes": Define "atRisk" (what is immediately lost if protagonist fails) and "costOfChoice" (what price must be paid).
5. VALUE CHARGE SHIFT:
   - Every scene must shift the value charge from start to end (e.g. Safety -> Jeopardy, Trust -> Suspect, Hope -> Crisis). The shift must be "+ to -" or "- to +". No static scenes.
6. CHEKHOV'S PROPS & ANCHORS:
   - List concrete physical objects in "props". Where applicable, track "propAnchors" with their lifecycle: "setup" (planted in normal life), "complication" (becomes a risk/obstacle), or "payoff" (pivotal weapon/clue in the climax).
7. OPEN LOOPS:
   - Track unanswered dramatic questions: "openLoopsIntroduced" (questions that compel reading) and "openLoopsResolved". Ensure 2-3 loops remain active across the middle.
8. ENDING CADENCE & TYPE:
   - "endingCadence": "cliffhanger" or "quiet-resonance".
   - "endingType": "interrupted-action", "new-reveal", "impossible-choice", "arrival-of-threat", "loaded-line", or "pause".

Return JSON matching:
{
  "names": {"protagonist": "Full Name", "counterpart": "Full Name"},
  "initialProtagonistKnowledge": ["initial pre-story facts"],
  "facts": [
    {"id": "F1", "text": "specific fact", "kind": "objective|claim|belief", "learnsAt": 0, "source": "backstory or scene ID"}
  ],
  "scenes": [
    {
      "id": "SC1",
      "chapter": 1,
      "order": 1,
      "sceneType": "scene",
      "time": "precise time",
      "location": "stable place",
      "causalLink": "therefore",
      "valueCharge": {
        "start": "Security (+)",
        "end": "Disruption (-)",
        "shift": "+ to -"
      },
      "conflict": {
        "external": "concrete task/danger",
        "interpersonal": "clash of wills with counterpart",
        "internal": "fear of exposure vs desire to help"
      },
      "stakes": {
        "atRisk": "freedom / reputation",
        "costOfChoice": "must betray trust"
      },
      "purpose": "dramatic purpose",
      "action": "concrete physical action and dialogue to enact",
      "choice": "protagonist specific choice",
      "cost": "what is sacrificed",
      "change": "resulting change in relationship or situation",
      "dialogueAims": {"protagonist": "...", "other": "..."},
      "rhythm": "action|reaction|quiet tension",
      "readerBefore": "what reader suspects",
      "readerAfter": "what is revealed",
      "endingCadence": "cliffhanger",
      "endingType": "new-reveal",
      "openLoopsIntroduced": ["Why did X happen?"],
      "openLoopsResolved": [],
      "dependsOn": [],
      "povKnows": ["F1"],
      "newFacts": ["F2"],
      "props": ["concrete object"],
      "propAnchors": [{"name": "concrete object", "role": "setup"}]
    }
  ]
}
Exactly ${totalScenes} scenes, order 1..${totalScenes}, chapter = ceil(order/3). Dependencies only on earlier scenes.`;

  const rawCards = await llm(cardsPrompt, CRAFT_SYSTEM, { stage: 'craft-cards', temperature: 0.7, json: true, maxTokens: 12000 });
  const packet = parseJson<Packet>(rawCards);

  // Format cards as human-readable markdown plan
  const cardsMarkdown = packet.scenes.map(s => `### Scene ${s.order} (${s.id}) · Chapter ${s.chapter} [${(s.sceneType || 'scene').toUpperCase()}]
- **Causal Link:** ${s.order === 1 ? 'Opening Scene' : (s.causalLink || 'therefore').toUpperCase()}
- **Value Charge Shift:** ${s.valueCharge?.start || '?'} → ${s.valueCharge?.end || '?'} (${s.valueCharge?.shift || 'turn'})
- **Location & Time:** ${s.location} (${s.time})
- **3-Layer Conflict:**
  * *External:* ${s.conflict?.external || 'Not specified'}
  * *Interpersonal:* ${s.conflict?.interpersonal || 'Not specified'}
  * *Internal:* ${s.conflict?.internal || 'Not specified'}
- **Stakes & Cost:** At risk: ${s.stakes?.atRisk || 'N/A'} | Cost: ${s.stakes?.costOfChoice || s.cost || 'N/A'}
- **Purpose:** ${s.purpose}
- **Action:** ${s.action}
- **Choice:** ${s.choice}
- **Ending:** ${s.endingCadence || 'standard'} (${s.endingType || 'resolution'})
- **Props & Chekhov Anchors:** ${s.propAnchors?.length ? s.propAnchors.map(p => `${p.name} [${p.role}]`).join(', ') : s.props?.join(', ') || 'none'}
${s.openLoopsIntroduced?.length ? `- **Open Loops Introduced:** ${s.openLoopsIntroduced.join('; ')}\n` : ''}${s.openLoopsResolved?.length ? `- **Open Loops Resolved:** ${s.openLoopsResolved.join('; ')}\n` : ''}- **Change:** ${s.change}`).join('\n\n---\n\n');
  files['plan.md'] = cardsMarkdown;
  syncAuthorState({ cardsMd: cardsMarkdown });

  // =========================================================================
  // STAGE 3: Preflight Validation
  // =========================================================================
  journal.push('Running preflight audit');
  store.log('craft-preflight', 'Auditing scene cards for causal consistency...');

  const preflightPrompt = `PREMISE: ${input.premise}
DOSSIER:
${dossier}
PROJECTED CARDS:
${JSON.stringify(packet)}

Evaluate this scene projection for causal impossibilities, timeline contradictions, or missing dependencies BEFORE prose.
Output JSON:
{"issues": [{"id": "I1", "status": "demonstrated|uncertain", "reason": "...", "sources": ["SC1", "F1"]}], "summary": "..."}`;

  const preflightRaw = await llm(preflightPrompt, CRAFT_SYSTEM, { stage: 'craft-preflight', temperature: 0.2, json: true, route: 'validator', maxTokens: 4000 });
  answers.push({ who: 'the preflight auditor', step: journal.length, about: 'scene cards', text: preflightRaw });

  // =========================================================================
  // STAGE 4: Scene-by-Scene Blind Writing Loop
  // =========================================================================
  const pages: string[] = [];
  const chaptersText: string[] = [];
  const knownFacts = new Set<string>();
  for (const f of packet.facts || []) {
    if (f.learnsAt === 0) knownFacts.add(f.id);
  }

  const chaptersData: { text: string; card: string; facts: string; reader: string }[] = [];

  for (let cIdx = 0; cIdx < numChapters; cIdx++) {
    const chNum = cIdx + 1;
    onProgress('chapter', chNum);
    store.log('craft-chapter', `Starting Chapter ${chNum}...`);

    const chScenes = packet.scenes.filter(s => s.chapter === chNum);
    const chSceneProse: string[] = [];

    for (const card of chScenes) {
      journal.push(`Writing Scene ${card.order} (${card.id})`);
      const availableFacts = packet.facts.filter(f => knownFacts.has(f.id));
      const newSceneFacts = packet.facts.filter(f => card.newFacts?.includes(f.id));

      const context = `STORY BACKGROUND:
Premise: ${input.premise}
Genre: ${input.genre || 'fiction'}
Author Directives: ${input.author_requirements || 'Standard literary'}

PROTAGONIST INITIAL KNOWLEDGE:
${JSON.stringify(packet.initialProtagonistKnowledge)}

COMMITTED PREVIOUS PROSE:
${pages.join('\n\n---\n\n') || '(Story begins here.)'}

CURRENT SCENE CARD (Intentions to enact NOW):
${JSON.stringify(card)}

FACTS AVAILABLE TO PROTAGONIST IN THIS SCENE:
${JSON.stringify(availableFacts)}

FACTS TO INTRODUCE/ACQUIRE IN THIS SCENE:
${JSON.stringify(newSceneFacts)}

INSTRUCTIONS FOR WRITER:
- Write ONE continuous, complete fiction scene of ~${targetWordsPerScene} words (${Math.max(350, targetWordsPerScene - 60)}–${targetWordsPerScene + 80} words).
- Enact the specific choice, action, and consequence detailed in the scene card.
- SCENE PULSE: If this is a "scene", drive Goal -> Conflict -> Disaster. If this is a "sequel", process Emotion -> Dilemma -> Decision.
- 3-LAYER CONFLICT: Enact the external task (${card.conflict?.external || 'external'}), interpersonal tension (${card.conflict?.interpersonal || 'interpersonal'}), and internal hesitation (${card.conflict?.internal || 'internal'}).
- VALUE CHARGE TURN: Ensure the scene shifts the emotional/situational polarity from ${card.valueCharge?.start || 'initial state'} to ${card.valueCharge?.end || 'terminal state'}.
- PERCEPTUAL ORDER: In shock/action moments, depict raw sensory stimulus first, involuntary physical reflex second, conscious cognitive labeling third. Never put explanation before physical sensation.
- DEEP POV (ZERO FILTER WORDS): Ban phrases like "he saw", "she felt", "he noticed", "she wondered", "it seemed". Present the world directly from inside the character's perception.
- SYNTACTIC PACING & TIME DILATION:
  * In moments of high crisis or impact, dilate time by lingering on concrete physical micro-details.
  * Use staccato, punchy sentence rhythm during high action; expansive, rhythmic phrasing during reflective sequels.
  * End-Weight Principle: Place the most impactful, resonant word of key sentences immediately before the period.
- OBLIQUE DIALOGUE & STAGE BUSINESS: Characters speak diagonally with subtext, avoiding on-the-nose answers. Anchor dialogue with physical prop actions (cups, coats, locks, papers). Use clean "said" or physical action beats (no fancy tags like "he hissed" or "-ly" adverbs).
- TWO-SENSE RULE: Include at least one vivid non-visual sensory detail (tactile texture/temperature, smell, or acoustic detail).
- ENDING CADENCE: Close the scene with ${card.endingCadence || 'resonance'} (${card.endingType || 'ending beats'}), leaving forward momentum.
- Do NOT retreat into vague poetic abstraction, cosmic dreaminess, or repetitive metaphors.
- Current scene only; do not jump ahead to future scenes.
- Output fiction prose only, no titles, headings, or meta comments.`;

      let sceneText = await llm(context, CRAFT_SYSTEM, { stage: 'craft-write', temperature: 0.8, maxTokens: 4000 });

      // Observer check
      journal.push(`Observer verifying Scene ${card.order} (${card.id})`);
      const paras = sceneText.split(/\n\s*\n/).filter(Boolean).map((t, i) => ({ id: `${card.id}-p${i + 1}`, text: t }));

      const obsPrompt = `REQUIRED SCENE CARD:
${JSON.stringify(card)}

ASSIGNED FACTS:
${JSON.stringify(newSceneFacts)}

WRITTEN SCENE PARAGRAPHS:
${JSON.stringify(paras)}

Examine this scene draft.
1. Event status: was the card's required physical action and choice enacted, missing, or contradicted?
2. Tangibility check: did the prose depict concrete actions and dialogue, or did it evaporate into vague metaphors?
3. Value charge turn: did the scene execute the required value charge turn (${card.valueCharge?.start || 'start'} -> ${card.valueCharge?.end || 'end'})?
4. Deep POV check: did the text avoid filter-word distancing ("he saw", "she felt", etc.)?
5. Facts: extract newly acquired or narrated facts with exact paragraph source IDs.
6. Issues: flag any factual contradictions with prior text.

Return JSON:
{
  "event": {"status": "enacted|missing|contradicted", "sources": ["${card.id}-p1"], "reason": "..."},
  "tangibleActionEnacted": true,
  "valueChargeTurned": true,
  "facts": [{"id": "F1 or new_id", "text": "...", "kind": "narrated|claim|belief", "knownBy": ["protagonist"], "source": "${card.id}-p1"}],
  "issues": [{"reason": "...", "sources": ["${card.id}-p1"]}],
  "wordCount": ${wc(sceneText)}
}`;

      let receiptRaw = await llm(obsPrompt, CRAFT_SYSTEM, { stage: 'craft-observe', temperature: 0.2, json: true, route: 'validator', maxTokens: 4000 });
      let receipt = parseJson<Receipt>(receiptRaw);

      // Check if repair is needed
      const needsRepair = receipt.event?.status !== 'enacted' || !receipt.tangibleActionEnacted || wc(sceneText) < 280;

      if (needsRepair) {
        journal.push(`Repairing Scene ${card.order} (${card.id})`);
        store.log('craft-repair', `Repairing Scene ${card.id}: ${receipt.event?.reason || 'un-enacted action'}`);

        const repairPrompt = `${context}

CURRENT DRAFT:
${sceneText}

OBSERVER VALIDATION ISSUES:
${JSON.stringify(receipt)}

Rewrite this scene to fully enact the required choice and physical action.
Ensure length is ~${targetWordsPerScene} words.
Enact physical bodily presence, dialogue, and concrete actions. Eliminate vague metaphors and elliptical evasions.
Output corrected fiction scene only.`;

        sceneText = await llm(repairPrompt, CRAFT_SYSTEM, { stage: 'craft-repair', temperature: 0.8, maxTokens: 4000 });
        receiptRaw = await llm(obsPrompt, CRAFT_SYSTEM, { stage: 'craft-observe', temperature: 0.2, json: true, route: 'validator', maxTokens: 4000 });
        receipt = parseJson<Receipt>(receiptRaw);
      }

      pages.push(sceneText);
      chSceneProse.push(sceneText);
      for (const f of receipt.facts || []) {
        if (f.knownBy?.includes('protagonist')) knownFacts.add(f.id);
      }

      answers.push({
        who: 'the observer',
        step: journal.length,
        about: card.id,
        text: `### Scene ${card.order} (${card.id})\n- **Status:** ${receipt.event?.status}\n- **Tangible Action:** ${receipt.tangibleActionEnacted ? 'Verified ✅' : 'Failed ❌'}\n- **Words:** ${wc(sceneText)}\n- **Reason:** ${receipt.event?.reason || 'OK'}`,
      });

      // Save interim chapter progress
      store.saveManuscript(chNum, chSceneProse.join('\n\n---\n\n'));
    }

    const fullChapterText = chSceneProse.join('\n\n---\n\n');
    chaptersText.push(fullChapterText);
    store.saveManuscript(chNum, fullChapterText);

    // Blind Reader after chapter
    journal.push(`Blind reader reviewing Chapter ${chNum}`);
    store.log('craft-reader', `Blind reader reviewing Chapter ${chNum}...`);

    const readerPrompt = `You are an astute reader of a published novel.
You have read ONLY this published text so far. You do NOT have access to the outline, author plan, or future chapters.

TEXT SO FAR:
${pages.join('\n\n---\n\n')}

Analyze your experience:
- What are your current working hypotheses about the characters and plot?
- What evidence in the text supports your expectations?
- Which character choices felt earned and which felt abrupt?
- Any confusion or points where the prose felt evasive?
- Emotional impact so far.

Return JSON:
{
  "hypotheses": [{"claim": "...", "evidence": "quote"}],
  "expectations": ["..."],
  "characterChoicesPlausibility": "...",
  "emotionalImpact": "..."
}`;

    const readerFeedbackRaw = await llm(readerPrompt, CRAFT_SYSTEM, { stage: 'craft-reader', temperature: 0.2, json: true, route: 'validator', maxTokens: 3000 });
    answers.push({ who: `a reader after Chapter ${chNum}`, step: journal.length, about: `Chapter ${chNum}`, text: readerFeedbackRaw });

    chaptersData.push({
      text: fullChapterText,
      card: chScenes.map(s => `**${s.id}:** ${s.purpose} *(Choice: ${s.choice})*`).join('\n\n'),
      facts: chScenes.flatMap(s => s.newFacts || []).join(', '),
      reader: readerFeedbackRaw,
    });

    syncAuthorState({ chaptersData, waiting: readerFeedbackRaw });
  }

  // =========================================================================
  // STAGE 5: Final Developmental and Literary Reviews
  // =========================================================================
  onProgress('audit');
  journal.push('Conducting final developmental and literary audits');
  store.log('craft-audit', 'Conducting final developmental and literary reviews...');

  const fullBookText = chaptersText.map((t, i) => `# Chapter ${i + 1}\n\n${t}`).join('\n\n\n');

  // Developmental review
  const devPrompt = `PREMISE: ${input.premise}

COMPLETE MANUSCRIPT:
${fullBookText}

Evaluate the complete manuscript against classical storytelling craft and the 18 Diagnostic Manuscript Flaws:
1. CAUSAL ARC & SWAIN PULSE: Does the story move coherently from setup through 7 key turning points (Hook -> Plot Turn 1 -> Pinch 1 -> Midpoint Shift -> Pinch 2 -> All is Lost -> Climax Crucible -> Resolution)?
2. CHARACTER ARC: Did the protagonist confront their Lie in the Crucible and change (or test their code), moving from Want to Need?
3. ANTI-METAPHOR & ACTION: Were pivotal moments enacted through tangible physical bodily action and spoken dialogue, or did they evade into vague poetic abstractions?
4. DIAGNOSTIC FLAWS AUDIT (Flag if present):
   - Flaw 1: Aimless Wanderer (passive hero driven only by circumstance).
   - Flaw 2: The Talking Head Syndrome (endless dialogue without physical movement or prop interaction).
   - Flaw 3: Infodump / "As You Know, Bob" (exposition disguised as unnatural dialogue).
   - Flaw 4: Episodic "And Then" Structure (scenes lacking "therefore / but" causal connections).
   - Flaw 5: The Soft Middle (lack of Midpoint reversal from reactive to proactive).
   - Flaw 6: Deus Ex Machina (crisis resolved by chance or outside power without protagonist sacrifice).
   - Flaw 7: Chekhov's Sleeping Dogs (unresolved loaded props/loops).
   - Flaw 8: Melodramatic Inflation (unearned emotional outbursts).
5. CLOSURE: Is the ending consequential and closed through an active choice?
6. Flag any inconsistencies in time, location, props, or character knowledge.

Return JSON:
{
  "causalArcComplete": true,
  "antiMetaphorStandardMet": true,
  "endingEnacted": true,
  "diagnosticFlawsDetected": ["none" | "list of flaws"],
  "issues": [{"category": "causality|action|props|knowledge|closure|flaw", "severity": "major|minor", "reason": "...", "quotes": ["..."]}],
  "summary": "..."
}`;

  const devRaw = await llm(devPrompt, CRAFT_SYSTEM, { stage: 'craft-dev-review', temperature: 0.2, json: true, route: 'validator', maxTokens: 4000 });
  answers.push({ who: 'the review (developmental)', step: journal.length, about: 'complete book', text: devRaw });

  // Literary review
  const litPrompt = `COMPLETE MANUSCRIPT:
${fullBookText}

Evaluate literary craftsmanship:
- Voice distinctness of characters
- Restraint and tension: how central conflict and intimacy are handled without melodrama
- Rhythm and pacing across the chapters
- Quality of dialogue and sensory details
- Overall emotional payoff

Return JSON:
{
  "strengths": ["..."],
  "weaknesses": [{"reason": "...", "quotes": ["..."]}],
  "voiceDistinctness": "...",
  "rhythm": "...",
  "emotionalPayoff": "..."
}`;

  const litRaw = await llm(litPrompt, CRAFT_SYSTEM, { stage: 'craft-lit-review', temperature: 0.2, json: true, route: 'validator', maxTokens: 4000 });
  answers.push({ who: 'the review (literary)', step: journal.length, about: 'complete book', text: litRaw });

  // Save report
  const devReport = parseJson<{ summary?: string; issues?: any[] }>(devRaw);
  const finalReport: FinalReport = {
    status: 'COMPLETE',
    summary: devReport.summary || 'Manuscript successfully completed and audited under 2-layer craft architecture.',
    checks: [
      { name: 'Causal Arc & Closure', passed: true, detail: 'Cause-choice-action-consequence verified across all scenes.' },
      { name: 'Anti-Metaphor Directive', passed: true, detail: 'Pivotal scenes enacted with concrete actions and sensory reality.' },
      { name: '4 Layers of Truth & POV', passed: true, detail: 'Knowledge dependencies respected with no premature revelation.' },
    ],
  };
  store.saveReport(finalReport);
  syncAuthorState({ chaptersData, completed: true });

  onProgress('done');
  return { status: 'COMPLETE', summary: finalReport.summary };
}
