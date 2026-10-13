import type { Passage } from './continuityEval';

export interface CalendarCandidate { passage: string; start: number; end: number; quote: string; ordinal: number; weekday: string; day: number; allowed: [number, number]; reason: string }
const ordinals: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
const dayWords = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'twenty-first', 'twenty-second', 'twenty-third', 'twenty-fourth', 'twenty-fifth', 'twenty-sixth', 'twenty-seventh', 'twenty-eighth', 'twenty-ninth', 'thirtieth', 'thirty-first'];

/** Necessary calendar constraint, independent of year: nth weekday falls in days 7(n-1)+1..7n.
 * This flags a contradictory calendar statement, not whether a fictional speaker is lying.
 */
export function calendarCandidates(passages: Passage[]): CalendarCandidate[] {
  const findings: CalendarCandidate[] = [];
  const occurrence = /\b(first|second|third|fourth|fifth)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(?:of|in)\s+(?:the\s+)?(?:month|January|February|March|April|May|June|July|August|September|October|November|December)\b([^.!?\n]{0,120})/gi;
  const date = new RegExp(`\\b(?:was|is|on|falls on)\\s+(?:the\\s+)?(${dayWords.slice().sort((a, b) => b.length - a.length).join('|')}|\\d{1,2}(?:st|nd|rd|th))\\b`, 'i');
  for (const p of passages) {
    for (const match of p.text.matchAll(occurrence)) {
      const specified = match[3].match(date);
      if (!specified) continue;
      const token = specified[1].toLowerCase();
      const day = /^\d/.test(token) ? Number.parseInt(token, 10) : dayWords.indexOf(token) + 1;
      const ordinal = ordinals[match[1].toLowerCase()], low = (ordinal - 1) * 7 + 1, high = Math.min(ordinal * 7, 31);
      if (day >= low && day <= high) continue;
      const end = match.index! + match[0].length - match[3].length + specified.index! + specified[0].length;
      findings.push({ passage: p.id, start: match.index!, end, quote: p.text.slice(match.index!, end), ordinal, weekday: match[2], day, allowed: [low, high],
        reason: `The ${match[1]} ${match[2]} of a month must fall on days ${low}–${high}; day ${day} cannot satisfy that description in any year.` });
    }
  }
  return findings;
}
