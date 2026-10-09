/**
 * What happens when a check that can stop the book fires and one correction
 * did not clear it.
 *
 * - `strict`: the run ends there. Right for a book someone is watching.
 * - `warn`: the scene stands, the objection is recorded as a warning, and the
 *   book goes on. Right for a long run left alone, and the default: an editor
 *   model's verdict is a judgement, a small one makes it wrongly often enough,
 *   and a finished manuscript with a list of what it got wrong can be fixed
 *   where a run that stopped at chapter three overnight cannot.
 * - `off`: the objection is recorded and nothing is rewritten for it.
 *
 * It governs the three places a verdict used to be final — a scene memory
 * refuses twice, a readiness review that could not be had, a reconciliation
 * that failed after its chapter was already written. It does not govern a
 * planner that refuses the chapter map or a scene nothing could be extracted
 * from: there is no scene to let stand in the first case and no memory to
 * write the next one from in the second.
 */
export type ContinuityMode = 'strict' | 'warn' | 'off';

export const CONTINUITY_MODES: ContinuityMode[] = ['strict', 'warn', 'off'];

export function readContinuityMode(value: unknown, fallback: ContinuityMode = 'warn'): ContinuityMode {
  return (CONTINUITY_MODES as unknown[]).includes(value) ? value as ContinuityMode : fallback;
}
