/**
 * What each store wants told about AI in the book, and where: in its upload form, in the listing's description, or in
 * the audio's credits. The copyright page inside the files (utils/imprintConstants.ts) carries the same AI note for
 * every edition; the stores differ in what they ask at upload and in whether they take a digital voice at all.
 *
 * Store rules as found in October 2026: KDP asks on the Content tab whether text, images or translations are
 * AI-generated (even when edited afterwards); Apple asks when a material portion is AI-generated; ACX requires human
 * narration unless Amazon itself authorises otherwise (Virtual Voice is Amazon's own, through KDP); Findaway
 * (Spotify for Authors) marks digital-voice titles and opens their description with "This audiobook is narrated by a
 * digital voice", taking them from approved voice partners. Rules move: each note says to check the form itself.
 */
export type Narration = 'digital' | 'human';
export type DisclosureLevel = 'ok' | 'warn' | 'fail';

export interface Disclosure {
  /** Where the author gives it: "KDP · Content tab", "Description". */
  where: string;
  text: string;
  /** Text to paste as it is. */
  paste?: boolean;
}

export const DIGITAL_VOICE_LINE = 'This audiobook is narrated by a digital voice.';

export interface DisclosureFacts {
  narration: Narration;
  /** The cover was drawn by an image model (the Cover studio), not uploaded finished. */
  aiCover: boolean;
}

const kdpForm = (facts: DisclosureFacts): Disclosure[] => [
  { where: 'KDP · Content tab', text: 'AI-generated content: Yes · Text: "Entire work, with extensive editing" (or as much as is true)' },
  { where: 'KDP · Content tab', text: facts.aiCover ? 'Images: Yes — the cover was drawn by an image model' : 'Images: answer for the cover you uploaded' },
];

/** What to declare for one edition, keyed "<group>:<store id>" as on the Publish stage. */
export function platformDisclosures(key: string, facts: DisclosureFacts): Disclosure[] {
  const digital = facts.narration === 'digital';
  switch (key) {
    case 'ebook:kindle':
    case 'print:kdp_paperback':
    case 'print:kdp_hardcover':
      return kdpForm(facts);
    case 'ebook:apple':
      return [{ where: 'Apple Books · when submitting', text: 'Disclose that a material portion of the text is AI-generated' }];
    case 'ebook:google':
    case 'print:ingram_paperback':
      return [{ where: 'Upload form', text: 'Answer the AI-content question as KDP\'s: AI-generated text, edited by the author' }];
    case 'audio:acx':
      return digital
        ? [{ where: 'ACX', text: 'ACX takes human narration only; a digital voice is refused. Amazon\'s own Virtual Voice is offered through KDP for the ebook instead.' }]
        : [{ where: 'ACX · Opening credits', text: 'Name the narrator in the opening credits: "Narrated by …"' }];
    case 'audio:spotify':
    case 'audio:google':
      return digital
        ? [
            { where: 'Upload form', text: 'Mark the narration as a digital voice' },
            { where: 'Description, first line', text: DIGITAL_VOICE_LINE, paste: true },
          ]
        : [{ where: 'Upload form', text: 'Name the human narrator' }];
    case 'video:youtube':
      return digital ? [{ where: 'Description', text: `${DIGITAL_VOICE_LINE} (added to the saved description)` }] : [];
    default:
      return [];
  }
}

/** Whether a store takes the recording's kind of narration at all. */
export function narrationCheck(storeId: string, narration: Narration): { level: DisclosureLevel; text: string } | null {
  if (narration === 'human') return null;
  if (storeId === 'acx') return { level: 'fail', text: 'ACX takes human narration only; this recording is a digital voice' };
  if (storeId === 'spotify') return { level: 'warn', text: 'Findaway takes digital-voice audiobooks from approved voice partners; check the form accepts this one' };
  if (storeId === 'google') return { level: 'warn', text: 'Declare the digital voice when uploading' };
  return null;
}
