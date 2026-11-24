import type { AuthorArchitecture } from './types';
export function pacingForScene(plan: AuthorArchitecture, scene: string) {
  const pacing = plan.pacing.scenes.find(s => s.scene === scene);
  if (!pacing) throw new Error(`Missing dramatic rhythm for ${scene}`);
  return pacing;
}
export function proseExecutionStyle(distance: string, time: string): string {
  const camera: Record<string, string> = { distant: 'Allow narrative overview and useful compression; do not force bodily microdetail.', external: 'Stage visible behavior; do not enter unexpressed private thoughts.', close: 'Use the viewpoint vocabulary and selective interiority.', deep: 'Use immediate viewpoint language; in shock let stimulus precede reflex and interpretation.' };
  const tempo: Record<string, string> = { summary: 'Compress uneventful time; spend space only on consequential changes.', realtime: 'Let actions, speech and consequences unfold at a natural scene pace.', dilated: 'Slow only the decisive wait/impact with selected concrete detail; compress again when motion begins.' };
  return `${camera[distance] || camera.close} ${tempo[time] || tempo.realtime}`;
}
