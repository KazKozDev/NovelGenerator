import { indexManuscriptBlocks, hybridSearch, ManuscriptBlock } from './hybridSearch';
import { buildEntityGraph, checkCrossTextImpact, EntityGraph } from './entityGraph';
import { applySearchReplacePatch, cleanDiffArtifacts } from './patchApplier';
import { findSuspects, openQuestions, pacingSuspects } from './chapterRecords';
import { cachedSkeletons, chapterSkeleton, chapterSkeletons, checkSuspects, findRepeats, cachedRecords, knowledgeByPair, linesAbout, formatRepeats, readBlocks, readBookNotes, durationMentions, durationSuspects, formatDurations } from './editorialTools';

const EDITORIAL_TOOLS = ['search_manuscript', 'inspect_dependencies', 'propose_diff', 'find_repeats', 'read_blocks', 'chapter_skeleton', 'check_suspects'] as const;

export interface ParsedToolCall {
  tool: typeof EDITORIAL_TOOLS[number];
  args: Record<string, any>;
}

export interface ProposedDiffCard {
  id: string;
  chapterNum: number;
  startBlockId?: string;
  endBlockId?: string;
  searchTarget: string;
  replacementText: string;
  rationale: string;
  warnings: string[];
}

/** A kept problem from a review, with the places it rests on and the ways the author could close it. */
export interface EditorialProblem {
  id: string;
  title: string;
  places: string[];
  ways: string[];
}

export interface EditorialAgentResponse {
  assistantMessage: string;
  diffCards: ProposedDiffCard[];
  executedTools: { tool: string; summary: string }[];
  problems: EditorialProblem[];
}

/** 'skeletons': the plot review; 'repeats': what the book tells twice; 'pacing': whether the story moves. All show skeletons, not prose. */
export type EditorialView = 'full' | 'skeletons' | 'repeats' | 'pacing';

const PROBLEM_BLOCK = /```problem\s*\r?\n([\s\S]*?)\r?\n```/gi;
const DROPPED_BLOCK = /```dropped\s*\r?\n([\s\S]*?)\r?\n```/gi;

/** A suspect a review dropped, with the quote it says clears it. */
export interface DroppedSuspect { title: string; places: string[]; quote: string }

export function parseDropped(text: string): DroppedSuspect[] {
  const dropped: DroppedSuspect[] = [];
  for (const match of text.matchAll(DROPPED_BLOCK)) {
    try {
      const raw = JSON.parse(match[1]);
      if (typeof raw?.title !== 'string' || !raw.title.trim()) continue;
      dropped.push({ title: raw.title.trim(), places: Array.isArray(raw.places) ? raw.places.filter((x: unknown) => typeof x === 'string') : [], quote: typeof raw.quote === 'string' ? raw.quote : '' });
    } catch {
      // A malformed block is treated as a drop with no quote: it stays kept.
    }
  }
  return dropped;
}

const plainQuote = (text: string) => text.toLowerCase().replace(/[“”«»„]/g, '"').replace(/[‘’]/g, "'").replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();

/** Whether a quote stands in the book word for word (fragments around an ellipsis each must). */
export function quoteInBook(quote: string, book: string): boolean {
  const text = plainQuote(book);
  const fragments = plainQuote(quote).replace(/^["'\s]+|["'\s]+$/g, '').split(/…|\.\.\./).map(f => f.trim().replace(/^["'\s,;:]+|["'\s,;:]+$/g, '')).filter(f => f.length >= 8);
  return plainQuote(quote).length >= 15 && fragments.length > 0 && fragments.every(f => text.includes(f));
}

/** Paragraph ids a list of places covers; "ch3_p12-ch3_p15" stands for every paragraph between. */
export function expandPlaces(places: string[]): string[] {
  return places.flatMap(place => {
    const [from, to] = String(place).split(/\s*(?:-|–|\.\.)\s*/);
    const a = from?.match(/ch(\d+)_p(\d+)/);
    const b = to?.match(/ch(\d+)_p(\d+)/);
    if (!a) return [];
    if (!b || a[1] !== b[1]) return [`ch${a[1]}_p${a[2]}`];
    const [start, end] = [Number(a[2]), Number(b[2])].sort((x, y) => x - y);
    return Array.from({ length: Math.min(end - start + 1, 50) }, (_, i) => `ch${a[1]}_p${start + i}`);
  });
}

/** A drop stands when its quote is in the book, or in the author's notes (what the author meant, such as a planned lie). */
export function clearingQuote(drop: { quote: string }, book: string, notes = ''): 'ok' | 'missing' {
  return quoteInBook(drop.quote, book) || (notes !== '' && quoteInBook(drop.quote, notes)) ? 'ok' : 'missing';
}

/** Passages that stand twice in the text itself (two paragraphs or more): a pasted scene. */
export function repeatSuspects(blocks: ManuscriptBlock[]): { claim: string; places: string[] }[] {
  return findRepeats(blocks).passages.filter(p => p.paragraphs >= 2).map(p => ({
    claim: `A passage stands twice in the text: ${p.first[0]}..${p.first[1]} and ${p.second[0]}..${p.second[1]} (${p.paragraphs} paragraphs)`,
    places: [`${p.first[0]}-${p.first[1]}`, `${p.second[0]}-${p.second[1]}`],
  }));
}

/** Every suspicion code makes before the reader: checks over the chapter records, and passages repeated in the text. */
export function codeSuspects(blocks: ManuscriptBlock[]) {
  return [...repeatSuspects(blocks), ...findSuspects(cachedRecords(blocks)), ...durationSuspects(durationMentions(blocks))].slice(0, 15);
}

/** Everything code finds told twice, for the Repeats review: passages of any length, and sentences said more than once. */
export function codeRepeatSuspects(blocks: ManuscriptBlock[]): { claim: string; places: string[] }[] {
  const found = findRepeats(blocks);
  return [
    ...found.passages.map(p => ({
      claim: `A passage stands twice in the text: ${p.first[0]}..${p.first[1]} and ${p.second[0]}..${p.second[1]} (${p.paragraphs} paragraph${p.paragraphs > 1 ? 's' : ''})`,
      places: [`${p.first[0]}-${p.first[1]}`, `${p.second[0]}-${p.second[1]}`],
    })),
    ...found.sentences.map(s => ({ claim: `A sentence said ${s.blockIds.length} times: "${s.sentence}"`, places: s.blockIds })),
  ].slice(0, 15);
}

/** A review view: the book comes as chapter skeletons, code's suspicions come with their passages, and kept problems must be checked. */
const isReview = (view?: EditorialView) => view === 'skeletons' || view === 'repeats' || view === 'pacing';
const lastParagraph = (blocks: ManuscriptBlock[]) => (chapter: number) => Math.max(-1, ...blocks.filter(b => b.chapterNum === chapter).map(b => b.pIndex));
const suspectsFor = (blocks: ManuscriptBlock[], view?: EditorialView) =>
  view === 'repeats' ? codeRepeatSuspects(blocks)
    : view === 'pacing' ? pacingSuspects(cachedRecords(blocks), lastParagraph(blocks))
      : codeSuspects(blocks);

// What each review looks for, in the words its prompt uses.
const REVIEW_FOCUS: Record<string, string> = {
  skeletons: 'a plot hole hides in prose',
  repeats: 'a scene told twice shows in what the chapters state',
  pacing: 'whether the story moves shows in what changes from scene to scene',
};
const SUSPECTS_FOUND: Record<string, string> = {
  skeletons: 'a passage standing twice in the text, two spans of time whose sentences share words, and checks over the chapter records: one event at two times, a name known then not recognized, an object with someone new',
  repeats: 'passages standing twice in the text, and sentences said more than once',
  pacing: 'checks over the chapter records: a long scene where no event is shown, nothing is learned, and no object changes hands, and an event shown and then told again',
};

export function parseProblems(text: string): EditorialProblem[] {
  const problems: EditorialProblem[] = [];
  for (const match of text.matchAll(PROBLEM_BLOCK)) {
    try {
      const raw = JSON.parse(match[1]);
      const strings = (value: unknown) => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
      if (typeof raw?.title !== 'string' || !raw.title.trim()) continue;
      problems.push({ id: `problem_${problems.length + 1}_${Math.random().toString(36).slice(2, 6)}`, title: raw.title.trim(), places: strings(raw.places), ways: strings(raw.ways) });
    } catch {
      // A malformed block stays out of the cards; its prose is still in the review.
    }
  }
  return problems;
}

/** What the Close button sends: the problem, the chosen way, and its places, as one linked set of patches. */
export function buildCloseProblemPrompt(problem: EditorialProblem, way: string): string {
  return `Fix this problem: ${problem.title}
Way to close it: ${way}
Its places: ${problem.places.join(', ') || 'not given'}.
Read the places first (check_suspects), then propose_diff blocks for every place that has to change, as one linked set. Change only these paragraphs and the sentences around them, keep the author's voice, and leave other scenes alone.`;
}

export function parseToolCallsFromModelResponse(text: string): ParsedToolCall[] {
  const tools: ParsedToolCall[] = [];
  const regex = /```(?:tool:([a-z_]+)|json\s*\(tool:([a-z_]+)\))\s*\r?\n([\s\S]*?)\r?\n```/gi;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const toolName = (match[1] || match[2]).toLowerCase().trim();
    const rawArgs = match[3].trim();
    try {
      const args = JSON.parse(rawArgs);
      if ((EDITORIAL_TOOLS as readonly string[]).includes(toolName)) {
        tools.push({ tool: toolName as any, args });
      }
    } catch {
      // Ignore malformed JSON in tool block
    }
  }

  // Also catch generic JSON format: {"tool": "search_manuscript", "args": {...}}
  if (tools.length === 0) {
    const jsonBlockRegex = /```json\s*\r?\n([\s\S]*?)\r?\n```/gi;
    while ((match = jsonBlockRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed?.tool && (EDITORIAL_TOOLS as readonly string[]).includes(parsed.tool)) {
          tools.push({ tool: parsed.tool, args: parsed.args || parsed });
        }
      } catch {}
    }
  }

  return tools;
}

export function extractTargetChapter(text: string): number | undefined {
  const numMatch = text.match(/(?:chapter|глав[аеыу])\s*(\d+)/i);
  if (numMatch) return parseInt(numMatch[1], 10);

  const wordMap: Record<string, number> = {
    перв: 1,
    втор: 2,
    трет: 3,
    четверт: 4,
    пят: 5,
    шест: 6,
    седьм: 7,
    восьм: 8,
    девят: 9,
    десят: 10,
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
  };

  const wordMatch =
    text.match(/(?:в\s+)?(перв\w*|втор\w*|трет\w*|четверт\w*|пят\w*|шест\w*|first|second|third|fourth|fifth)\s+глав\w*/i) ||
    text.match(/глав[аеыу]\s+(перв\w*|втор\w*|трет\w*|четверт\w*|пят\w*|шест\w*|first|second|third|fourth|fifth)/i);
  if (wordMatch) {
    const key = Object.keys(wordMap).find(k => wordMatch[1].toLowerCase().startsWith(k));
    if (key) return wordMap[key];
  }
  return undefined;
}

export function getMaxFullManuscriptChars(provider?: string): number {
  if (provider === 'anthropic' || provider === 'gemini') {
    // Claude (200k-1M context) & Gemini (1M-2M context) can comfortably handle complete novels
    return 1_500_000;
  }
  if (provider === 'compatible') {
    return 400_000;
  }
  // Local Ollama default
  return 120_000;
}

export function buildEditorialAgentPrompt(params: {
  userPrompt: string;
  manuscriptBlocks: ManuscriptBlock[];
  entityGraph: EntityGraph;
  history: { role: 'user' | 'assistant'; content: string }[];
  provider?: string;
  metadata?: any;
  /** 'skeletons' or 'repeats': the book is shown as chapter skeletons only; the text is read through tools. */
  view?: EditorialView;
}): { system: string; prompt: string } {
  const skeletonView = isReview(params.view);
  const repeatsView = params.view === 'repeats';
  const view = params.view || 'full';
  const chapterList = Array.from(new Set(params.manuscriptBlocks.map(b => b.chapterNum))).sort((a, b) => a - b);
  const targetChapter = extractTargetChapter(params.userPrompt);

  const totalLength = params.manuscriptBlocks.reduce((acc, b) => acc + b.text.length, 0);
  const maxFullChars = getMaxFullManuscriptChars(params.provider);

  // Retrieve relevant excerpts from manuscript for the user prompt
  const initialMatches = hybridSearch(params.manuscriptBlocks, params.userPrompt, targetChapter, 5);
  let contextSnippets = '';
  if (initialMatches.length > 0) {
    contextSnippets = `RELEVANT SEARCH MATCHES FOR QUERY:\n` +
      initialMatches.map(m => `[Chapter ${m.chapterNum}, Block ${m.blockId}]:\n"${m.fullText}"`).join('\n\n');
  }

  // Cross-chapter entity map
  const multiChapterEntities: string[] = [];
  for (const [name, ref] of params.entityGraph.entities.entries()) {
    const chapters = Array.from(new Set(ref.occurrences.map(o => o.chapterNum)));
    if (chapters.length > 1) {
      multiChapterEntities.push(`- "${name}" (${ref.category}): appears across Chapters ${chapters.join(', ')}`);
    }
  }
  const entitySummary = multiChapterEntities.length > 0
    ? `CROSS-CHAPTER ENTITY MAP:\n${multiChapterEntities.slice(0, 20).join('\n')}`
    : '';

  // Manuscript text visibility:
  // For Claude/Gemini, novels up to 1.5M chars (~300k words) are fed 100% in full.
  let manuscriptText = '';
  if (skeletonView) {
    const inventory = chapterList.map(ch => {
      const b = params.manuscriptBlocks.filter(x => x.chapterNum === ch);
      return `- Chapter ${ch}: paragraphs ch${ch}_p0..ch${ch}_p${b.length - 1}`;
    }).join('\n');
    manuscriptText = `CHAPTER INVENTORY (read any text through check_suspects or read_blocks):\n${inventory}`;
  } else if (totalLength <= maxFullChars) {
    const allChapters = chapterList.map(chNum => {
      const chBlocks = params.manuscriptBlocks.filter(b => b.chapterNum === chNum);
      const lines = chBlocks.map(b => `[${b.id}]: ${b.text}`).join('\n\n');
      return `### Chapter ${chNum}\n${lines}`;
    }).join('\n\n---\n\n');

    manuscriptText = `FULL MANUSCRIPT TEXT (All Chapters 1-${chapterList.length}):\n\n${allChapters}`;
  } else {
    // For exceedingly massive texts exceeding provider budget, focus on query-matched / target chapters
    const matchChapters = Array.from(new Set(initialMatches.map(m => m.chapterNum)));
    const focusChapters = targetChapter
      ? [Math.max(1, targetChapter - 1), targetChapter, targetChapter + 1]
      : (matchChapters.length > 0 ? matchChapters.slice(0, 3) : [1, 2]);

    const includedBlocks = params.manuscriptBlocks.filter(b => focusChapters.includes(b.chapterNum));
    const chLines = includedBlocks.map(b => `[${b.id}]: ${b.text}`).join('\n\n');

    const chapterOutline = chapterList.map(ch => {
      const b = params.manuscriptBlocks.filter(x => x.chapterNum === ch);
      return `- Chapter ${ch}: ${b.length} paragraphs (~${b.reduce((s, x) => s + x.text.length, 0)} characters)`;
    }).join('\n');

    manuscriptText = `MANUSCRIPT SCENE TEXT (Chapters ${focusChapters.join(', ')}):\n\n${chLines}\n\nCHAPTER INVENTORY (Call search_manuscript to query any other chapter):\n${chapterOutline}`;
  }

  const skeletons = cachedSkeletons(params.manuscriptBlocks);
  const skeletonText = skeletons.length
    ? `CHAPTER SKELETONS (dry lists of what each chapter states; paragraph ids point to the text):\n\n${skeletons.map(s => `### Chapter ${s.chapter}\n${s.skeleton}`).join('\n\n')}`
    : '';

  const system = `You are an expert Literary Co-Author and Surgical Editorial Assistant.
${skeletonView
    ? `In this review you see the book (${chapterList.map(c => `Chapter ${c}`).join(', ')}) as chapter skeletons, not as prose: ${REVIEW_FOCUS[view]}. Every line of a skeleton names its paragraph; read the text itself through check_suspects or read_blocks.`
    : `You have full visibility of the entire novel manuscript across all chapters (${chapterList.map(c => `Chapter ${c}`).join(', ')}).`}
You assist the author with comprehensive manuscript analysis, cross-chapter continuity checks, fact-checking, and making atomic surgical edits.
Respond in the language used by the author (if Russian, respond in natural Russian).

CRITICAL OPERATIONAL RULES:
1. ${skeletonView ? 'You have the chapter skeletons, the author\'s notes, and the cross-chapter entity map below; the manuscript text is one tool call away.' : 'You have direct access to the entire manuscript text across all chapters and the cross-chapter entity map below.'}
2. EDITORIAL SCOPE & MACRO-STITCHING (Eliminating Redundancies):
   - When text contains duplicated multi-paragraph scenes, repetitive paragraphs, or redundant blocks (e.g., paragraphs ch4_p55 to ch4_p86 repeating an earlier sequence):
     DO NOT merely trim 3-4 words inside a single paragraph! You MUST propose a BLOCK RANGE DELETION by providing "startBlockId", "endBlockId", and "replace": "" (or revised text). Excise the entire redundant block cleanly!
3. RESOLVING STRUCTURAL & LOGIC CONTRADICTIONS:
   - When you detect a plot, factual, or knowledge contradiction (e.g., a character knowing about a trap in one scene vs claiming ignorance in another):
     DO NOT propose timid cosmetic word-swaps (e.g. changing 'known' to 'suspected'). Prioritize COMPLETE REMOVAL of the contradictory sentence or a CLEAN REWRITE of the conflicting beat so facts and character knowledge stay strictly consistent.
4. CROSS-CHAPTER RULES & LOCATION TRACKING:
   - Carefully verify device mechanics and established world rules (e.g., rotating vs static codes, frequencies, protocols). If an earlier chapter establishes a mechanism, subsequent chapters must not contradict it.
   - Strictly track character physical locations across and at the end of scenes. If characters exit an elevator into the subbasement, subsequent sentences must reflect the subbasement environment, not the previous location.
5. PROPOSE DIFFS using markdown code fences:
   - For line/sentence edits:
\`\`\`tool:propose_diff
{"chapter": 1, "search": "exact quote to replace", "replace": "revised text", "rationale": "reason"}
\`\`\`
   - For multi-paragraph block deletions or block rewrites:
\`\`\`tool:propose_diff
{"chapter": 4, "startBlockId": "ch4_p55", "endBlockId": "ch4_p86", "replace": "", "rationale": "Excise duplicated scanner and elevator sequence"}
\`\`\`
6. "replace": "" is VALID and STRONGLY ENCOURAGED when deleting redundant, duplicate, or contradictory text. Do not propose identical no-op edits (where search === replace).
7. READING TOOLS. Call any of them as a fenced block; results come back in the next round. A reply that calls tools holds only the tool calls: write your review after the results come back, not before:
\`\`\`tool:search_manuscript
{"query": "search term", "chapter": Optional[number]}
\`\`\`
   - read_blocks {"chapter": 3, "from": 10, "to": 30} — paragraphs ch3_p10..ch3_p30 in full, to read a passage in order.
   - chapter_skeleton {"chapter": 3} or {} for all chapters — a dry list per chapter: scenes, who learns what and how, stated hours and dates, where each character ends up, objects and injuries, open questions. Each line names its paragraph id. Made once and kept until the chapter changes.
   - check_suspects {"suspects": [{"claim": "Body found at five (ch4) and at noon (ch6)", "places": ["ch4_p18", "ch6_p1"]}]} — every place of every suspicion in full, a paragraph either side, all at once. Places are paragraph ids or ranges like "ch3_p12-ch3_p15".
${repeatsView ? '' : `   - find_repeats {"chapter": Optional[number]} — passages told twice and sentences said more than once, found by code.
`}   - inspect_dependencies {"entity": "name or object", "chapter": 3} — where else the book mentions it.
8. PLOT AND LOGIC REVIEW. A plot hole hides in prose; look at what the chapters state, not how they sound. When the author asks about plot, logic, or continuity, ask these questions, with the skeletons when you have them:
   - Where does each character learn what they know? Does anyone act on a fact before the scene where they get it?
   - Where is each character at the end of a scene? Does anyone appear somewhere without getting there?
   - Do hours, dates, ages, and spans agree across chapters?
   - Does an object (key, card, letter, weapon) reach a hand without being shown how?
   - Is a scene told twice?${repeatsView ? '' : ' (find_repeats)'}
   - Does the book contradict the AUTHOR'S NOTES given with the manuscript?
   - Why does each scene follow from the one before it — because of it, or despite it, or only after it?
   - What would break if a scene were cut?
   Report a problem only with the quotes that show it: two passages that contradict, or the passage where something is missing. A character's lie or mistake is not the author's error. If you find nothing, say so; do not invent problems to have something to report. Confirm what a skeleton suggests in the text itself (read_blocks) before reporting it.
9. BE CONCISE. Deliver clear, targeted feedback and minimal surgical diffs. Do NOT reprint entire scenes or recite unasked prose, to respect output token budgets.
`.trim();

  let prompt = `User request: "${params.userPrompt}"\n\n`;
  if (entitySummary) {
    prompt += `${entitySummary}\n\n`;
  }
  const notes = readBookNotes(params.metadata);
  if (params.metadata && !notes.startsWith('This book has no saved notes')) {
    prompt += `AUTHOR'S NOTES (premise, requirements, dossier: what the author meant the book to be):\n${notes}\n\n`;
  }
  if (skeletonText) {
    prompt += `${skeletonText}\n\n`;
  }
  // Code checks the chapter records and names suspicions; the passages come with them, to be read.
  if (skeletonView) {
    const suspects = suspectsFor(params.manuscriptBlocks, params.view);
    prompt += suspects.length
      ? `SUSPICIONS FOUND BY CODE (${SUSPECTS_FOUND[view]}). Each comes with its passages:\n\n${checkSuspects(params.manuscriptBlocks, suspects)}\n\n`
      : `SUSPICIONS FOUND BY CODE: none.\n\n`;
  }
  if (view === 'pacing') {
    const open = openQuestions(cachedRecords(params.manuscriptBlocks));
    if (open) prompt += `QUESTIONS AND PROMISES THE CHAPTERS LEAVE OPEN (code lists them in book order; one the later chapters never answer is a suspicion):\n${open}\n\n`;
  }
  if (view === 'skeletons') {
    const durations = durationMentions(params.manuscriptBlocks);
    if (durations.length) prompt += `SPANS OF TIME STATED IN THE BOOK (code lists every span in book order; two different spans for one relation, habit, or stretch of time are a suspicion):\n${formatDurations(durations)}\n\n`;
    const knowledge = knowledgeByPair(skeletons);
    if (knowledge) prompt += `KNOWLEDGE BY PAIR (code groups the skeletons' LEARNED and KNOWS lines by who knows and whom it is about, in book order; NOT marks a line saying the character does not know). A NOT line after a line where the same character already knows it is a suspicion:\n\n${knowledge}\n\n`;
  }
  if (contextSnippets && !skeletonView) {
    prompt += `${contextSnippets}\n\n`;
  }
  if (manuscriptText) {
    prompt += `${manuscriptText}\n\n`;
  }
  prompt += skeletonView
    ? `Work from the skeletons, and read the passages before you report anything.`
    : `Please analyze the manuscript, advise the author across chapters, and propose surgical diff patches if appropriate.`;

  return { system, prompt };
}

function createDiffCard(
  ch: number,
  rawSearch: string,
  rawReplace: string,
  rationale: string,
  blocks: ManuscriptBlock[],
  graph: EntityGraph,
  startBlockId?: string,
  endBlockId?: string
): ProposedDiffCard | null {
  const replace = cleanDiffArtifacts(rawReplace || '');
  let search = cleanDiffArtifacts(rawSearch || '');
  let resolvedChapter = ch;

  // Resolve search target from blocks if block range is provided
  if (startBlockId) {
    const startMatch = startBlockId.match(/_p(\d+)/i) || startBlockId.match(/(\d+)$/);
    const endMatch = (endBlockId || startBlockId).match(/_p(\d+)/i) || (endBlockId || startBlockId).match(/(\d+)$/);

    if (startMatch) {
      let startP = parseInt(startMatch[1], 10);
      let endP = endMatch ? parseInt(endMatch[1], 10) : startP;
      if (startP > endP) [startP, endP] = [endP, startP];

      const chBlocks = blocks.filter(b => b.chapterNum === ch);
      const targetBlocks = chBlocks.filter(b => b.pIndex >= startP && b.pIndex <= endP);

      if (targetBlocks.length > 0) {
        if (!search) {
          search = targetBlocks.map(b => b.text).join('\n\n');
        }
      }
    }
  }

  // Skip no-op patches or empty targets (unless replacing/deleting)
  if (!search || (search === replace && search !== '')) return null;

  // Verify chapter location: if search is absent from ch and no startBlockId, check if it's in another chapter
  if (!startBlockId) {
    const targetBlock = blocks.find(
      b => b.chapterNum === ch && (b.text.includes(search) || search.includes(b.text.slice(0, 30)))
    );
    if (!targetBlock) {
      const alternateBlock = blocks.find(b => b.text.includes(search));
      if (alternateBlock) {
        resolvedChapter = alternateBlock.chapterNum;
      }
    }
  }

  const warnings = checkCrossTextImpact(graph, search, resolvedChapter).map(w => w.warning);

  return {
    id: `diff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    chapterNum: resolvedChapter,
    startBlockId,
    endBlockId,
    searchTarget: search,
    replacementText: replace,
    rationale,
    warnings,
  };
}

/** Whether the author asked for changes, so the turn must end in patches rather than a review. */
export function asksForEdit(text: string): boolean {
  return /(?:исправ|замен|удал|перепиш|перепис|отредакт|внеси|выполни|почини|убери|сократи|добав|rewrite|replace|remove|delete|fix|edit|apply)/i.test(text);
}

export async function runEditorialTurn(params: {
  userPrompt: string;
  bookContent: string;
  metadata?: any;
  history: { role: 'user' | 'assistant'; content: string }[];
  provider?: string;
  view?: EditorialView;
  /** Set when the turn closes a reviewed problem: after the patches, code re-reads the changed chapters once. */
  closing?: { title: string };
  callModel: (prompt: string, system: string) => Promise<string>;
}): Promise<EditorialAgentResponse> {
  const blocks = indexManuscriptBlocks(params.bookContent);
  const graph = buildEntityGraph(blocks, params.metadata?.dossier);
  const executedTools: { tool: string; summary: string }[] = [];
  // Paragraphs of every suspicion checked against the text this turn: code's, and the reader's own through check_suspects.
  const checked = new Set<string>();
  if (isReview(params.view)) {
    const chapters = Array.from(new Set(blocks.map(b => b.chapterNum))).sort((a, b) => a - b);
    await chapterSkeletons(blocks, chapters, params.callModel);
    executedTools.push({ tool: 'chapter_skeleton', summary: `Skeletons of ${chapters.length} chapters` });
    const suspects = suspectsFor(blocks, params.view);
    for (const suspect of suspects) for (const id of expandPlaces(suspect.places)) checked.add(id);
    executedTools.push({ tool: 'code_checks', summary: `Code found ${suspects.length} suspicions in the text and the chapter records` });
  }

  const { system, prompt } = buildEditorialAgentPrompt({
    userPrompt: params.userPrompt,
    manuscriptBlocks: blocks,
    entityGraph: graph,
    history: params.history,
    provider: params.provider,
    metadata: params.metadata,
    view: params.view,
  });

  const diffCards: ProposedDiffCard[] = [];

  const wantsEdit = asksForEdit(params.userPrompt);
  const observations: string[] = [];
  const ran = new Set<string>();
  let modelResponse = '';
  let nextPrompt = prompt;
  const rounds = 5;
  for (let round = 0; round < rounds; round++) {
    modelResponse = await params.callModel(nextPrompt, system);
    const toolCalls = parseToolCallsFromModelResponse(modelResponse);
    let invalidPatch = false;
    for (const tc of toolCalls) {
      // In a review, a call already run is not run again: its result is in the observations.
      const key = `${tc.tool}:${JSON.stringify(tc.args)}`;
      if (isReview(params.view) && tc.tool !== 'propose_diff' && ran.has(key)) {
        observations.push(`${tc.tool} ${JSON.stringify(tc.args)} already ran; its result is above.`);
        continue;
      }
      ran.add(key);
      if (params.view === 'repeats' && tc.tool === 'find_repeats') {
        observations.push('find_repeats is not needed: code has already found the repeats, and they are listed above with their passages.');
        continue;
      }
      if (tc.tool === 'search_manuscript') {
        const query = String(tc.args.query || '');
        const matches = hybridSearch(blocks, query, tc.args.chapter ? Number(tc.args.chapter) : undefined, 4);
        executedTools.push({ tool: tc.tool, summary: `Searched "${query}" (${matches.length} matches found)` });
        observations.push(`Search "${query}":\n` + matches.map(m => `[Chapter ${m.chapterNum}, Block ${m.blockId}]: "${m.fullText}"`).join('\n\n'));
      } else if (tc.tool === 'inspect_dependencies') {
        const entity = String(tc.args.entity || '');
        const warnings = checkCrossTextImpact(graph, entity, Number(tc.args.chapter || 1));
        executedTools.push({ tool: tc.tool, summary: `Checked dependencies for "${entity}"` });
        observations.push(`Dependencies for "${entity}":\n` + (warnings.map(w => w.warning).join('\n') || 'No conflicts in other chapters.'));
      } else if (tc.tool === 'find_repeats') {
        const chapter = tc.args.chapter ? Number(tc.args.chapter) : undefined;
        const found = findRepeats(blocks, chapter);
        executedTools.push({ tool: tc.tool, summary: `Found ${found.passages.length} repeated passages and ${found.sentences.length} repeated sentences${chapter ? ` touching Chapter ${chapter}` : ''}` });
        observations.push(`Repeats${chapter ? ` touching Chapter ${chapter}` : ''}:\n${formatRepeats(found)}`);
      } else if (tc.tool === 'check_suspects') {
        const suspects = Array.isArray(tc.args.suspects) ? tc.args.suspects : [];
        for (const suspect of suspects) for (const id of expandPlaces(Array.isArray(suspect?.places) ? suspect.places : [])) checked.add(id);
        executedTools.push({ tool: tc.tool, summary: `Read the places of ${suspects.length} suspected problems` });
        observations.push(`Suspects with their passages. Keep a suspect only if these passages show it; a character's lie, a move between rooms, or a time left unstated is not a hole:\n${checkSuspects(blocks, suspects)}`);
      } else if (tc.tool === 'read_blocks') {
        const chapter = Number(tc.args.chapter || 1);
        const from = Number(tc.args.from ?? 0);
        const to = tc.args.to === undefined ? undefined : Number(tc.args.to);
        executedTools.push({ tool: tc.tool, summary: `Read Chapter ${chapter} from paragraph ${from}${to === undefined ? '' : ` to ${to}`}` });
        const most = isReview(params.view) ? 8 : undefined;
        observations.push(`Chapter ${chapter} text:\n${readBlocks(blocks, chapter, from, to, most)}${most ? '\n(In this review read_blocks shows up to 8 paragraphs; put suspicions in check_suspects.)' : ''}`);
      } else if (tc.tool === 'chapter_skeleton') {
        const all = Array.from(new Set(blocks.map(b => b.chapterNum))).sort((a, b) => a - b);
        const chapters = tc.args.chapter ? [Number(tc.args.chapter)] : all;
        const text = await chapterSkeletons(blocks, chapters, params.callModel);
        executedTools.push({ tool: tc.tool, summary: chapters.length === 1 ? `Skeleton of Chapter ${chapters[0]}` : `Skeletons of ${chapters.length} chapters` });
        observations.push(`Chapter skeletons:\n${text}`);
      } else if (tc.tool === 'propose_diff') {
        const card = tc.args.replace === undefined ? null : createDiffCard(
          Number(tc.args.chapter || 1), tc.args.search || '', String(tc.args.replace),
          tc.args.rationale || 'Editorial edit', blocks, graph,
          tc.args.startBlockId || tc.args.start_paragraph_id || tc.args.start_block,
          tc.args.endBlockId || tc.args.end_paragraph_id || tc.args.end_block,
        );
        if (card && applySearchReplacePatch(params.bookContent, card.chapterNum, card.searchTarget, card.replacementText, card.startBlockId, card.endBlockId).success) {
          diffCards.push(card);
          executedTools.push({ tool: tc.tool, summary: `Proposed patch for Chapter ${card.chapterNum}` });
        } else {
          invalidPatch = true;
          observations.push('Patch rejected: supply an exact manuscript search quote or valid block range and an explicit replace field. Read the relevant text and propose a corrected patch.');
        }
      }
    }
    if (invalidPatch) diffCards.length = 0;
    if (diffCards.length > 0) break;
    if (!toolCalls.length && !wantsEdit) break;
    observations.push(`Previous assistant response:\n${modelResponse}\n` +
      (wantsEdit ? 'The author requested edits. Return executable propose_diff tool blocks, not a promise or a claim that changes were applied. If no change is appropriate, explain the concrete reason.' : 'Continue using tools as needed, then provide your review.'));
    // The last round answers from what has been read; tool calls in it would go unrun.
    const last = round === rounds - 2
      ? `\n\nThis is your last step: make no more tool calls. ${wantsEdit ? 'Return your propose_diff blocks now.' : 'Write your answer now from what you have read.'}`
      : '';
    nextPrompt = `${prompt}\n\nTool Observations:\n${observations.join('\n\n')}${last}`;
  }

  let problems = parseProblems(modelResponse);
  let dropped = parseDropped(modelResponse);
  const cited = (places: string[]) => places.length > 0 && places.some(place => modelResponse.includes(place.split(/[-–]/)[0].trim()));
  // The review was asked for blocks but wrote prose: one call copies its kept and dropped suspects out, nothing more.
  if (params.userPrompt.includes('```problem') && modelResponse.trim() && (!problems.length || !dropped.length)) {
    const extracted = await params.callModel(
      `REVIEW:\n${modelResponse}\n\nCopy the problems this review KEEPS as blocks, one per problem, in the review's order:\n\`\`\`problem\n{"title": "short name", "places": ["paragraph ids the review cites for it"], "ways": ["each way the review gives to close it"]}\n\`\`\`\nThen copy the suspects it DROPS, each with the quote from the book it gives as clearing it (empty if it gives none):\n\`\`\`dropped\n{"title": "short name", "places": ["paragraph ids"], "quote": "the quote the review gives, word for word"}\n\`\`\`\nCopy only what the review says. If the review keeps or drops none, output no block for it.`,
      'You copy kept and dropped suspects out of an editorial review into blocks. Do not add, judge, or rewrite. Output the blocks only.',
    );
    // A copied entry stands only on paragraphs the review itself cites.
    if (!problems.length) {
      problems = parseProblems(extracted).filter(p => cited(p.places));
      if (problems.length) executedTools.push({ tool: 'problems', summary: `Copied ${problems.length} kept problems into cards` });
    }
    if (!dropped.length) dropped = parseDropped(extracted).filter(d => cited(d.places));
  }
  // In a review of suspicions, a kept problem must be one that was checked against the text.
  const unchecked = isReview(params.view) ? problems.filter(p => !expandPlaces(p.places).some(id => checked.has(id))) : [];
  problems = problems.filter(p => !unchecked.includes(p));
  // A drop stands only on a quote that is in the book or the author's notes word for word; any other drop is kept.
  const notes = params.metadata ? readBookNotes(params.metadata) : '';
  const unproven = dropped.filter(d => clearingQuote(d, params.bookContent, notes) !== 'ok');
  for (const d of unproven) {
    problems.push({ id: `problem_${problems.length + 1}_${Math.random().toString(36).slice(2, 6)}`, title: `${d.title} (dropped without a quote that clears it)`, places: d.places, ways: [] });
  }
  if (unproven.length) executedTools.push({ tool: 'problems', summary: `Kept ${unproven.length} dropped suspects that had no clearing quote from the book` });

  // Clean tool tags and problem blocks from message text
  let cleanMessage = modelResponse
    .replace(/```(?:tool:[a-z_]+|json\s*\(tool:[a-z_]+\))[\s\S]*?```/gi, '')
    .replace(PROBLEM_BLOCK, '')
    .replace(DROPPED_BLOCK, '')
    .trim();

  // If the model wrapped its output in a JSON object (e.g. {"type":"object","content":"..."} or {"error":"..."})
  if (cleanMessage.startsWith('{') && cleanMessage.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleanMessage);
      if (typeof parsed.content === 'string') {
        cleanMessage = parsed.content;
      } else if (typeof parsed.message === 'string') {
        cleanMessage = parsed.message;
      } else if (typeof parsed.text === 'string') {
        cleanMessage = parsed.text;
      } else if (typeof parsed.error === 'string') {
        cleanMessage = parsed.error;
      }
    } catch {
      // Keep as is if not valid JSON
    }
  }

  if (unproven.length) {
    cleanMessage += `\n\n**Kept after all: dropped without a quote from the book that clears them:**\n${unproven.map(d => `- ${d.title}${d.quote ? ` (the quote given is not in the book or the author's notes: "${d.quote}")` : ''}`).join('\n')}`;
  }
  if (unchecked.length) {
    cleanMessage += `\n\n**Not kept: not among the suspicions checked against the text** (send it through check_suspects first):\n${unchecked.map(p => `- ${p.title}${p.places.length ? ` (${p.places.join(', ')})` : ''}`).join('\n')}`;
  }

  // Closing a problem: show once how the changed chapters read, by their new skeletons. Shown, not judged.
  if (params.closing && diffCards.length > 0) {
    let updated = params.bookContent;
    for (const card of diffCards) {
      const applied = applySearchReplacePatch(updated, card.chapterNum, card.searchTarget, card.replacementText, card.startBlockId, card.endBlockId);
      if (applied.success) updated = applied.updatedManuscript;
    }
    const changedBlocks = indexManuscriptBlocks(updated);
    const chapters = Array.from(new Set(diffCards.map(c => c.chapterNum))).sort((a, b) => a - b);
    const skeletons: { chapter: number; skeleton: string }[] = [];
    for (const chapter of chapters) skeletons.push({ chapter, skeleton: await chapterSkeleton(changedBlocks, chapter, params.callModel) });
    const lines = linesAbout(skeletons, params.closing.title);
    executedTools.push({ tool: 'chapter_skeleton', summary: `Re-read Chapter ${chapters.join(', ')} with the changes` });
    cleanMessage += `\n\n**With these changes, the skeleton of Chapter ${chapters.join(', ')} says about it:**\n` +
      (lines.length ? lines.map(l => `- ch${l.chapter}: ${l.text}`).join('\n') : '- nothing about it any more.');
  }

  if (wantsEdit && diffCards.length === 0) {
    cleanMessage = `Изменения не подготовлены: агент не вернул применимую правку. Текст рукописи не изменён.\n\n${cleanMessage}`;
  }

  return {
    assistantMessage: cleanMessage || (diffCards.length > 0 ? 'Here is the proposed editorial patch:' : 'Review completed.'),
    diffCards,
    executedTools,
    problems,
  };
}
