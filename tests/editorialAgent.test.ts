import { describe, it, expect } from 'vitest';
import {
  parseToolCallsFromModelResponse,
  buildEditorialAgentPrompt,
  runEditorialTurn,
  getMaxFullManuscriptChars,
} from '../utils/novel/editorialAgent';
import { indexManuscriptBlocks } from '../utils/novel/hybridSearch';
import { buildEntityGraph } from '../utils/novel/entityGraph';

const SAMPLE_MANUSCRIPT = `
## Chapter 1: The Vault

Clark placed the heavy oxygen canister on the floor.

## Chapter 2: The Fracture

Bruce grimaced as his wrist clicked. Only forty minutes remained on the secondary dial.
`.trim();

describe('editorialAgent', () => {
  it('parses tool calls from markdown code fences or structured tags', () => {
    const modelOutput = `
I will search for the oxygen canister in Chapter 1.
\`\`\`tool:search_manuscript
{"query": "oxygen canister", "chapter": 1}
\`\`\`
    `.trim();

    const tools = parseToolCallsFromModelResponse(modelOutput);
    expect(tools.length).toBe(1);
    expect(tools[0].tool).toBe('search_manuscript');
    expect(tools[0].args.query).toBe('oxygen canister');
    expect(tools[0].args.chapter).toBe(1);
  });

  it('parses diff proposals into structured ProposedDiffCard', () => {
    const modelOutput = `
Here is the proposed patch:
\`\`\`tool:propose_diff
{
  "chapter": 1,
  "search": "Clark placed the heavy oxygen canister on the floor.",
  "replace": "Clark set the titanium oxygen cylinder gently on the cold stone.",
  "rationale": "Clarify material and stance."
}
\`\`\`
    `.trim();

    const tools = parseToolCallsFromModelResponse(modelOutput);
    expect(tools.length).toBe(1);
    expect(tools[0].tool).toBe('propose_diff');
    expect(tools[0].args.chapter).toBe(1);
    expect(tools[0].args.search).toContain('oxygen canister');
  });

  it('runs an editorial turn with automated local tool execution and cross-text warning injection', async () => {
    const mockCallModel = async (prompt: string, system: string) => {
      if (prompt.includes('Tool Observations')) {
        return `
I found the mention and checked cross-references.
\`\`\`tool:propose_diff
{
  "chapter": 1,
  "search": "oxygen canister",
  "replace": "oxygen cylinder",
  "rationale": "Upgrade vocabulary"
}
\`\`\`
Done.`;
      }
      return `
\`\`\`tool:search_manuscript
{"query": "oxygen canister"}
\`\`\`
      `;
    };

    const response = await runEditorialTurn({
      userPrompt: 'Замени canister на cylinder в первой главе',
      bookContent: SAMPLE_MANUSCRIPT,
      history: [],
      callModel: mockCallModel,
    });

    expect(response.diffCards.length).toBe(1);
    expect(response.diffCards[0].chapterNum).toBe(1);
    expect(response.diffCards[0].searchTarget).toBe('oxygen canister');
    expect(response.diffCards[0].replacementText).toBe('oxygen cylinder');
  });

  it('unwraps JSON envelope responses cleanly', async () => {
    const mockCallModel = async () => {
      return JSON.stringify({
        type: 'object',
        content: 'I analyzed Chapter 4 and verified the scanner scene.',
      });
    };

    const response = await runEditorialTurn({
      userPrompt: 'Проверь сканер',
      bookContent: SAMPLE_MANUSCRIPT,
      history: [],
      callModel: mockCallModel,
    });

    expect(response.assistantMessage).toBe('I analyzed Chapter 4 and verified the scanner scene.');
  });

  it('adjusts manuscript char limits based on provider capabilities', () => {
    expect(getMaxFullManuscriptChars('anthropic')).toBe(1_500_000);
    expect(getMaxFullManuscriptChars('gemini')).toBe(1_500_000);
    expect(getMaxFullManuscriptChars('qwen')).toBe(400_000);
    expect(getMaxFullManuscriptChars('ollama')).toBe(120_000);
  });

  it('provides complete text of all chapters to Claude even for large manuscripts', () => {
    // Construct a ~150k character manuscript (exceeds Ollama 120k limit, but well within Claude 1.5M limit)
    const longManuscript = Array.from({ length: 6 }, (_, i) => {
      const chNum = i + 1;
      const text = `Paragraph in chapter ${chNum}. `.repeat(1500); // ~45k chars each
      return `## Chapter ${chNum}\n\n${text}`;
    }).join('\n\n');

    const blocks = indexManuscriptBlocks(longManuscript);
    const graph = buildEntityGraph(blocks);

    // With Claude (anthropic)
    const claudePrompt = buildEditorialAgentPrompt({
      userPrompt: 'Проверь сюжет в главе 6',
      manuscriptBlocks: blocks,
      entityGraph: graph,
      history: [],
      provider: 'anthropic',
    });
    expect(claudePrompt.prompt).toContain('FULL MANUSCRIPT TEXT (All Chapters 1-6)');
    expect(claudePrompt.prompt).toContain('Chapter 6');

    // With local Ollama, the same manuscript exceeds 120k and falls back to focused chapters
    const ollamaPrompt = buildEditorialAgentPrompt({
      userPrompt: 'Проверь сюжет в главе 6',
      manuscriptBlocks: blocks,
      entityGraph: graph,
      history: [],
      provider: 'ollama',
    });
    expect(ollamaPrompt.prompt).toContain('MANUSCRIPT SCENE TEXT');
    expect(ollamaPrompt.prompt).toContain('CHAPTER INVENTORY');
  });
});

