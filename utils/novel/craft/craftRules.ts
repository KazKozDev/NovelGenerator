/** Operational instructions derived from bestbook.md, not a guide dumped into context. */
export const CRAFT_RULES = {
  contract: { sections: ['0', '4.1', '9'], instruction: 'Extract the reader contract. Preserve every supplied mandatory event and ending; distinguish author freedom from user requirements. Name the concrete genre experience the story will deliver.' },
  form: { sections: ['1.2', '5', '6.1', '6.3'], instruction: 'Choose a form for this story, with a reason. Respect the selected writing method, POV and chapter layout. A framework serves the story; do not impose positive healing or three-act conflict on every genre.' },
  concept: { sections: ['6.2', '6.4', '13'], instruction: 'Grow the accepted logline into a causal synopsis. Specify the hero, disruption, goal, personal stakes, final costly action and actual outcome. Do not substitute a different premise.' },
  truth: { sections: ['2.2', '3.3', '6.3'], instruction: 'Invent what actually happens before deciding how it is revealed. Every decisive event needs actor, intention, concrete action, access, means, prerequisites, result and traces. Distinguish deliberate reader ambiguity from an author who has not solved the mechanism. Crime and discovery are separate causal timelines.' },
  characters: { sections: ['4.9', '4.9.1', '7.1', '7.3'], instruction: 'Build action engines, not biography sheets: belief/code → tactic → initial benefit → mistake/testing → rising cost → irreversible choice. Give supporting characters their own wants and thematic answers. Distinguish voices and perceptual attention with short original examples.' },
  opposition: { sections: ['4.2', '4.3', '4.11'], instruction: 'Build independent opposition with its own objective, seductive logic, resources, limits, knowledge and responses. Offstage actions must cause observable consequences. Do not grant omniscience or invent a villain where a system/environment is the opposition.' },
  beats: { sections: ['1.3', '4.6', '4.9'], instruction: 'Anchor the ending in a costly protagonist action. Work back to irreversible commitment, strategy change and collapse/testing. Each turn changes available methods, not just information. Match chosen form; percentages guide pacing rather than impose genre-inappropriate events.' },
  promises: { sections: ['0', '3.2', '10'], instruction: 'Build promise → tangible progress → payoff chains across macro/meso/micro scales. Each payoff is an action and consequence, not a declaration that the hero understands. Keep meaningful unresolved expectations through the middle without manufacturing questions.' },
  payoffs: { sections: ['2.2', '4.12'], instruction: 'Reverse-engineer the climax: identify abilities, objects, relationships and clues it requires. Plant them organically in actions with their own goals, remind in changing contexts, and change their meaning at payoff. Fair play: misinterpret evidence, never hide what the viewpoint witnessed.' },
  revelations: { sections: ['2.2', '4.4', '4.6', '7.1'], instruction: 'Separate objective truth, each character knowledge/belief and reader evidence. Choose mystery, suspense, irony or direct presentation deliberately. Track acquisition actions per character. An already revealed fact may gain new meaning but cannot be discovered for the first time again.' },
  pacing: { sections: ['4.5', '4.7', '4.8', '5.3'], instruction: 'Compose emotional contrast and earned empathy. Alternate action, processed reaction and compressed transitions as needed. Choose distance, time scale, detail function and syntax for the scene. Carry cliffhanger consequences forward. Do not make every scene equally dense, breathless or microscopic.' },
  graph: { sections: ['3.3', '4.3', '5.3', '5.4'], instruction: 'Derive scenes from consequences: intention → resistance → costly choice → changed resources/relationships/options → next goal. Every dependency names an actual consequence. Narrow safe exits, not merely louder threats. Use the setting as a constraint. Preserve the resolved event mechanism and reveal schedule.' },
  adapt: { sections: ['3.1', '3.2', '4.4', '12'], instruction: 'Use the blind reader reaction to author the next presentation decision. A correct guess can sustain suspense; do not rewrite canon merely to surprise. Improve progression, evidence, concealment or reinterpretation through concrete actions in unwritten scenes only. Reader guesses are not facts.' },
  enact: { sections: ['5.3', '7.1', '12'], instruction: 'Extract only what the exact prose demonstrates. Planned events are not enacted events. Cite exact quotes for actions, acquisitions, resources and relationships. Record style work for later; do not polish the discovery draft.' },
  execution: { sections: ['5.3', '7.1', '7.2', '7.3', '7.4'], instruction: 'Write the present event from permitted viewpoint knowledge. Follow its chosen distance, rhythm and voices. Metaphors may enrich but never replace a required physical event. Use sensory detail for a dramatic function, not as compulsory filler. Let conversations pursue conflicting aims; direct answers are allowed when earned.' },
  revision: { sections: ['6.2', '8.1', '8.3'], instruction: 'Restructure the whole book before line editing. Cut/compress before adding explanations. Make one coherent plan for all affected scenes, including moved revelations and retroactive setups. Preserve effective material and the book contract. Finish the opening promise and enact the ending rather than summarize its solution.' },
} as const;
export type CraftRule = keyof typeof CRAFT_RULES;
export function operationRules(name: CraftRule): string {
  const rule = CRAFT_RULES[name];
  return `BESTBOOK OPERATION (${name}; sections ${rule.sections.join(', ')}): ${rule.instruction}`;
}

/** Extracts the trailing words of a scene for Tail-Head handoff. */
export function extractLastWords(text: string, count: number = 180): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const words = trimmed.split(/\s+/);
  if (words.length <= count) return trimmed;
  return words.slice(-count).join(' ');
}

/** Stock literary tropes and clichés that degrade novel texture when repeated across chapters. */
export const STOCK_SENSORY_CLICHES = [
  'struck match', 'banked coal', 'wire through cloth', 'burnt sage',
  'copper taste', 'taste of copper', 'taste of pennies', 'copper in his mouth', 'copper in her mouth',
  'skin dry as parchment', 'skin like parchment', 'parchment skin',
  'cold iron', 'silver cup', 'second pulse', 'throat tight as wire',
  'hollowed out', 'bone-dry', 'jaw worked', 'air went thin', 'swallowed hard',
  'breath hitched', 'pulse leaped', 'bile rose', 'stomach dropped',
];

/** Extracts unique similes, sensory clichés, and tropes from previously written scenes. */
export function extractUsedImagery(pages: string[]): string[] {
  if (!pages.length) return [];
  const found = new Set<string>();
  const combined = pages.join('\n\n').toLowerCase();

  // 1. Stock clichés
  for (const trope of STOCK_SENSORY_CLICHES) {
    if (combined.includes(trope)) {
      found.add(trope);
    }
  }

  // 2. Simile extraction ("like a ...", "as though ...", "as a ...")
  const simileRegex = /\b(?:like|as though|as if)\s+(?:a|an|the)\s+([a-z-]+(?:\s+[a-z-]+){1,2})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = simileRegex.exec(combined)) !== null) {
    const phrase = match[0].trim();
    if (phrase.length <= 40) {
      found.add(phrase);
    }
  }

  return Array.from(found);
}

/**
 * Strips overt post-dialogue subtext decoding sentences
 * (e.g. "He heard what was underneath the question...", "What he really meant was...").
 */
export function stripSubtextDecoding(prose: string): string {
  if (!prose) return '';
  // Match sentences or lines that decode dialogue subtext immediately after spoken lines
  const decodingPatterns = [
    /(?:(?<=\.|\n|^)\s*)(?:he|she|they|[A-Z][a-z]+)\s+(?:heard|knew|understood|sensed|felt|recognized)\s+(?:the\s+shape\s+of\s+the\s+sentence|what\s+(?:was\s+underneath|he\s+really\s+meant|she\s+really\s+meant|they\s+really\s+meant)|the\s+(?:unspoken|hidden)\s+meaning\s+(?:underneath|behind|beneath))[^\.\n!?]*[\.!?]/gi,
    /(?:(?<=\.|\n|^)\s*)(?:what\s+(?:he|she|they|[a-z]+)\s+really\s+meant\s+was)[^\.\n!?]*[\.!?]/gi,
    /(?:(?<=\.|\n|^)\s*)(?:underneath\s+the\s+(?:words|sentence|voice),\s+(?:there\s+was|he\s+heard|she\s+heard))[^\.\n!?]*[\.!?]/gi,
  ];

  let cleaned = prose;
  let changed = false;
  for (const pattern of decodingPatterns) {
    if (pattern.test(cleaned)) {
      changed = true;
      cleaned = cleaned.replace(pattern, (match) => (match.startsWith('\n') ? '\n' : ' '));
    }
  }

  if (!changed) return prose;
  return cleaned.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

/**
 * Joins chapter scenes with automatic camera breaks (* * *) when POV changes between scenes.
 */
export function joinScenesWithCameraBreaks(scenes: Array<{ text: string; pov?: string }>): string {
  if (!scenes.length) return '';
  let result = scenes[0].text;
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1];
    const curr = scenes[i];
    const prevPov = prev.pov?.trim().toLowerCase();
    const currPov = curr.pov?.trim().toLowerCase();
    const isCameraShift = Boolean(prevPov && currPov && prevPov !== currPov);
    const sep = isCameraShift ? '\n\n* * *\n\n' : '\n\n';
    result += sep + curr.text;
  }
  return result;
}
