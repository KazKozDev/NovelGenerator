/**
 * The fresh-idea bank: concrete material against repetitive scenes.
 *
 * A novel goes monotonous by shape long before it goes monotonous by word, and
 * the planner — shown the same staging history every chapter — keeps dealing
 * the same kind of scene. The bank answers with specificity rather than advice:
 * eighty concrete cards (places, objects, moves, constraints) issued
 * deterministically by chapter and scene, so a scene always has one new thing
 * to spend on the page. A model told "vary the staging" varies nothing; a
 * model handed one concrete constraint spends it.
 *
 * Deterministic on purpose: the same scene id always draws the same card, so
 * replans, rebases and resumes never reshuffle the chapter's material, and no
 * model call is spent choosing.
 */

export type FreshKind = 'place' | 'object' | 'move' | 'constraint';

export interface FreshCard {
  id: string;
  kind: FreshKind;
  text: string;
}

function cards(kind: FreshKind, prefix: string, texts: string[]): FreshCard[] {
  return texts.map((text, index) => ({
    id: `${prefix}${String(index + 1).padStart(2, '0')}`,
    kind,
    text,
  }));
}

const PLACES = [
  'Stage the decisive beat in a threshold space — a doorway, a stairwell, a jetty — where nobody can settle.',
  'Move the turning point outdoors into weather the characters cannot ignore.',
  'Play the key exchange in a room that belongs to someone absent, with their things watching.',
  'Set the confrontation where the characters must keep their voices down — a sickroom, a library, a sleeping house.',
  'Hold the scene in a workplace after hours, with the tools of the trade gone idle around them.',
  'Stage the admission in a moving vehicle or vessel, where neither party can walk away cleanly.',
  'Bring the decision into a crowded public place where it must be conducted in code.',
  "Set the scene at the day's edge — first light or last — and let the failing light set the deadline.",
  'Confine the turning point to a small enclosed space: a pantry, a lift, a boat cabin.',
  'Play the revelation somewhere high — a roof, a gallery, a hill — with the drop present.',
  'Set the quarrel beside running water and let interruptions carry part of the meaning.',
  'Stage the scene in a place being cleaned, repaired, or dismantled around the speakers.',
  "Hold the negotiation in somebody else's kitchen, with food or drink preparation pacing the talk.",
  'Move the characters to a waiting place — a platform, an anteroom, a queue — where the wait itself pressures them.',
  'Set the confession where it can be overheard, and let the risk of ears shape every sentence.',
  'Play the scene in a shop, stall, or market, with buying and selling undercutting the real transaction.',
  'Stage the farewell somewhere the character is already half-packed to leave.',
  'Set the discovery in a cellar, attic, or archive — a place where the past is physically stored.',
  'Hold the scene at a table with an unfinished meal going cold between them.',
  'Move the ending beat outside the room where the scene began; do not let it close where it opened.',
];

const OBJECTS = [
  'Put a once-ordinary object in a character’s hands and make it do new work — a key that no longer fits, a cup kept too long.',
  'Let a written thing change hands: a note, a ledger entry, a marked page — quoted briefly, never summarized.',
  'Give one character something fragile to hold during the hard talk, and let their handling of it show the strain.',
  "Introduce a tool of someone's trade used for the wrong purpose, once.",
  'Let the weather leave a physical trace inside the room — wet footprints, a damp coat, blown-out candles.',
  'Place an unfinished piece of work in view — mending, a half-written letter, an unhauled net — and have someone touch it.',
  "Use a lamp, candle, or shuttered window: change the light once, deliberately, at the scene's turn.",
  'Let food or drink carry one beat — refused, accepted, spilled — without becoming the subject.',
  'Give the POV character a small physical task (tying, counting, stacking) that frays as pressure rises.',
  'Let a sound from offstage interrupt once — a bell, an animal, a dropped tool — and make someone answer it or pointedly not.',
  'Put a locked or stuck container in the scene; what matters is who tries it and who stops them.',
  'Let one character carry visible evidence of the previous scene — mud, a bruise, an unanswered letter — and have it noticed.',
  'Use a mirror, window-glass, or still water once: a glimpse, not a portrait.',
  "Place two characters on opposite sides of a table, counter, or fence for the scene's hardest minute.",
  'Let a clock, tide, or boiling pot impose a real deadline the characters can hear.',
  "Give the scene one smell that does not belong to its setting, noticed once and left to be explained by action — never by a speech about it.",
  'Let a character pocket, hide, or abandon a small object mid-scene; someone else may or may not see.',
  'Break or spill exactly one thing; the mess must be dealt with before the scene can proceed.',
  "Use a garment — a coat, shawl, boots — as the scene's barometer: put on, taken off, clutched, lent.",
  'End the scene with an object changing possession, place, or state — something held differently than at the start.',
];

const MOVES = [
  "Let the scene's most important sentence be interrupted — and never finished aloud.",
  'Have one character ask the question they have been avoiding since the chapter began.',
  'Reverse who wants something halfway through: the asker becomes the asked.',
  'Let a minor practical problem (a stuck door, a missing coin, a late horse) force the real issue into the open.',
  'Give one character a piece of good news they cannot enjoy, and show why in one action.',
  'Have someone tell a short true story from before the book began — under six lines — that reframes the present choice.',
  'Let two characters briefly cooperate on a physical task before returning to opposition.',
  'Have the POV character notice one thing the other tries to hide, and decide silently what to do with it.',
  'Introduce a third presence — a child, an animal, a messenger — that changes what can be said, then remove them.',
  'Let the scene turn on a refusal: someone will not do the small thing asked, and the reason costs them.',
  "Have a character repeat back the other's words wrongly, so the correction exposes what matters.",
  'Let someone laugh at the worst moment — briefly, involuntarily — and pay for it.',
  'Give the scene one deliberate silence: no dialogue for a full beat while something is done.',
  'Have a character start to leave, then stop at the threshold with one more thing unsaid — or said.',
  "Let the plan's outcome arrive through a concession nobody planned to make.",
  'Have someone appeal to a shared memory by acting on it, not by narrating it.',
  "Let the weakest person present settle the scene's practical question while the strong argue principle.",
  'Have a character write something down mid-scene — and let what they write differ from what they said.',
  "Let the scene's last line be a concrete offer, order, or departure — not a summary of feeling.",
  "Have one character deliberately soften another's words to a third party, once — and let the softening show.",
];

const CONSTRAINTS = [
  'No interior monologue longer than two lines in this scene; let intent surface in speech and handling.',
  'Nobody in this scene explains anything they already knew coming in — transform it or exploit it, never restate it.',
  "The POV character may not name their own emotion once; show it in the hands, the breath, the timing.",
  'No new named person, place, or rule may enter in this scene; spend only what the book has established.',
  'Keep every speech under three lines; pressure compresses, it does not orate.',
  'Do not describe the room twice: one establishing glance, then only what the action touches.',
  'One sensory channel leads this scene (sound, smell, or touch) — the others stay quiet.',
  'No flashback longer than a sentence; the past may knock once, not move in.',
  "Withhold the scene's key noun until the midpoint — circle it through pronouns and handling first.",
  'End on the action, not after it: no trailing paragraph that explains what the ending meant.',
  'Begin mid-motion, not with arrival: the scene opens after someone has already started doing something.',
  "No questions as dialogue for the scene's first half — statements and orders only.",
  'One character speaks markedly less than usual; let the shortage itself be noticed.',
  'No similes in this scene; name things directly and move on.',
  'Confine the whole scene to a single continuous stretch of time — no jumps, no summaries of hours.',
  "The outcome must cost someone something visible on the page — an object, a position, a certainty.",
  "Resolve the scene's question through something done or found or lost — never through a speech about it.",
  'No character may agree with another aloud in this scene; accord, if any, shows only in coordinated action.',
  'Keep the cast to those the plan names; no helpful stranger, no convenient arrival.',
  "Write the scene's middle as a single unbroken action or exchange — no cutaways, no parallel business.",
];

/** The whole bank: twenty places, twenty objects, twenty moves, twenty constraints. */
export const FRESH_BANK: FreshCard[] = [
  ...cards('place', 'P', PLACES),
  ...cards('object', 'O', OBJECTS),
  ...cards('move', 'M', MOVES),
  ...cards('constraint', 'C', CONSTRAINTS),
];

/** 32-bit FNV-1a: small, stable, and dependency-free. */
function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The card for one scene. Deterministic in chapter and scene id: the same
 * scene always draws the same card, so replans and rebases never reshuffle.
 */
export function freshCard(chapter: number, sceneId: string): FreshCard {
  return FRESH_BANK[hash32(`${chapter}:${sceneId}`) % FRESH_BANK.length];
}

/** The constraint text for one scene, as the writer package carries it. */
export function freshConstraint(chapter: number, sceneId: string): string {
  const card = freshCard(chapter, sceneId);
  return `[${card.id}/${card.kind}] ${card.text}`;
}

/**
 * A small deterministic palette for the chapter planner: consecutive cards
 * from a chapter-seeded offset, wrapping around the bank.
 */
export function freshPalette(chapter: number, count = 4): FreshCard[] {
  const start = hash32(`chapter:${chapter}`) % FRESH_BANK.length;
  return Array.from({ length: count }, (_, step) => FRESH_BANK[(start + step) % FRESH_BANK.length]);
}

/** The palette as the P03 prompt carries it: one card per line, with ids. */
export function describeFreshPalette(chapter: number, count = 4): string {
  return freshPalette(chapter, count)
    .map(card => `- ${card.id} (${card.kind}): ${card.text}`)
    .join('\n');
}
