import type { ProjectStore } from './store';
import type { ScenePlan } from './types';

/**
 * Structural repetition (§8, the half that phrase lists cannot reach).
 *
 * A novel goes monotonous by shape long before it goes monotonous by word: the
 * third scene running in which the same two people talk in the same room reads
 * as stalling even when every sentence is fresh. Code can see that much without
 * reading anything — who is present, where, and from whose eyes — so it is
 * measured here and handed to the planner as recent history, not as a ban.
 *
 * Nothing about meaning is judged. Whether a repeated staging is stalling or
 * deliberate is the planner's call and the review's; code only says it repeats.
 */

export interface SceneShape {
  scene: string;
  pov: string;
  cast: string[];
  place: string;
}

/** How much history the planner sees, and the window a repeat is counted in. */
export const SHAPE_WINDOW = 6;

function normalize(text: string): string {
  return (text || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '');
}

export function sceneShape(plan: ScenePlan): SceneShape {
  return {
    scene: plan.id,
    pov: plan.pov_id || '',
    cast: [...new Set(plan.participants || [])].sort(),
    place: normalize(plan.location),
  };
}

/** Same people, same place: the staging repeats whoever the scene is seen through. */
function stagingKey(shape: SceneShape): string {
  return `${shape.cast.join('+')}@${shape.place}`;
}

export function describeShape(shape: SceneShape): string {
  const cast = shape.cast.length ? shape.cast.join(', ') : 'nobody recorded';
  const place = shape.place || 'no location recorded';
  return `${shape.scene}: ${cast} in ${place}${shape.pov ? `, seen by ${shape.pov}` : ''}`;
}

/** The shapes of the accepted scenes, oldest first, capped at the window. */
export function recentShapes(store: ProjectStore, throughChapter: number, limit = SHAPE_WINDOW): SceneShape[] {
  const records: { chapter: number; plan: ScenePlan }[] = [];
  for (let chapter = 1; chapter <= throughChapter; chapter++) {
    for (const record of store.chapterScenes(chapter)) {
      if (record.plan) records.push({ chapter, plan: record.plan });
    }
  }
  records.sort((a, b) => a.chapter - b.chapter || a.plan.id.localeCompare(b.plan.id));
  return records.slice(-limit).map(item => sceneShape(item.plan));
}

export function describeShapes(shapes: SceneShape[]): string {
  return shapes.length ? shapes.map(describeShape).join('\n') : '(no accepted scenes yet)';
}

export interface ShapeRepetition {
  /** Accepted scenes immediately before this one with the same staging. */
  run: string[];
  /** Every scene in the window with the same staging. */
  window: string[];
}

export function shapeRepetition(shape: SceneShape, recent: SceneShape[]): ShapeRepetition {
  const key = stagingKey(shape);
  const window = recent.filter(item => stagingKey(item) === key).map(item => item.scene);
  const run: string[] = [];
  for (let index = recent.length - 1; index >= 0; index--) {
    if (stagingKey(recent[index]) !== key) break;
    run.unshift(recent[index].scene);
  }
  return { run, window };
}

/**
 * Worth raising before prose: a third consecutive scene in the same staging, or
 * a staging that owns half the recent window. Two in a row is a conversation
 * continuing, not a pattern.
 */
export function repeatedStaging(shape: SceneShape, recent: SceneShape[]): string {
  const { run, window } = shapeRepetition(shape, recent);
  if (run.length >= 2) {
    return `Scene ${shape.scene} keeps the staging of the ${run.length} scenes before it (${run.join(', ')}): ${describeShape(shape)}. A third turn in the same room with the same people needs a reason on the page — a different pressure, a different participant, a different place — or the scene should be replanned.`;
  }
  if (window.length >= 3) {
    return `Scene ${shape.scene} repeats a staging already used ${window.length} times in the last ${recent.length} scenes (${window.join(', ')}): ${describeShape(shape)}. Vary who is present, where, or through whose eyes, unless the repetition is the point.`;
  }
  return '';
}
