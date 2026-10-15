import type { AuthorArchitecture, SceneNode, SceneExecution } from './types';
export function currentCharacterEngine(plan: AuthorArchitecture, node: SceneNode): SceneExecution['characterEngine'] {
  const person = plan.characters.characters.find(c => c.id === node.pov);
  if (!person) throw new Error(`Unknown viewpoint ${node.pov}`);
  return { want: person.want, beliefOrCode: person.beliefOrCode, tactics: person.tactics };
}
export function presentProfiles(plan: AuthorArchitecture, node: SceneNode): SceneExecution['profiles'] {
  return plan.characters.characters.filter(c => node.participants.includes(c.id) || c.id === node.pov).map(c => ({ id: c.id, name: c.name, voice: c.voice, ...(c.id === node.pov ? { perception: c.perception } : {}) }));
}
