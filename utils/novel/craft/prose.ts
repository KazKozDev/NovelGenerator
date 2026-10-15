import type { SceneExecution } from './types';
import { operationRules } from './craftRules';
import { proseExecutionStyle } from './pacing';
export const DRAFT_WRITER_SYSTEM = 'You write a fiction discovery draft. Follow the present-scene execution contract, chosen narrative distance and individual voices. Enact concrete choices and consequences. A fact labelled claim or belief is attributed perspective, never established objective truth; do not grant the viewpoint knowledge that a claim is false before the text demonstrates it. Do not polish, moralize, insert headings or expose future author knowledge.';
export function renderExecution(execution: SceneExecution, recent: string[]): string {
  return `${operationRules('execution')}\nPERMITTED SCENE DATA (no global premise or future outline):\n${JSON.stringify(execution)}\nRECENT COMMITTED PROSE:\n${recent.slice(-2).join('\n\n') || '(Opening scene.)'}\nWrite one continuous complete scene of about ${execution.pacing.targetWords} words. Fiction prose only, no headings or editorial commentary. Narration: ${execution.narrativePerson}. ${proseExecutionStyle(execution.pacing.distance, execution.pacing.timeScale)} Syntax: ${execution.pacing.syntax}. Sensory detail function: ${execution.pacing.detailFunction}. Show new knowledge through its assigned acquisition action. Do not state hidden motives as viewpoint knowledge.`;
}
