import { fillTemplate } from '../prompts';
import voicesRaw from '../../../prompts/THESIS_SCENE_VOICES.md?raw';
import { structuredResponse, type NovelLLM } from './llm';
import type { Thesis, ThesisPlan } from './theses';

/**
 * Before a scene is written, the people in it say — each alone, from what that person knows —
 * what they came for, what they will say and what they will keep back. The writer is then
 * given what can be heard and seen of the others, and everything of the point-of-view
 * character. A scene written from one summary has everyone serving the summary; a scene
 * written from several wants has people at cross purposes, which is what a scene is.
 * This is a call that writes. Nothing here reviews anything.
 */
export interface SceneVoice { who: string; i_came_for: string; i_will_say: string[]; i_will_not_say: string; my_hands: string; when_refused: string }

const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

export function readVoices(raw: any, names: string[]): SceneVoice[] {
  if (!Array.isArray(raw?.voices)) throw new Error('voices must be an array, one entry per person.');
  const wrong: string[] = [];
  for (const name of names) if (!raw.voices.some((voice: any) => voice?.who === name)) wrong.push(`no entry for ${name}`);
  raw.voices.forEach((voice: any, at: number) => {
    for (const field of ['i_came_for', 'i_will_not_say', 'my_hands', 'when_refused']) if (!text(voice?.[field])) wrong.push(`voices[${at}].${field} is empty`);
    if (!Array.isArray(voice?.i_will_say) || !voice.i_will_say.length || voice.i_will_say.some((line: unknown) => !text(line))) wrong.push(`voices[${at}].i_will_say must be a nonempty list of lines`);
  });
  if (wrong.length) throw new Error(`The voices are incomplete: ${wrong.join('; ')}. Keep everything else; fill only these.`);
  return raw.voices.filter((voice: any) => names.includes(voice.who));
}

/** Empty for a scene with one person in it: there is nobody to be at cross purposes with. */
export async function sceneVoices(plan: ThesisPlan, thesis: Thesis, system: string, llm: NovelLLM): Promise<string> {
  const people = thesis.participants.flatMap(participant => {
    const character = plan.characters.find(c => c.id === participant.character_id);
    return character ? [{ name: character.name, i_want_in_life: character.goal, i_want_here: participant.intention, i_know: participant.knows, i_believe: (participant as any).believes || [], i_mean_to: (participant as any).does || '' }] : [];
  });
  if (people.length < 2) return '';
  const pov = plan.characters.find(c => c.id === thesis.pov_id)?.name;
  const voices = await structuredResponse(fillTemplate('THESIS_SCENE_VOICES', voicesRaw, { where: `${thesis.where}; ${thesis.when}`, before: thesis.state_before, people: JSON.stringify(people) }), system, llm, ['voices'],
    raw => readVoices(raw, people.map(person => person.name)), { stage: 'thesis-scene-voices', route: 'validator', maxTokens: 3072, temperature: 0.9, maxAttempts: 3 });
  // The point-of-view character is known from inside. Of the others, only what reaches the eye and ear.
  const shown = voices.map(voice => voice.who === pov ? voice : { who: voice.who, says: voice.i_will_say, hands: voice.my_hands, when_refused: voice.when_refused });
  return '\nWHAT EACH PERSON BRINGS INTO THE ROOM, said by each alone before the scene. They want different things: let them pursue them against each other, and let nobody get everything. Their lines may be used, cut or bent, never explained. Of the point-of-view character you have everything; of the others only what can be heard and seen, because that is all the point-of-view character has: ' + JSON.stringify(shown);
}
