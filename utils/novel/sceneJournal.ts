import { journalKinds, specPrompt, type ChapterRecord, type JournalKind, type JournalNote, type NovelRun, type SceneJournal } from './contracts';
import { structuredResponse, type NovelLLM } from './review';

/** Long enough to identify the passage, short enough that a note cannot smuggle the scene back in. */
const maxQuote = 200;
/** A scene establishes a handful of things worth carrying. A longer list is the plan written again. */
const maxNotes = 12;

/**
 * Whether a quotation is actually in the prose it claims to come from.
 *
 * Compared on collapsed whitespace, because a model that copies a line across a paragraph break
 * returns it with the break flattened, and losing a true note to a newline is losing continuity to
 * typography. Nothing else is normalized: a quotation that differs by a word is a quotation the
 * model composed, and this pass exists to keep composed facts out of the record.
 */
export function quotedFrom(quote: string, prose: string): boolean {
  const flatten = (text: string) => text.replace(/\s+/g, ' ').trim();
  const flat = flatten(quote);
  return flat.length >= 8 && flatten(prose).includes(flat);
}

const journalSchema = {
  type: 'object', required: ['notes'],
  properties: {
    notes: {
      type: 'array', maxItems: maxNotes,
      items: {
        type: 'object', required: ['kind', 'note', 'quote'],
        properties: {
          kind: { type: 'string', enum: [...journalKinds] },
          note: { type: 'string', minLength: 1 },
          quote: { type: 'string', minLength: 1 },
        }, additionalProperties: false,
      },
    },
  }, additionalProperties: false,
};

/**
 * Read a freshly written scene and record what it established, quoting the scene for each note.
 *
 * One extra call per scene. It buys the thing the chapter had no way to know: the plan says what the
 * scene was supposed to do, the previous scene's last 1200 characters say how it sounded, and
 * neither says that the letter is now in the clerk's drawer, that the protagonist left by the yard
 * door, or that nobody has yet answered the question she asked in the second paragraph.
 *
 * Notes whose quotation is not in the scene are dropped rather than corrected: a note the prose does
 * not support is exactly the invented continuity this record exists to prevent. If every note falls
 * away, the entry is empty and the writer of the next scene is no worse off than before.
 */
export async function readSceneJournal(run: NovelRun, chapter: ChapterRecord, sceneIndex: number, prose: string, llm: NovelLLM): Promise<SceneJournal> {
  const scene = (chapter.plan.detailedScenes || [])[sceneIndex];
  const sceneId = scene?.sceneId || `scene-${sceneIndex + 1}`;
  const notes = await structuredResponse(`${specPrompt(run.spec)}\nCHAPTER ${chapter.number}, SCENE ${sceneIndex + 1} AS WRITTEN:\n${prose}\nRecord what this scene, as written above, leaves true for the scene that follows it. Report only what the prose on this page establishes; the chapter plan is not evidence and nothing may be inferred from it.\nUse these kinds: "position" — where a character is, or has gone, when the scene ends; "possession" — who holds or has lost an object that matters; "event" — something that happened and cannot be undone; "knowledge" — what a named character now knows, believes or has been told, and who told them; "openQuestion" — a question the scene raised and did not answer.\nEach note is one short sentence, and "quote" is a passage of at most ${maxQuote} characters copied from the scene above exactly as it appears there, which establishes that note. A note whose quotation is not in the scene will be discarded. Return at most ${maxNotes} notes and no fewer than the scene supports: JSON {"notes":[{"kind":"position","note":"...","quote":"..."}]}.`,
    'You keep the continuity record for a novel in progress. You report only what the supplied prose establishes and compose nothing of your own.', llm, ['notes'], raw => {
      if (!Array.isArray(raw.notes)) throw new Error('Return a notes array.');
      const kept: JournalNote[] = [];
      for (const note of raw.notes) {
        if (!note || typeof note !== 'object') continue;
        const { kind, note: text, quote } = note as { kind: unknown; note: unknown; quote: unknown };
        if (!journalKinds.includes(kind as JournalKind)) continue;
        if (typeof text !== 'string' || !text.trim() || typeof quote !== 'string') continue;
        if (!quotedFrom(quote, prose)) continue;
        kept.push({ kind: kind as JournalKind, note: text.trim(), quote: quote.trim().slice(0, maxQuote) });
      }
      // Nothing verifiable came back. Ask once more inside structuredResponse rather than record a
      // page of assertions the scene does not make; the caller survives an empty entry either way.
      if (!kept.length) throw new Error('No note carried a quotation found in the scene. Copy each quotation from the scene above, character for character.');
      return kept.slice(0, maxNotes);
    }, { temperature: 0.1, maxTokens: 4096, schema: journalSchema });
  return { sceneId, notes };
}

/**
 * The journal as the next scene's writer reads it: the notes of every scene already written in this
 * chapter, in order, still marked as a draft record of a chapter nobody has accepted yet.
 */
export function journalSoFar(chapter: ChapterRecord, sceneIndex: number): SceneJournal[] {
  const written = (chapter.plan.detailedScenes || []).slice(0, sceneIndex).map(scene => scene.sceneId);
  return (chapter.sceneJournal || []).filter(entry => written.includes(entry.sceneId) && entry.notes.length);
}
