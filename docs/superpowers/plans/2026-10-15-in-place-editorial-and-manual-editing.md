# In-Place Editorial Review and Manual Manuscript Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to run the AI Editorial Review in-place on the book reading page without switching to the studio view, watch the manuscript update live, and manually edit the manuscript text directly in the reader.

**Architecture:** 
1. Separate initial book generation from post-generation editorial review in `useBookGenerator.ts` and `App.tsx` using an `isEditorialRunning` flag.
2. During editorial review, retain `finalBookContent` and update it on store refreshes so the user remains in `BookDisplay` while the review runs and streams chapter revisions.
3. Enhance `BookDisplay.tsx` with active review status indication (spinner, step descriptions) and an inline manuscript editing mode (`Read` / `Edit`) with manual save and cancellation.
4. Support `updateManualManuscript` in `useBookGenerator.ts` to sync manual edits back to the store, updating word statistics, export downloads, and subsequent reviews.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest.

**Spec:** In-place editorial workflow and manual editing directly inside the manuscript card on the final book view.

## Global Constraints
- Strict monochrome palette: zinc-900, zinc-800, zinc-700, zinc-300, zinc-100.
- No emojis, bright colorful badges, or decorative fluff.
- All existing tests must continue to pass (`npm test`).
- Type safety: strict TypeScript with full type annotations.

---

### Task 1: Add manual manuscript update and editorial state tracking in `useBookGenerator`

**Files:**
- Modify: `hooks/useBookGenerator.ts`
- Test: `tests/authorPersistence.test.ts` (or add new test in `tests/manualEditing.test.ts`)

**Interfaces:**
- Produces:
  - `isEditorialRunning: boolean`
  - `updateManualManuscript: (newContent: string) => boolean`
  - Preserved `finalBookContent` and live updates during `runCraftEditorial`

- [ ] **Step 1: Write test for manual manuscript updating and editorial run flags**

```typescript
// tests/manualEditing.test.ts
import { describe, it, expect } from 'vitest';
import { parseBookChapters, assembleManuscript } from '../utils/novel/manuscript';
import { MemoryProjectStore } from '../utils/novel/v2/store';

describe('Manual manuscript editing', () => {
  it('parses edited markdown content and updates store chapters', () => {
    const store = new MemoryProjectStore();
    store.saveManuscript(1, 'Initial text 1');
    store.saveManuscript(2, 'Initial text 2');
    
    const editedContent = '# My Book\n\n## Chapter 1\n\nManually updated text 1.\n\n## Chapter 2\n\nManually updated text 2.';
    const chapters = parseBookChapters(editedContent);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].content).toBe('Manually updated text 1.');
    expect(chapters[1].content).toBe('Manually updated text 2.');

    for (const c of chapters) {
      store.saveManuscript(c.num, c.content);
    }
    const current = store.manuscript();
    expect(current[0].text).toBe('Manually updated text 1.');
    expect(current[1].text).toBe('Manually updated text 2.');
    expect(assembleManuscript(current, 'My Book')).toBe(editedContent);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/manualEditing.test.ts`
Expected: PASS

- [ ] **Step 3: Modify `hooks/useBookGenerator.ts`**

1. Add state:
```typescript
const [isEditorialRunning, setIsEditorialRunning] = useState(false);
```
2. In `run(...)`:
When `editorial === true`:
- Do NOT clear `finalBookContent` or `finalMetadataJson`.
- Set `setIsEditorialRunning(true)`.
- In `finally`: set `setIsEditorialRunning(false)`.
3. In `refreshFromStore()`:
When `editorial` is active, re-assemble `finalBookContent` from `manuscript`:
```typescript
if (isEditorialRunning) {
  const input = store.loadInput();
  if (input) {
    const title = bookTitle(store.loadAuthor()?.title, input.premise);
    setFinalBookContent(assembleManuscript(manuscript, title));
  }
}
```
4. Implement `updateManualManuscript(newContent: string)`:
```typescript
function updateManualManuscript(newContent: string): boolean {
  if (busy.current) return false;
  const store = getStore();
  const parsed = parseBookChapters(newContent);
  if (!parsed.length) return false;
  const draft = store.loadAuthor();
  for (const c of parsed) {
    store.saveManuscript(c.num, c.content);
    if (draft?.chapters[c.num - 1]) {
      draft.chapters[c.num - 1].text = c.content;
    }
    if (draft?.desk) {
      draft.desk.files[`chapter-${c.num}.md`] = c.content;
    }
  }
  if (draft?.desk) {
    draft.desk.files['book.md'] = newContent;
    store.saveAuthor(draft);
  }
  refreshFromStore();
  publishFinal();
  return true;
}
```
5. Export `isEditorialRunning` and `updateManualManuscript` from hook.

- [ ] **Step 4: Verify all tests pass**

Run: `npm test`
Expected: PASS (all 212 tests pass)

- [ ] **Step 5: Commit**

```bash
git add hooks/useBookGenerator.ts tests/manualEditing.test.ts
git commit -m "feat(engine): support in-place editorial state tracking and manual manuscript updates"
```

---

### Task 2: Update `App.tsx` layout logic to keep `BookDisplay` visible during editorial review

**Files:**
- Modify: `App.tsx:85-110, 245-290`
- Test: `tests/threeZoneLayout.test.tsx`

**Interfaces:**
- Consumes from Task 1: `isEditorialRunning`, `updateManualManuscript`
- Passes to `BookDisplay`: `isEditorialRunning`, `editorialStatus`, `onManualSave`

- [ ] **Step 1: Check existing layout conditions in `App.tsx`**

Update `showProgress` and `isStudioLayout`:
```typescript
const isStudioLayout = (isLoading && !isEditorialRunning) || (isResumable && currentStep !== GenerationStep.Done);
const showProgress = isStudioLayout;
```
When `isEditorialRunning` is `true`, `showProgress` stays `false`, keeping the user on the book view.

- [ ] **Step 2: Pass editorial and manual save props to `BookDisplay`**

```tsx
<BookDisplay
  bookContent={finalBookContent}
  metadataJson={finalMetadataJson}
  onEdit={editBook}
  isEditorialRunning={isEditorialRunning}
  editorialStatus={developmentLabel}
  onManualSave={updateManualManuscript}
/>
```

- [ ] **Step 3: Run tests to verify `App` structure integrity**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add App.tsx
git commit -m "feat(ui): retain book display during editorial review"
```

---

### Task 3: Implement in-place review indicators and manual editing mode in `BookDisplay.tsx`

**Files:**
- Modify: `components/BookDisplay.tsx`
- Test: `tests/readerTools.test.tsx`

**Interfaces:**
- Consumes:
  - `isEditorialRunning?: boolean`
  - `editorialStatus?: string`
  - `onManualSave?: (newContent: string) => boolean`
- Features:
  - Review button displays spinning indicator and current step when `isEditorialRunning` is true, and is disabled during review.
  - Manuscript header provides `Edit` / `Read` toggle (or `Edit` button).
  - In `Edit` mode: an inline auto-adjusting textarea with identical font and padding, plus `Save` and `Cancel` buttons.
  - In `Read` mode: rendered markdown view.

- [ ] **Step 1: Write test for `BookDisplay` manual editing and running editorial indicator**

In `tests/readerTools.test.tsx`, add test:
```typescript
it('renders active editorial indicator when isEditorialRunning is true', () => {
  const html = renderToStaticMarkup(
    <BookDisplay
      bookContent="# Title\n\n## Chapter 1\n\nText."
      metadataJson="{}"
      onEdit={() => {}}
      isEditorialRunning={true}
      editorialStatus="Copyediting chapters..."
    />
  );
  expect(html).toContain('Copyediting chapters...');
});

it('renders manual edit button when onManualSave is provided', () => {
  const html = renderToStaticMarkup(
    <BookDisplay
      bookContent="# Title\n\n## Chapter 1\n\nText."
      metadataJson="{}"
      onEdit={() => {}}
      onManualSave={() => true}
    />
  );
  expect(html).toContain('Edit text');
});
```

- [ ] **Step 2: Run test to verify it fails initially**

Run: `npx vitest run tests/readerTools.test.tsx`
Expected: FAIL on new assertions

- [ ] **Step 3: Update `BookDisplay.tsx`**

1. Expand `BookDisplayProps`:
```typescript
interface BookDisplayProps {
  bookContent: string;
  metadataJson?: string | null;
  onReset?: () => void;
  onEdit?: () => void;
  isEditorialRunning?: boolean;
  editorialStatus?: string;
  onManualSave?: (newContent: string) => boolean;
}
```

2. Add state for editing:
```typescript
const [isEditing, setIsEditing] = useState(false);
const [editableContent, setEditableContent] = useState(manuscriptWithTitle);
const [saveError, setSaveError] = useState<string | null>(null);

useEffect(() => {
  if (!isEditing) {
    setEditableContent(manuscriptWithTitle);
  }
}, [manuscriptWithTitle, isEditing]);
```

3. Update the `Editorial Review` action button:
```tsx
{onEdit && (
  <button
    type="button"
    onClick={onEdit}
    disabled={isEditorialRunning}
    className="inline-flex items-center gap-1.5 h-6 px-2.5 text-xs font-medium whitespace-nowrap shrink-0 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 disabled:hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors"
  >
    <span className={isEditorialRunning ? 'animate-spin' : ''}>↻</span>
    <span>
      {isEditorialRunning
        ? (editorialStatus || 'Applying Review…')
        : findingsCount > 0 ? 'Apply Review' : 'Run Review'}
    </span>
  </button>
)}
```

4. Update the `Manuscript` card header and body:
In the header, alongside `Copy`:
```tsx
<div className="flex items-center gap-2">
  {onManualSave && !isEditing && (
    <button
      type="button"
      onClick={() => { setEditableContent(manuscriptWithTitle); setIsEditing(true); }}
      className="inline-flex items-center h-6 px-2.5 text-xs font-medium whitespace-nowrap shrink-0 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors"
    >
      Edit text
    </button>
  )}
  {isEditing && (
    <>
      <button
        type="button"
        onClick={() => {
          const success = onManualSave?.(editableContent);
          if (success !== false) {
            setIsEditing(false);
            setSaveError(null);
          } else {
            setSaveError('Could not save manuscript chapters.');
          }
        }}
        className="inline-flex items-center h-6 px-2.5 text-xs font-medium whitespace-nowrap shrink-0 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold rounded transition-colors"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => { setIsEditing(false); setEditableContent(manuscriptWithTitle); setSaveError(null); }}
        className="inline-flex items-center h-6 px-2.5 text-xs font-medium whitespace-nowrap shrink-0 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
      >
        Cancel
      </button>
    </>
  )}
  <button
    type="button"
    onClick={() => handleCopyToClipboard(manuscriptWithTitle)}
    className="inline-flex items-center h-6 px-2.5 text-xs font-medium whitespace-nowrap shrink-0 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded transition-colors"
  >
    {isCopied ? 'Copied' : 'Copy'}
  </button>
</div>
```

In the card body:
```tsx
<div className="p-6 sm:p-10 max-h-[72vh] overflow-y-auto">
  {saveError && (
    <p className="text-xs text-red-400 mb-3">{saveError}</p>
  )}
  {isEditing ? (
    <textarea
      value={editableContent}
      onChange={(e) => setEditableContent(e.target.value)}
      aria-label="Edit manuscript"
      className="w-full min-h-[50vh] p-4 bg-zinc-950 border border-zinc-800 rounded font-serif text-prose text-zinc-200 focus:outline-none focus:border-zinc-700 resize-y leading-relaxed"
    />
  ) : (
    <MarkdownView
      content={manuscriptWithTitle}
      className="font-serif text-prose break-words max-w-[62ch] mx-auto text-zinc-200"
    />
  )}
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/readerTools.test.tsx`
Expected: PASS

- [ ] **Step 5: Run full test suite and build**

Run: `npm test && npm run build`
Expected: All tests pass, build passes cleanly

- [ ] **Step 6: Commit**

```bash
git add components/BookDisplay.tsx tests/readerTools.test.tsx
git commit -m "feat(ui): add in-place editorial review status and direct manuscript text editing"
```

---

### Task 4: End-to-End Verification

**Files:**
- None (verification phase)

- [ ] **Step 1: Run complete test suite**
Run: `npm test`
Expected: 213/213 passed

- [ ] **Step 2: Run production build**
Run: `npm run build`
Expected: vite build succeeds with 0 errors

- [ ] **Step 3: Check git status and branch log**
Run: `git status -s && git log -n 5 --oneline`
Expected: clean working directory, clear commit history on `author-desk`
