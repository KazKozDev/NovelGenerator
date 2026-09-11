import { describe, expect, it } from 'vitest';
import { continuityIssues, scenePlan } from '../utils/novel/continuity';
import { emptyContinuityState } from '../utils/novel/storyState';
import { rebuildCanon } from '../utils/novel/storyState';
import type { ChapterRecord, ChapterVersion } from '../utils/novel/contracts';

const chapter = (): ChapterRecord => ({ number: 1, status: 'draft', repairAttempts: 0, versions: [], plan: {
  title: 'Arrival', summary: 'A choice changes the evening.', sceneBreakdown: 'one scene', characterDevelopmentFocus: 'trust', plotAdvancement: 'a clue changes hands', timelineIndicators: 'evening', emotionalToneTension: 'tense', connectionToNextChapter: 'a cost follows',
  detailedScenes: [{ sceneId: 's1', location: 'station', participants: ['Mira'], objective: 'recover the key', conflict: 'the guard refuses', outcome: 'Mira leaves with the key', duration: 'ten minutes', mood: 'tense', keyMoments: ['Mira chooses to risk being seen'] }],
} });
const version = (content: string): ChapterVersion => ({ revision: 1, content, reason: 'test', createdAt: 0 });

describe('continuity architecture', () => {
  it('upgrades a legacy scene into an explicit ScenePlan without inventing a new event', () => {
    const scene = chapter().plan.detailedScenes![0];
    const plan = scenePlan(scene, emptyContinuityState());
    expect(plan.consequenceForNextScene).toBe('Mira leaves with the key');
    expect(plan.prohibitedShortcuts[0]).toContain('unearned');
  });

  it('blocks planning fields and generation instructions in final prose', () => {
    const item = chapter();
    const issues = continuityIssues(item, version('The rain stopped. ScenePlan: return JSON with an exitHook.'), 'past');
    expect(issues.map(issue => issue.id)).toContain('prompt-leakage');
  });

  it('detects duplicate headings, unpaired dialogue and an unjustified tense shift', () => {
    const item = chapter();
    const issues = continuityIssues(item, version('Chapter 1\nChapter 1\n"I am ready, Mira said. She walks outside.'), 'past');
    expect(issues.map(issue => issue.id)).toEqual(expect.arrayContaining(['duplicate-chapter-heading', 'unpaired-dialogue-quote', 'unjustified-tense-shift']));
  });

  it('flags repeated explanation of the same emotional conclusion', () => {
    const item = chapter();
    const issues = continuityIssues(item, version('She felt afraid of the silent platform. He felt angry at the closed gate.'), 'past');
    expect(issues.map(issue => issue.id)).toContain('repeated-emotional-conclusion');
  });

  it('projects evidence-backed location, inventory, injury and consequences into StoryState', () => {
    const item = chapter();
    const draft = version('Mira left the station with the key in her cut palm.');
    draft.analysis = { summary: 'Mira leaves the station.', beats: [], promises: [], facts: [
      { id: 'where', subject: 'Mira', predicate: 'location', value: 'station exit', knownBy: ['Mira'], evidence: { chapter: 1, revision: 1, quote: 'Mira left the station' } },
      { id: 'object', subject: 'Mira', predicate: 'holds inventory', value: 'brass key', knownBy: ['Mira'], evidence: { chapter: 1, revision: 1, quote: 'Mira left the station with the key' } },
      { id: 'injury', subject: 'Mira', predicate: 'injury condition', value: 'cut palm', knownBy: ['Mira'], evidence: { chapter: 1, revision: 1, quote: 'Mira left the station' } },
    ], events: [{ id: 'leave', description: 'Mira chooses to leave.', consequences: ['The guard follows her.'], evidence: { chapter: 1, revision: 1, quote: 'Mira left the station' } }] };
    item.versions = [draft]; item.status = 'accepted'; item.acceptedRevision = 1;
    const state = rebuildCanon([item]);
    expect(state.continuity.characterLocations.Mira).toBe('station exit');
    expect(state.continuity.inventory.Mira).toBe('brass key');
    expect(state.continuity.injuriesAndCondition.Mira).toBe('cut palm');
    expect(state.continuity.expectedConsequences).toContain('The guard follows her.');
  });
});
