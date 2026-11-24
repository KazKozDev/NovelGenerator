import { describe, it, expect } from 'vitest';
import { craftExamples } from './fixtures/craftExamples';
import { validateArchitecture } from '../utils/novel/craft/planning';
import { executionBase, emptyEnacted, executionPrompt } from '../utils/novel/craft/runtime';
import { setupsForScene } from '../utils/novel/craft/payoffs';
import { promiseContributions } from '../utils/novel/craft/promises';
import { causalFrontier } from '../utils/novel/craft/sceneGraph';

describe('author decisions affect genre-specific scene execution', () => {
  it('keeps the solved physical crime author-only until the clue acquisition and plants fair evidence first', () => {
    const { mystery } = craftExamples(); validateArchitecture(mystery);
    expect(mystery.world.events[0].means).toContain('prevents escape');
    const first = executionPrompt(executionBase(mystery, mystery.graph.scenes[0], emptyEnacted()), []);
    expect(first).toContain('brass shavings');
    expect(first).not.toContain('Cole wedges the emergency release');
    const second = executionBase(mystery, mystery.graph.scenes[1], emptyEnacted());
    expect(second.acquireNow[0].text).toContain('brass shim disabled');
    expect(setupsForScene(mystery, 'SC3')[0].changedMeaningNow).toContain('intentional trap');
  });
  it('builds thriller escalation through lost exits rather than louder descriptions', () => {
    const { thriller } = craftExamples(); validateArchitecture(thriller);
    expect(thriller.graph.scenes[0].optionsAfter).not.toEqual(thriller.graph.scenes[1].optionsAfter);
    const frontier = causalFrontier(thriller, thriller.graph.scenes[2], { version: 1, scenes: [{ id: 'SC2', textRevision: 'actual', events: [], acquisitions: [], resources: [{ resource: 'R1', available: false, quote: 'The key broke.' }], relationships: [], options: ['Testify publicly; retreat is blocked.'], summary: 'She lost silent access.', deferred: [], deviations: [] }] });
    expect(frontier.resources[0].available).toBe(false);
    expect(frontier.availableOptions).toContain('Testify publicly; retreat is blocked.');
  });
  it('writes a testing arc from a working code without imposing a healing confession', () => {
    const { testing } = craftExamples(); validateArchitecture(testing);
    const task = executionBase(testing, testing.graph.scenes[2], emptyEnacted());
    expect(task.characterEngine.beliefOrCode).toContain('must remain true');
    expect(testing.concept.ending.internalOutcome).toContain('code survives');
    expect(task).not.toHaveProperty('mandatoryTrauma');
  });
  it('makes romance intimacy and its barrier govern concrete choices and the final promise payoff', () => {
    const { romance } = craftExamples(); validateArchitecture(romance);
    const middle = executionBase(romance, romance.graph.scenes[1], emptyEnacted());
    expect(middle.current.conflict.internal).toContain('fear of dependence');
    expect(middle.current.action).toContain('overdue lease');
    const ending = promiseContributions(romance, 'SC3')[0].payoffNow!;
    expect(ending.action).toContain('sign together');
    expect(ending.consequence).toContain('hopeful future');
  });
});
