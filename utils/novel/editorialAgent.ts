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

export function buildEditorialAgentPrompt(params: {
  userPrompt: string;
  manuscriptBlocks: ManuscriptBlock[];
  entityGraph: EntityGraph;
  history: { role: 'user' | 'assistant'; content: string }[];
}): { system: string; prompt: string } {
  const chapterList = Array.from(new Set(params.manuscriptBlocks.map(b => b.chapterNum))).sort((a, b) => a - b);

  const system = `You are a Literary Co-Author and Surgical Editorial Agent.
You assist the author with analyzing, fact-checking, and making atomic surgical edits across the manuscript.
The manuscript has ${chapterList.length} chapters (${chapterList.map(c => `Chapter ${c}`).join(', ')}).

CRITICAL OPERATIONAL RULES:
1. NEVER rewrite whole scenes or chapters. Every edit MUST be an atomic SEARCH/REPLACE patch.
2. NEVER add diff markers (such as '--', '++', '-', '+', '>>>') into "search" or "replace". Provide ONLY the pure prose text as it appears in the book.
3. "search" MUST be an EXACT, VERBATIM substring directly from the manuscript. DO NOT truncate it with "..." or ellipsis. If you are not 100% sure of the exact quote, you MUST call "search_manuscript" first.
4. NEVER propose no-op patches or placeholder edits where "search" and "replace" are identical. If an issue requires author decision or confirmation, explain it in your chat message without emitting propose_diff.
5. Check cross-text dependencies: If changing a prop, location, or timer, inspect other chapters so you do not introduce plot holes.
6. Tools:
   - search_manuscript: {"query": "text to find", "chapter": Optional[number]}
   - inspect_dependencies: {"entity": "prop or character or timer"}
   - propose_diff: {"chapter": number, "search": "exact text to replace", "replace": "new text", "rationale": "reason"}
`.trim();

  let prompt = `User request: "${params.userPrompt}"\n\nPlease investigate the manuscript using tools or propose the diff patch directly.`;

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
  const cleanMessage = modelResponse
    .replace(/```(?:tool:[a-z_]+|json\s*\(tool:[a-z_]+\))[\s\S]*?```/gi, '')
    .trim();

  return {
    assistantMessage: cleanMessage || (diffCards.length > 0 ? 'Here is the proposed editorial patch:' : 'Review completed.'),
    diffCards,
    executedTools,
  };
}
