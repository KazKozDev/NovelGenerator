import { indexManuscriptBlocks, hybridSearch, ManuscriptBlock } from './hybridSearch';
import { buildEntityGraph, checkCrossTextImpact, EntityGraph } from './entityGraph';
import { applySearchReplacePatch, cleanDiffArtifacts } from './patchApplier';
import { cachedSkeletons, chapterSkeletons, checkSuspects, findRepeats, formatRepeats, readBlocks, readBookNotes } from './editorialTools';

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

export interface EditorialAgentResponse {
  assistantMessage: string;
  diffCards: ProposedDiffCard[];
  executedTools: { tool: string; summary: string }[];
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
  if (provider === 'qwen' || provider === 'compatible') {
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
}): { system: string; prompt: string } {
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
  if (totalLength <= maxFullChars) {
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
You have full visibility of the entire novel manuscript across all chapters (${chapterList.map(c => `Chapter ${c}`).join(', ')}).
You assist the author with comprehensive manuscript analysis, cross-chapter continuity checks, fact-checking, and making atomic surgical edits.
Respond in the language used by the author (if Russian, respond in natural Russian).

CRITICAL OPERATIONAL RULES:
1. You have direct access to the entire manuscript text across all chapters and the cross-chapter entity map below.
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
   - find_repeats {"chapter": Optional[number]} — passages told twice and sentences said more than once, found by code.
   - inspect_dependencies {"entity": "name or object", "chapter": 3} — where else the book mentions it.
8. PLOT AND LOGIC REVIEW. A plot hole hides in prose; look at what the chapters state, not how they sound. When the author asks about plot, logic, or continuity, ask these questions, with the skeletons when you have them:
   - Where does each character learn what they know? Does anyone act on a fact before the scene where they get it?
   - Where is each character at the end of a scene? Does anyone appear somewhere without getting there?
   - Do hours, dates, ages, and spans agree across chapters?
   - Does an object (key, card, letter, weapon) reach a hand without being shown how?
   - Is a scene told twice? (find_repeats)
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
  if (contextSnippets) {
    prompt += `${contextSnippets}\n\n`;
  }
  if (manuscriptText) {
    prompt += `${manuscriptText}\n\n`;
  }
  prompt += `Please analyze the manuscript, advise the author across chapters, and propose surgical diff patches if appropriate.`;

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
  callModel: (prompt: string, system: string) => Promise<string>;
}): Promise<EditorialAgentResponse> {
  const blocks = indexManuscriptBlocks(params.bookContent);
  const graph = buildEntityGraph(blocks, params.metadata?.dossier);

  const { system, prompt } = buildEditorialAgentPrompt({
    userPrompt: params.userPrompt,
    manuscriptBlocks: blocks,
    entityGraph: graph,
    history: params.history,
    provider: params.provider,
    metadata: params.metadata,
  });

  const executedTools: { tool: string; summary: string }[] = [];
  const diffCards: ProposedDiffCard[] = [];

  const wantsEdit = asksForEdit(params.userPrompt);
  const observations: string[] = [];
  let modelResponse = '';
  let nextPrompt = prompt;
  for (let round = 0; round < 5; round++) {
    modelResponse = await params.callModel(nextPrompt, system);
    const toolCalls = parseToolCallsFromModelResponse(modelResponse);
    let invalidPatch = false;
    for (const tc of toolCalls) {
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
        executedTools.push({ tool: tc.tool, summary: `Read the places of ${suspects.length} suspected problems` });
        observations.push(`Suspects with their passages. Keep a suspect only if these passages show it; a character's lie, a move between rooms, or a time left unstated is not a hole:\n${checkSuspects(blocks, suspects)}`);
      } else if (tc.tool === 'read_blocks') {
        const chapter = Number(tc.args.chapter || 1);
        const from = Number(tc.args.from ?? 0);
        const to = tc.args.to === undefined ? undefined : Number(tc.args.to);
        executedTools.push({ tool: tc.tool, summary: `Read Chapter ${chapter} from paragraph ${from}${to === undefined ? '' : ` to ${to}`}` });
        observations.push(`Chapter ${chapter} text:\n${readBlocks(blocks, chapter, from, to)}`);
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
    nextPrompt = `${prompt}\n\nTool Observations:\n${observations.join('\n\n')}`;
  }

  // Clean tool tags from message text
  let cleanMessage = modelResponse
    .replace(/```(?:tool:[a-z_]+|json\s*\(tool:[a-z_]+\))[\s\S]*?```/gi, '')
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

  if (wantsEdit && diffCards.length === 0) {
    cleanMessage = `Изменения не подготовлены: агент не вернул применимую правку. Текст рукописи не изменён.\n\n${cleanMessage}`;
  }

  return {
    assistantMessage: cleanMessage || (diffCards.length > 0 ? 'Here is the proposed editorial patch:' : 'Review completed.'),
    diffCards,
    executedTools,
  };
}
