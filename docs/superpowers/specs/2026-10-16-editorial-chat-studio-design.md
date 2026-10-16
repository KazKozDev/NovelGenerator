# Editorial Chat Studio Design Specification

## 1. Overview & Goals
Transform Column 1 (Left panel) of the final book display (`BookDisplay.tsx`) from a passive audit view into an interactive **Editorial Assistant Studio** (`EditorialChatStudio.tsx`).

### Core Objectives:
1. **Chat-First Architecture with Embedded System Audit**:
   - The entire left column becomes an interactive editorial chat feed.
   - The existing automated review tasks (`clusteredTasks` from `targetedEditorial.ts`) are embedded into the feed as an interactive accordion card at the top, allowing the author to apply all tasks with one click or review/apply tasks individually.
2. **Natural Language Editorial Commands (Micro-Agent with Tool Calling)**:
   - The author can instruct the editor in natural language (e.g., *"Find where Clark mentions the oxygen timer"*, *"Replace tiled floor with limestone in chapter 3"*, *"Check if removing Bruce's glove in chapter 1 affects other chapters"*).
   - The editor autonomously uses browser-based tools: exact full-text search, BM25 semantic/ngram search, and an entity dependency graph.
3. **Cross-Text Dependency & Canon Consistency**:
   - The editor tracks entities (characters, props, injuries, timers, locations) across all chapters.
   - When an edit touches a tracked entity, the editor checks for downstream or upstream repercussions and presents an explicit warning if an inconsistency would be introduced.
4. **Atomic Diff Review Cards & Undo Stack**:
   - The editor never silently rewrites whole chapters. It generates structured **Diff Review Cards** showing exact deleted (red) and inserted (green) lines with target chapter and paragraph references.
   - The author approves (`[Apply Patch]`) or rejects (`[Reject]`) each diff.
   - Applying a patch updates the manuscript in Column 2 immediately, smoothly scrolls to the affected paragraph with a temporary highlight, and pushes the change onto an in-memory Undo stack (`[Undo]`).

---

## 2. Component & Layout Architecture

### 2.1 Three-Zone Layout (`BookDisplay.tsx`)
```
+-----------------------------------------------------------------------------------------------+
| BookStatistics & Top Header                                                                  |
+-----------------------------------------------------------------------------------------------+
| Column 1 (33%):                  | Column 2 (47%):               | Column 3 (1fr):            |
| EditorialChatStudio              | Manuscript Reader             | BookCover & Imprint        |
|                                  |                               |                            |
| [Header: Model Badge | Clear]    | [Header: Edit / Diff Toggle]  | [Cover Upload Artwork]     |
| [Message Feed (scrollable)]      | [Markdown / Diff View]        | [Imprint Colophon Form]    |
|   - System Audit Accordion Card  |                               |                            |
|   - User Message                 | (Scrolls to patched paragraph |                            |
|   - Agent Tool Logs (Search...)  |  with highlight on apply)     |                            |
|   - Diff Review Cards ([Apply])  |                               |                            |
| [Quick Prompt Chips]             |                               |                            |
| [Chat Input Box & Send Button]   |                               |                            |
+-----------------------------------------------------------------------------------------------+
```

### 2.2 Component Hierarchy & Data Flow
```
BookDisplay.tsx
  ├── State: manuscriptWithTitle, undoStack, activePatchedBlockId
  ├── Column 1: <EditorialChatStudio />
  │     ├── Props:
  │     │     bookContent: string
  │     │     metadata: any
  │     │     onApplyPatch: (newContent: string, targetChapter: number, blockId?: string) => void
  │     │     onUndoPatch: () => void
  │     │     canUndo: boolean
  │     │     activeModelConfig: LLMProviderConfig
  │     ├── Sub-components:
  │     │     ├── SystemAuditAccordionCard (initial clustered tasks with "Apply All" / "Review")
  │     │     ├── ChatMessageItem (author messages & assistant responses)
  │     │     ├── ToolExecutionBadge (e.g., "🔍 Found 3 matches in Ch. 1, 4")
  │     │     ├── DiffReviewCard (inline red/green diff, warning chip, [Apply] / [Reject] / [Undo])
  │     │     └── ChatInputBar (textarea with Cmd+Enter, submit button, quick suggestion chips)
  ├── Column 2: Manuscript Column
  │     └── Renders MarkdownView with paragraph IDs (`data-block-id="ch1_p3"`) for scrolling & target highlighting
  └── Column 3: BookCoverUpload
```

---

## 3. Core Modules & Engine Specifications

### 3.1 Block Indexer & Hybrid Search (`utils/novel/hybridSearch.ts`)
- **Block Struct**:
  ```ts
  interface ManuscriptBlock {
    id: string; // e.g. "ch1_p4"
    chapterNum: number;
    pIndex: number;
    text: string;
    normalizedText: string;
  }
  ```
- **Indexing**:
  - Automatically splits chapters using `parseBookChapters()`.
  - Splits chapter body by `\n\n` into paragraphs, discarding empty lines.
- **Search Capabilities**:
  1. `exactSearch(blocks, query)`: Case-insensitive and regex search with exact boundary matching.
  2. `bm25Search(blocks, query)`: In-browser token-level TF-IDF / BM25 scoring for queries phrased in natural language.
  3. `hybridSearch(blocks, query, options)`: Combines exact matches with BM25 semantic scoring, returning ranked results with matched snippets and surrounding paragraph context.
  4. Optional embedding similarity via `services/ollamaService.ts` (`qwen3-embedding:0.6b`) when Ollama is configured, falling back to client BM25 when offline.

### 3.2 Cross-Text Entity & Dependency Graph (`utils/novel/entityGraph.ts`)
- **Entity Extraction**:
  - Automatically identifies key characters, props (cylinders, lanterns, scanner, glasses, keys), physical invariants (boots, injuries, tremors), and timers/metrics (`2:00:00`, `1:56`, `forty minutes`).
- **Graph Structure**:
  ```ts
  interface EntityReference {
    entity: string;
    category: 'character' | 'prop' | 'injury' | 'timer' | 'location';
    occurrences: {
      chapterNum: number;
      blockId: string;
      quote: string;
    }[];
  }
  ```
- **Dependency Checks**:
  - `checkCrossTextImpact(entityGraph, modifiedEntity, fromChapter, newText)`:
    Returns list of chapters referencing the entity and alerts the editor if a deletion or radical state change would violate continuity in other chapters.

### 3.3 Patch Applier & Undo Stack (`utils/novel/patchApplier.ts`)
- **Diff Structure**:
  ```ts
  interface ProposedPatch {
    id: string;
    chapterNum: number;
    blockId?: string;
    searchTarget: string;
    replacementText: string;
    rationale: string;
    warnings?: string[];
    applied?: boolean;
    rejected?: boolean;
  }
  ```
- **Application Logic**:
  - Uses exact string replacement or whitespace-normalized fuzzy search within the target chapter.
  - Reconstructs the full manuscript while preserving all chapter headings and other chapters.
  - Returns `{ success: boolean, updatedManuscript: string, targetBlockId?: string, error?: string }`.
- **Undo Stack**:
  - Stores history: `Array<{ manuscript: string; description: string; timestamp: number }>`.
  - Popping restores previous manuscript state cleanly.

### 3.4 Editorial Agent Orchestrator (`utils/novel/editorialAgent.ts`)
- **System Prompt**:
  - Defines the persona: Master Literary Editor & Canon Consistency Agent.
  - Declares available tools in structured format:
    - `search_manuscript(query, chapter?)`
    - `inspect_dependencies(entity_name)`
    - `propose_diff(chapter_num, search_target, replacement_text, rationale)`
- **Tool Dispatching**:
  - When the model returns a tool call request (in JSON/Markdown code fence), the orchestrator intercepts it, runs the tool locally against `hybridSearch` or `entityGraph`, and feeds the observation back to the model.
  - When the model returns a diff proposal or direct answer, it renders directly into the chat feed as a message or interactive Diff Card.

---

## 4. User Interaction & UX Workflows

### 4.1 Automated Audit Workflow (Accordion)
1. On page load, `clusteredTasks` from `targetedEditorial.ts` are converted into an initial **System Audit** card in the chat.
2. The author can:
   - Click **«Apply All»**: The system sequentially applies the tasks, emitting diff cards and updating the text.
   - Click **«Review Task»** on any item: Generates a dedicated Diff Review Card in the chat for that specific item.

### 4.2 Natural Language Command Workflow
1. The author types: *«В третьей главе замени упоминание кафельного пола на известняк»*.
2. The Agent calls `search_manuscript("кафельный пол", chapter=3)` -> finds paragraph in Chapter 3.
3. The Agent calls `inspect_dependencies("кафельный пол")` -> confirms it only appears in Chapter 3.
4. The Agent outputs a **Diff Review Card**:
   - Target: Chapter 3.
   - Red: `...с тяжелым стуком опустился на холодный кафельный пол...`
   - Green: `...с тяжелым стуком опустился на холодный известняк пещеры...`
   - Rationale: *«Замена кафеля на известняк в соответствии с каноном пещеры.»*
5. The author clicks **«Применить патч»**:
   - The manuscript in Column 2 updates immediately.
   - Column 2 scrolls to Chapter 3 and flashes the paragraph in green/zinc highlight.
   - The card shows `✓ Применено` with an `[Откатить]` button.

---

## 5. Testing & Verification Plan

### 5.1 Unit Tests
- `tests/hybridSearch.test.ts`:
  - Verify exact regex and phrase matching.
  - Verify BM25 scoring ranks relevant paragraphs at the top.
  - Verify block ID assignment (`ch{n}_p{m}`).
- `tests/entityGraph.test.ts`:
  - Verify entity extraction across multiple chapters (props, timers, injuries).
  - Verify cross-reference warnings when an entity is removed or modified.
- `tests/patchApplier.test.ts`:
  - Verify search/replace patch application on single and multi-chapter text.
  - Verify whitespace tolerance and fallback.
  - Verify undo stack pushes and pops cleanly.
- `tests/editorialAgent.test.ts`:
  - Verify tool invocation parser and observation formatting.
  - Verify system audit task conversion to diff cards.

### 5.2 Component & Integration Tests
- `tests/editorialChatStudio.test.tsx`:
  - Verify rendering of system audit tasks, chat messages, and diff cards.
  - Verify clicking [Apply Patch] triggers `onApplyPatch` and updates manuscript.
  - Verify clicking [Undo] restores prior manuscript.

### 5.3 Quality & Regression Gates
- `npm test`: All 48 existing test suites + new test suites must pass 100%.
- `npm run build`: Zero TypeScript/bundler compilation errors.
