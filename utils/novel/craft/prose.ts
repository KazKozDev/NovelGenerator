import type { SceneExecution } from './types';
import { operationRules } from './craftRules';
import { proseExecutionStyle } from './pacing';
export const DRAFT_WRITER_SYSTEM =
  'You write a fiction discovery draft. Follow the present-scene execution contract, chosen narrative distance and individual voices. ' +
  'NARRATIVE STANDARD: Write strictly in Third Person Limited (he/she/they, strictly inside the viewpoint character\'s sensory perception and immediate consciousness) ' +
  'and Past Tense («The lock gave under his thumb. Bruce stepped inside and pulled the door shut behind him.»). ' +
  'Enact concrete choices and consequences. A fact labelled claim or belief is attributed perspective, never established objective truth; ' +
  'do not grant the viewpoint knowledge that a claim is false before the text demonstrates it. ' +
  'Do not polish, moralize, insert headings or expose future author knowledge.';

export function renderExecution(execution: SceneExecution, recent: string[]): string {
  const povPerson = execution.narrativePerson || 'third-limited';
  return `${operationRules('execution')}\nPERMITTED SCENE DATA (no global premise or future outline):\n${JSON.stringify(execution)}\nRECENT COMMITTED PROSE:\n${recent.slice(-2).join('\n\n') || '(Opening scene.)'}\nWrite one continuous complete scene of about ${execution.pacing.targetWords} words. Fiction prose only, no headings or editorial commentary.\nNARRATIVE STANDARD:\n- Narration POV: ${povPerson} (he/she/they, anchored strictly inside the viewpoint character's senses and immediate thoughts).\n- Grammatical Tense: Past Tense (Прошедшее время: "The lock gave under his thumb. Bruce stepped inside and pulled the door shut behind him."). All narrative action, sensory beats, and stage business must be written in past tense (walked, looked, spoke, gave), NEVER present tense.\n${proseExecutionStyle(execution.pacing.distance, execution.pacing.timeScale)} Syntax: ${execution.pacing.syntax}. Sensory detail function: ${execution.pacing.detailFunction}. Show new knowledge through its assigned acquisition action. Do not state hidden motives as viewpoint knowledge.`;
}
