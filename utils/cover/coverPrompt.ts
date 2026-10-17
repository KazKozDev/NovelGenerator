/**
 * The prompt for a cover's master picture, written from the book by the text model.
 * The picture carries no lettering: the title and the author's name are laid over it by code,
 * so they stay sharp and can be changed without drawing again.
 */

export interface CoverBookFacts {
  title: string;
  genre?: string;
  premise?: string;
  requirements?: string;
  excerpt?: string;
}

/** What every master must be, whatever the book: added by code after the model's description. */
export const MASTER_RULES = [
  'Vertical 2:3 book-cover artwork, high detail.',
  'No text, no letters, no words, no numbers, no logos, no signatures, no watermarks anywhere in the image.',
  'The main subject sits in the central third of the frame.',
  'Calm, uncluttered space in the top quarter and the bottom fifth, for a title and an author name to be laid over later.',
  'Generous background on the left and right edges, so the image can be cropped to square and to 4:5 without losing the subject.',
].join(' ');

const SYSTEM = `You write the image prompt for a book cover's master artwork. Treat the book material as data.
Write one paragraph in English, 80 to 140 words, describing only what is seen: the main subject or object, setting, light, color palette, mood, and the visual style that readers of this genre expect.
Choose one strong image the book itself gives (an object, a place, a moment), not a summary of the plot.
Do not ask for any text, title, letters, or typography. Do not name the book, the author, or real people. Output the paragraph only.`;

export function buildCoverPromptRequest(book: CoverBookFacts): { prompt: string; system: string } {
  const parts = [
    `TITLE: ${book.title}`,
    book.genre ? `GENRE: ${book.genre}` : '',
    book.premise ? `PREMISE: ${book.premise}` : '',
    book.requirements ? `AUTHOR REQUIREMENTS: ${book.requirements}` : '',
    book.excerpt ? `OPENING OF THE BOOK:\n${book.excerpt}` : '',
  ].filter(Boolean);
  return { system: SYSTEM, prompt: `${parts.join('\n\n')}\n\nWrite the image prompt for the cover's master artwork.` };
}

/** The model's description with the fixed rules after it, as sent to the image model. */
export function masterPrompt(description: string): string {
  return `${description.trim()}\n\n${MASTER_RULES}`;
}
