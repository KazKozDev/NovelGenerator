import type { NovelRun, ChapterVersion } from '../../utils/novel/contracts';
import { literaryContextKey, literaryKinds } from '../../utils/novel/literaryState';

export function literaryResponse(prompt: string, system: string): string | undefined {
  if (system.includes('plan literary development')) {
    const plan = JSON.parse(prompt.split('APPROVED CHAPTER PLAN:\n')[1].split('\nCHARACTER DESIGN:')[0]);
    return JSON.stringify({ endingDevelopment: 'A consequential choice changes the available next action.', avoidReplaying: [], scenes: (plan.detailedScenes || []).map((scene: any) => ({ sceneId: scene.sceneId, development: 'The character acts on the evidence.', characterChoice: 'The clerk chooses to grant access.', dramaticCost: 'The letter costs money.', narrativeWeight: 1 })) });
  }
  if (system.includes('assess literary development')) {
    const ids = [...prompt.matchAll(/"id":"(p\d+)"/g)].map(match => match[1]);
    return JSON.stringify({ checked: literaryKinds, observations: [{ kind: 'ending', subject: 'chapter ending', before: 'The outcome is pending.', after: 'The choice is made.', mechanism: 'A concrete action changes access.', sources: [ids.at(-1)] }], issues: [] });
  }
}
export function stampLiterary(run: NovelRun, chapter: number, version: ChapterVersion) {
  version.literary = { version: 1, checkedRevision: version.revision, contextKey: literaryContextKey(run, chapter), status: 'passed', observations: [{ kind: 'ending', subject: 'chapter ending', before: 'The outcome is pending.', after: 'The choice is made.', mechanism: 'A concrete action changes access.', evidence: [{ chapter, revision: version.revision, quote: version.content.slice(-100) }] }], issues: [] };
}
