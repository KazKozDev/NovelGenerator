import { indexManuscriptBlocks, hybridSearch, ManuscriptBlock } from './hybridSearch';
import { buildEntityGraph, checkCrossTextImpact, EntityGraph } from './entityGraph';
import { cleanDiffArtifacts } from './patchApplier';

export interface ParsedToolCall {
  tool: 'search_manuscript' | 'inspect_dependencies' | 'propose_diff';
  args: Record<string, any>;
}

export interface ProposedDiffCard {
  id: string;
  chapterNum: number;
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
      if (['search_manuscript', 'inspect_dependencies', 'propose_diff'].includes(toolName)) {
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
        if (parsed?.tool && ['search_manuscript', 'inspect_dependencies', 'propose_diff'].includes(parsed.tool)) {
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

export function buildEditorialAgentPrompt(params: {
  userPrompt: string;
  manuscriptBlocks: ManuscriptBlock[];
  entityGraph: EntityGraph;
  history: { role: 'user' | 'assistant'; content: string }[];
}): { system: string; prompt: string } {
  const chapterList = Array.from(new Set(params.manuscriptBlocks.map(b => b.chapterNum))).sort((a, b) => a - b);
  const targetChapter = extractTargetChapter(params.userPrompt);

  // Retrieve relevant excerpts from manuscript for the user prompt
  const initialMatches = hybridSearch(params.manuscriptBlocks, params.userPrompt, targetChapter, 5);

  let contextSnippets = '';
  if (initialMatches.length > 0) {
    contextSnippets = `MANUSCRIPT EXCERPTS RELEVANT TO AUTHOR'S REQUEST:\n` +
      initialMatches.map(m => `[Chapter ${m.chapterNum}, Block ${m.blockId}]:\n"${m.fullText}"`).join('\n\n');
  }

  // If a specific chapter was targeted, add its content so the model has complete scene context
  let chapterContext = '';
  if (targetChapter) {
    const chBlocks = params.manuscriptBlocks.filter(b => b.chapterNum === targetChapter);
    if (chBlocks.length > 0) {
      const excerpt = chBlocks.slice(0, 15).map(b => `[${b.id}]: ${b.text}`).join('\n\n');
      chapterContext = `FULL SCENE CONTEXT FOR CHAPTER ${targetChapter}:\n${excerpt}`;
    }
  }

  const system = `You are an expert Literary Co-Author and Surgical Editorial Assistant.
You assist the author with analyzing, fact-checking, and making atomic surgical edits across the manuscript.
The manuscript has ${chapterList.length} chapters (${chapterList.map(c => `Chapter ${c}`).join(', ')}).
Respond in the language used by the author (if Russian, respond in natural Russian).

CRITICAL OPERATIONAL RULES:
1. You have direct access to the relevant manuscript excerpts and scene text provided below.
2. NEVER rewrite whole scenes or chapters. Every edit MUST be an atomic SEARCH/REPLACE patch.
3. In "search", provide the EXACT, VERBATIM quote from the manuscript text provided to you.
   DO NOT add diff markers ('--', '++', '-', '+'), and DO NOT truncate with '...'.
4. In "replace", provide your revised prose.
5. Propose diffs using markdown code fences:
\`\`\`tool:propose_diff
{"chapter": ${targetChapter || 1}, "search": "exact quote to replace", "replace": "revised text", "rationale": "reason"}
\`\`\`
6. If you need to search for other terms or verify other chapters, you can call:
\`\`\`tool:search_manuscript
{"query": "search term", "chapter": Optional[number]}
\`\`\`
7. NEVER propose empty or no-op patches. If an issue requires author clarification, explain it clearly in your message.
`.trim();

  let prompt = `User request: "${params.userPrompt}"\n\n`;
  if (contextSnippets) {
    prompt += `${contextSnippets}\n\n`;
  }
  if (chapterContext) {
    prompt += `${chapterContext}\n\n`;
  }
  prompt += `Please analyze the provided text, advise the author, and propose surgical diff patches if appropriate.`;

  return { system, prompt };
}

function createDiffCard(
  ch: number,
  rawSearch: string,
  rawReplace: string,
  rationale: string,
  blocks: ManuscriptBlock[],
  graph: EntityGraph
): ProposedDiffCard | null {
  const search = cleanDiffArtifacts(rawSearch || '');
  const replace = cleanDiffArtifacts(rawReplace || '');

  // Skip no-op patches or empty targets
  if (!search || search === replace) return null;

  // Verify chapter location: if search is absent from ch, check if it's in another chapter
  let resolvedChapter = ch;
  const targetBlock = blocks.find(
    b => b.chapterNum === ch && (b.text.includes(search) || search.includes(b.text.slice(0, 30)))
  );
  if (!targetBlock) {
    const alternateBlock = blocks.find(b => b.text.includes(search));
    if (alternateBlock) {
      resolvedChapter = alternateBlock.chapterNum;
    }
  }

  const warnings = checkCrossTextImpact(graph, search, resolvedChapter).map(w => w.warning);

  return {
    id: `diff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    chapterNum: resolvedChapter,
    searchTarget: search,
    replacementText: replace,
    rationale,
    warnings,
  };
}

export async function runEditorialTurn(params: {
  userPrompt: string;
  bookContent: string;
  metadata?: any;
  history: { role: 'user' | 'assistant'; content: string }[];
  callModel: (prompt: string, system: string) => Promise<string>;
}): Promise<EditorialAgentResponse> {
  const blocks = indexManuscriptBlocks(params.bookContent);
  const graph = buildEntityGraph(blocks, params.metadata?.dossier);

  const { system, prompt } = buildEditorialAgentPrompt({
    userPrompt: params.userPrompt,
    manuscriptBlocks: blocks,
    entityGraph: graph,
    history: params.history,
  });

  const executedTools: { tool: string; summary: string }[] = [];
  const diffCards: ProposedDiffCard[] = [];

  // Round 1
  let modelResponse = await params.callModel(prompt, system);
  let toolCalls = parseToolCallsFromModelResponse(modelResponse);

  // If tool calls emitted, execute them locally and run Round 2
  if (toolCalls.length > 0) {
    const observations: string[] = [];

    for (const tc of toolCalls) {
      if (tc.tool === 'search_manuscript') {
        const query = tc.args.query || '';
        const ch = tc.args.chapter ? Number(tc.args.chapter) : undefined;
        const matches = hybridSearch(blocks, query, ch, 4);
        executedTools.push({
          tool: 'search_manuscript',
          summary: `Searched "${query}" (${matches.length} matches found)`,
        });
        observations.push(`Tool 'search_manuscript' result for "${query}":\n` +
          matches.map(m => `[Chapter ${m.chapterNum}, Block ${m.blockId}]: "${m.fullText}"`).join('\n\n')
        );
      } else if (tc.tool === 'inspect_dependencies') {
        const entity = tc.args.entity || '';
        const ch = tc.args.chapter ? Number(tc.args.chapter) : 1;
        const warnings = checkCrossTextImpact(graph, entity, ch);
        executedTools.push({
          tool: 'inspect_dependencies',
          summary: `Checked dependencies for "${entity}"`,
        });
        observations.push(`Tool 'inspect_dependencies' result for "${entity}":\n` +
          (warnings.length > 0 ? warnings.map(w => w.warning).join('\n') : 'No conflicts in other chapters.')
        );
      } else if (tc.tool === 'propose_diff') {
        const card = createDiffCard(
          Number(tc.args.chapter || 1),
          tc.args.search || '',
          tc.args.replace || '',
          tc.args.rationale || 'Editorial edit',
          blocks,
          graph
        );
        if (card) {
          diffCards.push(card);
          executedTools.push({
            tool: 'propose_diff',
            summary: `Proposed patch for Chapter ${card.chapterNum}`,
          });
        }
      }
    }

    // If propose_diff was already in round 1, no need for second call if clear
    if (diffCards.length === 0 && observations.length > 0) {
      const followUpPrompt = `${prompt}\n\nTool Observations:\n${observations.join('\n\n')}\n\nPlease provide your final response and propose diff patches if needed.`;
      modelResponse = await params.callModel(followUpPrompt, system);
      const secondRoundTools = parseToolCallsFromModelResponse(modelResponse);

      for (const tc of secondRoundTools) {
        if (tc.tool === 'propose_diff') {
          const card = createDiffCard(
            Number(tc.args.chapter || 1),
            tc.args.search || '',
            tc.args.replace || '',
            tc.args.rationale || 'Editorial edit',
            blocks,
            graph
          );
          if (card) {
            diffCards.push(card);
            executedTools.push({
              tool: 'propose_diff',
              summary: `Proposed patch for Chapter ${card.chapterNum}`,
            });
          }
        }
      }
    }
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

  return {
    assistantMessage: cleanMessage || (diffCards.length > 0 ? 'Here is the proposed editorial patch:' : 'Review completed.'),
    diffCards,
    executedTools,
  };
}
