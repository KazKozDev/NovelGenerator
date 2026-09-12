import { journalKinds, specPrompt, type ChapterRecord, type JournalKind, type JournalNote, type NovelRun, type SceneJournal } from './contracts';
import { structuredResponse, type NovelLLM } from './review';

/** Long enough to identify the passage, short enough that a note cannot smuggle the scene back in. */
const maxQuote = 200;
/**
 * A scene establishes a handful of things worth carrying. A longer list is the plan written again.
 * Raised from twelve when 'told' was added, so the new kind takes its own room rather than crowding
 * out the facts the next scene needs for continuity.
 */
const maxNotes = 14;

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
    shift: {
      type: 'object', required: ['happened', 'quote'],
      properties: {
        happened: { type: 'boolean' },
        quote: { type: 'string' },
      }, additionalProperties: false,
    },
    reported: {
      type: 'array', maxItems: 4,
      items: {
        type: 'object', required: ['beat', 'quote'],
        properties: { beat: { type: 'string' }, quote: { type: 'string' } }, additionalProperties: false,
      },
    },
    secondTake: {
      type: 'array', maxItems: 3,
      items: {
        type: 'object', required: ['beat', 'first', 'second'],
        properties: { beat: { type: 'string' }, first: { type: 'string' }, second: { type: 'string' } }, additionalProperties: false,
      },
    },
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
  // The plan says what this scene was to move. Asking for it here costs nothing — the call is already
  // being made, and the answer has to carry a quotation like every other note, so a shift the scene
  // did not perform cannot be asserted into the record.
  const declared = scene?.shift;
  const shiftQuestion = declared
    ? `\nThe plan for this scene declared one change: ${declared.register} moves from "${declared.from}" to "${declared.to}". Answer whether the scene above performs that move on the page. "happened" is true only if a passage of this scene shows it — the act, the words, the perception that makes the new state true — and false if the scene only approaches it, reports it as already settled, or ends where it began. "quote" is the passage that performs it, copied exactly and at most ${maxQuote} characters; when happened is false, quote is an empty string. Add this as a "shift" object alongside the notes.`
    : '';
  // Two more readings of the same page, in the same call. Both are the defect the chapter review finds
  // too late: a beat the prose reports instead of performing, and a beat the prose performs and then
  // performs again after a break. Both answers carry quotations, and a quotation that is not in the
  // scene is discarded exactly as an invented note is.
  const beats = (scene?.keyMoments || []).filter(beat => typeof beat === 'string' && beat.trim());
  const inspection = `\nTwo further readings of the same page, each grounded the same way.\n"reported": the scene was required to put these beats on the page: ${JSON.stringify(beats)}. List any of them the prose only reports — a sentence saying the thing happened, had happened, or was done, in place of the thing happening in front of the reader. "beat" names which one, "quote" is the reporting sentence copied exactly. A beat performed on the page does not belong in this list, and neither does one the scene leaves for later.\n"secondTake": list any beat this scene performs, finishes, and then performs again — the same confrontation, refusal, discovery or admission staged a second time after a break, usually in different words. "beat" names it, "first" and "second" are short passages copied exactly from each occurrence. A beat referred to again in passing is not a second take; a beat played out again is. Both lists are empty for most scenes, and an empty list is the expected answer.`;
  let shiftQuote: string | undefined;
  let reported: { beat: string; quote: string }[] = [];
  let secondTake: { beat: string; first: string; second: string }[] = [];
  const notes = await structuredResponse(`${specPrompt(run.spec)}\nCHAPTER ${chapter.number}, SCENE ${sceneIndex + 1} AS WRITTEN:\n${prose}\nRecord what this scene, as written above, leaves true for the scene that follows it. Report only what the prose on this page establishes; the chapter plan is not evidence and nothing may be inferred from it.\nUse these kinds: "position" — where a character is, or has gone, when the scene ends; "possession" — who holds or has lost an object that matters; "condition" — the state a character's body and clothing are in when the scene ends: what is torn, missing, put on, taken off, bleeding, soaked or bare, and which hand or foot it is; "event" — something that happened and cannot be undone; "knowledge" — what a named character now knows, believes or has been told, and who told them; "openQuestion" — a question the scene raised and did not answer; "told" — material this scene has already put on the page and that the next scene must therefore not perform again: a place described, a motive or a piece of backstory explained, an atmosphere established, an emotional beat played out, an object or a face given its description, an image or figure of speech the scene has spent. The first six say what is now true; "told" says what has already been said, and it is the one the next scene needs in order not to write the same passage a second time. Record a "told" note for every substantial description, explanation or emotional beat this scene performed, naming it in a few words — "the archive room is described", "Mara's guilt over the fire is played out" — never restating the passage itself.\nEach note is one short sentence, and "quote" is a passage of at most ${maxQuote} characters copied from the scene above exactly as it appears there, which establishes that note. A note whose quotation is not in the scene will be discarded. Return at most ${maxNotes} notes and no fewer than the scene supports: JSON {"notes":[{"kind":"position","note":"...","quote":"..."}]${declared ? ',"shift":{"happened":true,"quote":"..."}' : ''},"reported":[],"secondTake":[]}.${shiftQuestion}${inspection}`,
    'You keep the continuity record for a novel in progress. You report only what the supplied prose establishes and compose nothing of your own.', llm, ['notes'], raw => {
      if (!Array.isArray(raw.notes)) throw new Error('Return a notes array.');
      // Read before the notes are filtered so a retry of the notes re-reads this too. A claim without
      // a quotation found in the scene is exactly the assertion this record refuses from a note.
      const claim = raw.shift as { happened?: unknown; quote?: unknown } | undefined;
      shiftQuote = declared && claim?.happened === true && typeof claim.quote === 'string' && quotedFrom(claim.quote, prose)
        ? claim.quote.trim().slice(0, maxQuote)
        : undefined;
      const trimmed = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, maxQuote) : '';
      reported = (Array.isArray(raw.reported) ? raw.reported : [])
        .filter((item: any) => item && typeof item.beat === 'string' && item.beat.trim() && typeof item.quote === 'string' && quotedFrom(item.quote, prose))
        .slice(0, 4)
        .map((item: any) => ({ beat: item.beat.trim(), quote: trimmed(item.quote) }));
      secondTake = (Array.isArray(raw.secondTake) ? raw.secondTake : [])
        .filter((item: any) => item && typeof item.beat === 'string' && item.beat.trim()
          && typeof item.first === 'string' && quotedFrom(item.first, prose)
          && typeof item.second === 'string' && quotedFrom(item.second, prose)
          && item.first.trim() !== item.second.trim())
        .slice(0, 3)
        .map((item: any) => ({ beat: item.beat.trim(), first: trimmed(item.first), second: trimmed(item.second) }));
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
  return {
    sceneId, notes,
    ...(shiftQuote ? { shiftQuote } : {}),
    ...(reported.length ? { reported } : {}),
    ...(secondTake.length ? { secondTake } : {}),
  };
}

/**
 * The journal as the next scene's writer reads it: the notes of every scene already written in this
 * chapter, in order, still marked as a draft record of a chapter nobody has accepted yet.
 */
export function journalSoFar(chapter: ChapterRecord, sceneIndex: number): SceneJournal[] {
  const written = (chapter.plan.detailedScenes || []).slice(0, sceneIndex).map(scene => scene.sceneId);
  return (chapter.sceneJournal || []).filter(entry => written.includes(entry.sceneId) && entry.notes.length);
}
